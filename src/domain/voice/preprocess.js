// domain/voice/preprocess.js —— v2 输入预处理
//
// 在 parser.v2.parseVoiceText 顶部调用，把非标准表达统一成规范文本。
// 三步：emoji → 文字 → 全角统一半角 → 静态错字纠正。
//
// 已剔除的方案（参考"新的解析规则.txt"）：
//   - 拼音映射：Web Speech API 输出已是中文；substring 替换易误伤
//                （如 "he" 出现在 "kebab"/"hello" 里）
//   - 编辑距离纠错：voice ASR 几乎不输出错字，ROI 极低

// ─────────────────────────────────────────────────────────────────────────────
// Emoji → 文字
// ─────────────────────────────────────────────────────────────────────────────

const EMOJI_MAP = {
  "🍚": "米饭",
  "🍔": "汉堡",
  "🍕": "披萨",
  "🍜": "面条",
  "🍿": "爆米花",
  "🥤": "奶茶",
  "🍺": "啤酒",
  "☕": "咖啡",
  "🚕": "打车",
  "🎬": "电影",
  "🎮": "游戏",
  "💊": "药品",
  "📚": "书籍",
};

function replaceEmoji(text) {
  let out = text;
  for (const [emoji, word] of Object.entries(EMOJI_MAP)) {
    if (out.includes(emoji)) out = out.split(emoji).join(word);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 全角 → 半角
// ─────────────────────────────────────────────────────────────────────────────
//
// 范围：
//   - 0xFF01–0xFF5E（全角 ASCII，含数字 / 字母 / 标点 / 加号 / 货币号）→ 减 0xFEE0
//   - 0x3000（全角空格） → ASCII 空格

function fullToHalf(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xFF01 && code <= 0xFF5E) {
      out += String.fromCharCode(code - 0xFEE0);
    } else if (code === 0x3000) {
      out += " ";
    } else {
      out += text[i];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 静态错字纠正
// ─────────────────────────────────────────────────────────────────────────────
//
// 只做映射表替换，不用编辑距离。新增条目原则：
//   - 高频且置信度 100%（同音/形近 + 实际类目稳定）
//   - 避免歧义（不要加 "马上" → "盒马" 这种）

const TYPO_MAP = {
  "五饭": "午饭",
  "充植": "充值",
  "麦单劳": "麦当劳",
  "河马": "盒马",
};

function correctTypo(text) {
  let out = text;
  for (const [wrong, right] of Object.entries(TYPO_MAP)) {
    if (out.includes(wrong)) out = out.split(wrong).join(right);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 顶层入口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {string}
 */
export function preprocess(text) {
  if (typeof text !== "string") return "";
  let out = text;
  out = replaceEmoji(out);
  out = fullToHalf(out);
  out = correctTypo(out);
  return out;
}
