# Session 进度归档

> 用途：在新 session 里能快速接上当前进度。先看这份，再看 `src/ARCHITECTURE.md`。

---

## ⚠️ Worktree 注意事项

Claude Code 每次新开 session 默认在 `.claude/worktrees/<随机名>/` 下创建 git worktree 工作。
**改动不会出现在主项目目录**，Cursor Live Server 看不到变化。

**每轮 session 结束前必须把 worktree 分支合并回 master**：
```bash
cd "D:\编程 AI\记账app\3. 修改一句话解析规则"
git merge claude/<worktree分支名> --no-edit
```
合并后 Cursor 刷新即可看到改动。

---

## 一句话现状（2026-05-18）

**架构重构 + 语音解析 v2 + 学习规则 + 多币种 + 多笔切分 + 动词优先词典 + 手动记账时间滚轮 + Google OAuth + 品牌图标 + 去除储蓄类型 + Lucide 图标扩充 + 预算 UI 重构 + 颜色选择器独立 HEX + 滚轮式年月选择器** 全部完成并部署。

- `index.html` ~520 行（入口 + ~160 行胶水 inline）
- 36+ 个 JS 模块 ~8200 行，严格三层架构（utils → domain → state → ui）
- 一句话记账：**v2 已在生产启用**（`USE_VOICE_V2 = true`）；v1 仍保留作回滚
- 多币种：支持 EUR / CNY / USD / GBP / JPY，基础币 = CNY，可启用任意子集
- 登录：邮箱密码 + Google OAuth 两条线都可用（Testing 模式，测试用户白名单制）

## 部署

- GitHub Pages：`https://yinzh812.github.io/new-Sunnn-app/`
- 开发：Cursor Live Server 右键主项目根目录的 `index.html`（**别在 `.claude/worktrees/*` 下跑**）
- 推送：`git push` → 等 1 分钟 → 手机无痕模式刷新
- **当前线上**：`USE_VOICE_V2 = true`，跑 v2
- **Supabase**：`bsmwrjigxmhqcgspulyr`（CNY-base 多币种、行级安全、auth + 同步）
- **Google OAuth**：`abiding-root-494804-v2` 项目，App name "Sunnn记账"，Testing 模式，测试用户 `yinzh812@gmail.com`，redirect URI 已配 Supabase callback；Client Secret 已轮换过一次（2026-05-17）

---

## 本轮 Session（2026-05-18，post-8b31d19 → b87995a）完成事项

承接上一轮（预算 UI 重构 + 5 项用户反馈修复）。本轮重点：**类别双向同步修复 + 颜色选择器 HEX 独立 + 年月选择器改滚轮 + 滚轮有交易年月高亮**。3 commits。

### 1. 类别双向同步修复 + 颜色 HEX 双行 + 重置按钮边框（commit `5b0479d`）

**类别双向同步**（`settings.js` + `goals.js`）：

- `deleteCat()`：同时从 `budgetCatOrder` 和预算金额中移除对应类别，避免幽灵条目
- `addNewCat()`：同时向 `budgetCatOrder` 添加新类别
- 类别重命名 `onblur`：先更新 `budgetCatOrder` 再调 `saveCustomCategories()`，避免中间状态触发 `getBudgetCatList` 产生重复条目
- `getBudgetCatList()`：去掉 `expCats` 自动合并逻辑（改由双向同步显式处理），防止竞态条件
- 预算删除操作重排序：先从 expense 移除（`store.setCustomCategoriesByType`）再从 budgetCatOrder 移除（`store.setSettings`），避免中间状态

**颜色 HEX 双行**（`index.html`）：

- 上方 `#cppHexHue` 显示色相滑块纯色（`onclick="editHexHue()"`）
- 下方 `#cppHex` 显示最终颜色（`onclick="editHexLit()"`）

**重置按钮边框**（`index.html`）：

- 重置按钮从 `set-card` 容器改为普通 `div`，添加 `border:none`

### 2. 颜色选择器 HEX 独立 + 年月选择器改滚轮（commit `7d8c02b`）

**颜色选择器 HEX 独立**（`settings.js` + `main.js`）：

- 新增 `editHexHue()`：点击上方 HEX 只修改色相（`_cppCurHue`），保持明暗不变
- 新增 `editHexLit()`：点击下方 HEX 只修改明暗（`_cppCurLit`），保持色相不变
- `applyCppLive()`：分别更新两个 HEX 显示值
  - `cppHexHue` = `hslToHex(hue, 80, 50)`（纯色相，固定明度 50）
  - `cppHex` = `hslToHex(hue, 80, lit)`（最终颜色）
