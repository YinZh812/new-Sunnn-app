// ui/tabs/search.js —— 搜索 tab（保留 DOM 但永远隐藏）
//
// 历史原因：底部导航曾有"搜索"按钮，对应 #t-search 容器。
// 现在搜索改成顶部放大镜 → 弹窗触发；这个 tab 容器保留以便回滚，
// 但 nav.showTab("search") 会强制把它 display:none（详见 ui/components/nav.js）。
//
// 文件保留是为了：① 模块树完整 ② 万一哪天想恢复底部 tab 形态
//
// 当前没有任何渲染逻辑。

export function init() {
  /* no-op */
}

export function onShow() {
  /* no-op —— nav.js 已经把容器隐藏了 */
}
