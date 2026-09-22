import { defineStore } from "pinia";
import type {
  ConsoleState,
  DispatchDraft,
  Driver,
  RestrictionRule,
  RouteSegment,
  RuleHit,
  Task,
  TakeoverRecord,
  Vehicle
} from "../domain/types";
import { STORAGE_KEY, seedState, LICENSE_ORDER } from "../domain/seed";
import { audit, type AuditResult } from "../domain/audit";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function load(): ConsoleState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ConsoleState;
      if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.vehicles)) return parsed;
    } catch {
      // 损坏数据回落到示例
    }
  }
  return seedState();
}

/** 当前承运车：最后一次接管的替换车，否则为原车 */
export function currentCarrierPlate(task: Task): string {
  const sorted = [...task.takeovers].sort((a, b) => a.at.localeCompare(b.at));
  const last = sorted.length ? sorted[sorted.length - 1] : undefined;
  return last ? last.toPlate : task.plate;
}

/** 当前司机：最后一次接管后的司机 */
export function currentDriver(task: Task): string {
  const sorted = [...task.takeovers].sort((a, b) => a.at.localeCompare(b.at));
  const last = sorted.length ? sorted[sorted.length - 1] : undefined;
  return last && last.toDriver ? last.toDriver : task.driver;
}

export interface RevisionChanges {
  plate: string;
  driver: string;
  zone: string;
  startAt: string;
  endAt: string;
  requiredClass: Task["requiredClass"];
  note: string;
}

export interface TakeoverRequest {
  candidatePlate: string;
  candidateDriver: string;
  reason: string;
}

