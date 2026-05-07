// ui/modals/month-picker.js —— 年月选择器（#mpicker）
//
// 不是标准 .overlay，独立的 .mpicker 弹窗。
// 两种视图：月份网格（默认）vs 年份网格（点年份标签切换）。
// 选中月份后：设置 window.viewYear/viewMonth → 调 render + renderAnalysis。
//
// 迁移说明：
//   inline 的 openPicker/toggleYM/pickerNav/renderPicker/selYear/selMonth → 全部桥接到本模块。
//   HTML 中 onclick="pickerNav(-1)" 等仍走 window 全局。

import { byId } from "../../utils/dom.js";
import { fxTap } from "../components/sfx.js";
import { store } from "../../state/store.js";

const MODAL_ID = "mpicker";

let _pickerYear = new Date().getFullYear();
let _showYearGrid = false;   // true = 年份网格; false = 月份网格

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init() {
  // 事件已经在 HTML onclick 属性中绑定了 pickerNav / toggleYM / selYear / selMonth，
  // 通过 window 桥接调到本模块。不需要额外 addEventListener。
}

// ── 打开 / 关闭 ────────────────────────────────────────────────────────────

export function open() {
  // 读取当前 viewYear（由 inline 或模块维护的全局变量）
  _pickerYear = typeof window.viewYear === "number" ? window.viewYear : new Date().getFullYear();
  _showYearGrid = false;
  render();
  const m = byId(MODAL_ID);
  if (m) m.style.display = "flex";
}

export function close() {
  const m = byId(MODAL_ID);
  if (m) m.style.display = "none";
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

export function render() {
  const yLbl = byId("pyLbl");
  const pyL  = byId("pyL");
  const pyR  = byId("pyR");
  const body = byId("pickerBody");
  if (!body) return;

  // 年份标签：月份模式显示 "2026年 ▾"，年份模式显示 "选择年份 ▴"
  if (yLbl) yLbl.textContent = _showYearGrid ? "选择年份 ▴" : _pickerYear + "年 ▾";
  if (pyL)  pyL.textContent  = _showYearGrid ? "‹‹" : "‹";
  if (pyR)  pyR.textContent  = _showYearGrid ? "››" : "›";

  const viewYear  = typeof window.viewYear  === "number" ? window.viewYear  : new Date().getFullYear();
  const viewMonth = typeof window.viewMonth === "number" ? window.viewMonth : new Date().getMonth();

  if (_showYearGrid) {
    // ── 年份网格：当前十年区间 ± 1 年，共 12 格 ──
    const sy = Math.floor(_pickerYear / 10) * 10 - 1;
    let h = '<div class="year-grid">';
    for (let y = sy; y < sy + 12; y++) {
      h += '<div class="yr-btn' + (y === viewYear ? " active" : "") +
           '" onclick="selYear(' + y + ')">' + y + '</div>';
    }
    h += '</div>';
    body.innerHTML = h;
  } else {
    // ── 月份网格：12 个月，标记 active / has-data ──
    // 扫描 txs 找哪些月份有数据
    const txs = store.getTxs();
    const hd = {};
    txs.forEach((t) => {
      const d = new Date(t.ts);
      hd[d.getFullYear() + "-" + d.getMonth()] = 1;
    });

    let h2 = '<div class="mpicker-grid">';
    for (let m = 0; m < 12; m++) {
      const isActive  = (_pickerYear === viewYear && m === viewMonth);
      const hasData   = hd[_pickerYear + "-" + m];
      h2 += '<div class="mpm' +
             (isActive ? " active" : "") +
             (hasData && !isActive ? " has-data" : "") +
             '" onclick="selMonth(' + m + ')">' + (m + 1) + '月</div>';
    }
    h2 += '</div>';
    body.innerHTML = h2;
  }
}

// ── 切换年/月视图 ──────────────────────────────────────────────────────────

export function toggleYM() {
  _showYearGrid = !_showYearGrid;
  render();
}

// ── 导航按钮 ────────────────────────────────────────────────────────────────

export function pickerNav(d) {
  // 年份模式：±10 年；月份模式：±1 年
  _pickerYear += _showYearGrid ? d * 10 : d;
  render();
}

// ── 选择年份（在年份网格中） ────────────────────────────────────────────────

export function selYear(y) {
  fxTap();
  _pickerYear = y;
  _showYearGrid = false;
  render();
}

// ── 选择月份（最终动作：关闭弹窗 + 切换视图月份） ──────────────────────────

export function selMonth(m) {
  fxTap();
  // 更新全局的 viewYear / viewMonth
  window.viewYear  = _pickerYear;
  window.viewMonth = m;

  // 关闭弹窗
  close();

  // 刷新主页面
  if (typeof window.render === "function") window.render();
  // 如果当前在分析页，也刷新分析
  if (window.currentTab === "analysis" && typeof window.renderAnalysis === "function") {
    window.renderAnalysis();
  }
}
