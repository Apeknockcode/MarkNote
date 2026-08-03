# Marknote

本地 Markdown 桌面应用，免费、无激活、无账号。支持编辑、实时预览，以及**文档修改历史树**。

## 功能

- 打开 / 保存本地 `.md` 文件
- 三栏布局：历史树 · 编辑器 · 预览
- 每次保存自动记录版本，形成可分支的历史树
- 点击历史节点预览旧版本，可一键恢复
- 从旧版本恢复后再保存，会自动创建**分支**节点
- 从浏览器粘贴富文本（标题、列表、表格）自动转 Markdown
- 粘贴图片自动保存到本地 `.assets` 目录

## 开发运行

```bash
cd marknote
npm install
npm run dev
```

## 打包

| 命令 | 平台 |
|------|------|
| `npm run dist:mac` | macOS（`.dmg` / `.zip`） |
| `npm run dist:win` | Windows x64（`.exe` 安装包 + `.zip`，需在 Windows 或 GitHub Actions 上执行） |
| `npm run dist:win:zip` | Windows 便携版 `.zip`（Apple Silicon Mac 可交叉打包） |
| `npm run dist:desktop` | macOS + Windows 一次打包 |

产物在 `dist/` 目录。推送 `v*` 标签时，`.github/workflows/build-desktop.yml` 会在 GitHub Actions 上自动构建 macOS 与 Windows 安装包。

> **iPad / Android 平板**：Electron 无法直接打包为 iOS/Android 应用，详见 [docs/platforms.md](docs/platforms.md)。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| ⌘O / Ctrl+O | 打开文件 |
| ⌘S / Ctrl+S | 保存 |
| ⌘Z / Ctrl+Z | 撤销 |
| ⇧⌘Z / Ctrl+Y | 重做 |
| ⇧⌘B | 收起 / 展示侧边栏（macOS） |

## 历史数据存储

**macOS**

```
~/Library/Application Support/Marknote/history/
```

**Windows**

```
%APPDATA%\Marknote\history\
```

历史记录按**文件路径 + 物理文件身份**关联。从旧版（MD Notes / 墨记）升级时，历史数据会在 macOS 上自动迁移。
