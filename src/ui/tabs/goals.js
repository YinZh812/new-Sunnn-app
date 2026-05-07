// ui/tabs/goals.js —— 目标页（#page-goals）
//
// 月度预算 + 储蓄目标 CRUD + 进度展示。

import { byId } from "../../utils/dom.js";
import { store } from "../../state/store.js";
import { getCategoryIcon } from "../../domain/categories.js";
import { lucideSvg } from "../../utils/icons.js";
import { fxTap, fxDelete, fxError } from "../components/sfx.js";

// ── 模块状态 ────────────────────────────────────────────────────────────────

let _toast = (msg) => { if (window.showToast) window.showToast(msg); };

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init({ toast } = {}) {
  if (toast) _toast = toast;
  store.on("goals:changed",    maybeRefresh);
  store.on("budgets:changed",  maybeRefresh);
  store.on("txs:changed",      maybeRefresh);
  store.on("settings:changed", maybeRefresh);
}

export function onShow() { render(); }

function maybeRefresh() {
  const node = byId("page-goals");
  if (node && node.style.display !== "none") render();
}

// ── 预算类别列表 ────────────────────────────────────────────────────────────

export function getBudgetCatList() {
  const s = store.getSettings();
  if (s.budgetCatOrder && s.budgetCatOrder.length) return s.budgetCatOrder.slice();
  const defaultSpend = ["餐饮", "超市", "购物", "交通", "娱乐", "生活", "医疗", "其他"];
  const customByType = store.getCustomCategoriesByType();
  const customSpend = (customByType.expense || []).map((c) => c.name);
  const hasBudget = Object.keys(store.getBudgets());
  const allCats = defaultSpend.concat(customSpend).concat(hasBudget);
  const seen = {};
  const out = [];
  allCats.forEach((c) => { if (c && !seen[c]) { seen[c] = 1; out.push(c); } });
  return out;
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

export function render() {
  const budgets = store.getBudgets();
  const goals = store.getGoals();
  const customByType = store.getCustomCategoriesByType();

  const spendCats = getBudgetCatList();

  // 预算行
  let bRows = spendCats.map((c) => {
    const ico = getCategoryIcon(c, customByType, { size: 22, strokeWidth: 1.6 });
    return '<div class="bsr">' +
      '<div class="bsr-ico">' + ico + '</div>' +
      '<div class="bsr-name">' + c + '</div>' +
      '<div class="bsr-cur">€</div>' +
      '<input type="number" class="set-input" placeholder="不限" value="' +
        (budgets[c] || "") + '" data-c="' + c + '" oninput="setBudget(this)">' +
    '</div>';
  }).join("");

  bRows += '<div class="bsr" onclick="openBudgetCatEditor()" style="cursor:pointer;justify-content:center;align-items:center;gap:6px;color:var(--acc);font-size:13px;padding:10px 0">' +
    '<span style="display:inline-flex;align-items:center;color:var(--acc)">' + lucideSvg("settings", 16, 1.6) + '</span>编辑类别</div>';

  // 目标列表
  const goalList = goals.map((g, i) =>
    '<div class="bsr">' +
      '<div class="bsr-name">🏦 ' + g.name + '</div>' +
      '<div class="bsr-cur">目标 €' + g.target + '</div>' +
      '<div style="cursor:pointer;color:var(--expense);font-size:12px;padding:0 8px" onclick="deleteGoal(' + i + ')">删除</div>' +
    '</div>'
  ).join("");

  // 写入 DOM
  const bEl = byId("goals-budget-section");
  const sEl = byId("goals-savings-section");

  if (bEl) {
    bEl.innerHTML = '<div class="set-card"><div class="set-title">月度预算（欧元）</div>' + bRows + '</div>';
  }

  if (sEl) {
    sEl.innerHTML = '<div class="set-card"><div class="set-title">储蓄目标</div>' +
      (goalList || '<div style="padding:10px 14px;font-size:12px;color:var(--t3)">还没有目标，添加一个吧</div>') +
      '<div class="goal-form">' +
        '<input type="text" id="goalName" placeholder="目标名称（如：买车、旅游）">' +
        '<input type="number" id="goalAmt" placeholder="目标金额（欧元）" step="100">' +
        '<div class="goal-form-row">' +
          '<button class="gf-no" onclick="document.getElementById(\'goalName\').value=\'\';document.getElementById(\'goalAmt\').value=\'\'">清空</button>' +
          '<button class="gf-ok" onclick="addGoal()">添加目标</button>' +
        '</div>' +
      '</div></div>';
  }
}

// ── 预算操作 ────────────────────────────────────────────────────────────────

export function setBudget(el) {
  const c = el.getAttribute("data-c");
  const v = parseFloat(el.value);
  const budgets = { ...store.getBudgets() };
  if (v > 0) budgets[c] = v;
  else delete budgets[c];
  store.setBudgets(budgets);
}

// ── 目标操作 ────────────────────────────────────────────────────────────────

export function addGoal() {
  const nameEl = byId("goalName");
  const amtEl = byId("goalAmt");
  const name = nameEl ? nameEl.value.trim() : "";
  const amt = amtEl ? parseFloat(amtEl.value) : 0;
  if (!name || !amt || amt <= 0) { _toast("请填写名称和金额"); return; }
  const goals = store.getGoals().slice();
  goals.push({ name, target: amt, id: Date.now() });
  store.setGoals(goals);
  render();
  _toast("目标已添加 ✓");
}

export function deleteGoal(i) {
  if (!confirm("删除目标？")) return;
  const goals = store.getGoals().slice();
  goals.splice(i, 1);
  store.setGoals(goals);
  render();
}
