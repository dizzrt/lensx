## Context

lensX 的 `main` 窗口是透明、无装饰的 macOS launcher。现有 Rust 生命周期监听器能够处理 `CloseRequested`：阻止窗口销毁后，通过统一 `LauncherWindowAction::Hide` 隐藏窗口；焦点丢失和全局快捷键也复用同一 action boundary。

当前缺口发生在事件产生之前。Tauri 默认 macOS 菜单将 `Cmd+W` 绑定到原生 `performClose:`，而当前无边框窗口 style 不包含原生 closable 能力，因此按键不会产生 `CloseRequested`。现有监听器和隐藏 action 都没有机会执行。实现必须保留无边框视觉、Rust 所有的原生生命周期边界，以及“只有存在可靠恢复路径时才启用隐藏式关闭”的既有安全条件。

## Goals / Non-Goals

**Goals:**

- 让可见且就绪的 macOS launcher 在收到应用内 `Cmd+W` 时可靠隐藏，并保持进程运行。
- 让菜单快捷键、原生关闭事件和焦点丢失继续复用统一 Rust `hide` action。
- 仅在默认全局恢复快捷键成功注册后启用 `Cmd+W` 隐藏入口。
- 保留默认 macOS 菜单的其他平台行为，包括编辑命令和 `Cmd+Q` 退出。
- 提供纯 Rust 可验证的菜单事件路由、失败诊断和真实 macOS smoke test。

**Non-Goals:**

- 不改变 launcher 的无边框、透明、置顶或固定尺寸设计。
- 不把 `Cmd+W` 注册为系统级全局快捷键。
- 不在 React/WebView 中捕获 `keydown`，也不新增前端或跨边界 payload。
- 不改变 `Cmd+Q`、Dock 退出或 Windows/Linux 窗口关闭行为。
- 不增加快捷键自定义、托盘恢复或新的应用菜单功能。

## Decisions

### 1. 使用应用内 macOS 菜单命令承接 `Cmd+W`

Host 将安装应用所有的 macOS 菜单，使恰好一个自定义菜单项持有 `Cmd+W` accelerator。该项目使用稳定菜单 ID，不调用原生 predefined Close Window 的 `performClose:`；Tauri menu event 根据菜单 ID 路由到 launcher `hide` action。

实现应保留当前默认菜单中的其他可用项目和原生 selector，移除或取消所有与自定义入口冲突的 predefined `Cmd+W` accelerator。菜单显示文案保持现有 Close Window 平台语义，不引入新的产品文案。

选择该方案是因为它是应用内快捷键，只在 lensX 为前台应用时生效，并且事件直接到达 Rust。相比之下，global-shortcut 会错误拦截其他应用的 `Cmd+W`；React `keydown` 可能被原生菜单优先消费，并会把原生生命周期职责移入前端；重新启用窗口装饰会破坏 launcher 视觉契约。

### 2. 菜单事件复用统一 launcher action boundary

菜单 handler 只负责识别稳定菜单 ID，并调用 `LauncherWindowActions::dispatch(..., LauncherWindowAction::Hide)`。它不得直接调用 `window.hide()`，也不得伪造 `CloseRequested`。原生关闭请求监听器仍然保留，用于其他能够产生关闭事件的入口。

路由判断应与 Tauri 类型隔离成可单测的最小函数：已知的 `Cmd+W` 菜单 ID 返回 `Hide`，未知菜单 ID 不产生 launcher action。隐藏失败使用现有 action/operation 诊断信息记录到开发者可见日志，不向用户暴露原生错误细节，也不终止进程。

### 3. 仅在恢复路径就绪后安装或启用 `Cmd+W` 隐藏

生命周期初始化继续先安装全局快捷键插件并注册唯一的 `Ctrl+Shift+Space`，再安装窗口监听器。只有这些恢复条件成功后，Host 才安装或启用应用所有的 `Cmd+W` 菜单入口。

如果全局快捷键注册失败，`Cmd+W` 不得通过新入口隐藏窗口，避免产生不可恢复的隐藏状态。如果 macOS 菜单安装失败，Host 记录可诊断错误；已注册的全局快捷键和其他已成功建立的生命周期能力继续可用，不把局部菜单失败升级为进程崩溃。

### 4. 保持现有激活恢复流程

`Cmd+W` 不发送新的前端事件。窗口隐藏后，既有 `Ctrl+Shift+Space` toggle 走 `show → focus → launcher://activated`，React 继续通过现有 typed activation contract 恢复输入焦点。该变更不修改 React 状态、查询、选中 Action 或页面状态。

## Risks / Trade-offs

- **[自定义菜单与 Tauri 默认菜单漂移]** → 只替换与 Close Window/`Cmd+W` 有关的项目，保留其余默认菜单语义；为关键菜单 ID、唯一 accelerator 和 `Cmd+Q` 非回归增加测试与 macOS smoke 检查。
- **[重复的 `Cmd+W` accelerator 导致路由不确定]** → 安装菜单时确保恰好一个应用内项目持有该 accelerator，并测试未知或重复入口不会产生额外 hide action。
- **[菜单安装发生在部分生命周期初始化之后]** → 将失败视为可诊断的局部降级；不终止应用，也不撤销已经成功注册且仍有价值的恢复快捷键。
- **[单元测试无法证明 AppKit 实际键盘分发]** → 用纯 Rust 测试覆盖菜单 ID 到 action 的逻辑，再以真实 macOS smoke test 覆盖 `Cmd+W → 隐藏 → 全局快捷键恢复 → 输入聚焦`。

## Migration Plan

1. 增加 macOS 专用菜单构建与 menu-event 路由，并接入现有 lifecycle 初始化。
2. 增加 Rust 测试，更新英文架构文档及其简体中文镜像。
3. 运行完整前端与 Rust 验证，再执行真实 macOS smoke test。
4. 回滚时移除自定义菜单安装和 handler，即恢复当前 Tauri 默认菜单；不涉及数据迁移、持久化格式或前端兼容处理。

## Open Questions

无。实现阶段可以在不改变上述边界的前提下选择最小的 Tauri menu 构建 API。
