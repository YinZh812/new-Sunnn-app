// ui/modals/input.js —— 一句话记账输入弹窗（#ov-input）
//
// 职责：
//   - 打开/关闭输入弹窗（openInputSheet / clearInputField）
//   - doSend：用户输入 → parseVoiceText → 货币确认 / 补录金额 / 确认弹窗分流
//   - renderAiSug / hideAiSug：推荐词渲染（高频描述 + 可删除）
//
// 协作：
//   - parseVoiceText 来自 domain/voice/parser.js
//   - 货币冲突 → currency-confirm modal
//   - 金额缺失 → confirm modal showAmtPrompt
//   - 解析成功 → confirm modal open

import { byId, on, qsa } from "../../utils/dom.js";
import { openOverlay, closeOverlay, attachSheetSwipe } from "../components/overlay.js";
import { fxTap, fxOpen, fxClose } from "../components/sfx.js";
import { parseVoiceText } from "../../domain/voice/parser.js";
import { store } from "../../state/store.js";
import { DEFAULT_CATS_BY_TYPE } from "../../domain/categories.js";

const OVERLAY_ID = "ov-input";
const SHEET_ID   = "sh-input";
const HANDLE_ID  = "hdl-input";

let _confirmModal = null;     // 注入：用于解析成功后跳到确认弹窗
let _currencyModal = null;    // 注入：用于货币冲突
let _manualModal = null;      // 注入：用于手动记账

/**
 * @param {Object} deps
 * @param {{ open: (results:any[]) => void }} deps.confirmModal
 * @param {{ open: (results:any[], onChoose:(cur:string)=>void) => void }} deps.currencyModal
 * @param {{ open: (idx:number) => void }} deps.manualModal
 */
export function init(deps) {
  _confirmModal  = deps.confirmModal;
  _currencyModal = deps.currencyModal;
  _manualModal   = deps.manualModal;

  attachSheetSwipe(SHEET_ID, HANDLE_ID, close);
  // 点击/键盘事件由 HTML onclick="doSend()" 桥接到 window.doSend（→ 本模块 doSend），
  // 不再 addEventListener，避免与 inline 的 onclick 双重触发。
}

export function open() {
  fxOpen();
  openOverlay(OVERLAY_ID);
  setTimeout(() => byId("field")?.focus(), 120);
}

export function close() {
  closeOverlay(OVERLAY_ID);
  const sugRow = byId("aiSugRow");
  if (sugRow) { sugRow.style.display = "none"; sugRow.innerHTML = ""; }
}

/** 清空输入框并可选关闭弹窗（inline clearInputField 桥接到此）。 */
export function clearInputField(alsoClose) {
  const f = byId("field");
  if (f) f.value = "";
  fxClose();
  if (alsoClose) close();
}

/** 一句话发送：解析 → 分流到货币 / 补录 / 确认。与 inline doSend 行为完全等价。 */
export function doSend() {
  fxTap();
  const field = byId("field");
  const text = (field?.value || "").trim();
  if (!text) return;
  // 立即清空输入框（与 inline 一致：无论解析成功与否都先清）
  field.value = "";

  const settings = store.getSettings();
  const results = parseVoiceText(text, {
    defaultCurrency: settings.defaultCurrency || "EUR",
    allowedCategoriesByType: DEFAULT_CATS_BY_TYPE,
  });

  if (!results || !results.length) return;

  const valid      = results.filter((r) => r.ok);
  const needAmt    = results.filter((r) => r.needAmountInput);
  const needCur    = results.filter((r) => r.needCurrencyConfirm);

  // 货币冲突：弹出 #cur-modal 让用户选择
  if (needCur.length) {
    _currencyModal?.open(results, (chosen) => {
      // 把选定币种应用到所有需要确认的 result
      results.forEach((r) => { if (r.needCurrencyConfirm) r.currency = chosen; });
      _afterParse(results);
    });
    return;
  }
  _afterParse(results);
}

function _afterParse(results) {
  const valid   = results.filter((r) => r.ok);
  const needAmt = results.filter((r) => r.needAmountInput);

  if (!valid.length && needAmt.length) {
    _confirmModal?.showAmtPrompt(needAmt[0]);
    return;
  }
  if (!valid.length) {
    _confirmModal?.showErr("没能识别金额，请说明花了多少钱");
    return;
  }

  const ovInput = byId("ov-input");
  if (ovInput) ovInput.style.display = "none";

  _confirmModal?.open(valid);
}

// ── 推荐词（aiSug） ─────────────────────────────────────────────────────────

function getTopDescs(limit, exclude) {
  const txs = store.getTxs();
  const deleted = store.getDeletedSugs();
  const freq = {};
  txs.forEach((t) => {
    if (t.desc && t.desc.length > 1 && t.desc !== t.category)
      freq[t.desc] = (freq[t.desc] || 0) + 1;
  });
  return Object.keys(freq)
    .filter((d) => d !== exclude && deleted.indexOf(d) === -1)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, limit || 10);
}

function truncateSug(s) {
  const isCn = (s.match(/[一-鿿]/g) || []).length > s.length / 2;
  const limit = isCn ? 5 : 6;
  return s.length <= limit ? s : s.slice(0, limit) + "…";
}

function deleteSug(d) {
  const deleted = store.getDeletedSugs().slice();
  if (deleted.indexOf(d) === -1) {
    deleted.push(d);
    store.setDeletedSugs(deleted);
  }
}

export function renderAiSug() {
  const fInp = byId("field");
  const q = (fInp && fInp.value || "").trim();
  let tops = getTopDescs(8, "");
  if (q) {
    const ql = q.toLowerCase();
    tops = tops.filter((d) => d.toLowerCase().indexOf(ql) >= 0);
  }

  const row = byId("aiSugRow");
  if (!row) return;
  if (!tops.length) { row.style.display = "none"; return; }

  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "0";
  row.innerHTML = "";

  const lbl = document.createElement("span");
  lbl.className = "sug-label";
  lbl.textContent = "推荐";
  row.appendChild(lbl);

  const wrap = document.createElement("div");
  wrap.className = "sug-chips-wrap";

  tops.forEach((d) => {
    const ch = document.createElement("div");
    ch.className = "sug-chip";
    ch.title = d;

    const txt = document.createElement("span");
    txt.textContent = truncateSug(d);

    const del = document.createElement("button");
    del.className = "sug-del";
    del.textContent = "×";
    del.title = "移除 " + d;
    del.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      deleteSug(d); renderAiSug();
    });
    del.addEventListener("touchend", (e) => {
      e.preventDefault(); e.stopPropagation();
      deleteSug(d); renderAiSug();
    });

    ch.appendChild(txt);
    ch.appendChild(del);
    ch.addEventListener("click", (e) => {
      if (e.target === del || e.target.closest(".sug-del")) return;
      const fi = byId("field");
      if (fi) { fi.value = d + " "; fi.focus(); }
    });
    wrap.appendChild(ch);
  });

  row.appendChild(wrap);
}

export function hideAiSug() {
  setTimeout(() => {
    const ov = byId("ov-input");
    if (ov && ov.style.display !== "none") return;
    const row = byId("aiSugRow");
    if (row) row.style.display = "none";
  }, 180);
}
