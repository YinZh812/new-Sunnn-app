// ui/modals/manual.js —— 手动记账弹窗（#ov-manual）
//
// 职责：
//   - 完整表单：类型 tab、类别行、金额计算器、描述、日期、货币
//   - 编辑模式：传入 idx>=0 时预填 txs[idx]
//   - "完成" → store.setTxs(...)；关闭时草稿暂存

import { byId, qsa } from "../../utils/dom.js";
import { openOverlay, closeOverlay, attachSheetSwipe } from "../components/overlay.js";
import { fxTap, fxTapAlt, fxOpen, fxClose, fxSuccess, fxError } from "../components/sfx.js";
import { store } from "../../state/store.js";
import { DEFAULT_CATS_BY_TYPE } from "../../domain/categories.js";
import { renderIcon } from "../../utils/icons.js";
import { pad2, escapeHtml } from "../../utils/format.js";

const OVERLAY_ID = "ov-manual";
const SHEET_ID   = "sh-manual";
const HANDLE_ID  = "hdl-manual";

let _toast = (msg) => { if (window.showToast) window.showToast(msg); };

// ── 弹窗内部状态 ────────────────────────────────────────────────────────────

let editIdx = -1;
let mType = "expense";
let mCur  = "EUR";
let mCat  = "其他";

// 计算器状态
let mcAmt = "", mcHasDot = false, mcDecCount = 0, mcOp = null, mcPrev = null, mcDate = null;

// 草稿
let manualDraft = null;

// ── helpers ─────────────────────────────────────────────────────────────────

function getActiveCustomCats() {
  const custom = store.getCustomCategoriesByType();
  const arr = custom[mType] || [];
  return arr.length ? arr : DEFAULT_CATS_BY_TYPE[mType].slice();
}

function mcDoOp(a, b, op) {
  const x = parseFloat(a) || 0, y = parseFloat(b) || 0;
  const r = op === "+" ? x + y : x - y;
  return parseFloat(r.toFixed(2));
}

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init({ toast } = {}) {
  if (toast) _toast = toast;
  attachSheetSwipe(SHEET_ID, HANDLE_ID, () => {
    saveDraft();
    closeOverlay(OVERLAY_ID);
  });
}

// ── 打开 / 关闭 ────────────────────────────────────────────────────────────

export function open(idx = -1) {
  fxOpen();
  editIdx = idx;
  const txs = store.getTxs();
  const isEdit = idx >= 0 && idx < txs.length;
  const t = isEdit ? txs[idx] : null;
  const settings = store.getSettings();
  const customCats = getActiveCustomCats();

  mType = t ? t.type : "expense";
  mCur  = t ? t.currency : (settings.defaultCurrency || "EUR");
  mCat  = t ? t.category : (customCats[0] ? customCats[0].name : "其他");

  const title = byId("manual-title");
  if (title) title.textContent = isEdit ? "编辑记录" : "手动记账";

  // 同步隐藏表单的 seg-btns（旧 UI，display:none 但仍被 inline 用到）
  qsa("#typebtns .seg-btn").forEach((b) => b.classList.toggle("sel", b.getAttribute("data-v") === mType));
  qsa("#curbtns .seg-btn").forEach((b) => b.classList.toggle("sel", b.getAttribute("data-v") === mCur));
  const amtSym = byId("amtSym");
  if (amtSym) amtSym.textContent = mCur === "CNY" ? "¥" : "€";
  const mdesc = byId("mdesc");
  if (mdesc) mdesc.value = t ? t.desc : "";
  const mamt = byId("mamt");
  if (mamt) mamt.value = t ? t.amount : "";

  // 日期
  const dateD = t ? new Date(t.ts) : new Date();
  const mdate = byId("mdate");
  if (mdate) mdate.value = dateD.getFullYear() + "-" + pad2(dateD.getMonth() + 1) + "-" + pad2(dateD.getDate());

  // 计算器状态
  mcOp = null; mcPrev = null;
  mcDate = isEdit ? t.ts : null;
  if (t && t.amount) {
    mcSetFromAmount(t.amount);
  } else {
    mcAmt = ""; mcHasDot = false; mcDecCount = 0;
    updateMcDisplay();
  }
  updateMcDateBtn();
  const dInp = byId("mcDateInp");
  if (dInp && mdate) dInp.value = mdate.value;

  // 描述输入
  const di = byId("mcDescInp");
  if (di) di.value = t ? t.desc : "";

  // 货币符号
  const sym = byId("mcAmtSym");
  if (sym) sym.textContent = mCur === "CNY" ? "¥" : "€";

  // 类别行 + 类别网格
  syncTypeTabs();
  syncCurPills();
  buildCatGrid();
  buildManualCatRow();

  // 清推荐词
  const sugRow = byId("manualSugRow");
  if (sugRow) sugRow.innerHTML = "";
  const mcSugRow = byId("mcSugRow");
  if (mcSugRow) mcSugRow.innerHTML = "";

  openOverlay(OVERLAY_ID);

  // 恢复草稿
  if (!isEdit && manualDraft && manualDraft.editIdx === -1) restoreDraft();
}

