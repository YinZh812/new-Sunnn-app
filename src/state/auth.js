// state/auth.js —— Supabase 账号管理
//
// 这一层封装：
//   - 懒加载 Supabase client（CDN 上的 SDK 脚本必须先于此模块加载）
//   - signUp / signIn / signOut / Google OAuth / 密码重置
//   - 启动时 restoreSession()：处理 URL hash 回跳 + getSession + auth state change 订阅
//
// 不做：UI 操作（DOM 写入由 ui/modals/auth.js 订阅事件后执行）
// 不做：业务数据同步（那是 sync.js 的事，sync.js 订阅本模块的 auth:change）
//
// SUPABASE_URL / SUPABASE_ANON_KEY 是 anon 公开 key，可以安全嵌在前端代码里——
// 行级安全（RLS）由 Supabase 后台策略保护，参考根目录 SUPABASE_SETUP.md。

const SUPABASE_URL = "https://bsmwrjigxmhqcgspulyr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbXdyamlneG1ocWNnc3B1bHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Mjg5MjcsImV4cCI6MjA5MzAwNDkyN30.fZM5Qa529Rw7-ahdzIT-IPEmCqGaBy40xVhfmW0j48Q";

let _client = null;
let _currentUser = null;
const _listeners = new Set();

// ── 客户端懒加载 ─────────────────────────────────────────────────────────────

/**
 * 是否能用云功能（SDK 已加载 + URL/Key 配置齐全）。第一次调用会懒创建 client。
 * @returns {boolean}
 */
export function isSupabaseReady() {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (!_client) {
    try {
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    } catch (err) {
      console.warn("[auth] Supabase init failed:", err);
      return false;
    }
  }
  return true;
}

/** 取底层 client（sync.js 需要）。未就绪时返回 null。 */
export function getClient() {
  return isSupabaseReady() ? _client : null;
}

/** 当前登录用户对象（含 .id, .email），未登录时返回 null。 */
export function getCurrentUser() {
  return _currentUser;
}

// ── 事件订阅 ─────────────────────────────────────────────────────────────────

/**
 * 订阅登录状态变化。
 * @param {(user: object|null) => void} handler  null=已注销
 * @returns {() => void} 卸载函数
 */
export function onAuthChange(handler) {
  _listeners.add(handler);
  // 立即同步一次当前态，避免订阅者起步状态不一致
  try { handler(_currentUser); } catch (err) { console.error("[auth] listener init threw:", err); }
  return () => _listeners.delete(handler);
}

function _emitAuthChange(user) {
  _currentUser = user || null;
  for (const h of _listeners) {
    try { h(_currentUser); }
    catch (err) { console.error("[auth] listener threw:", err); }
  }
}

// ── 密码登录注册 ─────────────────────────────────────────────────────────────

/**
 * 邮箱密码注册。
 * @returns {Promise<{user: object|null, needEmailConfirm: boolean}>}
 */
export async function signUp(email, password) {
  const c = getClient();
  if (!c) throw new Error("Supabase 未配置");
  const r = await c.auth.signUp({
    email, password,
    options: { emailRedirectTo: getRedirectUrl() },
  });
  if (r.error) throw r.error;
  // session 在 → 自动登录；session 不在 → 需要邮箱验证
  if (r.data?.session && r.data?.user) {
    _emitAuthChange(r.data.user);
    return { user: r.data.user, needEmailConfirm: false };
  }
  if (r.data?.user) {
    return { user: r.data.user, needEmailConfirm: true };
  }
  throw new Error("注册返回数据为空");
}

/** 邮箱密码登录。 */
export async function signIn(email, password) {
  const c = getClient();
  if (!c) throw new Error("Supabase 未配置");
  const r = await c.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  _emitAuthChange(r.data.user);
  return r.data.user;
}

/** Google OAuth 登录。会触发跳转到 Google 页面。 */
export async function signInWithGoogle() {
  const c = getClient();
  if (!c) throw new Error("Supabase 未配置");
  const r = await c.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: getRedirectUrl() },
  });
  if (r.error) throw r.error;
  // OAuth 跳转后回到 app 时由 restoreSession 接管
}

/** 注销登录。 */
export async function signOut() {
  const c = getClient();
  if (!c) return;
  try { await c.auth.signOut(); }
  catch (err) { console.warn("[auth] signOut failed:", err); }
  _emitAuthChange(null);
}

/** 发送密码重置邮件。 */
export async function sendPasswordResetEmail(email) {
  const c = getClient();
  if (!c) throw new Error("Supabase 未配置");
  const r = await c.auth.resetPasswordForEmail(email, {
    redirectTo: getRedirectUrl(),
  });
  if (r.error) throw r.error;
}

/** 在重置密码模式下设置新密码。SDK 已经把 access_token 写进 session。 */
export async function updatePassword(newPassword) {
  const c = getClient();
  if (!c) throw new Error("Supabase 未配置");
  const r = await c.auth.updateUser({ password: newPassword });
  if (r.error) throw r.error;
  if (r.data?.user) _emitAuthChange(r.data.user);
  return r.data?.user;
}

// ── URL hash 回跳处理 ────────────────────────────────────────────────────────

/** OAuth/邮箱链接 redirectTo 用的 URL（不含 hash）。 */
function getRedirectUrl() {
  return location.origin + location.pathname;
}

/**
 * 解析 #access_token=...&type=... 这类回跳 hash。
 * 无回跳信息返回 null；解析后返回 { type, error, error_description, ... }。
 */
function parseAuthHash() {
  const h = location.hash || "";
  if (!h.includes("access_token") && !h.includes("error")) return null;
  const raw = h.replace(/^#/, "");
  const p = {};
  for (const kv of raw.split("&")) {
    const i = kv.indexOf("=");
    if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
  }
  return p;
}

/** 清掉 URL hash（避免刷新重复触发）。 */
function clearAuthHash() {
  try { history.replaceState(null, "", location.pathname + location.search); }
  catch { /* 静默忽略 */ }
}

// ── 启动时恢复 session ───────────────────────────────────────────────────────

/**
 * 应用启动时调用：
 *   1. 处理 URL hash 上的注册确认 / 密码重置 / OAuth 回跳
 *   2. 取已有 session（cookie/localStorage 持久化）→ emit auth:change
 *   3. 订阅 SDK 自身的 onAuthStateChange（其他设备退出、token 刷新等）
 *
 * @returns {Promise<{ user: object|null, hashType: string|null, hashError: string|null }>}
 *   hashType 可能值："recovery" / "signup" / "magiclink" / null
 */
export async function restoreSession() {
  if (!isSupabaseReady()) {
    return { user: null, hashType: null, hashError: null };
  }

  const hash = parseAuthHash();
  let hashType = null;
  let hashError = null;

  if (hash) {
    if (hash.error) {
      hashError = hash.error_description || hash.error;
      clearAuthHash();
    } else {
      hashType = hash.type || null;
    }
  }

  let user = null;
  try {
    const r = await _client.auth.getSession();
    if (r?.data?.session?.user) {
      user = r.data.session.user;
      _emitAuthChange(user);
      // 邮箱链接 / OAuth 成功回跳后清 hash
      if (hashType === "signup" || hashType === "magiclink") clearAuthHash();
    }
  } catch (err) {
    console.warn("[auth] session restore error:", err);
  }

  // 订阅 SDK 内部状态变化（其他端注销、token 刷新）
  try {
    _client.auth.onAuthStateChange((_evt, session) => {
      _emitAuthChange(session?.user || null);
    });
  } catch { /* 静默忽略 */ }

  return { user, hashType, hashError };
}
