// 领域模型：车辆资料、司机、限行规则、派单、接管、修订链

export type EmissionLevel = "国三" | "国四" | "国五" | "国六";
export type LicenseType = "C1" | "B1" | "B2" | "A2";

/** 车辆资料 */
export interface Vehicle {
  plate: string;
  emission: EmissionLevel;
  /** 年检有效期截止日（ISO 日期 yyyy-mm-dd，当日仍有效） */
  inspectUntil: string;
  /** 核载等级（准驾车型下限） */
  ratedClass: LicenseType;
  note?: string;
}

/** 司机资料 */
export interface Driver {
  name: string;
  license: LicenseType;
  phone?: string;
}

export type RuleType = "emission" | "tail";
export type RuleScope = "zone" | "city";

/** 区域限行规则：排放等级或车牌尾号命中 */
export interface RestrictionRule {
  id: string;
  name: string;
  type: RuleType;
  /** zone：仅对工作区域生效；city：全城生效 */
  scope: RuleScope;
  /** scope=zone 时命中的区域列表 */
  zones?: string[];
  /** emission 规则：排放等级低于等于该值即限行 */
  maxEmission?: EmissionLevel;
  /** tail 规则：命中尾号（数字或字母，统一大写比较） */
  tails?: string[];
  /** 限行时段起点 HH:mm，默认 00:00 */
  start?: string;
  /** 限行时段终点 HH:mm，默认 24:00 */
  end?: string;
  /** 星期掩码，1=周一 … 7=周日；缺省为每天 */
  weekdays?: number[];
  enabled: boolean;
}

export type TaskStatus = "执行中" | "已完成" | "已拒单";
export type SegmentState = "未完成" | "已完成";

/** 任务路段（继承点：接管时未完成路段转到替换车） */
export interface RouteSegment {
  id: string;
  name: string;
  state: SegmentState;
  /** 实际承担该段的车牌（接管后未完成段由替换车承担） */
  byPlate?: string;
}

/** 命中规则明细：整单拒绝时列出原值与命中规则 */
export interface RuleHit {
  rule:
    | "EMISSION"
    | "TAIL_NUMBER"
    | "INSPECTION_EXPIRED"
    | "LICENSE_MISMATCH"
    | "VEHICLE_BUSY"
    | "VEHICLE_NOT_FOUND"
    | "DRIVER_NOT_FOUND"
    | "TIME_INVALID";
  field: string;
  /** 提交时的原值 */
  original: string;
  /** 命中的规则描述 */
  ruleName: string;
  detail: string;
}

/** 接管记录：替换车接管前原车不得释放 */
export interface TakeoverRecord {
  id: string;
  taskId: string;
  at: string;
  reason: string;
  fromPlate: string;
  toPlate: string;
  driverChanged: boolean;
  fromDriver?: string;
  toDriver?: string;
  inheritedSegments: string[];
}

export interface Task {
  id: string;
  seq: number;
  plate: string;
  driver: string;
  zone: string;
  /** 任务时段 */
  startAt: string; // ISO datetime-local 存储
  endAt: string;
  /** 准驾车型要求 */
  requiredClass: LicenseType;
  segments: RouteSegment[];
  status: TaskStatus;
  note: string;
  createdAt: string;
  /** 修订链 */
  rootId: string;
  version: number;
  reason?: string;
  /** 被哪个新版本替代（仅接受的调整版本会回填） */
  supersededBy?: string;
  /** 修订来源任务（含被拒绝的调整，保证修订链完整） */
  revisionOf?: string;
  /** 接管链 */
  takeovers: TakeoverRecord[];
  /** 接管预占：替换车选定后、确认接管前原车锁定不释放 */
  pendingTakeover?: {
    candidatePlate: string;
    candidateDriver: string;
    reason: string;
    at: string;
  };
  /** 拒单时命中的规则 */
  hits?: RuleHit[];
  /** 拒单时保留的输入快照（整单拒绝，保留输入） */
  rejectedInput?: DispatchDraft;
}

/** 派单登记表单（可被拒单保留/回填） */
export interface DispatchDraft {
  plate: string;
  driver: string;
  zone: string;
  startAt: string;
  endAt: string;
  requiredClass: LicenseType | "";
  route: string;
  note: string;
}

/** 控制台整体持久化状态：刷新后任务、限行、接管和修订链一致 */
export interface ConsoleState {
  version: number;
  vehicles: Vehicle[];
  drivers: Driver[];
  rules: RestrictionRule[];
  tasks: Task[];
  seq: number;
}
