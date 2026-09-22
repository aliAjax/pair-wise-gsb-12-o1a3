import type { Driver, Vehicle } from "./types";

/** 工作区域 */
export const REGIONS = ["城北", "城东", "城南"] as const;

/** 车型（派单时登记“准驾车型”即任务所需车型） */
export const VEHICLE_TYPES = ["小型货车", "中型货车", "重型货车", "牵引车"] as const;

export const EMISSION_LEVELS = ["国三", "国四", "国五", "国六", "纯电动"] as const;

/** 准驾矩阵：驾照等级 → 可驾驶车型 */
export const LICENSE_PERMISSIONS: Record<string, readonly string[]> = {
  C1: ["小型货车"],
  B2: ["小型货车", "中型货车", "重型货车"],
  A2: ["小型货车", "中型货车", "重型货车", "牵引车"],
};

export function canDrive(license: string, vehicleType: string): boolean {
  return (LICENSE_PERMISSIONS[license] ?? []).includes(vehicleType);
}

export function licenseScopeText(license: string): string {
  return (LICENSE_PERMISSIONS[license] ?? []).join(" / ") || "无";
}

/** 取车牌尾号：牌面最后一个数字字符 */
export function plateTail(plate: string): string {
  const digits = plate.replace(/\D/g, "");
  return digits ? digits[digits.length - 1] : "";
}

/** 车辆台账 */
export const VEHICLES: readonly Vehicle[] = [
  { plate: "沪A-82L6", type: "小型货车", emission: "国六", inspectionUntil: "2027-03-31" },
  { plate: "沪B-73K9", type: "中型货车", emission: "国四", inspectionUntil: "2026-10-15" },
  { plate: "沪C-51D3", type: "重型货车", emission: "国三", inspectionUntil: "2026-09-25" },
  { plate: "沪D-88Q7", type: "牵引车", emission: "国五", inspectionUntil: "2027-01-20" },
  { plate: "沪E-20M8", type: "小型货车", emission: "纯电动", inspectionUntil: "2026-12-31" },
];

/** 司机名册 */
export const DRIVERS: readonly Driver[] = [
  { name: "周航", license: "C1" },
  { name: "董飞", license: "B2" },
  { name: "陈默", license: "A2" },
  { name: "林蔚", license: "C1" },
];

export function findVehicle(plate: string): Vehicle | undefined {
  return VEHICLES.find((v) => v.plate === plate);
}

export function findDriver(name: string): Driver | undefined {
  return DRIVERS.find((d) => d.name === name);
}
