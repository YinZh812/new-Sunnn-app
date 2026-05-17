// ui/modals/detail.js —— 交易详情弹窗（#ov-detail）
//
// 职责：
//   - 展示 txs[idx] 完整字段（金额/备注/类别/类型/货币/时间）
//   - 行内编辑：类别网格、类型循环、货币切换
//   - "编辑" → 跳到 manual modal
//   - "删除" → 弹删除确认弹窗（#ov-delete-confirm）

import { byId } from "../../utils/dom.js";
import { openOverlay, closeOverlay, attachSheetSwipe } from "../components/overlay.js";
import { fxTap, fxOpen } from "../components/sfx.js";
import { store } from "../../state/store.js";
import { getCategoryIcon, DEFAULT_CATS_BY_TYPE } from "../../domain/categories.js";
import { SUPPORTED_CURRENCIES } from "../../domain/currency.js";
import { renderIcon } from "../../utils/icons.js";
import { formatTransactionFull } from "../../domain/dates.js";
import { escapeHtml, formatAmount, currencySymbol } from "../../utils/format.js";

// 货币代码 → "中文名 符号"（如 "欧元 €" / "人民币 ¥" / "美元 $"）
function curDisplay(code) {
  const ccy = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return ccy ? ccy.label + " " + ccy.symbol : (code || "");
}

const OVERLAY_ID = "ov-detail";
const SHEET_ID   = "sh-detail";
const HANDLE_ID  = "hdl-detail";

let detailIdx = -1;
let _manualModal = null;
let _toast = (msg) => { if (window.showToast) window.showToast(msg); };
let deleteConfirmIdx = -1;

const TYPE_LABELS = { expense: "支出", income: "收入", net_income: "支出但获得" };
function typeL(t) { return TYPE_LABELS[t] || "支出"; }

function getCatsByType(type) {
  const t = type || "expense";
  const custom = store.getCustomCategoriesByType();
  const arr = custom[t] || [];
  return arr.length ? arr : DEFAULT_CATS_BY_TYPE[t].slice();
}

function getCatIcon(name) {
  return getCategoryIcon(name, store.getCustomCategoriesByType(), { size: 22, strokeWidth: 1.6 });
}

function amtColor(t) {
  return t.type === "income" || t.type === "net_income" ? "#1A7A40" : "#CC2222";
}

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init({ manualModal, toast } = {}) {
  _manualModal = manualModal || null;
  if (toast) _toast = toast;
  attachSheetSwipe(SHEET_ID, HANDLE_ID, close);
  // 类别管理变化时：如果详情面板的类别网格当前正打开，重新渲染一遍刷新顺序。
  store.on("cats:changed", () => {
    const wrap = byId("dt-cat-grid-wrap");
    if (!wrap || wrap.style.display === "none") return;
    // 暂时隐藏 → 调 detailEditCat 让它走"未打开 → 打开"路径重新构建
    wrap.style.display = "none";
    detailEditCat();
  });
}

// ── 打开 / 关闭 ────────────────────────────────────────────────────────────

export function open(idx) {
  if (typeof window.resetListSwipeAll === "function") window.resetListSwipeAll();
  const txs = store.getTxs();
  if (idx < 0 || idx >= txs.length) return;
  detailIdx = idx;
  // 同步 inline 全局
  if (typeof window.detailIdx !== "undefined") window.detailIdx = idx;
  renderDetailBody();
  openOverlay(OVERLAY_ID);
}

export function close() {
  closeOverlay(OVERLAY_ID);
  detailIdx = -1;
}

// ── 渲染详情 ────────────────────────────────────────────────────────────────

export function renderDetailBody() {
  const txs = store.getTxs();
  const t = txs[detailIdx];
  if (!t) return;
  const body = byId("detailBody");
  if (!body) return;

  const ico = getCatIcon(t.category);
  const sg = t.type === "expense" ? "−" : "+";
  const sym = currencySymbol(t.currency);

  body.innerHTML =
    '<div style="font-size:34px;font-weight:700;text-align:center;letter-spacing:-2px;margin-bottom:14px;color:var(--t1)">' +
      sg + formatAmount(t.amount) + ' ' + sym +
    '</div>' +
    '<div class="scard">' +
      '<div class="srow"><span class="sk">备注</span><span class="sv2">' + escapeHtml(t.desc) + '</span></div>' +
      '<div class="srow srow-edit" onclick="detailEditCat()"><span class="sk">类别</span>' +
        '<span class="sv2" style="display:inline-flex;align-items:center;gap:6px">' +
          '<span class="dt-cat-ico">' + ico + '</span><span id="dt-cat-disp">' + escapeHtml(t.category) + '</span>' +
        '</span></div>' +
      '<div id="dt-cat-grid-wrap" style="display:none;background:var(--card);padding:10px 12px">' +
        // 齿轮按钮在 detailEditCat() 里作为绝对定位的子节点加进 #dt-cat-grid，
        // 这样它就坐落在蓝色卡片（.conf-cat-wrap）的右下角，不会与详情下方按钮冲突
        '<div class="conf-cat-wrap" id="dt-cat-grid" style="position:relative;padding-bottom:42px"></div>' +
      '</div>' +
      '<div class="srow srow-edit" onclick="detailEditType()"><span class="sk">类型</span><span class="sv2" id="dt-type-disp">' + typeL(t.type) + '</span></div>' +
      '<div class="srow srow-edit" onclick="detailEditCur()"><span class="sk">货币</span><span class="sv2" id="dt-cur-disp">' + escapeHtml(curDisplay(t.currency)) + '</span></div>' +
      '<div class="srow"><span class="sk">时间</span><span class="sv2">' + formatTransactionFull(t) + '</span></div>' +
    '</div>';
}

