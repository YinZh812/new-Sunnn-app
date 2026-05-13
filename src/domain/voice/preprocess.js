// domain/voice/preprocess.js —— v2 输入预处理
//
// 在 parser.v2 的最顶层调用，把非标准表达统一成规范文本。
// 阶段 1：identity stub（保证 v2 行为 ≡ v1）
// 阶段 2 将填入：
//   - Emoji → 文字（小表，~12 项）
//   - 全角 → 半角（标点 + 数字）
//   - 静态错别字纠正（TYPO_MAP，无编辑距离）
//   （拼音映射砍掉：Web Speech API 输出已是中文，引入误匹配风险）

/**
 * @param {string} text
 * @returns {string}
 */
export function preprocess(text) {
  if (typeof text !== "string") return "";
  return text;
}
