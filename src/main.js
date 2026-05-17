// main.js —— 应用入口
//
// 启动序列：
//   1. store.hydrate()                 从 localStorage 读取所有持久化字段
//   2. attachAudioUnlock()             首次手势 → 解锁 AudioContext
//   3. applyTheme()                    把 store.settings 的主题写到 :root
//   4. attachSync()                    sync 订阅 store 与 auth 变化
//   5. restoreSession()                Supabase 恢复登录态 + 处理 OAuth 回跳
//   6. tabs/modals 的 init()           挂事件、订阅 store
//   7. registerTab + showTab("main")   首屏渲染
//
// 双轨过渡说明：
//   目前部分 modal/tab 内部渲染逻辑还在 index.html 内联 <script> 里。
//   为了零风险共存，本入口把 store / parseVoiceText / 关键工具暴露到 window，
//   让旧 inline 代码读 window.store 而不是它原来的 var 全局。
//   随着每个 modal/tab 内部完善，逐步把对应 inline 段落删掉即可。

import { store } from "./state/store.js";
import { restoreSession, onAuthChange } from "./state/auth.js";
import { attachSync, onSyncStatus } from "./state/sync.js";

import { parseVoiceText } from "./domain/voice/parser.active.js";
import { runVoiceTests } from "./domain/voice/tests.js";
import { runVoiceTestsV2 } from "./domain/voice/tests.v2.js";

import { byId } from "./utils/dom.js";
import {
  pad2, escapeHtml, formatSignedAmount,
} from "./utils/format.js";
import {
  formatTransactionTime, formatTransactionFull,
  formatGroupHeader, formatTransactionTimeInline, formatDay,
} from "./domain/dates.js";
// （currency.js 的工具函数在用到的模块里直接 import，main.js 不再桥到 window）
import { attachAudioUnlock } from "./ui/components/sfx.js";
import { attachNavClicks, registerTab, showTab } from "./ui/components/nav.js";
import * as wheelTime from "./ui/components/wheel-time.js";

import * as mainTab     from "./ui/tabs/main.js";
import * as analysisTab from "./ui/tabs/analysis.js";
import * as goalsTab    from "./ui/tabs/goals.js";
import * as settingsTab from "./ui/tabs/settings.js";
import * as searchTab   from "./ui/tabs/search.js";

import * as inputModal           from "./ui/modals/input.js";
import * as confirmModal         from "./ui/modals/confirm.js";
import * as manualModal          from "./ui/modals/manual.js";
import * as detailModal          from "./ui/modals/detail.js";
import * as authModal            from "./ui/modals/auth.js";
import * as currencyConfirmModal from "./ui/modals/currency-confirm.js";
import * as monthPickerModal     from "./ui/modals/month-picker.js";
import * as searchModal          from "./ui/modals/search.js";

// ── Toast 帮手 ──────────────────────────────────────────────────────────────

function toast(msg) {
  const el = byId("toast");
  if (!el) { console.log("[toast]", msg); return; }
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = "none"; }, 1800);
}

// ── 同步圆点 UI ──────────────────────────────────────────────────────────────

function bindSyncDot() {
  onSyncStatus((status) => {
    const btn = byId("accountToggleBtn");
    if (!btn) return;
    let dot = btn.querySelector(".sync-dot");
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "sync-dot";
      btn.appendChild(dot);
    }
    dot.className = "sync-dot" + (status && status !== "idle" ? ` ${status}` : "");
  });
}

// ── 启动序列 ────────────────────────────────────────────────────────────────

