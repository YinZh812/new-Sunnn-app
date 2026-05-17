// ui/tabs/goals.js —— 目标页（#page-goals）
//
// 月度预算 + 储蓄目标（基于净结余）CRUD + 进度展示。

import { byId } from "../../utils/dom.js";
import { store } from "../../state/store.js";
import { getCategoryIcon, DEFAULT_CATS_BY_TYPE } from "../../domain/categories.js";
import { lucideSvg, renderIcon } from "../../utils/icons.js";
import { currencySymbol } from "../../utils/format.js";
import { fxTap, fxDelete, fxError } from "../components/sfx.js";
import { openOverlay, closeOverlay } from "../components/overlay.js";

const CUR_NAME_MAP = { EUR: "欧元", CNY: "人民币", USD: "美元", GBP: "英镑", JPY: "日元" };

// ── 模块状态 ────────────────────────────────────────────────────────────────

let _toast = (msg) => { if (window.showToast) window.showToast(msg); };

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init({ toast } = {}) {
  if (toast) _toast = toast;
  store.on("goals:changed",    maybeRefresh);
  store.on("budgets:changed",  maybeRefresh);
  store.on("txs:changed",      maybeRefresh);
  store.on("settings:changed", maybeRefresh);
  store.on("cats:changed",     maybeRefresh);
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
  const customByType = store.getCustomCategoriesByType();
  const expCats = (customByType.expense && customByType.expense.length)
    ? customByType.expense : DEFAULT_CATS_BY_TYPE.expense;
  const hasBudget = Object.keys(store.getBudgets());
  const seen = {};
  const out = [];
  expCats.forEach((c) => { if (c.name && !seen[c.name]) { seen[c.name] = 1; out.push(c.name); } });
  hasBudget.forEach((c) => { if (c && !seen[c]) { seen[c] = 1; out.push(c); } });
  return out;
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

export function render() {
  const budgets = store.getBudgets();
  const goals = store.getGoals();
  const customByType = store.getCustomCategoriesByType();

  const spendCats = getBudgetCatList();

  const s = store.getSettings();
  const defCur = s.defaultCurrency || "EUR";
  const defSym = currencySymbol(defCur);
  const defCurName = CUR_NAME_MAP[defCur] || defCur;

  // 预算行
  let bRows = spendCats.map((c) => {
    const ico = getCategoryIcon(c, customByType, { size: 22, strokeWidth: 1.6 });
    return '<div class="bsr">' +
      '<div class="bsr-ico">' + ico + '</div>' +
      '<div class="bsr-name">' + c + '</div>' +
      '<div class="bsr-cur">' + defSym + '</div>' +
      '<input type="number" class="set-input" placeholder="不限" value="' +
        (budgets[c] || "") + '" data-c="' + c + '" onchange="setBudget(this)">' +
    '</div>';
  }).join("");

  bRows += '<div class="bsr" onclick="openBudgetCatEditor()" style="cursor:pointer;justify-content:center;align-items:center;gap:6px;color:var(--acc);font-size:13px;padding:10px 0">' +
    '<span style="display:inline-flex;align-items:center;color:var(--acc)">' + lucideSvg("settings", 16, 1.6) + '</span>编辑类别</div>';

  // 目标列表
  const goalList = goals.map((g, i) => {
    const startLbl = g.startDate
      ? new Date(g.startDate).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" }) + " 起"
      : "全部历史";
    const ico = g.icon ? renderIcon(g.icon, 22, 1.6) : "🏦";
    return '<div class="bsr" style="flex-wrap:wrap">' +
      '<div class="bsr-ico goal-ico-edit" onclick="editGoalIcon(' + i + ')" title="点击换图标">' + ico + '</div>' +
      '<div class="bsr-name">' + g.name + '</div>' +
      '<div class="bsr-cur">目标 ' + defSym + g.target + '</div>' +
      '<div style="cursor:pointer;color:var(--expense);font-size:12px;padding:0 8px" onclick="deleteGoal(' + i + ')">删除</div>' +
      '<div style="width:100%;font-size:10px;color:var(--t3);padding:0 14px 4px">' + startLbl + '</div>' +
    '</div>';
  }).join("");

  // 获取最早交易日期，用于 date input 的 min 值
  const txs = store.getTxs();
  const minDateStr = txs.length
    ? new Date(Math.min(...txs.map((t) => t.ts))).toISOString().slice(0, 10)
    : "";

  // 写入 DOM
  const bEl = byId("goals-budget-section");
  const sEl = byId("goals-savings-section");

  if (bEl) {
    bEl.innerHTML = '<div class="set-card"><div class="set-title">月度预算（' + defCurName + '）</div>' + bRows + '</div>';
  }

  if (sEl) {
    sEl.innerHTML = '<div class="set-card"><div class="set-title">储蓄目标</div>' +
      (goalList || '<div style="padding:10px 14px;font-size:12px;color:var(--t3)">还没有目标，添加一个吧</div>') +
      '<div class="goal-form">' +
        '<input type="text" id="goalName" placeholder="目标名称（如：买车、旅游）">' +
        '<input type="number" id="goalAmt" placeholder="目标金额（' + defCurName + '）" step="100">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--t2)">' +
          '<span>起始日期</span>' +
          '<input type="date" id="goalStartDate" style="flex:1;font-size:12px;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--t1)"' +
            (minDateStr ? ' min="' + minDateStr + '"' : '') + '>' +
          '<span style="font-size:10px;color:var(--t3)">不填则从全部历史计算</span>' +
        '</div>' +
        '<div class="goal-form-row">' +
          '<button class="gf-no" onclick="document.getElementById(\'goalName\').value=\'\';document.getElementById(\'goalAmt\').value=\'\';document.getElementById(\'goalStartDate\').value=\'\'">清空</button>' +
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
  const dateEl = byId("goalStartDate");
  const name = nameEl ? nameEl.value.trim() : "";
  const amt = amtEl ? parseFloat(amtEl.value) : 0;
  if (!name || !amt || amt <= 0) { _toast("请填写名称和金额"); return; }
  const goal = { name, target: amt, id: Date.now() };
  if (dateEl && dateEl.value) {
    goal.startDate = new Date(dateEl.value + "T00:00:00").getTime();
  }
  const goals = store.getGoals().slice();
  goals.push(goal);
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

// ── 预算类别编辑器 ──────────────────────────────────────────────────────────

export function openBudgetCatEditor() {
  fxTap();
  const s = store.getSettings();
  if (!s.budgetCatOrder) {
    s.budgetCatOrder = getBudgetCatList();
    store.setSettings(s);
  }
  openOverlay("ov-bcat-edit");
  renderBudgetCatEditor();
}

export function closeBudgetCatEditor() {
  render();
  closeOverlay("ov-bcat-edit");
}

export function renderBudgetCatEditor() {
  const listEl = document.getElementById("bcatEditList");
  if (!listEl) return;
  listEl.innerHTML = "";
  const s = store.getSettings();
  const order = s.budgetCatOrder || [];
  const customByType = store.getCustomCategoriesByType();
  order.forEach(function (c, i) {
    const r = document.createElement("div");
    r.className = "bcat-row";
    r.setAttribute("data-i", i);
    r.setAttribute("draggable", "true");
    const ico = document.createElement("div");
    ico.className = "bcat-row-ico";
    ico.innerHTML = getCategoryIcon(c, customByType, { size: 20, strokeWidth: 1.6 });
    const nm = document.createElement("div");
    nm.className = "bcat-row-name";
    nm.textContent = c;
    const del = document.createElement("div");
    del.className = "bcat-row-del";
    del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    del.title = "删除";
    del.onclick = function (e) {
      e.stopPropagation();
      if (!confirm("删除「" + c + "」预算？")) return;
      const budgets = { ...store.getBudgets() };
      delete budgets[c];
      store.setBudgets(budgets);
      const ss = store.getSettings();
      ss.budgetCatOrder.splice(i, 1);
      store.setSettings(ss);
      renderBudgetCatEditor();
      fxDelete();
    };
    const drag = document.createElement("div");
    drag.className = "bcat-row-drag";
    drag.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>';
    r.appendChild(ico);
    r.appendChild(nm);
    r.appendChild(del);
    r.appendChild(drag);
    r.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", String(i));
      r.classList.add("dragging");
    });
    r.addEventListener("dragend", function () { r.classList.remove("dragging"); });
    r.addEventListener("dragover", function (e) { e.preventDefault(); });
    r.addEventListener("drop", function (e) {
      e.preventDefault();
      const src = parseInt(e.dataTransfer.getData("text/plain"));
      const dst = i;
      if (src === dst || isNaN(src)) return;
      const ss = store.getSettings();
      const arr = ss.budgetCatOrder;
      const moved = arr.splice(src, 1)[0];
      arr.splice(dst, 0, moved);
      store.setSettings(ss);
      renderBudgetCatEditor();
    });
    drag.addEventListener("touchstart", function (e) {
      e.preventDefault();
      r.classList.add("dragging");
    }, { passive: false });
    drag.addEventListener("touchmove", function (e) {
      e.preventDefault();
      const y = e.touches[0].clientY;
      let el = document.elementFromPoint(e.touches[0].clientX, y);
      while (el && !el.classList.contains("bcat-row")) el = el.parentNode;
      if (!el || el === r) return;
      const ti = parseInt(el.getAttribute("data-i"));
      if (isNaN(ti)) return;
      const ss = store.getSettings();
      const arr = ss.budgetCatOrder;
      const moved = arr.splice(i, 1)[0];
      arr.splice(ti, 0, moved);
      store.setSettings(ss);
      renderBudgetCatEditor();
    }, { passive: false });
    drag.addEventListener("touchend", function () { r.classList.remove("dragging"); });
    listEl.appendChild(r);
  });
  if (!order.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--t3);font-size:12px">暂无类别，点右上 + 添加</div>';
  }
}

