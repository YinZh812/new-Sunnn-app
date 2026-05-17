// ui/tabs/settings.js —— 设置页（#t-settings）
//
// 内容：主题/强调色、货币与汇率、月度预算、音效与震动、数据清理、导出/导入。
// 主题切换实时应用 CSS 变量。

import { byId } from "../../utils/dom.js";
import { pad2, escapeHtml, currencySymbol } from "../../utils/format.js";
import { store } from "../../state/store.js";
import { LEGACY_CAT_LUCIDE } from "../../domain/categories.js";
import {
  SUPPORTED_CURRENCIES,
  sumByTypeInCny, convertAmount,
} from "../../domain/currency.js";
import { getViewYear, getViewMonth } from "./main.js";
import {
  setSfxEnabled as _sfxSetEnabled,
  setSfxVolume  as _sfxSetVolume,
  setVibEnabled as _sfxSetVibEnabled,
  isSfxEnabled, getSfxVolume, isVibEnabled,
  fxTap, fxTab, fxOpen, fxClose, fxSuccess, fxDelete, fxError,
} from "../components/sfx.js";

// ── 模块状态 ────────────────────────────────────────────────────────────────

let _toast = (msg) => { if (window.showToast) window.showToast(msg); };
let _exportRange = "month";
let _importPending = null;
let _lastHue = null;

// ── 常量 ────────────────────────────────────────────────────────────────────

const THEMES = [
  { id: "yellow", label: "耀金", h: "#FFB700", bg: "#FFEEA1" },
  { id: "mint",   label: "薄荷", h: "#52B788", bg: "#D8F3DC" },
  { id: "ocean",  label: "雾蓝", h: "#2C7DA0", bg: "#A9D6E5" },
  { id: "pink",   label: "轻梦", h: "#B080CC", bg: "#FFCBF2" },
  { id: "meadow", label: "草甸", h: "#D4A373", bg: "#FAEDCD" },
  { id: "gray",   label: "秩序", h: "#1A1A1A", bg: "#E8E8E8" },
  { id: "white",  label: "极简", h: "#000000", bg: "#F8F9FA" },
  { id: "dark",   label: "极夜", h: "#FFFFFF", bg: "#000000" },
];

const ACCENT_COLORS = [
  "#111111", "#1B3A7A", "#8B2A2A", "#1A6B4A", "#6B2A8B", "#B86A00", "#2A6B8B",
];

const ADV_COLOR_KEYS = [
  { label: "顶部背景", varName: "--hero-bg" },
  { label: "页面背景", varName: "--bg" },
  { label: "卡片背景", varName: "--card" },
  { label: "次卡背景", varName: "--card-alt" },
  { label: "底部导航", varName: "--nav-bg" },
  { label: "主文字色", varName: "--t1" },
  { label: "次文字色", varName: "--t2" },
  { label: "辅文字色", varName: "--t3" },
  { label: "强调色",   varName: "--acc" },
  { label: "分隔线",   varName: "--bdr" },
];

// ── 颜色帮手 ────────────────────────────────────────────────────────────────

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const hx = (v) => {
    const n = Math.round((v + m) * 255).toString(16);
    return n.length < 2 ? "0" + n : n;
  };
  return "#" + hx(r) + hx(g) + hx(b);
}

function contrastText(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substr(0, 2), 16);
  const g = parseInt(h.substr(2, 2), 16);
  const b = parseInt(h.substr(4, 2), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 140 ? "#111" : "#FFF";
}

