# Clipstash

![Clipstash Logo](./icon/logo.png)

从剪贴板自动收藏值得回看的链接。支持服务端/客户端分离部署，Token 鉴权，WebUI 管理。

---

## 功能特点

- **剪贴板监听**：自动捕获 GitHub 仓库和普通 URL 链接
- **Server/Client 分离**：服务端集中存储，客户端监听各自剪贴板并推送
- **Token 鉴权**：Bearer Token 认证，WebUI 管理用户和令牌
- **本地数据库**：服务端使用 SQLite 存储收藏内容和状态
- **状态管理**：未读、已读、归档，帮助整理收藏
- **去重**：自动识别重复链接，合并 `seen_count`
- **Web UI**：登录 → 查看、搜索、标记、编辑备注和标签
- **迁移机制**：数据库结构升级安全，历史数据不丢失

---

## 安装

```bash
git clone https://github.com/<your-username>/clipstash.git
cd clipstash
pnpm install
pnpm run build
```

---

## CLI 命令

```
clipstash server   [--port <port>]                     启动 API 服务端 + WebUI
clipstash client   [--server <url>] [--token <tok>]    启动剪贴板监听客户端
clipstash list     [--server <url>] [--token <tok>]    列出收藏条目
clipstash admin    <subcommand>                        管理用户和令牌
```

### 通用选项

| 选项 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `--port, -p` | `CLIPSTASH_PORT` | `3879` | 服务端端口 |
| `--server, -s` | `CLIPSTASH_SERVER_URL` | `http://127.0.0.1:3879` | 服务端地址 |
| `--token, -t` | `CLIPSTASH_TOKEN` | - | 认证令牌 |
| `--no-notify` | - | `false` | 禁用桌面通知（仅 client 模式） |
| `--help, -h` | - | - | 显示帮助 |

---

## 使用方式

### 1. 启动服务端

```bash
# 开发模式
pnpm run start:server

# 构建后运行
pnpm run build
node dist/cli.js server

# 自定义端口
node dist/cli.js server --port 3000
```

首次启动会打印管理员凭据：

```
=== 首次启动 — 管理员凭据 ===
用户名: admin
密码:   xxxxxxxxxxxxxxxx
令牌:   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
请立即登录 WebUI 修改密码！
==============================
```

访问 `http://localhost:3879` 打开 WebUI，用管理员凭据登录。

### 2. 启动客户端

客户端监听本机剪贴板，将解析到的链接推送到服务端：

```bash
# 使用环境变量
$env:CLIPSTASH_SERVER_URL = "http://192.168.1.100:3879"
$env:CLIPSTASH_TOKEN = "your-token-here"
node dist/cli.js client

# 使用命令行参数
node dist/cli.js client --server http://192.168.1.100:3879 --token your-token-here

# 禁用桌面通知
node dist/cli.js client --no-notify
```

### 3. 查看收藏

```bash
# 本地数据库
pnpm run list

# 远程服务端
node dist/cli.js list --server http://192.168.1.100:3879 --token your-token-here
```

### 4. 管理用户和令牌

```bash
# 列出所有用户和令牌（掩码显示）
node dist/cli.js admin list

# 重置用户密码
node dist/cli.js admin reset admin

# 为用户生成新令牌
node dist/cli.js admin token admin my-client
```

---

## WebUI 管理

登录后可以：

- **浏览收藏**：平铺/按天分组，搜索、筛选类型和状态
- **标记状态**：未读 → 已读 → 归档
- **编辑条目**：添加标签和备注
- **管理面板**（管理员可见）：
  - 创建/删除用户
  - 生成/复制/删除 API 令牌（用于客户端连接）

---

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm run build         # 前端 + tsdown 打包

# 类型检查
pnpm run type-check

# 运行测试
pnpm run test

# 开发模式（需同时运行两个终端）
pnpm run start:server  # API 服务 (端口 3879)
pnpm run dev:web       # Vite 前端 (端口 5173，/api 代理到 3879)
```

---

## 项目结构

```
├── src/
│   ├── cli.ts           # CLI 入口 (server / client / list)
│   ├── server.ts        # Hono API + 静态文件
│   ├── client.ts        # 客户端剪贴板推送
│   ├── watcher.ts       # 剪贴板轮询
│   ├── parser.ts        # URL / GitHub 解析
│   ├── db.ts            # SQLite 数据库操作
│   ├── migration.ts     # 数据库迁移
│   ├── auth.ts          # 鉴权（密码哈希、Token、中间件）
│   ├── notify.ts        # 桌面通知
│   └── types.ts         # 共享类型
├── web/
│   └── src/             # Vue 3 前端
│       ├── App.vue      # 主页面
│       ├── Login.vue     # 登录页
│       ├── AdminPanel.vue # 管理面板
│       ├── api.ts       # API 客户端
│       └── auth.ts      # 前端 Token 管理
├── data/                # 运行时数据（自动创建）
│   └── clipmark.db      # SQLite 数据库
├── dist/                # tsdown 构建产物
├── web/dist/            # Vite 前端构建产物
├── tsdown.config.ts     # tsdown 构建配置
└── vitest.config.ts     # vitest 测试配置
```

---

## API 端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `GET` | `/api/health` | 否 | 健康检查 |
| `POST` | `/api/auth/login` | 否 | 登录获取 Token |
| `GET` | `/api/auth/me` | 是 | 当前用户信息 |
| `POST` | `/api/auth/change-password` | 是 | 修改密码 |
| `GET` | `/api/stats` | 是 | 统计数据 |
| `GET` | `/api/items` | 是 | 列出条目（支持分页/筛选） |
| `POST` | `/api/items` | 是 | 客户端推送条目 |
| `GET` | `/api/items/:id` | 是 | 获取单个条目 |
| `PATCH` | `/api/items/:id` | 是 | 更新条目 |
| `DELETE` | `/api/items/:id` | 是 | 删除条目 |
| `GET` | `/api/users` | 是(admin) | 用户列表 |
| `POST` | `/api/users` | 是(admin) | 创建用户 |
| `DELETE` | `/api/users/:id` | 是(admin) | 删除用户 |
| `GET` | `/api/tokens` | 是 | 令牌列表 |
| `POST` | `/api/tokens` | 是 | 生成令牌 |
| `DELETE` | `/api/tokens/:id` | 是 | 删除令牌 |

---

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `CLIPSTASH_PORT` | 服务端端口 | `3879` |
| `CLIPSTASH_SERVER_URL` | 客户端连接地址 | `http://127.0.0.1:3879` |
| `CLIPSTASH_TOKEN` | 客户端认证令牌 | - |
| `CLIPSTASH_CORS_ORIGIN` | 额外 CORS 允许域 | - |
