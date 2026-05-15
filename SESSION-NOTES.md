# Session 进度归档

> 用途：在新 session 里能快速接上当前进度。先看这份，再看 `src/ARCHITECTURE.md`。

---

## 一句话现状（2026-05）

**架构重构（2026-04）+ 语音解析 v2 + 阶段 6 学习规则 + 类别重命名 + 多币种支持** 全部完成并部署。

- `index.html` 516 行（入口 + ~160 行胶水 inline）
- 36+ 个 JS 模块 ~8200 行，严格三层架构（utils → domain → state → ui）
- 一句话记账：**v2 已在生产启用**（`USE_VOICE_V2 = true`）；v1 仍保留作回滚
- 多币种：支持 EUR / CNY / USD / GBP / JPY，基础币 = CNY，可启用任意子集

## 部署

- GitHub Pages：`https://yinzh812.github.io/new-Sunnn-app/`
- 开发：Cursor Live Server 右键主项目根目录的 `index.html`（**别在 `.claude/worktrees/*` 下跑**）
- 推送：`git push` → 等 1 分钟 → 手机无痕模式刷新
- **当前线上**：`USE_VOICE_V2 = true`，跑 v2

---

## 本轮 Session（2026-05，post-2a0aad6）完成事项

承接上一轮（v2 解析器 stages 1-4.1）。本轮新增：

### 1. v2 解析器正式上线（commit `5b22793`）
- `config.js` 把 `USE_VOICE_V2 = false → true` → push
- 线上从 v1 切到 v2

### 2. 默认类别重命名（commit `7a628a6`）
单字偏好命名 → 通用二字：
| 旧 | 新 |
|---|---|
| 吃 | 餐饮 |
| 买 | 购物 |
| 车 | 交通（不是"汽车"——因为覆盖地铁/公交/飞机；与 LEGACY_CAT_LUCIDE 的"交通"对齐）|

- `categories.js`：`DEFAULT_CATS_BY_TYPE.expense` 改名 + `CAT_DEFAULTS_VERSION` bump 触发 `customCategoriesByType` 重置
- `categories.js` 新增 `CATEGORY_RENAME_V3` + `migrateLegacyTxCategoryNames` 帮手
- `store.js hydrate`：一次性 tx 迁移（`txCategoryRenamedV3` flag 防重跑）
- `parser.js` + `parser.v2.js` `voiceRemapCategoryByType` 返回新名（dict 内部标签仍是"吃/玩/购物/其他"，只在 remap 时换 UI 名）
- `LEGACY_CAT_LUCIDE` 加旧名兜底（兼容历史 tx 图标查询）

### 3. 阶段 6 学习规则（commits `3f54d5a` → `54c5cdf` → `2a11f79`）

让 v2 学用户的类别纠正：弹窗里改类别 → 系统记 `(phrase, type) → category`，下次自动用。

**架构**：
```
src/domain/learning.js          ← 纯函数：record/forget/find/apply/bump/clear
src/domain/learning.test.js     ← 29 条 Node 单测
src/state/storage.js            ← LEARNED_RULES key = "acct_learnedRules"
src/state/store.js              ← state.learnedRules + 4 setter
src/ui/modals/confirm.js        ← doConfirm 时比较 _origCategory ≠ category → addLearnedRule
src/ui/modals/input.js          ← parseVoiceText 传 learnedRules option
src/domain/voice/parser.v2.js   ← applyLearnedRules 子串匹配 + 最长优先，覆盖 voiceRemap
src/ui/tabs/settings.js         ← "我的个人词典" section（删/清空）
```

**关键决策**：
- phrase 用 `voiceCleanDesc` 输出（短词、去日期/金额/分隔词后剩的）
- (phrase, type) 复合键 — 同 phrase 不同 type 分别存
- 子串匹配 + 大小写不敏感 + 最长优先
- 学到的 category 优先级 > parser 推断
- 短 phrase (< 2 字) 与兜底 "消费" 拒收
- **不同步 Supabase**（仅 localStorage），多设备各自学
- 设置页里可看/删/清空

**还顺手修了 voice dict bug**（commit `8e276f4`）：`VOICE_INCOME_KW` 里的单字 "卖/退/赚/挣" 会撞 "外卖/退步" 等，导致 `吃饭100` 被错判 income。改成完整词形 "卖掉/卖了/卖书/卖出/退款/退钱/退我/退回/退还" 等。

