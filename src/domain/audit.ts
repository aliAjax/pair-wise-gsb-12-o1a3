// 审查计算（纯函数）：排放/尾号限行、年检失效、准驾车型不符、车辆占用
import type {
  ConsoleState,
  DispatchDraft,
  EmissionLevel,
  LicenseType,
  RestrictionRule,
  RuleHit,
  Task
} from "./types";
import { EMISSION_ORDER, LICENSE_ORDER } from "./seed";

export interface AuditInput {
  plate: string;
  driver: string;
  zone: string;
  startAt: string;
  endAt: string;
  requiredClass: LicenseType | "";
  /** 忽略占用的任务（用于替换车候选校验时排除任务自身） */
  ignoreTaskId?: string;
}

export function emissionRank(level: EmissionLevel): number {
  return EMISSION_ORDER.indexOf(level);
}

export function licenseRank(level: LicenseType): number {
  return LICENSE_ORDER.indexOf(level);
}

export function tailOf(plate: string): string {
  // 车牌末位可能是数字或字母（如沪A-82L6 → 6）
  const chars = plate.replace(/[\s-]/g, "");
  return chars.charAt(chars.length - 1).toUpperCase();
}

/** 规则限行时段（一天内 HH:mm 分钟值） */
function ruleWindow(rule: RestrictionRule): [number, number] {
  const toMin = (s?: string) => {
    if (!s) return null;
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMin(rule.start) ?? 0;
  const end = toMin(rule.end) ?? 24 * 60;
  return [start, end];
}

/**
 * 判断任务时段是否与规则限行时段重叠（按任务实际覆盖到的每一天分别判断星期与钟点）。
 */
export function overlapsRule(rule: RestrictionRule, startAt: string, endAt: string): boolean {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  const [rStart, rEnd] = ruleWindow(rule);
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const dayEnd = new Date(end);
  dayEnd.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= dayEnd.getTime()) {
    // getDay: 0=周日 → 7；1..6 周一至周六
    const weekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
    const weekdayOk = !rule.weekdays || rule.weekdays.length === 0 || rule.weekdays.includes(weekday);
    if (weekdayOk) {
      const dayStart = cursor.getTime();
      const winStart = dayStart + rStart * 60000;
      const winEnd = dayStart + rEnd * 60000;
      if (start.getTime() < winEnd && end.getTime() > winStart) return true;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

function ruleAppliesZone(rule: RestrictionRule, zone: string): boolean {
  if (rule.scope === "city") return true;
  return !!rule.zones && rule.zones.includes(zone);
}

/**
 * 一辆车在某个任务上的占用区间（接管语义的核心）：
 * - 已确认接管：原车占用到接管时刻（接管后才释放），替换车从接管时刻占用至任务结束
 * - 已预占未确认：替换车也被预留到任务结束，原车保持占用到任务结束（接管前不得释放）
 * - 未完成路段的 byPlate 仅作展示，占用以接管时间点为准
 */
export function occupiedIntervals(
  task: Task
): Array<{ plate: string; from: number; to: number }> {
  const taskStart = new Date(task.startAt).getTime();
  const taskEnd = new Date(task.endAt).getTime();
  const intervals: Array<{ plate: string; from: number; to: number }> = [];

  const takeovers = [...task.takeovers].sort((a, b) => a.at.localeCompare(b.at));
  // 注意：确认接管后 task.plate 已更新为替换车，原车须从首条接管记录的 fromPlate 推导
  let currentPlate = takeovers.length ? takeovers[0].fromPlate : task.plate;
  let from = taskStart;
  for (const take of takeovers) {
    intervals.push({ plate: currentPlate, from, to: new Date(take.at).getTime() });
    currentPlate = take.toPlate;
    from = new Date(take.at).getTime();
  }
  intervals.push({ plate: currentPlate, from, to: taskEnd });

  if (task.pendingTakeover) {
    // 预占期间候选车被预留到任务结束；当前承运车（最后一个区间）仍占用至任务结束（确认前不得释放）
    intervals.push({
      plate: task.pendingTakeover.candidatePlate,
      from: new Date(task.pendingTakeover.at).getTime(),
      to: taskEnd
    });
  }
  return intervals;
}

/** 检查车辆在任务时段内是否被其它未拒单任务占用（含预占接管） */
export function isVehicleBusy(
  state: Pick<ConsoleState, "tasks">,
  plate: string,
  startAt: string,
  endAt: string,
  ignoreTaskId?: string
): Task | undefined {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  return state.tasks.find((task) => {
    if (task.id === ignoreTaskId || task.status === "已拒单") return false;
    return occupiedIntervals(task).some((interval) => {
      if (interval.plate !== plate) return false;
      // 已完成任务只占用到其结束时间
      const to = task.status === "已完成" ? Math.min(interval.to, new Date(task.endAt).getTime()) : interval.to;
      return start < to && end > interval.from;
    });
  });
}

export interface AuditResult {
  ok: boolean;
  hits: RuleHit[];
}

/** 整单审查：任一规则命中即整单拒绝 */
export function audit(state: ConsoleState, input: AuditInput): AuditResult {
  const hits: RuleHit[] = [];
  const { plate, driver, zone, startAt, endAt, requiredClass } = input;

  if (!startAt || !endAt || new Date(startAt) >= new Date(endAt)) {
    hits.push({
      rule: "TIME_INVALID",
      field: "任务时段",
      original: `${startAt || "（空）"} ~ ${endAt || "（空）"}`,
      ruleName: "时段合法性校验",
      detail: "开始时间必须早于结束时间"
    });
  }

  const vehicle = state.vehicles.find((v) => v.plate === plate);
  if (!vehicle) {
    hits.push({
      rule: "VEHICLE_NOT_FOUND",
      field: "车牌",
      original: plate || "（空）",
      ruleName: "车辆资料校验",
      detail: "车辆资料中不存在该车牌，请先在车辆资料中登记"
    });
  }

  const driverInfo = state.drivers.find((d) => d.name === driver);
  if (!driverInfo) {
    hits.push({
      rule: "DRIVER_NOT_FOUND",
      field: "司机",
      original: driver || "（空）",
      ruleName: "司机资料校验",
      detail: "司机资料中不存在该司机"
    });
  }

  if (vehicle && startAt && endAt && new Date(startAt) < new Date(endAt)) {
    // 规则一：排放等级或车牌尾号命中当日限行
    for (const rule of state.rules) {
      if (!rule.enabled) continue;
      if (!ruleAppliesZone(rule, zone)) continue;
      if (!overlapsRule(rule, startAt, endAt)) continue;

      if (rule.type === "emission" && rule.maxEmission) {
        if (emissionRank(vehicle.emission) <= emissionRank(rule.maxEmission)) {
          hits.push({
            rule: "EMISSION",
            field: "排放等级 / 工作区域",
            original: `${vehicle.plate} ${vehicle.emission}，区域 ${zone}，时段 ${fmtTime(startAt)}~${fmtTime(endAt)}`,
            ruleName: rule.name,
            detail: `排放等级 ${vehicle.emission} 不高于限行阈值 ${rule.maxEmission}（限行时段 ${rule.start ?? "00:00"}-${rule.end ?? "24:00"}）`
          });
        }
      }
      if (rule.type === "tail" && rule.tails) {
        const tail = tailOf(plate);
        if (rule.tails.map((t) => t.toUpperCase()).includes(tail)) {
          hits.push({
            rule: "TAIL_NUMBER",
            field: "车牌尾号 / 工作区域",
            original: `${vehicle.plate}（尾号 ${tail}），区域 ${zone}，时段 ${fmtTime(startAt)}~${fmtTime(endAt)}`,
            ruleName: rule.name,
            detail: `尾号 ${tail} 在限行尾号 ${rule.tails.join("/")} 内（限行时段 ${rule.start ?? "00:00"}-${rule.end ?? "24:00"}）`
          });
        }
      }
    }

    // 规则二：任务结束时年检失效
    const endDate = endAt.slice(0, 10);
    if (endDate > vehicle.inspectUntil) {
      hits.push({
        rule: "INSPECTION_EXPIRED",
        field: "年检有效期",
        original: `${vehicle.plate} 年检至 ${vehicle.inspectUntil}，任务结束 ${endDate}`,
        ruleName: "任务结束时年检须仍有效",
        detail: `任务结束日 ${endDate} 已超过年检有效期 ${vehicle.inspectUntil}`
      });
    }

    // 占用校验
    const busy = isVehicleBusy(state, plate, startAt, endAt, input.ignoreTaskId);
    if (busy) {
      hits.push({
        rule: "VEHICLE_BUSY",
        field: "车牌",
        original: `${vehicle.plate}，本单时段 ${fmtTime(startAt)}~${fmtTime(endAt)}`,
        ruleName: "车辆占用校验",
        detail: `与任务 #${busy.seq}（${busy.plate} / ${busy.zone}，${fmtTime(busy.startAt)}~${fmtTime(busy.endAt)}）时段重叠`
      });
    }
  }

  // 规则三：司机准驾车型不符（司机准驾须达到车辆核载与任务要求的较高者）
  if (vehicle && driverInfo && requiredClass) {
    const need = Math.max(licenseRank(vehicle.ratedClass), licenseRank(requiredClass));
    if (licenseRank(driverInfo.license) < need) {
      hits.push({
        rule: "LICENSE_MISMATCH",
        field: "准驾车型",
        original: `${driverInfo.name} 持 ${driverInfo.license}，车辆核载 ${vehicle.ratedClass}，任务要求 ${requiredClass}`,
        ruleName: "准驾车型不符整单拒绝",
        detail: `需 ${LICENSE_ORDER[need]} 及以上，当前 ${driverInfo.license}`
      });
    }
  }

  return { ok: hits.length === 0, hits };
}

export function fmtTime(iso: string): string {
  if (!iso) return "（空）";
  return iso.replace("T", " ").slice(0, 16);
}

export function blankDraft(): DispatchDraft {
  return { plate: "", driver: "", zone: "", startAt: "", endAt: "", requiredClass: "", route: "", note: "" };
}

/** 路段文本解析：每行一个路段名 */
export function parseSegments(route: string): string[] {
  return route
    .split(/[\n;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
