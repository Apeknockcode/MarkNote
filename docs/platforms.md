# Marknote 平台支持说明

## 桌面端（Electron 原生支持）

| 平台 | 打包命令 | 产物 |
|------|----------|------|
| **macOS** | `npm run dist:mac` | `dist/Marknote-x.x.x.dmg`、`dist/Marknote-x.x.x-mac.zip` |
| **Windows x64（完整）** | `npm run dist:win` | `dist/Marknote-x.x.x-x64.exe`（安装包）、`dist/Marknote-x.x.x-x64.zip` |
| **Windows x64（便携 zip）** | `npm run dist:win:zip` | 仅 `dist/Marknote-x.x.x-x64.zip` |
| **macOS + Windows** | `npm run dist:desktop` | 以上全部（Windows 安装包需 x64 Windows 或 CI） |

### 打包环境建议

- **macOS 包**：在 Mac 上执行 `npm run dist:mac`
- **Windows 安装包（.exe）**：在 **Windows x64** 或 **GitHub Actions**（`windows-latest`）上执行 `npm run dist:win`
- **Windows 便携版（.zip）**：Apple Silicon Mac 可执行 `npm run dist:win:zip`（已关闭 `signAndEditExecutable`，exe 图标需在 Windows/CI 环境嵌入）
- 首次打包前执行：`npm install && npm run icons`

### Windows 用户数据目录

```
%APPDATA%\Marknote\history\
%APPDATA%\Marknote\draft-assets\
```

---

## iPad / Android 平板

**Marknote 基于 Electron，无法直接打包成 iOS / Android 原生应用。**

Electron 仅支持桌面操作系统：

- macOS
- Windows
- Linux（可自行添加 `linux` 配置）

若需要平板版本，需单独选型，例如：

| 方案 | 说明 | 工作量 |
|------|------|--------|
| **Capacitor** | 用现有 Vue 界面套壳，重写文件/历史 IPC | 大 |
| **PWA** | 浏览器安装，iOS 文件访问受限 | 中 |
| **Flutter / RN 重写** | 全新客户端 | 很大 |

当前仓库**未包含** iPad / Android 打包配置。若你确定要做平板版，建议新开 Capacitor 子项目，复用 `src/` 中的编辑器与 Markdown 逻辑。

---

## 常见问题

**Q: 能在 iPad 上安装 .dmg 吗？**  
A: 不能。`.dmg` 仅适用于 Mac。

**Q: Windows 安装包报毒？**  
A: 未签名的 Electron 应用可能被误报，需购买代码签名证书后配置 `win.certificateFile`。

**Q: 如何只打 zip 免安装版？**  
A: Windows zip 已包含在 `dist:win` 产物中；macOS zip 同理。
