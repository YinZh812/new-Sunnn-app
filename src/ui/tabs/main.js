// ui/tabs/main.js —— 账单页（#t-main）
//
// 模块化进度：
//   ✅ renderHero —— Hero 顶部区
//   ✅ renderList —— 交易列表（按日分组 + 左滑删除 + 内联编辑入口）
//   ✅ inlineEditDesc —— 列表行就地编辑描述
//   ⚠️ inlineEditAmt（金额计算器弹窗 + #ov-iamt）、WheelTime 仍由 inline 实现
//
// 视图状态（_viewYear/_viewMonth）属于本 tab 私有，不进 store。
// inline 的 changeMonth() 会调 render() → 经 window.renderList 桥接进入 mainTab.renderList，
// renderList 会在内部同步 _viewYear/_viewMonth。

import { byId, qsa } from "../../utils/dom.js";
import { store } from "../../state/store.js";
import { isInMonth, formatGroupHeader, formatTransactionTimeInline } from "../../domain/dates.js";
import { safeRate, toEur, netInEur, sumByTypeInEur } from "../../domain/currency.js";
import { getCategoryIcon } from "../../domain/categories.js";
import {
  currencySymbol, splitDecimal, pad2, escapeHtml, formatSignedAmount,
} from "../../utils/format.js";
import {
  attachListEdgeMonthSwipe, attachRowSwipeDelete, resetAllRowSwipes,
} from "../components/swipe.js";

let _viewYear  = new Date().getFullYear();
let _viewMonth = new Date().getMonth();

let _toast = null;

// 行模板里复用的两段 SVG（出自 inline 旧版，保持像素一致）
const TRASH_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>' +
  '<line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';

const CHEVRON_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="m9 18 6-6-6-6"/></svg>';

// ── 入口 ─────────────────────────────────────────────────────────────────────

export function init(deps = {}) {
  _toast = deps.toast || ((msg) => console.log("[toast]", msg));

  // 列表边缘换月手势（DOM id 与 inline 一致：#list）
  // 注意：inline 的 initListEdgeScroll 也会绑同一个容器，靠 dataset.edgeBound 防重。
  // 谁先绑谁就生效；inline 在同步执行末尾的 render() 里已经绑过 → 这里不会重复。
  // 等下一波删除 inline.initListEdgeScroll 时，模块版接管。
  const list = byId("list");
  if (list) {
    attachListEdgeMonthSwipe(list, {
      canGoNext: () => {
        const nm = _viewMonth + 1;
        const ny = nm > 11 ? _viewYear + 1 : _viewYear;
        const nmm = nm > 11 ? 0 : nm;
        const now = new Date();
        if (ny < now.getFullYear() || (ny === now.getFullYear() && nmm <= now.getMonth())) return true;
        return store.getTxs().some((t) => {
          const d = new Date(t.ts);
          return d.getFullYear() === ny && d.getMonth() === nmm;
        });
      },
      onChange: (step) => {
        // inline 的 changeMonth 改 viewYear/viewMonth + render()，render 会调 setViewYearMonth 同步过来
        if (typeof window.changeMonth === "function") window.changeMonth(step);
        else changeMonth(step);
      },
      onBlocked: (msg) => _toast(msg),
    });
  }
}

// ── 视图状态 ────────────────────────────────────────────────────────────────

export const getViewYear  = () => _viewYear;
export const getViewMonth = () => _viewMonth;

/** inline 在 changeMonth/openPicker 后通过此函数把月份同步过来。 */
export function setViewYearMonth(year, month) {
  _viewYear  = year;
  _viewMonth = month;
}

/** 模块自身的月份切换（inline 退役后启用）。 */
export function changeMonth(delta) {
  _viewMonth += delta;
  if (_viewMonth > 11) { _viewMonth = 0; _viewYear++; }
  if (_viewMonth < 0)  { _viewMonth = 11; _viewYear--; }
  render();
}

// ── 全量刷新 ────────────────────────────────────────────────────────────────

export function render() {
  renderHero();
  renderList();
}

// ── Hero 渲染 ───────────────────────────────────────────────────────────────

