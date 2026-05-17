// state/sync.js —— Supabase 云同步层
//
// 职责：
//   - 监听 store 的 *:changed 事件 → 防抖推送云端
//   - 监听 auth.onAuthChange → 登录后 pull-then-push
//   - 暴露同步状态（'idle'|'syncing'|'synced'|'error'）给 UI 订阅
//
// 不做：
//   - 直接操作 DOM（同步状态变化通过 onSyncStatus 回调通知）
//   - 直接读 localStorage（数据来自 store）
//
// 冲突合并策略：last-write-wins。每条交易带 id + updatedAt 时间戳，
// 同 id 取较大 updatedAt。新本地交易在落库前会自动补 id/updatedAt。

import { store } from "./store.js";
import { getClient, getCurrentUser, onAuthChange } from "./auth.js";

const PUSH_DEBOUNCE_MS = 1500;
const TXS_BATCH_SIZE = 200;

let _pushTimer = null;
let _isSyncing = false;
let _hasInitialPull = false;

// 本地删除追踪：记住被删除的 tx id，push 时标记 deleted=true
const _pendingDeleteIds = new Set();
let _prevTxIds = new Set();

const _statusListeners = new Set();
let _currentStatus = "idle"; // 'idle' | 'syncing' | 'synced' | 'error'

// ── 状态广播 ─────────────────────────────────────────────────────────────────

function _setStatus(status) {
  if (status === _currentStatus) return;
  _currentStatus = status;
  for (const h of _statusListeners) {
    try { h(status); }
    catch (err) { console.error("[sync] status listener threw:", err); }
  }
}

/**
 * 订阅同步状态变化。
 * @param {(status: 'idle'|'syncing'|'synced'|'error') => void} handler
 * @returns {() => void} 卸载函数
 */
export function onSyncStatus(handler) {
  _statusListeners.add(handler);
  try { handler(_currentStatus); } catch (err) { console.error(err); }
  return () => _statusListeners.delete(handler);
}

export function getSyncStatus() {
  return _currentStatus;
}

// ── 数据增强：保证每条 tx 有 id + updatedAt ─────────────────────────────────

function _ensureTxIds(txs) {
  let changed = false;
  const enhanced = txs.map((t) => {
    const next = { ...t };
    if (!next.id) {
      next.id = `${next.ts}_${Math.random().toString(36).slice(2, 7)}`;
      changed = true;
    }
    if (!next.updatedAt) {
      next.updatedAt = next.ts || Date.now();
      changed = true;
    }
    return next;
  });
  return { txs: enhanced, changed };
}

// ── 本地删除检测 ────────────────────────────────────────────────────────────

/**
 * 对比前后 tx ID 集合，把消失的 id 加入 _pendingDeleteIds。
 * 在 cloudPull 合并期间跳过检测（_isSyncing=true），避免把云端未拉到的 tx 误判为删除。
 */
function _detectDeletedTxs() {
  if (_isSyncing) return;
  const currentIds = new Set(store.getTxs().map((t) => t.id).filter(Boolean));
  for (const id of _prevTxIds) {
    if (!currentIds.has(id)) _pendingDeleteIds.add(id);
  }
  _prevTxIds = currentIds;
}

/** cloudPull 结束后刷新 _prevTxIds 快照（不做 diff）。 */
function _snapshotTxIds() {
  _prevTxIds = new Set(store.getTxs().map((t) => t.id).filter(Boolean));
}

// ── 拉取 ─────────────────────────────────────────────────────────────────────

/**
 * 从云端拉取：交易（last-write-wins 合并）+ 用户设置（直接覆盖）。
 * 拉取后会写回 store 并广播 *:changed，UI 自动 re-render。
 * 必须在登录态下调用。
 */
export async function cloudPull() {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) return;

  _isSyncing = true;
  _setStatus("syncing");

  try {
    // 交易
    const rTx = await client
      .from("transactions")
      .select("id,data,updated_at,deleted")
      .eq("user_id", user.id);
    if (rTx.error) throw rTx.error;

    const cloudTxs = (rTx.data || [])
      .filter((r) => !r.deleted)
      .map((r) => {
        const d = r.data || {};
        d.id = r.id;
        d.updatedAt = new Date(r.updated_at).getTime();
        return d;
      });

    // 与本地按 id 合并：last-write-wins（排除本地待删除的 tx）
    const { txs: localTxsWithIds } = _ensureTxIds(store.getTxs());
    const byId = {};
    for (const t of localTxsWithIds) byId[t.id] = t;
    for (const c of cloudTxs) {
      if (_pendingDeleteIds.has(c.id)) continue;
      const local = byId[c.id];
      if (!local || (c.updatedAt || 0) >= (local.updatedAt || 0)) {
        byId[c.id] = c;
      }
    }
    const merged = Object.values(byId).sort((a, b) => b.ts - a.ts);
    store.setTxs(merged);  // 触发 txs:changed → UI re-render
    _snapshotTxIds();       // 刷新快照，避免 merge 写回触发误删检测

    // 用户设置
    const rSet = await client
      .from("user_settings")
      .select("settings,budgets,goals,custom_categories,deleted_sugs,learned_rules,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (rSet.error) throw rSet.error;

    if (rSet.data) {
      const d = rSet.data;
      if (d.settings) store.setSettings(d.settings);
      if (d.budgets) store.setBudgets(d.budgets);
      if (d.goals) store.setGoals(d.goals);
      if (d.custom_categories) store.setCustomCategoriesByType(d.custom_categories);
      if (d.deleted_sugs) store.setDeletedSugs(d.deleted_sugs);
      if (d.learned_rules) store.setLearnedRules(d.learned_rules);
    }

    _hasInitialPull = true;
    _setStatus("synced");
  } catch (err) {
    _setStatus("error");
    console.warn("[sync] cloudPull error:", err);
    throw err;
  } finally {
    _isSyncing = false;
  }
}

