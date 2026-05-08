# Session 进度归档（2026-05 重构）

> 用途：在新 session 里能快速接上当前进度。先看这份，再看 `src/ARCHITECTURE.md`。

---

## 一句话现状

**架构重构已完成（~90%）**。`index.html` 从 2109 行 → 516 行（-75.5%）。33 个模块 ~4700 行，严格三层架构（utils → domain → state → ui）。剩余 ~160 行 inline 是纯基础设施（SFX、图标字典、数据层、事件监听、auth stub）——不是业务逻辑，只是胶水代码。

## 部署

- GitHub Pages：`https://yinzh812.github.io/new-Sunnn-app/`
- 开发：Cursor Live Server 右键 `index.html`（`file://` 不支持 ES Modules）
- 推送：`git push` → 等 1 分钟 → 手机刷新（建议无痕模式避缓存）

---

## 本轮 Session 完成事项（按顺序）

### 导航系统迁移
- `nav.js`：`showTab` 同步 `window.currentTab` 给 inline 残留代码
- `main.js`：激活 `attachNavClicks()`、`showTab("main")` 首屏渲染
- `index.html`：删除 `showPage`/`goTab` 函数、移除 nav 按钮 onclick

### 渲染枢纽迁移
- `main.js`：`window.render` 桥接——同步 inline 状态到 store + 触发 `mainTab.renderList()`
- `index.html`：删除 `render()`（含 fallback hero 渲染 35 行）+ `renderList()`（17 行）
- 初始渲染从 inline `render()` 改为 bootstrap `showTab("main")`

### 输入流迁移
- `input.js`：修正 DOM ID 错误（`#inputField` → `#field`）、补全 `doSend`/`open`/`clearInputField`
- `main.js`：桥接 `window.doSend`、`openInputSheet`、`chooseCurrency`、`clearInputField`
- `index.html`：删 `doSend`/`_doSendFinish`/`chooseCurrency`/`openInputSheet`/`parseVoiceText` 等

### 格式帮手清理
- 删 11 个死函数（`rate`/`netV`/`sumT`/`fmtA`/`fmtLabel`/`dayL`/`groupListLbl`/`listTimInnerText`/`listTimBlockHtml`/`LIST_WK`/`fmtFull`）
- 保留 `amtC`/`typeL`/`getTopDescs`（当时仍有 inline 调用方）

### 内联编辑迁移
- `mainTab`：新增 `inlineEditDesc`（列表行就地编辑描述）
- `main.js`：桥接 `window.inlineEditDesc`

### WheelTime 迁移
- `wheel-time.js`：新增 `openWheelTimeForTx`（为交易行打开时间选择器）
- `main.js`：桥接 `openWheelTime`/`closeWheelTime`/`openWheelTimeForTx`/`showToast`
- `index.html`：删 `InfiniteWheel` 类 + 相关函数（-86 行）

### 列表滑删死代码清理
- `initListEdgeScroll`（~130 行）+ `bindListRowSwipe`（~36 行）已被模块 `swipe.js` 完全接管
- 保留 `closeOtherListSwipe`/`resetListSwipeAll`（仍被 `openDetail` 调用）
- -165 行

### 大规模死代码清理
- 删除所有已被 `window.*` 桥接覆盖的 inline 函数体：
  - 手动记账：`mc*`/`openManual`/`submitManual`/`saveDraft`/`restoreDraft` 等
  - 详情：`openDetail`/`renderDetailBody`/`detailEdit*`/`doEdit`/`doDelete`
  - 确认：`confirmDelete`/`resetDeleteConfirmRow`/`cancelDeleteConfirm`/`executeDeleteConfirm`
  - 颜色：`hslToHex`/`hexToHsl`/`contrastText`/`getCurrentAccent`/`getEffectiveColor`/`applyTheme`
  - 格式：`escTx`/`showToast`/`amtC`/`typeL`/`getTopDescs`
- -73 行

### 语音识别迁移
- `input.js`：新增 `toggleVoice`（Web Speech API 持续识别 + 自动重启）
- `main.js`：桥接 `window.toggleVoice`
- -53 行

### 大规模模块迁移（最后批次）
- **Coin 切换**：`toggleDisplayCurrency` → mainTab
- **高级主题**：`openColorPicker`/`bindLitSlider`/`applyCppLive`/`saveAndRefreshCpp`/`resetCustomColor`/`closeColorPicker` + `openThemeAdvanced`/`closeThemeAdvanced`/`resetAllCustomColors` → settingsTab
- **类别设置 UI**：`renderCatSettings`/`openCatSettings`/`closeCatSettings`/`editCatIcon`/`openLucidePicker`/`closeLucidePicker`/`deleteCat`/`addNewCat` → settingsTab
- **预算编辑器**：`addBudgetCat`/`deleteBudgetCat`/`openBudgetCatEditor`/`closeBudgetCatEditor`/`renderBudgetCatEditor`/`addBudgetCatNew` → goalsTab
- **金额内联编辑**：`inlineEditAmt`/`closeIamt`/`iaInput`/`iaDateChange` → mainTab
- -59 行（575→516）

