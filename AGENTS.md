# Clipstash — 开发者指南

## 包管理

- 使用 **pnpm**（清单 `packageManager: pnpm@10.33.3`），不要用 `npm`。

## 关键命令

| 命令 | 作用 |
|---|---|
| `pnpm run start` | 构建前端 → 启动完整应用（剪贴板监听 + API 服务器） |
| `pnpm run start:server` | 仅启动 Hono API 服务器（端口 3879） |
| `pnpm run dev:web` | Vite 开发服务器（端口 5173，`/api` 代理到 3879） |
| `pnpm run build:web` | 构建前端到 `web/dist/` |
| `pnpm run list` | CLI：列出所有已收藏条目 |

- 端口通过环境变量 `CLIPSTASH_PORT` 覆盖，默认 **3879**。
- Vite 根目录在 `web/`，配置文件为 `web/vite.config.js`。
- 开发时需同时运行两个进程：`pnpm run start:server` + `pnpm run dev:web`。

## 架构

- **ESM 项目**（`"type": "module"`）。
- `src/main.js` — 主入口（剪贴板监听 + 内置服务器）。
- `src/server.js` — Hono API 服务器（CRUD + 静态文件）。
- `src/watcher.js` — 基于 `clipboardy` 轮询剪贴板，间隔 1 秒。
- `src/parser.js` — 解析剪贴板文本（GitHub URL/SSH、普通 URL）。
- `src/db.js` — SQLite 数据库操作，使用 **Node.js 内置 `node:sqlite`**（无需额外包）。
- `src/migration.js` — 数据库迁移系统（自动备份到 `data/backups/`）。
- `web/src/` — Vue 3 前端（Vite + 单文件组件）。

## 数据库

- 路径：`data/clipmark.db`（`data/` 在 `.gitignore` 中，首次启动自动创建）。
- 使用 WAL 模式，外键启用。
- 迁移前自动备份已有数据库到 `data/backups/`。

## 注意事项

- **无测试框架、无 lint、无 typecheck** 配置。package.json 中没有任何相关脚本。
- `src/notify.js` 使用 `node-notifier` 发送桌面通知（文件名为 `notify.js`）。
- 仅有一个迁移（v1: 创建 items 表），后续迁移模板在 `migration.js:357-376`。