async function bootstrap() {
  // 1. 灌注本地数据 → 立即广播 *:changed
  store.hydrate();

  // 2. 首次手势解锁音频
  attachAudioUnlock();

  // 3. 应用主题（settings 已在 hydrate 中加载）
  settingsTab.applyTheme();
  // 主题切换后自动重新应用 —— settingsTab.init() 内部已经订阅 settings:changed → applyTheme()，
  // 这里不再重复订阅，避免 applyTheme 每次被调两遍。

  // 4. sync 订阅 store + auth
  attachSync();
  bindSyncDot();

  // 5. 装配各 modal —— 它们会反向 init() 自己的事件
  inputModal.init({ confirmModal, currencyModal: currencyConfirmModal, manualModal });
  confirmModal.init({ toast });
  manualModal.init({ toast });
  detailModal.init({ manualModal, toast });
  authModal.init({ toast });
  currencyConfirmModal.init();
  monthPickerModal.init();
  searchModal.init({ detailModal });

  // 6. 装配各 tab
  mainTab.init({ monthPickerModal, detailModal, toast });
  analysisTab.init({ mainTab });
  goalsTab.init({ toast });
  settingsTab.init({ toast });
  searchTab.init();

  // 7. 注册 tab 到 nav + 激活点击
  registerTab("main",     { onShow: () => mainTab.render() });
  registerTab("analysis", { onShow: () => analysisTab.onShow() });
  registerTab("goals",    { onShow: () => goalsTab.onShow() });
  registerTab("settings", { onShow: () => settingsTab.onShow() });
  registerTab("search",   { onShow: () => searchTab.onShow() });
  attachNavClicks();

  // 8. 首屏渲染 + 数据变更时自动刷新 Hero
  showTab("main");
  store.on("settings:changed", () => mainTab.renderHero());
  store.on("txs:changed",      () => mainTab.renderHero());

  // 9. Hook inline 的 saveXxx 函数 → 自动推到 store
  //    必须在 bootstrap 里调（此时 inline <script> 已执行完，window.saveTxs 等已就位）。
  hookInlineSaves();

  // 9b. 反向同步：store 变化 → 同步回 inline 全局变量
  //   模块通过 store.setSettings/setTxs 修改数据时，inline 的 window.settings/txs
  //   不会自动更新。如果 inline 代码直接读这些全局（如 parseSeg 读 settings.defaultCurrency），
  //   会拿到陈旧值。用 listener 做单向同步解决。
  store.on("settings:changed", () => {
    if (window.settings) Object.assign(window.settings, store.getSettings());
  });
  store.on("txs:changed", () => {
    window.txs = store.getTxs();
  });
  store.on("budgets:changed", () => {
    window.budgets = store.getBudgets();
  });
  store.on("goals:changed", () => {
    window.goals = store.getGoals();
  });

  // 10. 恢复 Supabase 登录态（异步，不阻塞首屏）
  try {
    const { hashError, hashType } = await restoreSession();
    if (hashError) toast("链接无效或已过期：" + hashError);
    if (hashType === "recovery") {
      setTimeout(() => authModal.open({ mode: "reset" }), 250);
    } else if (hashType === "signup" || hashType === "magiclink") {
      toast("✓ 邮箱已验证并登录");
    }
  } catch (err) {
    console.warn("[main] restoreSession failed:", err);
  }
}

// ── 把模块暴露到 window，方便老内联代码 / 控制台调试 ────────────────────────

window.acct = Object.freeze({
  store,
  parseVoiceText,
  runVoiceTests,
  toast,
  modals: {
    input:           inputModal,
    confirm:         confirmModal,
    manual:          manualModal,
    detail:          detailModal,
    auth:            authModal,
    currencyConfirm: currencyConfirmModal,
    monthPicker:     monthPickerModal,
    search:          searchModal,
  },
  tabs: { mainTab, analysisTab, goalsTab, settingsTab, searchTab },
});

// 控制台兼容入口：runVoiceTests() 老用法 + v2 单独入口
window.runVoiceTests = runVoiceTests;
window.runVoiceTestsV2 = runVoiceTestsV2;

// ── 渐进迁移期：nav 桥接（inline showPage/goTab 已删除，由模块 attachNavClicks + showTab 接管）──
//
// showPage 桥接到 showTab（inline changeMonth/executeDeleteConfirm/submitManual 仍读 currentTab，
// nav.js 的 showTab 内部已同步 window.currentTab）。
window.showPage = (p) => showTab(p);

