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
} from "./storage.js";

import { CAT_DEFAULTS_VERSION, DEFAULT_CATS_BY_TYPE, getDefaultCatsByType } from "../domain/categories.js";
import { DEFAULT_EUR_TO_CNY } from "../domain/currency.js";

// ── 默认值 ──────────────────────────────────────────────────────────────────

/** 默认 settings —— 用户首次启动时的初始配置。新增字段必须给默认值。 */
const DEFAULT_SETTINGS = Object.freeze({
  defaultCurrency: "EUR",   // 一句话/手动记账时的默认币种（落库用）
  displayCurrency: "EUR",   // Hero 顶部数字显示币种（独立于 defaultCurrency，可在 hero 顶部按钮切换）
  eurToCny: DEFAULT_EUR_TO_CNY,
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
    savings: [],
  },
  userName:               DEFAULT_USER_NAME,
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

  const savedSettings = loadSettings();
  state.settings = savedSettings
    ? { ...DEFAULT_SETTINGS, ...savedSettings, customColors: { ...(savedSettings.customColors || {}) } }
    : { ...DEFAULT_SETTINGS };

  const savedName = loadUserName();
  state.userName = savedName || DEFAULT_USER_NAME;

  hydrateCustomCategories();

  // 广播一次 —— UI 订阅者借此完成首屏渲染
  emit("txs:changed",         state.txs);
  emit("settings:changed",    state.settings);
  emit("budgets:changed",     state.budgets);
  emit("goals:changed",       state.goals);
  emit("deletedSugs:changed", state.deletedSugs);
  emit("cats:changed",        state.customCategoriesByType);
  emit("userName:changed",    state.userName);
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
      savings: getDefaultCatsByType("savings"),
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
      savings: Array.isArray(saved.savings) && saved.savings.length ? saved.savings : getDefaultCatsByType("savings"),
    };
  } else {
    state.customCategoriesByType = {
      expense: getDefaultCatsByType("expense"),
      income:  getDefaultCatsByType("income"),
      savings: getDefaultCatsByType("savings"),
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

// ── 写入（自动 persist + emit） ─────────────────────────────────────────────

function setTxs(next) {
  state.txs = next;
  persistTxs(next);
  emit("txs:changed", next);
}

function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
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

  // setters
  setTxs,
  setSettings,
  setBudgets,
  setGoals,
  setDeletedSugs,
  setCustomCategoriesByType,
  setUserName,
});

/** 为方便测试/调试导出原始默认值。 */
export { DEFAULT_SETTINGS, DEFAULT_USER_NAME };
