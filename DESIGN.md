# Clipstash 设计规范

## 设计理念

**暖纸书卷风** — 参考 Hugo 主题 Warmpaper 的设计语言。将剪贴板收藏库视为个人阅览室，而非数据面板。页面应该像一本精心排版的书：白纸暖底、字体温润、余白宽裕、焦点清晰。

物理场景锚点：开发者在午后书桌前，台灯暖光，手边一杯咖啡，翻阅本周的收藏。这是一个需要沉静、专注感的工具。

## 色调

**策略**: Committed — 暖纸色系作为核心标识，赤陶色承担 30–40% 的表面积。

### 色盘

| 令牌 | 值 | 用途 |
|---|---|---|
| `--color-bg` | `#FAF9F7` | 页面背景（暖纸白） |
| `--color-surface` | `#FFFFFF` | 卡片、输入框表面 |
| `--color-surface-hover` | `#FDF8F4` | 悬停态暖色表面 |
| `--color-note-bg` | `#F0EBE3` | 备注、编辑器背景 |
| `--color-accent` | `#DA7756` | 主色调（赤陶/烧橙） |
| `--color-accent-hover` | `#C4684A` | 悬停加深 |
| `--color-text` | `#2D2B28` | 正文（暖棕黑，非纯黑） |
| `--color-text-secondary` | `#6B6560` | 次级文字 |
| `--color-text-tertiary` | `#9B9490` | 三级文字 / 占位符 |
| `--color-border` | `#E5E0D8` | 边框 |
| `--color-border-light` | `#EEEAE4` | 细分隔线 |
| `--color-danger` | `#A94442` | 错误 / 危险操作 |
| `--color-danger-bg` | `#FCF2F1` | 危险操作背景 |

### 状态色

| 用途 | 背景 | 文字 |
|---|---|---|
| GitHub 徽章 | `#FDF3EB` | `#B5651D` |
| URL 徽章 | `#EBF4EC` | `#3C763D` |
| 未读状态点 | `#DA7756` | — |
| 已读状态点 | `#8FBF8F` | — |
| 已归档状态点 | `#9B9490` | — |

### 禁忌

- 不使用 `#000` 或 `#fff`。最深的文字是暖棕 `#2D2B28`，最亮的表面是纸白 `#FAF9F7`。
- 不使用侧边条装饰（`border-left` / `border-right` 大于 1px 作为强调色条）。
- 不使用渐变文字。
- 不使用玻璃拟态（毛玻璃效果）。
- 不使用 hero-metric 模板（大数字 + 小标签统计卡片）。

## 背景纹理

页面背景使用四层 CSS 渐变模拟网格纸效果：

- 细网格线 `rgba(218, 119, 86, 0.06)` @ 24px × 24px
- 粗网格线 `rgba(218, 119, 86, 0.10)` @ 96px × 96px
- `background-attachment: fixed`，不随滚动偏移

## 版式

### 字体

| 用途 | 族 |
|---|---|
| 标题、正文 | `'LXGW WenKai GB', 'Georgia', 'Times New Roman', serif` |
| 界面文字（按钮、标签、输入框） | `'LXGW WenKai GB', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` |
| 等宽（URL、代码） | `'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace` |

霞鹜文楷 GB 通过 jsDelivr CDN 加载，三档字重：regular / medium / bold。

### 层级

| 层级 | 大小 | 字重 | 用途 |
|---|---|---|---|
| 页面标题 | 38px | 700 | 首页 H1 |
| 条目标题 | 20px | 700 | 卡片标题 |
| 副标题 | 17px | 400 | 页面副标题 |
| 日期分组标题 | 15px | 600 | 按天分组标签 |
| 正文控件 | 14px | 400 | 输入框、分页 |
| 元数据 | 13px | 400 | 卡片辅助信息 |
| 徽章 | 12px | 600 | 类型/标签徽章 |

响应式断点缩减：860px 时标题 30px，560px 时标题 26px、条目标题 17px。

## 尺寸与圆角

| 令牌 | 值 | 用途 |
|---|---|---|
| `--radius` | 8px | 卡片、按钮、输入框 |
| `--radius-lg` | 12px | 未使用（预留） |
| `--page-width` | 960px | 页面最大宽度 |

## 阴影

极轻纸感阴影，没有浮空感：

| 令牌 | 值 |
|---|---|
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)` |
| `--shadow-card-hover` | `0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03)` |

卡片悬停时上移 1px + 阴影加深，过渡时长 0.25s。

## 布局

### 页面结构

```
┌──────────────────────────────────────────┐
│  body (100vh, overflow: hidden)          │
│  ┌──────────────────────────────────────┐│
│  │ .page (flex column, 100% height)     ││
│  │ ┌──────────────────────────────────┐ ││
│  │ │ .page-header (flex-shrink: 0)    │ ││
│  │ │   eyebrow + h1 + subtitle        │ ││
│  │ │   inline stats                   │ ││
│  │ └──────────────────────────────────┘ ││
│  │ ┌──────────────────────────────────┐ ││
│  │ │ .toolbar (flex-shrink: 0)        │ ││
│  │ │   search | type | status | btn   │ ││
│  │ └──────────────────────────────────┘ ││
│  │ ┌──────────────────────────────────┐ ││
│  │ │ .list-wrapper (flex: 1, scroll)  │ ││
│  │ │   .error (条件)                  │ ││
│  │ │   .list                          │ ││
│  │ │     .date-header (分组模式)       │ ││
│  │ │     .item-card × N              │ ││
│  │ │     .empty (条件)                │ ││
│  │ └──────────────────────────────────┘ ││
│  │ ┌──────────────────────────────────┐ ││
│  │ │ .pager (flex-shrink: 0)          │ ││
│  │ └──────────────────────────────────┘ ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

