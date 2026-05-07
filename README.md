# 账本 PWA · 项目根目录

个人记账 PWA。原始单文件 HTML，正在做模块化架构重构（渐进迁移中）。

## 目录速览

| 路径 | 说明 |
|---|---|
| `index.html` | 应用主入口。当前是双轨：内联 `<script>` 与模块化 `src/main.js` 共存。 |
| `src/` | 模块化源码（33 个 ES Modules）。架构说明见 `src/ARCHITECTURE.md`。 |
| `styles/` | CSS：`base.css` + `themes.css` + `components.css`。 |
| `docs/` | 项目文档：原始设计、Supabase 配置、UI 风格、主题颜色。 |
| `data-imports/` | 历史交易 CSV（鲨鱼记账导出，4 份）。可通过设置页"导入交易"功能加载。 |
| `backups/` | 重构期间的 8 份历史 HTML 全量备份。 |
| `archive/` | 早期归档：React 设计稿 zip、过期的批次指令。 |
| `_TO-DELETE/` | **请手动删除此目录**——sandbox 没权限直接 `rm`。 |
| `SESSION-NOTES.md` | 当前会话的进度总结 + 下一步 TODO（开新 session 必读）。 |

## 怎么开发

1. 装 Cursor 的 **Live Server** 插件（搜 "Live Server"，作者 Ritwick Dey）
2. 右键 `index.html` → **Open with Live Server**
3. 浏览器打开 `http://127.0.0.1:5500/.../index.html`

⚠️ **不能双击打开 `file://`**——ES Modules 受 CORS 限制只能从 http 加载。

## 开新 session 时第一句话怎么说

> 先看 `SESSION-NOTES.md` 和 `src/ARCHITECTURE.md`，了解当前架构和下一步要做什么。然后帮我继续推进 [具体迁移目标]。

或者直接：

> 继续推进 renderSettings 的模块化迁移。
