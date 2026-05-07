// utils/dom.js —— DOM 操作的最小帮手
// 只做形式化简化，不引入框架风格的"虚拟 DOM"。所有函数都是单一目的、零副作用、可摇树。
//
// 命名规则：byId(短)、qs/qsa(查询)、on(绑定)、addClass/removeClass/toggleClass/hasClass(类操作)、
//           show/hide/setVisible(显隐)、ce(createElement)。

/** 依 id 取元素，返回 HTMLElement | null */
export const byId = (id) => document.getElementById(id);

/** querySelector 简写，可指定 root（默认 document） */
export const qs = (selector, root = document) => root.querySelector(selector);

/** querySelectorAll 返回真数组（可 .map/.filter） */
export const qsa = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

/**
 * 绑定事件，返回卸载函数：
 *   const off = on(btn, "click", handler);
 *   off();   // 卸载
 */
export const on = (el, event, handler, options) => {
  if (!el) return () => {};
  el.addEventListener(event, handler, options);
  return () => el.removeEventListener(event, handler, options);
};

/** 给元素加一个或多个类名（自动跳过 null/undefined） */
export const addClass = (el, ...names) => {
  if (el) el.classList.add(...names.filter(Boolean));
};

/** 移除一个或多个类名 */
export const removeClass = (el, ...names) => {
  if (el) el.classList.remove(...names.filter(Boolean));
};

/** 切换类名；force 可选，true 强加 / false 强去 */
export const toggleClass = (el, name, force) => {
  if (el) el.classList.toggle(name, force);
};

/** 是否含有类名 */
export const hasClass = (el, name) => !!el && el.classList.contains(name);

/** 显示元素（display = '' 让其回到 CSS 默认值） */
export const show = (el, display = "") => {
  if (el) el.style.display = display;
};

/** 隐藏元素 */
export const hide = (el) => {
  if (el) el.style.display = "none";
};

/** 根据布尔值切换显隐 */
export const setVisible = (el, visible, displayWhenShown = "") => {
  if (!el) return;
  el.style.display = visible ? displayWhenShown : "none";
};

/**
 * createElement 简写：
 *   ce("div", { class: "foo bar", id: "x" }, "hello")
 *   ce("button", { onclick: () => ... }, [child1, child2])
 */
export const ce = (tag, attrs = {}, children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class" || k === "className") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "dataset" && typeof v === "object") {
      Object.assign(el.dataset, v);
    } else {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  if (children != null) {
    const arr = Array.isArray(children) ? children : [children];
    for (const c of arr) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  return el;
};

/** 委托式事件：在容器上监听，命中 selector 时触发 */
export const delegate = (root, event, selector, handler) => {
  return on(root, event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
};
