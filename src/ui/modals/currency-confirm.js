// ui/modals/currency-confirm.js —— 货币冲突确认（#cur-modal）
//
// 当一句话里同时出现 "欧元" 和 "人民币" 标记时，弹这个让用户挑一个。
// 用户选完后调回调把所选 currency 应用到 results 数组。

import { byId } from "../../utils/dom.js";

const MODAL_ID = "cur-modal";

let _onChoose = null;

export function init() {
  // currency-confirm 用的不是 .overlay 而是 .cur-modal（结构不同），所以不绑下划手势。
}

/**
 * @param {Array<any>} results 解析结果（仅用于在弹窗副标题显示笔数）
 * @param {(currency: "EUR"|"CNY") => void} onChoose
 */
export function open(results, onChoose) {
  _onChoose = onChoose;
  const sub = byId("cur-modal-sub");
  if (sub) sub.textContent = `请选择本笔交易使用的货币（${results?.length || 1} 笔）`;
  const m = byId(MODAL_ID);
  if (m) m.style.display = "flex";
}

export function close() {
  const m = byId(MODAL_ID);
  if (m) m.style.display = "none";
  _onChoose = null;
}

/** 由 .cur-modal-btn 的 onclick 调用。 */
export function choose(currency) {
  const cb = _onChoose;
  close();
  cb?.(currency);
}
