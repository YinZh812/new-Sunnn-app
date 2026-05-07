# 架构蓝图与迁移指南

## 现状（2026-05）

项目从 2109 行单文件 `index.html` 重构出了 32 个 ES Module 文件，目标架构已完整成型。

```
backups/                              ← 8 份历史 HTML 快照
styles/
├─ base.css         reset + :root 变量
├─ themes.css       9 套主题
└─ components.css   全部 UI 样式
src/
├─ main.js                            应用入口装配序列
├─ utils/    dom / format / icons     ✅ 可用
├─ domain/                            ✅ 可用（无副作用纯逻辑）
│  ├─ categories / currency / dates
│  └─ voice/{dictionary,parser,tests}
├─ state/                             ✅ 可用（数据 + 持久化 + 同步）
│  └─ storage / store / auth / sync
└─ ui/
   ├─ components/                     ✅ 可用
   │  └─ sfx / overlay / swipe / wheel-time / nav / inline-edit
   ├─ modals/                         ⚠️ 骨架 + 入口完整，render 内部待迁
   │  └─ input / confirm / manual / detail / auth /
   │     currency-confirm / month-picker / search
   └─ tabs/                           ⚠️ 骨架 + 状态完整，render 内部待迁
      └─ main / analysis / goals / settings / search
```

**`index.html` 未改动**：仍是 1409 行（CSS 已抽走，JS 内联仍在）。
线上版本完全不受影响。

## 三层依赖关系（严格自底向上）

```
utils/        ← 任何层都可依赖
domain/       ← 仅依赖 utils
state/        ← 依赖 domain + utils
ui/           ← 依赖 state + domain + utils + ui/components
main.js       ← 依赖所有层
```

**不能反向依赖**：state 不能动 DOM、domain 不能读 localStorage、ui 不能直接调 `localStorage.setItem`。

## 数据流

```
用户操作（点击/输入）
  → ui/* 调 store.setXxx()
  → store 自动 persist 到 localStorage
  → store.emit("xxx:changed")
  → 订阅者：tabs / sync / 同步圆点 全部联动
```

替代了原来"到处调 `render()` + `saveTxs()`"的散乱模式。

## 渐进迁移操作手册

### 单步 = 一个 render 函数

每次只搬一个具体函数，独立验证。例如把 `renderList()` 从 index.html 搬到 `src/ui/tabs/main.js`：

1. **打开** `index.html`，找到 `function renderList(...){ ... }`
2. **挪到** `src/ui/tabs/main.js` 内部，替换那里 `renderList()` 的 TODO
3. **替换全局变量**：
   - `txs` → `store.getTxs()`
   - `settings` → `store.getSettings()`
   - `viewYear` / `viewMonth` → `getViewYear()` / `getViewMonth()`（已暴露的 setter）
   - `escTx(...)` → 从 `utils/format.js` import `escapeHtml`
   - `pad(...)` → import `pad2`
   - `fmtA(t)` → import `formatSignedAmount`
4. **删 index.html 里那段**
5. **加（如未加）入口**：在 `</head>` 前加一行
   ```html
   <script type="module" src="src/main.js"></script>
   ```
6. **本地验证**：Cursor + Live Server，浏览器对照行为是否一致
7. **没问题就提交**；坏了就 git revert

### 推荐迁移顺序

```
风险递增：
1.  应用主题（settings.applyTheme） —— 已做
2.  音效解锁                          —— 已做
3.  ui/tabs/main.js renderHero        —— Hero 数字
4.  ui/tabs/main.js renderList        —— 交易列表（带左滑删除绑定）
5.  ui/modals/detail.js render        —— 详情弹窗
6.  ui/modals/input.js renderAiSug + showAmtPrompt
7.  ui/modals/confirm.js render + 内联编辑
8.  ui/modals/manual.js calc 状态机
9.  ui/tabs/analysis.js 饼图 + 排行 + 预算 + 目标
10. ui/tabs/settings.js render 表单
11. 其余 modal
```

每步搞定后 inline `<script>` 自然萎缩。当 inline 完全清空，删掉 `<script>...</script>` 标签即可。

## window.acct 全局命名空间

为方便迁移期间老 inline 代码读模块化的状态：

```js
window.acct.store                    // 中心 store
window.acct.parseVoiceText           // 语音解析
window.acct.runVoiceTests            // 控制台测试
window.acct.toast                    // 顶部提示
window.acct.modals.{input,confirm,manual,detail,auth,...}
window.acct.tabs.{mainTab,analysisTab,goalsTab,settingsTab,searchTab}
```

Inline 代码可以这样过渡：
```js
// 旧：
saveTxs(txs.filter(...));
// 新：
window.acct.store.setTxs(window.acct.store.getTxs().filter(...));
```

## 测试

```js
// 浏览器控制台
runVoiceTests()   // 13 条解析回归用例
```

任何 voice 改动都应跑通这个。

## 已知产品行为（不要误判为 bug）

### Hero 货币切换按钮 ≠ 列表币种切换

Hero 顶部右上角的 `€` / `¥` 按钮（`#curToggleBtn`）调用 `toggleDisplayCurrency()`，只把 `settings.displayCurrency` 在 EUR/CNY 之间切换。

**它只影响**：Hero 区的总额数字（欧元 × 汇率显示为人民币，或反之）、储蓄浮层数字。

**它不影响**：交易列表里每一行的金额——每行始终按 `tx.currency` 原币种显示（欧元交易就显示 €，人民币交易就显示 ¥）。

所以 Hero 显示的支出总额跟列表行金额加和**不会逐字相等**（如果中间存在币种换算）。这是设计如此，不是 renderList / renderHero 哪边算错了。

如果未来想做"切换 Hero 时列表也按显示币种重算"，需要在 `mainTab.renderList` 里读 `settings.displayCurrency` + 把每行金额转换后再渲染。

### "最后" 是多笔切分关键词

`voiceSplitInput` 把 `"最后"` 当强分隔词，用于支持 `"今天加油，最后买了 kebab"` 这种多笔模式。代价是 `"kevin赌我最后一球不进 100rmb"` 会被误切成两段，amount/type 识别失败。这条已在 `tests.js` 里标 `knownEdge: true`。

## 不该做的事

- ❌ 不要在 ui 模块里 `import "./../../state/storage.js"` 直接读 localStorage——走 store
- ❌ 不要在 domain 模块里 `import "../utils/dom.js"`——domain 不动 DOM
- ❌ 不要在 state 模块里 `import` 任何 ui/——state 不知道 ui 存在
- ❌ 不要新加全局 `var xxx`——所有可变状态进 store

## 文档维护

`src/README.md` 是模块索引，每次新增/删除/重命名 module 都更新它。
