// domain/currency.js —— 货币换算的纯逻辑
//
// 不知道 settings 的存在；汇率由调用方传入。
// UI 层在用之前应当从 store/settings 里读最新的 ratesToCny 喂进来。
//
// 多币种（2026-05）：
//   - SUPPORTED_CURRENCIES：支持的 5 个币种（EUR/CNY/USD/GBP/JPY）
//   - 基础币：CNY。每个币种存"1 该币 = N CNY"汇率
//   - convertAmount / toCny / netInCny / sumByTypeInCny：以 CNY 为基础的换算 API
//
// 注：早期版本的 EUR-base API（toEur/netInEur/sumByTypeInEur/eurToCny/cnyToEur/
// totalSavingsInEur/safeRate）已全部删除；调用方迁移到 *InCny + convertAmount。
// 仅保留 DEFAULT_EUR_TO_CNY 给 store.hydrate 兼容老 localStorage 字段的迁移。

/** 支持的货币清单。code 是 ISO，label 是中文，symbol 是显示符号。 */
export const SUPPORTED_CURRENCIES = Object.freeze([
  { code: "CNY", symbol: "¥", label: "人民币" },
  { code: "EUR", symbol: "€", label: "欧元" },
  { code: "USD", symbol: "$", label: "美元" },
  { code: "GBP", symbol: "£", label: "英镑" },
  { code: "JPY", symbol: "¥", label: "日元" },
]);

/** 默认每个货币的"1 单位 = N CNY"汇率。设置页可修改。 */
export const DEFAULT_RATES_TO_CNY = Object.freeze({
  CNY: 1,
  EUR: 7.8,
  USD: 7.2,
  GBP: 9.3,
  JPY: 0.047,
});

/** 默认欧元兑人民币汇率（无配置时的 fallback） */
export const DEFAULT_EUR_TO_CNY = DEFAULT_RATES_TO_CNY.EUR;

/**
 * 取某币种的 toCny 汇率。优先 ratesToCny[code]，回落到 DEFAULT_RATES_TO_CNY，再回落 1。
 */
export function rateToCny(code, ratesToCny) {
  const r = (ratesToCny && ratesToCny[code]) ?? DEFAULT_RATES_TO_CNY[code];
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/**
 * 任意币种金额 → CNY 金额。
 * @param {number} amount
 * @param {string} fromCode
 * @param {object} ratesToCny
 */
export function toCny(amount, fromCode, ratesToCny) {
  return Number(amount) * rateToCny(fromCode, ratesToCny);
}

/**
 * CNY 金额 → 任意币种金额。
 */
export function fromCny(cnyAmount, toCode, ratesToCny) {
  return Number(cnyAmount) / rateToCny(toCode, ratesToCny);
}

/**
 * 任意 → 任意 通过 CNY 中转。
 */
export function convertAmount(amount, fromCode, toCode, ratesToCny) {
  if (fromCode === toCode) return Number(amount);
  return fromCny(toCny(amount, fromCode, ratesToCny), toCode, ratesToCny);
}

/**
 * 单笔 → CNY 金额（不带正负号；type 解释由调用方处理）。
 */
export function txToCny(tx, ratesToCny) {
  return toCny(tx.amount, tx.currency || "CNY", ratesToCny);
}

/**
 * 单笔净值（支出为负、其他为正）→ CNY。
 */
export function netInCny(tx, ratesToCny) {
  const v = txToCny(tx, ratesToCny);
  return tx.type === "expense" ? -v : v;
}

/**
 * 按 type 汇总 → CNY。net_income 计入 income。
 */
export function sumByTypeInCny(arr, type, ratesToCny) {
  return arr
    .filter((t) => t.type === type || (t.type === "net_income" && type === "income"))
    .reduce((acc, t) => acc + txToCny(t, ratesToCny), 0);
}

