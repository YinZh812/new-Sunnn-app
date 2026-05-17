// state/store.js —— 全局可观察状态
//
// 这是整个应用的唯一可变状态来源。其他层通过 get/set 与订阅事件协作：
//
//   import { store } from "./state/store.js";
//   store.hydrate();                       // 启动时从 localStorage 灌注
//   store.on("txs:changed", () => render()); // 订阅变化
//   store.setTxs(next);                    // 写入 → 自动持久化 + 广播
//
// 设计要点：
// - set 系列方法负责"写入 → 持久化 → 广播"三件事的原子绑定
// - 订阅者只能通过 emit 收到通知；不能反向直接读 localStorage
// - sync 层会订阅 *:changed 事件并把变化推到 Supabase
// - hydrate() 触发 *:changed 一次，让 UI 在启动时也走"订阅 → re-render"路径

import {
  loadTxs, saveTxs as persistTxs,
  loadSettings, saveSettings as persistSettings,
  loadBudgets, saveBudgets as persistBudgets,
  loadGoals, saveGoals as persistGoals,
  loadDeletedSugs, saveDeletedSugs as persistDeletedSugs,
  loadCatsByType, saveCatsByType as persistCatsByType,
  loadCatsVersion, saveCatsVersion as persistCatsVersion,
  loadUserName, saveUserName as persistUserName,
  loadLearnedRules, saveLearnedRules as persistLearnedRules,
} from "./storage.js";

import {
  CAT_DEFAULTS_VERSION, DEFAULT_CATS_BY_TYPE, getDefaultCatsByType,
  migrateLegacyTxCategoryNames, migrateSavingsToIncome,
} from "../domain/categories.js";
import { DEFAULT_EUR_TO_CNY } from "../domain/currency.js";
import {
  recordLearning, forgetLearning, clearLearning,
} from "../domain/learning.js";

// ── 默认值 ──────────────────────────────────────────────────────────────────

/** 默认 settings —— 用户首次启动时的初始配置。新增字段必须给默认值。 */
const DEFAULT_SETTINGS = Object.freeze({
  defaultCurrency: "EUR",   // 一句话/手动记账时的默认币种（落库用）
  displayCurrency: "EUR",   // Hero 顶部数字显示币种（独立于 defaultCurrency，可在 hero 顶部按钮切换）
  eurToCny: DEFAULT_EUR_TO_CNY,           // 保留兼容：== ratesToCny.EUR
  // v2 多币种（Task 2）：启用列表 + 各币种"1 单位 = N CNY"汇率。
  // 没改这两字段的老用户也能正常用——hydrate 时会从 eurToCny 合成 ratesToCny.EUR，
  // enabledCurrencies 缺省给 ["EUR","CNY"] 保持旧行为。
  enabledCurrencies: ["EUR", "CNY"],
  ratesToCny: {
    CNY: 1,
    EUR: DEFAULT_EUR_TO_CNY,
    USD: 7.2,
    GBP: 9.3,
    JPY: 0.047,
  },
  theme: "gray",
  accent: "",
  accentHue: null,
  customColors: {},
});

const DEFAULT_USER_NAME = "Sunnn";

// ── 内部状态 ────────────────────────────────────────────────────────────────

const state = {
  txs:                    [],
  settings:               { ...DEFAULT_SETTINGS },
  budgets:                {},
  goals:                  [],
  deletedSugs:            [],
  customCategoriesByType: {
    expense: [],
    income:  [],
  },
  userName:               DEFAULT_USER_NAME,
  learnedRules:           [],  // v2 阶段 6：个人学习的 phrase → category 规则
};

// ── 简易事件总线 ────────────────────────────────────────────────────────────

/** event → Set<handler> */
const listeners = new Map();

function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const h of set) {
    try { h(payload); }
    catch (err) { console.error(`[store] listener for "${event}" threw:`, err); }
  }
}

// ── 启动时灌注 ──────────────────────────────────────────────────────────────

/**
 * 从 localStorage 读取所有持久化字段。可在 main.js 启动时调一次。
 * 灌注后会按字段广播 *:changed，让所有订阅者自然 re-render。
 */
