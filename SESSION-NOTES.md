# Session 进度归档（2026-05 重构）

> 用途：在新 session 里能快速接上当前进度。先看这份，再看 `src/ARCHITECTURE.md`。

---

## 一句话现状

`index.html` 从 2109 行单文件起步 → 现在 940 行。模块化源码（`src/` 33 个文件）已完整接管 Hero、列表、分析页、设置页、目标页、推荐词、7 个 modal、导航系统、渲染枢纽、输入流、格式帮手、**列表描述内联编辑**。inline `<script>` 剩余约 580 行：金额内联编辑、WheelTime、类别设置、手动记账、语音识别、高级主题、列表滑删。

---

## 大事记（按时间线）

### 阶段 1：架构骨架（任务 #1-#13）

- 备份归档到 `backups/`
- 建立 `src/` 三层架构：utils / domain / state / ui
- 拆 CSS：`<style>` 700 行 → `styles/{base,themes,components}.css`
- 写 33 个模块文件（约 3800 行）：
  - `utils/`：dom、format、icons
  - `domain/`：categories、currency、dates、voice/{dictionary,parser,tests}
  - `state/`：storage、store（含事件总线）、auth、sync
  - `ui/components/`：sfx、overlay、swipe、wheel-time、nav、inline-edit
  - `ui/modals/`：input、confirm、manual、detail、auth、currency-confirm、month-picker、search（**骨架，render 内部 TODO**）
  - `ui/tabs/`：main、analysis、goals、settings、search（**骨架**）
  - `main.js`：装配序列、bootstrap、window.acct 暴露
- index.html 加 `<script type="module" src="src/main.js">`

### 阶段 2：渐进迁移（任务 #14-#37）

逐个把 inline `<script>` 里的渲染/工具函数搬到模块版，并通过 `window.X` 桥接覆盖 inline 同名定义，让 inline 的调用自动路由到模块版。

| 已迁移 | 状态 |
|---|---|
| Hero 渲染（`mainTab.renderHero`） | ✅ |
| 8 个纯帮手 `pad/escTx/fmtA/fmtLabel/fmtFull/groupListLbl/listTimInnerText/dayL` | ✅ |
| 金额计算 `rate/netV/sumT`（`netInEur/sumByTypeInEur` 模块版） | ✅ |
| 数据持久化同步：hook `saveTxs/saveSettings` → store 自动同步 | ✅ |
| 主题应用 `applyTheme` 桥接到 `settingsTab.applyTheme` | ✅ |
| 列表渲染 `mainTab.renderList`（按日分组、左滑删除、内联编辑入口） | ✅ |
| 分析页 `analysisTab.render` + `setAnalysisTab`（饼图/排行/预算/目标） | ✅ |
| voice 测试用例 11/11 通过（kevin 边界已标 known） | ✅ |
| 设置页 `renderSettings` + 全部 helpers（主题/货币/音效/清理/导出/导入） | ✅ |
| 反向同步 store → window.settings/txs（模块改数据 inline 也能读到） | ✅ |
| 颜色帮手桥接 `hslToHex/contrastText/hexToHsl/getCurrentAccent/getEffectiveColor` | ✅ |
| 目标页 `renderGoals` + setBudget/addGoal/deleteGoal/getBudgetCatList | ✅ |
| 反向同步扩展 budgets/goals → window.budgets/goals | ✅ |
| 推荐词 `renderAiSug` + hideAiSug + getTopDescs/truncateSug/deleteSug | ✅ |
| 确认弹窗 `confirm` modal 完整实现（showConfirm/renderConfirmSingle/Multi/confEdit*/doConfirm/showAmtPrompt/showErr） | ✅ |
| input.js `_afterParse` 补齐 needAmountInput/showErr 分流逻辑 | ✅ |
| 手动记账 `manual` modal 完整实现（open/计算器/类型tab/类别行/货币pill/日期/草稿/推荐词/submitManual） | ✅ |
| 交易详情 `detail` modal 完整实现（renderDetailBody/行内编辑类别网格·类型循环·货币切换/doEdit→manual/doDelete→删除确认） | ✅ |
| 月份选择 `month-picker` modal 完整实现（open/render年月网格/toggleYM/pickerNav/selYear/selMonth + has-data标记） | ✅ |
| 搜索弹窗 `search` modal 完整实现（openSearchSheet/doSearchSheet → 类别图标+时间块+按ts降序+点击→详情） | ✅ |
| 登录弹窗 `auth` modal 桥接完成（openAuthSheet/doSignIn/doSignUp/doSignOut/doSignInWithGoogle/showForgotPasswordPrompt/doUpdatePassword/doManualSync） | ✅ |

### 顺手修的 bug

