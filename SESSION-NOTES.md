# Session 进度归档

> 用途：在新 session 里能快速接上当前进度。先看这份，再看 `src/ARCHITECTURE.md`。

---

## 一句话现状（2026-05）

**架构重构完成（~90%，2026-04）+ 语音解析 v2 完成（2026-05）。**

- `index.html` 516 行（入口 + ~160 行胶水代码 inline）
- 36 个 JS 模块 ~7900 行，严格三层架构（utils → domain → state → ui）
- 一句话记账：**v1（原版）与 v2（新规则）并存，靠 `config.js` 一个常量切换**，零风险

## 部署

- GitHub Pages：`https://yinzh812.github.io/new-Sunnn-app/`
- 开发：Cursor Live Server 右键 `index.html`（注意：**必须在主项目根目录运行**，不要在 `.claude/worktrees/*` 下运行——Live Server 服务的是主项目）
- 推送：`git push` → 等 1 分钟 → 手机刷新（建议无痕模式避缓存）
- **当前线上**：`USE_VOICE_V2 = false`，跑 v1 原版

---

## 当前轮 Session（2026-05）：一句话记账 v2 解析器

### 总览

新规则方案文档：`新的解析规则.txt` / `新的解析规则.py`（项目根，**未追踪**，本地参考用）。

**核心设计原则**：v1 全部保留不动；v2 作为新文件并行存在；用 `config.js` 一个常量切换。

```
src/domain/voice/
├─ config.js          ← 单点开关 USE_VOICE_V2
├─ parser.active.js   ← 按开关分发 v1/v2 给调用方
├─ parser.js          ← v1（不动）
├─ dictionary.js      ← v1 词典（不动）
├─ tests.js           ← v1 回归（不动）
├─ parser.v2.js       ← v2 主逻辑
├─ dictionary.v2.js   ← v2 词典（含 TIME_*、TOTAL_WORDS、QUANTIFIERS 抽象）
├─ preprocess.js      ← v2 预处理（emoji / 全半角 / 错字）
└─ tests.v2.js        ← v2 回归（44 条用例 + 1 known edge）
```

`main.js` 和 `ui/modals/input.js` 都从 `parser.active.js` 导入 `parseVoiceText`。

### 阶段成果（按 commit 顺序）

| Commit | 阶段 | 内容 |
|---|---|---|
| `262b22f` | 1 | 脚手架：开关 + parser.active 分发 + v2 文件为 v1 镜像，行为不变 |
| `1fb34e4` | 2 | 预处理：emoji（13 项）/ 全半角 / 静态错字表。**故意不做拼音映射**（Web Speech ASR 已输出中文，substring 替换易误伤） |
| `454a37a` | 3 | 中文数字金额：`三块五`/`一百六`/`两千五`/`一百零六`（state-machine + `零` 间隔特判 + 省略末位单位推断） |
| `eba57ef` | 3.5 | 抢救 master 上一份未提交的 v2 草稿（22 条匿名通用用例 + 词典抽象 TIME_*/TOTAL_WORDS/QUANTIFIERS + voiceDetectSocial/Merchant）|
| `05d6e0e` | merge | worktree → master |
| `9d1ebcd` | 3.6 | **按用户要求**去掉 `merchant` / `social` 字段（UI 不消费，纯属噪声）。dict 的 MERCHANT_WHITELIST/AA/LEND_KEYWORDS 一并删 |
| `bc648d4` | 4 | 时间识别升级：相对日期/N天前/上周X/绝对日期/时段词/N点[半/分]，引入 `timePrecision` 三态 |
| `321cea6` | 4.1 | 仅时段词时 `precision="daytime"` + `timePhrase="中午"` 让 UI 显示原词（不显示 12:00）；顺手修了 dates.js 一个老 bug（timeLabel 提前 return 丢失时分） |

### v2 能识别的新模式（v1 不支持）

| 类别 | 输入示例 | 解析 |
|---|---|---|
| Emoji | `看电影🍿50` | 🍿 → 爆米花 |
| 全角数字 | `午饭１２` | 12 |
| 错字 | `麦单劳午餐40` | 麦当劳 → 类别"吃" |
| 中文金额（带单位） | `三块五` / `十二块八` | 3.5 / 12.8 |
| 中文金额（含百千） | `一百六买鞋` / `两千五的相机` | 160 / 2500 |
| N天前 | `三天前买书50` / `5天前` | 当前-N 天 |
| 上周X | `上周三聚餐` | 上周对应工作日（ISO 周一为始）|
| 显式时辰 | `下午3点喝咖啡18` | 15:00（period 推 PM）|
| 复合时间 | `昨天晚上8点半喝酒20` | 昨天 20:30 |
| 仅时段词 | `中午吃饭50` | precision=daytime，显示"中午" |

### v2 故意保留的 v1 启发式（新规则文档漏写但必须保留）

1. 加法式金额：`8.5+10` → 18.5
2. "给我/还我/输我/赔我 N" → 取 N（如 `casino赢了3000多给我150` → 150）
3. 货币标记后裸数字优先（如 `1.99欧用来导出数据15` → 15）
4. 数量词排除：`4个smash` 的 4 不当金额（从 `QUANTIFIERS` dict 驱动）
5. "赌我…不…" → income 特判
6. 总括词阻止切分：含 `一共/合计/总共/总计/加起来/一起` 不按金额切

