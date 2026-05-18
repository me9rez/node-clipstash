# Clipstash 架构文档

## 概述

Clipstash 是一个剪贴板收藏工具，采用 **Server/Client 分离架构**。服务端提供 REST API + WebUI 集中存储，客户端监听剪贴板并通过 API 推送链接。使用 Token 鉴权保障通信安全。

---

## 架构图

```
┌─ Server 端 ───────────────────────────────────────┐
│                                                    │
│  clipstash server [--port <n>]                     │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │              Hono API (Port 3879)             │  │
│  │                                              │  │
│  │  ┌─────────────┐  ┌──────────────────────┐   │  │
│  │  │ Auth 中间件  │  │   静态文件服务        │   │  │
│  │  │ (Bearer)    │  │   (web/dist/)         │   │  │
│  │  └──────┬──────┘  └──────────┬───────────┘   │  │
│  │         │                    │                │  │
│  │  ┌──────┴───────────────────┴────────────┐   │  │
│  │  │              路由层                    │   │  │
│  │  │  /api/health    /api/auth/*           │   │  │
│  │  │  /api/items/*   /api/users/*          │   │  │
│  │  │  /api/tokens/*  /api/stats            │   │  │
│  │  └──────────────────┬────────────────────┘   │  │
│  └─────────────────────┼────────────────────────┘  │
│                        │                            │
│  ┌─────────────────────┼────────────────────────┐  │
│  │              数据库层 (db.ts)                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │  │
│  │  │  items   │  │  users   │  │api_tokens │  │  │
│  │  └──────────┘  └──────────┘  └───────────┘  │  │
│  │            SQLite (data/clipmark.db)          │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │           前端 (Vue 3 SPA)                    │  │
│  │  Login.vue → App.vue → AdminPanel.vue        │  │
│  │  auth.ts (localStorage Token 管理)            │  │
│  │  api.ts (fetch + Authorization header)        │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
                       ▲
                       │ HTTPS (Bearer Token)
                       │
┌─ Client 端 ───────────────────────────────────────┐
│                                                    │
│  clipstash client [--server] [--token]             │
│                                                    │
│  ┌──────────────┐     ┌───────────────────────┐   │
│  │ 剪贴板监听    │ ──▶ │     parser.ts          │   │
│  │ clipboardy   │     │  URL / GitHub 解析     │   │
│  │ (1s 轮询)    │     └───────────┬───────────┘   │
│  └──────────────┘                 │                │
│                                   ▼                │
│  ┌────────────────────────────────────────────┐   │
│  │              client.ts                      │   │
│  │  POST /api/items → Server                  │   │
│  │  GET  /api/items → list (远程查询)          │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  ┌──────────────┐                                 │
│  │ 通知 (notify) │  成功/失败 → 桌面通知           │
│  └──────────────┘                                 │
└────────────────────────────────────────────────────┘
```

---

## 模块详解

### 入口与 CLI (`src/cli.ts`)

```
clipstash server    → startServer()
clipstash client    → startClient()
clipstash list      → listItems() / listRemoteItems()
clipstash admin     → listUsers() / reset / token
```

解析工具：`type-flag`，支持 `--port` / `--server` / `--token` / `--no-notify` 及环境变量回退。

### 服务端 (`src/server.ts`)

**核心职责**：提供 REST API + 托管 WebUI 静态文件。

- `createApp()` — 创建 Hono 应用实例，配置 CORS、路由、中间件
- `startServer(port?)` — 启动 HTTP 监听，bootstrap 管理员
- `bootstrapCheck()` — 无用户时创建 admin 用户并打印凭据

**中间件链路**：
```
authMiddleware → requireAdmin → Handler
     │               │
     │ 验证 Bearer    │ 检查 is_admin
     │ 查询 api_tokens│ 返回 403
     │ 注入 userId    │
     │ 返回 401       │
```

**鉴权白名单**：`/api/health`、`POST /api/auth/login`

### 客户端 (`src/client.ts`)

- `startClient({ serverUrl, token, notify })` — 验证连接 → 验证 token → 启动剪贴板监听
- `listRemoteItems({ serverUrl, token })` — 远程查询收藏列表

**数据流**：
```
clipboard → watcher (1s) → parser → POST /api/items → 通知
```

客户端无本地数据库，纯推送模式。

### 剪贴板监听 (`src/watcher.ts`)

- 使用 `clipboardy` 每 1 秒轮询
- `lastText` 去重（避免同内容重复处理）
- `busy` 标志防重入
- 接受 `onItem` 回调（解耦 DB 操作）

### 解析器 (`src/parser.ts`)

```
输入文本
  ├─ git@github.com:owner/repo.git → GitHub SSH
  ├─ 正则提取 URL → new URL() 验证
  │   ├─ github.com → parseGitHubRepoUrl()
  │   │   ├─ 2+ 路径段 → github-repo
  │   │   └─ 忽略页 (/explore, /features...) → url
  │   └─ 其他域名 → url
  └─ 无匹配 → null
```

### 鉴权模块 (`src/auth.ts`)

