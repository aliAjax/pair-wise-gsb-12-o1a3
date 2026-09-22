import { eachDay, weekdayOf, WEEKDAY_LABELS } from "./dates";
import { canDrive, findDriver, findVehicle, plateTail } from "./fleet";
import { RESTRICTION_RULES } from "./restrictions";
import type { EmissionRule, ReviewInput, TailRule, Violation } from "./types";

/**
 * 审查计算：对一单派车输入执行三类规则审查——
 *  1. 当日限行：任务覆盖的每一天，命中区域尾号限行或排放限行即违例；
 *  2. 年检：任务结束时车辆年检已失效即违例；
 *  3. 准驾：司机准驾等级不覆盖任务准驾车型即违例。
 * 任一违例成立则整单拒绝，违例清单带回原值与命中规则。
 */
export function reviewDispatch(input: ReviewInput): Violation[] {
  const violations: Violation[] = [];
  const vehicle = findVehicle(input.plate);
  const driver = findDriver(input.driver);

  if (!vehicle) {
    violations.push({
      ruleId: "registry-vehicle",
      ruleName: "车辆台账登记",
      field: "车牌号",
      originalValue: input.plate || "（空）",
      detail: "该车牌未登记在车辆台账中",
    });
    return violations;
  }

  // —— 1. 当日限行（按任务覆盖的每个自然日逐日核对）——
  const days = eachDay(input.start, input.end);
  const tail = plateTail(vehicle.plate);
  for (const rule of RESTRICTION_RULES.filter((r) => r.region === input.region)) {
    if (rule.kind === "tail") {
      violations.push(...checkTailRule(rule, days, tail));
    } else {
      violations.push(...checkEmissionRule(rule, days, vehicle.emission));
    }
  }

  // —— 2. 年检：任务结束时年检失效 ——
  const endDay = input.end.slice(0, 10);
  if (endDay && vehicle.inspectionUntil < endDay) {
    violations.push({
      ruleId: "inspection-expired",
      ruleName: "任务结束时年检失效",
      field: "年检有效期",
      originalValue: vehicle.inspectionUntil,
      detail: `年检至 ${vehicle.inspectionUntil}，任务 ${endDay} 才结束，结束时年检已失效`,
    });
  }

  // —— 3. 准驾车型 ——
  if (!driver) {
    violations.push({
      ruleId: "registry-driver",
      ruleName: "司机名册登记",
      field: "司机",
      originalValue: input.driver || "（空）",
      detail: "该司机未登记在司机名册中",
    });
  } else if (!canDrive(driver.license, input.requiredType)) {
    violations.push({
      ruleId: "license-mismatch",
      ruleName: "准驾车型不符",
      field: "准驾车型",
      originalValue: `${driver.name} 持 ${driver.license}（任务要求 ${input.requiredType}）`,
      detail: `${driver.license} 不含 ${input.requiredType} 准驾资格`,
    });
  }

  return violations;
}

function checkTailRule(rule: TailRule, days: string[], tail: string): Violation[] {
  const hits = days
    .map((day) => ({ day, banned: rule.schedule[weekdayOf(day)] }))
    .filter((hit) => hit.banned?.includes(tail));
  if (hits.length === 0) return [];
  return [
    {
      ruleId: rule.id,
      ruleName: rule.label,
      field: "车牌尾号",
      originalValue: `尾号 ${tail}`,
      detail: hits
        .map((hit) => `${hit.day.slice(5)} ${WEEKDAY_LABELS[weekdayOf(hit.day)]}禁行 ${hit.banned!.join("/")}`)
        .join("；"),
    },
  ];
}

function checkEmissionRule(rule: EmissionRule, days: string[], emission: string): Violation[] {
  if (!rule.levels.includes(emission)) return [];
  const hits = days.filter((day) => rule.weekdays.includes(weekdayOf(day)));
  if (hits.length === 0) return [];
  return [
    {
      ruleId: rule.id,
      ruleName: rule.label,
      field: "排放等级",
      originalValue: emission,
      detail: hits.map((day) => `${day.slice(5)} ${WEEKDAY_LABELS[weekdayOf(day)]}`).join("、") + " 禁行",
    },
  ];
}