- `openColorPicker()`：初始化时独立设置两个 HEX 值
- `main.js`：添加 `window.editHexHue` / `window.editHexLit` 桥接

**年月选择器改滚轮**（`month-picker.js` + `index.html` + `components.css`）：

- 完全重写 `month-picker.js`：从网格卡片（年月切换视图）改为 iOS 风格双列滚轮
- 复用 `InfiniteWheel` 类（惯性滚动 + 吸附物理），与 `wheel-time.js` 相同实现
- 左列 = 年份（当前年 −10 ~ +5），右列 = 月份（01-12）
- `index.html`：mpicker 内部标记改为 `wheel-time-picker` 布局（`#wheelYear` + `#wheelMonth`）
- `components.css`：移除旧网格样式（`.mpicker-head`, `.mpicker-grid`, `.mpm`, `.year-grid`, `.yr-btn` 等），简化为 `.mpicker` + `.mpicker-box`
- `main.js`：`window.openPicker` / `window.closePicker` / `window.confirmPicker` + 旧接口空壳
- 旧函数（`toggleYM`, `pickerNav`, `selYear`, `selMonth`）保留为空壳避免报错

### 3. 年月滚轮有交易高亮（commit `b87995a`）

**`month-picker.js`**：

- `InfiniteWheel` 新增 `highlightFn(value)` 回调参数
- `_render()`：根据回调结果调整样式
  - 有交易：正常透明度 + `fontWeight: 600`（粗体）
  - 无交易：透明度 × 0.35 + `fontWeight: 400`（细体）
- `open()`：从 `store.getTxs()` 构建两个 Set
  - `txYearSet`：有交易的年份集合
  - `txYearMonthSet`：`"YYYY-M"` 格式的年月集合（M = 1-12）
- 年份列 `highlightFn`：`(year) => txYearSet.has(year)`
- 月份列 `highlightFn`：**动态联动年份滚轮**，每帧读取 `_yearInst.getValue()` 判断该年该月是否有交易
  - 滚动年份时月份高亮实时变化（同一个 rAF 循环内）

---

### Git 提交历史（本轮 session）

```
b87995a 年月滚轮：有交易的年月加深显示，无交易的变淡
7d8c02b 颜色选择器HEX独立 + 年月选择器改滚轮
5b0479d 修复3项反馈：类别双向同步 + 颜色HEX双行 + 重置按钮边框
```

---

## 上一轮 Session（2026-05-17 ~ 05-18，post-c49fe50 → 8b31d19）完成事项

承接上一轮。本轮重点：**预算 UI 重构 + 多笔编辑弹窗 + 5 项用户反馈修复**。4 commits。

### 涉及 commits

```
8b31d19 修复5项用户反馈：预算类别联动 + 多笔编辑弹窗 + 颜色HEX + 重置UI + 极夜可见性
4487fb0 预算 UI 重构：默认类别对齐支出分类 + 预算编辑器用 store + 目标图标编辑
e8f034e 第二批改进：多笔确认页编辑 + 拖拽柄清理 + 图标中文名 + 预算货币 + 重置功能
04a9dc1 批量修复：类别名/货币标签/下拉条/图标中文名/重置按钮等 9 项
```

---

## 再上一轮 Session（2026-05-17，post-919ded4 → c49fe50）完成事项

承接上一轮。本轮重点：**去除储蓄(savings)类型 + Lucide 图标大扩充分组**。1 commit。

### 1. 去除储蓄类型（commit `c49fe50`）

**数据迁移**：
- `store.js hydrate`：一次性把 `type:"savings"` 的 tx 全改为 `type:"income"`（`txSavingsToIncomeV5` localStorage flag 防重跑）
- `categories.js`：`CAT_DEFAULTS_VERSION` bump 到 `2026-05-17-v5`，触发 customCategoriesByType 重置
- `migrateSavingsToIncome()` 新增迁移函数
- `sync.js`：cloudPull 时也执行一次储蓄→收入迁移，确保云端拉取的数据也被处理

**UI 变化**：
- 主页"储蓄"toggle → "结余"，显示净结余 = income − expense
- 手动记账/详情页：type 只剩 expense/income 二选一（删三态循环）
- 分析页储蓄目标：改为按净结余计算进度，支持 `startDate` 起始日期筛选
- 目标页：新增日期选择器，可设定从哪天开始计算净结余
- CSS 变量 `--savings` 全部重命名为 `--goal`