// ── 推送 ─────────────────────────────────────────────────────────────────────

/**
 * 把本地 store 推到云端。
 * @param {boolean} [forceAll=false]  true 时即使正在同步也强制执行（一般不需要）
 */
export async function cloudPush(forceAll = false) {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) return;
  if (_isSyncing && !forceAll) return;

  _isSyncing = true;
  _setStatus("syncing");

  try {
    // 1. 保证每条 tx 有 id + updatedAt（必要时回写到 store）
    const { txs, changed } = _ensureTxIds(store.getTxs());
    if (changed) store.setTxs(txs);

    // 2. 推交易（分批 upsert）
    if (txs.length) {
      const payload = txs.map((t) => ({
        user_id: user.id,
        id: String(t.id),
        data: t,
        updated_at: new Date(t.updatedAt || t.ts || Date.now()).toISOString(),
        deleted: false,
      }));
      for (let i = 0; i < payload.length; i += TXS_BATCH_SIZE) {
        const slice = payload.slice(i, i + TXS_BATCH_SIZE);
        const r = await client.from("transactions").upsert(slice, { onConflict: "user_id,id" });
        if (r.error) throw r.error;
      }
    }

    // 2b. 把本地删除的 tx 在云端标记 deleted=true
    if (_pendingDeleteIds.size) {
      const delPayload = [..._pendingDeleteIds].map((id) => ({
        user_id: user.id,
        id: String(id),
        data: {},
        updated_at: new Date().toISOString(),
        deleted: true,
      }));
      for (let i = 0; i < delPayload.length; i += TXS_BATCH_SIZE) {
        const slice = delPayload.slice(i, i + TXS_BATCH_SIZE);
        const r = await client.from("transactions").upsert(slice, { onConflict: "user_id,id" });
        if (r.error) throw r.error;
      }
      _pendingDeleteIds.clear();
    }

    // 3. 推用户设置（单行 upsert）
    const setRow = {
      user_id: user.id,
      settings: store.getSettings(),
      budgets: store.getBudgets(),
      goals: store.getGoals(),
      custom_categories: store.getCustomCategoriesByType(),
      deleted_sugs: store.getDeletedSugs(),
      learned_rules: store.getLearnedRules(),
      updated_at: new Date().toISOString(),
    };
    const rs = await client.from("user_settings").upsert(setRow, { onConflict: "user_id" });
    if (rs.error) throw rs.error;

    _setStatus("synced");
  } catch (err) {
    _setStatus("error");
    console.warn("[sync] cloudPush error:", err);
    throw err;
  } finally {
    _isSyncing = false;
  }
}

/** 防抖推送：1.5 秒内连续触发只执行最后一次。 */
export function cloudPushDebounced() {
  if (!getCurrentUser() || !getClient()) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _setStatus("syncing");
  _pushTimer = setTimeout(() => {
    cloudPush().catch((e) => console.warn("[sync] debounced push failed:", e));
  }, PUSH_DEBOUNCE_MS);
}

/** 手动触发完整同步（先 pull 再 push）。UI 设置页"同步"按钮用。 */
export async function manualSync() {
  if (!getCurrentUser()) throw new Error("请先登录");
  await cloudPull();
  await cloudPush();
}

// ── 订阅 store + auth：自动同步 ──────────────────────────────────────────────

/**
 * 在 main.js 启动序列里调一次：
 *   1. 监听 store 的所有数据变化 → 防抖推云
 *   2. 监听 auth.onAuthChange → 登录时拉云端，注销时复位
 */
export function attachSync() {
  // ⓪ 初始化 tx ID 快照（hydrate 后的基线）
  _snapshotTxIds();

  // ① store 变化 → 推云端
  store.on("txs:changed", () => {
    _detectDeletedTxs();
    cloudPushDebounced();
  });
  const otherEvents = [
    "settings:changed",
    "budgets:changed",
    "goals:changed",
    "deletedSugs:changed",
    "cats:changed",
    "learnedRules:changed",
  ];
  for (const evt of otherEvents) {
    store.on(evt, () => cloudPushDebounced());
  }

  // ② 登录态变化 → 初次同步 / 复位
  onAuthChange(async (user) => {
    if (user) {
      try {
        await cloudPull();
        await cloudPush();
      } catch (err) {
        console.warn("[sync] initial sync after login failed:", err);
      }
    } else {
      _hasInitialPull = false;
      _setStatus("idle");
    }
  });
}