1. inline `closePopOnOut is not defined` 死代码 → 已修
2. inline `escTx` 没转义 `>` 和 `'`（XSS 隐患）→ 模块版 `escapeHtml` 修了
3. inline `setRate` 改汇率后**没调 render**（hero 不更新）→ saveSettings hook 后 emit 自动触发 `renderHero`

---

## 已知行为（不要误判为 bug）

### Hero 货币切换 ≠ 列表币种切换

Hero 顶部的 `€/¥` 按钮只切换 `settings.displayCurrency`，影响 **Hero 总额**（欧元×汇率显示为人民币）。**列表里每行交易仍按 `tx.currency` 原币种显示**。所以 Hero 总额跟列表行加和**故意不逐字相等**。

### "最后" 是多笔切分关键词

`voiceSplitInput` 把 `"最后"` 当强分隔词，支持 `"今天加油，最后买了 kebab"` 这种多笔模式。代价是 `"kevin赌我最后一球不进 100rmb"` 会被误切，amount/type 识别失败。已在 `tests.js` 标 `knownEdge: true`。

### Multiple GoTrueClient 警告

inline 与模块的 auth.js 各创建了一个 Supabase client。两者共享同一份 session storage，行为一致。**等下一波迁移 auth/sync 后这条警告会消失。**

---

## 下一步要做的事

### 高优先级（按建议顺序）

1. ~~**`renderSettings` 迁移**~~ ✅ 已完成
   - `src/ui/tabs/settings.js`：完整 render() + 全部 action handlers + 导出/导入/清理
   - 桥接 15 个 window 函数（renderSettings/setTheme/setAccent/setDefCur/setRate/setSfxEnabled/setSfxVolume/setVibEnabled/cleanupTxs/setExportRange/doExportRange/onImportFile/confirmImport/bindHueSlider + 5 个颜色帮手）
   - 新增反向同步：store → window.settings/txs
   - 高级颜色自定义（openThemeAdvanced/openColorPicker/closeColorPicker 等）仍留在 inline，通过 window 全局与模块版颜色帮手交互

2. ~~**`renderGoals` 迁移**~~ ✅ 已完成
   - `src/ui/tabs/goals.js`：完整 render() + getBudgetCatList + setBudget/addGoal/deleteGoal
   - 桥接 5 个 window 函数 + budgets/goals 反向同步
   - openBudgetCatEditor/closeBudgetCatEditor/renderBudgetCatEditor 仍留在 inline

3. ~~**`renderAiSug` 迁移**~~ ✅ 已完成
   - `src/ui/modals/input.js`：renderAiSug + hideAiSug + getTopDescs/truncateSug/deleteSug
   - 桥接 `window.renderAiSug` / `window.hideAiSug`

### 中优先级（modal 实质化）

骨架已就位，但内部 render/逻辑都是 TODO：

| Modal | 复杂度 | 关键内容 |
|---|---|---|
| ~~`confirm`（确认弹窗）~~ | ✅ 已完成 | 单笔/多笔渲染 + 内联编辑（金额/描述/类别/类型/货币）+ showAmtPrompt + showErr |
| ~~`manual`（手动记账）~~ | ✅ 已完成 | 计算器状态机、类型 tab、类别行、货币 pill、日期选择、草稿暂存、推荐词、提交/编辑 |
| ~~`detail`（交易详情）~~ | ✅ 已完成 | 完整字段展示 + 行内编辑（类别网格/类型循环/货币切换）+ 删除确认流程 |
| ~~`month-picker`（月份选择）~~ | ✅ 已完成 | 年/月网格 + has-data 标记 + 年份十年区间视图 |
| ~~`search`（搜索）~~ | ✅ 已完成 | 实时过滤 + 类别图标 + 时间块 + 按 ts 降序 + 点击→详情 |
| `currency-confirm`（货币冲突）| 极低 | 已基本完成，可能不需要再迁 |
| ~~`auth`（登录）~~ | ✅ 已完成 | 三模式切换 + 邮密/Google OAuth/忘记密码/重置密码/手动同步/退出 |

### 低优先级（清理收尾）

4. ~~**删 inline 的 Supabase client**（消除 GoTrueClient 警告）~~ ✅ 已完成
   - 删除 ~288 行：inline Supabase client 创建、auth 函数、sync 层（cloudPull/cloudPush）、`_initAuth` 启动
   - 保留 auth stubs（openAuthSheet/doSignIn 等空函数，模块桥接会覆盖）
   - 保留 saveTxs id/updatedAt 包装（兼容模块 sync 的 last-write-wins）
   - GoTrueClient 多实例警告已消除
