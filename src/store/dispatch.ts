import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { toLocalInput } from "../domain/dates";
import { reviewDispatch } from "../domain/review";
import { RESTRICTION_RULES } from "../domain/restrictions";
import { STATUS_FLOW } from "../domain/types";
import type {
  DispatchTask,
  ReviewInput,
  ReviewReport,
  RouteSegment,
  Takeover,
  TaskStatus,
} from "../domain/types";

const STORAGE_KEY = "dfwlfront-3-dispatch-console-v1";
const MAX_REVIEWS = 30;

interface PersistedState {
  tasks: DispatchTask[];
  takeovers: Takeover[];
  reviews: ReviewReport[];
}

function uid(): string {
  return crypto.randomUUID();
}

function makeSegments(names: string[]): RouteSegment[] {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ id: uid(), name, done: false }));
}

/** 初始任务：相对当前时间生成，保证演示时限行/年检口径始终有效 */
function seedTasks(): DispatchTask[] {
  const at = (dayOffset: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return toLocalInput(d);
  };
  const seg = (names: string[], doneCount: number): RouteSegment[] =>
    names.map((name, i) => ({ id: uid(), name, done: i < doneCount }));
  const base = (partial: Omit<DispatchTask, "id" | "rootId" | "version" | "createdAt">) => {
    const id = uid();
    return { ...partial, id, rootId: id, version: 1, createdAt: new Date().toISOString() };
  };
  return [
    base({
      plate: "沪A-82L6",
      driver: "周航",
      region: "城北",
      start: at(0, 8),
      end: at(0, 18),
      requiredType: "小型货车",
      segments: seg(["装货点", "高速路段", "城区配送", "卸货点"], 1),
      status: "执行中",
      notes: "商超补货，可继续派车",
    }),
    base({
      plate: "沪B-73K9",
      driver: "董飞",
      region: "城南",
      start: at(0, 9),
      end: at(0, 17),
      requiredType: "中型货车",
      segments: seg(["医药仓库装货", "门店配送"], 1),
      status: "执行中",
      notes: "医药配送，预计17:30返回",
    }),
    base({
      plate: "沪D-88Q7",
      driver: "陈默",
      region: "城东",
      start: at(1, 8),
      end: at(1, 20),
      requiredType: "牵引车",
      segments: seg(["港区提货", "干线运输", "园区卸货"], 0),
      status: "待执行",
      notes: "明日港区干线",
    }),
    base({
      plate: "沪E-20M8",
      driver: "陈默",
      region: "城北",
      start: at(-1, 8),
      end: at(-1, 16),
      requiredType: "小型货车",
      segments: seg(["装货点", "城区配送", "卸货点"], 3),
      status: "已完成",
      notes: "昨日商超补货已完成（冻结，调整需另建版本）",
    }),
  ];
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (Array.isArray(parsed.tasks) && Array.isArray(parsed.takeovers)) {
        return {
          tasks: parsed.tasks,
          takeovers: parsed.takeovers,
          reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
        };
      }
    }
  } catch {
    // 数据损坏时回退到种子数据
  }
  return { tasks: seedTasks(), takeovers: [], reviews: [] };
}

