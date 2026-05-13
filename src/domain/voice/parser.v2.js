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
} from "./dictionary.v2.js";
import { preprocess } from "./preprocess.js";

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
  desc = desc.replace(/^(?:今天|昨天|前天|今日)\s*/, "");
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
// 日期识别
// ─────────────────────────────────────────────────────────────────────────────

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
  let s = text;

  for (const sep of STRONG_SEPARATORS) s = s.split(sep).join("‖");

  s = s.replace(new RegExp(" 还(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");
  s = s.replace(new RegExp(" 又(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");
  s = s.replace(new RegExp(" 再(?=[" + VERBS_AFTER_HUAN + "])", "g"), "‖");

  s = s.replace(/[，,；;。、]+/g, "‖");

  const rawParts = s.split("‖").map((p) => p.trim()).filter(Boolean);
  if (rawParts.length <= 1) return [text.trim()];

  const parts = [];
  for (const p of rawParts) {
    if (/\d/.test(p)) parts.push(p);
    else if (parts.length > 0) parts[parts.length - 1] += " " + p;
    else parts.push(p);
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
  if (/打车|出租车|uber|taxi|滴滴|地铁|公交|公交车|火车|高铁|动车|飞机|机票|加油|油费|汽油|gasoline|petrol|停车|停车场|停车费|高速|过路费|过桥费|etc|维修|保养|换胎|机油|洗车|车票|汽车|租车|car ?rental|过户|车险|driving|驾驶/i.test(text)) return "车";
  if (/健身|瑜伽|游泳|羽毛球|网球|篮球|足球|乒乓球|跑步|骑行|滑雪|滑冰|球拍|球鞋|台球|桌球|斯诺克|球线|私教|健身房|gym|yoga|fitness|sport|workout|训练课|跑鞋|攀岩|拳击|马拉松/i.test(text)) return "运动";

  for (const kw of (VOICE_CAT_MAP["吃"] || [])) {
    if (lower.includes(kw.toLowerCase())) return "吃";
  }
  for (const kw of (VOICE_CAT_MAP["购物"] || [])) {
    if (lower.includes(kw.toLowerCase())) return "买";
  }
  const brands = Object.keys(BRAND_MAP).sort((a, b) => b.length - a.length);
  for (const brand of brands) {
    if (lower.includes(brand.toLowerCase())) {
      const v = BRAND_MAP[brand];
      if (v === "吃") return "吃";
      if (v === "购物") return "买";
    }
  }
  return "其他";
}

// ─────────────────────────────────────────────────────────────────────────────
// 顶层入口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @param {{defaultCurrency:"EUR"|"CNY", allowedCategoriesByType?:Object}} options
 * @returns {Array}
 */
export function parseVoiceText(text, options) {
  const { defaultCurrency, allowedCategoriesByType } = options || {};
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