### 4. 类别管理 UX 大修（commits `2edf785` + `1b220ce`）

| 问题 | 修复 |
|---|---|
| 类别管理重排顺序后，手动记账面板的类别行不刷新 | inline `saveCustomCategories()` 只写 localStorage，不通知 store。在 main.js `hookInlineSaves` 里包一层 → `store.setCustomCategoriesByType()` → emit `cats:changed`；manual.js / detail.js 订阅 → 重建 |
| 详情页类别选择框需要"管理"入口 | 蓝框右下加齿轮按钮 → `openCatSettings()`；齿轮做成 absolute 子节点，挂在 `#dt-cat-grid` 内部，带 `padding-bottom:42px` 腾空间 |
| 点齿轮后类别管理被详情面板遮住 | `ov-catsettings` 加 `style="z-index:85"`（详情默认 60），保证类别管理盖在详情之上 |
| 手动记账类别行横向滚动，超过 4 个要左右滑 | `.manual-cat-row` 从 `flex+overflow-x:auto` 改成 `grid;repeat(4,1fr)` —— 4 个一行自动换行 |

### 5. 多币种支持（Task 1 + Task 2，commits `35ea096` → `ded880a` → `94f1b34` → `ef08952` → `f185c76` → `e0416e5`）

**Task 1**：手动记账左上角加圆形货币切换按钮（与 hero 右上角同款）
- `index.html`：删 `manual-cur-row`，在 `manual-type-bar` 内左上加 `<div id="manualCurToggleBtn">`
- `manual.js` `selCurToggle()`：循环 `enabledCurrencies`
- `components.css` 加 `.manual-cur-toggle` 样式

**Task 2**：多币种存储、UI、显示

支持 5 个币种：
```js
SUPPORTED_CURRENCIES = [
  { code: "CNY", symbol: "¥", label: "人民币" },  // 基础
  { code: "EUR", symbol: "€", label: "欧元" },
  { code: "USD", symbol: "$", label: "美元" },
  { code: "GBP", symbol: "£", label: "英镑" },
  { code: "JPY", symbol: "¥", label: "日元" },
];
```

**数据层**（`domain/currency.js` + `state/store.js`）：
- `SUPPORTED_CURRENCIES` / `DEFAULT_RATES_TO_CNY`（每币种 1 单位 = N CNY）
- `rateToCny` / `toCny` / `fromCny` / `convertAmount`：通用换算
- `txToCny` / `netInCny` / `sumByTypeInCny`：交易聚合（CNY 基础）
- 旧 API（`toEur` / `netInEur` / `sumByTypeInEur`）保留，兼容老调用
- `DEFAULT_SETTINGS` 加 `enabledCurrencies: ["EUR","CNY"]` + `ratesToCny: {CNY:1, EUR:7.8, USD:7.2, GBP:9.3, JPY:0.047}`
- `hydrate` 兼容：老 `eurToCny` 自动同步进 `ratesToCny.EUR`
- `setSettings` 双向同步 `eurToCny ↔ ratesToCny.EUR`，CNY 永远 = 1

**UI 层**：
- `settings.js` 货币与汇率卡完全重写：
  - 默认货币：dropdown
  - 启用列表：默认只显示已启用的（基础 CNY + 用户加的）
  - "+ 添加货币" 内嵌 select 选未启用的
  - 每行（非 CNY）有汇率输入 + × 移除
- `main.js` `toggleDisplayCurrency()` 循环 enabled
- `main.js` `renderHero()` 用 CNY 聚合 + `convertAmount` 转 dispCur
- `confirm.js` / `detail.js`：货币显示用 `currencySymbol()` + `curDisplay()`，`editCurrency` / `detailEditCur` 循环 enabled

**关键修复**（commit `ef08952`）：之前一句话 "吃饭100" 不跟随默认货币 → 不是 parser 问题，是 confirm.js 多处硬编码 `t.currency === "CNY" ? "¥" : "€"`。改用 `currencySymbol()`。