5. ~~**删 inline 的死代码**~~ ✅ 已完成（第一轮）
   - 删除 143 行（16 个代码块），净减 127 行：1137 → 1010 行
   - 已删：语音解析（cnNumToInt…splitInput）、renderAiSug/hideAiSug/truncateSug、
     确认弹窗全部（showAmtPrompt…doConfirm）、分析页全部（renderAnalysis/setAnalysisTab/totalSavings）、
     搜索页 doSearch、目标页（renderGoals/getBudgetCatList/addGoal/deleteGoal/setBudget）、
     设置页核心（renderSettings/setTheme/setAccent/setDefCur/setSfx*/setVibEnabled/cleanupTxs/setExportRange/doExportRange/setRate）、
     导入功能全部、搜索弹窗 inline 版、bindHueSlider、月份选择器全部、
     selType/selCur/selCat/buildCatGrid/showManualSug/deleteSug
   - 保留：render/renderList（首屏）、格式帮手、InfiniteWheel/WheelTime、
     内联编辑（inlineEditDesc/Amt）、列表滑删、类别设置、语音识别（toggleVoice）、
     高级主题自定义、nav（showPage/goTab）、输入流（doSend/_doSendFinish）、
     预算类别编辑器、下载/导入帮手函数
   - 未删手动记账函数（selTypeTab/syncTypeTabs/mcInput 等），因与类别设置共享状态，留给第二轮
6. ~~**激活模块的 `attachNavClicks` 与 `showTab`**~~ ✅ 已完成
   - `src/ui/components/nav.js`：showTab 内同步 `window.currentTab`
   - `src/main.js`：激活 attachNavClicks、showTab("main") 首屏、window.showPage/window.render 桥接
   - `index.html`：删除 showPage/goTab 函数、render/renderList 函数、移除 nav onclick 属性
   - 删 render/renderList 约 53 行，inline 从 1008 → 959 行
7. **继续清理 inline 死代码**（内联编辑、WheelTime、类别设置、手动记账、语音识别、高级主题、输入流、列表滑删）

---

## 渐进迁移操作手册（每次开 session 用）

### 准备

1. Cursor 装 Live Server 插件
2. 右键 `index.html` → Open with Live Server
3. 浏览器打开后开 DevTools 控制台

### 迁移单步（以 renderXxx 为例）

```
① 摸底：grep inline 函数定义与依赖
   grep -n "^function renderXxx" index.html
   grep -n "renderXxx(" index.html  # 调用方

② 设计：列出依赖（store / domain / utils / 其他 inline 全局）
   决定哪些需要新增模块函数、哪些直接桥接

③ 实现：
   - 必要的 domain/utils 模块函数（纯函数优先）
   - 模块版 ui/tabs/xxx.js 或 ui/modals/xxx.js 的 render 实现
   - main.js 加 import + 桥接 window.renderXxx = xxxTab.render

④ 静态验证：grep 桥接行 + CSS 类名存在 + 依赖 import 都已解析

⑤ 浏览器实测：
   - 控制台：window.renderXxx === window.acct.tabs.xxxTab.render → true
   - 视觉：跟之前像素一致
   - 操作：相关交互（点击/切换）都正常

⑥ 提交（git add + commit）
```

### 关键控制台命令

```js
// 桥接是否成功
[window.renderHero === window.acct.tabs.mainTab.renderHero,
 window.renderList === window.acct.tabs.mainTab.renderList,
 window.renderAnalysis === window.acct.tabs.analysisTab.render]

// store 状态查看
window.acct.store.getTxs().length
window.acct.store.getSettings()
window.acct.store.getBudgets()

// voice 解析回归测试
runVoiceTests()
// 期待：{ passed: 11, total: 11, knownEdge: 1 }
```

---

## 数字盘点

- `index.html`：原 2109 行 → 现在 1010 行（CSS 抽离 700 行 + Supabase 288 行 + 死代码 127 行）
- inline `<script>` 仍剩约 680 行（render/renderList、格式帮手、内联编辑、WheelTime、类别设置、手动记账变量/函数、语音识别、theme 高级自定义、输入流、nav、列表滑删）
- `src/`：33 个模块约 4000 行（含丰富 JSDoc 与渐进迁移说明）
- `styles/`：base.css(38) + themes.css(77) + components.css(587) = 702 行

---

## 待办（行政事项）

- [ ] **手动删除** `_TO-DELETE/` 目录（sandbox 没权限直接 rm，请你 shift+del）
- [ ] 考虑把 git 仓库初始化（如果还没的话），方便后续每次迁移有 commit 节点可回滚

---

## 维护者声明

模块层依赖方向严格自底向上：

```
utils/        ← 任何层都可依赖
domain/       ← 仅依赖 utils
state/        ← 依赖 domain + utils
ui/           ← 依赖 state + domain + utils + ui/components
main.js       ← 装配所有层
```

**严禁反向依赖**：state 不能动 DOM；domain 不能读 localStorage；ui 不能直接读 storage。

**严禁新增全局 var**：所有可变状态进 store。

更详细见 `src/ARCHITECTURE.md`。
