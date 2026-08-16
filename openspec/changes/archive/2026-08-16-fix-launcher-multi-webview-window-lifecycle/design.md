## Context

lensX 的 Launcher 原生窗口 `main` 初始包含一个同名 Host WebView，因此 Tauri 可以将它表示为 `WebviewWindow("main")`。打开 ConfigLens 后，Rust 在同一原生窗口中附加一个不同 label 的 Child WebView，Tauri 随即把该容器视为 multi-webview `Window`；此时 `get_webview_window("main")` 按其类型约束返回空，但 `get_window("main")` 和 `get_webview("main")` 仍分别表示完整原生窗口与受信任 Host 文档。

当前实现混用了这三个身份：Launcher resize、visibility、show/hide/focus、窗口事件与 native-dialog parent 都依赖 `get_webview_window`。页面关闭时 React 异步销毁 Child WebView，同时独立请求 Home resize，因而存在一次性 lookup 竞态。`Cmd+W`/focus-loss hide 则在解析主窗口之前先隐藏 Child WebView，解析失败后留下 Host 壳可见、插件内容隐藏的半完成状态。

稳定规格已经要求固定 `650×320/480/600` 尺寸、`Cmd+W` 和 focus loss 隐藏完整 Launcher、同 attempt hide/restore、Page close 销毁及 Host/Child WebView 原子协调。本 Change 修复实现和证据，不新增产品能力。

## Goals / Non-Goals

**Goals:**

- 在 Host-only 和 multi-webview 两种运行态中，以稳定的原生 `Window("main")` 执行 Launcher native 操作。
- 保持 `Window("main")`、Host `Webview("main")` 和插件 Child WebView 三种身份职责分离。
- 让 hide/restore 在改变 Child WebView 前完成所需解析，并在父窗口操作失败时恢复一致的可见状态。
- 让 Page close 返回 Home 的 320px resize 不依赖异步 Child WebView teardown 完成顺序。
- 以 Rust、TypeScript/source-contract、React 组合测试和真实 macOS ConfigLens 场景证明修复。

**Non-Goals:**

- 不改变固定 Launcher 尺寸、页面导航模型、ConfigLens UI、Manifest、SDK 或 Host API。
- 不允许插件提交原生尺寸、窗口 label 或 Tauri 对象。
- 不改变语义 hide/restore 复用 attempt、真实 Page close 销毁 attempt 的既有规则。
- 不引入新依赖、第二套 Runtime、standalone plugin window 或旧 iframe 兼容路径。

## Decisions

### 1. 将 native Window 与 Host WebView 解析拆成两个显式边界

Launcher native adapter 持有或按需解析 `Window("main")`，并仅用它执行 visibility、unminimize、show、hide、focus、set-size、window-event 和 native-dialog parent 操作。需要向 React Host 发送 `launcher://activated` 时，单独解析同名 Host `Webview("main")` 并定向 emit；事件不得通过整个 Window 广播给插件 Child WebView。

选择该方案是因为 `Window` 的身份在添加/移除 Child WebView 前后稳定，而 Host WebView 的 label 仍可作为受信任文档事件目标。它也复用 slot update 已验证的 `get_window` 模式。

备选方案：

- 等待 Child WebView 销毁后再 resize。拒绝，因为 native size 本来属于父 Window，而且等待会把 React teardown 时序变成正确性的必要条件。
- 在 lookup 失败后重试 `get_webview_window`。拒绝，因为 Child WebView 活跃期间该类型不成立，重试只是隐藏类型错误。
- 通过 Window 广播 activation event。拒绝，因为会模糊 Host/插件事件边界，并可能扩大插件可观察面。

### 2. Launcher action 先解析、后变更，并显式处理半完成失败

统一 action boundary 先解析完整 native Window；需要 Host activation 的 show/toggle-show 同时解析 Host WebView。只有解析成功后才改变当前 Child WebView presentation。

hide 路径保持“Child 先隐藏、父 Window 后隐藏”的遮挡安全顺序，但记录此前 Child 状态。如果父 Window hide 失败且当前 attempt 仍等价，则立即恢复该 Child WebView 的可见性和焦点策略；若恢复失败，则走现有 compare-current fail-closed teardown，并返回原始 native action 阶段诊断。show 路径先恢复、显示并聚焦父 Window，再显示/聚焦同 attempt Child WebView，避免插件 surface 先于父容器暴露。