关键规则：
- 仅 `.list-wrapper` 可滚动，头部和分页固定
- `min-height: 0` 确保 flex 子元素可收缩至内容高度以下（Firefox 兼容）
- 工具栏使用 CSS Grid，5 列：`1fr 140px 130px auto auto`

### 间距节奏

页面顶部留白 48px，移动端缩减为 28px。分页底部留白 32px。列表区域内卡片间距 16px。

## 组件

### 按钮

三种变体：

| 类 | 背景 | 文字 | 用途 |
|---|---|---|---|
| `.btn-primary` | `--color-accent` | `#fff` | 主要操作（打开、保存） |
| `.btn-ghost` | transparent | `--color-text-secondary` | 次要操作（状态切换、备注） |
| `.btn-danger-ghost` | transparent | `--color-text-tertiary` | 危险操作（删除），悬停变红 |

按钮过渡 0.2s，禁用态 opacity 0.5 + `not-allowed` 光标。

### 视图切换

工具栏右侧的双按钮组（平铺 / 按天），共用边框 + 中间分界线的紧凑布局。激活态填充赤陶色，白色文字。

### 条目卡片

- 白色表面 + 1px 暖灰边框 + 极轻阴影
- 8px 圆角
- 内容纵向排列：元数据行 → 标题 → URL → 标签 → 备注 → 操作栏
- 操作栏用顶部分隔线（`border-top`）与内容区隔
- 归档态 opacity 0.6
- 分组视图下，元数据行移除时间字段（已在日期头部体现）

### 日期头部

分组视图下的组间标签：加粗日期文字（今天 / 昨天 / 完整日期）+ 条目数徽章。首个头部无顶部留白。

### 类型徽章

- GitHub: 暖橙底色 + 棕文字
- URL: 暖绿底色 + 绿文字

### 状态指示

7px 圆形色点：未读 = 赤陶，已读 = 绿，已归档 = 灰。

### 标签

暖灰圆角小药丸，按逗号拆分为独立元素，带 `#` 前缀。

### 备注区

暖灰背景 + 1px 边框，白底 pre-wrap 保留换行。

### 编辑器

展开在卡片内部的就地编辑器，暖灰背景，聚焦时赤陶色光环。

### 分页器

居中排列：`← 上一页` | `1-50 / 124` | `下一页 →`。当前页码用 tabular-nums。悬停时暖色高亮。

### 空状态

白色卡片，居中排版，三级文字色。

## 动效

| 元素 | 属性 | 时长 | 缓动 |
|---|---|---|---|
| 链接 | color | 0.2s | ease |
| 按钮 | background, color, border-color | 0.2s | ease |
| 卡片悬停 | box-shadow, transform | 0.25s | ease |
| 输入框聚焦 | border-color, box-shadow | 0.2s | ease |

不使用弹跳、弹性缓动。不动画 CSS 布局属性。

## 响应式

| 断点 | 变化 |
|---|---|
| ≤ 860px | 工具栏变 2 列、标题缩至 30px |
| ≤ 560px | 工具栏全竖排、标题缩至 26px、卡片内边距缩小、页面左右留白减至 20px |

## 视图模式

支持两种显示模式，通过工具栏切换：

- **平铺** (`flat`)：按 `last_seen_at DESC` 排序的线性列表
- **按天** (`grouped`)：按 `first_seen_at` 日期分组，组间降序排列。日期标签使用相对时间（今天/昨天）或 `zh-CN` 完整日期格式。在分组模式下，卡片元数据行不重复显示时间信息

分组逻辑纯前端完成，无需后端改动。

## 字体加载

LXGW WenKai GB 通过 jsDelivr CDN 加载，位于 `web/index.html`：

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="...lxgwwenkaigb-regular/result.css">
<link rel="stylesheet" href="...lxgwwenkaigb-medium/result.css">
<link rel="stylesheet" href="...lxgwwenkaigb-bold/result.css">
```

回退栈：`Georgia` → `Times New Roman` → `serif`；无衬线以系统字体兜底。

## 执行摘要

- **灵感来源**: Hugo Warmpaper 主题 (gnux.cn)
- **物理场景**: 午后书桌，台灯暖光，安静阅览
- **色调策略**: Committed，暖纸 + 赤陶
- **主题**: 亮色（`color-scheme: light`）
- **核心差异化**: 网格纸纹理背景 + 霞鹜文楷衬线 + 极轻纸感阴影 + 固定头部/滚动列表布局
- **第一阶反类别检查**: 不是 "SaaS 蓝 + 白" 的工具面板，拒绝 hero-metric 模板
- **第二阶反类别检查**: 不是 "暗色终端风格" 或 "极简瑞士平面" 的已有范式