**语音解析**：
- 储蓄关键词（存/存钱/储蓄/余额宝/理财 等）并入 `VOICE_INCOME_KW`
- `voiceDetectType` 删除 savings 分支，只返回 expense/income
- `voiceRemapCategoryByType` income 分支只保留工资/现金/转账/其他（删除储蓄/股票/资产子分类）
- settings.js 学习规则映射：存→其他、理财→其他、基金→其他、股票→其他

**收入类别**：只保留原 4 个（工资/现金/转账/其他），储蓄/股票/资产不作为类别

### 2. Lucide 图标扩充 + 分组选择器（同 commit）

- `icons.js` + `index.html` inline LUCIDE：新增 38 个图标（smile/book-open/bus/shopping-cart/shirt/tag/bike/fuel/trophy/award/tv/headphones/wrench/laptop/smartphone/phone/mail/credit-card/banknote/receipt/calculator/trending-up/clock/calendar/flag/umbrella/scissors/pencil/graduation-cap/pill/wine/glass-water/map-pin/zap/shield/cloud/lightbulb/landmark），总计 ~73 个
- `settings.js`：`LUCIDE_PICKER_LIST`(28 平铺) → `LUCIDE_PICKER_GROUPS`(66 个图标分 10 组)
  - 餐饮(4) · 购物(7) · 交通(6) · 运动(5) · 娱乐(6) · 居家(6) · 工作学习(9) · 医疗(3) · 金融(6) · 通用(14)
- `components.css`：`.lp-group-label` 样式 + picker max-height 改为 50vh
- 修复 `tennis-ball` 从未加入 inline LUCIDE 的遗留 bug

---

## 上一轮 Session（2026-05-17，post-fba6082 → 919ded4）完成事项

承接上一轮（多币种 + 学习规则 + 类别重命名）。本轮重点：**登录板块完善 + v2 多笔切分修复 + 词典动词优先重排 + 手动记账时间滚轮 + 品牌图标**。共 12 commit。

### 1. 登录弹窗修缮（commit `5239c9c`）

- `onSyncStatus` 订阅 → `#auth-sync-status` 文字随状态自动刷新（之前写死 "未知"）
- `signOut` 弹 confirm：「是否同时清除本设备上的本地账本数据？」
  - 确定：清 txs/budgets/goals/deletedSugs/learnedRules/customCategories（共享设备友好）
  - 取消：仅退出 session，本地保留（下次登录与云端合并）
  - 顺序：先 `await signOut()` 让 user=null，再清 store → `cloudPushDebounced` 早返回，云端数据不会被本地空数组覆盖
- 清掉 `ui/modals/auth.js:41` 的 stale TODO（按钮 onclick 已通过 inline + window 桥接绑定）
- Supabase 未就绪文案修正：「云端连接异常」

### 2. 修 `index.html:453` inline applyTheme 启动报错（commit `0151050`）

inline 同步执行时模块尚未加载，调 `applyTheme()` 会 ReferenceError。该函数已迁移到 `settingsTab.applyTheme`，由 `main.js bootstrap()` 调用，删除 inline 调用即可。

### 3. 清掉 EUR-base 旧 API（commit `9e66636`）

多币种重构（CNY-base）完成后，`toEur/netInEur/sumByTypeInEur/cnyToEur/totalSavingsInEur/safeRate` 6 个函数已无业务调用，仅作兼容垫片留存。

- `domain/currency.js`：删 6 个 EUR helpers，保留 `DEFAULT_EUR_TO_CNY` 给 `store.hydrate` 做老 localStorage 字段迁移
- `main.js`：删 `window.rate/netV/sumT` 桥（inline 早已迁），删未用 import；删 `window.setRate`（settingsTab.setRate 已不存在）
- `ui/tabs/main.js`：删未用的 import
- `ui/tabs/settings.js`：
  - 删 `setRate`（旧版单一汇率 UI 已被多币种 UI 取代）
  - `doExportRange` 文本账单从 `sumByTypeInEur(€)` 迁到 `sumByTypeInCny + convertAmount`，符号用 `currencySymbol(defaultCurrency)`（修了"导出账单文本永远显示 €"的 bug）
  - CSV 导出 fallback currency 从 `"EUR"` 改为 `"CNY"`
  - 文本账单 per-line 显示符号从硬编码 `¥/€` 改为 `currencySymbol(t.currency)`（支持 USD/GBP/JPY）

### 4. v2 多笔切分 bug 修复（commit `8a322de`）

