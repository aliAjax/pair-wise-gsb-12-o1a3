/** 日期工具：任务时段按自然日展开，供“当日限行”逐日审查 */

export const WEEKDAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** Date → datetime-local 输入框格式 YYYY-MM-DDTHH:mm */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local 字符串 → 周几（1=周一 … 7=周日） */
export function weekdayOf(day: string): number {
  const d = new Date(`${day.slice(0, 10)}T00:00`);
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** 把任务时段展开为覆盖的每一个自然日（YYYY-MM-DD），含首尾 */
export function eachDay(start: string, end: string): string[] {
  if (!start || !end) return [];
  const days: string[] = [];
  const cursor = new Date(`${start.slice(0, 10)}T00:00`);
  const last = new Date(`${end.slice(0, 10)}T00:00`);
  let guard = 0;
  while (cursor <= last && guard < 62) {
    days.push(toLocalInput(cursor).slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return days;
}

/** 展示用：datetime-local 或 ISO 串 → 09-22 08:00（ISO 串按本地时间换算） */
export function fmtMoment(value: string): string {
  if (!value) return "—";
  if (value.length > 16) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return toLocalInput(d).slice(5).replace("T", " ");
  }
  return `${value.slice(5, 10)} ${value.slice(11, 16)}`;
}

/** 展示用：时段 */
export function fmtPeriod(start: string, end: string): string {
  return `${fmtMoment(start)} ~ ${fmtMoment(end)}`;
}