native dialog guard 继续在 guard 生效时抑制 hide/toggle-hide；抑制路径不得隐藏 Child WebView。

备选方案是简单把 `get_webview_window` 替换成 `get_window` 而不改动作顺序。该方案能修复正常路径，但仍允许真实 native hide 失败产生相同半状态，因此不足以满足原子协调和失败恢复规格。

### 3. Page close 的尺寸恢复独立于 Runtime teardown

React 保持现有声明式 `presentationState` 和异步 PluginRuntimeSlot teardown：active Page 清除后立即请求 `home`，Rust 直接对 native Window 应用 320px。Child WebView teardown 仍通过 compare-current terminal path 完成，resize 不等待、不轮询也不重试 WebViewWindow 转换。

如果 teardown 尚未完成，Child WebView 的现有 hide/destroy 顺序确保它不遮挡 Home；native resize 与 teardown 可以并发，但都绑定同一个 Host-owned Window/attempt 边界。

### 4. 审计所有 `main` 父容器 lookup，保留真正需要 WebView 的创建点

实现阶段分类检查所有 `get_webview_window(MAIN_WINDOW_LABEL)`：

- native window 属性或父句柄用途改为 `get_window`；
- Host 文档事件用途改为定向 `get_webview`；
- Child WebView 创建若仍需由 Host WebView 获得其 parent Window，必须证明该调用发生在当前 Child 附加之前，并不得被 post-creation Launcher 路径复用。

增加 source-contract gate，阻止 Launcher resize/lifecycle/native-dialog 在 post-creation 路径重新依赖 `get_webview_window`。

### 5. 回归证据覆盖真实组合，而非只验证单层动作

Rust 单元测试继续覆盖 action 顺序、错误阶段和 dialog guard，并新增 Child presentation 已存在时的 resolver/rollback 状态组合。Rstest 验证源码边界和 React Page close 生命周期。真实 macOS ConfigLens evidence 至少覆盖：

1. Home `650×320` → ConfigLens `650×600` → close → Home `650×320`；
2. ConfigLens 可见时 `Cmd+W` 隐藏完整原生窗口，进程继续；
3. 全局快捷键恢复完整窗口和相同 Runtime attempt，无加载/模型/Worker 重建；
4. focus loss 与 `Cmd+W` 使用相同 hide boundary；
5. 真实 Page close 最终销毁 Child WebView 和 authority，且无残留空白 surface。

证据继续遵守现有隐私字段、目标 macOS 和 no-process-isolation-claim 约束。

## Risks / Trade-offs

- [风险] `Window` emit 可能意外广播 activation 给插件 → [缓解] native 操作与 Host event emitter 分离，事件只从 Host `Webview("main")` 发出，并加入负向 source-contract/事件目标测试。
- [风险] hide 失败后的 Child rollback 与并发 Page close/replacement 竞争 → [缓解] rollback 必须 compare-current，并只恢复原先可见且 identity/attempt 仍当前的 presentation；stale 结果保持 inert。
- [风险] native dialog parent 类型调整影响文件选择器 → [缓解] 保留 dialog guard 测试，并在真实 macOS smoke 中验证 dialog 打开期间 focus loss 不隐藏父窗口。
- [风险] source-string gate 可能产生脆弱测试 → [缓解] 以 Rust adapter 单元测试和真实 macOS evidence 为主，source gate 仅防止已知错误抽象回归。
- [权衡] 不让 Home resize等待 teardown，保留少量并发复杂度 → [收益] Window 几何不再依赖插件生命周期时序，避免延迟和一次性重试逻辑。

## Migration Plan

1. 先引入并测试 native Window/Host WebView 分离的内部 resolver/adapter。
2. 将 Launcher surface、action、listener、visibility 和 dialog parent 迁移到该边界，再加入 hide rollback。
3. 更新 source-contract、Rust/React tests 和 lifecycle gate。
4. 更新中英文架构文档并运行完整验证。
5. 最后运行真实 macOS ConfigLens 组合证据；只有几何、hide/restore、same-attempt 与 teardown 全部通过才完成 Change。

无数据、配置或公共契约迁移。若需回滚，可整体撤销内部 resolver/action 改动和对应测试/文档；不得通过恢复 post-creation `get_webview_window` 或禁用 Child WebView 来规避问题。

## Open Questions

无。既有稳定规格已经确定：`Cmd+W` 是语义 hide 并复用同 attempt，Page close 是真实 close 并销毁 attempt，Launcher 尺寸保持离散固定值。