修复"今天加油300，然后超市买了牛奶和面包，还吃了快餐"被切成 1 笔的 bug。用户期望切 3 笔（无金额段也保留为独立 tx，弹窗补录金额）。

**parser.v2.js**：
- `voiceSplitInput`：原本无金额段会被合并进上一段（导致丢失），改为保留为独立段。只丢 1 字 / 纯感叹词噪音（嗯/哦/啊/呃/额/哎/呀/噢/喔/嘿/嘛/呵/哈/嗨）
- `parseVoiceText`：多笔切分后处理两步：
  1. **precision=day 且日期为今天 → ts 改为"现在"**（用户说"今天 X、Y、Z" 但没提具体时间时，期望 3 笔都接近当前时刻，而非全压到今天 noon）
  2. **ts 严格递增**（同时刻的段每段差 1 秒），让"最后说的"显示在明细页最上方
- 单笔（`results.length<=1`）不做这两步，无回归风险

**confirm.js `showAmtPrompt`**：加可选 `onSuccess(result)` 回调
- 提供时：填完仅调回调，不自动跳确认页（调用方编排）
- 不提供时：保持老行为（单段直接转 confirm）

**input.js `_afterParse`**：链式处理多个 needAmt 段
- 原本若有 valid 且有 needAmt，needAmt 直接被丢弃（隐性 bug）
- 现在逐个弹补录窗，全部填完后统一进 confirm 页

**tests.v2.js**：加多笔切分断言（段数=3 / 金额=[300,null,null] / ts 递增）

### 5. 手动记账：时段选择器（chip 行 → 时间滚轮）

**第一版 chip 行**（commit `2aa8fe5`）—— 加 8 个时段词 chip（早上/上午/.../凌晨）。

**用户反馈后改成时间滚轮**（commit `8c8e0d6` 后半段）：用户觉得 chip 不够精准，要求把 `📅 今天` 按钮拆上下两半（上半日期 / 下半时间滚轮）。复用现有的 `openWheelTime(h, m, cb)` 组件，精确到分。

- `index.html`：mcb-date 单元格拆为两个 `.mdt-half`（上 `.mdt-date` 含原 native picker，下 `.mdt-time` 调 `openMcTimeWheel`）；删 `#mcPeriodRow`
- `components.css`：删 `.period-row/.period-chip`，加 `.mc-calc .mcb.mcb-date{flex-direction:column;...}` + `.mdt-half`
- `manual.js`：
  - 删 `mcPeriod/PERIOD_HOURS/selectPeriod/syncPeriodRow` 整套
  - 加 `mcTime = {h, m} | null` 状态（null = 用当前实时时间）
  - 加 `openMcTimeWheel` 导出 + `updateMcTimeBtn` 同步标签
  - `submitManual` ts 三分支：
    - 选了 mcTime → 当日 + h:m，`precision="exact"`
    - 没选 + 非今日 → 当日 12:00，`precision="day"`（修了"昨天交易显示当前时间"bug）
    - 没选 + 今天 → 当前实时，`precision="exact"`
  - 编辑现有 tx 时 mcTime 从 `t.ts` 读回（仅当 `precision="exact"`）
- `main.js`：`window.selectPeriod` → `window.openMcTimeWheel`

### 6. 词典动词优先重排（commit `8c8e0d6` 前半段）

用户反馈："动词优于名词"。原 parser 顺序导致：
- "超市买牛奶面包" → 误判 餐饮（牛奶/面包是 吃 词典名词，吃-dict 优先于 购物-dict）
- "吃了快餐" → 误判 其他

**修复**：`voiceRemapCategoryByType` 在交通/运动之后、逐字典之前加两条 pre-check：
- 餐饮强动词 `/吃|喝|用餐|进餐|eat|drink|dine|brunch/i` → 直接 餐饮
- 购物动词 `/买|购|网购|下单|shopping/i` → 直接 购物
- 同时 `快餐` 加进 吃 词典（无动词时如 "今天快餐30" 也能正确归 餐饮）

**边界**：「买单 300」会被判 购物（餐饮场景但用了"买"字）；依赖用户的学习规则纠正。

### 7. 词典大扩 + 运动图标改网球 + 修打球归类（commit `ff89042`）

用户反馈："打球被归类成其他，应该是运动；默认运动图标是杠铃请换成网球；还有很多词识别不出来"。

