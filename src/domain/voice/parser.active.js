// domain/voice/parser.active.js —— 当前生效的解析器
//
// 所有调用方（main.js、ui/modals/input.js）都应该从这里 import parseVoiceText，
// 而不是直接 import parser.js 或 parser.v2.js。
// 切换 v1/v2 只需要改 config.js 里的 USE_VOICE_V2。

import { USE_VOICE_V2 } from "./config.js";
import { parseVoiceText as parseV1 } from "./parser.js";
import { parseVoiceText as parseV2 } from "./parser.v2.js";

export const parseVoiceText = USE_VOICE_V2 ? parseV2 : parseV1;
