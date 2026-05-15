# Clipstash

![Clipstash Logo](./icon/logo.png)

Clipstash 是一个本地剪贴板收藏工具，可以自动捕获你复制过的 GitHub 仓库、博客文章和有价值链接，支持本地管理、标记状态、归档，并可导出到 Obsidian 或 Markdown 笔记。

---

## 功能特点

- **剪贴板监听**：自动捕获 GitHub 仓库和普通 URL 链接。
- **本地数据库**：使用 SQLite 存储收藏内容和状态。
- **状态管理**：未读、已读、归档等状态，帮助整理收藏。
- **去重**：自动识别重复链接，合并 `seen_count`。
- **Web UI**：本地 Web 界面查看、搜索、打开、编辑备注和标签。
- **迁移机制**：数据库结构升级安全，历史数据不会丢失。
- **Obsidian 支持**：可将收藏导出为 Markdown，便于知识管理。

---

## 安装

```bash
git clone https://github.com/<your-username>/clipstash.git
cd clipstash
npm install
```

## 运行

### 启动剪贴板监听

```bash
npm run start
```

### 启动 Web UI

开发模式：
```bash
npm run start:server    # Hono API
npm run dev:web         # Vue 3 前端
```

访问: `http://localhost:5173`

生产模式：

```bash
npm run build:web
npm run start
```