export function close() {
  closeOverlay(OVERLAY_ID);
  editIdx = -1;
}

// ── 类型 tab ────────────────────────────────────────────────────────────────

export function selTypeTab(el) {
  if (typeof window.fxTab === "function") window.fxTab();
  qsa("#manualTypeTabs .manual-type-tab").forEach((t) => t.classList.remove("active"));
  el.classList.add("active");
  mType = el.getAttribute("data-v");
  qsa("#typebtns .seg-btn").forEach((b) => b.classList.toggle("sel", b.getAttribute("data-v") === mType));

  const customCats = getActiveCustomCats();
  if (customCats.length && !customCats.some((c) => c.name === mCat)) {
    mCat = customCats[0].name;
  }
  buildManualCatRow();
}

function syncTypeTabs() {
  qsa("#manualTypeTabs .manual-type-tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-v") === mType);
  });
}

// ── 货币 pill ───────────────────────────────────────────────────────────────

export function selCurPill(el) {
  fxTap();
  qsa("#manualCurRow .manual-cur-pill").forEach((p) => p.classList.remove("active"));
  el.classList.add("active");
  mCur = el.getAttribute("data-v");
  const sym = mCur === "CNY" ? "¥" : "€";
  const s1 = byId("amtSym");   if (s1) s1.textContent = sym;
  const s2 = byId("mcAmtSym"); if (s2) s2.textContent = sym;
  qsa("#curbtns .seg-btn").forEach((b) => b.classList.toggle("sel", b.getAttribute("data-v") === mCur));
}

function syncCurPills() {
  qsa("#manualCurRow .manual-cur-pill").forEach((p) => {
    p.classList.toggle("active", p.getAttribute("data-v") === mCur);
  });
}

// ── 类别行 ──────────────────────────────────────────────────────────────────

export function buildManualCatRow() {
  const row = byId("manualCatRow");
  if (!row) return;
  row.innerHTML = "";

  const customCats = getActiveCustomCats();
  if (!customCats.some((c) => c.name === mCat) && customCats.length) {
    mCat = customCats[0].name;
  }

  customCats.forEach((c) => {
    const item = document.createElement("div");
    item.className = "manual-cat-item" + (c.name === mCat ? " active" : "");
    item.setAttribute("data-c", c.name);
    item.innerHTML = '<div class="mci-dot">' + renderIcon(c.icon, 22, 1.6) + '</div><div class="mci-lbl">' + escapeHtml(c.name) + '</div>';
    item.onclick = () => selManualCat(c.name);
    row.appendChild(item);
  });

  // 设置按钮
  const GEAR_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  const gear = document.createElement("div");
  gear.className = "manual-cat-item";
  gear.innerHTML = '<div class="mci-dot">' + GEAR_SVG + '</div><div class="mci-lbl">设置</div>';
  gear.onclick = () => { if (typeof window.openCatSettings === "function") window.openCatSettings(); };
  row.appendChild(gear);
}

function selManualCat(name) {
  fxTap();
  mCat = name;
  syncManualCatRow();
  qsa("#catgrid .cat-btn").forEach((b) => b.classList.toggle("sel", b.getAttribute("data-c") === mCat));
}

function syncManualCatRow() {
  const row = byId("manualCatRow");
  if (!row) return;
  const items = row.querySelectorAll(".manual-cat-item[data-c]");
  let found = false;
  items.forEach((it) => {
    const sel = it.getAttribute("data-c") === mCat;
    it.classList.toggle("active", sel);
    if (sel) found = true;
  });
  if (!found) buildManualCatRow();
}

