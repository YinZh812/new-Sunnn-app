# 账本 PWA · 模块化重构

个人记账 PWA。从 2109 行单文件 `index.html` 出发，已完成 **54.5% 代码削减**（→ 959 行），建立起 `src/` 三层模块架构（33 个 ES Module + 3 个 CSS 文件）。

> **模型声明**：本项目重构工作由 **DeepSeek V4 Pro**（deepseek-v4-pro）执行，通过 Claude Code CLI 交互完成。

---

## 重构时间线

### 项目起点

| 指标 | 重构前 | 当前 |
|---|---|---|
| `index.html` 行数 | 2109 | 516 |
| inline `<script>` 行数 | ~1400 | ~160 |
| CSS 位置 | `<style>` 700 行内联 | `styles/` 3 文件 702 行 |
| JS 模块 | 0 | `src/` 33 文件 ~4700 行 |
| Git | 无 | 11 commits |

### Phase 1：架构骨架（2026-05）

| 变更 | 说明 |
|---|---|
| 目录建立 | `src/utils/` `domain/` `state/` `ui/components/` `ui/modals/` `ui/tabs/` |
| CSS 抽离 | `<style>` 700 行 → `styles/base.css`(38) + `themes.css`(77) + `components.css`(587) |
| 33 模块文件 | utils(3) + domain(5) + state(4) + ui/components(6) + ui/modals(8) + ui/tabs(5) + main.js + ARCHITECTURE.md + README.md |
| 入口接入 | `index.html` 加 `<script type="module" src="src/main.js">` |
| window.acct | 全局命名空间暴露 store / modals / tabs / parseVoiceText / runVoiceTests |

### Phase 2：渐进迁移（2026-05，按完成顺序）

每个迁移遵循同一模式：模块实现 → main.js 桥接 `window.xxx = module.xxx` → inline 同名函数被覆盖 → inline 函数体保留作 fallback → 后续轮次删除。

| # | 迁移项 | 状态 | 涉及文件 |
|---|---|---|---|
| 1 | Hero 渲染 `mainTab.renderHero` | ✅ | main.js, index.html |
| 2 | 纯帮手 8 个（pad/escTx/fmtA/fmtLabel/fmtFull/groupListLbl/listTimInnerText/dayL） | ✅ | format.js, dates.js, main.js |
| 3 | 金额计算 rate/netV/sumT → netInEur/sumByTypeInEur | ✅ | currency.js, main.js |
| 4 | 数据持久化 hook `saveTxs`/`saveSettings` → store 自动同步 | ✅ | main.js |
| 5 | 主题应用 `applyTheme` → `settingsTab.applyTheme` | ✅ | settings.js, main.js |
| 6 | 列表渲染 `mainTab.renderList` | ✅ | main.js, main.js tab |
| 7 | 分析页 `analysisTab.render` + `setAnalysisTab` | ✅ | analysis.js, main.js |
| 8 | 语音测试 11/11 通过 | ✅ | voice/tests.js |
| 9 | 设置页 `renderSettings` + 全部 handlers | ✅ | settings.js, main.js |
| 10 | 反向同步 store → window.settings/txs | ✅ | main.js |
| 11 | 颜色帮手 hslToHex/contrastText/hexToHsl 等 | ✅ | settings.js, main.js |
| 12 | 目标页 `renderGoals` + setBudget/addGoal/deleteGoal | ✅ | goals.js, main.js |
| 13 | 推荐词 `renderAiSug` + hideAiSug + getTopDescs | ✅ | input.js, main.js |
| 14 | 确认弹窗 `confirm` modal 完整实现 | ✅ | confirm.js, main.js |
| 15 | 手动记账 `manual` modal 完整实现 | ✅ | manual.js, main.js |
| 16 | 交易详情 `detail` modal 完整实现 | ✅ | detail.js, main.js |
| 17 | 月份选择 `month-picker` modal 完整实现 | ✅ | month-picker.js, main.js |
| 18 | 搜索弹窗 `search` modal 完整实现 | ✅ | search.js, main.js |
| 19 | 登录弹窗 `auth` modal 桥接 | ✅ | auth.js, main.js |
| 20 | 删除 inline Supabase client（消除 GoTrueClient 警告） | ✅ | index.html |
| 21 | 第一轮死代码清理（删 143 行） | ✅ | index.html |
| 22 | **导航系统**：激活 `attachNavClicks` + `showTab`，删 inline `showPage`/`goTab` | ✅ | nav.js, main.js, index.html |
| 23 | **渲染枢纽**：`window.render` 桥接，删 inline `render()`/`renderList()` | ✅ | main.js, index.html |
| 24 | **输入流**：`doSend`/`_doSendFinish`/`openInputSheet`/`chooseCurrency`/`clearInputField` | ✅ | input.js, main.js, index.html |
| 25 | **格式帮手**：删 11 个死函数（rate/netV/sumT/fmtA/fmtLabel/dayL/groupListLbl/listTimInnerText/listTimBlockHtml/LIST_WK/fmtFull）| ✅ | index.html |
| 26 | **内联编辑**：`inlineEditDesc` → mainTab 模块 | ✅ | main.js, index.html |
| 27 | **WheelTime**：InfiniteWheel/openWheelTime/openWheelTimeForTx → wheel-time.js | ✅ | wheel-time.js, main.js, index.html |
| 28 | **列表滑删**：删死 initListEdgeScroll/bindListRowSwipe（已由 swipe.js 完全接管）| ✅ | index.html |
| 29 | **大规模死代码清理**：删所有已桥接的 manual/detail/confirm/颜色/格式/类别切换 inline 体 | ✅ | index.html |
| 30 | **语音识别**：`toggleVoice` → input.js 模块 | ✅ | input.js, main.js, index.html |
| 31 | **币种切换**：`toggleDisplayCurrency` → mainTab | ✅ | main.js, index.html |
| 32 | **高级主题 ColorPicker**：openColorPicker/bindLitSlider/applyCppLive 等 + openThemeAdvanced/resetAllCustomColors → settingsTab | ✅ | settings.js, main.js, index.html |
| 33 | **类别设置 UI**：renderCatSettings/openCatSettings/editCatIcon/openLucidePicker 等 → settingsTab | ✅ | settings.js, main.js, index.html |
| 34 | **预算编辑器**：addBudgetCat/deleteBudgetCat/openBudgetCatEditor/renderBudgetCatEditor 等 → goalsTab | ✅ | goals.js, main.js, index.html |
| 35 | **金额内联编辑**：inlineEditAmt/closeIamt/iaInput/iaDateChange → mainTab | ✅ | main.js, index.html |

