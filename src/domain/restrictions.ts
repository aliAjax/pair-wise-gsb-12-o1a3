import type { RestrictionRule } from "./types";

/**
 * 区域当日限行规则（配置型数据，刷新后保持一致）。
 * 尾号规则按周几配置禁行尾号；排放规则按星期集合禁行排放等级。
 */
export const RESTRICTION_RULES: readonly RestrictionRule[] = [
  {
    id: "cb-tail",
    kind: "tail",
    region: "城北",
    label: "城北工作日尾号限行",
    schedule: { 1: ["1", "6"], 2: ["2", "7"], 3: ["3", "8"], 4: ["4", "9"], 5: ["5", "0"] },
  },
  {
    id: "cb-emission",
    kind: "emission",
    region: "城北",
    label: "城北工作日高排放禁行",
    weekdays: [1, 2, 3, 4, 5],
    levels: ["国二", "国三"],
  },
  {
    id: "cd-tail",
    kind: "tail",
    region: "城东",
    label: "城东工作日尾号限行",
    schedule: { 1: ["3", "8"], 2: ["4", "9"], 3: ["5", "0"], 4: ["1", "6"], 5: ["2", "7"] },
  },
  {
    id: "cd-emission",
    kind: "emission",
    region: "城东",
    label: "城东全天国二禁行",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    levels: ["国二"],
  },
  {
    id: "cn-tail",
    kind: "tail",
    region: "城南",
    label: "城南尾号限行（周二/周四）",
    schedule: { 2: ["5", "0"], 4: ["2", "7"] },
  },
  {
    id: "cn-emission",
    kind: "emission",
    region: "城南",
    label: "城南工作日国三及以下禁行",
    weekdays: [1, 2, 3, 4, 5],
    levels: ["国二", "国三"],
  },
];
