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
import { manualSync } from "../../state/sync.js";

const OVERLAY_ID = "ov-auth";

let _toastFn = (msg) => console.log("[toast]", msg);

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

  // TODO: 绑定弹窗内的 button onClick 到本模块的 doSignIn / doSignUp / doSignOut 等
}

/**
 * @param {Object} [opts]
 * @param {"signed-out"|"signed-in"|"reset"} [opts.mode]
 */
export function open(opts = {}) {
  if (!isSupabaseReady()) {
    _toastFn("云端未配置，请先在源码顶部填入 Supabase URL 和 Key");
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
  try { await signOut(); } catch {}
  close();
  _toastFn("已退出登录");
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
