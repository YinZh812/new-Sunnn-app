// ui/modals/confirm.js —— 解析结果确认弹窗（#ov-confirm）
//
// 职责：
//   - 展示 parseVoiceText 返回的多笔候选
//   - 单笔时支持就地编辑（金额/描述/类别/类型/货币）
//   - "确认" → 写入 store.setTxs([...txs, ...pending])
//   - 补录金额弹窗（showAmtPrompt）
//   - 解析失败提示（showErr）
//
// 协作：
//   - 数据来自 input.js 调 open(results)
//   - 提交后通过 store 自动广播 → tabs 刷新

import { byId } from "../../utils/dom.js";
import { openOverlay, closeOverlay, attachSheetSwipe } from "../components/overlay.js";
import { fxTap } from "../components/sfx.js";
import { store } from "../../state/store.js";
import { getCategoryIcon, DEFAULT_CATS_BY_TYPE } from "../../domain/categories.js";
import { renderIcon } from "../../utils/icons.js";
import { formatTransactionFull } from "../../domain/dates.js";
import { pad2, escapeHtml, formatAmount } from "../../utils/format.js";

const OVERLAY_ID = "ov-confirm";
const SHEET_ID   = "sh-confirm";
const HANDLE_ID  = "hdl-confirm";

let _pending = [];
let _toast = (msg) => { if (window.showToast) window.showToast(msg); };

const TYPE_LABELS = { expense: "支出", income: "收入", savings: "储蓄", net_income: "支出但获得" };
function typeL(t) { return TYPE_LABELS[t] || "支出"; }
function amtColor(t) {
  return t.type === "income" || t.type === "net_income" ? "#1A7A40"
       : t.type === "savings" ? "#2255AA" : "#CC2222";
}
function sym(t) { return t.currency === "CNY" ? "¥" : "€"; }
function sign(t) { return t.type === "expense" ? "−" : "+"; }

function getCatsByType(type) {
  const t = type || "expense";
  const custom = store.getCustomCategoriesByType();
  const arr = custom[t] || [];
  return arr.length ? arr : DEFAULT_CATS_BY_TYPE[t].slice();
}

function getCatIcon(name) {
  return getCategoryIcon(name, store.getCustomCategoriesByType(), { size: 22, strokeWidth: 1.6 });
}

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init({ toast } = {}) {
  if (toast) _toast = toast;
  attachSheetSwipe(SHEET_ID, HANDLE_ID, () => {
    close();
    _pending = [];
  });

  const okBtn = byId("okbtn");
  if (okBtn) okBtn.onclick = doConfirm;
}

// ── 打开 / 关闭 ────────────────────────────────────────────────────────────

export function open(results) {
  // 兼容 inline 调用 showConfirm()（无参，依赖 window.pending 已被设好）
  if (results === undefined && Array.isArray(window.pending)) {
    _pending = window.pending;
  } else {
    _pending = Array.isArray(results) ? results : [];
  }
  showConfirm();
}

export function close() {
  closeOverlay(OVERLAY_ID);
}

// ── 主入口：区分多笔/单笔 ──────────────────────────────────────────────────

function showConfirm() {
  const isMulti = _pending.length > 1;
  const slbl = byId("slbl");
  if (slbl) slbl.textContent = isMulti ? "识别到 " + _pending.length + " 笔" : "我理解了你说的";

  const okBtn = byId("okbtn");
  if (okBtn) {
    okBtn.onclick = doConfirm;
    okBtn.textContent = isMulti ? "全部确认记账" : "确认记账";
    okBtn.style.display = "";
  }

  if (isMulti) {
    renderConfirmMulti();
  } else {
    renderConfirmSingle();
  }
  openOverlay(OVERLAY_ID);
}

// ── 多笔渲染 ────────────────────────────────────────────────────────────────

function renderConfirmMulti() {
  const body = byId("sbody");
  if (!body) return;

  let html = "";
  _pending.forEach((t, i) => {
    const ico = getCatIcon(t.category);
    const s = sign(t);
    const sy = sym(t);
    html += '<div class="mcard">' +
      '<div class="mcard-top">' +
        '<span class="mcard-idx">第' + (i + 1) + '笔</span>' +
        '<span class="mcard-amt" style="color:' + amtColor(t) + '">' + s + formatAmount(t.amount) + ' ' + sy + '</span>' +
      '</div>' +
      '<div class="mcard-desc" style="display:flex;align-items:center;gap:6px">' + ico + '<span>' + escapeHtml(t.desc) + '</span></div>' +
      '<div class="mcard-meta">' + escapeHtml(t.category) + ' · ' + typeL(t.type) + ' · ' + (t.timeLabel || formatTransactionFull(t)) + '</div>' +
      (t.note ? '<div class="mcard-note">' + escapeHtml(t.note) + '</div>' : '') +
    '</div>';
  });
  body.innerHTML = html;
}

// ── 单笔渲染（含就地编辑入口） ──────────────────────────────────────────────

