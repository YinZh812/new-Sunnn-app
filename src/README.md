# src/ 模块索引

模块化重构的源码目录。零构建工具，浏览器原生 ES Modules，由 `index.html` 通过 `<script type="module" src="src/main.js">` 引入。

## 分层

```
state/      数据 + 持久化 + 同步       —— 唯一可变状态来源
domain/     纯逻辑（解析/分类/格式化）  —— 无 DOM 无 IO
ui/         视图层（tab/modal/组件）    —— DOM 操作集中在此
utils/      跨层小工具
main.js     入口：装配各层并启动
```

样式文件在同级目录 `styles/` 下，按依赖顺序加载：

| 文件 | 内容 |
|---|---|
| `styles/base.css` | reset + `:root` CSS 变量 |
| `styles/themes.css` | 9 套 `.theme-*` 主题覆盖 |
| `styles/components.css` | 布局结构 + 所有 UI 组件样式（约 590 行） |

> 当 `components.css` 后续臃肿到难以导航时，可再切分出 `layout.css`（页面骨架/导航/弹窗容器）与 `components.css`（具体小部件）。

## 模块清单

| 路径 | 职责 |
|---|---|
| `main.js` | 入口：storage.load → store init → ui init → 首次 render → sync 启动 |
| `state/store.js` | 中心 store：`get/set/on/emit`；持有 txs/settings/budgets/goals/customCategoriesByType/deletedSugs/userName |
| `state/storage.js` | localStorage 读写封装（6 个键） |
| `state/auth.js` | Supabase 登录/注册/重置/会话 |
| `state/sync.js` | 云同步：pull-on-login / debounced-push / 冲突合并 |
| `domain/categories.js` | 12 类别配置（图标/颜色/类型映射） |
| `domain/currency.js` | 货币识别、转换、格式化 |
| `domain/dates.js` | 时间标签、精度、月份范围、相对日期 |
| `domain/voice/dictionary.js` | BRAND_MAP / VOICE_CAT_MAP / VOICE_INCOME_KW / VOICE_SAVINGS_KW |
| `domain/voice/parser.js` | detect/extract/clean + parseVoiceText |
| `domain/voice/tests.js` | runVoiceTests() 控制台自测 |
| `ui/tabs/main.js` | 账单页（Hero + 列表） |
| `ui/tabs/analysis.js` | 分析页（饼图/排行/预算/目标） |
| `ui/tabs/search.js` | 搜索 tab |
| `ui/tabs/goals.js` | 目标 tab |
| `ui/tabs/settings.js` | 设置页（含主题应用） |
| `ui/modals/input.js` | 一句话记账输入 |
| `ui/modals/confirm.js` | 确认弹窗（含内联编辑） |
| `ui/modals/manual.js` | 手动记账 |
| `ui/modals/detail.js` | 交易详情/编辑/删除 |
| `ui/modals/auth.js` | 登录注册弹窗 |
| `ui/modals/currency.js` | 欧/人民币货币冲突弹窗 |
| `ui/modals/month-picker.js` | 月份选择 |
| `ui/components/overlay.js` | 通用弹窗 open/close + 遮罩 + 下划手势 |
| `ui/components/inline-edit.js` | 通用就地编辑 |
| `ui/components/swipe.js` | 列表边缘换月 + 左滑删除 |
| `ui/components/wheel-time.js` | 滚轮时间选择 |
| `ui/components/nav.js` | 底部导航切换 |
| `ui/components/sfx.js` | 音效 |
| `utils/dom.js` | qs/qsa/on/cls 等小帮手 |
| `utils/format.js` | 数字/金额格式化 |

## 依赖方向（严格自底向上）

```
utils/        ← 任何层都可依赖
domain/       ← 仅依赖 utils
state/        ← 依赖 domain + utils
ui/           ← 依赖 state + domain + utils
main.js       ← 依赖所有层
```

ui 不能直接进 storage/sync；storage/sync 不能动 DOM。任何反向依赖都是设计错误。