**图标**：
- `domain/categories.js`：运动默认 `lucide:dumbbell` → `lucide:tennis-ball`
- `CAT_DEFAULTS_VERSION` bump → `2026-05-17-v4` 触发已存用户的默认类别重置
- `LEGACY_CAT_LUCIDE` 同步更新
- `utils/icons.js`：新增 `tennis-ball` SVG（Lucide 没收录，自绘 1 圆 + 2 弧线）

**parser.v2.js 类别正则扩充**：
- 交通：+出租 +lyft +加油站 +班车/校车/大巴/长途车/巴士 +网约车/拼车/顺风车 +共享单车/摩拜/哈罗/青桔 +电动车/电瓶车/摩托车 +船票/轮船/邮轮/渡轮 +年检/检车 +地铁卡/公交卡/一卡通
- 运动：**+打球**（用户案例）+踢球 +球场/游泳池 +排球/volleyball +棒球/baseball +橄榄球/rugby +高尔夫/golf +跳绳 +滑板/skateboard +武术/跆拳道/空手道/击剑 +蹦极/蹦床 +私教课/团操/健身卡

**dictionary.v2.js VOICE_CAT_MAP + BRAND_MAP 扩**：
- 吃：+烤肉/烤鸭/烤鱼/烤串/烤冷面 +自助餐/buffet +海底捞/必胜客/subway/赛百味 +茶颜悦色/古茗/茉酸奶/沪上阿姨 +螺蛳粉/酸辣粉/凉皮/肉夹馍/煎饼果子/鸡蛋灌饼/油泼面 +臭豆腐/烤红薯/糖葫芦 +关东煮 +炒饭/炒面/盖浇饭/卤味/汤面 +元气森林/农夫山泉 +酒类细分（whisky/vodka/gin/朗姆/清酒/sake）+茶/龙井/普洱/抹茶 +海鲜锅/干锅/酸菜鱼/水煮鱼/回锅肉/宫保鸡丁/麻婆豆腐/鱼香肉丝
- 购物：+7-eleven/罗森 +卫生纸/抽纸/卷纸/湿巾/卫生巾 +五金/工具/螺丝/胶水/插座/灯泡 +家电系列 +小米/华为/sony/mac/apple store +香水 +美瞳/眼镜/太阳镜 +防晒/乳液/精华/眼霜 +大牌护肤美妆（lancome/sk-ii/ysl/dior/chanel/lv/prada/gucci 等）+玩具/积木/乐高/拼图 +decathlon/迪卡侬/ikea/宜家/costco/山姆/沃尔玛/best buy +商场/购物中心/百货/超市/便利店/屈臣氏
- BRAND_MAP：把上面的连锁品牌也加进直查

24 个 ad-hoc spot-check 全部分类正确；v1 11/11、v2 44/44 + 多笔断言均无退化。

### 8. Favicon / 品牌图标（5 commits：`0baa42d` → `5145b56` → `5dd87a0` → `a55286a` → `919ded4`）

设计：**薄荷绿账本（#A8DCC6）+ 装订线（#7BB89A）+ 右侧 3 层书页堆叠 + 中央偏左黄色 $（#F4C430）**。

- `favicon.svg`：64×64 viewBox，全画布铺满（避免 iOS apple-touch-icon 加黑边）
- 用 sharp 渲染 PNG 三个尺寸：`favicon-180.png`（iOS）/ `favicon-192.png`（Android）/ `favicon-512.png`（高分启动屏）
- `index.html` 加 4 条 link：svg + 3 个 PNG，带 `?v=N` cache-buster（iOS Safari 对 apple-touch-icon 缓存极顽固，URL 变才会重取）
- 渲染脚本：临时 `npm install --no-save sharp` → 用完 `rm -rf node_modules package-lock.json`
- 未提交到 git 的临时文件：`google-app-logo-240.png`（Google OAuth consent screen 上传用，已交付用户）

**iOS 缓存清理流程**：删桌面图标 → 关闭 Safari 后台 → 设置-Safari-高级-网站数据-删 `yinzh812.github.io` → 重新加到主屏。`?v=N` cache-buster 已能解决大部分情况。

### 9. Google OAuth 配置（运维，非代码）

代码侧 [auth.js:110-119](src/state/auth.js:110) `signInWithGoogle()` 早已写好。本轮仅完成运维配置：