| 函数 | 说明 |
|---|---|
| `hashPassword(password)` | scrypt + 16 字节盐 → `salt:hash` |
| `verifyPassword(password, stored)` | timingSafeEqual 防时序攻击 |
| `generateToken()` | crypto.randomBytes(32) → 64 字符 hex |
| `authMiddleware` | Hono 中间件，验证 Bearer token |
| `requireAdmin` | Hono 中间件，检查 is_admin |

### 数据库层 (`src/db.ts`)

**引擎**：Node.js 内置 `node:sqlite` (DatabaseSync)，WAL 模式 + foreign_keys。

**核心方法**：

| 分类 | 方法 |
|---|---|
| 初始化 | `initDb()`, `getDb()` |
| Items CRUD | `saveItem()`, `listItems()`, `getItemById()`, `updateItem()`, `deleteItem()`, `getStats()` |
| 用户管理 | `hasUsers()`, `createUser()`, `findUserByUsername()`, `findUserById()`, `findUserByToken()`, `listUsers()`, `deleteUser()`, `updateUserPassword()` |
| 令牌管理 | `createApiToken()`, `listApiTokens()`, `deleteApiToken()` |

### 迁移系统 (`src/migration.ts`)

- 版本化迁移表：`schema_migrations`
- 事务执行：`BEGIN IMMEDIATE → up() → 记录版本 → COMMIT`
- 自动备份：迁移前复制 `.db` / `-wal` / `-shm` 到 `data/backups/`
- 幂等检测：已应用的迁移跳过

| 版本 | 名称 | 说明 |
|---|---|---|
| v1 | `create_initial_items_table` | items 表 + 列补齐 + 回填 + 去重 + 索引 |
| v2 | `create_users_and_tokens_tables` | users + api_tokens 表 |

---

## 数据库 Schema

### items

| 列 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `id` | INTEGER PK AUTO | - | 主键 |
| `type` | TEXT NOT NULL | `'url'` | `github-repo` \| `url` |
| `title` | TEXT | NULL | 条目标题 |
| `url` | TEXT NOT NULL | - | URL（唯一索引） |
| `host` | TEXT | NULL | 主机名 |
| `owner` | TEXT | NULL | GitHub owner |
| `repo` | TEXT | NULL | GitHub 仓库名 |
| `status` | TEXT NOT NULL | `'unread'` | `unread` \| `read` \| `archived` |
| `tags` | TEXT | NULL | 逗号分隔 |
| `note` | TEXT | NULL | 用户备注 |
| `first_seen_at` | TEXT | NULL | ISO 时间戳 |
| `last_seen_at` | TEXT | NULL | ISO 时间戳 |
| `seen_count` | INTEGER NOT NULL | `1` | 去重计数 |

**索引**：`UNIQUE(url)`, `type`, `host`, `status`, `last_seen_at`

### users

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK AUTO | 主键 |
| `username` | TEXT NOT NULL UNIQUE | 用户名 |
| `password_hash` | TEXT NOT NULL | scrypt 哈希 (salt:hash) |
| `is_admin` | INTEGER NOT NULL DEFAULT 0 | 管理员标志 |
| `created_at` | TEXT NOT NULL | ISO 时间戳 |

### api_tokens

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK AUTO | 主键 |
| `user_id` | INTEGER NOT NULL FK | 关联 users(id)，级联删除 |
| `token` | TEXT NOT NULL UNIQUE | 64 字符 hex |
| `name` | TEXT NOT NULL | 令牌描述 |
| `created_at` | TEXT NOT NULL | ISO 时间戳 |

**索引**：`token`, `user_id`

### schema_migrations

| 列 | 类型 | 说明 |
|---|---|---|
| `version` | INTEGER PK | 迁移版本号 |
| `name` | TEXT NOT NULL | 迁移名称 |
| `applied_at` | TEXT NOT NULL | 应用时间 |

---

## 前端架构 (`web/src/`)

### 组件树

```
main.ts
  └─ App.vue (根组件)
       ├─ [未登录] Login.vue
       └─ [已登录]
            ├─ nav-bar (导航栏)
            │    ├─ 用户名
            │    ├─ [admin] 管理按钮 → AdminPanel.vue
            │    └─ 退出按钮
            ├─ page-header (统计头部)
            ├─ toolbar (搜索/筛选/刷新)
            ├─ list (条目列表)
            │    ├─ 平铺视图
            │    └─ 按天分组视图
            ├─ pager (分页)
            └─ AdminPanel.vue (管理弹窗)
                 ├─ 用户管理 (创建/删除)
                 └─ 令牌管理 (生成/复制/删除)
```

### 数据流

```
localStorage (token)
    │
    ├─ auth.ts: getToken() / setToken() / clearAuth()
    │
    └─ api.ts: request() 自动附加 Authorization header
         │
         ├─ login() → POST /api/auth/login
         ├─ fetchMe() → GET /api/auth/me
         ├─ fetchItems() → GET /api/items
         ├─ updateItem() → PATCH /api/items/:id
         └─ ... (users, tokens CRUD)
```