export const useDispatchStore = defineStore("dispatch", {
  state: (): ConsoleState => load(),

  getters: {
    activeTasks(state): Task[] {
      return state.tasks.filter((t) => t.status !== "已拒单" && !t.supersededBy);
    },
    rejectedTasks(state): Task[] {
      return state.tasks.filter((t) => t.status === "已拒单");
    },
    vehicleByPlate(state): (plate: string) => Vehicle | undefined {
      return (plate: string) => state.vehicles.find((v) => v.plate === plate);
    },
    driverByName(state): (name: string) => Driver | undefined {
      return (name: string) => state.drivers.find((d) => d.name === name);
    },
    /** 修订链：按 rootId 聚合，版本升序 */
    revisionChains(state): Record<string, Task[]> {
      const chains: Record<string, Task[]> = {};
      for (const task of state.tasks) {
        (chains[task.rootId] ??= []).push(task);
      }
      for (const list of Object.values(chains)) {
        list.sort((a, b) => a.version - b.version || a.createdAt.localeCompare(b.createdAt));
      }
      return chains;
    }
  },

  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state));
    },

    resetDemo() {
      this.$patch(seedState());
      this.persist();
    },

    // ---------- 派单登记 ----------
    /** 登记派单：命中任一规则整单拒绝，但保留输入并列出原值与命中规则 */
    dispatch(draft: DispatchDraft): AuditResult & { task?: Task } {
      const result = audit(this, {
        plate: draft.plate,
        driver: draft.driver,
        zone: draft.zone,
        startAt: draft.startAt,
        endAt: draft.endAt,
        requiredClass: draft.requiredClass
      });
      const seq = ++this.seq;
      const now = new Date().toISOString();

      if (!result.ok) {
        const rejected: Task = {
          id: uid(),
          seq,
          plate: draft.plate || "（未填车牌）",
          driver: draft.driver || "（未填司机）",
          zone: draft.zone,
          startAt: draft.startAt,
          endAt: draft.endAt,
          requiredClass: (draft.requiredClass || "C1") as Task["requiredClass"],
          segments: [],
          status: "已拒单",
          note: draft.note,
          createdAt: now,
          rootId: "",
          version: 1,
          hits: result.hits,
          rejectedInput: { ...draft },
          takeovers: []
        };
        rejected.rootId = rejected.id;
        this.tasks.unshift(rejected);
        this.persist();
        return result;
      }

      const segmentNames = draft.route
        .split(/[\n;；]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const segments: RouteSegment[] = (segmentNames.length ? segmentNames : ["默认配送路段"]).map(
        (name) => ({ id: uid(), name, state: "未完成", byPlate: draft.plate })
      );

      const task: Task = {
        id: uid(),
        seq,
        plate: draft.plate,
        driver: draft.driver,
        zone: draft.zone,
        startAt: draft.startAt,
        endAt: draft.endAt,
        requiredClass: draft.requiredClass as Task["requiredClass"],
        segments,
        status: "执行中",
        note: draft.note,
        createdAt: now,
        rootId: "",
        version: 1,
        takeovers: []
      };
      task.rootId = task.id;
      this.tasks.unshift(task);
      this.persist();
      return { ...result, task };
    },

    /** 仅拒单记录可删除（执行中/已完成/已修订均冻结） */
    removeRejected(id: string) {
      this.tasks = this.tasks.filter((t) => t.id !== id || t.status !== "已拒单");
      this.persist();
    },

    // ---------- 路段与完成 ----------
    toggleSegment(taskId: string, segmentId: string) {
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task || task.status !== "执行中" || task.supersededBy || task.pendingTakeover) return;
      const seg = task.segments.find((s) => s.id === segmentId);
      if (!seg) return;
      seg.state = seg.state === "已完成" ? "未完成" : "已完成";
      seg.byPlate = currentCarrierPlate(task);
      this.persist();
    },

    canComplete(task: Task): boolean {
      return (
        task.status === "执行中" &&
        !task.supersededBy &&
        !task.pendingTakeover &&
        task.segments.length > 0 &&
        task.segments.every((s) => s.state === "已完成")
      );
    },

    completeTask(taskId: string) {
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task || !this.canComplete(task)) return;
      task.status = "已完成";
      this.persist();
    },

    // ---------- 替换车接管 ----------
    /** 第一步：选定替换车并预占。校验不通过返回命中规则；接管前原车保持占用不释放 */
    startTakeover(taskId: string, req: TakeoverRequest): RuleHit[] {
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task || task.status !== "执行中" || task.supersededBy || task.pendingTakeover) return [];
      if (!req.reason.trim()) {
        return [
          {
            rule: "VEHICLE_BUSY",
            field: "接管原因",
            original: "（空）",
            ruleName: "接管登记",
            detail: "替换车接管必须填写原因"
          }
        ];
      }

      const now = new Date();
      const isoNow = toLocalInput(now);
      const windowStart = task.startAt && task.startAt < isoNow ? isoNow : task.startAt;
      const result = audit(this, {
        plate: req.candidatePlate,
        driver: req.candidateDriver,
        zone: task.zone,
        startAt: windowStart,
        endAt: task.endAt,
        requiredClass: task.requiredClass,
        ignoreTaskId: task.id
      });
      if (!result.ok) return result.hits;

      if (req.candidatePlate === currentCarrierPlate(task)) {
        return [
          {
            rule: "VEHICLE_BUSY",
            field: "替换车",
            original: req.candidatePlate,
            ruleName: "接管登记",
            detail: "替换车不能与当前承运车相同"
          }
        ];
      }

      task.pendingTakeover = {
        candidatePlate: req.candidatePlate,
        candidateDriver: req.candidateDriver,
        reason: req.reason.trim(),
        at: new Date().toISOString()
      };
      this.persist();
      return [];
    },

    /** 撤销预占：候选车解除预留 */
    cancelTakeover(taskId: string) {
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task || !task.pendingTakeover) return;
      task.pendingTakeover = undefined;
      this.persist();
    },

    /** 第二步：确认接管。替换车继承全部未完成路段 */
    confirmTakeover(taskId: string) {
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task || !task.pendingTakeover) return;
      const pending = task.pendingTakeover;
      const fromPlate = currentCarrierPlate(task);
      const fromDriver = currentDriver(task);

      const inherited: string[] = [];
      for (const seg of task.segments) {
        if (seg.state !== "已完成") {
          seg.byPlate = pending.candidatePlate;
          inherited.push(seg.name);
        }
      }

      const record: TakeoverRecord = {
        id: uid(),
        taskId: task.id,
        at: pending.at,
        reason: pending.reason,
        fromPlate,
        toPlate: pending.candidatePlate,
        driverChanged: pending.candidateDriver !== fromDriver,
        fromDriver,
        toDriver: pending.candidateDriver,
        inheritedSegments: inherited
      };
      task.takeovers.push(record);
      // 任务主车牌/司机更新为替换车（原车此刻才释放）
      task.plate = pending.candidatePlate;
      task.driver = pending.candidateDriver;
      task.pendingTakeover = undefined;
      this.persist();
    },

    // ---------- 已完成冻结 / 调整另建带原因版本 ----------
    reviseTask(taskId: string, changes: RevisionChanges, reason: string): RuleHit[] {
      const old = this.tasks.find((t) => t.id === taskId);
      if (!old || old.supersededBy || old.pendingTakeover) {
        return [
          {
            rule: "TIME_INVALID",
            field: "修订",
            original: taskId,
            ruleName: "修订校验",
            detail: "任务不可调整"
          }
        ];
      }
      if (!reason.trim()) {
        return [
          {
            rule: "TIME_INVALID",
            field: "调整原因",
            original: "（空）",
            ruleName: "修订校验",
            detail: "调整必须填写原因，将随版本留存"
          }
        ];
      }

      const result = audit(this, {
        plate: changes.plate,
        driver: changes.driver,
        zone: changes.zone,
        startAt: changes.startAt,
        endAt: changes.endAt,
        requiredClass: changes.requiredClass,
        ignoreTaskId: old.id
      });

      const nextVersion =
        this.tasks.filter((t) => t.rootId === old.rootId).reduce((m, t) => Math.max(m, t.version), 0) + 1;
      const base: Task = {
        id: uid(),
        seq: ++this.seq,
        plate: changes.plate,
        driver: changes.driver,
        zone: changes.zone,
        startAt: changes.startAt,
        endAt: changes.endAt,
        requiredClass: changes.requiredClass,
        segments: old.segments.map((s) => ({
          ...s,
          // 未完成路段改挂新车；已完成路段冻结，保留原车
          byPlate: s.state === "已完成" ? s.byPlate : changes.plate
        })),
        note: changes.note,
        createdAt: new Date().toISOString(),
        rootId: old.rootId,
        version: nextVersion,
        reason: reason.trim(),
        revisionOf: old.id,
        takeovers: [],
        status: "执行中"
      };

      if (!result.ok) {
        // 调整审查不通过：形成被拒绝的调整版本，原任务不动
        const rejected: Task = {
          ...base,
          status: "已拒单",
          hits: result.hits,
          rejectedInput: {
            plate: changes.plate,
            driver: changes.driver,
            zone: changes.zone,
            startAt: changes.startAt,
            endAt: changes.endAt,
            requiredClass: changes.requiredClass,
            route: "",
            note: changes.note
          }
        };
        this.tasks.unshift(rejected);
        this.persist();
        return result.hits;
      }

      old.supersededBy = base.id;
      base.status = "执行中";
      this.tasks.unshift(base);
      this.persist();
      return [];
    },

    // ---------- 车辆 / 司机资料 ----------
    upsertVehicle(vehicle: Vehicle) {
      const idx = this.vehicles.findIndex((v) => v.plate === vehicle.plate);
      if (idx >= 0) this.vehicles.splice(idx, 1, vehicle);
      else this.vehicles.push(vehicle);
      this.persist();
    },
    removeVehicle(plate: string) {
      this.vehicles = this.vehicles.filter((v) => v.plate !== plate);
      this.persist();
    },
    upsertDriver(driver: Driver) {
      const idx = this.drivers.findIndex((d) => d.name === driver.name);
      if (idx >= 0) this.drivers.splice(idx, 1, driver);
      else this.drivers.push(driver);
      this.persist();
    },
    removeDriver(name: string) {
      this.drivers = this.drivers.filter((d) => d.name !== name);
      this.persist();
    },

    // ---------- 限行规则 ----------
    upsertRule(rule: RestrictionRule) {
      const idx = this.rules.findIndex((r) => r.id === rule.id);
      if (idx >= 0) this.rules.splice(idx, 1, rule);
      else this.rules.push({ ...rule, id: rule.id || uid() });
      this.persist();
    },
    toggleRule(id: string) {
      const rule = this.rules.find((r) => r.id === id);
      if (rule) rule.enabled = !rule.enabled;
      this.persist();
    },
    removeRule(id: string) {
      this.rules = this.rules.filter((r) => r.id !== id);
      this.persist();
    }
  }
});

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export { LICENSE_ORDER };