function renderConfirmSingle() {
  const body = byId("sbody");
  if (!body) return;
  const t = _pending[0];
  if (!t) return;

  const ico = getCatIcon(t.category);
  const s = sign(t);
  const sy = sym(t);
  const td = formatTransactionFull(t);

  body.innerHTML =
    '<div class="samt" id="conf-amt-disp" style="cursor:pointer" onclick="confEditAmt()">' +
      '<span style="color:var(--t1)">' + s + formatAmount(t.amount) + '</span>' +
      '<span style="font-size:18px;font-weight:400;color:var(--t3);margin-left:5px">' + sy + '</span>' +
      '<span style="font-size:11px;color:var(--t3);margin-left:6px">✎</span>' +
    '</div>' +
    (t.note ? '<div class="snote">' + escapeHtml(t.note) + '</div>' : '') +
    '<div class="scard">' +
      '<div class="srow srow-edit" onclick="confEditDesc()">' +
        '<span class="sk">备注</span>' +
        '<span class="sv2" id="conf-desc-disp" style="color:var(--t1)">' + escapeHtml(t.desc) + '</span>' +
      '</div>' +
      '<div class="srow srow-edit" id="conf-cat-row-hd" onclick="confEditCat()">' +
        '<span class="sk">类别</span>' +
        '<span class="sv2" id="conf-cat-disp" style="display:inline-flex;align-items:center;gap:6px;color:var(--t1)">' +
          '<span style="display:inline-flex;align-items:center">' + ico + '</span>' + escapeHtml(t.category) +
        '</span>' +
      '</div>' +
      '<div id="conf-cat-grid-wrap" style="display:none"><div class="conf-cat-wrap" id="conf-cat-grid"></div></div>' +
      '<div class="srow srow-edit" onclick="confEditType()">' +
        '<span class="sk">类型</span>' +
        '<span class="sv2" id="conf-type-disp">' + typeL(t.type) + '</span>' +
      '</div>' +
      '<div class="srow srow-edit" onclick="confEditCur()">' +
        '<span class="sk">货币</span>' +
        '<span class="sv2" id="conf-cur-disp">' + (t.currency === "CNY" ? "人民币 ¥" : "欧元 €") + '</span>' +
      '</div>' +
      '<div class="srow">' +
        '<span class="sk">时间</span>' +
        '<span class="sv2">' + td + '</span>' +
      '</div>' +
    '</div>';
}

// ── 就地编辑：金额 ──────────────────────────────────────────────────────────

export function editAmount() {
  const t = _pending[0];
  if (!t) return;
  const disp = byId("conf-amt-disp");
  if (!disp) return;
  const sy = sym(t);
  disp.innerHTML = '<input class="conf-inp" id="conf-amt-inp" type="number" value="' + t.amount +
    '" step="0.01" min="0" style="font-size:22px;font-weight:400;width:110px;text-align:center">' +
    ' <span style="color:var(--t3);font-size:16px">' + sy + '</span>';
  const inp = byId("conf-amt-inp");
  if (!inp) return;
  inp.focus();
  inp.select();
  function save() {
    const v = parseFloat(inp.value);
    if (v > 0) t.amount = parseFloat(v.toFixed(2));
    renderConfirmSingle();
  }
  inp.addEventListener("blur", () => setTimeout(save, 120));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") inp.blur();
    if (e.key === "Escape") renderConfirmSingle();
  });
}

// ── 就地编辑：描述 ──────────────────────────────────────────────────────────

export function editDesc() {
  const t = _pending[0];
  if (!t) return;
  const disp = byId("conf-desc-disp");
  if (!disp) return;
  const ico = getCatIcon(t.category);
  disp.innerHTML = ico + ' <input class="conf-inp" id="conf-desc-inp" type="text" value="' +
    escapeHtml(t.desc).replace(/"/g, "&quot;") + '" style="width:130px">';
  const inp = byId("conf-desc-inp");
  if (!inp) return;
  inp.focus();
  inp.select();
  function save() {
    const v = inp.value.trim();
    if (v) t.desc = v;
    renderConfirmSingle();
  }
  inp.addEventListener("blur", () => setTimeout(save, 120));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") inp.blur();
    if (e.key === "Escape") renderConfirmSingle();
  });
}

// ── 就地编辑：类别（展开/收起类别网格） ─────────────────────────────────────