### Bug 修复

**致命 SyntaxError（移动端全部功能失效）：**
- 原因：`index.html` 第 414 行注释内 `detailEdit*/doEdit` 中的 `*/` 提前关闭了 `/*`，导致 `已迁移至` 被当 JS 解析
- 症状：inline 脚本完全罢工 → `closeOv`/`saveTxs` 等都未定义 → 手动记账无反应、高级主题卡死
- 修复：改为 `detailEdit( Cat|Type|Cur )` 避免 `*/` 出现在注释中

**手动记账时间优化：**
- `manual.js`：`timePrecision` 从 `"day"` 改为 `"exact"` → 列表显示时刻
- `manual.js`：时间戳从硬编码 `T12:00:00` 改为动态 `当前时:分`
- 结果：新建交易默认显示实际时间而非 12:00

### 安全讨论
- 前端代码在浏览器中天然可见，模块化不改变这一点
- Supabase anon key 设计上就是公开的，安全靠 RLS 策略
- 语音解析规则（`parser.js` + `dictionary.js`）可通过 F12 查看
- 暂不迁移 Edge Function（会增加延迟，不值得）

---

## 当前文件统计

```
index.html      516 行  入口 + ~160 行基础设施
styles/
  base.css       38 行
  themes.css     77 行
  components.css 587 行
src/           7394 行  33 个 JS 模块
  main.js       473 行  装配序列 + 桥接层
  utils/        233 行  dom / format / icons
  domain/       714 行  categories / currency / dates / voice/{dict,parser,tests}
  state/        808 行  storage / store / auth / sync
  ui/components/ 843 行  sfx / overlay / swipe / wheel-time / nav / inline-edit
  ui/modals/   1929 行  input / confirm / manual / detail / auth / currency-confirm / month-picker / search
  ui/tabs/     2291 行  main / analysis / goals / settings / search
```

---

## inline 剩余（~160 行，不再计划迁移）

| 区域 | 性质 |
|---|---|
| `SFX`/`VIB` + `fx*` 函数 | 全局音效层，模块 `sfx.js` 有重复实现，inline 版是 `window.*` 访问入口 |
| `LUCIDE` 字典 + `lucideSvg`/`renderIconValue` | 图标引擎 |
| `CAT_LIST`/`THEMES`/`ACCENT_COLORS` + `ADV_COLOR_KEYS` | 静态配置数据 |
| `txs`/`settings`/`budgets`/`goals`/`viewYear`/`viewMonth`/`currentTab` 等 | 全局状态变量，被 `hookInlineSaves` 双向同步 |
| `pad`/`lsGet`/`lsSet`/`loadAll`/`save*` | 数据持久化层 |
| `DEFAULT_CATS_BY_TYPE`/`customCategories*`/`loadCustomCategories`/`getCatIcon` 等 | 类别系统数据 |
| `initSwipe` | 弹窗下划手势（启动时绑定 6 个 sheet） |
| `closeOtherListSwipe`/`resetListSwipeAll` | 列表滑删残留 helper |
| `closeOv` | 弹窗关闭入口（被 HTML onclick 调用） |
| `toggleSavingsPanel`/`startEditUserName`/`cp`/`syncCalc`/`selCM`/`tryShowDatePicker` | 杂项 UI |
| 启动事件监听 + `closeAllPopups`/`cppOutsideClick` | document 级 click handler |
| auth stubs + save 包装层 | `id`/`updatedAt` 时间戳逻辑 |

---

## 语音解析规则修改

需要改解析规则时，只改这两个文件：

| 文件 | 内容 |
|---|---|
| `src/domain/voice/parser.js` | 分词逻辑、金额提取、类别匹配、关键词规则 |
| `src/domain/voice/dictionary.js` | 中文数字词典 |

改完后浏览器控制台跑 `runVoiceTests()` 验证回归。

---

## Git 提交历史

```
8f2560e 完成全部剩余 inline 函数的模块迁移（-59 行，575→516）
f62e4c6 完成全部 inline 清理：语音识别迁移 + 文档更新
3a43759 迁移语音识别 toggleVoice 到 input.js 模块
93b582a 大规模清理已桥接的死 inline 函数体（-73 行）
0c516d7 清理死 inline 列表滑删/边缘手势（-165 行，854→689）
765c41c 迁移 WheelTime 滚轮时间选择器（-86 行，940→854）
593d24c 迁移 inlineEditDesc 到 mainTab 模块
4059c2c 清理 11 个死 inline 格式帮手
f616c97 迁移输入流 doSend/_doSendFinish 到模块 input.js
b7c6671 重写 README.md
7f1a27f 迁移 nav 导航 + render/renderList 枢纽
6dc024b 初始提交：模块化架构 + 导航迁移完成
(后续)  修复 SyntaxError + manual timePrecision 改动
```

## 开新 session 第一句话

> 先读 SESSION-NOTES.md 和 src/ARCHITECTURE.md，然后继续推进 [具体目标]。