// ── 渐进迁移期：render 桥接（inline render() 已删除，枢纽逻辑在此）──
//
// inline 的 render() 是全局渲染枢纽，被 10+ 处调用（changeMonth / submitManual /
// executeDeleteConfirm / toggleDisplayCurrency / 等）。桥接版负责：
//   1. 把 inline viewYear/viewMonth 同步到模块
//   2. 把 inline txs/settings 推到 store（触发 txs:changed → renderHero）
//   3. 调 mainTab.renderList() 刷新列表
// 不再需要传 pre-filtered mo——store 已有最新数据，renderList 内部过滤。
window.render = () => {
  mainTab.setViewYearMonth(window.viewYear, window.viewMonth);
  store.setSettings(window.settings);
  store.setTxs(window.txs);
  mainTab.renderList();
};

// ── 渐进迁移期：把模块版纯帮手挂到 inline 同名全局，覆盖 inline 函数定义 ──
//
// 时序：inline <script> 同步执行时把 function pad/escTx/... 写到 window；
// 本模块作为 type=module 是 deferred，在 inline 之后执行 → 这些赋值会覆盖 inline 版本。
// 之后 inline 任何调用（如 inline render() 的 fallback、renderList、详情、搜索等）
// 都会走模块实现。inline 的函数体保留作为"模块未加载完时"的 fallback。
//
// 这些函数行为已与 inline 版本逐一对照过：
//   - pad/pad2、fmtA/formatSignedAmount、fmtLabel/fmtFull/groupListLbl/listTimInnerText/dayL：完全等价
//   - escTx/escapeHtml：模块版多转义 ">" 和 "'"（修了 inline 的 XSS 隐患，是改进而非回归）
window.pad             = pad2;
window.escTx           = escapeHtml;
window.fmtA            = formatSignedAmount;
window.fmtLabel        = formatTransactionTime;
window.fmtFull         = formatTransactionFull;
window.groupListLbl    = formatGroupHeader;
window.listTimInnerText = formatTransactionTimeInline;
window.dayL            = formatDay;

// 旧 inline 桥 window.rate / netV / sumT 已删除 —— 调用方早已迁移到模块内
// netInCny / sumByTypeInCny / convertAmount，不再有任何 caller 读这三个全局。

// 列表渲染：模块版 mainTab.renderList 接受可选 mo（caller 已过滤好的本月数组）。
// inline render() 末尾调 renderList(mo) 会被覆盖到这里，行为一致。
// inline.renderList 函数体保留作 fallback（模块未加载时启动首屏不空）。
window.renderList = mainTab.renderList;

// 分析页：模块版 analysisTab.render + setAnalysisTab。
// inline showPage("analysis")/changeMonth/各 modal 提交后调 renderAnalysis()，会走模块版。
// inline.renderAnalysis / setAnalysisTab 函数体保留作 fallback。
window.renderAnalysis = analysisTab.render;
window.setAnalysisTab = analysisTab.setAnalysisTab;

