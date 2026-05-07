// ui/tabs/analysis.js —— 分析页（#t-analysis）
//
// 内容：支出/收入 tab 切换 → 类别构成 SVG 饼图 + 类别排行榜 + 月度预算进度 + 储蓄目标进度。
//
// 与原 inline renderAnalysis() 行为完全等价。
//
// 私有状态：
//   _analysisTab —— "expense" | "income"，对应顶部小 tab。
//
// 视图状态（year/month）从 mainTab 取（保持单一真相）。

import { byId } from "../../utils/dom.js";
import { store } from "../../state/store.js";
import { isInMonth } from "../../domain/dates.js";
import { safeRate, toEur, totalSavingsInEur } from "../../domain/currency.js";
import { LEGACY_CAT_COLOR, getCategoryIcon } from "../../domain/categories.js";
import { fxTab } from "../components/sfx.js";
import { getViewYear, getViewMonth } from "./main.js";

// SVG 圆周长（半径 32 → 2π·32 ≈ 201.06）
const PIE_RADIUS = 32;
const CIRC = 2 * Math.PI * PIE_RADIUS;

let _analysisTab = "expense"; // "expense" | "income"

export function init() {
  // 切月、删交易、新增交易等数据变化时若分析页可见则刷新
  store.on("txs:changed",     maybeRefresh);
  store.on("budgets:changed", maybeRefresh);
  store.on("goals:changed",   maybeRefresh);
}

/** nav 切到本 tab 时调（已在 main.js 注册）。 */
export function onShow() {
  render();
}

/** 切换"支出 / 收入"小 tab。inline.setAnalysisTab 桥接到这里。 */
export function setAnalysisTab(v) {
  fxTab();
  _analysisTab = v === "income" ? "income" : "expense";
  render();
}

export const getAnalysisTab = () => _analysisTab;

function isVisible() {
  const node = byId("t-analysis");
  return !!node && node.style.display !== "none";
}

function maybeRefresh() {
  if (isVisible()) render();
}

// ── 主渲染 ──────────────────────────────────────────────────────────────────

export function render() {
  const body = byId("analysis-body");
  if (!body) return;

  const txs      = store.getTxs();
  const settings = store.getSettings();
  const budgets  = store.getBudgets();
  const goals    = store.getGoals();
  const customByType = store.getCustomCategoriesByType();
  const rate     = safeRate(settings.eurToCny);

  const viewYear  = getViewYear();
  const viewMonth = getViewMonth();
  const mo = txs.filter((t) => isInMonth(t, viewYear, viewMonth));

  // tab 控制：支出 / 收入
  const isIncome   = _analysisTab === "income";
  const typeFilter = isIncome ? ["income"] : ["expense", "net_income"];
  const typeLabel  = isIncome ? "收入" : "支出";
  const emptyMsg   = isIncome ? "本月暂无收入记录" : "本月暂无支出记录";

  // 按类别累计
  const rows = mo.filter((t) => typeFilter.includes(t.type));
  const catTotals = {};
  for (const t of rows) {
    catTotals[t.category] = (catTotals[t.category] || 0) + toEur(t, rate);
  }
  const cats  = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
  const total = cats.reduce((a, c) => a + catTotals[c], 0);

  let html = renderTabs();

  if (!cats.length) {
    html += `<div style="text-align:center;padding:30px;color:var(--t3);font-size:12px">${emptyMsg}</div>`;
  } else {
    html += renderPie(typeLabel, total, cats, catTotals);
    html += `<div class="s-title">类别排行</div>`;
    html += renderRanking(cats, catTotals, total, customByType);
    if (!isIncome) {
      const bHtml = renderBudgets(catTotals, budgets, customByType);
      if (bHtml) html += `<div class="s-title">预算进度</div>${bHtml}`;
    }
  }

  // 储蓄目标进度（独立于支出/收入 tab，始终显示）
  if (goals.length) {
    html += renderGoals(goals, txs, rate);
  }

  body.innerHTML = html;
}

// ── 顶部 tab ────────────────────────────────────────────────────────────────

function renderTabs() {
  const exp = _analysisTab === "expense" ? " active" : "";
  const inc = _analysisTab === "income"  ? " active" : "";
  return `<div class="ana-tabs">` +
         `<div class="ana-tab${exp}" onclick="setAnalysisTab('expense')">支出</div>` +
         `<div class="ana-tab${inc}" onclick="setAnalysisTab('income')">收入</div>` +
         `</div>`;
}

// ── 饼图 + 图例 ──────────────────────────────────────────────────────────────

