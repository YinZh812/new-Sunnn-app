// ui/components/overlay.js —— 通用弹窗（Sheet）控制
//
// 模式：所有弹窗在 HTML 里都有 `<div class="overlay">…<div class="sheet">…</div></div>` 结构。
//   - openOverlay(id) / closeOverlay(id) —— 切显隐
//   - attachSheetSwipe(sheetId, handleId, onClose) —— 顶部把手下划手势关闭
//
// 之所以叫 Overlay 而不是 Modal：app 里 .overlay 是固定 CSS 类名，遵循已有命名。

import { byId, on } from "../../utils/dom.js";
import { fxOpen, fxClose } from "./sfx.js";

/** 显示弹窗（带 open 音效）。 */
export function openOverlay(id) {
  const el = byId(id);
  if (!el) return;
  el.style.display = "flex";
  fxOpen();
}

/** 关闭弹窗（带 close 音效）。 */
export function closeOverlay(id) {
  const el = byId(id);
  if (!el) return;
  el.style.display = "none";
  fxClose();
}

/** 简单查询是否处于打开状态。 */
export const isOverlayOpen = (id) => {
  const el = byId(id);
  return !!el && el.style.display === "flex";
};

/**
 * 顶部把手下划关闭手势（与原 initSwipe 行为一致）。
 *   - 拖动距离 > 100px 触发关闭并执行 onClose 回调
 *   - 拖动距离 ≤ 100px 自动回弹
 *
 * @param {string} sheetId   .sheet 元素 id
 * @param {string} handleId  .hdl 元素 id（不可见的拖拽把手区）
 * @param {() => void} [onClose]
 * @returns {() => void}     卸载函数
 */
export function attachSheetSwipe(sheetId, handleId, onClose) {
  const sheet  = byId(sheetId);
  const handle = byId(handleId);
  if (!sheet || !handle) return () => {};

  let startY = 0, currentY = 0, dragging = false;

  const start = (e) => {
    const t = e.touches ? e.touches[0] : e;
    startY = currentY = t.clientY;
    dragging = true;
    sheet.style.transition = "none";
  };
  const move = (e) => {
    if (!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    currentY = t.clientY;
    const dy = Math.max(0, currentY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
    if (dy > 10 && e.cancelable) e.preventDefault();
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "transform 0.3s cubic-bezier(.32,.72,0,1)";
    const dy = currentY - startY;
    if (dy > 100) {
      sheet.style.transform = "translateY(120%)";
      setTimeout(() => {
        if (onClose) onClose();
        sheet.style.transform = "";
        sheet.style.transition = "";
      }, 280);
    } else {
      sheet.style.transform = "";
      setTimeout(() => { sheet.style.transition = ""; }, 300);
    }
  };

  const offStart = on(handle, "touchstart", start, { passive: false });
  const offMove  = on(handle, "touchmove",  move,  { passive: false });
  const offEnd   = on(handle, "touchend",   end);

  return () => { offStart(); offMove(); offEnd(); };
}