function hexToHsl(hex) {
  let h2 = hex.replace("#", "");
  if (h2.length === 3) h2 = h2.split("").map((c) => c + c).join("");
  const r = parseInt(h2.substr(0, 2), 16) / 255;
  const g = parseInt(h2.substr(2, 2), 16) / 255;
  const b = parseInt(h2.substr(4, 2), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let hue = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) hue = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  return { h: Math.round(hue), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function getCurrentAccent() {
  const s = store.getSettings();
  if (s.customColors && s.customColors["--acc"]) return s.customColors["--acc"];
  if (s.accentHue !== null && s.accentHue !== undefined) return hslToHex(s.accentHue, 80, 50);
  if (s.accent) return s.accent;
  return getEffectiveColor("--acc");
}

function getEffectiveColor(varName) {
  const s = store.getSettings();
  if (s.customColors && s.customColors[varName]) return s.customColors[varName];
  if (varName === "--acc") {
    if (s.accentHue !== null && s.accentHue !== undefined) return hslToHex(s.accentHue, 80, 50);
    if (s.accent) return s.accent;
  }
  let v = getComputedStyle(document.body).getPropertyValue(varName).trim();
  if (!v) v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (v.indexOf("rgb") === 0) {
    const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) {
      return "#" + [1, 2, 3].map((i) => {
        const n = parseInt(m[i], 10).toString(16);
        return n.length < 2 ? "0" + n : n;
      }).join("");
    }
  }
  return v || "#888888";
}

function typeLabel(t) {
  return { expense: "支出", income: "收入", savings: "储蓄", net_income: "支出但获得" }[t] || "支出";
}

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init({ toast } = {}) {
  if (toast) _toast = toast;
  store.on("settings:changed", () => {
    applyTheme();
    if (isVisible()) render();
  });
  // v2 阶段 6.3：学习规则变化时重渲染设置页（删除/清空/新学习时即时反映）
  store.on("learnedRules:changed", () => {
    if (isVisible()) render();
  });
}

export function onShow() {
  render();
}

function isVisible() {
  const node = byId("t-settings");
  return !!node && node.style.display !== "none";
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

export function render() {
  const s = store.getSettings();
  const txs = store.getTxs();
  const viewYear = getViewYear();
  const viewMonth = getViewMonth();
  const sfxOn = isSfxEnabled();
  const sfxVol = getSfxVolume();
  const vibOn = isVibEnabled();

  const curAccent = getCurrentAccent();
  const curHue = (s.accentHue !== null && s.accentHue !== undefined)
    ? s.accentHue : hexToHsl(curAccent).h;

  // 主题色块
  const themeSwatches = THEMES.map((th) =>
    '<div class="theme-swatch' + (s.theme === th.id ? " active" : "") +
    '" onclick="setTheme(\'' + th.id + '\')">' +
    '<div class="swatch-circle" style="background:' + th.h + ';border:3px solid ' + th.bg + '"></div>' +
    '<div class="swatch-label">' + th.label + '</div></div>'
  ).join("");

  // 强调色圆点（隐藏卡片内）
  const accentDots = ACCENT_COLORS.map((c) =>
    '<div class="color-dot' + (s.accent === c ? " sel" : "") +
    '" style="background:' + c + '" onclick="setAccent(\'' + c + '\')"></div>'
  ).join("");

  // 本月交易数
  const monthTxCount = txs.filter((t) => {
    const d = new Date(t.ts);
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
  }).length;

  const body = byId("settings-body");
  if (!body) return;

  body.innerHTML =
    // ── 主题风格卡 ──
    '<div class="set-card">' +
      '<div class="set-title" style="display:flex;justify-content:space-between;align-items:center">' +
        '主题风格<span class="theme-adv-btn" onclick="openThemeAdvanced()">高级自定义</span>' +
      '</div>' +
      '<div class="theme-grid">' + themeSwatches + '</div>' +
    '</div>' +

    // ── 货币与汇率卡（v2 多币种） ──
    renderCurrencyCard(s) +

    // ── 强调色卡（隐藏） ──
    '<div class="set-card" style="display:none">' +
      '<div class="set-title">强调色</div>' +
      '<div class="hue-slider-wrap">' +
        '<div class="hue-slider" id="hueSlider">' +
          '<div class="hue-thumb" id="hueThumb" style="left:' + (curHue / 360 * 100) + '%"></div>' +
        '</div>' +
        '<div class="hue-hex-label" id="hueHexLabel">' + curAccent.toUpperCase() + ' · H ' + Math.round(curHue) + '°</div>' +
      '</div>' +
      '<div class="color-grid" style="display:none">' + accentDots + '</div>' +
    '</div>' +

    // ── 音效与震动卡 ──
    '<div class="set-card">' +
      '<div class="set-title">音效与震动</div>' +
      '<div class="set-row">' +
        '<div class="set-label">音效</div>' +
        '<div class="seg-btns">' +
          '<div class="seg-btn' + (sfxOn ? " sel" : "") + '" onclick="setSfxEnabled(true,this)">开</div>' +
          '<div class="seg-btn' + (!sfxOn ? " sel" : "") + '" onclick="setSfxEnabled(false,this)">关</div>' +
        '</div>' +
      '</div>' +
      '<div class="set-row">' +
        '<div class="set-label">音量</div>' +
        '<input type="range" min="0" max="1" step="0.1" value="' + sfxVol + '" id="sfxVolRange" ' +
          (sfxOn ? "" : "disabled") + ' style="flex:1;max-width:160px;accent-color:var(--acc)" oninput="setSfxVolume(this.value)">' +
      '</div>' +
      '<div class="set-row">' +
        '<div class="set-label">震动反馈</div>' +
        '<div class="seg-btns">' +
          '<div class="seg-btn' + (vibOn ? " sel" : "") + '" onclick="setVibEnabled(true,this)">开</div>' +
          '<div class="seg-btn' + (!vibOn ? " sel" : "") + '" onclick="setVibEnabled(false,this)">关</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ── 数据清理卡 ──
    '<div class="set-card">' +
      '<div class="set-title">数据清理</div>' +
      '<div class="set-row" style="display:block;padding:8px 16px 4px">' +
        '<div style="font-size:11px;color:var(--t3);line-height:1.6">⚠ 删除后无法恢复，请先用"导出记录"备份。</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<div class="action-btn" style="flex:1;background:var(--bdr2);color:var(--t1)" onclick="cleanupTxs(\'month\')">删本月</div>' +
        '<div class="action-btn" style="flex:1;background:var(--bdr2);color:var(--t1)" onclick="cleanupTxs(\'year\')">删本年</div>' +
        '<div class="action-btn" style="flex:1;background:var(--expense);color:#fff" onclick="cleanupTxs(\'all\')">删全部</div>' +
      '</div>' +
    '</div>' +

    // ── 导出记录卡 ──
    '<div class="set-card">' +
      '<div class="set-title">导出记录</div>' +
      '<div class="set-row">' +
        '<div class="set-label">范围</div>' +
        '<div class="seg-btns">' +
          '<div class="seg-btn' + (_exportRange === "month" ? " sel" : "") + '" id="expRangeMonth" onclick="setExportRange(\'month\',this)">本月 (' + monthTxCount + '笔)</div>' +
          '<div class="seg-btn' + (_exportRange === "all" ? " sel" : "") + '" id="expRangeAll" onclick="setExportRange(\'all\',this)">全部 (' + txs.length + '笔)</div>' +
        '</div>' +
      '</div>' +
      '<div class="export-box" id="exportBox" style="max-height:200px;overflow-y:auto">点击下方按钮生成</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<div class="action-btn" style="flex:1" onclick="doExportRange(\'text\')">文本</div>' +
        '<div class="action-btn" style="flex:1" onclick="doExportRange(\'csv\')">CSV</div>' +
        '<div class="action-btn" style="flex:1" onclick="doExportRange(\'json\')">JSON</div>' +
      '</div>' +
    '</div>' +

    // ── 导入交易卡 ──
    '<div class="set-card">' +
      '<div class="set-title">导入交易</div>' +
      '<div class="set-row" style="display:block;padding:10px 16px">' +
        '<div style="font-size:11px;color:var(--t3);line-height:1.6">支持文件：<b>CSV</b>（本应用导出的 CSV）、<b>JSON</b>（本应用导出的备份）。CSV 列应为：日期、时间、类别、描述、类型、金额、货币。</div>' +
      '</div>' +
      '<div class="export-box" id="importBox" style="max-height:200px;overflow-y:auto;font-size:11px">尚未选择文件</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<label class="action-btn" style="flex:1;cursor:pointer;display:flex;align-items:center;justify-content:center">' +
          '<input type="file" id="importFileInp" accept=".csv,.json,.txt" style="display:none" onchange="onImportFile(this)">选择文件' +
        '</label>' +
        '<div class="action-btn" style="flex:1;background:var(--bdr2);color:var(--t1)" onclick="confirmImport()" id="importConfirmBtn">导入并合并</div>' +
      '</div>' +
    '</div>' +

    // ── 我的个人词典卡（v2 阶段 6.3）──
    renderLearnedRulesCard();

  // 绑定隐藏的色相滑块
  bindHueSlider("hueSlider", "hueThumb",
    (h) => {
      _lastHue = h;
      const hex = hslToHex(h, 80, 50);
      document.body.style.setProperty("--acc", hex);
      document.body.style.setProperty("--acc-t", contrastText(hex));
      const lbl = byId("hueHexLabel");
      if (lbl) lbl.textContent = hex.toUpperCase() + " · H " + Math.round(h) + "°";
      const th = byId("hueThumb");
      if (th) th.style.background = hex;
    },
    () => {
      if (_lastHue !== null) {
        store.setSettings({ accentHue: _lastHue });
        _lastHue = null;
      }
    }
  );
}

// ── 主题应用（启动时也调一次） ──────────────────────────────────────────────

export function applyTheme() {
  const s = store.getSettings();
  const t = s.theme || "gray";
  document.body.className = `theme-${t}`;

  const r = document.body;
  ["--acc", "--acc-t", "--hero-bg", "--bg", "--card", "--card-alt", "--nav-bg", "--t1", "--t2", "--t3", "--bdr"]
    .forEach((v) => r.style.removeProperty(v));

  let accentHex = null;
  if (s.accentHue !== null && s.accentHue !== undefined) {
    accentHex = hslToHex(s.accentHue, 80, 50);
  } else if (s.accent) {
    accentHex = s.accent;
  }
  if (accentHex) {
    r.style.setProperty("--acc", accentHex);
    r.style.setProperty("--acc-t", contrastText(accentHex));
  }

  if (s.customColors) {
    for (const [k, v] of Object.entries(s.customColors)) {
      if (!v) continue;
      r.style.setProperty(k, v);
      if (k === "--acc") r.style.setProperty("--acc-t", contrastText(v));
    }
  }
}

// ── 设置动作 ────────────────────────────────────────────────────────────────

export function setTheme(t) {
  fxTab();
  const s = store.getSettings();
  const hasCustom = s.customColors && Object.keys(s.customColors).length > 0;
  if (hasCustom) {
    if (!confirm("切换主题会重置自定义颜色，确认？")) return;
    store.setSettings({ theme: t, customColors: {} });
  } else {
    store.setSettings({ theme: t });
  }
  _toast("主题已切换");
}

export function setAccent(c) {
  const s = store.getSettings();
  store.setSettings({ accent: c === s.accent ? "" : c });
}

export function setAccentHue(hue) {
  store.setSettings({ accentHue: hue });
}

export function setDefCur(el) {
  fxTap();
  const body = byId("settings-body");
  if (body) {
    body.querySelectorAll(".seg-btn").forEach((b) => {
      if (["EUR", "CNY"].indexOf(b.getAttribute("data-v")) >= 0) b.classList.remove("sel");
    });
  }
  el.classList.add("sel");
  store.setSettings({ defaultCurrency: el.getAttribute("data-v") });
  _toast("已保存");
}

export function handleSetSfxEnabled(on, el) {
  _sfxSetEnabled(on);
  if (el) {
    el.parentNode.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("sel"));
    el.classList.add("sel");
  }
  const rng = byId("sfxVolRange");
  if (rng) {
    if (on) rng.removeAttribute("disabled");
    else rng.setAttribute("disabled", "disabled");
  }
  if (on) fxTap();
}

export function handleSetSfxVolume(v) {
  _sfxSetVolume(parseFloat(v));
  fxTap();
}

export function handleSetVibEnabled(on, el) {
  _sfxSetVibEnabled(on);
  if (el) {
    el.parentNode.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("sel"));
    el.classList.add("sel");
  }
}