| Step | 在哪 | 做了什么 |
|---|---|---|
| 1 | Google Cloud Console | 项目 `abiding-root-494804-v2`（"Sunnn"）|
| 2 | Google Auth Platform → 品牌塑造 | App name = `Sunnn记账`，Logo 用 favicon 240×240 PNG，support email = yinzh812@gmail.com |
| 3 | Google Auth Platform → 目标对象 | Testing 模式，测试用户加 `yinzh812@gmail.com` |
| 4 | Google Auth Platform → 客户端 | 建 Web 应用 OAuth Client，已授权 JS 来源 = `https://yinzh812.github.io`，redirect URI = `https://bsmwrjigxmhqcgspulyr.supabase.co/auth/v1/callback` |
| 5 | Supabase → Auth → Providers → Google | Enable + 填 Client ID + Client Secret + Save |
| 6 | Google Auth Platform → 客户端 → 客户端密钥 | 轮换：加新 secret + 同步到 Supabase + 删旧 secret |

**已知限制**：Testing 模式下 Google 把 OAuth refresh token 限制为 7 天有效；超期用户需重新授权（"Access blocked" 提示）。要解此限需切到 Production + 通过 Google 验证（中等工作量、不紧急）。

---

## 学习规则使用方法（前轮成果）

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
runVoiceTestsV2()       // v2 44/44 + 多笔断言（multiOk: true）
runVoiceTests()         // v1 11/11（不受 v2 影响）
```
Node 端：`node --input-type=module -e "import('./src/domain/voice/tests.v2.js').then(m => m.runVoiceTestsV2())"`

---

## 多币种使用方法（前轮成果）

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

**仍未解决**：
- **`朋友赌我最后一球不进100rmb`**：v2 仍误把"最后"当切分词（known edge，v1 同；测试用例标 `knownEdge: true`）
- **学习规则不跨设备**：仅 localStorage；想 Supabase 同步需要新增 sync 字段
- **Google OAuth Testing 模式 7 天限**：refresh token 7 天后失效；要永久需上 Production + Google 验证
- **Supabase 自动暂停**：免费版项目长时间不活跃会暂停（已遇到一次）；建议每周打开一次 Dashboard 或 app
- **"买单 300"**：餐饮场景但用了"买"字，会被判 购物；依赖用户用学习规则纠正
- **词典持续扩**：永远不够。当前已大批量扩；继续按用户反馈补
- **Google 登录页显示 supabase URL**：`继续前往 bsmwrjigxmhqcgspulyr.supabase.co` 是 OAuth 设计强制（redirect URI 的 hostname），无法改；如要美化需 Supabase Pro 自定义域名 ($25/月)
- **iOS 部分老版本对 SVG apple-touch-icon 兼容差**：已用 PNG 兜底；如未来要求严格统一可手工出 1024×1024 + macOS touch bar 尺寸

**本轮已解决**（历史归档）：
- ✅ ~~类别删除/新增/重命名 与预算列表不同步~~（双向同步 + 操作顺序修正 + 去掉自动合并）
- ✅ ~~颜色选择器两个 HEX 值联动~~（拆分为独立的色相 HEX 和明暗 HEX）
- ✅ ~~年月选择器为网格卡片~~（改为 iOS 风格双列滚轮 + 有交易年月高亮）
- ✅ ~~储蓄(savings)类型~~（已全面移除，迁移为 income，UI 改为净结余）
- ✅ ~~图标选择器只有 28 个图标~~（扩充至 66 个，分 10 组）
- ✅ ~~tennis-ball 图标在 inline LUCIDE 中缺失~~
- ✅ ~~多笔切分 + v2 合并为单笔~~
- ✅ ~~手动记账无 daytime 精度~~（换成时间滚轮，更精确）
- ✅ ~~index.html:454 inline applyTheme()~~
- ✅ ~~`超市买X` 误判餐饮 / `吃了快餐` 误判其他~~
- ✅ ~~`打球` 归 其他~~

---

## 文件结构（更新）

```
src/domain/voice/
├─ config.js          USE_VOICE_V2 开关
├─ parser.active.js   按开关分发 v1/v2
├─ parser.js          v1（不动）
├─ dictionary.js      v1 词典
├─ tests.js           v1 回归 11/11
├─ parser.v2.js       v2（+ 动词优先 pre-check + 多笔切分后处理）
├─ dictionary.v2.js   v2 词典（大扩，含 BRAND_MAP）
├─ preprocess.js      v2 预处理
└─ tests.v2.js        v2 回归 44/44 + 多笔断言

