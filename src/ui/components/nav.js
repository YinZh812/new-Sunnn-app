// ui/components/nav.js —— 底部导航 Tab 切换
//
// 模式：每个 tab 模块在 main.js 启动时调用 registerTab(id, hooks) 注册自己；
//       nav 负责 DOM 显隐 + 调用对应 tab 的 onShow（让 tab 自行刷新）。
//
// 这样 nav.js 不依赖任何具体 tab 模块；tab 模块也不互相耦合。

import { qsa, byId, toggleClass } from "../../utils/dom.js";
import { fxTab } from "./sfx.js";

/** id → { onShow?: () => void, domId?: string } */
const _tabs = new Map();
let _current = "main";

/**
 * 注册一个 tab。
 * @param {string} id  tab 标识（与底部导航 .bni[data-t] 一致："main"/"analysis"/"goals"/"settings"/"search"）
 * @param {Object} [hooks]
 * @param {() => void} [hooks.onShow]  显示时触发（适合做按需 render）
 * @param {string} [hooks.domId]  关联的容器 DOM id；不传时按惯例推断
 */
export function registerTab(id, hooks = {}) {
  _tabs.set(id, {
    onShow: hooks.onShow || null,
    domId: hooks.domId || (id === "goals" ? "page-goals" : `t-${id}`),
  });
}

/** 当前活跃 tab id。 */
export const getCurrentTab = () => _current;

/**
 * 切到指定 tab。负责：
 *   1. 高亮底部导航
 *   2. 显隐每个 tab 容器
 *   3. 触发目标 tab 的 onShow
 *
 * 注意：search tab 永远 display:none（搜索通过弹窗触发），保留以兼容旧 DOM。
 */
export function showTab(id) {
  _current = id;

  // 渐进迁移期：同步给 inline 的 currentTab 变量（changeMonth / executeDeleteConfirm / submitManual 仍读它）
  window.currentTab = id;

  // 1. 底部导航高亮
  for (const btn of qsa(".bni[data-t]")) {
    toggleClass(btn, "active", btn.getAttribute("data-t") === id);
  }

  // 2. tab 容器显隐
  for (const [tabId, def] of _tabs) {
    const node = byId(def.domId);
    if (!node) continue;
    if (tabId === "search") {
      node.style.display = "none"; // 永远隐藏：搜索由 modal 接管
      continue;
    }
    node.style.display = tabId === id ? "flex" : "none";
  }

  // 3. 通知目标 tab
  const def = _tabs.get(id);
  if (def?.onShow) {
    try { def.onShow(); }
    catch (err) { console.error(`[nav] tab "${id}" onShow threw:`, err); }
  }
}

/** 给 .bnav .bni 元素绑 click → showTab(data-t)。 */
export function attachNavClicks(root = document) {
  for (const btn of qsa(".bni[data-t]", root)) {
    btn.addEventListener("click", () => {
      fxTab();
      showTab(btn.getAttribute("data-t"));
    });
  }
}