// ── 数据清理 ────────────────────────────────────────────────────────────────

export function cleanupTxs(scope) {
  const txs = store.getTxs();
  const viewYear = getViewYear();
  const viewMonth = getViewMonth();

  let label, filterFn;
  if (scope === "month") {
    label = viewYear + "年" + (viewMonth + 1) + "月";
    filterFn = (t) => {
      const d = new Date(t.ts);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    };
  } else if (scope === "year") {
    label = viewYear + "年";
    filterFn = (t) => new Date(t.ts).getFullYear() === viewYear;
  } else {
    label = "全部";
    filterFn = () => true;
  }

  const hits = txs.filter(filterFn);
  if (!hits.length) { fxError(); _toast("无可删除的记录"); return; }
  if (!confirm("确定要删除 " + label + " 的 " + hits.length + " 笔交易吗？此操作不可撤销。")) return;
  if (!confirm("再次确认：将永久删除「" + label + "」的所有交易记录！请先用导出记录备份。")) return;
  const typed = prompt('请输入"删除"二字以最终确认：');
  if (typed !== "删除") { fxClose(); _toast("已取消"); return; }

  const kept = txs.filter((t) => !filterFn(t));
  store.setTxs(kept);
  if (window.render) window.render();
  fxDelete();
  _toast("已删除 " + hits.length + " 笔");
  if (window.currentTab === "analysis" && window.renderAnalysis) window.renderAnalysis();
}

// ── 导出 ────────────────────────────────────────────────────────────────────

export function setExportRange(r, el) {
  _exportRange = r;
  if (el) {
    el.parentNode.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("sel"));
    el.classList.add("sel");
  }
  fxTap();
}

export function doExportRange(format) {
  const txs = store.getTxs();
  const s = store.getSettings();
  const viewYear = getViewYear();
  const viewMonth = getViewMonth();
  const ratesToCny = s.ratesToCny || {};
  const dispCur = s.defaultCurrency || "CNY";
  const dispSym = currencySymbol(dispCur);

  let sorted;
  if (_exportRange === "month") {
    sorted = txs.filter((t) => {
      const d = new Date(t.ts);
      return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
    }).sort((a, b) => b.ts - a.ts);
  } else {
    sorted = txs.slice().sort((a, b) => b.ts - a.ts);
  }

  if (!sorted.length) { fxError(); _toast("暂无交易记录"); return; }

  const box = byId("exportBox");
  const rangeLabel = _exportRange === "month"
    ? (viewYear + "年" + (viewMonth + 1) + "月") : "全部历史";
  const fname = "账本_" + (_exportRange === "month"
    ? (viewYear + "-" + pad2(viewMonth + 1)) : "全部") + "_" + new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const rows = ["日期,时间,类别,描述,类型,金额,货币"];
    sorted.forEach((t) => {
      const d = new Date(t.ts);
      const ds = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      const ts2 = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
      const desc = String(t.desc || "").replace(/"/g, '""');
      const sg = t.type === "expense" ? "-" : "+";
      rows.push(ds + "," + ts2 + "," + t.category + ',"' + desc + '",' +
        typeLabel(t.type) + "," + sg + t.amount.toFixed(2) + "," + (t.currency || "CNY"));
    });
    downloadBlob("﻿" + rows.join("\n"), fname + ".csv", "text/csv;charset=utf-8");
    if (box) box.textContent = "已下载 " + fname + ".csv（" + sorted.length + " 笔）";
    fxSuccess(); _toast("CSV 已下载");

  } else if (format === "json") {
    const budgets = store.getBudgets();
    const goals = store.getGoals();
    const customCategoriesByType = store.getCustomCategoriesByType();
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      range: rangeLabel,
      count: sorted.length,
      settings: s,
      budgets,
      goals,
      customCategoriesByType,
      transactions: sorted,
    };
    downloadBlob(JSON.stringify(payload, null, 2), fname + ".json", "application/json");
    if (box) box.textContent = "已下载 " + fname + ".json（含设置/预算/目标/全部交易）";
    fxSuccess(); _toast("JSON 已下载");

  } else {
    // 汇总以 CNY 为基础聚合，再换算到当前默认货币显示
    const totInDisp = convertAmount(sumByTypeInCny(sorted, "income", ratesToCny),  "CNY", dispCur, ratesToCny);
    const totExDisp = convertAmount(sumByTypeInCny(sorted, "expense", ratesToCny), "CNY", dispCur, ratesToCny);
    const totSvDisp = convertAmount(sumByTypeInCny(sorted, "savings", ratesToCny), "CNY", dispCur, ratesToCny);
    const netDisp = totInDisp - totExDisp;
    const lines = [
      rangeLabel + " 账单",
      "共 " + sorted.length + " 笔", "",
      "收入合计：+" + dispSym + totInDisp.toFixed(2),
      "支出合计：-" + dispSym + totExDisp.toFixed(2),
      "储蓄合计：+" + dispSym + totSvDisp.toFixed(2),
      "净额：" + (netDisp >= 0 ? "+" : "") + dispSym + netDisp.toFixed(2),
      "──────────────",
    ];
    let lastDay = "";
    sorted.forEach((t) => {
      const d = new Date(t.ts);
      const dayKey = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      if (dayKey !== lastDay) {
        lines.push("");
        lines.push("【" + d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日】");
        lastDay = dayKey;
      }
      const sym = currencySymbol(t.currency || "CNY");
      const sg = t.type === "expense" ? "−" : "+";
      lines.push("  [" + t.category + "] " + t.desc + " " + sg + sym + t.amount.toFixed(2));
    });
    if (box) box.textContent = lines.join("\n");
    fxSuccess(); _toast("已生成，可长按复制");
  }
}