// ── 旧类别网格（display:none 区域，但 inline 仍同步用） ────────────────────

function buildCatGrid() {
  const g = byId("catgrid");
  if (!g) return;
  g.innerHTML = "";
  getActiveCustomCats().forEach((c) => {
    const d = document.createElement("div");
    d.className = "cat-btn" + (c.name === mCat ? " sel" : "");
    d.setAttribute("data-c", c.name);
    d.innerHTML = '<div class="cat-btn-ico">' + renderIcon(c.icon, 18, 1.6) + '</div><div>' + escapeHtml(c.name) + '</div>';
    d.onclick = function () {
      qsa("#catgrid .cat-btn").forEach((b) => b.classList.remove("sel"));
      d.classList.add("sel");
      mCat = c.name;
      syncManualCatRow();
    };
    g.appendChild(d);
  });
}

// ── 计算器 ──────────────────────────────────────────────────────────────────

function mcSetFromAmount(amt) {
  mcOp = null; mcPrev = null;
  if (!amt || amt <= 0) {
    mcAmt = ""; mcHasDot = false; mcDecCount = 0;
  } else {
    let s = String(amt);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    mcAmt = s;
    mcHasDot = s.indexOf(".") >= 0;
    mcDecCount = mcHasDot ? s.split(".")[1].length : 0;
  }
  updateMcDisplay();
}

function updateMcDisplay() {
  const val = byId("mcAmtVal");
  if (!val) return;
  const expr = byId("mcAmtExpr");
  let showVal;
  if (mcOp && mcPrev !== null && mcAmt !== "") {
    showVal = String(mcDoOp(mcPrev, mcAmt, mcOp));
  } else if (mcOp && mcPrev !== null && mcAmt === "") {
    showVal = mcPrev;
  } else {
    showVal = mcAmt !== "" ? mcAmt : "0";
  }
  val.textContent = showVal;
  if (expr) {
    if (mcOp && mcPrev !== null)
      expr.textContent = mcPrev + " " + (mcOp === "-" ? "−" : mcOp) + " " + (mcAmt || "");
    else
      expr.textContent = "";
  }
  const hidden = byId("mamt");
  if (hidden) hidden.value = showVal;
}

function updateMcDateBtn() {
  const lbl = byId("mcDateLbl");
  if (!lbl) return;
  if (mcDate) {
    const d = new Date(mcDate);
    lbl.textContent = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  } else {
    lbl.textContent = "今天";
  }
}

export function mcInput(k) {
  if (/^[0-9]$/.test(k)) {
    if (mcHasDot && mcDecCount >= 2) { fxError(); return; }
    if (mcHasDot) mcDecCount++;
    if (mcAmt === "" || mcAmt === "0") {
      mcAmt = !mcHasDot ? k : mcAmt + k;
    } else {
      mcAmt += k;
    }
    fxTap();
  } else if (k === ".") {
    if (mcHasDot) { fxError(); return; }
    if (mcAmt === "") mcAmt = "0";
    mcAmt += ".";
    mcHasDot = true;
    fxTapAlt();
  } else if (k === "B") {
    if (mcAmt.length > 0) {
      const removed = mcAmt.charAt(mcAmt.length - 1);
      mcAmt = mcAmt.slice(0, -1);
      if (removed === ".") mcHasDot = false;
      else if (mcHasDot && mcDecCount > 0) mcDecCount--;
      fxTapAlt();
    } else if (mcOp) {
      mcAmt = mcPrev || "";
      mcOp = null; mcPrev = null;
      mcHasDot = mcAmt.indexOf(".") >= 0;
      mcDecCount = mcHasDot ? mcAmt.split(".")[1].length : 0;
      fxTapAlt();
    }
  } else if (k === "+" || k === "-") {
    if (mcAmt === "" && mcPrev === null) { fxError(); return; }
    if (mcAmt !== "") {
      if (mcOp && mcPrev !== null) {
        mcPrev = String(mcDoOp(mcPrev, mcAmt, mcOp));
      } else {
        mcPrev = mcAmt;
      }
      mcAmt = ""; mcHasDot = false; mcDecCount = 0;
    }
    mcOp = k;
    fxTapAlt();
  }
  updateMcDisplay();
}