export function addBudgetCatNew() {
  const name = (prompt("新类别名称：") || "").trim();
  if (!name) return;
  const s = store.getSettings();
  if (!s.budgetCatOrder) s.budgetCatOrder = getBudgetCatList();
  if (s.budgetCatOrder.indexOf(name) >= 0) {
    _toast("已存在");
    return;
  }
  s.budgetCatOrder.push(name);
  store.setSettings(s);
  renderBudgetCatEditor();
  fxTap();
}

// ── 目标图标编辑 ──────────────────────────────────────────────────────────────

const GOAL_ICONS = [
  "piggy-bank", "wallet", "landmark", "banknote", "coins",
  "home", "car", "plane", "palmtree", "ship",
  "graduation-cap", "heart-pulse", "baby", "gift", "camera",
  "laptop", "smartphone", "tv", "music", "book-open",
  "dumbbell", "trophy", "star", "diamond", "target",
];

export function editGoalIcon(idx) {
  const goals = store.getGoals();
  const g = goals[idx];
  if (!g) return;
  const ov = document.getElementById("ov-goal-icon");
  if (!ov) return;
  const grid = document.getElementById("goalIconGrid");
  grid.innerHTML = "";
  GOAL_ICONS.forEach((n) => {
    const c = document.createElement("div");
    c.className = "lp-cell";
    c.innerHTML = lucideSvg(n, 24, 1.6);
    c.onclick = () => {
      g.icon = "lucide:" + n;
      store.setGoals(goals.slice());
      closeOverlay("ov-goal-icon");
      render();
      fxTap();
    };
    grid.appendChild(c);
  });
  const emoBtn = document.getElementById("goalIconEmojiBtn");
  if (emoBtn) {
    emoBtn.onclick = () => {
      const v = prompt("输入 Emoji");
      if (!v) return;
      g.icon = v.trim();
      store.setGoals(goals.slice());
      closeOverlay("ov-goal-icon");
      render();
      fxTap();
    };
  }
  openOverlay("ov-goal-icon");
}