function downloadBlob(content, filename, mime) {
  try {
    const blob = new Blob([content], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  } catch (e) {
    console.error("下载失败", e);
    _toast("下载失败");
  }
}

// ── 导入 ────────────────────────────────────────────────────────────────────

export function onImportFile(inp) {
  const f = inp.files && inp.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const buf = new Uint8Array(reader.result);
      let enc = "utf-8";
      if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) enc = "utf-16le";
      else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) enc = "utf-16be";
      else if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) enc = "utf-8";

      let text;
      try { text = new TextDecoder(enc).decode(buf); }
      catch (_) { text = new TextDecoder("utf-8").decode(buf); }
      if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

      let parsed;
      if (/\.json$/i.test(f.name) || text.trim().charAt(0) === "{") {
        parsed = parseImportJson(text);
      } else {
        parsed = parseImportCsv(text);
      }
      if (!parsed || !parsed.length) throw new Error("未识别到任何交易行");

      _importPending = { records: parsed, fname: f.name };

      const box = byId("importBox");
      const preview = parsed.slice(0, 5).map((t) => {
        const d = new Date(t.ts);
        const dl = d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
        const sg = t.type === "expense" ? "−" : "+";
        const sym = t.currency === "CNY" ? "¥" : "€";
        return "  " + dl + " [" + t.category + "] " + t.desc + " " + sg + t.amount.toFixed(2) + sym;
      }).join("\n");
      if (box) {
        box.textContent = "文件: " + f.name + " (" + enc + ")\n共解析到 " + parsed.length +
          " 笔，预览前 " + Math.min(5, parsed.length) + " 笔:\n" + preview +
          (parsed.length > 5 ? "\n..." : "") + "\n\n点击右侧[导入并合并]执行";
      }
      fxSuccess();
    } catch (e) {
      _importPending = null;
      const box = byId("importBox");
      if (box) box.textContent = "解析失败: " + e.message + "\n支持：本应用导出的 CSV/JSON、鲨鱼记账明细 CSV 等。";
      fxError();
    }
  };
  reader.onerror = function () {
    const box = byId("importBox");
    if (box) box.textContent = "读取文件失败";
    fxError();
  };
  reader.readAsArrayBuffer(f);
}

export function confirmImport() {
  if (!_importPending) { fxError(); _toast("请先选择文件"); return; }
  const arr = _importPending.records;
  if (!confirm("将导入 " + arr.length + " 笔交易并合并到现有记录？")) return;

  const txs = store.getTxs().slice();
  const existing = {};
  txs.forEach((t) => { existing[t.ts + "|" + t.amount + "|" + t.desc] = true; });

  let added = 0;
  arr.forEach((t) => {
    const k = t.ts + "|" + t.amount + "|" + t.desc;
    if (existing[k]) return;
    existing[k] = true;
    txs.push(t);
    added++;
  });
  txs.sort((a, b) => b.ts - a.ts);
  store.setTxs(txs);

  _importPending = null;
  const box = byId("importBox");
  if (box) box.textContent = "✓ 导入完成：新增 " + added + " 笔，跳过重复 " + (arr.length - added) + " 笔。";
  fxSuccess();
  _toast("已导入 " + added + " 笔");
  if (window.render) window.render();
  if (window.currentTab === "analysis" && window.renderAnalysis) window.renderAnalysis();
}

// ── 导入解析帮手 ────────────────────────────────────────────────────────────

function parseImportJson(text) {
  const obj = JSON.parse(text);
  const arr = Array.isArray(obj) ? obj : (obj.transactions || obj.records || []);
  if (!Array.isArray(arr)) throw new Error("JSON 没有 transactions 数组");
  return arr.map((r, i) => normalizeImportedTx(r, i)).filter((x) => x);
}

function parseImportCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim());
  if (!lines.length) throw new Error("空文件");

  const sep = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? "\t" : ",";
  const header = splitCsvLine(lines[0], sep).map((s) => s.trim());
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });

  const dC = findCol(idx, ["日期", "date", "Date"]);
  const tC = findCol(idx, ["时间", "time", "Time"]);
  const catC = findCol(idx, ["类别", "分类", "category", "Category"]);
  const descC = findCol(idx, ["备注", "描述", "desc", "note", "Note", "Description"]);
  const typC = findCol(idx, ["收支类型", "类型", "type", "Type"]);
  const amtC = findCol(idx, ["金额", "amount", "Amount"]);
  const curC = findCol(idx, ["货币", "currency", "Currency"]);

  if (dC < 0 || catC < 0 || amtC < 0) {
    throw new Error("CSV 缺少必要列（日期/类别/金额）。当前表头：" + header.join(" | "));
  }

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], sep);
    if (!cols.length) continue;
    const rec = {
      date: (cols[dC] || "").trim(),
      time: tC >= 0 ? (cols[tC] || "").trim() : "",
      category: (cols[catC] || "其他").trim(),
      desc: descC >= 0 ? (cols[descC] || "").trim() : "",
      type: typC >= 0 ? (cols[typC] || "支出").trim() : "支出",
      amount: (cols[amtC] || "0").trim(),
      currency: curC >= 0 ? (cols[curC] || "EUR").trim() : "EUR",
    };
    const n = normalizeImportedTx(rec, i);
    if (n) out.push(n);
  }
  return out;
}

function findCol(idx, names) {
  for (let i = 0; i < names.length; i++) {
    if (idx[names[i]] !== undefined) return idx[names[i]];
  }
  return -1;
}

