// domain/voice/parser.js —— 一句话记账的纯逻辑解析层
//
// 不依赖 DOM、不读 localStorage、不引用全局 settings。
// 调用方（main.js / ui modal）需在 options 里把 defaultCurrency、allowedCategoriesByType 喂进来。
//
// 设计原则：
// - 每个 voiceXxx 都是无副作用的纯函数，可独立单测
// - parseVoiceText 是顶层入口，负责切分多笔 + 调度其他 voiceXxx
// - 所有正则尽量保持原始版本的行为，避免回归（行为变更需配套更新 tests.js）

import {
  BRAND_MAP,
  VOICE_CAT_MAP,
  VOICE_INCOME_KW,
  VOICE_SAVINGS_KW,
} from "./dictionary.js";

// ─────────────────────────────────────────────────────────────────────────────
// 类别识别：BRAND_MAP 优先 → 关键词扫描（吃 > 玩 > 购物 > 其他）
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_PRIORITY = ["吃", "玩", "购物", "其他"];

/** 返回内部分类标签（"吃"/"玩"/"购物"/"其他"）。 */
export function voiceDetectCategory(text) {
  const lower = text.toLowerCase();

  // 1. 品牌直查（按词长降序，避免 "fernand" 命中前 "ferand" 被切走）
  const brands = Object.keys(BRAND_MAP).sort((a, b) => b.length - a.length);
  for (const brand of brands) {
    if (lower.includes(brand.toLowerCase())) return BRAND_MAP[brand];
  }

  // 2. 类别关键词扫描（按优先级）
  for (const cat of CATEGORY_PRIORITY) {
    const words = VOICE_CAT_MAP[cat] || [];
    for (const word of words) {
      if (lower.includes(word.toLowerCase())) return cat;
    }
  }
  return "其他";
}

// ─────────────────────────────────────────────────────────────────────────────
// 类型识别：expense / income / savings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 返回 "expense" | "income" | "savings"。
 * 特判："赌我…不…" → income（赌某事不发生赢钱，归到收入）。
 */
export function voiceDetectType(text) {
  if (/赌我/.test(text) && /不/.test(text)) return "income";
  const lower = text.toLowerCase();
  for (const kw of VOICE_INCOME_KW) {
    if (lower.includes(kw.toLowerCase())) return "income";
  }
  for (const kw of VOICE_SAVINGS_KW) {
    if (lower.includes(kw.toLowerCase())) return "savings";
  }
  return "expense";
}

// ─────────────────────────────────────────────────────────────────────────────
// 货币识别：欧元 / 人民币 / 默认 / 需确认
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {{ currency: "EUR"|"CNY", needConfirm: boolean }}
 *   两种货币标记同时出现时返回 needConfirm=true，让 UI 弹窗让用户选择。
 */