/**
 * 渲染顶部 Hero 区：
 *   - 旧字段：hnet（净额）/ hperiod / sin / sout / ssave / curToggleBtn
 *   - 新字段(v2)：navTitle / an-period / a2-year / a2-month / a2-income-int+dec / a2-expense-int+dec
 *   - 储蓄浮层：savings-panel-amt
 *
 * 与原 inline render() 行 393-409 行为完全等价。
 */
export function renderHero() {
  const txs      = store.getTxs();
  const settings = store.getSettings();
  const rate     = safeRate(settings.eurToCny);

  const mo = txs.filter((t) => isInMonth(t, _viewYear, _viewMonth));

  // 1. 净额（hnet 始终用欧元符号，与原行为一致）
  const net = mo.reduce((acc, t) => acc + netInEur(t, rate), 0);
  setText("hnet", `${net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(2)} €`);

  // 2. 年月文字
  const ymShort = `${_viewYear}年 · ${_viewMonth + 1}月`;
  const ymCaret = `${_viewYear}年${_viewMonth + 1}月 ▾`;
  setText("hperiod",   ymShort);
  setText("navTitle",  ymCaret);
  setText("an-period", ymCaret);

  // 3. 收入/支出/储蓄欧元化（net_income 计入 income）
  const incEUR = sumByTypeInEur(mo, "income",  rate);
  const expEUR = sumByTypeInEur(mo, "expense", rate);
  const savEUR = sumByTypeInEur(mo, "savings", rate);

  // 4. 显示币种切换（注意：displayCurrency ≠ defaultCurrency）
  //
  // ⚠️ 产品行为（非 bug）：
  //   - hero 顶部 €/¥ 按钮只影响 Hero 总额：欧元 × 汇率 → 显示为人民币
  //   - 列表里每行交易仍按 tx.currency 原币种显示（€ 行就是 €，¥ 行就是 ¥）
  //   - 所以 hero 总额 ≠ 列表行金额加和（按设计如此）
  //   - 如果以后想"切换列表也跟着切"，需要在 renderList 里把每行金额按 displayCurrency 转换
  const dispCur = settings.displayCurrency || "EUR";
  const dispSym = currencySymbol(dispCur);
  const inc = dispCur === "CNY" ? incEUR * rate : incEUR;
  const exp = dispCur === "CNY" ? expEUR * rate : expEUR;
  const sav = dispCur === "CNY" ? savEUR * rate : savEUR;

  // 5. 旧字段（display:none 但保留，便于回退）
  setText("sin",   `${inc.toFixed(2)} ${dispSym}`);
  setText("sout",  `${exp.toFixed(2)} ${dispSym}`);
  setText("ssave", `${sav.toFixed(2)} ${dispSym}`);

  // 6. 顶部货币切换按钮
  setText("curToggleBtn", dispSym);

  // 7. v2 字段（int + dec 分号大小）
  setText("a2-year",  `${_viewYear}年`);
  setText("a2-month", pad2(_viewMonth + 1));
  const incS = splitDecimal(inc);
  const expS = splitDecimal(exp);
  setText("a2-income-int",  incS.int);
  setText("a2-income-dec",  incS.dec);
  setText("a2-expense-int", expS.int);
  setText("a2-expense-dec", expS.dec);

  // 8. 储蓄浮层
  setText("savings-panel-amt", `${sav.toFixed(2)} ${dispSym}`);
}

// ── 列表渲染 ────────────────────────────────────────────────────────────────

/**
 * 渲染交易列表。与原 inline renderList(mo) 行为完全等价。
 *
 * @param {Array} [moOverride] 可选：传入已过滤的本月交易；不传则自取。
 *   双轨期 inline render() 会传 mo 进来；模块自驱动时（store.on）不传，自取。
 */
