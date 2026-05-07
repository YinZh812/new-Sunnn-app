// ui/components/wheel-time.js —— iOS 风格的滚轮时间选择器
//
// 用法（典型）：
//   import { openWheelTime } from "...";
//   openWheelTime(d.getHours(), d.getMinutes(), (h, m) => {
//     // 用户敲定时间
//   });
//
// 内部由两个 InfiniteWheel 实例（小时 0-23、分钟 0-59）拼装而成。
// 弹窗 DOM 由 index.html 提供（#ov-wheel-time / #wheelHours / #wheelMinutes）。

import { byId } from "../../utils/dom.js";
import { fxOpen, fxClose } from "./sfx.js";

/**
 * 无限滚轮单列。可被任意值序列实例化（小时/分钟/任意自定义）。
 */
class InfiniteWheel {
  constructor(container, values, initialVal) {
    this.container = container;
    this.values = values;
    this.ITEM_HEIGHT = 36;
    this.RADIUS = 120;
    this.offset = -(initialVal * this.ITEM_HEIGHT);
    this.velocity = 0;
    this.isDragging = false;
    this.DECAY = 0.94;
    this.MIN_VELOCITY = 0.02;
    this.MAX_VELOCITY = 3;
    this.lastY = 0;
    this.lastTime = 0;
    this.poolSize = values.length;
    this._init();
    this._bind();
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

  /** 当前选中的实际值。 */
  getValue() {
    const centerIndex = -this.offset / this.ITEM_HEIGHT;
    const idx = Math.round(centerIndex);
    return this.values[this._normalize(idx)];
  }

  _bind() {
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
      item.el.innerText = String(this.values[value]).padStart(2, "0");
      item.el.style.transform = `translateY(${y}px)`;
      item.el.style.opacity = Math.max(0.35, 1 - Math.abs(diff) * 0.12);
    }
  }

  _loop() {
    this._physics();
    this._loopOffset();
    this._render();
    requestAnimationFrame(() => this._loop());
  }
}

// ── 单例：全局只允许一个时间选择器同时存在 ──────────────────────────────────

let _hoursInst = null;
let _minsInst  = null;
let _callback  = null;

/** 打开时间选择弹窗。回调在用户点确认时触发。 */
export function openWheelTime(hour, minute, onConfirm) {
  _callback = onConfirm;
  const hCont = byId("wheelHours");
  const mCont = byId("wheelMinutes");
  if (_hoursInst) { _hoursInst.container.innerHTML = ""; _hoursInst = null; }
  if (_minsInst)  { _minsInst.container.innerHTML  = ""; _minsInst  = null; }
  if (hCont && mCont) {
    _hoursInst = new InfiniteWheel(hCont, Array.from({ length: 24 }, (_, i) => i), hour);
    _minsInst  = new InfiniteWheel(mCont, Array.from({ length: 60 }, (_, i) => i), minute);
  }
  const ov = byId("ov-wheel-time");
  if (ov) ov.style.display = "flex";
  fxOpen();
}

/**
 * 关闭时间选择弹窗。
 * @param {boolean} save  true 时调用此前的 onConfirm(h, m)
 */
export function closeWheelTime(save) {
  if (save && _hoursInst && _minsInst && _callback) {
    _callback(_hoursInst.getValue(), _minsInst.getValue());
  }
  _callback = null;
  const ov = byId("ov-wheel-time");
  if (ov) ov.style.display = "none";
  fxClose();
}

/**
 * 为某笔交易打开时间选择弹窗。与原 inline openWheelTimeForTx 行为完全等价。
 * 依赖 window.saveTxs / window.render / window.showToast（均已桥接）。
 */
export function openWheelTimeForTx(idx) {
  const txs = window.txs;
  if (!txs || idx < 0 || idx >= txs.length) return;
  const t = txs[idx];
  if (!t) return;
  const d = new Date(t.ts);
  openWheelTime(d.getHours(), d.getMinutes(), (h, m) => {
    const nd = new Date(t.ts);
    nd.setHours(h, m, 0, 0);
    t.ts = nd.getTime();
    t.timePrecision = "exact";
    t.timeLabel = "";
    t.timePhrase = null;
    if (typeof window.saveTxs === "function") window.saveTxs(txs);
    if (typeof window.render === "function") window.render();
    if (typeof window.showToast === "function") window.showToast("时间已更新 ✓");
  });
}
