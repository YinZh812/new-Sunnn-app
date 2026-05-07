// ui/modals/search.js —— 搜索弹窗（#ov-search）
//
// 顶部放大镜按钮触发；输入实时过滤本地 txs（描述/类别/金额/时间标签），
// 结果按 ts 降序，带类别图标和 ">" 箭头，点击 → openDetail。
//
// 迁移说明：
//   inline 的 openSearchSheet / doSearchSheet → 桥接到 open / doSearch。
//   HTML 中 oninput="doSearchSheet()" → window.doSearchSheet = doSearch。

import { byId, on } from "../../utils/dom.js";
import { openOverlay, closeOverlay, attachSheetSwipe } from "../components/overlay.js";
import { fxOpen } from "../components/sfx.js";
import { store } from "../../state/store.js";
import { getCategoryIcon } from "../../domain/categories.js";
import { escapeHtml, formatSignedAmount, currencySymbol } from "../../utils/format.js";
import { formatTransactionTimeInline } from "../../domain/dates.js";

const OVERLAY_ID = "ov-search";
const SHEET_ID   = "sh-search";
const HANDLE_ID  = "hdl-search";

let _detailModal = null;

// ── 类别图标帮手 ────────────────────────────────────────────────────────────

function getCatIco(name) {
  return getCategoryIcon(name, store.getCustomCategoriesByType(), { size: 22, strokeWidth: 1.6 });
}

// ── 时间块 HTML（与 mainTab 的 timeBlockHtml 对齐，但搜索结果不需要 onclick） ──

function timBlockHtml(tx) {
  const txt = formatTransactionTimeInline(tx);
  if (!txt) return '';
  return '<div class="tim"><span class="tim-date">' + escapeHtml(txt) + '</span></div>';
}

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init(deps = {}) {
  _detailModal = deps.detailModal || null;
  attachSheetSwipe(SHEET_ID, HANDLE_ID, close);
  // oninput 已经在 HTML 的 oninput="doSearchSheet()" 里，通过 window 桥接调 doSearch
}

// ── 打开 / 关闭 ────────────────────────────────────────────────────────────

export function open() {
  fxOpen();
  const inp = byId("searchSheetInput");
  if (inp) inp.value = "";
  const res = byId("searchSheetResults");
  if (res) res.innerHTML = '<div class="search-empty">输入关键词开始搜索</div>';
  const ov = byId(OVERLAY_ID);
  if (ov) ov.style.display = "flex";
  setTimeout(() => { byId("searchSheetInput")?.focus(); }, 150);
}

export function close() {
  closeOverlay(OVERLAY_ID);
  const inp = byId("searchSheetInput");
  if (inp) inp.value = "";
  const res = byId("searchSheetResults");
  if (res) res.innerHTML = "";
}

// ── 搜索并渲染结果 ──────────────────────────────────────────────────────────

export function doSearch() {
  const q = (byId("searchSheetInput")?.value || "").trim().toLowerCase();
  const res = byId("searchSheetResults");
  if (!res) return;

  if (!q) {
    res.innerHTML = '<div class="search-empty">输入关键词开始搜索</div>';
    return;
  }

  const txs = store.getTxs();
  const found = txs.filter((t) =>
    (t.desc || "").toLowerCase().includes(q) ||
    (t.category || "").toLowerCase().includes(q) ||
    String(t.amount).includes(q) ||
    (t.timeLabel || "").includes(q)
  );

  if (!found.length) {
    res.innerHTML = '<div class="search-empty">没有找到相关记录</div>';
    return;
  }

  // 清空，创建一个 tg card 容器
  res.innerHTML = "";
  const card = document.createElement("div");
  card.className = "tg";
  card.style.margin = "0 0 6px 0";

  // 按时间降序
  found.sort((a, b) => b.ts - a.ts);

  found.forEach((t) => {
    const ico = getCatIco(t.category);
    const idx = txs.indexOf(t);
    const div = document.createElement("div");
    div.className = "ti";
    div.setAttribute("data-idx", idx);
    div.innerHTML =
      '<div class="tic">' + ico + '</div>' +
      '<div class="tin"><div class="tid">' + escapeHtml(t.desc) + '</div>' +
        timBlockHtml(t) +
      '</div>' +
      '<div class="tia">' + formatSignedAmount(t) + '</div>' +
      '<div class="ti-more"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="m9 18 6-6-6-6"/></svg></div>';

    div.onclick = function () {
      closeOverlay(OVERLAY_ID);
      const i = parseInt(this.getAttribute("data-idx"));
      if (_detailModal) {
        _detailModal.open(i);
      } else if (typeof window.openDetail === "function") {
        window.openDetail(i);
      }
    };

    card.appendChild(div);
  });

  res.appendChild(card);
}