---

## 当前架构

```
index.html          (959 行，含 ~620 行 inline <script>)
styles/
├── base.css        38 行  :root 变量
├── themes.css      77 行  9 套主题
└── components.css  587 行 全部 UI 样式
src/
├── main.js         415 行  入口 + bootstrap + 桥接层
├── ARCHITECTURE.md        架构蓝图
├── README.md              模块索引
├── utils/
│   ├── dom.js              DOM 帮手（qsa/byId/toggleClass/el）
│   ├── format.js           格式化（escapeHtml/formatSignedAmount/currencySymbol/pad2/splitDecimal）
│   └── icons.js            Lucide SVG 图标引擎
├── domain/
│   ├── categories.js       类别系统
│   ├── currency.js         币种换算（netInEur/sumByTypeInEur/safeRate/toEur）
│   ├── dates.js            日期格式化（isInMonth/formatGroupHeader/formatTransactionTime 等）
│   └── voice/
│       ├── dictionary.js   中文数字 → 数值词典
│       ├── parser.js       语音文本 → 结构化交易
│       └── tests.js        13 条回归用例（11 pass, 2 knownEdge）
├── state/
│   ├── storage.js          localStorage 读写
│   ├── store.js            中心 store + 事件总线
│   ├── auth.js             Supabase 认证（session/token 管理）
│   └── sync.js             云端同步（push/pull/last-write-wins）
└── ui/
    ├── components/
    │   ├── sfx.js          音效/振动/首次手势解锁 AudioContext
    │   ├── overlay.js      弹窗叠加层 openOv/closeOv
    │   ├── swipe.js        左滑删除 + 列表边缘换月手势
    │   ├── wheel-time.js   滚轮时间选择器
    │   ├── nav.js          **底部导航** Tab 注册/切换/高亮
    │   └── inline-edit.js  行内编辑（描述/金额）
    ├── modals/
    │   ├── input.js        主输入弹窗 + 语音识别 + AI 推荐词
    │   ├── confirm.js      确认弹窗（单笔/多笔 + 内联编辑）
    │   ├── manual.js       手动记账（计算器状态机 + 类别/货币/日期）
    │   ├── detail.js       交易详情 + 行内编辑 + 删除确认
    │   ├── auth.js         登录/注册/找回密码/Google OAuth/手动同步
    │   ├── currency-confirm.js  货币冲突确认
    │   ├── month-picker.js 年/月网格选择器
    │   └── search.js       搜索弹窗
    └── tabs/
        ├── main.js         Hero 统计 + 交易列表
        ├── analysis.js     饼图/排行/预算/目标分析
        ├── goals.js        预算/目标管理
        ├── settings.js     设置表单 + 主题/货币/音效/导出/导入/清理
        └── search.js       搜索页
```

