// utils/format.js —— 数字、货币、字符串的纯格式化辅助
// 保持纯函数：相同输入恒得相同输出，无副作用、无 DOM、无 IO。

/** 数字补零到 2 位，如 7 → "07"。 */
export const pad2 = (n) => String(n).padStart(2, "0");

/**
 * 货币代码到符号。多币种 v2：支持 EUR/CNY/USD/GBP/JPY。
 * 未识别的代码返回 "€"（与历史行为兼容）。
 */
const CUR_SYMBOL_MAP = { EUR: "€", CNY: "¥", USD: "$", GBP: "£", JPY: "¥" };
export const currencySymbol = (currency) => CUR_SYMBOL_MAP[currency] || "€";

/**
 * 安全的小数格式化。amount 不是数字时返回 "0.00"。
 *   formatAmount(12.5)        -> "12.50"
 *   formatAmount(12.345, 1)   -> "12.3"
 *   formatAmount("abc")       -> "0.00"
 */
export const formatAmount = (amount, decimals = 2) => {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(decimals) : (0).toFixed(decimals);
};

/**
 * 交易金额的标准展示："+12.34 €" / "−12.34 ¥"。
 * 与原内联函数 fmtA(t) 等价。
 */
export const formatSignedAmount = (tx) => {
  const sign = tx.type === "expense" ? "−" : "+";
  return sign + formatAmount(tx.amount) + " " + currencySymbol(tx.currency);
};

/**
 * 把数字字符串拆成 { int, dec } 两段，方便 hero 大字 + 小字渲染。
 *   splitDecimal(12.34)  -> { int: "12", dec: ".34" }
 *   splitDecimal(7)      -> { int: "7",  dec: ".00" }
 */
export const splitDecimal = (n, decimals = 2) => {
  const s = formatAmount(n, decimals);
  const i = s.indexOf(".");
  return i < 0 ? { int: s, dec: "" } : { int: s.slice(0, i), dec: s.slice(i) };
};

/**
 * HTML 转义（防止用户输入串入 innerHTML 时注入）。
 * 与原内联函数 escTx 等价；多保护了一个 '>' 和单引号。
 */
export const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** 限制小数位但去除末尾多余零。常用于价格预览：12.50 → "12.5"，12 → "12"。 */
export const trimDecimal = (n, maxDecimals = 2) => {
  const fixed = formatAmount(n, maxDecimals);
  return fixed.replace(/\.?0+$/, "") || "0";
};
