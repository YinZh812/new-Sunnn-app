// domain/dates.js —— 交易时间相关的格式化（无 IO，无 DOM）
//
// 时间精度（timePrecision）说明：
//   "exact"     —— 精确到分钟（含 timePhrase，如"今天下午3点15分"）
//   "daytime"   —— 仅时段（如"上午""下午""晚上"）
//   "day"       —— 只到日期，无具体时间
//   "month"     —— 只到月份
//   "year_only" —— 只到年份
//   "now"       —— 默认（实时）

import { pad2 } from "../utils/format.js";

export const TIME_PRECISION = Object.freeze({
  EXACT:     "exact",
  DAYTIME:   "daytime",
  DAY:       "day",
  MONTH:     "month",
  YEAR_ONLY: "year_only",
  NOW:       "now",
});

export const WEEKDAY_LABELS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

/**
 * 列表项时间标签：用 timeLabel 作日期前缀（若有），按精度附加时间部分。
 * 与原 fmtLabel(t) 行为基本一致，并支持 daytime 精度显示原始时段词。
 */
export function formatTransactionTime(tx) {
  const d = new Date(tx.ts);
  const base = tx.timeLabel || `${d.getMonth() + 1}月${d.getDate()}日`;
  const prec = tx.timePrecision;
  if (!prec || prec === "day" || prec === "month" || prec === "year_only") return base;
  if (prec === "daytime" && tx.timePhrase) return `${base} ${tx.timePhrase}`;
  return `${base} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 完整时间展示（详情弹窗用）。
 * 与原 fmtFull(t) 行为一致。
 */
export function formatTransactionFull(tx) {
  const d = new Date(tx.ts);
  const datePart = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (tx.timePrecision === "month") return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  if (tx.timePrecision === "year_only") return `${d.getFullYear()}年`;
  if (tx.timePhrase && tx.timePrecision === "exact") {
    return `${datePart} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  if (tx.timePhrase && tx.timePrecision === "daytime") {
    return `${datePart} ${tx.timePhrase}`;
  }
  return `${datePart} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 列表分组头："04月11日  星期一"，"04月"（按月精度），"2026年"（按年精度）。
 * 与原 groupListLbl(t) 行为一致。
 */
export function formatGroupHeader(tx) {
  const d = new Date(tx.ts);
  const prec = tx.timePrecision || "";
  if (prec === "month") return `${pad2(d.getMonth() + 1)}月`;
  if (prec === "year_only") return `${d.getFullYear()}年`;
  return `${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日  ${WEEKDAY_LABELS[d.getDay()]}`;
}

/**
 * 列表项辅助文字（如 "12:30" 或 "下午"），无意义时返回 null。
 * 与原 listTimInnerText(t) 行为一致。
 */
export function formatTransactionTimeInline(tx) {
  const prec = tx.timePrecision || "now";
  if (prec === "month" || prec === "year_only") return null;
  const d = new Date(tx.ts);
  if (tx.timePhrase && prec === "exact") return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (tx.timePhrase && prec === "daytime") return tx.timePhrase;
  if (prec === "day") return null;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "2026年4月11日"。原 dayL(ts) 行为一致。 */
export function formatDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 给定 (year, month) 0-based，返回 [startTs, endTs)，左闭右开。
 * 用于"本月交易"等过滤。
 */
export function monthRange(year, month) {
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const end   = new Date(year, month + 1, 1, 0, 0, 0, 0).getTime();
  return [start, end];
}

/**
 * 判断交易是否落在指定年月。
 */
export function isInMonth(tx, year, month) {
  const d = new Date(tx.ts);
  return d.getFullYear() === year && d.getMonth() === month;
}