// ── 渐进迁移期：inline 改 settings/txs 时同步推到 store ─────────────────────
//
// 问题：inline 的 saveTxs(next)/saveSettings() 只写 localStorage，store 不知道。
//   下次任何模块函数读 store.getSettings() 取到陈旧数据。
//   典型 bug 触发场景：设置页改汇率 → saveSettings → store 不更新 → 下次模块算金额用旧汇率。
//
// 修法：在 inline 已有的 saveXxx 上再包一层（已经有 Supabase 包装层在更内层），
//   先调原 inline 版（保留所有副作用），再把最新值推到 store。
//   inline.txs/settings 是 script-level var，自动作为 window.txs/window.settings 可达。
//
// 注意：inline 的 cloudPushDebounced 已经在内层调用过；这里 store.setXxx 又触发
//   sync 模块的 cloudPushDebounced（如果用户已登录）。两个 debounce 都是 1.5s 窗口，
//   各自在自己的闭包里 clearTimeout/setTimeout，所以最坏会触发 2 次推送。
//   debounce 行为决定了实际推送内容相同，多一次无害。等 inline 退役后这个开销自动消失。
function hookInlineSaves() {
  /** 包装一个 inline saveXxx：原行为保留 + 把最新值同步到 store。 */
  function wrap(name, snapshot, applyToStore) {
    const orig = window[name];
    if (typeof orig !== "function") {
      console.warn(`[main] hookInlineSaves: window.${name} 不存在，跳过`);
      return;
    }
    window[name] = function (...args) {
      const ret = orig.apply(this, args);
      try {
        applyToStore(snapshot());
      } catch (err) {
        console.warn(`[main] sync ${name} → store 失败:`, err);
      }
      return ret;
    };
  }

  wrap("saveTxs",      () => window.txs,      (v) => store.setTxs(Array.isArray(v) ? v : []));
  wrap("saveSettings", () => window.settings, (v) => store.setSettings(v || {}));
  // 用户在 inline 的 cat 设置 UI 里改/重排类别时，把变更也同步到 store →
  // 触发 cats:changed → manual.js / detail.js 等订阅者重渲染。
  wrap("saveCustomCategories",
       () => window.customCategoriesByType,
       (v) => store.setCustomCategoriesByType(v || { expense: [], income: [], savings: [] }));
  // 低频字段（budgets/goals/deletedSugs）等真正的模块需要时再加。
}

// ── 桥接 applyTheme：让 inline 调用走模块版 ─────────────────────────────────
//
// 模块版 settingsTab.applyTheme 从 store.getSettings() 读 theme/accent/customColors。
// hookInlineSaves 之后 store 会随 inline 改动同步，所以模块版任何时候读到的都是最新值。
window.applyTheme = settingsTab.applyTheme;

// ── 桥接 renderSettings 及其 onclick 依赖 ───────────────────────────────────
//
// 模块版 settingsTab.render 生成与 inline 完全相同的 innerHTML。
// 模块生成的 HTML 中 onclick="setTheme('xxx')" 等属性仍调 window 全局，
// 因此需要把每个 handler 桥接到模块版，覆盖 inline 定义。
window.renderSettings  = settingsTab.render;
window.setTheme        = settingsTab.setTheme;
window.setAccent       = settingsTab.setAccent;
window.setDefCur       = settingsTab.setDefCur;             // 旧 seg-btn 入口（已无 HTML 调用，保留兼容）
// 老 window.setRate 桥已删（settingsTab.setRate 不再存在，统一走 setRateForCurrency）
// v2 多币种 dropdown / 启用切换 / 多汇率 / + 添加
window.setDefCurFromSelect    = settingsTab.setDefCurFromSelect;
window.toggleEnabledCurrency  = settingsTab.toggleEnabledCurrency;
window.setRateForCurrency     = settingsTab.setRateForCurrency;
window.addCurrencyFromSelect  = settingsTab.addCurrencyFromSelect;
window.setSfxEnabled   = settingsTab.handleSetSfxEnabled;
window.setSfxVolume    = settingsTab.handleSetSfxVolume;
window.setVibEnabled   = settingsTab.handleSetVibEnabled;
window.cleanupTxs      = settingsTab.cleanupTxs;
window.setExportRange  = settingsTab.setExportRange;
window.doExportRange   = settingsTab.doExportRange;
window.onImportFile    = settingsTab.onImportFile;
window.confirmImport   = settingsTab.confirmImport;
window.bindHueSlider   = settingsTab.bindHueSlider;
// 颜色帮手——让 inline 的 openColorPicker / openThemeAdvanced 也能走模块版
window.getCurrentAccent  = settingsTab.getCurrentAccent;
window.getEffectiveColor = settingsTab.getEffectiveColor;
window.hexToHsl          = settingsTab.hexToHsl;
window.hslToHex          = settingsTab.hslToHex;
window.contrastText      = settingsTab.contrastText;
// 高级颜色自定义
window.openColorPicker      = settingsTab.openColorPicker;
window.bindLitSlider        = settingsTab.bindLitSlider;
window.applyCppLive         = settingsTab.applyCppLive;
window.saveAndRefreshCpp    = settingsTab.saveAndRefreshCpp;
window.resetCustomColor     = settingsTab.resetCustomColor;
window.closeColorPicker     = settingsTab.closeColorPicker;
// 高级主题面板
window.openThemeAdvanced    = settingsTab.openThemeAdvanced;
window.closeThemeAdvanced   = settingsTab.closeThemeAdvanced;
window.resetAllCustomColors = settingsTab.resetAllCustomColors;
// 类别设置
window.openCatSettings    = settingsTab.openCatSettings;
window.closeCatSettings   = settingsTab.closeCatSettings;
window.renderCatSettings  = settingsTab.renderCatSettings;
window.editCatIcon        = settingsTab.editCatIcon;
window.openLucidePicker   = settingsTab.openLucidePicker;
window.closeLucidePicker  = settingsTab.closeLucidePicker;
window.deleteCat          = settingsTab.deleteCat;
window.addNewCat          = settingsTab.addNewCat;
// v2 阶段 6.3：个人词典 onclick 桥接
window.removeLearnedRule  = settingsTab.handleRemoveLearnedRule;
window.clearLearnedRules  = settingsTab.handleClearLearnedRules;