function hydrate() {
  state.txs         = loadTxs() ?? [];
  state.budgets     = loadBudgets() ?? {};
  state.goals       = loadGoals() ?? [];
  state.deletedSugs = loadDeletedSugs() ?? [];

  // 2026-05-14 v3：一次性把已存 tx 的 category 从旧名（吃/买/车）改成新名（餐饮/购物/交通）。
  // 用 localStorage flag 兜底防止重跑。Supabase 同步会自然把新名推上云，多设备各自一次性迁移即可。
  const MIGRATION_FLAG = "txCategoryRenamedV3";
  try {
    if (localStorage.getItem(MIGRATION_FLAG) !== "1") {
      const { changed, txs } = migrateLegacyTxCategoryNames(state.txs);
      if (changed) {
        state.txs = txs;
        persistTxs(state.txs);
      }
      localStorage.setItem(MIGRATION_FLAG, "1");
    }
  } catch (err) {
    console.warn("[store] tx category rename v3 migration failed:", err);
  }

  // v5 迁移：type:"savings" → type:"income"
  const SAVINGS_MIGRATION_FLAG = "txSavingsToIncomeV5";
  try {
    if (localStorage.getItem(SAVINGS_MIGRATION_FLAG) !== "1") {
      const { changed, txs } = migrateSavingsToIncome(state.txs);
      if (changed) {
        state.txs = txs;
        persistTxs(state.txs);
      }
      localStorage.setItem(SAVINGS_MIGRATION_FLAG, "1");
    }
  } catch (err) {
    console.warn("[store] savings→income v5 migration failed:", err);
  }

  const savedSettings = loadSettings();
  state.settings = savedSettings
    ? { ...DEFAULT_SETTINGS, ...savedSettings, customColors: { ...(savedSettings.customColors || {}) } }
    : { ...DEFAULT_SETTINGS };

  // v2 多币种迁移：保证 enabledCurrencies / ratesToCny 都存在，并把老的 eurToCny 同步进 ratesToCny.EUR
  if (!Array.isArray(state.settings.enabledCurrencies) || state.settings.enabledCurrencies.length === 0) {
    state.settings.enabledCurrencies = ["EUR", "CNY"];
  }
  if (!state.settings.ratesToCny || typeof state.settings.ratesToCny !== "object") {
    state.settings.ratesToCny = { ...DEFAULT_SETTINGS.ratesToCny };
  }
  // 老 eurToCny 优先：如果用户在旧 UI 改过汇率，保留它
  if (Number.isFinite(Number(state.settings.eurToCny)) && Number(state.settings.eurToCny) > 0) {
    state.settings.ratesToCny.EUR = Number(state.settings.eurToCny);
  } else {
    state.settings.eurToCny = state.settings.ratesToCny.EUR;
  }
  // CNY 永远 = 1（base）
  state.settings.ratesToCny.CNY = 1;

  const savedName = loadUserName();
  state.userName = savedName || DEFAULT_USER_NAME;

  // 学习规则
  const loadedRules = loadLearnedRules();
  state.learnedRules = Array.isArray(loadedRules) ? loadedRules : [];

  hydrateCustomCategories();

  // 广播一次 —— UI 订阅者借此完成首屏渲染
  emit("txs:changed",         state.txs);
  emit("settings:changed",    state.settings);
  emit("budgets:changed",     state.budgets);
  emit("goals:changed",       state.goals);
  emit("deletedSugs:changed", state.deletedSugs);
  emit("cats:changed",        state.customCategoriesByType);
  emit("userName:changed",    state.userName);
  emit("learnedRules:changed", state.learnedRules);
  emit("hydrated",            null);
}

/**
 * 自定义类别灌注 —— 包含版本迁移逻辑：
 * 当 CAT_DEFAULTS_VERSION 与本地存档不一致时，强制重置为新默认。
 */
function hydrateCustomCategories() {
  const savedVersion = loadCatsVersion();
  if (savedVersion !== CAT_DEFAULTS_VERSION) {
    state.customCategoriesByType = {
      expense: getDefaultCatsByType("expense"),
      income:  getDefaultCatsByType("income"),
    };
    persistCatsByType(state.customCategoriesByType);
    persistCatsVersion(CAT_DEFAULTS_VERSION);
    return;
  }
  const saved = loadCatsByType();
  if (saved && typeof saved === "object") {
    state.customCategoriesByType = {
      expense: Array.isArray(saved.expense) && saved.expense.length ? saved.expense : getDefaultCatsByType("expense"),
      income:  Array.isArray(saved.income)  && saved.income.length  ? saved.income  : getDefaultCatsByType("income"),
    };
  } else {
    state.customCategoriesByType = {
      expense: getDefaultCatsByType("expense"),
      income:  getDefaultCatsByType("income"),
    };
  }
}

