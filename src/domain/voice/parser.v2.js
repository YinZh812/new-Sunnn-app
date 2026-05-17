// domain/voice/parser.v2.js —— v2 解析器（阶段 1：与 v1 行为完全一致）
//
// 改造路线（每个阶段独立 commit）：
//   阶段 1（本提交）：脚手架。preprocess 是 identity，parser 逻辑 = v1。
//   阶段 2：preprocess.js 填入 Emoji / 全半角 / 错字
//   阶段 3：voiceExtractAmount 加中文数字（"三块五"/"一百六"/"两千五"/"十二块八"）
//   阶段 4：voiceExtractDate 升级（中午/下午/晚上+N点(半) + 上周X + N天前）
//          → 配合 timePrecision: "exact"
//   阶段 5：MERCHANT_MAP 独立 + 返回值附加 merchant 字段
//   阶段 6：dictionary.v2.js 词典扩展（不改类别结构）
//
// 不改的部分（v1 已验证的启发式，文档漏写但必须保留）：
//   - 加法式金额（"8.5+10" → 18.5）
//   - "给我/还我/输我/赔我 N" → 取 N
//   - 货币标记后裸数字优先
//   - 数量词排除（"4个smash" 不把 4 当金额）
//   - "赌我…不…" → income 特判

import {
  BRAND_MAP,
  VOICE_CAT_MAP,
  VOICE_INCOME_KW,
  VOICE_SAVINGS_KW,
  TOTAL_WORDS,
  QUANTIFIERS,
  TIME_RELATIVE,
  TIME_PERIOD,
} from "./dictionary.v2.js";
import { preprocess } from "./preprocess.js";
import { applyLearnedRules } from "../learning.js";

// ─────────────────────────────────────────────────────────────────────────────
// 类别识别
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_PRIORITY = ["吃", "玩", "购物", "其他"];

export function voiceDetectCategory(text) {
  const lower = text.toLowerCase();
  const brands = Object.keys(BRAND_MAP).sort((a, b) => b.length - a.length);
  for (const brand of brands) {
    if (lower.includes(brand.toLowerCase())) return BRAND_MAP[brand];
  }
  for (const cat of CATEGORY_PRIORITY) {
    const words = VOICE_CAT_MAP[cat] || [];
    for (const word of words) {
      if (lower.includes(word.toLowerCase())) return cat;
    }
  }
  return "其他";
}

// ─────────────────────────────────────────────────────────────────────────────
// 类型识别
// ─────────────────────────────────────────────────────────────────────────────

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
// 货币识别
// ─────────────────────────────────────────────────────────────────────────────

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
// 中文数字解析（v2 阶段 3 新增）
// ─────────────────────────────────────────────────────────────────────────────
//
// 触发条件：在 voiceExtractAmount 末尾，所有 Arabic 路径失败时才走 CN。
// 支持模式：
//   - 强：X[块/元][Y]      e.g. 三块五=3.5、十二块八=12.8、三十块=30
//   - 弱：含 百/千/万 的纯 CN  e.g. 一百六=160、两千五=2500、两万三千=23000
// 故意不支持单字"三/八" 等纯个位数（与数量词冲突）；仅"十"开头也不接受（弱模式要求百/千/万）。
//
// "零" 用作间隔标记：
//   - "一百六"   → 6 视为十位 → 160
//   - "一百零六" → 6 视为个位 → 106

