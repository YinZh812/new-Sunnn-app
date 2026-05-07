// ui/components/inline-edit.js —— 通用内联编辑浮层原语
//
// 列表里点击描述/金额/类别/时间会在原位浮出小弹层；本模块提供这些浮层的
// 通用底盘（创建、定位、关闭）。具体字段编辑逻辑（描述输入、金额计算器、类别格子等）
// 由 ui/tabs/main.js 在调用方拼装。
//
// 设计：
//   - 同时只允许一个浮层；新建前自动关掉旧的
//   - 提供位置定位帮手 positionNear(target, popup, opts)
//   - 提供"点击外部关闭"自动监听

import { qs, qsa, addClass, removeClass } from "../../utils/dom.js";

let _activePopup = null;
let _docClickBound = false;
let _docClickHandler = null;

/** 关掉当前所有浮层（描述/金额/类别/时间）。 */
export function closeAllPopups() {
  // 通用浮层：通过 id 移除
  for (const sel of ["#inlinePop", "#catPop", "#timePop"]) {
    const el = qs(sel);
    if (el) el.remove();
  }
  // 高亮收起
  for (const el of qsa(".tid.editing-hl"))   removeClass(el, "editing-hl");
  for (const el of qsa(".tia.editing-hl"))   removeClass(el, "editing-hl");
  for (const el of qsa(".tia-floating"))     el.remove();
  _activePopup = null;
  _unbindDocClick();
}

/**
 * 创建一个浮层 div。caller 自行填充 innerHTML 或 appendChild。
 * @param {string} id   浮层 id（"inlinePop"/"catPop"/"timePop"）
 * @param {string} className  CSS 类（"inline-popup"/"cat-popup"/"time-popup"）
 */
export function createPopup(id, className) {
  closeAllPopups();
  const popup = document.createElement("div");
  popup.id = id;
  popup.className = className;
  document.body.appendChild(popup);
  _activePopup = popup;
  _bindDocClick();
  return popup;
}

/**
 * 把浮层定位到目标元素附近。默认浮在目标上方。
 * @param {HTMLElement} target  作为锚点
 * @param {HTMLElement} popup
 * @param {Object} [opts]
 * @param {"above"|"below"|"center"} [opts.placement="above"]
 * @param {number} [opts.gap=8]  与锚点的间距
 */
export function positionNear(target, popup, { placement = "above", gap = 8 } = {}) {
  const r = target.getBoundingClientRect();
  const pw = popup.offsetWidth || 240;
  const ph = popup.offsetHeight || 100;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(8, Math.min(vw - pw - 8, left));

  let top;
  if (placement === "above") {
    top = r.top - ph - gap;
    if (top < 8) top = r.bottom + gap;
  } else if (placement === "below") {
    top = r.bottom + gap;
    if (top + ph > vh - 8) top = r.top - ph - gap;
  } else {
    top = vh / 2 - ph / 2;
    left = vw / 2 - pw / 2;
  }
  top = Math.max(8, Math.min(vh - ph - 8, top));

  popup.style.left = `${left}px`;
  popup.style.top  = `${top}px`;
}

/** 高亮"正在编辑"的描述/金额单元格。 */
export const highlightEditing = (el) => addClass(el, "editing-hl");

// ── 点击外部关闭 ────────────────────────────────────────────────────────────

function _bindDocClick() {
  if (_docClickBound) return;
  _docClickBound = true;
  _docClickHandler = (e) => {
    if (!_activePopup) return;
    // 点击发生在浮层内部 / 触发元素附近的 .tid/.tia/.tic/.tim-date 上不关闭
    if (
      e.target.closest("#inlinePop") ||
      e.target.closest("#catPop") ||
      e.target.closest("#timePop") ||
      e.target.closest(".inline-inp") ||
      e.target.closest(".tim-date") ||
      e.target.closest(".tia") ||
      e.target.closest(".tic")
    ) return;
    closeAllPopups();
  };
  document.addEventListener("click", _docClickHandler, true);
}

function _unbindDocClick() {
  if (!_docClickBound) return;
  _docClickBound = false;
  document.removeEventListener("click", _docClickHandler, true);
  _docClickHandler = null;
}