// ── 读取（不可变快照） ──────────────────────────────────────────────────────

const getTxs                    = () => state.txs;
const getSettings               = () => state.settings;
const getBudgets                = () => state.budgets;
const getGoals                  = () => state.goals;
const getDeletedSugs            = () => state.deletedSugs;
const getCustomCategoriesByType = () => state.customCategoriesByType;
const getUserName               = () => state.userName;
const getLearnedRules           = () => state.learnedRules;

// ── 写入（自动 persist + emit） ─────────────────────────────────────────────

function setTxs(next) {
  state.txs = next;
  persistTxs(next);
  emit("txs:changed", next);
}

function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  // 多币种：让 settings.eurToCny 与 ratesToCny.EUR 保持同步（双向写）
  if (patch && Object.prototype.hasOwnProperty.call(patch, "eurToCny")) {
    if (!state.settings.ratesToCny) state.settings.ratesToCny = {};
    state.settings.ratesToCny = { ...state.settings.ratesToCny, EUR: Number(patch.eurToCny) || 0 };
  }
  if (patch && patch.ratesToCny && patch.ratesToCny.EUR != null) {
    state.settings.eurToCny = Number(patch.ratesToCny.EUR) || 0;
  }
  // CNY 永远等于 1，强制纠正
  if (state.settings.ratesToCny) state.settings.ratesToCny.CNY = 1;
  persistSettings(state.settings);
  emit("settings:changed", state.settings);
}

function setBudgets(next) {
  state.budgets = next;
  persistBudgets(next);
  emit("budgets:changed", next);
}

function setGoals(next) {
  state.goals = next;
  persistGoals(next);
  emit("goals:changed", next);
}

function setDeletedSugs(next) {
  state.deletedSugs = next;
  persistDeletedSugs(next);
  emit("deletedSugs:changed", next);
}

function setCustomCategoriesByType(next) {
  state.customCategoriesByType = next;
  persistCatsByType(next);
  emit("cats:changed", next);
}

function setUserName(name) {
  state.userName = name || DEFAULT_USER_NAME;
  persistUserName(state.userName);
  emit("userName:changed", state.userName);
}

/** 直接写入整个 learnedRules 数组（用于 UI 删除单条/批量清空场景）。 */
function setLearnedRules(next) {
  state.learnedRules = Array.isArray(next) ? next : [];
  persistLearnedRules(state.learnedRules);
  emit("learnedRules:changed", state.learnedRules);
}

/** 记一条学习（确认弹窗里改类别时触发）。短词或同名同 type 会自动去重 / 覆盖。 */
function addLearnedRule(phrase, type, category) {
  setLearnedRules(recordLearning(state.learnedRules, phrase, type, category));
}

/** 删除一条（phrase + type 复合键）。 */
function removeLearnedRule(phrase, type) {
  setLearnedRules(forgetLearning(state.learnedRules, phrase, type));
}

/** 清空所有学习规则。 */
function clearLearnedRules() {
  setLearnedRules(clearLearning());
}

// ── 导出 ────────────────────────────────────────────────────────────────────

/** 全局唯一 store。其他模块都通过这个对象交互。 */
export const store = Object.freeze({
  // lifecycle
  hydrate,

  // events
  on, off, emit,

  // getters
  getTxs,
  getSettings,
  getBudgets,
  getGoals,
  getDeletedSugs,
  getCustomCategoriesByType,
  getUserName,
  getLearnedRules,

  // setters
  setTxs,
  setSettings,
  setBudgets,
  setGoals,
  setDeletedSugs,
  setCustomCategoriesByType,
  setUserName,
  setLearnedRules,
  addLearnedRule,
  removeLearnedRule,
  clearLearnedRules,
});

/** 为方便测试/调试导出原始默认值。 */
export { DEFAULT_SETTINGS, DEFAULT_USER_NAME };