// ── 行内编辑：类别 ──────────────────────────────────────────────────────────

export function detailEditCat() {
  const txs = store.getTxs();
  const t = txs[detailIdx];
  if (!t) return;
  const wrap = byId("dt-cat-grid-wrap");
  if (!wrap) return;
  if (wrap.style.display !== "none") { wrap.style.display = "none"; return; }

  const grid = byId("dt-cat-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const typed = getCatsByType(t.type);
  typed.forEach((c) => {
    const btn = document.createElement("div");
    btn.className = "conf-cat-btn" + (c.name === t.category ? " sel" : "");
    btn.innerHTML = '<div style="font-size:16px">' + renderIcon(c.icon, 18, 1.6) + '</div><div>' + escapeHtml(c.name) + '</div>';
    btn.onclick = () => {
      t.category = c.name;
      _saveTxsAndRefresh(txs);
    };
    grid.appendChild(btn);
  });

  // 右下齿轮：打开类别管理（cat-settings 的 z-index=85 已能盖住详情面板）
  const gear = document.createElement("div");
  gear.title = "管理类别";
  gear.style.cssText =
    "position:absolute;right:8px;bottom:8px;width:30px;height:30px;border-radius:50%;" +
    "background:var(--card);border:1px solid var(--bdr);color:var(--t2);" +
    "display:flex;align-items:center;justify-content:center;cursor:pointer";
  gear.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 ' +
    '1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 ' +
    '2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 ' +
    '0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 ' +
    '1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 ' +
    '1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 ' +
    '0 0-1.5 1z"/></svg>';
  gear.onclick = (e) => {
    e.stopPropagation();
    if (typeof window.openCatSettings === "function") window.openCatSettings();
  };
  grid.appendChild(gear);

  wrap.style.display = "block";
}

// ── 行内编辑：类型 ──────────────────────────────────────────────────────────

export function detailEditType() {
  const txs = store.getTxs();
  const t = txs[detailIdx];
  if (!t) return;
  fxTap();
  const order = ["expense", "income"];
  t.type = order[(order.indexOf(t.type) + 1) % 2];

  const typed = getCatsByType(t.type);
  if (typed.length && !typed.some((c) => c.name === t.category)) {
    t.category = typed[0].name;
  }
  _saveTxsAndRefresh(txs);
}

// ── 行内编辑：货币 ──────────────────────────────────────────────────────────

export function detailEditCur() {
  const txs = store.getTxs();
  const t = txs[detailIdx];
  if (!t) return;
  fxTap();
  // 在 settings.enabledCurrencies 之间循环（跟 Hero / 手动按钮一致）
  const settings = store.getSettings();
  const enabled = Array.isArray(settings.enabledCurrencies) && settings.enabledCurrencies.length
    ? settings.enabledCurrencies
    : ["EUR", "CNY"];
  let i = enabled.indexOf(t.currency);
  if (i < 0) i = -1;
  t.currency = enabled[(i + 1) % enabled.length];
  _saveTxsAndRefresh(txs);
}

function _saveTxsAndRefresh(txs) {
  store.setTxs(txs);
  if (typeof window.render === "function") window.render();
  renderDetailBody();
}

// ── 编辑 / 删除 ────────────────────────────────────────────────────────────

export function doEdit() {
  const idx = detailIdx;
  close();
  if (_manualModal) _manualModal.open(idx);
  else if (typeof window.openManual === "function") window.openManual(idx);
}

export function doDelete() {
  if (detailIdx < 0) return;
  const idx = detailIdx;
  close();
  fxOpen();
  setTimeout(() => confirmDelete(idx), 120);
}

// ── 删除确认弹窗（#ov-delete-confirm） ──────────────────────────────────────

export function confirmDelete(id) {
  const txs = store.getTxs();
  if (id < 0 || id >= txs.length) return;
  deleteConfirmIdx = id;
  // 同步 inline 全局
  if (typeof window.deleteConfirmIdx !== "undefined") window.deleteConfirmIdx = id;

  const t = txs[id];
  const sg = t.type === "expense" ? "−" : "+";
  const sym = currencySymbol(t.currency);
  const body = byId("deleteConfirmBody");
  if (body) {
    body.innerHTML =
      '<div class="scard">' +
        '<div class="srow"><span class="sk">描述</span><span class="sv2">' + escapeHtml(t.desc) + '</span></div>' +
        '<div class="srow"><span class="sk">金额</span><span class="sv2" style="color:' + amtColor(t) + '">' + sg + formatAmount(t.amount) + ' ' + sym + '</span></div>' +
      '</div>';
  }
  const ov = byId("ov-delete-confirm");
  if (ov) ov.style.display = "flex";
}

export function cancelDeleteConfirm() {
  closeOverlay("ov-delete-confirm");
}

export function executeDeleteConfirm() {
  const txs = store.getTxs();
  const i = deleteConfirmIdx;
  if (i < 0 || i >= txs.length) { closeOverlay("ov-delete-confirm"); return; }

  const next = txs.filter((_, j) => j !== i);
  store.setTxs(next);

  if (typeof window.listSwipeOpenTi !== "undefined") window.listSwipeOpenTi = null;
  closeOverlay("ov-delete-confirm");
  if (typeof window.render === "function") window.render();
  _toast("已删除");

  if (window.currentTab === "analysis" && typeof window.renderAnalysis === "function") {
    window.renderAnalysis();
  }
  if (window.currentTab === "search" && typeof window.doSearch === "function") {
    window.doSearch();
  }
}