export function editCategory() {
  const wrap = byId("conf-cat-grid-wrap");
  if (!wrap) return;
  if (wrap.style.display !== "none") { wrap.style.display = "none"; return; }

  const t = _pending[0];
  if (!t) return;
  const grid = byId("conf-cat-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const typed = getCatsByType(t.type);
  typed.forEach((c) => {
    const btn = document.createElement("div");
    btn.className = "conf-cat-btn" + (c.name === t.category ? " sel" : "");
    btn.innerHTML = '<div style="font-size:16px">' + renderIcon(c.icon, 18, 1.6) + '</div><div>' + escapeHtml(c.name) + '</div>';
    btn.onclick = () => { t.category = c.name; renderConfirmSingle(); };
    grid.appendChild(btn);
  });
  wrap.style.display = "block";
}

// ── 就地编辑：类型（循环切换） ──────────────────────────────────────────────

export function editType() {
  const t = _pending[0];
  if (!t) return;
  const order = ["expense", "income", "savings"];
  t.type = order[(order.indexOf(t.type) + 1) % order.length];
  fxTap();

  const typed = getCatsByType(t.type);
  if (typed.length && !typed.some((c) => c.name === t.category)) {
    t.category = typed[0].name;
  }

  renderConfirmSingle();

  const wrap = byId("conf-cat-grid-wrap");
  if (wrap && wrap.style.display !== "none" && wrap.style.display !== "") {
    const grid = byId("conf-cat-grid");
    if (grid) {
      grid.innerHTML = "";
      typed.forEach((c) => {
        const btn = document.createElement("div");
        btn.className = "conf-cat-btn" + (c.name === t.category ? " sel" : "");
        btn.innerHTML = '<div style="font-size:16px">' + renderIcon(c.icon, 18, 1.6) + '</div><div>' + escapeHtml(c.name) + '</div>';
        btn.onclick = () => { t.category = c.name; renderConfirmSingle(); };
        grid.appendChild(btn);
      });
      wrap.style.display = "block";
    }
  }
}

// ── 就地编辑：货币（切换 EUR/CNY） ──────────────────────────────────────────

export function editCurrency() {
  const t = _pending[0];
  if (!t) return;
  t.currency = t.currency === "CNY" ? "EUR" : "CNY";
  const d = byId("conf-cur-disp");
  if (d) d.textContent = t.currency === "CNY" ? "人民币 ¥" : "欧元 €";
}

// ── 补录金额弹窗 ────────────────────────────────────────────────────────────

export function showAmtPrompt(result) {
  const slbl = byId("slbl");
  if (slbl) slbl.textContent = "补充金额";

  const sy = result.currency === "CNY" ? "¥" : "€";
  const body = byId("sbody");
  if (body) {
    body.innerHTML =
      '<div style="font-size:12px;color:var(--t2);text-align:center;margin-bottom:4px">「' + escapeHtml(result.desc).slice(0, 20) + '」</div>' +
      '<div style="font-size:10px;color:var(--t3);text-align:center;margin-bottom:2px">没找到金额，请输入</div>' +
      '<input id="amtPromptInp" class="amt-prompt-inp" type="number" placeholder="0.00" step="0.01" min="0" inputmode="decimal">' +
      '<div style="font-size:11px;color:var(--t3);text-align:center;margin-bottom:8px">' + sy + '</div>';
  }

  const okBtn = byId("okbtn");
  if (okBtn) {
    okBtn.textContent = "确认 ✓";
    okBtn.style.display = "";
    okBtn.onclick = () => {
      const v = parseFloat(byId("amtPromptInp")?.value);
      if (!v || v <= 0) { _toast("请输入有效金额"); return; }
      result.amount = parseFloat(v.toFixed(2));
      result.ok = true;
      result.needAmountInput = false;
      _pending = [result];
      okBtn.onclick = doConfirm;
      const ovInput = byId("ov-input");
      if (ovInput) ovInput.style.display = "none";
      showConfirm();
    };
  }

  openOverlay(OVERLAY_ID);
  setTimeout(() => { const inp = byId("amtPromptInp"); if (inp) inp.focus(); }, 200);
}

// ── 解析失败提示 ────────────────────────────────────────────────────────────

export function showErr(msg) {
  const slbl = byId("slbl");
  if (slbl) slbl.textContent = "没能识别";

  const body = byId("sbody");
  if (body) {
    body.innerHTML =
      '<div style="background:var(--card);border:1px solid var(--bdr);border-radius:var(--radius);padding:16px;text-align:center;margin-bottom:10px">' +
        '<div style="font-size:22px;margin-bottom:8px">✕</div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:5px">' + escapeHtml(msg) + '</div>' +
        '<div style="font-size:10px;color:var(--t3);line-height:1.8">中午必胜客50欧 · 营业额2500欧<br>苏坤打球6人26欧 · 去年4月驾照2500欧</div>' +
      '</div>';
  }

  const okBtn = byId("okbtn");
  if (okBtn) okBtn.style.display = "none";

  openOverlay(OVERLAY_ID);
}

// ── 确认记账 ────────────────────────────────────────────────────────────────

export function doConfirm() {
  if (!_pending.length) return;

  const toSave = _pending.map((t) => ({
    amount:        t.amount,
    currency:      t.currency,
    category:      t.category,
    type:          t.type,
    desc:          t.desc,
    ts:            t.ts,
    timeLabel:     t.timeLabel || "",
    timePrecision: t.timePrecision || "exact",
    timePhrase:    t.timePhrase || null,  // v2 阶段 4.1：仅时段词时显示原词
  }));

  if (toSave.length === 1) {
    const d = new Date(toSave[0].ts);
    if (typeof window.viewYear !== "undefined") window.viewYear = d.getFullYear();
    if (typeof window.viewMonth !== "undefined") window.viewMonth = d.getMonth();
  }

  const txs = store.getTxs();
  store.setTxs(txs.concat(toSave));

  if (typeof window.render === "function") window.render();

  close();
  _toast(_pending.length > 1 ? "已记录 " + _pending.length + " 笔 ✓" : "已记录 ✓");
  _pending = [];
}
