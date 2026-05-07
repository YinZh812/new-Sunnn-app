// ui/components/sfx.js —— 音效 + 震动
//
// 浏览器对 AudioContext 有自动播放策略：必须在用户首次手势之后才能 resume。
// 这个模块通过 attachUnlock() 监听首次 touch/click/keydown 自动 resume。
//
// 8 种音效 → 8 个语义化 fxXxx() 入口，UI 直接调用即可（同时附带震动反馈）。

import { readString, writeString, STORAGE_KEYS } from "../../state/storage.js";

const SFX = {
  enabled: readString(STORAGE_KEYS.SFX_ENABLED, "true") !== "false",
  volume:  parseFloat(readString(STORAGE_KEYS.SFX_VOLUME, "0.7")),
  ctx: null,
  _last: {},

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
    }
  },

  _tone(freq, dur, vol, opts) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = (opts && opts.type) || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (opts && opts.glide) o.frequency.exponentialRampToValueAtTime(opts.glide, t + dur / 1000);
    const v = (vol !== undefined ? vol : 1) * this.volume;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / 1000);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur / 1000 + 0.02);
  },

  play(type) {
    if (!this.enabled) return;
    const now = Date.now();
    if (this._last[type] && now - this._last[type] < 50) return; // 节流
    this._last[type] = now;
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      try { this.ctx.resume(); } catch {}
    }
    switch (type) {
      case "tap":     this._tone(800, 30, 0.45); break;
      case "tap-alt": this._tone(600, 40, 0.50); break;
      case "success":
        this._tone(880, 90, 0.55);
        setTimeout(() => this._tone(1200, 120, 0.55), 80);
        break;
      case "tab":    this._tone(1000, 25, 0.30); break;
      case "open":   this._tone(400, 80, 0.50, { glide: 700 }); break;
      case "close":  this._tone(700, 80, 0.50, { glide: 400 }); break;
      case "delete": this._tone(200, 60, 0.65); break;
      case "error":
        this._tone(300, 55, 0.55);
        setTimeout(() => this._tone(300, 55, 0.55), 80);
        break;
      default:       this._tone(800, 30, 0.4);
    }
  },
};

const VIB = {
  enabled: readString(STORAGE_KEYS.VIB_ENABLED, "true") !== "false",
  go(pattern) {
    if (!this.enabled) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
  },
};

// ── 配置 setter（设置页 UI 调用） ───────────────────────────────────────────

export const setSfxEnabled = (enabled) => {
  SFX.enabled = !!enabled;
  writeString(STORAGE_KEYS.SFX_ENABLED, SFX.enabled ? "true" : "false");
};
export const setSfxVolume  = (volume) => {
  SFX.volume = Math.max(0, Math.min(1, parseFloat(volume) || 0));
  writeString(STORAGE_KEYS.SFX_VOLUME, String(SFX.volume));
};
export const setVibEnabled = (enabled) => {
  VIB.enabled = !!enabled;
  writeString(STORAGE_KEYS.VIB_ENABLED, VIB.enabled ? "true" : "false");
};

export const isSfxEnabled = () => SFX.enabled;
export const getSfxVolume = () => SFX.volume;
export const isVibEnabled = () => VIB.enabled;

// ── 8 种音效语义入口（含震动） ──────────────────────────────────────────────

export const fxTap     = () => { SFX.play("tap");     VIB.go(12);          };
export const fxTapAlt  = () => { SFX.play("tap-alt"); VIB.go(15);          };
export const fxSuccess = () => { SFX.play("success"); VIB.go([20, 80, 20]);};
export const fxTab     = () => { SFX.play("tab");     VIB.go(8);           };
export const fxOpen    = () => { SFX.play("open");    VIB.go(12);          };
export const fxClose   = () => { SFX.play("close");   VIB.go(10);          };
export const fxDelete  = () => { SFX.play("delete");  VIB.go(30);          };
export const fxError   = () => { SFX.play("error");   VIB.go([40, 50, 40]);};

// ── 首次手势自动解锁 AudioContext ───────────────────────────────────────────

let _unlockBound = false;

/**
 * 在 main.js 启动时调一次。绑定 touch/click/keydown 一次性监听，
 * 用户第一次操作即触发 SFX.init() 与 ctx.resume()。
 */
export function attachAudioUnlock() {
  if (_unlockBound) return;
  _unlockBound = true;

  const unlock = () => {
    SFX.init();
    if (SFX.ctx && SFX.ctx.state === "suspended") {
      try { SFX.ctx.resume(); } catch {}
    }
    document.removeEventListener("touchstart", unlock);
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
  };

  document.addEventListener("touchstart", unlock, { once: true, passive: true });
  document.addEventListener("click", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}
