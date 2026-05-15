// domain/currency.js —— 货币换算的纯逻辑
//
// 不知道 settings 的存在；汇率由调用方传入。
// UI 层在用之前应当从 store/settings 里读最新的 eurToCny / ratesToCny 喂进来。
//
// v2 多币种（2026-05）：
//   - SUPPORTED_CURRENCIES：支持的 5 个币种（EUR/CNY/USD/GBP/JPY）
//   - 基础币：CNY。每个币种存"1 该币 = N CNY"汇率
//   - convertAmount / toCny / netInCny / sumByTypeInCny：新一代换算（以 CNY 为基础）
//   - 旧 API（toEur/netInEur/sumByTypeInEur/eurToCny/cnyToEur/totalSavingsInEur）保留
//     以兼容现有调用方；内部已改成走 ratesToCny["EUR"] 而不是单一的 eurToCny

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

/**
 * 标准化汇率：未配置或非正数时回落到默认值。
 * @param {number|null|undefined} eurToCny
 * @returns {number}
 */
export const safeRate = (eurToCny) => {
  const r = Number(eurToCny);
  return Number.isFinite(r) && r > 0 ? r : DEFAULT_EUR_TO_CNY;
};

/**
 * 把欧元数额换算成人民币。
 * @param {number} amount  欧元金额
 * @param {number} rate    eurToCny（推荐用 safeRate 兜底）
 */
export const eurToCny = (amount, rate) => amount * safeRate(rate);

/**
 * 把人民币数额换算成欧元。
 * @param {number} amount  人民币金额
 * @param {number} rate    eurToCny（推荐用 safeRate 兜底）
 */
export const cnyToEur = (amount, rate) => amount / safeRate(rate);

/**
 * 把任意货币的金额标准化成欧元（用于跨币种汇总）。
 * @param {{ amount:number, currency:"EUR"|"CNY" }} tx
 * @param {number} rate  eurToCny
 * @returns {number} 欧元金额
 */
export const toEur = (tx, rate) =>
  tx.currency === "CNY" ? cnyToEur(tx.amount, rate) : tx.amount;

/**
 * 单笔欧元化净额：支出取负，其他取正。
 * 与原 inline netV(t) 行为一致。
 * @param {{ amount:number, currency:"EUR"|"CNY", type:string }} tx
 * @param {number} rate
 * @returns {number}
 */
export const netInEur = (tx, rate) => {
  const v = toEur(tx, rate);
  return tx.type === "expense" ? -v : v;
};

/**
 * 按类型汇总欧元金额。net_income 计入 income。
 * 与原 inline sumT(arr, type) 行为一致。
 * @param {Array<{amount:number, currency:"EUR"|"CNY", type:string}>} arr
 * @param {"income"|"expense"|"savings"} type
 * @param {number} rate
 * @returns {number}
 */
export const sumByTypeInEur = (arr, type, rate) =>
  arr
    .filter((t) => t.type === type || (t.type === "net_income" && type === "income"))
    .reduce((acc, t) => acc + toEur(t, rate), 0);

/**
 * 累计所有 savings 类型交易的欧元值。储蓄目标进度用。
 * 与原 inline totalSavings() 行为一致。
 * @param {Array<{amount:number, currency:"EUR"|"CNY", type:string}>} arr
 * @param {number} rate
 * @returns {number}
 */
export const totalSavingsInEur = (arr, rate) => sumByTypeInEur(arr, "savings", rate);
