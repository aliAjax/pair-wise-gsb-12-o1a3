import { seedState } from "../src/domain/seed";
import { audit, isVehicleBusy, occupiedIntervals, overlapsRule, tailOf } from "../src/domain/audit";
import type { Task } from "../src/domain/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name} ${extra}`);
  }
}

const state = seedState();

// 构造今天 09:00-12:00 的本地时间
function todayAt(h: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:00`;
}

// 1. 尾号提取
check("tailOf 沪A-82L6 = 6", tailOf("沪A-82L6") === "6", tailOf("沪A-82L6"));

// 2. 国三车进城北 09:00 → 命中排放限行（规则阈值国四）
const r1 = audit(state, {
  plate: "沪A-82L6",
  driver: "董飞",
  zone: "城北",
  startAt: todayAt(9),
  endAt: todayAt(12),
  requiredClass: "B2"
});
check("国三车城北早间被排放限行拒绝", !r1.ok && r1.hits.some((h) => h.rule === "EMISSION"), JSON.stringify(r1.hits));

// 3. 尾号 6 车进城东 → 命中尾号限行
const r2 = audit(state, {
  plate: "沪A-82L6",
  driver: "董飞",
  zone: "城东",
  startAt: todayAt(9),
  endAt: todayAt(12),
  requiredClass: "B2"
});
check("尾号6车城东被尾号限行拒绝", !r2.ok && r2.hits.some((h) => h.rule === "TAIL_NUMBER"));

// 4. 任务结束时年检失效（沪C 已过期）
const r3 = audit(state, {
  plate: "沪C-55T2",
  driver: "沈岚",
  zone: "城南",
  startAt: todayAt(9),
  endAt: todayAt(11),
  requiredClass: "A2"
});
check("年检失效车被拒", !r3.ok && r3.hits.some((h) => h.rule === "INSPECTION_EXPIRED"), JSON.stringify(r3.hits));

// 5. 准驾不符：魏然 C1 开 A2 车
const r4 = audit(state, {
  plate: "沪E-66Q3",
  driver: "魏然",
  zone: "城南",
  startAt: todayAt(9),
  endAt: todayAt(11),
  requiredClass: "A2"
});
check("C1司机开A2被准驾规则拒绝", !r4.ok && r4.hits.some((h) => h.rule === "LICENSE_MISMATCH"));

// 6. 合规单通过：国六车 + C1 司机，城西无限行
const r5 = audit(state, {
  plate: "沪D-10X8",
  driver: "魏然",
  zone: "城西",
  startAt: todayAt(9),
  endAt: todayAt(11),
  requiredClass: "C1"
});
check("合规单通过", r5.ok, JSON.stringify(r5.hits));

// 7. 限行规则时段不重叠 → 不命中（城北 21:00-22:00 早于规则 07:00-20:00 结束…应选 21-22）
const northRule = state.rules.find((r) => r.id === "rule-emission-north")!;
check("21点任务不与07-20规则重叠", !overlapsRule(northRule, todayAt(21), todayAt(22)));
check("19点任务与07-20规则重叠", overlapsRule(northRule, todayAt(19), todayAt(21)));

// 8. 占用：种子任务 沪B-73K9 执行中
const busyTask = isVehicleBusy(state, "沪B-73K9", todayAt(0), todayAt(23));
check("执行中车辆时段占用", !!busyTask);

// 9. 接管区间：原车只占用到接管时刻，替换车接管后占用，且预占时两车都占
const task: Task = {
  ...JSON.parse(JSON.stringify(state.tasks.find((t) => t.id === "seed-task-1")!))
};
task.id = "test-takeover";
task.startAt = todayAt(8);
task.endAt = todayAt(18);
task.plate = "沪B-73K9";
const miniState = { ...state, tasks: [task] };
const takeoverAt = new Date();
takeoverAt.setHours(12, 0, 0, 0);

// 预占前
check("接管前原车全程占用", occupiedIntervals(task).some((i) => i.plate === "沪B-73K9" && i.from === new Date(todayAt(8)).getTime() && i.to === new Date(todayAt(18)).getTime()));

// 预占
task.pendingTakeover = {
  candidatePlate: "沪D-10X8",
  candidateDriver: "魏然",
  reason: "故障",
  at: takeoverAt.toISOString()
};
check("预占时候选车 12-18 被预留", occupiedIntervals(task).some((i) => i.plate === "沪D-10X8"));
check(
  "预占时原车仍 8-18 占用（不得释放）",
  occupiedIntervals(task).some((i) => i.plate === "沪B-73K9" && i.from === new Date(todayAt(8)).getTime() && i.to === new Date(todayAt(18)).getTime())
);
check("预占时原车对 13-14 点新单仍 busy", !!isVehicleBusy(miniState, "沪B-73K9", todayAt(13), todayAt(14)));
check("预占时候选车对 13-14 点新单 busy", !!isVehicleBusy(miniState, "沪D-10X8", todayAt(13), todayAt(14)));
check("预占时原车在 13 点前已释放？不，原车仍占；候选车 9-10 点不 busy", !isVehicleBusy(miniState, "沪D-10X8", todayAt(9), todayAt(10)));

// 确认接管
task.takeovers.push({
  id: "to1",
  taskId: task.id,
  at: takeoverAt.toISOString(),
  reason: "故障",
  fromPlate: "沪B-73K9",
  toPlate: "沪D-10X8",
  driverChanged: true,
  fromDriver: "周航",
  toDriver: "魏然",
  inheritedSegments: []
});
task.pendingTakeover = undefined;
// 与 store.confirmTakeover 行为一致：任务主车牌更新为替换车
task.plate = "沪D-10X8";
task.driver = "魏然";
const intervals = occupiedIntervals(task);
check("确认后原车只占用到12点", intervals.some((i) => i.plate === "沪B-73K9" && i.to === takeoverAt.getTime()));
check("确认后替换车12-18占用", intervals.some((i) => i.plate === "沪D-10X8" && i.from === takeoverAt.getTime()));
check("确认后原车 13-14 点已释放", !isVehicleBusy(miniState, "沪B-73K9", todayAt(13), todayAt(14)));
check("确认后替换车 13-14 点占用", !!isVehicleBusy(miniState, "沪D-10X8", todayAt(13), todayAt(14)));
check("确认后原车 9-10 点仍占用", !!isVehicleBusy(miniState, "沪B-73K9", todayAt(9), todayAt(10)));

// 10. 刷新后场景：任务主车牌已更新为替换车（持久化恢复），区间仍须正确
const reloaded: Task = JSON.parse(JSON.stringify(task));
check("重载后当前承运车为替换车", reloaded.plate === "沪D-10X8");
const intervals2 = occupiedIntervals(reloaded);
check("重载后原车仍只占用到12点", intervals2.some((i) => i.plate === "沪B-73K9" && i.to === takeoverAt.getTime()));
check("重载后替换车12-18占用", intervals2.some((i) => i.plate === "沪D-10X8" && i.from === takeoverAt.getTime()));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