src/domain/
├─ categories.js      DEFAULT_CATS_BY_TYPE（运动图标=tennis-ball）+ CAT_DEFAULTS_VERSION='2026-05-17-v4'
├─ currency.js        CNY-base API（rateToCny/toCny/fromCny/convertAmount/txToCny/netInCny/sumByTypeInCny）+ DEFAULT_EUR_TO_CNY（兼容老 localStorage 字段）
│                     [旧 EUR API toEur/netInEur/sumByTypeInEur/cnyToEur/totalSavingsInEur/safeRate 已全部删除]
├─ dates.js
├─ learning.js
└─ learning.test.js

src/state/
├─ storage.js
├─ store.js
├─ auth.js            Supabase client 懒加载 + signUp/signIn/signOut/Google OAuth/sendPasswordResetEmail/restoreSession
└─ sync.js            onAuthChange→cloudPull→cloudPush；onSyncStatus 事件流

src/ui/tabs/
├─ main.js            （删 EUR helpers import）
├─ analysis.js
└─ settings.js        （删 setRate；doExportRange 文本账单走 sumByTypeInCny）

src/ui/modals/
├─ input.js           _afterParse 链式补录金额（多 needAmt 段逐个 prompt）
├─ confirm.js         showAmtPrompt 加 onSuccess 回调；货币显示用 currencySymbol
├─ detail.js
├─ manual.js          mcTime 状态 + openMcTimeWheel + updateMcTimeBtn（替换前轮 mcPeriod/PERIOD_HOURS）
├─ month-picker.js    滚轮式年月选择器（InfiniteWheel 双列 + highlightFn 有交易高亮）
└─ auth.js            onSyncStatus 订阅 → 同步状态实时刷新；signOut 弹 confirm 询问是否清本地

src/utils/
└─ icons.js           +tennis-ball SVG

styles/components.css
  +.mc-calc .mcb.mcb-date{flex-direction:column}（拆上下两半）
  +.mdt-half (.mdt-date / .mdt-time)
  [-.period-row / -.period-chip 已删（被时间滚轮取代）]

index.html
  +<meta name="mobile-web-app-capable">
  +<link rel="icon" type="image/svg+xml" href="favicon.svg?v=3">
  +<link rel="icon" type="image/png" sizes="192x192"|"512x512">
  +<link rel="apple-touch-icon" sizes="180x180" href="favicon-180.png?v=3">
  mcb-date 拆成 .mdt-date (含 native date input) + .mdt-time (调 openMcTimeWheel)
  删 inline applyTheme() 调用

