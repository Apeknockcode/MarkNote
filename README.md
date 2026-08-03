# Marknote

本地 Markdown 桌面编辑器。免费、无激活、无账号，文件保存在你的电脑上。

核心能力：**编辑 · 实时预览 · 文档修改历史树**。每次保存自动留档，可预览旧版本、一键恢复，恢复后再保存会自动生成分支。

---

## 功能概览

### 文档与布局

- 打开 / 保存本地 `.md`、`.markdown`、`.txt` 文件
- **拖拽** Markdown 文件到窗口即可打开
- 三栏布局：**历史树** · **编辑器** · **实时预览**
- 编辑区与预览区滚动同步
- 未保存时标题栏显示 `•` 标记

### 版本历史

- 每次 **保存** 自动写入一个历史节点（带时间标签）
- 左侧历史树展示线性/分支结构，点击节点可**预览**旧内容
- 支持 **恢复到** 任意历史版本；恢复后再保存会创建**分支**节点
- 历史按「文件路径 + 物理文件身份（inode）」关联，重命名/移动后仍可追踪同一文件

### 编辑与粘贴

- 右键菜单：段落格式、粗体/斜体/链接、插入表格/代码块/脚注等
- **智能粘贴**：从浏览器、Word、Excel、Notion 粘贴富文本，自动转为 Markdown
- 粘贴图片自动下载并保存到本地资源目录（见下方「数据存储」）
- Markdown 写作快捷键：列表续行、标题级别、链接/脚注跳转等（见快捷键表）

### 其他

- 自定义撤销/重做栈（与系统剪贴板粘贴协同）
- macOS 无边框标题栏；Windows 自动隐藏菜单栏
- 从旧版 **MD Notes / 墨记** 升级时，macOS 上历史数据自动迁移

---

## 快速开始（用户）

从 [Releases](https://github.com/your-org/marknote/releases) 下载对应平台安装包（自行替换为实际仓库地址），或本地打包后使用 `dist/` 中的产物：

| 平台 | 文件 |
|------|------|
| macOS | `Marknote-x.x.x.dmg` 或 `-mac.zip` |
| Windows | `Marknote-x.x.x-x64.exe` 或 `-x64.zip`（便携版） |

---

## 开发

### 环境要求

- **Node.js** 18+（推荐 20）
- **macOS** 打包图标需系统自带 `sips`；`npm run icons` 会通过 npx 拉取 `@resvg/resvg-js-cli`

### 安装与运行

```bash
git clone <repo-url> md-notes
cd md-notes
npm install
npm run dev
```

### 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（Electron + 热更新） |
| `npm run build` | 构建渲染进程与主进程到 `out/` |
| `npm run preview` | 预览构建结果 |
| `npm run icons` | 从 `build/icon.svg` 生成 icns / ico / png |
| `npm run dist:mac` | 打包 macOS（dmg + zip） |
| `npm run dist:win` | 打包 Windows 安装包 + zip（需 Windows 或 CI） |
| `npm run dist:win:zip` | 仅 Windows 便携 zip（Apple Silicon Mac 可交叉打包） |
| `npm run dist:desktop` | macOS + Windows 一次打包 |

首次打包前请执行：`npm install && npm run icons`。

推送 `v*` 标签时，[`.github/workflows/build-desktop.yml`](.github/workflows/build-desktop.yml) 会在 GitHub Actions 上自动构建 macOS 与 Windows 安装包。

> **iPad / Android**：Electron 无法直接打包为移动应用，详见 [docs/platforms.md](docs/platforms.md)。

---

## 快捷键

macOS 以 `⌘` 为例，Windows / Linux 将 `⌘` 换为 `Ctrl`。

### 文件与界面

| 快捷键 | 功能 |
|--------|------|
| ⌘O | 打开文件 |
| ⌘S | 保存（并写入历史版本） |
| ⇧⌘B | 收起 / 展示侧边栏 |

### 编辑

| 快捷键 | 功能 |
|--------|------|
| ⌘Z | 撤销 |
| ⇧⌘Z / ⌘Y | 重做 |
| ⌘B | 粗体 |
| ⌘I | 斜体 |
| ⌘V | 粘贴（富文本智能转 Markdown；纯文本/图片亦支持） |

### Markdown 结构

| 快捷键 | 功能 |
|--------|------|
| ⌘1 – ⌘6 | 标题 1–6 级（再按同级取消） |
| ⌘0 | 转为正文段落 |
| ⇧⌘= | 插入 Setext 一级标题下划线（`===`） |
| ⇧⌘- | 插入 Setext 二级标题下划线（`---`） |
| ⌥⌘1 | Setext 标题转为 ATX `#` 标题 |
| Enter | 列表 / 引用 / 任务项自动续行；空项退出列表 |
| Tab / ⇧Tab | 空列表项缩进 / 反缩进（无序列表在 `*` `-` `+` 间轮换） |

### 链接与脚注

| 快捷键 | 功能 |
|--------|------|
| F12 / ⇧⌘D | 引用与定义之间跳转 |
| ⇧⌘F | 整理脚注到文末 |

编辑器内 **右键** 可访问段落、格式、插入及上述部分功能。

---

## 数据存储

### 历史记录

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/Marknote/history/` |
| Windows | `%APPDATA%\Marknote\history\` |

每个已保存文件对应一个 JSON（按路径哈希命名），内含完整版本树。

### 图片与资源

| 场景 | 存储位置 | Markdown 中的引用 |
|------|----------|-------------------|
| 已保存文档 | 与 `.md` 同级的 `文档名.assets/` | `./文档名.assets/image-xxx.png` |
| 未保存文档 | `用户数据/draft-assets/` | `./draft-assets/image-xxx.png` |

预览时本地图片以 Base64 内联显示，避免开发模式下 `file://` 被拦截。

### 界面偏好

侧边栏展开状态等写入 `localStorage`（键名见 `src/lib/prefs.ts`）。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 34 |
| 构建 | electron-vite + Vite 5 |
| 界面 | Vue 3 + TypeScript |
| 渲染 | markdown-it（GFM 风格） |
| 粘贴转换 | Turndown + turndown-plugin-gfm |
| 打包 | electron-builder |

---

## 项目结构

```
md-notes/
├── electron/           # 主进程：文件 IO、历史持久化、图片保存
├── src/
│   ├── App.vue         # 主界面、粘贴、快捷键
│   ├── components/     # HistoryTree、ContextMenu
│   ├── composables/    # 撤销栈、滚动同步、Markdown 快捷键
│   └── lib/
│       ├── markdown/   # 行解析、列表/标题/引用键盘逻辑
│       ├── html-to-markdown.ts
│       └── history.ts
├── build/              # 图标源文件
├── scripts/            # generate-icons.sh
├── docs/platforms.md   # 多平台打包说明
└── dist/               # 打包产物（git 忽略）
```

---

## 常见问题

**Q: 保存后历史树没有更新？**  
A: 历史仅在 **保存** 时写入；仅编辑不保存不会产生新版本。

**Q: 从 Word / 网页粘贴表格格式乱了？**  
A: 复杂合并单元格、嵌套结构可能需要手动微调；简单表格与列表一般可自动转换。

**Q: Windows 安装包被杀软拦截？**  
A: 未签名 Electron 应用可能被误报；正式发布建议配置代码签名，见 [docs/platforms.md](docs/platforms.md)。

**Q: 能在 iPad 上安装 .dmg 吗？**  
A: 不能；`.dmg` 仅适用于 macOS。

---

## 相关文档

- [多平台打包与平板说明](docs/platforms.md)
