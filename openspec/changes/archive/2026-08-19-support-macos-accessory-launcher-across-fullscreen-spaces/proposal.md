## Why

当前 macOS Host 以普通应用策略运行，因此 lensX 会长期占用 Dock 图标；同时 `alwaysOnTop` 只保证同一 Space 内的窗口层级，当用户正在其他应用的全屏 Space 中按下全局快捷键时，Launcher 可能已经执行 `show` 和 `focus`，却仍不在用户当前可见的 Space 中。作为键盘优先、按需唤出的 Launcher，lensX 需要在不依赖 Dock 的前提下可靠出现在当前全屏工作环境中。

## What Changes

- 将 macOS lensX Host 定义为可被程序化激活的 accessory Launcher，使应用运行期间不显示 Dock 图标，并明确禁止使用无法创建或激活窗口的 prohibited 策略。
- 使完整的原生 `main` Window 参与 macOS Spaces，并保证用户在其他应用的全屏 Space 中从隐藏状态按下默认全局快捷键后，Launcher 在当前 Space 可见、位于全屏内容之上并获得键盘焦点。
- 保留统一的 Rust `show`、`hide`、`toggle` action boundary、现有 Child WebView 同尝试隐藏/恢复语义，以及默认快捷键的 pressed-only 路由。
- 在 accessory 策略移除应用菜单栏的条件下，继续保证 lensX 获得焦点时 `Cmd+W` 隐藏 Launcher、`Cmd+Q` 退出应用；这些快捷键不得影响其他前台应用。
- 增加确定性 Rust 测试、配置/策略检查和目标 macOS 打包应用证据，覆盖无 Dock、普通 Space、其他应用全屏 Space、重复隐藏/恢复、关闭/退出快捷键及失败诊断。
- 更新规范以及英中文架构和验证文档，清楚说明 accessory、Dock、Space、全屏和退出恢复行为。
- 非目标：不新增菜单栏状态项或托盘图标，不自动把窗口移动到鼠标所在显示器或重新居中，不改变默认全局快捷键，不向 React、插件或公共 Host API 暴露任意原生窗口、Space 或应用激活权限。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `launcher-window-lifecycle`: 扩展 macOS Host 应用策略、Dock 可见性、跨 Space/其他应用全屏唤起、应用本地关闭和退出快捷键，以及相应的目标 macOS 验证要求。

## Impact

- Rust/Tauri Host：`src-tauri/src/lib.rs`、`src-tauri/src/launcher_window.rs`、`src-tauri/tauri.conf.json` 及相关 Rust 测试或目标 macOS 验证 harness。
- 规范与文档：`openspec/specs/launcher-window-lifecycle/spec.md`、`docs/en/architecture/overview.md`、对应的 `docs/zh/architecture/overview.md`，以及目标 macOS 验证文档。
- macOS 用户体验：应用不再显示 Dock 图标或普通应用菜单栏，但隐藏/恢复、窗口内 `Cmd+W` 和 `Cmd+Q` 仍有明确可恢复、可退出的路径。
- 公共边界：不改变插件 Manifest、Contract、SDK、Host API、Runtime Session 或 Child WebView 权限模型，也不引入新的前端或插件依赖。
