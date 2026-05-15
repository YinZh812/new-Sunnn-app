// domain/learning.js —— v2 阶段 6 个人学习规则
//
// 个人词典：当用户在确认弹窗里把 parser 分错的类别改正后，记下来下次自动用。
// 规则形如：
//   { phrase: "外卖", type: "expense", category: "餐饮", hits: 3, lastUsed: 1747234567 }
//
// 设计：
// - phrase + type 复合键（同一词在不同 type 下可有不同 category）
// - 子串匹配，最长 phrase 优先（更具体的覆盖更宽泛的）
// - 大小写不敏感（"Starbucks" / "starbucks" 视为同一词）
// - 短 phrase（< 2 字符）拒收，避免"的/一"等无意义短词污染
//
// 当前阶段仅消费方：parser.v2.js parseVoiceText 的 learnedRules option。
// v1 parser.js 不感知，便于回滚。

const MIN_PHRASE_LEN = 2;

/**
 * 规则数据形状。
 * @typedef {Object} LearnedRule
 * @property {string} phrase      原始 phrase（保留大小写）
 * @property {"expense"|"income"|"savings"} type
 * @property {string} category    目标分类名
 * @property {number} hits        累计命中次数（首次创建为 1）
 * @property {number} lastUsed    最近一次创建/更新/命中的时间戳
 */

/**
 * phrase 规范化：trim + 限制长度。返回 null 表示无效（不应入库）。
 */
function normalizePhrase(phrase) {
  if (typeof phrase !== "string") return null;
  const s = phrase.trim();
  if (s.length < MIN_PHRASE_LEN || s.length > 50) return null;
  if (s === "消费") return null; // voiceCleanDesc 的兜底空值
  return s;
}

/**
 * 添加或覆盖一条学习规则。同 (phrase, type) 已存在则更新 category，hits 重置为 1。
 * 不存在则新增 hits=1。
 *
 * @param {LearnedRule[]} rules 当前规则数组
 * @param {string} phrase
 * @param {"expense"|"income"|"savings"} type
 * @param {string} category
 * @returns {LearnedRule[]} 新数组（不修改原数组）
 */
export function recordLearning(rules, phrase, type, category) {
  const ph = normalizePhrase(phrase);
  if (!ph || !type || !category) return Array.isArray(rules) ? rules : [];
  const list = Array.isArray(rules) ? rules : [];
  const ts = Date.now();
  const idx = list.findIndex((r) => r.phrase === ph && r.type === type);
  if (idx >= 0) {
    const updated = list.slice();
    updated[idx] = { ...list[idx], category, hits: 1, lastUsed: ts };
    return updated;
  }
  return [...list, { phrase: ph, type, category, hits: 1, lastUsed: ts }];
}

/**
 * 删除规则。
 */
export function forgetLearning(rules, phrase, type) {
  if (!Array.isArray(rules)) return [];
  return rules.filter((r) => !(r.phrase === phrase && r.type === type));
}

/**
 * 清空所有规则。
 */
export function clearLearning() {
  return [];
}

/**
 * 在 text 中查找最长匹配的学习规则。仅匹配 type 一致的。
 *
 * @param {string} text       要匹配的原始文本（用 voiceCleanDesc 输出或整段都行；二者皆能命中）
 * @param {"expense"|"income"|"savings"} type
 * @param {LearnedRule[]} rules
 * @returns {LearnedRule|null}
 */
export function findLearnedRule(text, type, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  if (typeof text !== "string" || !text) return null;
  const lower = text.toLowerCase();
  let best = null;
  for (const r of rules) {
    if (!r || r.type !== type) continue;
    const ph = r.phrase.toLowerCase();
    if (!lower.includes(ph)) continue;
    if (!best || r.phrase.length > best.phrase.length) best = r;
  }
  return best;
}

/**
 * 解析时调用的快捷函数。返回学到的 category 或 null。
 */
export function applyLearnedRules(text, type, rules) {
  const hit = findLearnedRule(text, type, rules);
  return hit ? hit.category : null;
}

/**
 * 命中后增加 hit 计数。返回新数组，仅当 hit 存在时变化。
 * （Parser 是纯函数不该改 store，所以调用方按需触发；阶段 6 MVP 不强制走 hit 计数。）
 */
export function bumpHit(rules, phrase, type) {
  if (!Array.isArray(rules)) return [];
  const idx = rules.findIndex((r) => r.phrase === phrase && r.type === type);
  if (idx < 0) return rules;
  const updated = rules.slice();
  updated[idx] = { ...rules[idx], hits: (rules[idx].hits || 0) + 1, lastUsed: Date.now() };
  return updated;
}