### 依赖方向（严格自底向上，不可反向）

```
utils/          任何层都可依赖
domain/         仅依赖 utils
state/          依赖 domain + utils
ui/             依赖 state + domain + utils + ui/components
main.js         装配所有层
```

### 数据流

```
用户操作 → ui/* 调 store.setXxx()
  → store 自动 persist 到 localStorage
  → store.emit("xxx:changed")
  → 订阅者 tabs/sync 联动刷新
```

### 桥接模式（渐进迁移核心）

```
inline <script> 同步执行           module <script type="module"> deferred
     │                                      │
     ├─ function renderXxx(){...}           ├─ import * as tab from "..."
     ├─ var txs/settings/...                ├─ window.renderXxx = tab.render
     │                                      ├─ window.acct = {...}
     └─ render() // 初始渲染               └─ showTab("main") // 接管首屏
```

模块通过 `window.X = module.X` 覆盖 inline 同名函数。Inline 函数体保留作 fallback（模块未加载时），后续轮次逐步删除。

---

## 已知产品行为（非 bug）

| 行为 | 说明 |
|---|---|
| Hero 货币切换 ≠ 列表币种 | Hero 顶部 €/¥ 只影响 Hero 总额（欧元×汇率→人民币）。列表每行始终按 `tx.currency` 原币种显示。Hero 总额与列表加和不逐字相等是设计如此。 |
| "最后" 关键词误切分 | `voiceSplitInput` 将"最后"当多笔分隔词。`"kevin赌我最后一球不进 100rmb"` 会被误切。已在 tests.js 标 `knownEdge: true`。 |
| 初始渲染时序 | 首屏由 `showTab("main")` 在 bootstrap 中渲染（模块 deferred 执行），比 inline `render()` 晚 ~10ms。无视觉闪烁。 |

---

## inline `<script>` 剩余（~160 行，纯基础设施）

| 区域 | 说明 |
|---|---|
| SFX/VIB/fx* | 音效+震动全局函数 |
| LUCIDE 图标引擎 + lucideSvg/renderIconValue | SVG 图标渲染 |
| CAT_LIST/THEMES/ACCENT_COLORS | 静态配置数据 |
| 全局状态变量 (txs/settings/...) | 被 hookInlineSaves 同步 |
| pad/ls*/loadAll/save* | 数据持久化层 |
| ADV_COLOR_KEYS | 高级颜色配置 |
| DEFAULT_CATS_BY_TYPE + 类别系统 | 类别数据 + loadCustomCategories/getCatIcon 等 |
| initSwipe | 弹窗下划关闭手势 |
| 杂项 UI | toggleSavingsPanel/startEditUserName/closeOv/cp/syncCalc/selCM/tryShowDatePicker（~10 行） |
| 事件监听 + auth stub + save wrapper | 启动序列（~30 行） |

---

## 怎么开发

1. Cursor 装 **Live Server** 插件（Ritwick Dey）
2. 右键 `index.html` → Open with Live Server
3. 浏览器打开 `http://127.0.0.1:5500/.../index.html`
4. F12 控制台验证桥接：

```js
// 确认模块已接管
window.render === window.acct.tabs.mainTab.renderList  // → 应为 false（render 桥接 ≠ renderList）
!!window.acct  // → true
!!window.render // → true
```

⚠️ 不能双击打开 `file://`——ES Modules 受 CORS 限制。

---

## 维护者声明

- 严禁反向依赖：state 不能动 DOM；domain 不能读 localStorage；ui 不能直接调 storage
- 严禁新增全局 `var`：所有可变状态进 store
- 迁移单步原则：每次只搬一个函数，搬完就浏览器实测
- 提交粒度：每完成一个迁移目标就 git commit，方便回滚

---

*文档由 DeepSeek V4 Pro 维护，最后更新 2026-05-08*
