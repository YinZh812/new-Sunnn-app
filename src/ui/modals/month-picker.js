// ui/modals/month-picker.js —— 滚轮式年月选择器（#mpicker）
//
// 使用与 wheel-time.js 相同的 InfiniteWheel 组件，
// 左列 = 年份，右列 = 月份（1-12）。
// 选中后：设置 window.viewYear/viewMonth → 调 render + renderAnalysis。

import { byId } from "../../utils/dom.js";
import { fxTap, fxOpen, fxClose } from "../components/sfx.js";
import { store } from "../../state/store.js";

const MODAL_ID = "mpicker";

// ── InfiniteWheel（与 wheel-time.js 相同实现） ──────────────────────────────

class InfiniteWheel {
  constructor(container, values, initialVal, { formatFn, finite } = {}) {
    this.container = container;
    this.values = values;
    this.formatFn = formatFn || ((v) => String(v).padStart(2, "0"));
    this.finite = !!finite;
    this.ITEM_HEIGHT = 36;
    this.offset = -(values.indexOf(initialVal) * this.ITEM_HEIGHT);
    if (this.offset > 0) this.offset = 0;
    this.velocity = 0;
    this.isDragging = false;
    this.DECAY = 0.94;
    this.MIN_VELOCITY = 0.02;
    this.MAX_VELOCITY = 3;
    this.lastY = 0;
    this.lastTime = 0;
    this.poolSize = values.length;
    this._init();
    this._bindEvents();
    this._animId = null;
    this._loop();
  }

  _init() {
    this.inner = document.createElement("div");
    this.inner.className = "wheel-inner";
    this.items = [];
    for (let i = -this.poolSize; i < this.poolSize * 2; i++) {
      const el = document.createElement("div");
      el.className = "wheel-item";
      this.inner.appendChild(el);
      this.items.push({ el, index: i });
    }
    this.container.innerHTML = "";
    this.container.appendChild(this.inner);
    const line = document.createElement("div");
    line.className = "wheel-center-line";
    this.container.appendChild(line);
  }

  _normalize(i) {
    const n = this.values.length;
    return ((i % n) + n) % n;
  }

  getValue() {
    const centerIndex = -this.offset / this.ITEM_HEIGHT;
    const idx = Math.round(centerIndex);
    return this.values[this._normalize(idx)];
  }

  _bindEvents() {
    const start = (e) => {
      this.isDragging = true;
      this.velocity = 0;
      this.lastY = this._getY(e);
      this.lastTime = performance.now();
    };
    const move = (e) => {
      if (!this.isDragging) return;
      const y = this._getY(e);
      const now = performance.now();
      const dy = y - this.lastY;
      const dt = now - this.lastTime;
      this.offset += dy;
      this.velocity = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, dy / dt));
      this.lastY = y;
      this.lastTime = now;
    };
    const end = () => { this.isDragging = false; };

    this.container.addEventListener("mousedown", start);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    this.container.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
  }

  _getY(e) {
    return e.touches ? e.touches[0].clientY : e.clientY;
  }

  _physics() {
    if (!this.isDragging) {
      if (Math.abs(this.velocity) > this.MIN_VELOCITY) {
        this.offset += this.velocity * 16;
        this.velocity *= this.DECAY;
      } else {
        this.velocity = 0;
        this._snap();
      }
    }
  }

  _snap() {
    this.offset = Math.round(this.offset / this.ITEM_HEIGHT) * this.ITEM_HEIGHT;
  }

  _loopOffset() {
    const total = this.values.length * this.ITEM_HEIGHT;
    if (this.offset > total) this.offset -= total;
    if (this.offset < -total) this.offset += total;
  }

  _render() {
    const centerIndex = -this.offset / this.ITEM_HEIGHT;
    for (const item of this.items) {
      const logical = item.index + centerIndex;
      const diff = logical - centerIndex;
      const y = diff * this.ITEM_HEIGHT;
      const value = this._normalize(Math.round(logical));
      item.el.innerText = this.formatFn(this.values[value]);
      item.el.style.transform = "translateY(" + y + "px)";
      item.el.style.opacity = Math.max(0.35, 1 - Math.abs(diff) * 0.12);
    }
  }

  _loop() {
    this._physics();
    this._loopOffset();
    this._render();
    this._animId = requestAnimationFrame(() => this._loop());
  }

  destroy() {
    if (this._animId) cancelAnimationFrame(this._animId);
    this._animId = null;
  }
}

// ── 单例 ────────────────────────────────────────────────────────────────────

let _yearInst = null;
let _monthInst = null;

// 年份范围：当前年 ± 10
function getYearRange() {
  const now = new Date().getFullYear();
  const arr = [];
  for (let y = now - 10; y <= now + 5; y++) arr.push(y);
  return arr;
}

// ── 初始化 ──────────────────────────────────────────────────────────────────

export function init() {
  // 事件通过 HTML onclick 属性 → window 桥接
}

// ── 打开 ────────────────────────────────────────────────────────────────────

export function open() {
  const curYear = typeof window.viewYear === "number" ? window.viewYear : new Date().getFullYear();
  const curMonth = typeof window.viewMonth === "number" ? window.viewMonth : new Date().getMonth();

  const yCont = byId("wheelYear");
  const mCont = byId("wheelMonth");
  if (!yCont || !mCont) return;

  // 销毁旧实例
  if (_yearInst) { _yearInst.destroy(); _yearInst = null; }
  if (_monthInst) { _monthInst.destroy(); _monthInst = null; }
  yCont.innerHTML = "";
  mCont.innerHTML = "";

  const years = getYearRange();
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  _yearInst = new InfiniteWheel(yCont, years, curYear, {
    formatFn: (v) => String(v),
  });
  _monthInst = new InfiniteWheel(mCont, months, curMonth + 1, {
    formatFn: (v) => String(v).padStart(2, "0"),
  });

  const m = byId(MODAL_ID);
  if (m) m.style.display = "flex";
  fxOpen();
}

// ── 关闭（不保存） ─────────────────────────────────────────────────────────

export function close() {
  const m = byId(MODAL_ID);
  if (m) m.style.display = "none";
  if (_yearInst) { _yearInst.destroy(); _yearInst = null; }
  if (_monthInst) { _monthInst.destroy(); _monthInst = null; }
  fxClose();
}

// ── 确认选择 ────────────────────────────────────────────────────────────────

export function confirm() {
  if (!_yearInst || !_monthInst) return;
  const y = _yearInst.getValue();
  const m = _monthInst.getValue(); // 1-12

  fxTap();
  window.viewYear = y;
  window.viewMonth = m - 1; // 转为 0-based

  close();

  if (typeof window.render === "function") window.render();
  if (window.currentTab === "analysis" && typeof window.renderAnalysis === "function") {
    window.renderAnalysis();
  }
}

// ── 兼容旧接口（不再需要，但保留避免报错） ──────────────────────────────────

export function render() {}
export function toggleYM() {}
export function pickerNav() {}
export function selYear() {}
export function selMonth() {}