export function renderList(moOverride) {
  const list = byId("list");
  if (!list) return;

  // 关掉已展开的左滑行（避免重渲染后状态错位）
  resetAllRowSwipes();

  // 清旧分组与边缘指示器，保留容器本身
  for (const old of qsa(".tg,.sec,.list-edge-indicator", list)) old.remove();

  const txs = store.getTxs();
  const mo  = moOverride || txs.filter((t) => isInMonth(t, _viewYear, _viewMonth));

  if (!mo.length) {
    list.innerHTML = '<div class="empty-mo">本月暂无记录<br>点右下 + 手动添加<br>或输入一句话</div>';
    return;
  }
  list.innerHTML = "";

  // 同日内：精确时间（exact/daytime）放在仅日期记录之后；否则按时间倒序
  const sorted = [...mo].sort((a, b) => {
    if (new Date(a.ts).toDateString() === new Date(b.ts).toDateString()) {
      const aT = (a.timePrecision === "exact" || a.timePrecision === "daytime");
      const bT = (b.timePrecision === "exact" || b.timePrecision === "daytime");
      if (!aT && bT) return -1;
      if (aT && !bT) return 1;
    }
    return b.ts - a.ts;
  });

  // 按日期/月/年精度分组
  const groups = {};
  const order = [];
  for (const t of sorted) {
    const d = new Date(t.ts);
    const k = t.timePrecision === "month"     ? `${d.getFullYear()}-${d.getMonth()}`
            : t.timePrecision === "year_only" ? `${d.getFullYear()}y`
            :                                    d.toDateString();
    if (!groups[k]) {
      groups[k] = { lbl: formatGroupHeader(t), items: [] };
      order.push(k);
    }
    groups[k].items.push(t);
  }

  const settings = store.getSettings();
  const rate     = safeRate(settings.eurToCny);
  const customByType = store.getCustomCategoriesByType();

  for (const k of order) {
    const g = groups[k];

    // 分组头：日期 + 当日收支汇总（始终欧元）
    let inSum = 0, exSum = 0;
    for (const t of g.items) {
      const vEur = toEur(t, rate);
      if (t.type === "income")        inSum += vEur;
      else if (t.type === "expense")  exSum += vEur;
    }
    let sumHtml = "";
    if (inSum > 0 && exSum > 0) {
      sumHtml = `<span class="sec-sum">收 +${inSum.toFixed(2)}€  支 −${exSum.toFixed(2)}€</span>`;
    } else if (inSum > 0) {
      sumHtml = `<span class="sec-sum">收 +${inSum.toFixed(2)}€</span>`;
    } else if (exSum > 0) {
      sumHtml = `<span class="sec-sum">支 −${exSum.toFixed(2)}€</span>`;
    }

    const sec = document.createElement("div");
    sec.className = "sec";
    sec.innerHTML = `<span class="sec-lbl">${g.lbl}</span>${sumHtml}`;
    list.appendChild(sec);

    // 当组的交易行
    const card = document.createElement("div");
    card.className = "tg";
    for (const t of g.items) {
      const ico = getCategoryIcon(t.category, customByType, { size: 22, strokeWidth: 1.6 });
      const idx = txs.indexOf(t);
      const div = document.createElement("div");
      div.className = "ti";
      div.setAttribute("data-idx", idx);

      div.innerHTML =
        `<button type="button" class="ti-delete-btn" aria-label="删除">${TRASH_ICON}</button>` +
        `<div class="ti-content">` +
          `<div class="tic" data-role="cat">${ico}</div>` +
          `<div class="tin" data-role="desc">` +
            `<div class="tid">${escapeHtml(t.desc)}</div>` +
            timeBlockHtml(t, idx) +
          `</div>` +
          `<div class="tia" data-role="amt">${formatSignedAmount(t)}</div>` +
          `<div class="ti-more" data-role="detail">${CHEVRON_ICON}</div>` +
        `</div>`;

      // 左滑删除 + 点击分发：onIcon→详情，onDesc→编辑描述，onAmount→编辑金额，onDelete→删除确认
      // 这些回调函数本身仍由 inline 实现（openDetail / inlineEditDesc / inlineEditAmt / confirmDelete）。
      attachRowSwipeDelete(div, {
        onIconTap:    (i) => window.openDetail?.(i),
        onDescTap:    (i, row) => window.inlineEditDesc?.(i, row),
        onAmountTap:  (i, row) => window.inlineEditAmt?.(i, row),
        onDeleteTap:  (i) => window.confirmDelete?.(i),
      });

      card.appendChild(div);
    }
    list.appendChild(card);
  }
}