### timePrecision 三态

- `"exact"` —— 含显式 N点 或啥都没识别（ts = 当前时刻）
- `"daytime"` —— 仅时段词（中午/下午/晚上...），需配套 `timePhrase` 字段，UI 显示原词
- `"day"` —— 仅日期（ts 设为该日 12:00）

### 隐私决策

- v1 `dictionary.js`/`tests.js` 含家人朋友昵称（阿妈/阿榕/佳诺/雅婷/kevin 等），**保持不动**（用户选项 C：单独词条暴露程度低）
- v2 全部用例匿名化（朋友/同事/他们）；v2 词典只放公开连锁品牌
- 项目根 `新的解析规则.py/.txt` 是参考文档，本地保留不追踪
- 之前 master 上的"隐私安全版" `.backup.js` 文件已删

---

## 验证 v2 / 切换开关

### 在浏览器（不打开关）跑 v2 回归
```js
runVoiceTestsV2()       // 期望：通过 44/44 （另 1 条已知边界）
runVoiceTests()         // v1 原版回归（不受 v2 影响）
```

### 切到 v2 用
1. 改 `src/domain/voice/config.js` 把 `USE_VOICE_V2 = false` → `true`
2. `git add` + `git commit -m "@ 启用 v2 解析器" && git push`
3. 等 1 分钟，手机刷新

### 回滚
改回 `false`、commit、push。

---

## 已知边界 / 待办

- **多笔切分 + v2**：`今天加油300，然后超市买了牛奶和面包，还吃了快餐` 切分后无金额段会合并为单笔（与 v1 行为一致；想真正切多笔需要后续阶段）
- **`kevin赌我最后一球不进100rmb`**：v2 仍误把"最后"当切分词（known edge，与 v1 同）
- **手动记账（manual.js）**：不产生 `timePhrase`，所以 daytime 精度只来自语音输入，手动记录都是 exact

---

## 历史 Session 摘要（2026-04 架构重构）

`index.html` 从 2109 行 → 516 行（-75.5%），迁出 33 个 ES Module（utils/domain/state/ui）。

**剩余 inline ~160 行**（不计划再迁移，纯基础设施）：
- `SFX`/`VIB` + `fx*` 全局音效层
- `LUCIDE` 字典 + `lucideSvg`/`renderIconValue` 图标引擎
- `CAT_LIST`/`THEMES`/`ACCENT_COLORS` 静态配置
- `txs`/`settings`/`budgets`/`goals` 全局状态（`hookInlineSaves` 双向同步到 store）
- `pad`/`lsGet`/`lsSet`/`loadAll`/`save*` 数据持久化
- `initSwipe`/`closeOv`/`closeOtherListSwipe`/`resetListSwipeAll` 杂项 UI
- 启动事件监听 + `closeAllPopups`/`cppOutsideClick` document handler
- auth stubs + save 包装层（id/updatedAt 时间戳）

### 已知小 bug（不影响功能）
- `index.html:454` 处 inline `applyTheme()` 在 main.js（type=module deferred）加载前调用 → 报 `ReferenceError: applyTheme is not defined`。由于不影响后续 module 加载，可以先不管。修复方法：删 inline 调用，依赖 `main.js bootstrap()` 里的 `settingsTab.applyTheme()`。

---

## 当前文件统计

```
index.html      516 行  入口 + ~160 行基础设施
styles/         702 行
src/           ~7900 行  36 个 JS 模块
  main.js       476 行  装配序列 + 桥接层
  utils/        233 行  dom / format / icons
  domain/      ~970 行  categories / currency / dates / voice/{ ... v1 + v2 ... }
  state/        808 行  storage / store / auth / sync
  ui/components/ 843 行  sfx / overlay / swipe / wheel-time / nav / inline-edit
  ui/modals/   1930 行  input / confirm / manual / detail / auth / currency-confirm / month-picker / search
  ui/tabs/     2291 行  main / analysis / goals / settings / search
```

---

## Git 提交历史（最近）

```
321cea6 @ 语音解析 v2 阶段 4.1：仅时段词时显示原词
bc648d4 @ 语音解析 v2 阶段 4：时间识别升级
9d1ebcd @ 语音解析 v2 阶段 3.6：去除 merchant / social 字段
05d6e0e @ 合并 v2 解析器（阶段 1-3.5）
eba57ef @ 语音解析 v2 阶段 3.5：抢救方案 A 精华
454a37a @ 语音解析 v2 阶段 3：中文数字金额
1fb34e4 @ 语音解析 v2 阶段 2：预处理（emoji / 全半角 / 静态错字）
262b22f @ 语音解析 v2 阶段 1：脚手架（v1 行为不变）
ae5f65f @ 更新 SESSION-NOTES.md：完整记录本轮 session 所有成果
...（更早是 2026-04 架构重构）
```

## 开新 session 第一句话

> 先读 SESSION-NOTES.md 和 src/ARCHITECTURE.md，然后继续推进 [具体目标]。
