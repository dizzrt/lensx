## Why

当前 launcher 已能在收到原生 `CloseRequested` 时阻止销毁并隐藏窗口，但 macOS 无边框主窗口不具备原生 closable window style，Tauri 默认菜单的 `Cmd+W` 因而不会产生该事件。用户按下平台惯用的关闭窗口快捷键时窗口没有响应，既不符合键盘优先体验，也没有满足“关闭请求转为可恢复隐藏”的产品语义。

## What Changes

- 在 macOS 上为 `Cmd+W` 提供应用内、Host 所有的菜单快捷键入口，并将其路由到现有统一 launcher `hide` action。
- 明确 `Cmd+W` 只隐藏主窗口、保持应用进程运行，并可通过既有全局快捷键恢复窗口和输入焦点。
- 保留现有无边框 launcher 外观，不依赖原生 `performClose:` 为无边框窗口生成关闭事件。
- 增加菜单事件路由和失败诊断的 Rust 测试，并增加真实 macOS smoke test 验收步骤。
- 更新英文架构文档及其简体中文镜像，说明 macOS 关闭快捷键的 Host 路由。
- 不改变 `Cmd+Q` 的应用退出语义，不注册系统级 `Cmd+W`，不把原生窗口生命周期处理移入 React，也不改变 Windows/Linux 行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `launcher-window-lifecycle`: 将可恢复关闭行为明确扩展到 macOS 主窗口的 `Cmd+W` 应用内快捷键，并规定其隐藏、恢复和失败诊断语义。

## Impact

- 主要影响 Rust/Tauri launcher 生命周期与应用菜单初始化，包括 `src-tauri/src/lib.rs`、`src-tauri/src/launcher_window.rs` 及相关 Rust 单元测试。
- 更新 `docs/en/architecture/overview.md` 与对应的 `docs/zh/architecture/overview.md`。
- 为现有 `openspec/specs/launcher-window-lifecycle/spec.md` 提供 delta requirement；同步和归档前需将进入稳定规格的内容改写为英文。
- 不新增运行时依赖，不改变前端公开接口、跨边界 payload、持久化格式或插件契约。
