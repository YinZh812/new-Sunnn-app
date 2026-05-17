// ui/modals/auth.js —— 账号登录弹窗（#ov-auth）
//
// 此模块只管 UI（输入框、错误展示、模式切换）；业务调用走 state/auth.js。
//
// 三种模式：
//   - "signed-out"：邮箱密码登录 / Google OAuth / 注册 / 忘记密码入口
//   - "signed-in"：显示当前邮箱 + 同步状态 + 注销按钮
//   - "reset"：从邮箱链接回跳后设置新密码

import { byId } from "../../utils/dom.js";
import { openOverlay, closeOverlay } from "../components/overlay.js";
import {
  signUp, signIn, signInWithGoogle, signOut,
  sendPasswordResetEmail, updatePassword,
  getCurrentUser, isSupabaseReady, onAuthChange,
} from "../../state/auth.js";
import { manualSync, onSyncStatus } from "../../state/sync.js";
import { store } from "../../state/store.js";

const OVERLAY_ID = "ov-auth";

let _toastFn = (msg) => console.log("[toast]", msg);

// 同步状态 → 中文文案
const SYNC_STATUS_LABEL = {
  idle:    "空闲",
  syncing: "进行中…",
  synced:  "已同步",
  error:   "失败",
};

export function init(deps = {}) {
  if (deps.toast) _toastFn = deps.toast;

  // 顶部账号按钮订阅 auth 变化 → 更新文本
  onAuthChange((user) => {
    const btn = byId("accountToggleBtn");
    const lbl = byId("account-toggle-lbl");
    if (!btn || !lbl) return;
    if (user) {
      btn.classList.add("signed-in");
      lbl.textContent = String(user.email || "已登录").split("@")[0];
    } else {
      btn.classList.remove("signed-in");
      lbl.textContent = "未登录";
    }
  });

  // 同步状态变化 → 已登录态卡片里的"同步状态"文字实时刷新
  onSyncStatus((status) => {
    const el = byId("auth-sync-status");
    if (!el) return;
    el.textContent = "同步状态：" + (SYNC_STATUS_LABEL[status] || status);
  });

  // 弹窗内按钮的 onclick 通过 index.html 的 inline `onclick="doSignIn()"` +
  // main.js 里 `window.doSignIn = authModal.doSignIn` 的桥接完成，本模块不再手动绑定。
}

/**
 * @param {Object} [opts]
 * @param {"signed-out"|"signed-in"|"reset"} [opts.mode]
 */
export function open(opts = {}) {
  if (!isSupabaseReady()) {
    _toastFn("云端连接异常，请检查网络或稍后重试");
  }
  const mode = opts.mode || (getCurrentUser() ? "signed-in" : "signed-out");

  byId("auth-err")?.style?.setProperty("display", "none");
  byId("auth-err-reset")?.style?.setProperty("display", "none");
  byId("auth-signed-out").style.display = mode === "signed-out" ? "block" : "none";
  byId("auth-signed-in").style.display  = mode === "signed-in"  ? "block" : "none";
  byId("auth-reset").style.display      = mode === "reset"      ? "block" : "none";

  const titles = { "signed-out": "登录账号", "signed-in": "账号", "reset": "重置密码" };
  byId("auth-title").textContent = titles[mode] || "账号";

  const u = getCurrentUser();
  if (mode === "signed-in" && u) {
    byId("auth-current-email").textContent = u.email || "(未知邮箱)";
  }

  openOverlay(OVERLAY_ID);
}

export function close() {
  closeOverlay(OVERLAY_ID);
}

// ── 表单读取 / 错误显示 ─────────────────────────────────────────────────────

function showErr(msg) {
  const e = byId("auth-err");
  if (!e) return;
  e.textContent = msg;
  e.style.display = "block";
}

function readInputs() {
  const email = (byId("auth-email")?.value || "").trim();
  const pw    = (byId("auth-password")?.value || "").trim();
  if (!email || !pw)   { showErr("请填写邮箱和密码"); return null; }
  if (pw.length < 6)    { showErr("密码至少 6 位");    return null; }
  return { email, password: pw };
}