export function voiceDetectCurrency(text, defaultCurrency) {
  const hasRmb = /rmb|人民币|¥|￥/i.test(text)
    || (/元|块/.test(text) && !/欧元/.test(text));
  const hasEur = /欧|€|euro/i.test(text);
  if (hasEur && hasRmb) return { currency: defaultCurrency, needConfirm: true };
  if (hasEur) return { currency: "EUR", needConfirm: false };
  if (hasRmb) return { currency: "CNY", needConfirm: false };
  return { currency: defaultCurrency, needConfirm: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 金额提取
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 提取金额。识别规则按优先级：
 *   1. "数字+数字" 或 "数字加数字" → 相加
 *   2. "给我/还我/输我/赔我 N" → 取 N
 *   3. 含货币符号时：货币后裸数字 > 货币数字 → 取较大者；否则取最后货币数字
 *   4. 兜底：清掉日期/数量词后取最大数字
 *
 * 返回 { amount: number } 或 null（一个数字都找不到）。
 */
export function voiceExtractAmount(text) {
  // 1. 加法式
  let addM = text.match(/(\d+(?:\.\d+)?)\s*[+＋]\s*(\d+(?:\.\d+)?)/);
  if (!addM) addM = text.match(/(\d+(?:\.\d+)?)加(\d+(?:\.\d+)?)/);
  if (addM) {
    return { amount: parseFloat((parseFloat(addM[1]) + parseFloat(addM[2])).toFixed(2)) };
  }

  // 2. "给我/还我/输我/赔我 N"
  const giveM = text.match(/(?:给我|还我|输我|赔我)\s*(\d+(?:\.\d+)?)/);
  if (giveM) return { amount: parseFloat(giveM[1]) };

  // 3. 含货币标记
  const curMatches = [];
  const reCur = /(\d+(?:\.\d+)?)\s*(?:欧|€|rmb|人民币|元|块)/gi;
  let mc;
  while ((mc = reCur.exec(text)) !== null) curMatches.push(parseFloat(mc[1]));

  if (curMatches.length) {
    const afterCur = text.replace(/\d+(?:\.\d+)?\s*(?:欧|€|rmb|人民币|元|块)/gi, "◊");
    const plainNums = [];
    const rePl = /(\d+(?:\.\d+)?)/g;
    let pm;
    while ((pm = rePl.exec(afterCur)) !== null) {
      const n = parseFloat(pm[1]);
      const ctx = afterCur.slice(Math.max(0, pm.index - 1), pm.index + pm[0].length + 2);
      if (/年|月|日|号|点|时|个|次/.test(ctx)) continue;
      if (n >= 1900 && n <= 2100 && pm[0].length === 4) continue;
      plainNums.push(n);
    }
    const lastCur = curMatches[curMatches.length - 1];
    if (plainNums.length && Math.max(...plainNums) > lastCur) {
      return { amount: Math.max(...plainNums) };
    }
    return { amount: lastCur };
  }

  // 4. 兜底：清掉日期/数量词后取最大
  const cleanText = text
    .replace(/\d{1,4}\s*年/g, " ")
    .replace(/\d{1,2}\s*月/g, " ")
    .replace(/\d{1,2}\s*[号日]/g, " ")
    .replace(/\d{1,2}\s*[点时]/g, " ")
    .replace(/(\d+)\s*(?:个|份|次|条|张|只|件|套|台|本|双|对|瓶|罐|箱|袋)/g, " ");
  const allNums = [];
  const re2 = /(\d+(?:\.\d+)?)/g;
  let am;
  while ((am = re2.exec(cleanText)) !== null) {
    const n2 = parseFloat(am[1]);
    if (n2 >= 1900 && n2 <= 2100 && am[0].length === 4) continue;
    allNums.push(n2);
  }
  if (!allNums.length) return null;
  return { amount: Math.max(...allNums) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 描述清洗
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 最小化清洗：保留所有人名、助词、介词，仅去除分隔词、日期前缀和末尾金额。
 * 截断到 30 字以内；空串兜底为"消费"。
 */
export function voiceCleanDesc(text) {
  let desc = text;
  // 1. 去段首分隔词
  desc = desc.replace(/^(?:还有|然后|另外|再加|再有|外加|顺便|顺手|顺道|接着|紧接着|跟着|紧跟着|之后|后来|随后|跟住|继续|再来|又来|再去|又去|末了|最后|另|and then|then)\s*/i, "");
  // 1b. 切分残留的开头小词（"还/又/再"+动词）
  desc = desc.replace(/^(?:还|又|再)\s*/, "");
  // 2. 去掉继承的日期前缀
  desc = desc.replace(/^(?:今天|昨天|前天|今日)\s*/, "");
  // 3. 去末尾金额（含加法式 + 可选货币标记）
  desc = desc.replace(/\s*\d+(?:\.\d+)?(?:\s*[+＋]\s*\d+(?:\.\d+)?)?\s*(?:rmb|欧|欧元|元|块|块钱|€|¥|￥|\$)?\s*$/i, "");
  desc = desc.trim();
  return desc.slice(0, 30) || "消费";
}

// ─────────────────────────────────────────────────────────────────────────────
// 日期识别
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 识别 "昨天/前天/今天/M月D日" 等日期描述。
 * @returns {{ ts: number, label: string }} —— ts 是时间戳，label 是中文展示文本（无识别到则为空串）
 */
export function voiceExtractDate(text) {
  const now = new Date();
  let base = new Date();
  let label = "";

  if (/昨天|昨日|昨儿/.test(text)) {
    base.setDate(base.getDate() - 1);
    label = `${base.getMonth() + 1}月${base.getDate()}日`;
  } else if (/前天/.test(text)) {
    base.setDate(base.getDate() - 2);
    label = `${base.getMonth() + 1}月${base.getDate()}日`;
  } else if (/今天|今日|今儿/.test(text)) {
    label = `${now.getMonth() + 1}月${now.getDate()}日`;
  }

  const fd = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/);
  if (fd) {
    base = new Date(now.getFullYear(), parseInt(fd[1]) - 1, parseInt(fd[2]), 12);
    label = `${fd[1]}月${fd[2]}日`;
  }
  return { ts: base.getTime(), label };
}

// ─────────────────────────────────────────────────────────────────────────────
// 多笔切分
// ─────────────────────────────────────────────────────────────────────────────

/** 强分隔词（出现即切分） */
const STRONG_SEPARATORS = [
  "还有","然后","另外","再加","再有","外加",
  "顺便","顺手","顺道","接着","紧接着","跟着","紧跟着",
  "之后","后来","随后","跟住","继续",
  "再来","又来","再去","又去",
  "末了","最后","另",
  "and then","then",
];

/** "还/又/再"后跟下列动词字符才切（避免误伤"还款 / 又一 / 再说"） */
const VERBS_AFTER_HUAN = "吃玩买加用乘坐去看喝花付付款打交付报订";

/**
 * 把多笔文本切分成数组。每段必须含数字才视为独立交易。
 * 若首段含日期前缀（今天/昨天/前天/[上本]周），自动继承到后续段。
 *
 * 单笔/无法切分时返回 [text.trim()]。
 */
export function voiceSplitInput(text) {
  let s = text;

  // 强分隔词
  for (const sep of STRONG_SEPARATORS) s = s.split(sep).join("‖");

  // "还/又/再" + 动词
  s = s.replace(new RegExp(" 还(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");
  s = s.replace(new RegExp(" 又(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");
  s = s.replace(new RegExp(" 再(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");

  // 标点分隔
  s = s.replace(/[，,；;。、]+/g, "‖");

  const rawParts = s.split("‖").map((p) => p.trim()).filter(Boolean);
  if (rawParts.length <= 1) return [text.trim()];

  // 安全合并：无数字的段并入前一段
  const parts = [];
  for (const p of rawParts) {
    if (/\d/.test(p)) parts.push(p);
    else if (parts.length > 0) parts[parts.length - 1] += " " + p;
    else parts.push(p);
  }
  if (parts.length <= 1) return [text.trim()];

  // 继承首段日期前缀
  const dateM = parts[0].match(/^(今天|昨天|前天|[上本]周)/);
  const datePfx = dateM ? dateM[1] : "";
  if (datePfx) {
    parts[0] = parts[0].slice(datePfx.length).trim();
    return parts.map((p, i) =>
      i > 0 && !/今天|昨天|前天/.test(p) ? datePfx + p : p
    );
  }
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// 类型重映射（强制把识别出的内部分类落到当前类型允许的新分类组）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 根据 type（expense/income/savings）把文本重映射到对应分类。
 * 例如 voiceDetectCategory 会返回内部标签（吃/玩/购物/其他），
 * 而 UI 期望落到 expense=[吃/买/车/运动/其他] 这种新分类组里。
 */
export function voiceRemapCategoryByType(text, type) {
  const lower = String(text || "").toLowerCase();

  if (type === "income") {
    if (/工资|薪水|薪资|薪金|月薪|年薪|奖金|年终奖|提成|分红|利息|理财收益|工钱|salary|wage|bonus/i.test(text)) return "工资";
    if (/现金|cash|领钱|发现金|收现金|手现金|纸币|硬币/i.test(text)) return "现金";
    if (/转账|转我|转给我|微信转|支付宝转|银行转|汇款|wire|transfer|wise|paypal|paysend|venmo|revolut|发红包|微信红包|支付宝红包|发我红包/i.test(text)) return "转账";
    return "其他";
  }

  if (type === "savings") {
    if (/股票|stock|股市|基金|fund|etf|公募|私募|定投/i.test(text)) return "股票";
    if (/资产|asset|投资|理财|房产|不动产|黄金|gold|加密|crypto|btc|eth|比特币|以太坊/i.test(text)) return "资产";
    if (/储蓄|存钱|存款|定存|活期|deposit|saving/i.test(text)) return "储蓄";
    return "其他";
  }

  // expense
  // 2026-05-14 v3 重命名：UI 名从"吃/买/车"→"餐饮/购物/交通"
  // 注意：dict 里 BRAND_MAP / VOICE_CAT_MAP 仍用内部标签 "吃/玩/购物/其他"，这里只是把它们重映射成新 UI 名。
  if (/打车|出租车|uber|taxi|滴滴|地铁|公交|公交车|火车|高铁|动车|飞机|机票|加油|油费|汽油|gasoline|petrol|停车|停车场|停车费|高速|过路费|过桥费|etc|维修|保养|换胎|机油|洗车|车票|汽车|租车|car ?rental|过户|车险|driving|驾驶/i.test(text)) return "交通";
  if (/健身|瑜伽|游泳|羽毛球|网球|篮球|足球|乒乓球|跑步|骑行|滑雪|滑冰|球拍|球鞋|台球|桌球|斯诺克|球线|私教|健身房|gym|yoga|fitness|sport|workout|训练课|跑鞋|攀岩|拳击|马拉松/i.test(text)) return "运动";

  // 餐饮
  for (const kw of (VOICE_CAT_MAP["吃"] || [])) {
    if (lower.includes(kw.toLowerCase())) return "餐饮";
  }
  // 购物
  for (const kw of (VOICE_CAT_MAP["购物"] || [])) {
    if (lower.includes(kw.toLowerCase())) return "购物";
  }
  // 兜底：品牌
  const brands = Object.keys(BRAND_MAP).sort((a, b) => b.length - a.length);
  for (const brand of brands) {
    if (lower.includes(brand.toLowerCase())) {
      const v = BRAND_MAP[brand];
      if (v === "吃") return "餐饮";
      if (v === "购物") return "购物";
    }
  }
  return "其他";
}

// ─────────────────────────────────────────────────────────────────────────────
// 顶层入口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ParseOptions
 * @property {"EUR"|"CNY"} defaultCurrency  必填。无货币标记时回落到此。
 * @property {Object<string, Array<{name:string}>>} [allowedCategoriesByType]
 *           可选。形如 { expense: [{name:"餐饮"},{name:"购物"},...], income:[...], savings:[...] }
 *           传入时：重映射结果若不在允许列表里，归到"其他"。不传则跳过此校验。
 */

/**
 * @typedef {Object} ParseResult
 * @property {boolean} ok                  是否能直接落账（false 表示需要补录金额）
 * @property {boolean} needAmountInput     是否需要 UI 弹窗补录金额
 * @property {boolean} needCurrencyConfirm 是否需要 UI 弹窗确认货币
 * @property {number|null} amount
 * @property {"EUR"|"CNY"} currency
 * @property {string} category             目标类别（已经是 expense/income/savings 各自分类组里的名字）
 * @property {"expense"|"income"|"savings"} type
 * @property {string} desc
 * @property {number} ts
 * @property {string} timeLabel
 * @property {"day"|"exact"} timePrecision
 * @property {null} yearOnly
 */

/**
 * 主入口：把口语文本解析成多笔交易候选。
 * @param {string} text
 * @param {ParseOptions} options
 * @returns {ParseResult[]}
 */
export function parseVoiceText(text, options) {
  const { defaultCurrency, allowedCategoriesByType } = options || {};
  if (!defaultCurrency) {
    throw new Error("parseVoiceText: options.defaultCurrency is required");
  }

  const segs = voiceSplitInput(text);
  const results = [];

  for (let seg of segs) {
    seg = seg.trim();
    if (!seg) continue;

    const curInfo = voiceDetectCurrency(seg, defaultCurrency);
    const amtInfo = voiceExtractAmount(seg);
    const type = voiceDetectType(seg);
    const dateInfo = voiceExtractDate(seg);
    const desc = voiceCleanDesc(seg);
    const needAmt = !amtInfo || amtInfo.amount === null || amtInfo.amount <= 0;

    // 强制重映射到当前类型允许的分类
    let mappedCat = voiceRemapCategoryByType(seg, type);

    // 双保险：不在允许列表里 → 归"其他"
    if (allowedCategoriesByType && allowedCategoriesByType[type]) {
      const allowed = allowedCategoriesByType[type].map((c) => c.name);
      if (!allowed.includes(mappedCat)) mappedCat = "其他";
    }

    results.push({
      ok: !needAmt,
      needAmountInput: needAmt,
      needCurrencyConfirm: curInfo.needConfirm,
      amount: needAmt ? null : amtInfo.amount,
      currency: curInfo.currency,
      category: mappedCat,
      type,
      desc,
      ts: dateInfo.ts,
      timeLabel: dateInfo.label,
      timePrecision: dateInfo.label ? "day" : "exact",
      yearOnly: null,
    });
  }
  return results;
}