function renderPie(typeLabel, total, cats, catTotals) {
  let offset = 0;
  let paths = "";
  for (const c of cats) {
    const len = (catTotals[c] / total) * CIRC;
    const color = LEGACY_CAT_COLOR[c] || "#CCC";
    paths += `<circle cx="50" cy="50" r="${PIE_RADIUS}" fill="none" stroke="${color}" stroke-width="18" ` +
             `stroke-dasharray="${len.toFixed(2)} ${CIRC}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    offset += len;
  }
  const legend = cats.slice(0, 6).map((c) => {
    const pct = (catTotals[c] / total * 100).toFixed(0);
    const color = LEGACY_CAT_COLOR[c] || "#CCC";
    return `<div class="leg-item">` +
           `<div class="leg-dot" style="background:${color}"></div>` +
           `<div class="leg-name">${c}</div>` +
           `<div class="leg-pct">${pct}%</div>` +
           `</div>`;
  }).join("");

  return `<div class="s-title">${typeLabel}构成</div>` +
         `<div class="chart-card">` +
           `<svg viewBox="0 0 100 100" width="110" height="110" style="flex-shrink:0">` +
             `<g transform="rotate(-90 50 50)">${paths}</g>` +
             `<text x="50" y="50" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="var(--t2)">${typeLabel}</text>` +
             `<text x="50" y="62" text-anchor="middle" font-size="8" fill="var(--t3)">€${total.toFixed(2)}</text>` +
           `</svg>` +
           `<div class="chart-leg">${legend}</div>` +
         `</div>`;
}

// ── 排行榜 ───────────────────────────────────────────────────────────────────

function renderRanking(cats, catTotals, total, customByType) {
  return cats.map((c, i) => {
    const v = catTotals[c];
    const pct = Math.round(v / total * 100);
    const color = LEGACY_CAT_COLOR[c] || "#CCC";
    const ico = getCategoryIcon(c, customByType, { size: 22, strokeWidth: 1.6 });
    return `<div class="rank-item">` +
             `<div class="rank-n">${i + 1}</div>` +
             `<div class="rank-ico">${ico}</div>` +
             `<div class="rank-info">` +
               `<div class="rank-name">${c}</div>` +
               `<div class="rank-bar-wrap">` +
                 `<div class="rank-bar" style="width:${pct}%;background:${color}"></div>` +
               `</div>` +
             `</div>` +
             `<div class="rank-amt">${v.toFixed(2)} €</div>` +
           `</div>`;
  }).join("");
}

// ── 预算进度 ────────────────────────────────────────────────────────────────

const BUDGET_DEFAULT_CATS = ["餐饮", "超市", "购物", "交通", "娱乐", "生活"];

function renderBudgets(catTotals, budgets, customByType) {
  let html = "";
  for (const c of BUDGET_DEFAULT_CATS) {
    if (!budgets[c]) continue;
    const spent = catTotals[c] || 0;
    const bgt = budgets[c];
    const pct = Math.min(Math.round(spent / bgt * 100), 100);
    const cls = pct >= 100 ? "b-over" : pct >= 80 ? "b-warn" : "b-ok";
    const ico = getCategoryIcon(c, customByType, { size: 22, strokeWidth: 1.6 });
    html += `<div class="budget-card">` +
              `<div class="budget-head">` +
                `<div class="budget-cat">${ico} ${c}</div>` +
                `<div class="budget-nums">${spent.toFixed(2)} / ${bgt} €</div>` +
              `</div>` +
              `<div class="budget-track">` +
                `<div class="budget-fill ${cls}" style="width:${pct}%"></div>` +
              `</div>` +
            `</div>`;
  }
  return html;
}

// ── 储蓄目标进度 ────────────────────────────────────────────────────────────

function renderGoals(goals, txs, rate) {
  const totalSav = totalSavingsInEur(txs, rate);
  let html = `<div class="s-title">储蓄目标</div>`;
  for (const g of goals) {
    const pct = Math.min(Math.round(totalSav / g.target * 100), 100);
    const remaining = Math.max(g.target - totalSav, 0);
    const remainTxt = pct >= 100 ? "🎉 目标达成！" : `还差 €${remaining.toFixed(2)}`;
    html += `<div class="goal-card">` +
              `<div class="goal-head">` +
                `<div class="goal-name">🏦 ${g.name}</div>` +
                `<div class="goal-pct">${pct}%</div>` +
              `</div>` +
              `<div class="goal-amounts">已累计 €${totalSav.toFixed(2)} / 目标 €${g.target}</div>` +
              `<div class="goal-track">` +
                `<div class="goal-fill" style="width:${pct}%"></div>` +
              `</div>` +
              `<div class="goal-remain">${remainTxt}</div>` +
            `</div>`;
  }
  return html;
}
