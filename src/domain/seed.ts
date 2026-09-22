import type { ConsoleState, Vehicle, Driver, RestrictionRule, Task } from "./types";

export const EMISSION_ORDER = ["国三", "国四", "国五", "国六"] as const;
export const LICENSE_ORDER = ["C1", "B1", "B2", "A2"] as const;
export const ZONES = ["城北", "城东", "城南", "城西", "高新区"] as const;

export const STORAGE_KEY = "dfwlfront-3-dispatch-console";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysFromNow(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

function hoursFromNow(delta: number): string {
  const d = new Date(Date.now() + delta * 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function seedVehicles(): Vehicle[] {
  return [
    { plate: "沪A-82L6", emission: "国三", inspectUntil: daysFromNow(30), ratedClass: "B2", note: "城配厢货" },
    { plate: "沪B-73K9", emission: "国五", inspectUntil: daysFromNow(12), ratedClass: "B2", note: "医药冷链" },
    { plate: "沪C-55T2", emission: "国四", inspectUntil: daysFromNow(-2), ratedClass: "A2", note: "挂车（年检刚到期）" },
    { plate: "沪D-10X8", emission: "国六", inspectUntil: daysFromNow(96), ratedClass: "C1", note: "新能源面包" },
    { plate: "沪E-66Q3", emission: "国五", inspectUntil: daysFromNow(40), ratedClass: "A2", note: "重型栏板" }
  ];
}

export function seedDrivers(): Driver[] {
  return [
    { name: "董飞", license: "B2", phone: "13800000001" },
    { name: "周航", license: "B1", phone: "13800000002" },
    { name: "沈岚", license: "A2", phone: "13800000003" },
    { name: "魏然", license: "C1", phone: "13800000004" }
  ];
}

export function seedRules(): RestrictionRule[] {
  return [
    {
      id: "rule-emission-north",
      name: "城北低排放限行",
      type: "emission",
      scope: "zone",
      zones: ["城北"],
      maxEmission: "国四",
      start: "07:00",
      end: "20:00",
      enabled: true
    },
    {
      id: "rule-tail-east",
      name: "城东尾号限行（6/8）",
      type: "tail",
      scope: "zone",
      zones: ["城东"],
      tails: ["6", "8"],
      start: "06:00",
      end: "22:00",
      enabled: true
    },
    {
      id: "rule-emission-city",
      name: "全城国三及以下重车限行",
      type: "emission",
      scope: "city",
      maxEmission: "国三",
      start: "08:00",
      end: "18:00",
      enabled: false
    }
  ];
}

export function seedTasks(): Task[] {
  const active: Task = {
    id: "seed-task-1",
    seq: 1,
    plate: "沪B-73K9",
    driver: "周航",
    zone: "城东",
    startAt: hoursFromNow(-2),
    endAt: hoursFromNow(4),
    requiredClass: "B1",
    segments: [
      { id: "seg-1-1", name: "仓装发车", state: "已完成", byPlate: "沪B-73K9" },
      { id: "seg-1-2", name: "医院东门交付", state: "未完成" },
      { id: "seg-1-3", name: "回程空返", state: "未完成" }
    ],
    status: "执行中",
    note: "医药配送，预计晚点",
    createdAt: new Date().toISOString(),
    rootId: "seed-task-1",
    version: 1,
    takeovers: []
  };
  const done: Task = {
    id: "seed-task-2",
    seq: 0,
    plate: "沪D-10X8",
    driver: "魏然",
    zone: "城南",
    startAt: hoursFromNow(-52),
    endAt: hoursFromNow(-48),
    requiredClass: "C1",
    segments: [
      { id: "seg-2-1", name: "商超A店补货", state: "已完成", byPlate: "沪D-10X8" },
      { id: "seg-2-2", name: "商超B店补货", state: "已完成", byPlate: "沪D-10X8" }
    ],
    status: "已完成",
    note: "昨日批次，已签收",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    rootId: "seed-task-2",
    version: 1,
    takeovers: []
  };
  return [active, done];
}

export function seedState(): ConsoleState {
  return {
    version: 1,
    vehicles: seedVehicles(),
    drivers: seedDrivers(),
    rules: seedRules(),
    tasks: seedTasks(),
    seq: 2
  };
}
