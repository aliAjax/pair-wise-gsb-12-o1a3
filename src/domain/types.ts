/** 任务状态：完成后即冻结，只能另建修订版本 */
export type TaskStatus = "待执行" | "执行中" | "已完成";

export const STATUS_FLOW: readonly TaskStatus[] = ["待执行", "执行中", "已完成"];

/** 车辆台账资料 */
export interface Vehicle {
  plate: string; // 车牌号
  type: string; // 车型（需与任务准驾车型一致的能力由司机准驾决定）
  emission: string; // 排放等级：国三 / 国四 / 国五 / 国六 / 纯电动
  inspectionUntil: string; // 年检有效期至 YYYY-MM-DD
}

/** 司机资料 */
export interface Driver {
  name: string;
  license: string; // 准驾等级：C1 / B2 / A2
}

/** 尾号限行：按周几禁行指定尾号 */
export interface TailRule {
  id: string;
  kind: "tail";
  region: string;
  label: string;
  /** 键为周几（1=周一 … 7=周日），值为当日禁行尾号 */
  schedule: Partial<Record<number, string[]>>;
}

/** 排放限行：指定星期禁行指定排放等级 */
export interface EmissionRule {
  id: string;
  kind: "emission";
  region: string;
  label: string;
  weekdays: number[]; // 1=周一 … 7=周日
  levels: string[]; // 禁行的排放等级
}

export type RestrictionRule = TailRule | EmissionRule;

/** 任务路段 */
export interface RouteSegment {
  id: string;
  name: string;
  done: boolean;
}

/** 派单任务（含修订链字段） */
export interface DispatchTask {
  id: string;
  rootId: string; // 修订链根任务 id，同一链上一致
  version: number; // 链内版本号，从 1 开始
  revisionReason?: string; // 本版本修订原因（首版无）
  plate: string;
  driver: string;
  region: string; // 工作区域
  start: string; // 任务时段起（datetime-local）
  end: string; // 任务时段止
  requiredType: string; // 任务要求的准驾车型
  segments: RouteSegment[];
  status: TaskStatus;
  notes: string;
  createdAt: string;
}

/** 替换车接管记录：确认接管前原车不得释放 */
export interface Takeover {
  id: string;
  taskId: string;
  fromPlate: string;
  fromDriver: string;
  toPlate: string;
  toDriver: string;
  status: "待接管" | "已接管" | "已取消";
  inheritedSegments: string[]; // 接管时继承的未完成路段
  createdAt: string;
  confirmedAt?: string;
}

/** 一条命中规则（违例） */
export interface Violation {
  ruleId: string;
  ruleName: string; // 命中规则名称
  field: string; // 涉及字段
  originalValue: string; // 原值
  detail: string; // 说明
}

/** 审查报告：派单 / 替换车 / 修订共用一个审查口径，拒绝时整单保留 */
export interface ReviewReport {
  id: string;
  kind: "派单" | "替换车" | "修订";
  plate: string;
  driver: string;
  region: string;
  start: string;
  end: string;
  requiredType: string;
  passed: boolean;
  violations: Violation[];
  createdAt: string;
}

/** 提交给审查计算的输入 */
export interface ReviewInput {
  plate: string;
  driver: string;
  region: string;
  start: string;
  end: string;
  requiredType: string;
}