---

## 构建流水线

```
源码                      构建工具              产物
─────────────────────────────────────────────────────
src/*.ts          →  tsdown (Rolldown)  →  dist/cli.js
                                          dist/cli.d.ts

web/src/*.{vue,ts} →  Vite              →  web/dist/
                      @vitejs/plugin-vue    index.html
                                            assets/*.js
                                            assets/*.css
```

### tsdown 配置 (`tsdown.config.ts`)

| 选项 | 值 | 说明 |
|---|---|---|
| `entry` | `['src/cli.ts']` | 入口文件 |
| `format` | `['esm']` | ESM 输出 |
| `target` | `'node22'` | 目标 Node.js 版本 |
| `platform` | `'node'` | Node.js 平台 |
| `shims` | `true` | ESM/CJS 兼容垫片 |
| `dts` | `true` | 生成类型声明 |
| `clean` | `true` | 构建前清空 dist/ |
| `outExtensions` | `() => ({ js: '.js' })` | 输出 `.js` 扩展名 |
| `deps.neverBundle` | `['clipboardy', 'node-notifier']` | 外部化原生模块 |

### package.json 发布字段

```json
{
  "bin": { "clipstash": "./dist/cli.js" },
  "files": ["dist/", "web/dist/"]
}
```

---

## 鉴权流程

### WebUI 登录

```
用户打开 WebUI
    │
    ├─ localStorage 有 token？
    │   ├─ 是 → GET /api/auth/me
    │   │   ├─ 成功 → 进入主界面
    │   │   └─ 失败 → 清除 token，显示登录页
    │   └─ 否 → 显示登录页
    │
    └─ 登录页
        └─ POST /api/auth/login { username, password }
            ├─ 成功 → 存 token 到 localStorage → 进入主界面
            └─ 失败 → 显示错误
```

### Client 连接

```
clipstash client --server <url> --token <tok>
    │
    ├─ GET /api/health → 验证服务可用
    ├─ GET /api/auth/me → 验证 token 有效
    └─ 启动剪贴板监听
        └─ 每次解析到链接 → POST /api/items (Bearer token)
```

### 首次启动 Bootstrap

```
服务端启动 → hasUsers() === false
    │
    ├─ 创建 admin 用户（随机密码）
    ├─ 生成 admin token
    └─ 打印凭据到控制台
```

---

## 目录结构

```
node-clipstash/
├── src/                          # 服务端 + CLI 源码
│   ├── cli.ts                    # CLI 入口 (server/client/list)
│   ├── server.ts                 # Hono API + 静态文件 + Bootstrap
│   ├── client.ts                 # 远程客户端（剪贴板推送）
│   ├── watcher.ts                # 剪贴板轮询（接受 onItem 回调）
│   ├── parser.ts                 # URL / GitHub SSH 解析
│   ├── db.ts                     # SQLite CRUD（items + users + tokens）
│   ├── migration.ts              # 数据库迁移系统
│   ├── auth.ts                   # 鉴权（密码哈希、Token、中间件）
│   ├── notify.ts                 # 桌面通知
│   ├── types.ts                  # 共享类型定义
│   ├── main.ts                   # 兼容入口（直接启动服务端）
│   ├── auth.test.ts              # 鉴权单元测试
│   └── parser.test.ts            # 解析器单元测试
├── web/                          # Vue 3 前端
│   ├── index.html                # HTML 入口
│   ├── vite.config.js            # Vite 构建配置
│   └── src/
│       ├── main.ts               # Vue 应用入口
│       ├── App.vue               # 根组件（登录 → 主界面）
│       ├── Login.vue             # 登录页面
│       ├── AdminPanel.vue        # 管理面板（用户 + 令牌）
│       ├── api.ts                # API 客户端（自动附加 Token）
│       ├── auth.ts               # 前端 Token 管理
│       ├── style.css             # 全局样式
│       └── env.d.ts              # TypeScript 环境声明
├── data/                         # 运行时数据（gitignore）
│   ├── clipmark.db               # SQLite 数据库
│   └── backups/                  # 迁移前备份
├── dist/                         # tsdown 构建产物
├── web/dist/                     # Vite 前端构建产物
├── tsdown.config.ts              # tsdown 构建配置
├── vitest.config.ts              # vitest 测试配置
├── tsconfig.json                 # TypeScript 配置
├── package.json                  # 包配置 + 脚本
├── README.md                     # 使用说明
└── docs/
    └── ARCHITECTURE.md           # 本文档
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js 22+ |
| 语言 | TypeScript (ESM, verbatimModuleSyntax) |
| HTTP 框架 | Hono 4.x |
| HTTP 服务 | @hono/node-server |
| 数据库 | node:sqlite (内置 DatabaseSync) |
| 前端 | Vue 3 + Vite |
| 构建 | tsdown (Rolldown) + Vite |
| 测试 | vitest |
| CLI 解析 | type-flag |
| 剪贴板 | clipboardy |
| 通知 | node-notifier |
| 包管理 | pnpm |