// ── 业务动作（调 state/auth） ────────────────────────────────────────────────

export async function doSignUp() {
  const c = readInputs(); if (!c) return;
  byId("btn-signup").textContent = "注册中…";
  try {
    const { needEmailConfirm } = await signUp(c.email, c.password);
    if (needEmailConfirm) showErr("注册成功，请查收邮件点确认链接后再登录");
    else { _toastFn("注册成功，已自动登录"); close(); }
  } catch (e) { showErr(e.message || "注册失败"); }
  finally { byId("btn-signup").textContent = "注册"; }
}

export async function doSignIn() {
  const c = readInputs(); if (!c) return;
  byId("btn-signin").textContent = "登录中…";
  try {
    await signIn(c.email, c.password);
    _toastFn("登录成功，正在同步云端数据…");
    close();
  } catch (e) { showErr(e.message || "登录失败"); }
  finally { byId("btn-signin").textContent = "登录"; }
}

export async function doSignInWithGoogle() {
  try { await signInWithGoogle(); }
  catch (e) { showErr(e.message || "Google 登录失败"); }
}

export async function doSignOut() {
  // 询问是否同时清除本地账本数据
  //   确定 → 退出 + 清本地（共享设备友好）
  //   取消 → 仅退出 session，本地数据保留（下次登录会与云端合并）
  const clearLocal = window.confirm(
    "是否同时清除本设备上的本地账本数据？\n\n" +
    "• 确定：清空本地（适合共享设备）\n" +
    "• 取消：仅退出登录，下次登录后会与云端数据合并"
  );

  try { await signOut(); } catch {}

  if (clearLocal) {
    // 重置数据层（保留 settings 中的主题等纯偏好）
    store.setTxs([]);
    store.setBudgets({});
    store.setGoals([]);
    store.setDeletedSugs([]);
    store.clearLearnedRules();
    // 自定义类别也清，回到默认
    store.setCustomCategoriesByType({});
    _toastFn("已退出登录，本地数据已清除");
  } else {
    _toastFn("已退出登录");
  }

  close();
}

export async function doForgotPassword() {
  const pre = (byId("auth-email")?.value || "").trim();
  const email = prompt("输入注册邮箱，将向你发送密码重置邮件：", pre);
  if (!email) return;
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email.trim())) {
    _toastFn("邮箱格式不对");
    return;
  }
  try {
    await sendPasswordResetEmail(email.trim());
    _toastFn("✓ 密码重置邮件已发送，请查收");
  } catch (e) { showErr(e.message || "发送失败"); }
}

export async function doUpdatePassword() {
  const p1 = (byId("auth-new-password")?.value  || "").trim();
  const p2 = (byId("auth-new-password2")?.value || "").trim();
  const er = byId("auth-err-reset");
  const showResetErr = (m) => { if (er) { er.textContent = m; er.style.display = "block"; } };

  if (!p1 || p1.length < 6) return showResetErr("密码至少 6 位");
  if (p1 !== p2)            return showResetErr("两次输入不一致");
  if (er) er.style.display = "none";

  byId("btn-update-pw").textContent = "更新中…";
  try {
    await updatePassword(p1);
    _toastFn("✓ 密码已更新，已自动登录");
    close();
    try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  } catch (e) { showResetErr(e.message || "更新失败"); }
  finally { byId("btn-update-pw").textContent = "更新密码"; }
}

export async function doManualSync() {
  if (!getCurrentUser()) return _toastFn("请先登录");
  const st = byId("auth-sync-status");
  if (st) st.textContent = "同步状态：进行中…";
  try {
    await manualSync();
    if (st) st.textContent = "同步状态：已完成 " + new Date().toLocaleTimeString();
    _toastFn("同步完成 ✓");
  } catch (e) {
    if (st) st.textContent = "同步状态：失败 — " + (e.message || e);
    _toastFn("同步失败：" + (e.message || e));
  }
}