// ── 桥接输入流（doSend / openInputSheet / chooseCurrency / clearInputField）──
//
// HTML 中 onclick="doSend()" / onclick="openInputSheet()" / onclick="chooseCurrency('CNY')"
// / onclick="clearInputField(true)" 全部路由到模块版。
window.doSend          = inputModal.doSend;
window.openInputSheet  = inputModal.open;
window.clearInputField = inputModal.clearInputField;
window.chooseCurrency  = currencyConfirmModal.choose;

// ── 桥接 renderAiSug ────────────────────────────────────────────────────────
// ── 桥接 toast ─────────────────────────────────────────────────────────────
window.showToast = toast;

// ── 桥接 WheelTime ─────────────────────────────────────────────────────────
window.openWheelTime    = wheelTime.openWheelTime;
window.closeWheelTime   = wheelTime.closeWheelTime;
window.openWheelTimeForTx = wheelTime.openWheelTimeForTx;

// ── 桥接币种切换 ──────────────────────────────────────────────────────────
window.toggleDisplayCurrency = mainTab.toggleDisplayCurrency;

// ── 桥接内联编辑 ──────────────────────────────────────────────────────────
window.inlineEditDesc = mainTab.inlineEditDesc;
window.inlineEditAmt = mainTab.inlineEditAmt;
window.closeIamt     = mainTab.closeIamt;
window.iaInput       = mainTab.iaInput;
window.iaDateChange  = mainTab.iaDateChange;

// ── 桥接语音识别 ──────────────────────────────────────────────────────────
window.toggleVoice = inputModal.toggleVoice;

// ── 桥接 renderAiSug ────────────────────────────────────────────────────────
window.renderAiSug = inputModal.renderAiSug;
window.hideAiSug   = inputModal.hideAiSug;

// ── 桥接 renderGoals 及其 onclick 依赖 ──────────────────────────────────────
window.renderGoals     = goalsTab.render;
window.setBudget       = goalsTab.setBudget;
window.addGoal         = goalsTab.addGoal;
window.deleteGoal      = goalsTab.deleteGoal;
window.getBudgetCatList = goalsTab.getBudgetCatList;
// 预算类别编辑器
window.addBudgetCat         = goalsTab.addBudgetCat;
window.deleteBudgetCat      = goalsTab.deleteBudgetCat;
window.openBudgetCatEditor  = goalsTab.openBudgetCatEditor;
window.closeBudgetCatEditor = goalsTab.closeBudgetCatEditor;
window.renderBudgetCatEditor = goalsTab.renderBudgetCatEditor;
window.addBudgetCatNew      = goalsTab.addBudgetCatNew;