**最终行为表**（commit `e0416e5` 终态）：
| 显示位置 | 跟随什么 |
|---|---|
| 交易条右侧金额 | `tx.currency`（每笔自己的，不变）|
| 当日分组头"收 / 支" | **`settings.defaultCurrency`** |
| Hero 顶部圆按钮 + 大数字 | **`settings.displayCurrency`**（顶部按钮临时切）|
| 分析页饼图中央 + 类别排行 + 预算 + 储蓄目标 | **`settings.defaultCurrency`** |
| 一句话/手动新建的交易 | 用户选的 currency（默认从 `defaultCurrency` 来）|

`main.js mainTab.init()` 和 `analysis.js init()` 都订阅了 `settings:changed` → 改默认货币后立刻刷新。

---

## 学习规则使用方法（阶段 6 成果）

### 控制台
```js
acct.store.getLearnedRules()
acct.store.addLearnedRule("外卖", "expense", "餐饮")
acct.store.removeLearnedRule("外卖", "expense")
acct.store.clearLearnedRules()
```

### UI
设置页底部 → "我的个人词典" 卡：列表展示已学规则 + 单条 `[×]` 删除 + 清空按钮。

### 触发
- **自动学**：弹窗里改类别 → 比较 `_origCategory ≠ category` → 自动 `addLearnedRule(desc, type, newCategory)`
- **自动应用**：下次解析时 `applyLearnedRules(seg, type, learnedRules)` 子串匹配，命中则覆盖 parser 推断

### 测试
```js
runVoiceTestsV2()       // 44/44（+ 1 known edge）
runVoiceTests()         // v1 原版 11/11（不受 v2 影响）
```
Node 端：`node --input-type=module -e "import('./src/domain/learning.test.js').then(m => m.runLearningTests())"` → 29/29

---

## 多币种使用方法

### 启用新货币
1. 设置 → 货币与汇率 → "+ 添加货币" 下拉选（如美元）
2. 美元行立刻出现，填汇率（如 `1 $ = 7.2 ¥`）
3. 改"默认货币" dropdown 把新建交易默认改成美元（dropdown 只列已启用的）

### 切换显示币种（临时）
- 主页 Hero 顶部圆按钮：循环 enabled → Hero 大数字按显示币种换算
- 手动记账左上圆按钮：循环 enabled → 决定本笔交易 currency
- 详情页"货币"行：点击循环 enabled → 改这一笔 currency

### 移除货币
- 设置页 → 该行右侧 `×` → 移除（CNY 锁定，不能移）
- 若移除的是当前 default / display → 自动回落到第一个启用项

---

## 切换 v2 ↔ v1（回滚机制）

`src/domain/voice/config.js`：
```js
export const USE_VOICE_V2 = true;  // 改成 false 即回滚到 v1
```
然后 `git add` + commit + push。1 分钟生效。

---

## 已知边界 / 待办

- **多笔切分 + v2**：`今天加油300，然后超市买了牛奶和面包，还吃了快餐` 切分后无金额段会合并为单笔（v1 同行为；后续阶段可优化）
- **`kevin赌我最后一球不进100rmb`**：v2 仍误把"最后"当切分词（known edge，v1 同）
- **手动记账（manual.js）**：不产生 `timePhrase`，所以 daytime 精度只来自语音输入
- **学习规则不跨设备**：仅 localStorage；想 Supabase 同步需要新增 sync 字段
- **`index.html:454`** inline `applyTheme()` 在 main.js 加载前调用 → 控制台报错，但不影响功能。修法：删 inline 调用，依赖 `main.js bootstrap()`。

---

## 文件结构（更新）