export function mcDone() {
  let finalAmt;
  if (mcOp && mcPrev !== null) {
    finalAmt = mcAmt !== "" ? mcDoOp(mcPrev, mcAmt, mcOp) : parseFloat(mcPrev);
  } else {
    finalAmt = parseFloat(mcAmt || "0");
  }
  if (!finalAmt || finalAmt <= 0) { fxError(); _toast("请输入金额"); return; }
  fxSuccess();

  const mamt = byId("mamt");
  if (mamt) mamt.value = finalAmt;
  const descInp = byId("mcDescInp");
  const mdesc = byId("mdesc");
  if (mdesc) mdesc.value = descInp ? descInp.value : "";

  const mdate = byId("mdate");
  if (mdate) {
    if (mcDate) {
      const d = new Date(mcDate);
      mdate.value = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    } else {
      const d2 = new Date();
      mdate.value = d2.getFullYear() + "-" + pad2(d2.getMonth() + 1) + "-" + pad2(d2.getDate());
    }
  }
  submitManual();
}

export function mcDateChange(v) {
  if (!v) { mcDate = null; } else { mcDate = new Date(v + "T12:00:00").getTime(); }
  updateMcDateBtn();
}

// ── 推荐词 ──────────────────────────────────────────────────────────────────

export function showManualSug() {
  const row = byId("mcSugRow");
  if (!row) return;
  row.innerHTML = "";
  const inp = byId("mcDescInp") || byId("mdesc");
  const q = (inp && inp.value || "").trim();

  const txs = store.getTxs();
  const deleted = store.getDeletedSugs();
  const freq = {};
  txs.forEach((t) => {
    if (t.desc && t.desc.length > 1 && t.desc !== t.category)
      freq[t.desc] = (freq[t.desc] || 0) + 1;
  });
  let tops = Object.keys(freq)
    .filter((d) => d !== q && deleted.indexOf(d) === -1)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, 8);
  if (!tops.length) { row.style.display = "none"; return; }
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "5px";

  const isCn = (s) => (s.match(/[一-鿿]/g) || []).length > s.length / 2;
  const truncate = (s) => { const lim = isCn(s) ? 5 : 6; return s.length <= lim ? s : s.slice(0, lim) + "…"; };

  tops.forEach((d) => {
    const ch = document.createElement("div");
    ch.className = "sug-chip";
    ch.title = d;
    const txt = document.createElement("span");
    txt.textContent = truncate(d);
    const del = document.createElement("button");
    del.className = "sug-del";
    del.textContent = "×";
    del.title = "移除 " + d;
    del.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); deleteSugLocal(d); showManualSug(); });
    del.addEventListener("touchend", (e) => { e.preventDefault(); e.stopPropagation(); deleteSugLocal(d); showManualSug(); });
    ch.appendChild(txt);
    ch.appendChild(del);
    ch.addEventListener("click", (e) => {
      if (e.target === del || e.target.closest(".sug-del")) return;
      const di = byId("mcDescInp"); if (di) di.value = d;
      const di2 = byId("mdesc"); if (di2) di2.value = d;
      row.style.display = "none";
    });
    row.appendChild(ch);
  });
}

function deleteSugLocal(d) {
  const arr = store.getDeletedSugs().slice();
  if (arr.indexOf(d) === -1) { arr.push(d); store.setDeletedSugs(arr); }
}

// ── 草稿 ────────────────────────────────────────────────────────────────────

export function saveDraft() {
  manualDraft = {
    type: mType, cur: mCur, cat: mCat,
    desc: (byId("mcDescInp") || byId("mdesc") || {}).value || "",
    amt: (byId("mamt") || {}).value || "",
    date: (byId("mdate") || {}).value || "",
    editIdx,
    mcAmt, mcHasDot, mcDecCount, mcOp, mcPrev, mcDate,
  };
}