// ── 桥接 confirm modal 及其 onclick 依赖 ────────────────────────────────────
//
// showConfirm / doConfirm：入口与提交。
// confEditAmt/Desc/Cat/Type/Cur：单笔确认面板中 onclick 就地编辑。
// showAmtPrompt / showErr：补录金额 / 识别失败提示。
window.showConfirm  = confirmModal.open;
window.doConfirm    = confirmModal.doConfirm;
window.confEditAmt  = confirmModal.editAmount;
window.confEditDesc = confirmModal.editDesc;
window.confEditCat  = confirmModal.editCategory;
window.confEditType = confirmModal.editType;
window.confEditCur  = confirmModal.editCurrency;
window.showAmtPrompt = confirmModal.showAmtPrompt;
window.showErr       = confirmModal.showErr;

// ── 桥接 manual modal 及其 onclick 依赖 ─────────────────────────────────────
window.openManual         = manualModal.open;
window.submitManual       = manualModal.submitManual;
window.swipeCloseManual   = manualModal.swipeClose;
window.clearAndCloseManual = manualModal.clearAndClose;
window.selTypeTab         = manualModal.selTypeTab;
window.selCurToggle       = manualModal.selCurToggle;
window.selType            = manualModal.selType;
window.selCur             = manualModal.selCur;
window.mcInput            = manualModal.mcInput;
window.mcDone             = manualModal.mcDone;
window.mcDateChange       = manualModal.mcDateChange;
window.openMcTimeWheel    = manualModal.openMcTimeWheel;
window.saveDraft          = manualModal.saveDraft;
window.restoreDraft       = manualModal.restoreDraft;
window.buildManualCatRow  = manualModal.buildManualCatRow;
window.showManualSug      = manualModal.showManualSug;

// ── 桥接 auth modal 及其 onclick 依赖 ───────────────────────────────────────
//
// HTML 中 onclick="openAuthSheet()" / doSignIn() / doSignUp() / doSignOut() /
// doSignInWithGoogle() / showForgotPasswordPrompt() / doUpdatePassword() / doManualSync()
window.openAuthSheet              = authModal.open;
window.doSignIn                   = authModal.doSignIn;
window.doSignUp                   = authModal.doSignUp;
window.doSignOut                  = authModal.doSignOut;
window.doSignInWithGoogle         = authModal.doSignInWithGoogle;
window.showForgotPasswordPrompt   = authModal.doForgotPassword;
window.doUpdatePassword           = authModal.doUpdatePassword;
window.doManualSync               = authModal.doManualSync;

// ── 桥接 search modal 及其 onclick 依赖 ─────────────────────────────────────
//
// openSearchSheet / doSearchSheet：HTML 中 onclick="openSearchSheet()" 和 oninput="doSearchSheet()"。
window.openSearchSheet = searchModal.open;
window.doSearchSheet   = searchModal.doSearch;
// 也桥接到 inline 搜索页用的 doSearch 名称（search tab 会用）
window.doSearch        = searchModal.doSearch;

// ── 桥接 month-picker modal 及其 onclick 依赖 ─────────────────────────────
//
// HTML 中 onclick="openPicker()" / pickerNav(-1) / toggleYM() / selYear(y) / selMonth(m)
// 全部路由到模块版。renderPicker 也桥接，让控制台可调。
window.openPicker    = monthPickerModal.open;
window.renderPicker  = monthPickerModal.render;
window.toggleYM      = monthPickerModal.toggleYM;
window.pickerNav     = monthPickerModal.pickerNav;
window.selYear       = monthPickerModal.selYear;
window.selMonth      = monthPickerModal.selMonth;

// ── 桥接 detail modal 及其 onclick 依赖 ─────────────────────────────────────
window.openDetail          = detailModal.open;
window.renderDetailBody    = detailModal.renderDetailBody;
window.detailEditCat       = detailModal.detailEditCat;
window.detailEditType      = detailModal.detailEditType;
window.detailEditCur       = detailModal.detailEditCur;
window.doEdit              = detailModal.doEdit;
window.doDelete            = detailModal.doDelete;
window.confirmDelete       = detailModal.confirmDelete;
window.cancelDeleteConfirm = detailModal.cancelDeleteConfirm;
window.executeDeleteConfirm = detailModal.executeDeleteConfirm;

// ── DOM 就绪后启动 ──────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