export const useDispatchStore = defineStore("dispatch", () => {
  const persisted = loadState();
  const tasks = ref<DispatchTask[]>(persisted.tasks);
  const takeovers = ref<Takeover[]>(persisted.takeovers);
  const reviews = ref<ReviewReport[]>(persisted.reviews);
  const rules = RESTRICTION_RULES;
  /** 修订模式：正在基于哪个已完成任务另建版本 */
  const revisionBaseId = ref<string | null>(null);

  // 刷新后任务、接管、审查记录与修订链保持一致
  watch(
    [tasks, takeovers, reviews],
    () => {
      const state: PersistedState = {
        tasks: tasks.value,
        takeovers: takeovers.value,
        reviews: reviews.value,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    { deep: true },
  );

  // ---------- 查询 ----------
  const revisionBase = computed(
    () => tasks.value.find((t) => t.id === revisionBaseId.value) ?? null,
  );

  const latestRejection = computed(
    () => reviews.value.find((r) => !r.passed) ?? null,
  );

  function pendingTakeover(taskId: string): Takeover | undefined {
    return takeovers.value.find((t) => t.taskId === taskId && t.status === "待接管");
  }

  function confirmedTakeovers(taskId: string): Takeover[] {
    return takeovers.value.filter((t) => t.taskId === taskId && t.status === "已接管");
  }

  /** 同一修订链上的全部版本，按版本号排序 */
  function chainOf(task: DispatchTask): DispatchTask[] {
    return tasks.value
      .filter((t) => t.rootId === task.rootId)
      .sort((a, b) => a.version - b.version);
  }

  const metrics = computed(() => ({
    total: tasks.value.length,
    running: tasks.value.filter((t) => t.status === "执行中").length,
    pendingTakeover: takeovers.value.filter((t) => t.status === "待接管").length,
    done: tasks.value.filter((t) => t.status === "已完成").length,
  }));

  const statusChart = computed(() =>
    STATUS_FLOW.map((status) => ({
      status,
      value: tasks.value.filter((t) => t.status === status).length,
    })),
  );

  // ---------- 审查 ----------
  function runReview(kind: ReviewReport["kind"], input: ReviewInput): ReviewReport {
    const report: ReviewReport = {
      id: uid(),
      kind,
      ...input,
      passed: true,
      violations: reviewDispatch(input),
      createdAt: new Date().toISOString(),
    };
    report.passed = report.violations.length === 0;
    reviews.value = [report, ...reviews.value].slice(0, MAX_REVIEWS);
    return report;
  }

  // ---------- 派单 ----------
  /** 新派单：审查不过则整单拒绝（表单保留输入），通过则登记任务 */
  function submitDispatch(input: ReviewInput, segmentNames: string[], notes: string): ReviewReport {
    const report = runReview("派单", input);
    if (!report.passed) return report;
    const id = uid();
    tasks.value = [
      {
        id,
        rootId: id,
        version: 1,
        ...input,
        segments: makeSegments(segmentNames),
        status: "待执行",
        notes: notes || "暂无备注",
        createdAt: new Date().toISOString(),
      },
      ...tasks.value,
    ];
    return report;
  }

  /** 已完成任务冻结，调整只能另建带原因的修订版本 */
  function startRevision(taskId: string) {
    const task = tasks.value.find((t) => t.id === taskId);
    if (task && task.status === "已完成") revisionBaseId.value = taskId;
  }

  function cancelRevision() {
    revisionBaseId.value = null;
  }

  function submitRevision(
    input: ReviewInput,
    segmentNames: string[],
    notes: string,
    reason: string,
  ): ReviewReport | null {
    const baseTask = revisionBase.value;
    if (!baseTask || !reason.trim()) return null;
    const report = runReview("修订", input);
    if (!report.passed) return report;
    const nextVersion = Math.max(...chainOf(baseTask).map((t) => t.version)) + 1;
    tasks.value = [
      {
        id: uid(),
        rootId: baseTask.rootId,
        version: nextVersion,
        revisionReason: reason.trim(),
        ...input,
        segments: makeSegments(segmentNames),
        status: "待执行",
        notes: notes || "暂无备注",
        createdAt: new Date().toISOString(),
      },
      ...tasks.value,
    ];
    revisionBaseId.value = null;
    return report;
  }

  // ---------- 替换车接管 ----------
  /** 申请替换车：同口径审查，通过则登记待接管（此间原车不得释放） */
  function requestTakeover(taskId: string, toPlate: string, toDriver: string): ReviewReport | null {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task || task.status === "已完成" || pendingTakeover(taskId)) return null;
    if (toPlate === task.plate) return null;
    const report = runReview("替换车", {
      plate: toPlate,
      driver: toDriver,
      region: task.region,
      start: task.start,
      end: task.end,
      requiredType: task.requiredType,
    });
    if (!report.passed) return report;
    takeovers.value = [
      ...takeovers.value,
      {
        id: uid(),
        taskId,
        fromPlate: task.plate,
        fromDriver: task.driver,
        toPlate,
        toDriver,
        status: "待接管",
        inheritedSegments: [],
        createdAt: new Date().toISOString(),
      },
    ];
    return report;
  }

  /** 确认接管：原车至此才释放，替换车继承未完成路段 */
  function confirmTakeover(takeoverId: string) {
    const takeover = takeovers.value.find((t) => t.id === takeoverId);
    if (!takeover || takeover.status !== "待接管") return;
    const task = tasks.value.find((t) => t.id === takeover.taskId);
    if (!task) return;
    takeover.status = "已接管";
    takeover.confirmedAt = new Date().toISOString();
    takeover.inheritedSegments = task.segments.filter((s) => !s.done).map((s) => s.name);
    task.plate = takeover.toPlate;
    task.driver = takeover.toDriver;
  }

  function cancelTakeover(takeoverId: string) {
    const takeover = takeovers.value.find((t) => t.id === takeoverId);
    if (takeover && takeover.status === "待接管") takeover.status = "已取消";
  }

  // ---------- 任务流转 ----------
  function nextStatus(status: TaskStatus): TaskStatus {
    return STATUS_FLOW[STATUS_FLOW.indexOf(status) + 1] ?? status;
  }

  /** 状态流转：已完成冻结；有待接管时须先确认或取消接管 */
  function flowTask(taskId: string): boolean {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task || task.status === "已完成" || pendingTakeover(taskId)) return false;
    task.status = nextStatus(task.status);
    return true;
  }

  function toggleSegment(taskId: string, segmentId: string) {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task || task.status !== "执行中") return;
    const segment = task.segments.find((s) => s.id === segmentId);
    if (segment) segment.done = !segment.done;
  }

  /** 删除：已完成任务冻结不可删；有待接管时须先处理接管 */
  function removeTask(taskId: string): boolean {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task || task.status === "已完成" || pendingTakeover(taskId)) return false;
    tasks.value = tasks.value.filter((t) => t.id !== taskId);
    takeovers.value = takeovers.value.filter((t) => t.taskId !== taskId);
    return true;
  }

  return {
    tasks,
    takeovers,
    reviews,
    rules,
    revisionBase,
    latestRejection,
    metrics,
    statusChart,
    pendingTakeover,
    confirmedTakeovers,
    chainOf,
    submitDispatch,
    startRevision,
    cancelRevision,
    submitRevision,
    requestTakeover,
    confirmTakeover,
    cancelTakeover,
    nextStatus,
    flowTask,
    toggleSegment,
    removeTask,
  };
});