export function restoreDraft() {
  if (!manualDraft || manualDraft.editIdx !== editIdx) return;
  mType = manualDraft.type;
  mCur  = manualDraft.cur;
  mCat  = manualDraft.cat;

  qsa("#typebtns .seg-btn").forEach((b) => b.classList.toggle("sel", b.getAttribute("data-v") === mType));
  qsa("#curbtns .seg-btn").forEach((b) => b.classList.toggle("sel", b.getAttribute("data-v") === mCur));
  const amtSym = byId("amtSym");
  if (amtSym) amtSym.textContent = mCur === "CNY" ? "¥" : "€";
  const di = byId("mcDescInp"); if (di) di.value = manualDraft.desc || "";
  const mdesc = byId("mdesc"); if (mdesc) mdesc.value = manualDraft.desc || "";
  const mamt = byId("mamt"); if (mamt) mamt.value = manualDraft.amt;
  const mdate = byId("mdate"); if (mdate) mdate.value = manualDraft.date;

  mcAmt      = manualDraft.mcAmt || "";
  mcHasDot   = !!manualDraft.mcHasDot;
  mcDecCount = manualDraft.mcDecCount || 0;
  mcOp       = manualDraft.mcOp || null;
  mcPrev     = manualDraft.mcPrev || null;
  mcDate     = manualDraft.mcDate || null;

  syncTypeTabs();
  syncCurPills();
  const sym = byId("mcAmtSym");
  if (sym) sym.textContent = mCur === "CNY" ? "¥" : "€";
  buildCatGrid();
  buildManualCatRow();
  updateMcDisplay();
  updateMcDateBtn();
  manualDraft = null;
}

export function clearAndClose() {
  fxClose();
  manualDraft = null;
  mcAmt = ""; mcHasDot = false; mcDecCount = 0; mcOp = null; mcPrev = null; mcDate = null;
  updateMcDateBtn();
  updateMcDisplay();
  const di = byId("mcDescInp"); if (di) di.value = "";
  const ai = byId("mamt"); if (ai) ai.value = "";
  const dd = byId("mdate"); if (dd) dd.value = "";
  const md = byId("mdesc"); if (md) md.value = "";
  closeOverlay(OVERLAY_ID);
}

export function swipeClose() {
  saveDraft();
  closeOverlay(OVERLAY_ID);
}

// ── 提交 ────────────────────────────────────────────────────────────────────

export function submitManual() {
  const amt = parseFloat((byId("mamt") || {}).value);
  if (!amt || amt <= 0) { _toast("请输入有效金额"); return; }

  const descRaw = byId("mcDescInp") ? byId("mcDescInp").value : (byId("mdesc") || {}).value;
  const desc = (descRaw || "").trim() || mCat;
  const dateVal = (byId("mdate") || {}).value;
  const ts = dateVal ? new Date(dateVal + "T12:00:00").getTime() : Date.now();

  const t = {
    amount: amt, currency: mCur, category: mCat, type: mType,
    desc, ts, timeLabel: "", timePrecision: "day",
  };

  const txs = store.getTxs();
  let next;
  if (editIdx >= 0 && editIdx < txs.length) {
    next = txs.slice();
    next[editIdx] = t;
  } else {
    next = txs.concat([t]);
  }

  const d = new Date(ts);
  if (typeof window.viewYear !== "undefined") window.viewYear = d.getFullYear();
  if (typeof window.viewMonth !== "undefined") window.viewMonth = d.getMonth();

  store.setTxs(next);
  if (typeof window.render === "function") window.render();

  closeOverlay(OVERLAY_ID);
  manualDraft = null;
  _toast(editIdx >= 0 ? "已更新 ✓" : "已记录 ✓");

  if (window.currentTab === "analysis" && typeof window.renderAnalysis === "function") {
    window.renderAnalysis();
  }
}

// ── 兼容旧版 selType/selCur（隐藏区域的 seg-btn onclick） ───────────────────

export function selType(el) {
  qsa("#typebtns .seg-btn").forEach((b) => b.classList.remove("sel"));
  el.classList.add("sel");
  mType = el.getAttribute("data-v");
  syncTypeTabs();
}

export function selCur(el) {
  qsa("#curbtns .seg-btn").forEach((b) => b.classList.remove("sel"));
  el.classList.add("sel");
  mCur = el.getAttribute("data-v");
  const amtSym = byId("amtSym");
  if (amtSym) amtSym.textContent = mCur === "CNY" ? "¥" : "€";
  syncCurPills();
  const s = byId("mcAmtSym");
  if (s) s.textContent = mCur === "CNY" ? "¥" : "€";
}