(项目根目录)
favicon.svg          薄荷绿账本（铺满画布 + 装订线 + 右侧 3 层书页堆叠 + 居中偏左黄 $）
favicon-180.png      iOS apple-touch-icon
favicon-192.png      Android home screen
favicon-512.png      高分启动屏
```

---

## Git 提交历史（本轮 session 全量，按时间倒序）

```
919ded4 favicon 增加书页堆叠效果 + $ 左移
a55286a favicon 加 ?v=2 cache-buster，强制 iOS Safari 重取图标
5dd87a0 favicon 全画布铺满，避免 iOS 加黑边
5145b56 加 favicon PNG（180/192/512）解决 iOS 主屏图标问题
0baa42d 加 favicon.svg（薄荷绿账本 + 黄色 $）
ff89042 扩词库 + 运动图标换成网球 + 修打球归类
8c8e0d6 首轮验证反馈修复：deprecated meta + 时段→滚轮 + 词典动词优先
8a322de v2 多笔切分：保留无金额段 + 逐段补录金额 + ts 严格递增
2aa8fe5 手动记账：加时段选择器（早上/上午/中午/下午/傍晚/晚上/半夜/凌晨）  [已被 8c8e0d6 替换为时间滚轮]
9e66636 清掉 EUR-base 旧 API：toEur/netInEur/sumByTypeInEur/cnyToEur/totalSavingsInEur/safeRate
0151050 修 index.html:453 inline applyTheme() 启动报错
5239c9c 登录弹窗：同步状态实时刷新 + signOut 询问是否清本地
```

---

## 上一轮 Session（2026-05，post-2a0aad6 → fba6082）摘要

承接上上轮（v2 解析器 stages 1-4.1）。15 个 commit。详细决策记录如下：

### v2 解析器正式上线（commit `5b22793`）
`config.js` 把 `USE_VOICE_V2 = false → true` → push。线上从 v1 切到 v2。

### 默认类别重命名（commit `7a628a6`）
单字偏好 → 通用二字：`吃→餐饮 / 买→购物 / 车→交通`。
- `categories.js`：`DEFAULT_CATS_BY_TYPE.expense` 改名 + `CAT_DEFAULTS_VERSION` bump
- 新增 `CATEGORY_RENAME_V3` + `migrateLegacyTxCategoryNames` 帮手
- `store.js hydrate`：一次性 tx 迁移（`txCategoryRenamedV3` flag 防重跑）
- `LEGACY_CAT_LUCIDE` 加旧名兜底

### 阶段 6 学习规则（commits `3f54d5a` → `54c5cdf` → `2a11f79`）
让 v2 学用户的类别纠正。架构：
```
src/domain/learning.js          ← 纯函数：record/forget/find/apply/bump/clear
src/domain/learning.test.js     ← 29 条 Node 单测
src/state/storage.js            ← LEARNED_RULES key = "acct_learnedRules"
src/state/store.js              ← state.learnedRules + 4 setter
src/ui/modals/confirm.js        ← doConfirm 时 _origCategory ≠ category → addLearnedRule
src/ui/modals/input.js          ← parseVoiceText 传 learnedRules option
src/domain/voice/parser.v2.js   ← applyLearnedRules 子串匹配 + 最长优先
src/ui/tabs/settings.js         ← "我的个人词典" section
```

关键决策：phrase 用 `voiceCleanDesc` 输出；(phrase, type) 复合键；子串匹配 + 最长优先；学到的优先级 > parser 推断；短 phrase < 2 字与兜底 "消费" 拒收；不同步 Supabase。

顺手修了 voice dict bug（commit `8e276f4`）：`VOICE_INCOME_KW` 单字 "卖/退/赚/挣" 撞 "外卖/退步"，改成完整词形。

### 类别管理 UX 大修（commits `2edf785` + `1b220ce`）
- inline `saveCustomCategories()` → 包装走 store（emit cats:changed）
- 详情页类别选择框加齿轮按钮（manual / detail 订阅 cats:changed 重建）
- `ov-catsettings` z-index:85
- 手动记账类别行 `grid;repeat(4,1fr)`（自动换行，不再横向滚）

### 多币种支持（commits `35ea096` → `ded880a` → `94f1b34` → `ef08952` → `f185c76` → `e0416e5`）
- 5 个币种（CNY 基础）+ 启用列表 + 多汇率
- 手动记账左上加圆形货币按钮（与 hero 顶部同款）
- `domain/currency.js`：`SUPPORTED_CURRENCIES` / `DEFAULT_RATES_TO_CNY` / `rateToCny/toCny/fromCny/convertAmount` / `txToCny/netInCny/sumByTypeInCny`
- `DEFAULT_SETTINGS` 加 `enabledCurrencies` + `ratesToCny`；`hydrate` 兼容老 `eurToCny`；`setSettings` 双向同步
- `settings.js` 货币卡完全重写（默认 dropdown / 启用列表 / + 添加货币 / 每行汇率输入 + × 移除）
- 关键修复 `ef08952`：confirm.js 多处硬编码 `t.currency === "CNY" ? "¥" : "€"` 改用 `currencySymbol()`

最终行为表：
| 显示位置 | 跟随什么 |
|---|---|
| 交易条右侧金额 | `tx.currency`（每笔自己的，不变）|
| 当日分组头"收 / 支" | `settings.defaultCurrency` |
| Hero 顶部圆按钮 + 大数字 | `settings.displayCurrency`（顶部按钮临时切）|
| 分析页饼图中央 + 类别排行 + 预算 + 储蓄目标 | `settings.defaultCurrency` |
| 一句话/手动新建的交易 | 用户选的 currency（默认从 `defaultCurrency` 来）|

`mainTab.init()` 和 `analysis.js init()` 订阅 `settings:changed` → 即刷。

---

## 历史 Session 摘要

### 2026-05（上上轮）：v2 解析器 stages 1-4.1
- 8 个 commit（`262b22f` → `321cea6`）
- v1/v2 并存架构 + `config.js` 开关
- 预处理（emoji/全半角/错字）+ 中文数字 + 时间识别（含 daytime precision）
- 抢救 master 上的另一份 v2 草稿（22 条匿名用例 + 词典抽象）

### 2026-04：架构重构（90%）
- `index.html` 2109 行 → 516 行
- 迁出 33 个 ES Module（utils/domain/state/ui）
- 剩余 ~160 行 inline 是纯基础设施（SFX、图标字典、数据层、auth stub）—— 不计划再迁

---

## 开新 session 第一句话

> 先读 SESSION-NOTES.md 和 src/ARCHITECTURE.md，然后继续推进 [具体目标]。