const CN_DIGIT = { 零:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
const CN_UNIT  = { 十:10, 百:100, 千:1000, 万:10000 };
const CN_INT_CHARS = "零一二两三四五六七八九十百千万";
const RE_CN_INT_RUN     = new RegExp(`([${CN_INT_CHARS}]+)`);
const RE_CN_AMOUNT_UNIT = new RegExp(`([${CN_INT_CHARS}]+)\\s*[块元](?:钱)?\\s*([${CN_INT_CHARS}])?`);

function parseChineseInt(s) {
  let total = 0;
  let current = 0;
  let lastUnit = 0;
  let zeroSeen = false;
  for (const c of s) {
    if (c === "零") { zeroSeen = true; continue; }
    if (c in CN_DIGIT) {
      current = CN_DIGIT[c];
    } else if (c in CN_UNIT) {
      const unit = CN_UNIT[c];
      if (current === 0 && unit === 10) current = 1; // "十二" 开头补 1
      if (unit >= 10000) {
        total = (total + current) * unit;
        current = 0;
      } else {
        total += current * unit;
        current = 0;
        lastUnit = unit;
      }
      zeroSeen = false;
    }
    // 其他字符（包含未识别字）忽略
  }
  if (current > 0) {
    if (zeroSeen || lastUnit === 0) total += current;
    else total += current * (lastUnit / 10); // 省略末位单位："一百六" 的 6 默认在十位
  }
  return total;
}

/** 从文本里抓 CN 金额。返回数值或 null。 */
function voiceExtractAmountCN(text) {
  // 强模式：必须有 块/元
  const m = text.match(RE_CN_AMOUNT_UNIT);
  if (m) {
    const intPart = parseChineseInt(m[1]);
    if (Number.isFinite(intPart) && intPart > 0) {
      const frac = m[2] != null ? (CN_DIGIT[m[2]] ?? 0) : 0;
      return parseFloat((intPart + frac * 0.1).toFixed(2));
    }
  }
  // 弱模式：纯 CN，但必须含 百/千/万（避免"十个鸡蛋"误识别）
  const m2 = text.match(RE_CN_INT_RUN);
  if (m2 && /[百千万]/.test(m2[1])) {
    const v = parseChineseInt(m2[1]);
    if (Number.isFinite(v) && v >= 10) return v;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 金额提取
// ─────────────────────────────────────────────────────────────────────────────

export function voiceExtractAmount(text) {
  let addM = text.match(/(\d+(?:\.\d+)?)\s*[+＋]\s*(\d+(?:\.\d+)?)/);
  if (!addM) addM = text.match(/(\d+(?:\.\d+)?)加(\d+(?:\.\d+)?)/);
  if (addM) {
    return { amount: parseFloat((parseFloat(addM[1]) + parseFloat(addM[2])).toFixed(2)) };
  }

  const giveM = text.match(/(?:给我|还我|输我|赔我)\s*(\d+(?:\.\d+)?)/);
  if (giveM) return { amount: parseFloat(giveM[1]) };

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

  // v2 阶段 3.5：量词从 dict 驱动（取代 v1 的硬编码组）
  // v2 阶段 4：时间 "N点N分"/"N点半" 也要剥（不然 "下午3点20分喝咖啡18" 会把 20 当金额）
  const quantifierGroup = QUANTIFIERS.map((q) => q.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("|");
  const cleanText = text
    .replace(/\d{1,4}\s*年/g, " ")
    .replace(/\d{1,2}\s*月/g, " ")
    .replace(/\d{1,2}\s*[号日]/g, " ")
    .replace(/\d{1,2}\s*点\s*半/g, " ")             // 3点半
    .replace(/\d{1,2}\s*点\s*\d{1,2}\s*分?/g, " ") // 3点20[分]
    .replace(/\d{1,2}\s*[点时]/g, " ")              // 裸 3点
    .replace(/\d+\s*天\s*前/g, " ")                 // 5天前 (CN 版无 \d)
    .replace(new RegExp(`(\\d+)\\s*(?:${quantifierGroup})`, "g"), " ");
  const allNums = [];
  const re2 = /(\d+(?:\.\d+)?)/g;
  let am;
  while ((am = re2.exec(cleanText)) !== null) {
    const n2 = parseFloat(am[1]);
    if (n2 >= 1900 && n2 <= 2100 && am[0].length === 4) continue;
    allNums.push(n2);
  }
  if (!allNums.length) {
    // v2 阶段 3：阿拉伯数字一个都没有 → 尝试中文数字
    const cnAmt = voiceExtractAmountCN(text);
    if (cnAmt !== null && cnAmt > 0) return { amount: cnAmt };
    return null;
  }
  return { amount: Math.max(...allNums) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 描述清洗
// ─────────────────────────────────────────────────────────────────────────────

export function voiceCleanDesc(text) {
  let desc = text;
  desc = desc.replace(/^(?:还有|然后|另外|再加|再有|外加|顺便|顺手|顺道|接着|紧接着|跟着|紧跟着|之后|后来|随后|跟住|继续|再来|又来|再去|又去|末了|最后|另|and then|then)\s*/i, "");
  desc = desc.replace(/^(?:还|又|再)\s*/, "");
  // v2 阶段 4：时间前缀按从粗到细顺序剥离
  desc = desc.replace(/^(?:今天|昨天|前天|今日|昨日|明天|后天)\s*/, "");
  desc = desc.replace(/^(?:\d+|[零一二两三四五六七八九十百千万]+)\s*天\s*前\s*/, "");
  desc = desc.replace(/^上(?:周|星期)[一二三四五六日天]\s*/, "");
  desc = desc.replace(/^\d{1,2}\s*月\s*\d{1,2}\s*[号日]\s*/, "");
  desc = desc.replace(/^(?:早上|上午|中午|下午|傍晚|晚上|半夜|凌晨)\s*/, "");
  desc = desc.replace(/^\d{1,2}\s*点\s*(?:半|\d{1,2}\s*分?)?\s*/, "");
  desc = desc.replace(/\s*\d+(?:\.\d+)?(?:\s*[+＋]\s*\d+(?:\.\d+)?)?\s*(?:rmb|欧|欧元|元|块|块钱|€|¥|￥|\$)?\s*$/i, "");
  // v2 阶段 3：剥离末尾的中文金额
  //   1) 带 块/元 单位：三块五 / 十二块八 / 三十块（钱）
  desc = desc.replace(/\s*[零一二两三四五六七八九十百千万]+\s*[块元](?:钱)?\s*[零一二三四五六七八九]?\s*$/, "");
  //   2) 不带单位但含 百/千/万：一百六 / 两千五 / 三千八百（"十"开头/末尾不剥避免误伤"几十"之类）
  desc = desc.replace(/\s*[零一二两三四五六七八九]*[百千万][零一二两三四五六七八九十百千万]*\s*$/, "");
  desc = desc.trim();
  return desc.slice(0, 30) || "消费";
}

// ─────────────────────────────────────────────────────────────────────────────
// 日期/时间识别（v2 阶段 4 升级）
// ─────────────────────────────────────────────────────────────────────────────
//
// 支持模式：
//   - 相对日期：今天/昨天/前天/明天/后天/今日/昨日（来自 TIME_RELATIVE）
//   - 绝对日期：M月D日 / M月D号
//   - N天前：三天前 / 5天前（限 1–365）
//   - 上周X / 上星期X：上周一~上周日（"日"="天"=7）
//   - 时段词：早上/上午/中午/下午/傍晚/晚上/半夜/凌晨（来自 TIME_PERIOD）
//   - 显式时辰：3点 / 3点20[分] / 3点半
//   - 组合：昨天下午3点 / 晚上8点半（period 在 PM 时把 N点 1-11 推 +12）
//
// 输出：
//   - precision="day"    → ts 设为该日 12:00（仅日期）
//   - precision="daytime" → 仅时段词（中午/下午/晚上），ts 设为时段默认时刻；timePhrase 带原词
//   - precision="exact"   → 显式 N点 / 啥都没识别（ts = 现在）

const WEEKDAY_CHAR = { "一":1, "二":2, "三":3, "四":4, "五":5, "六":6, "日":7, "天":7 };

/**
 * @returns {{ ts: number, label: string, precision: "day"|"daytime"|"exact", timePhrase: string|null }}
 */
export function voiceExtractDate(text) {
  const now = new Date();
  let date = new Date(now);
  let hasDate = false;
  let label = "";
  let hour = null;
  let minute = null;
  let periodWord = null;       // 命中的时段词原文（中午/下午...）
  let hasExplicitTime = false; // 是否识别到 N点

  // 1. 相对日期
  for (const word of Object.keys(TIME_RELATIVE)) {
    if (text.includes(word)) {
      date.setDate(date.getDate() + TIME_RELATIVE[word]);
      hasDate = true;
      label = `${date.getMonth() + 1}月${date.getDate()}日`;
      break;
    }
  }

  // 2. N 天前（Arabic 优先 → Chinese）
  const arAgo = text.match(/(\d+)\s*天前/);
  const cnAgo = text.match(/([零一二两三四五六七八九十百千万]+)\s*天前/);
  let daysAgo = null;
  if (arAgo) daysAgo = parseInt(arAgo[1]);
  else if (cnAgo) daysAgo = parseChineseInt(cnAgo[1]);
  if (daysAgo != null && daysAgo > 0 && daysAgo < 365) {
    date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    hasDate = true;
    label = `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  // 3. 上周X / 上星期X
  const lwM = text.match(/上(?:周|星期)([一二三四五六日天])/);
  if (lwM) {
    const targetDow = WEEKDAY_CHAR[lwM[1]];
    const todayDow = now.getDay() === 0 ? 7 : now.getDay();
    const offset = -(todayDow - 1) - 7 + (targetDow - 1);
    date = new Date(now);
    date.setDate(date.getDate() + offset);
    hasDate = true;
    label = `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  // 4. 绝对日期 M月D日
  const fd = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/);
  if (fd) {
    date = new Date(now.getFullYear(), parseInt(fd[1]) - 1, parseInt(fd[2]));
    hasDate = true;
    label = `${fd[1]}月${fd[2]}日`;
  }

  // 5. 时段词（中午/下午/晚上...）
  let periodHour = null;
  for (const word of Object.keys(TIME_PERIOD)) {
    if (text.includes(word)) {
      const [h, m] = TIME_PERIOD[word];
      periodHour = h;
      periodWord = word;
      hour = h;
      minute = m;
      break;
    }
  }

  // 6. 显式 N点 / N点N分 / N点半
  const tM = text.match(/(\d{1,2})\s*点(?:\s*半|\s*(\d{1,2})\s*分?)?/);
  if (tM) {
    let h = parseInt(tM[1]);
    let m = tM[0].includes("半") ? 30 : (tM[2] ? parseInt(tM[2]) : 0);
    // 时段 + N点 组合：下午 + 3点 → 15:00
    if (periodHour != null && periodHour >= 12 && h < 12) h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      hour = h;
      minute = m;
      hasExplicitTime = true;
    }
  }

  // 决定 precision + timePhrase
  let ts;
  let precision;
  let timePhrase = null;
  if (hasExplicitTime) {
    // 显式 N点 → 精确到分（无 timePhrase）
    date.setHours(hour, minute, 0, 0);
    ts = date.getTime();
    precision = "exact";
  } else if (periodWord) {
    // 仅时段词（无 N点）→ daytime，UI 显示词而非数字
    date.setHours(hour, minute, 0, 0);
    ts = date.getTime();
    precision = "daytime";
    timePhrase = periodWord;
  } else if (hasDate) {
    // 仅日期 → day，ts 设为该日 12:00
    date.setHours(12, 0, 0, 0);
    ts = date.getTime();
    precision = "day";
  } else {
    // 啥都没识别 → 当前时刻
    ts = now.getTime();
    precision = "exact";
  }

  return { ts, label, precision, timePhrase };
}

// ─────────────────────────────────────────────────────────────────────────────
// 多笔切分
// ─────────────────────────────────────────────────────────────────────────────

const STRONG_SEPARATORS = [
  "还有","然后","另外","再加","再有","外加",
  "顺便","顺手","顺道","接着","紧接着","跟着","紧跟着",
  "之后","后来","随后","跟住","继续",
  "再来","又来","再去","又去",
  "末了","最后","另",
  "and then","then",
];

const VERBS_AFTER_HUAN = "吃玩买加用乘坐去看喝花付付款打交付报订";

export function voiceSplitInput(text) {
  // v2 阶段 3.5：含"一共/合计/总共/总计/加起来/一起" → 视为单笔，整段不切
  for (const w of TOTAL_WORDS) {
    if (text.includes(w)) return [text.trim()];
  }

  let s = text;

  for (const sep of STRONG_SEPARATORS) s = s.split(sep).join("‖");

  s = s.replace(new RegExp(" 还(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");
  s = s.replace(new RegExp(" 又(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");
  s = s.replace(new RegExp(" 再(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");

  s = s.replace(/[，,；;。、]+/g, "‖");

  const rawParts = s.split("‖").map((p) => p.trim()).filter(Boolean);
  if (rawParts.length <= 1) return [text.trim()];

  // 保留无金额段为独立段（后续 parser 会把它们标为 needAmountInput=true，
  // confirm.js 流程会逐个弹窗补金额）。仅丢弃纯感叹词/单字噪音。
  const INTERJECTION_RE = /^(嗯|哦|啊|呃|额|哎|呀|噢|喔|嘿|嘛|呵|哈|嗨)+$/;
  const parts = [];
  for (const p of rawParts) {
    if (/\d/.test(p)) {
      parts.push(p);
    } else if (p.length >= 2 && !INTERJECTION_RE.test(p)) {
      parts.push(p);
    }
    // 否则：单字 / 纯感叹词 → 丢弃
  }
  if (parts.length <= 1) return [text.trim()];

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
// 类型重映射
// ─────────────────────────────────────────────────────────────────────────────

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
  // 注意：dict 里 BRAND_MAP / VOICE_CAT_MAP 仍用内部标签 "吃/玩/购物/其他"，这里只是把它们重映射成新 UI 名。
  if (/打车|出租车|uber|taxi|滴滴|地铁|公交|公交车|火车|高铁|动车|飞机|机票|加油|油费|汽油|gasoline|petrol|停车|停车场|停车费|高速|过路费|过桥费|etc|维修|保养|换胎|机油|洗车|车票|汽车|租车|car ?rental|过户|车险|driving|驾驶/i.test(text)) return "交通";
  if (/健身|瑜伽|游泳|羽毛球|网球|篮球|足球|乒乓球|跑步|骑行|滑雪|滑冰|球拍|球鞋|台球|桌球|斯诺克|球线|私教|健身房|gym|yoga|fitness|sport|workout|训练课|跑鞋|攀岩|拳击|马拉松/i.test(text)) return "运动";

  // 动词优先于名词（用户反馈）：
  //   "在商场吃东西" → 餐饮（吃 动词 胜过 商场 名词）
  //   "超市买牛奶面包" → 购物（买 动词 胜过 牛奶/面包 名词）
  //
  //   餐饮强动词（吃/喝 含义无歧义）优先级最高；购物动词次之；最后才到名词逐字典。
  //   注：餐饮动词若与"买单"这种 餐饮场景但用了"买"字 的边界冲突，目前以餐饮动词
  //       优先；纯"买单 300" 这种没有 吃/喝 的，仍会判 购物，依赖用户的学习规则纠正。
  if (/吃|喝|用餐|进餐|eat|drink|dine|brunch/i.test(text)) return "餐饮";
  if (/买|购|网购|下单|shopping/i.test(text)) return "购物";

  for (const kw of (VOICE_CAT_MAP["吃"] || [])) {
    if (lower.includes(kw.toLowerCase())) return "餐饮";
  }
  for (const kw of (VOICE_CAT_MAP["购物"] || [])) {
    if (lower.includes(kw.toLowerCase())) return "购物";
  }
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
 * @param {string} text
 * @param {{
 *   defaultCurrency: "EUR"|"CNY",
 *   allowedCategoriesByType?: Object,
 *   learnedRules?: Array
 * }} options
 * @returns {Array}
 */
export function parseVoiceText(text, options) {
  const { defaultCurrency, allowedCategoriesByType, learnedRules } = options || {};
  if (!defaultCurrency) {
    throw new Error("parseVoiceText: options.defaultCurrency is required");
  }

  // v2 多出来的一步：预处理（阶段 1 是 identity）
  const normalized = preprocess(text);

  const segs = voiceSplitInput(normalized);
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

    let mappedCat = voiceRemapCategoryByType(seg, type);

    // v2 阶段 6.2：个人学习规则优先级最高（子串包含 + 最长匹配）
    // 优先级：学习规则 > parser 词典推断 > 兜底"其他"
    if (Array.isArray(learnedRules) && learnedRules.length) {
      const learnedCat = applyLearnedRules(seg, type, learnedRules);
      if (learnedCat) mappedCat = learnedCat;
    }

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
      timePrecision: dateInfo.precision,
      timePhrase: dateInfo.timePhrase,
      yearOnly: null,
    });
  }

  // 多笔切分专属后处理：
  //   1. 把 precision=day 且日期是今天 的段，ts 改成"现在"（用户说"今天 X、Y、Z"
  //      但没提具体时间时，期望 3 笔都接近当前时刻，而非全压到今天 noon）
  //   2. 保证 ts 严格递增，让"最后说的"显示在明细页最上方（列表按 ts 降序排）
  //   单笔（results.length<=1）不做这两步，避免回归单笔测试
  if (results.length > 1) {
    const now = Date.now();
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const tomorrow0 = today0.getTime() + 86400000;
    for (const r of results) {
      if (r.timePrecision === "day" && r.ts >= today0.getTime() && r.ts < tomorrow0) {
        r.ts = now;
        r.timePrecision = "exact";  // 改成精确，明细页显示具体时分
      }
    }
    for (let i = 1; i < results.length; i++) {
      if (results[i].ts <= results[i - 1].ts) {
        results[i].ts = results[i - 1].ts + 1000;  // 同时刻的段每段差 1 秒
      }
    }
  }
  return results;
}
