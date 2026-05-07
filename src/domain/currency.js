// domain/currency.js —— 货币换算的纯逻辑
//
// 不知道 settings 的存在；汇率由调用方传入。
// UI 层在用之前应当从 store/settings 里读最新的 eurToCny 喂进来。

/** 默认欧元兑人民币汇率（无配置时的 fallback） */
export const DEFAULT_EUR_TO_CNY = 7.8;

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