/**
 * 单行的时间块 HTML。与原 inline listTimBlockHtml 行为一致。
 * 时间标签的点击仍走 inline 的 openWheelTimeForTx（待后续迁移）。
 * 顺手用 escapeHtml 包了 textContent，比 inline 直接拼字符串更安全。
 */
function timeBlockHtml(tx, idx) {
  const txt  = formatTransactionTimeInline(tx);
  const hide = txt ? "" : ` style='display:none'`;
  const safe = txt ? escapeHtml(txt) : "";
  return `<div class="tim"${hide} data-idx="${idx}" onclick="event.stopPropagation();openWheelTimeForTx(${idx})">` +
         `<span class="tim-date" data-role="time">${safe}</span></div>`;
}

// ── 内联编辑：描述 ───────────────────────────────────────────────────────────

/**
 * 列表行就地编辑描述。与原 inline inlineEditDesc 行为完全等价。
 * 依赖 window.getTopDescs（inline 未迁移）、window.saveTxs、window.render（均已桥接）。
 */
export function inlineEditDesc(idx, rowEl) {
  const txs = store.getTxs();
  const t = txs[idx];
  if (!t) return;
  const tidEl = rowEl.querySelector(".tid");
  if (!tidEl || tidEl._editing) return;
  tidEl._editing = true;

  if (typeof window.fxOpen === "function") window.fxOpen();
  tidEl.classList.add("editing-hl");

  const origText = t.desc;
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = origText;
  inp.style.cssText =
    "background:transparent;border:0;outline:none;color:var(--t1);font-size:16px;" +
    "width:100%;font-family:inherit;padding:0;transform:scale(0.8125);" +
    "transform-origin:left center;line-height:1";
  tidEl.innerHTML = "";
  tidEl.appendChild(inp);

  // 建议条
  const sugBar = document.createElement("div");
  sugBar.className = "inline-sug-bar";
  sugBar.style.cssText =
    "position:absolute;left:0;right:0;bottom:100%;background:var(--card);" +
    "border:1px solid var(--bdr);border-radius:8px;padding:6px;display:flex;" +
    "gap:6px;flex-wrap:wrap;max-width:90vw;z-index:50;box-shadow:0 4px 12px rgba(0,0,0,.15);" +
    "margin-bottom:4px";

  function refreshSug() {
    sugBar.innerHTML = "";
    const top = (typeof window.getTopDescs === "function"
      ? window.getTopDescs(8, origText)
      : []).filter((d) => !inp.value || d.toLowerCase().indexOf(inp.value.toLowerCase()) >= 0);
    if (!top.length) { sugBar.style.display = "none"; return; }
    sugBar.style.display = "flex";
    top.forEach((d) => {
      const ch = document.createElement("span");
      ch.textContent = d;
      ch.style.cssText =
        "background:var(--bdr2);color:var(--t1);font-size:11px;padding:4px 8px;" +
        "border-radius:10px;cursor:pointer";
      ch.onmousedown = (e) => { e.preventDefault(); inp.value = d; refreshSug(); };
      ch.ontouchend  = (e) => { e.preventDefault(); inp.value = d; refreshSug(); };
      sugBar.appendChild(ch);
    });
  }

  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative";
  tidEl.parentNode.insertBefore(wrap, tidEl);
  wrap.appendChild(sugBar);
  wrap.appendChild(tidEl);
  refreshSug();
  inp.oninput = refreshSug;
  inp.focus();
  inp.select();

  function commit(save) {
    if (save) {
      const v = inp.value.trim();
      if (v && v !== origText) {
        t.desc = v;
        if (typeof window.saveTxs === "function") window.saveTxs(txs);
      }
    }
    tidEl._editing = false;
    tidEl.classList.remove("editing-hl");
    if (wrap.parentNode) {
      wrap.parentNode.insertBefore(tidEl, wrap);
      wrap.remove();
    }
    if (typeof window.render === "function") window.render();
  }

  inp.addEventListener("blur", () => setTimeout(() => commit(true), 150));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
    else if (e.key === "Escape") { commit(false); }
  });
}

// ── 容错的 textContent 写入 ─────────────────────────────────────────────────

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}
