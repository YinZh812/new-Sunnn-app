// domain/voice/config.js —— 一句话解析器版本开关
//
// 单点开关：parser.active.js 读这个常量决定走 v1 还是 v2。
//   - false：使用 parser.js + dictionary.js（线上现状，零风险）
//   - true ：使用 parser.v2.js + dictionary.v2.js（新规则，含预处理 / 中文数字 / 时间扩展等）
//
// 验证 v2：浏览器控制台执行 runVoiceTestsV2()，不需要打开开关就能跑回归。
// 切换流程：本地改成 true → 跑 runVoiceTestsV2 + 手机测一遍 → 提交 → push。

export const USE_VOICE_V2 = false;