function splitCsvLine(line, sep) {
  sep = sep || ",";
  if (sep === "\t") return line.split("\t");
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (line.charAt(i + 1) === '"') { cur += '"'; i++; }
        else inQ = false;
      } else { cur += c; }
    } else {
      if (c === sep) { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function mapImportedCategory(name) {
  const s = String(name || "").trim();
  if (!s) return "其他";
  if (LEGACY_CAT_LUCIDE[s]) return s;
  const map = {
    "日常": "生活", "吃的": "餐饮", "物品": "购物", "衣服": "购物", "学校": "生活",
    "礼物": "购物", "游戏": "娱乐", "其它": "其他", "零食": "餐饮", "出行": "交通",
    "车": "交通", "公交": "交通", "网购": "购物", "旅游": "娱乐", "看电影": "娱乐",
    "看病": "医疗", "药": "医疗", "薪": "工资", "薪资": "工资", "奖金": "工资",
    "收入": "工资", "存": "储蓄", "理财": "储蓄", "基金": "储蓄", "股票": "储蓄",
  };
  if (map[s]) return map[s];
  for (const k in map) {
    if (s.indexOf(k) >= 0) return map[k];
  }
  return "其他";
}

function normalizeImportedTx(r, i) {
  if (r.ts && typeof r.amount === "number" && r.type) {
    return {
      ts: r.ts, amount: r.amount, desc: r.desc || "",
      category: mapImportedCategory(r.category || "其他"),
      type: r.type, currency: r.currency || "EUR",
      timeLabel: r.timeLabel, timePrecision: r.timePrecision,
      id: r.id || (Date.now() + i), note: r.note || "",
    };
  }
  const ds = String(r.date || "").trim();
  const tms = String(r.time || "").trim();
  const ts = parseImportDate(ds, tms);
  if (!ts) return null;
  let amt = parseFloat(String(r.amount || "0").replace(/[^\d.\-]/g, ""));
  if (isNaN(amt)) amt = 0;
  let typ = normalizeType(String(r.type || ""));
  if (/^[-−]/.test(String(r.amount || "")) && typ !== "savings") typ = "expense";
  return {
    ts, amount: Math.abs(amt),
    desc: String(r.desc || "").trim(),
    category: mapImportedCategory(r.category || "其他"),
    type: typ,
    currency: String(r.currency || "EUR").toUpperCase() === "CNY" ? "CNY" : "EUR",
    id: Date.now() + i,
  };
}

function parseImportDate(ds, tms) {
  if (!ds) return null;
  const m = ds.match(/^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
  if (!m) return null;
  const y = parseInt(m[1]), mo = parseInt(m[2]) - 1, d = parseInt(m[3]);
  let hh = 12, mm = 0;
  if (tms) {
    const tm = tms.match(/(\d{1,2}):(\d{2})/);
    if (tm) { hh = parseInt(tm[1]); mm = parseInt(tm[2]); }
  }
  return new Date(y, mo, d, hh, mm, 0).getTime();
}

function normalizeType(s) {
  s = String(s || "").toLowerCase().trim();
  if (/income|收入|工资/.test(s)) return "income";
  if (/saving|储蓄/.test(s)) return "savings";
  return "expense";
}

// ── 色相滑块工具 ────────────────────────────────────────────────────────────

export function bindHueSlider(sliderId, thumbId, onMove, onEnd) {
  const sl = byId(sliderId);
  if (!sl) return;
  let dragging = false;
  function pos(clientX) {
    const r = sl.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, clientX - r.left));
    const pct = x / r.width;
    const hue = Math.round(pct * 360);
    const th = byId(thumbId);
    if (th) th.style.left = (pct * 100) + "%";
    if (onMove) onMove(hue);
  }
  function down(e) {
    dragging = true;
    const t = e.touches ? e.touches[0] : e;
    pos(t.clientX);
    if (e.cancelable) e.preventDefault();
  }
  function move(e) {
    if (!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    pos(t.clientX);
    if (e.cancelable) e.preventDefault();
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (onEnd) onEnd();
  }
  sl.addEventListener("touchstart", down, { passive: false });
  sl.addEventListener("touchmove", move, { passive: false });
  sl.addEventListener("touchend", up);
  sl.addEventListener("mousedown", down);
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

// ── 高级颜色自定义（ColorPicker） ─────────────────────────────────────────────

let _cppCurVar = null, _cppCurHue = 0, _cppCurLit = 50;

export function openColorPicker(varName, anchor) {
  if (typeof window.fxOpen === "function") window.fxOpen();
  _cppCurVar = varName;
  const cur = getEffectiveColor(varName);
  const hsl = hexToHsl(cur);
  _cppCurHue = hsl.h;
  _cppCurLit = hsl.l;
  const p = document.getElementById("colorPickerPanel");
  if (!p) return;
  const lbl = ADV_COLOR_KEYS.filter((k) => k.varName === varName)[0];
  document.getElementById("cppTitle").textContent = "选择颜色 · " + (lbl ? lbl.label : varName);
  document.getElementById("cppHueThumb").style.left = (_cppCurHue / 360 * 100) + "%";
  document.getElementById("cppHueThumb").style.background = cur;
  document.getElementById("cppLitThumb").style.left = _cppCurLit + "%";
  document.getElementById("cppHex").textContent = cur.toUpperCase();
  p.classList.add("open");
  const bd = document.getElementById("colorPickerBackdrop");
  if (bd) bd.classList.add("open");
  bindHueSlider("cppHue", "cppHueThumb", (h) => { _cppCurHue = h; applyCppLive(); }, () => { saveAndRefreshCpp(); });
  bindLitSlider();
}

export function bindLitSlider() {
  const sl = document.getElementById("cppLit");
  if (!sl || sl._bound) return;
  sl._bound = true;
  let dragging = false;
  function pos(clientX) {
    const r = sl.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, clientX - r.left));
    const pct = x / r.width;
    _cppCurLit = Math.round(pct * 100);
    document.getElementById("cppLitThumb").style.left = (pct * 100) + "%";
    applyCppLive();
  }
  function down(e) {
    dragging = true;
    const t = e.touches ? e.touches[0] : e;
    pos(t.clientX);
    if (e.cancelable) e.preventDefault();
  }
  function move(e) {
    if (!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    pos(t.clientX);
    if (e.cancelable) e.preventDefault();
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    saveAndRefreshCpp();
  }
  sl.addEventListener("touchstart", down, { passive: false });
  sl.addEventListener("touchmove", move, { passive: false });
  sl.addEventListener("touchend", up);
  sl.addEventListener("mousedown", down);
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

export function applyCppLive() {
  if (!_cppCurVar) return;
  const hex = hslToHex(_cppCurHue, 80, _cppCurLit);
  document.body.style.setProperty(_cppCurVar, hex);
  if (_cppCurVar === "--acc") document.body.style.setProperty("--acc-t", contrastText(hex));
  const hx = document.getElementById("cppHex");
  if (hx) hx.textContent = hex.toUpperCase();
  const th = document.getElementById("cppHueThumb");
  if (th) th.style.background = hex;
  document.querySelectorAll('.color-preview-dot[data-var="' + _cppCurVar + '"]').forEach((dot) => { dot.style.background = hex; });
}

export function saveAndRefreshCpp() {
  if (!_cppCurVar) return;
  const hex = hslToHex(_cppCurHue, 80, _cppCurLit);
  const settings = store.getSettings();
  if (!settings.customColors) settings.customColors = {};
  settings.customColors[_cppCurVar] = hex;
  store.setSettings(settings);
  document.querySelectorAll("#settings-body .color-row").forEach((row) => {
    const dot = row.querySelector(".color-preview-dot");
    const lbl = row.querySelector(".color-row-label");
    if (!dot || !lbl) return;
    const key = ADV_COLOR_KEYS.filter((k) => k.label === lbl.textContent)[0];
    if (key) dot.style.background = getEffectiveColor(key.varName);
  });
  document.querySelectorAll('#theme-adv-body .color-preview-dot').forEach((dot) => {
    const v = dot.getAttribute("data-var");
    if (v) dot.style.background = getEffectiveColor(v);
  });
}

export function resetCustomColor() {
  if (!_cppCurVar) return;
  const savedVar = _cppCurVar;
  const settings = store.getSettings();
  if (settings.customColors && settings.customColors[savedVar]) {
    delete settings.customColors[savedVar];
  }
  if (savedVar === "--acc") {
    settings.accent = "";
    settings.accentHue = null;
  }
  document.body.style.removeProperty(savedVar);
  if (savedVar === "--acc") document.body.style.removeProperty("--acc-t");
  store.setSettings(settings);
  if (typeof window.applyTheme === "function") window.applyTheme();
  document.querySelectorAll('.color-preview-dot[data-var="' + savedVar + '"]').forEach((dot) => {
    dot.style.background = getEffectiveColor(savedVar);
  });
  document.querySelectorAll("#settings-body .color-row").forEach((row) => {
    const dot = row.querySelector(".color-preview-dot");
    const lbl = row.querySelector(".color-row-label");
    if (!dot || !lbl) return;
    const key = ADV_COLOR_KEYS.filter((k) => k.label === lbl.textContent)[0];
    if (key && key.varName === savedVar) dot.style.background = getEffectiveColor(savedVar);
  });
  let anchor = null;
  document.querySelectorAll('.color-preview-dot[data-var="' + savedVar + '"]').forEach((dot) => {
    if (!anchor) anchor = dot;
  });
  if (anchor) openColorPicker(savedVar, anchor);
  if (typeof window.showToast === "function") window.showToast("已重置");
}

export function closeColorPicker() {
  const p = document.getElementById("colorPickerPanel");
  if (p) p.classList.remove("open");
  const bd = document.getElementById("colorPickerBackdrop");
  if (bd) bd.classList.remove("open");
  _cppCurVar = null;
}

// ── 高级主题面板 ────────────────────────────────────────────────────────────

export function openThemeAdvanced() {
  if (typeof window.fxOpen === "function") window.fxOpen();
  const body = document.getElementById("theme-adv-body");
  if (!body) return;
  body.innerHTML = '<div class="adv-color-list">' + ADV_COLOR_KEYS.map((k) => {
    const cur = getEffectiveColor(k.varName);
    return '<div class="color-row"><div class="color-row-label">' + k.label + '</div><div class="color-preview-dot" data-var="' + k.varName + '" style="background:' + cur + '" onclick="openColorPicker(\'' + k.varName + '\',this)"></div></div>';
  }).join("") + '</div>';
  document.getElementById("ov-theme-adv").style.display = "flex";
  function refreshDots() {
    body.querySelectorAll(".color-preview-dot").forEach((dot) => {
      const v = dot.getAttribute("data-var");
      if (v) dot.style.background = getEffectiveColor(v);
    });
  }
  setTimeout(refreshDots, 20);
  setTimeout(refreshDots, 120);
}

export function closeThemeAdvanced() {
  // 先关闭可能打开的颜色选择器（z-index 更高，会拦截点击）
  closeColorPicker();
  if (typeof window.closeOv === "function") window.closeOv("ov-theme-adv");
}

export function resetAllCustomColors() {
  if (!confirm("重置所有自定义颜色？")) return;
  const settings = store.getSettings();
  settings.customColors = {};
  settings.accent = "";
  settings.accentHue = null;
  ["--acc", "--acc-t", "--hero-bg", "--bg", "--card", "--card-alt", "--nav-bg", "--t1", "--t2", "--t3", "--bdr"].forEach((v) => {
    document.body.style.removeProperty(v);
  });
  store.setSettings(settings);
  if (typeof window.applyTheme === "function") window.applyTheme();
  try { if (typeof window.render === "function") window.render(); } catch (e) {}
  try { if (typeof window.renderSettings === "function") window.renderSettings(); } catch (e) {}
  openThemeAdvanced();
  if (typeof window.showToast === "function") window.showToast("已全部重置为主题色");
}

// ── 类别设置 UI ───────────────────────────────────────────────────────────────

const LUCIDE_PICKER_LIST = ["utensils","coffee","shopping-bag","store","gamepad-2","film","music","camera","car","plane","bus","home","heart-pulse","heart","dumbbell","wallet","piggy-bank","ticket","gift","gem","flame","star","sun","moon","book","book-open","briefcase","smile","package","target"];

export function openCatSettings() {
  renderCatSettings();
  document.getElementById("ov-catsettings").style.display = "flex";
}

export function closeCatSettings() {
  document.getElementById("ov-catsettings").style.display = "none";
  if (typeof window.saveCustomCategories === "function") window.saveCustomCategories();
  if (typeof window.buildManualCatRow === "function") window.buildManualCatRow();
}

export function renderCatSettings() {
  const list = document.getElementById("catSettingsList");
  list.innerHTML = "";
  const cats = window.customCategories || [];
  cats.forEach(function (c, i) {
    const r = document.createElement("div");
    r.className = "cs-row";
    r.setAttribute("data-i", i);
    r.setAttribute("draggable", "true");
    const ico = document.createElement("div");
    ico.className = "cs-ico";
    ico.innerHTML = renderIconValue(c.icon, 22, 1.6);
    ico.title = "点击修改图标";
    ico.onclick = function () { editCatIcon(i); };
    const nm = document.createElement("input");
    nm.className = "cs-name";
    nm.value = c.name;
    nm.placeholder = "类别名";
    nm.oninput = function () { cats[i].name = nm.value; };
    nm.onblur = function () {
      if (!nm.value.trim()) nm.value = cats[i].name = "新类别";
      if (typeof window.saveCustomCategories === "function") window.saveCustomCategories();
    };
    const del = document.createElement("span");
    del.className = "cs-del";
    del.textContent = "删除";
    del.onclick = function () { deleteCat(i); };
    const drag = document.createElement("span");
    drag.className = "cs-drag";
    drag.textContent = "⋮⋮";
    drag.title = "拖动排序";
    r.appendChild(ico);
    r.appendChild(nm);
    if (cats.length > 1) r.appendChild(del);
    r.appendChild(drag);
    r.addEventListener("dragstart", function (e) {
      r.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(i));
    });
    r.addEventListener("dragend", function () { r.classList.remove("dragging"); });
    r.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    r.addEventListener("drop", function (e) {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const to = i;
      if (isNaN(from) || from === to) return;
      const moved = cats.splice(from, 1)[0];
      cats.splice(to, 0, moved);
      if (typeof window.saveCustomCategories === "function") window.saveCustomCategories();
      renderCatSettings();
    });
    let dragStartY = null, dragStartIdx = null;
    drag.addEventListener("touchstart", function (e) {
      dragStartY = e.touches[0].clientY;
      dragStartIdx = i;
      r.classList.add("dragging");
    }, { passive: true });
    drag.addEventListener("touchmove", function (e) {
      if (dragStartY === null) return;
      const y = e.touches[0].clientY;
      const els = document.querySelectorAll("#catSettingsList .cs-row");
      for (let k = 0; k < els.length; k++) {
        const rect = els[k].getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          const ki = parseInt(els[k].getAttribute("data-i"), 10);
          if (ki !== dragStartIdx) {
            const moved = cats.splice(dragStartIdx, 1)[0];
            cats.splice(ki, 0, moved);
            dragStartIdx = ki;
            if (typeof window.saveCustomCategories === "function") window.saveCustomCategories();
            renderCatSettings();
            return;
          }
        }
      }
      e.preventDefault();
    }, { passive: false });
    drag.addEventListener("touchend", function () {
      r.classList.remove("dragging");
      dragStartY = null;
      dragStartIdx = null;
    });
    list.appendChild(r);
  });
}

export function editCatIcon(i) {
  openLucidePicker(
    function (name) {
      window.customCategories[i].icon = "lucide:" + name;
      if (typeof window.saveCustomCategories === "function") window.saveCustomCategories();
      renderCatSettings();
    },
    function () {
      const cur = window.customCategories[i].icon;
      let v = prompt("输入图标 emoji（例：🍔🛒🎯）:", typeof cur === "string" && cur.indexOf("lucide:") < 0 && cur.indexOf("<svg") < 0 ? cur : "📦");
      if (v === null) return;
      v = v.trim();
      if (v) {
        window.customCategories[i].icon = v;
        if (typeof window.saveCustomCategories === "function") window.saveCustomCategories();
        renderCatSettings();
      }
    }
  );
}

export function openLucidePicker(onPick, onEmoji) {
  const ov = document.getElementById("ov-lucide-picker");
  if (!ov) return;
  const grid = document.getElementById("lucide-picker-grid");
  grid.innerHTML = "";
  LUCIDE_PICKER_LIST.forEach(function (n) {
    const c = document.createElement("div");
    c.className = "lp-cell";
    c.innerHTML = lucideSvg(n, 24, 1.6);
    c.title = n;
    c.onclick = function () { closeLucidePicker(); onPick(n); };
    grid.appendChild(c);
  });
  document.getElementById("lp-emoji-btn").onclick = function () {
    closeLucidePicker();
    if (onEmoji) onEmoji();
  };
  ov.style.display = "flex";
}

export function closeLucidePicker() {
  const ov = document.getElementById("ov-lucide-picker");
  if (ov) ov.style.display = "none";
}

export function deleteCat(i) {
  const cats = window.customCategories;
  if (cats.length <= 1) {
    if (typeof window.showToast === "function") window.showToast("至少保留 1 个类别");
    return;
  }
  if (!confirm("删除类别 \"" + cats[i].name + "\"？已记录的交易不受影响。")) return;
  cats.splice(i, 1);
  if (typeof window.saveCustomCategories === "function") window.saveCustomCategories();
  renderCatSettings();
}

export function addNewCat() {
  window.customCategories.push({ name: "新类别", icon: "📦" });
  if (typeof window.saveCustomCategories === "function") window.saveCustomCategories();
  renderCatSettings();
  const list = document.getElementById("catSettingsList");
  setTimeout(function () { list.scrollTop = list.scrollHeight; }, 30);
}

// ── 货币与汇率卡（v2 多币种）─────────────────────────────────────────────────
//
// 三部分：
//   1) 默认货币：下拉，仅列出 enabled 的币种（保证选了之后能用）
//   2) 启用货币：5 个 pill 切换；至少保留 1 个；CNY 永远勾上（base）
//   3) 汇率：对每个 enabled 且非 CNY 的币种显示 "1 X = N CNY" 输入框

function renderCurrencyCard(s) {
  const enabled = Array.isArray(s.enabledCurrencies) && s.enabledCurrencies.length
    ? s.enabledCurrencies
    : ["EUR", "CNY"];
  const rates = s.ratesToCny || {};
  const defCur = s.defaultCurrency || enabled[0];

  // 默认货币 dropdown：只列出已启用的（保持简洁）。
  // 添加新货币 → 用下方的"+ 添加货币" picker。
  const dropOpts = enabled.map((code) => {
    const ccy = SUPPORTED_CURRENCIES.find((c) => c.code === code);
    if (!ccy) return "";
    return '<option value="' + code + '"' + (code === defCur ? " selected" : "") + '>' +
             escapeHtml(ccy.label) + '  ' + ccy.symbol +
           '</option>';
  }).join("");

  // 一行 = 一个已启用的货币（按 enabled 的顺序）
  const enabledRows = enabled.map((code) => {
    const ccy = SUPPORTED_CURRENCIES.find((c) => c.code === code);
    if (!ccy) return "";
    const isCny = code === "CNY";
    const val = rates[code] != null ? rates[code] : "";

    // 右侧 action：CNY 显示"基准"标；其他显示汇率输入 + ×（移除）
    let rightHtml;
    if (isCny) {
      rightHtml = '<span style="font-size:10px;color:var(--t3);padding:3px 8px;border-radius:8px;background:var(--bdr2);letter-spacing:1px">基准</span>';
    } else {
      rightHtml =
        '<span style="display:inline-flex;align-items:center;gap:4px;color:var(--t3);font-size:11px">' +
          '1 ' + ccy.symbol + ' =' +
          '<input type="number" class="cur-rate-inp" step="0.01" min="0" ' +
                 'value="' + val + '" placeholder="汇率" ' +
                 'oninput="setRateForCurrency(\'' + code + '\',this.value)" ' +
                 'style="width:64px;padding:4px 8px;font-size:11px;text-align:right">' +
          '<span>¥</span>' +
          '<span class="cur-row-x" onclick="toggleEnabledCurrency(\'' + code + '\')" title="移除">×</span>' +
        '</span>';
    }

    return (
      '<div class="set-row cur-row">' +
        '<div style="display:flex;align-items:center;gap:8px;min-width:0">' +
          '<span style="font-size:15px;color:var(--t1);font-weight:500;width:18px;text-align:center">' + ccy.symbol + '</span>' +
          '<span style="font-size:13px;color:var(--t1)">' + escapeHtml(ccy.label) + '</span>' +
        '</div>' +
        rightHtml +
      '</div>'
    );
  }).join("");

  // 可添加的（disabled）货币列表 —— 用一个 select 让用户挑
  const disabled = SUPPORTED_CURRENCIES.filter((c) => !enabled.includes(c.code));
  const addRowHtml = disabled.length
    ? (
      '<div class="set-row cur-row" style="justify-content:flex-start">' +
        '<span style="font-size:14px;color:var(--acc);margin-right:8px">+</span>' +
        '<span style="font-size:13px;color:var(--t2)">添加货币</span>' +
        '<select style="margin-left:auto;background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:6px 8px;font-size:12px;color:var(--t1);cursor:pointer" onchange="addCurrencyFromSelect(this)">' +
          '<option value="">选择…</option>' +
          disabled.map((c) =>
            '<option value="' + c.code + '">' + escapeHtml(c.label) + '  ' + c.symbol + '</option>'
          ).join("") +
        '</select>' +
      '</div>'
    )
    : "";

  return (
    '<div class="set-card">' +
      '<div class="set-title">货币与汇率</div>' +
      // 默认货币
      '<div class="set-row">' +
        '<div class="set-label">默认货币<br/>' +
          '<span style="font-size:10px;color:var(--t3);font-weight:400">新建交易默认用</span>' +
        '</div>' +
        '<select class="set-input" style="max-width:170px;cursor:pointer" onchange="setDefCurFromSelect(this)">' +
          dropOpts +
        '</select>' +
      '</div>' +
      // 启用货币列表（每行 = 一个已启用币种 + 汇率/× 操作）
      enabledRows +
      // 添加货币（仅当还有可添加的）
      addRowHtml +
    '</div>'
  );
}

/** "添加货币" select onchange handler */
export function addCurrencyFromSelect(el) {
  if (!el || !el.value) return;
  const code = el.value;
  toggleEnabledCurrency(code); // 复用：当 code 不在 enabled 里时 toggle 加入
  // 重置 select 显示
  el.value = "";
}

/** onchange handler：默认货币下拉切换。若选了未启用的币种则自动启用之。 */
export function setDefCurFromSelect(el) {
  if (!el) return;
  fxTap();
  const code = el.value;
  const s = store.getSettings();
  const enabled = Array.isArray(s.enabledCurrencies) ? s.enabledCurrencies.slice() : ["EUR", "CNY"];
  const patch = { defaultCurrency: code };
  if (!enabled.includes(code)) {
    enabled.push(code);
    patch.enabledCurrencies = enabled;
  }
  store.setSettings(patch);
}

/** 点击行 → 切换该币种启用状态。CNY 永远启用。 */
export function toggleEnabledCurrency(code) {
  if (code === "CNY") return;
  const s = store.getSettings();
  const enabled = Array.isArray(s.enabledCurrencies) ? s.enabledCurrencies.slice() : ["EUR", "CNY"];
  const i = enabled.indexOf(code);
  if (i >= 0) {
    if (enabled.length <= 1) { _toast("至少要保留一种货币"); return; }
    enabled.splice(i, 1);
  } else {
    enabled.push(code);
  }
  if (!enabled.includes("CNY")) enabled.push("CNY");

  fxTap();
  const patch = { enabledCurrencies: enabled };
  if (!enabled.includes(s.defaultCurrency)) patch.defaultCurrency = enabled[0];
  if (!enabled.includes(s.displayCurrency)) patch.displayCurrency = enabled[0];
  store.setSettings(patch);
}

/** oninput handler：修改某币种汇率。code != "CNY"。 */
export function setRateForCurrency(code, value) {
  if (code === "CNY") return;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return;
  const s = store.getSettings();
  const next = { ...(s.ratesToCny || {}), [code]: n };
  store.setSettings({ ratesToCny: next });
}

// ── 我的个人词典（v2 阶段 6.3 学习规则管理）──────────────────────────────────
//
// 渲染 "我的个人词典" 卡片。在 render() 的 body.innerHTML 末尾调用。
// 学习规则保存在 store.getLearnedRules()，结构 { phrase, type, category, hits, lastUsed }。

const TYPE_LABEL_CN = { expense: "支出", income: "收入", savings: "储蓄" };

function renderLearnedRulesCard() {
  const rules = store.getLearnedRules();
  const count = rules.length;

  // 标题（含计数与清空按钮）
  const titleHtml =
    '<div class="set-title" style="display:flex;justify-content:space-between;align-items:center">' +
      '<span>我的个人词典 <span style="color:var(--t3);font-weight:400;font-size:11px">· 已学 ' + count + ' 条</span></span>' +
      (count
        ? '<span class="theme-adv-btn" style="cursor:pointer" onclick="clearLearnedRules()">清空</span>'
        : "") +
    '</div>';

  if (count === 0) {
    return (
      '<div class="set-card">' +
        titleHtml +
        '<div style="padding:10px 16px;font-size:11px;color:var(--t3);line-height:1.7">' +
          '还没有学习任何个人规则。<br>在确认弹窗里修改类别后，系统会自动学到 "这句话以后归这一类"。下次说类似的就自动归类。' +
        '</div>' +
      '</div>'
    );
  }

  // 按 lastUsed 倒序，最近学的在最上面
  const sorted = rules.slice().sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));

  const rowsHtml = sorted.map((r) => {
    const phEnc = encodeURIComponent(r.phrase);
    const typeLbl = TYPE_LABEL_CN[r.type] || r.type;
    return (
      '<div class="set-row" style="font-size:12px;padding:8px 16px">' +
        '<div style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span style="color:var(--t1);font-weight:500">' + escapeHtml(r.phrase) + '</span>' +
          '<span style="color:var(--t3)">→</span>' +
          '<span style="color:var(--t1)">' + escapeHtml(r.category) + '</span>' +
          '<span style="color:var(--t3);font-size:10px">· ' + typeLbl + '</span>' +
        '</div>' +
        '<span style="cursor:pointer;color:var(--t3);font-size:18px;line-height:1;padding:4px 8px" ' +
          'onclick="removeLearnedRule(\'' + phEnc + '\',\'' + r.type + '\')">×</span>' +
      '</div>'
    );
  }).join("");

  return (
    '<div class="set-card">' +
      titleHtml +
      rowsHtml +
    '</div>'
  );
}

/**
 * onclick handler：删除单条学习规则。
 * @param {string} phraseEncoded 经 encodeURIComponent 编码的 phrase（避免 onclick 字符串注入）
 * @param {string} type expense / income / savings
 */
export function handleRemoveLearnedRule(phraseEncoded, type) {
  fxDelete();
  try {
    const phrase = decodeURIComponent(phraseEncoded);
    store.removeLearnedRule(phrase, type);
    _toast("已删除");
  } catch (err) {
    console.warn("[settings] removeLearnedRule failed:", err);
  }
}

/** onclick handler：清空所有学习规则（带原生 confirm 二次确认）。 */
export function handleClearLearnedRules() {
  const count = store.getLearnedRules().length;
  if (!count) return;
  fxTap();
  if (!confirm("确认清空全部 " + count + " 条学习规则？此操作不可撤销。")) return;
  store.clearLearnedRules();
  _toast("已清空");
}

// ── 导出给外部使用的颜色帮手 ────────────────────────────────────────────────

export { hslToHex, contrastText, hexToHsl, getCurrentAccent, getEffectiveColor };
export { ADV_COLOR_KEYS, THEMES, ACCENT_COLORS };

// 音效设置代理
export { isSfxEnabled, getSfxVolume, isVibEnabled };
