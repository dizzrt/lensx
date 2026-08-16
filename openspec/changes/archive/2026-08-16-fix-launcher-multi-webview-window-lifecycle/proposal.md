## Why

当前 Launcher 在 ConfigLens Child WebView 存在时仍通过单 WebViewWindow 抽象解析 `main` 原生窗口，导致关闭插件页后 Home 保留 600px page 高度，并导致 macOS `Cmd+W` 先隐藏插件内容、随后无法隐藏主窗口而留下空白页。稳定规格已经要求 Home 恢复、可恢复 hide 以及 Host/Child WebView 原子协调，因此需要修复 native multi-webview 组合下的实现和回归证据。

## What Changes

- 让 Launcher 的原生尺寸、可见性、显示、隐藏、聚焦、窗口事件和对话框父窗口操作在 Child WebView 已附加时仍解析同一个 `main` 原生窗口。
- 保持 Host WebView 与 Child WebView 的身份和事件目标分离；Launcher 激活事件只定向到受信任 Host WebView，不因修复原生窗口解析而广播给插件。
- 将 Launcher hide/restore 调整为有序、可恢复的组合转换，避免主窗口操作失败时留下“Host 可见但 Child WebView 已隐藏”的半完成状态。
- 使插件页关闭返回 Home 的 320px 尺寸恢复不依赖异步 Child WebView 销毁是否已经完成。
- 增加 source-contract、Rust、React 组合测试和真实 macOS ConfigLens 回归证据，覆盖页面关闭、`Cmd+W`、focus loss、快捷键恢复及同 attempt 复用/真实关闭销毁。
- 更新中英文 Child WebView Runtime 架构文档和验证说明。
- **目标**：修复两个已复现缺陷，并让稳定规格要求在 multi-webview 运行态下有直接证据。
- **非目标**：不改变 Launcher 的 `650×320/480/600` 固定尺寸，不改变 ConfigLens UI 或公共插件 SDK，不增加任意 resize API，不改变插件 Host/native 权限，不引入新依赖，也不兼容旧 iframe Runtime。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `launcher-window-lifecycle`：明确当 `main` 原生窗口包含 Host WebView 和当前 Child WebView 时，页面关闭尺寸恢复、`Cmd+W`、focus loss、hide/restore 与失败恢复仍必须作用于完整原生窗口，并保持 Host 定向事件隔离。

## Impact

- Rust：`src-tauri/src/launcher_window.rs`、`src-tauri/src/launcher_surface.rs`，以及同一原生父窗口解析相关的 native-dialog/presentation 边界。
- React/TypeScript：Launcher presentation 与 PluginRuntimeSlot teardown 的组合测试和必要的协调适配；不改变公共 UI 行为。
- Tests/evidence：Launcher Rust 单元测试、Rstest source-contract/导航测试、Child WebView lifecycle gate，以及真实 macOS ConfigLens 窗口几何和 `Cmd+W` 回归。
- Documentation/specs：`launcher-window-lifecycle` delta spec 与 `docs/{en,zh}/architecture/plugin-child-webview-runtime.md`。
- API/dependencies：不新增公共 API、Manifest/SDK 版本或运行时依赖。
