// state/storage.js —— localStorage 的读写封装
//
// 这一层只懂 JSON 序列化与 6 个固定键名，不知道 store/UI 的存在。
// 调用方拿到的是原始解析结果（或 null）；默认值/空数组由 store 决定。

const KEYS = Object.freeze({
  TXS:           "acct_txs",
  SETTINGS:      "acct_settings",
  BUDGETS:       "acct_budgets",
  GOALS:         "acct_goals",
  DELETED_SUGS:  "acct_deletedSugs",
  CAT_BY_TYPE:   "customCategoriesByType",
  CAT_VERSION:   "customCategoriesVersion",
  USER_NAME:     "userName",
  LEARNED_RULES: "acct_learnedRules",  // v2 阶段 6：个人学习的 phrase → category 规则
  SFX_ENABLED:   "sfxEnabled",
  SFX_VOLUME:    "sfxVolume",
  VIB_ENABLED:   "vibEnabled",
});

export { KEYS as STORAGE_KEYS };

// ── 底层：try/catch 包装的 raw 读写 ────────────────────────────────────────────

const lsGet = (k) => {
  try { return localStorage.getItem(k); } catch { return null; }
};

const lsSet = (k, v) => {
  try { localStorage.setItem(k, v); } catch { /* 配额超限或 disabled 静默忽略 */ }
};

const lsRemove = (k) => {
  try { localStorage.removeItem(k); } catch { /* 同上 */ }
};

/** 读取并 JSON 解析。出错或不存在时返回 fallback。 */
export function readJson(key, fallback = null) {
  const raw = lsGet(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

/** JSON 序列化并写入。 */
export function writeJson(key, value) {
  lsSet(key, JSON.stringify(value));
}

/** 写入纯字符串。 */
export function writeString(key, value) {
  lsSet(key, value);
}

/** 读取纯字符串。 */
export function readString(key, fallback = "") {
  const v = lsGet(key);
  return v == null ? fallback : v;
}

/** 删除指定键（数据清理 / 退出登录用）。 */
export function remove(key) {
  lsRemove(key);
}

// ── 高层：业务键的便捷封装 ────────────────────────────────────────────────────

export const loadTxs           = ()  => readJson(KEYS.TXS, []);
export const saveTxs           = (v) => writeJson(KEYS.TXS, v);

export const loadSettings      = ()  => readJson(KEYS.SETTINGS, null);
export const saveSettings      = (v) => writeJson(KEYS.SETTINGS, v);

export const loadBudgets       = ()  => readJson(KEYS.BUDGETS, {});
export const saveBudgets       = (v) => writeJson(KEYS.BUDGETS, v);

export const loadGoals         = ()  => readJson(KEYS.GOALS, []);
export const saveGoals         = (v) => writeJson(KEYS.GOALS, v);

export const loadDeletedSugs   = ()  => readJson(KEYS.DELETED_SUGS, []);
export const saveDeletedSugs   = (v) => writeJson(KEYS.DELETED_SUGS, v);

export const loadCatsByType    = ()  => readJson(KEYS.CAT_BY_TYPE, null);
export const saveCatsByType    = (v) => writeJson(KEYS.CAT_BY_TYPE, v);

export const loadCatsVersion   = ()  => readString(KEYS.CAT_VERSION, "");
export const saveCatsVersion   = (v) => writeString(KEYS.CAT_VERSION, v);

export const loadUserName      = ()  => readString(KEYS.USER_NAME, "");
export const saveUserName      = (v) => writeString(KEYS.USER_NAME, v);

export const loadLearnedRules  = ()  => readJson(KEYS.LEARNED_RULES, []);
export const saveLearnedRules  = (v) => writeJson(KEYS.LEARNED_RULES, v);