```
src/domain/voice/
├─ config.js          USE_VOICE_V2 开关
├─ parser.active.js   按开关分发 v1/v2
├─ parser.js          v1（不动）
├─ dictionary.js      v1 词典（'卖/退/赚/挣' 单字已移除）
├─ tests.js           v1 回归 11/11
├─ parser.v2.js       v2（含 learning 接入）
├─ dictionary.v2.js   v2 词典
├─ preprocess.js      v2 预处理
└─ tests.v2.js        v2 回归 44/44

src/domain/
├─ categories.js      DEFAULT_CATS_BY_TYPE（餐饮/购物/交通）+ CAT_DEFAULTS_VERSION='2026-05-14-v3' + migrateLegacyTxCategoryNames
├─ currency.js        SUPPORTED_CURRENCIES + ratesToCny 系列 + convertAmount + 旧 EUR API
├─ dates.js           formatTransactionTime 支持 daytime
├─ learning.js        学习规则纯函数 (record/forget/find/apply/bump/clear)
└─ learning.test.js   29 单测

src/state/
├─ storage.js         + LEARNED_RULES key + loadLearnedRules/saveLearnedRules
└─ store.js           + state.learnedRules + 4 setter + DEFAULT_SETTINGS 加 enabledCurrencies/ratesToCny + hydrate 自动迁移
                      + setSettings 双向同步 eurToCny ↔ ratesToCny.EUR
                      + 一次性 tx category v3 重命名迁移（flag: txCategoryRenamedV3）

src/ui/tabs/
├─ main.js            renderList 分组头跟 defaultCurrency；订阅 settings:changed → 刷列表
├─ analysis.js        全面去 EUR-base；按 defaultCurrency 显示；订阅 settings:changed
└─ settings.js        + 货币与汇率卡（dropdown + 已启用列表 + "+ 添加货币" + 汇率输入 + × 移除）
                      + 我的个人词典卡（学习规则 UI）
                      + 订阅 cats:changed / learnedRules:changed 自动刷新

src/ui/modals/
├─ input.js           parseVoiceText 传 learnedRules option
├─ confirm.js         doConfirm 时 addLearnedRule；货币显示用 currencySymbol；editCurrency 循环 enabled；快照 _origCategory
├─ detail.js          货币显示用 curDisplay；detailEditCur 循环 enabled；类别选择框右下角齿轮；订阅 cats:changed
└─ manual.js          左上圆形货币按钮 selCurToggle 循环 enabled；订阅 cats:changed 重建类别行

styles/components.css 加 .manual-cur-toggle / .cur-row / .cur-row-x / .seg-btn-locked

index.html 改：ov-catsettings 加 style="z-index:85"；manual-type-bar 左上加 manualCurToggleBtn；删 manual-cur-row
```

---

## Git 提交历史（本轮 session 全量）

```
e0416e5 @ 列表分组头 & 分析页改用'默认货币'（settings.defaultCurrency）
f185c76 @ 列表分组头按显示币种渲染（误跟了 displayCurrency，被上一行修正）
ef08952 @ 多币种 UI 修复轮 3：默认值生效 + 卡片只显已启用 + 颜色一致
94f1b34 @ 多币种 UI 修复轮 2：设置卡重设计 + 详情页跟随启用列表
ded880a @ 多币种支持（Task 2）：5 个币种 + 设置页下拉/勾选/多汇率 + Hero 循环
35ea096 @ 手动记账：货币按钮改成左上角圆形切换（Task 1）
1b220ce @ 类别 UI 修复 2 轮：手动记账 4 列换行 + 详情齿轮位置 + cat-settings z-index
2edf785 @ 类别管理 UX 修复 + 详情类别框加齿轮按钮
8e276f4 @ 修 voice dict：去掉 income KW 里的单字'卖'/'退'/'赚'/'挣'
2a11f79 @ v2 阶段 6.3：设置页 '我的个人词典' UI
54c5cdf @ v2 阶段 6.2：学习规则消费方接入（功能闭环）
3f54d5a @ v2 阶段 6.1：学习规则模块 + 持久化 + store 接入（无 UI）
7a628a6 @ 默认类别重命名：吃/买/车 → 餐饮/购物/交通
5b22793 @ 启用 v2 解析器（USE_VOICE_V2: false → true）
2a0aad6 @ 更新 SESSION-NOTES：归档 v2 解析器全部阶段成果（上轮 session 收尾）
```

---

## 历史 Session 摘要

### 2026-05（上一轮）：v2 解析器 stages 1-4.1
- 8 个 commit（`262b22f` → `321cea6`）
- v1/v2 并存架构 + `config.js` 开关
- 预处理（emoji/全半角/错字）+ 中文数字 + 时间识别（含 daytime precision）
- 抢救 master 上的另一份 v2 草稿（22 条匿名用例 + 词典抽象）
- 详细见之前 SESSION-NOTES 的本节，本文已合并

### 2026-04：架构重构（90%）
- `index.html` 2109 行 → 516 行
- 迁出 33 个 ES Module（utils/domain/state/ui）
- 剩余 ~160 行 inline 是纯基础设施（SFX、图标字典、数据层、auth stub）—— 不计划再迁

---

## 开新 session 第一句话

> 先读 SESSION-NOTES.md 和 src/ARCHITECTURE.md，然后继续推进 [具体目标]。
