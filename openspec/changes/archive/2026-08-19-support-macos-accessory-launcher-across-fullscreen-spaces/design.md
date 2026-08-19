## Context

当前 `main` Window 由 macOS frame-aware navigation setup 从 `tauri.conf.json` 创建。配置已经启用透明、无边框、非全屏和 `alwaysOnTop`，但应用仍使用默认 Regular activation policy，Window 也没有加入所有 Spaces。全局快捷键最终进入统一的 Rust action boundary；隐藏状态下的 `toggle` 只执行 restore、show、focus 和 Host activation event，因此无法改变窗口所属 Space，也没有建立无 Dock 的应用身份。

这项变更同时跨越 bundle 元数据、Tauri/AppKit 启动、原生 Window collection behavior、Launcher action、macOS 菜单快捷键和产品路径验证。React、插件 Child WebView 与公共插件边界不是策略所有者；它们只能继续消费已有的激活事件和 Host 所决定的可见性。

## Goals / Non-Goals

**Goals:**

- macOS 打包应用从可观察启动开始不创建 Dock 图标，并保持可被默认全局快捷键程序化激活。
- 隐藏的 Launcher 能从其他应用的全屏 Space 中恢复，在该 Space 的全屏内容之上可见并获得键盘焦点。
- 保留现有统一 action boundary、pressed-only 全局快捷键、focus-loss/close-to-hide、Child WebView 同尝试恢复和安全诊断。
- 在没有可见应用菜单栏时保留 lensX 前台窗口内的 `Cmd+W` 隐藏和 `Cmd+Q` 退出。
- 用确定性测试与目标 macOS 打包产品证据验证应用策略、Window collection behavior、真实可见性和快捷键恢复。

**Non-Goals:**

- 不增加 Dock、菜单栏状态项、托盘图标或常驻可点击入口。
- 不把 Launcher 转换为公共 `NSPanel` 抽象，不向前端或插件暴露 AppKit 对象和原生窗口权限。
- 不自动跟随鼠标、活动显示器或重新居中；窗口保持 Host 已确认的尺寸、位置和显示器归属。
- 不改变默认 `Ctrl+Shift+Space`、窗口尺寸模型、插件 Page presentation 或 Runtime Session 生命周期。
- 不扩展 Windows/Linux 行为；非 macOS 构建保持当前语义。

## Decisions

### 1. 在 bundle 与运行时共同声明 Accessory 应用身份

macOS bundle 元数据使用 `LSUIElement=true`，使 Launch Services 在进程创建 Dock tile 之前把 lensX 识别为 agent/accessory 应用。Rust setup 在创建首个可见 Host Window 之前再次设置 Tauri `ActivationPolicy::Accessory` 并验证成功，从而覆盖开发运行和运行时身份；任一步骤都不得降级为 Regular 或 Prohibited。

选择 Accessory 是因为它同时满足“无 Dock”和“仍可创建、显示、聚焦窗口”。不使用 `skipTaskbar`，因为 Tauri 在 macOS 不支持该 Window 属性；不只调用异步 Dock visibility 切换，因为它不能定义完整、稳定的应用激活语义；不使用 Prohibited，因为它不允许需要的窗口激活。

应用策略是强制启动前提。若运行时无法建立 Accessory，setup 返回错误并阻止呈现一个违反产品承诺的普通 Dock 应用，而不是记录后继续。

### 2. 由 Host 同时建立跨 Space 与全屏辅助 Window 行为

`main` Window 配置启用 `visibleOnAllWorkspaces`，由当前 Tauri/Tao 路径建立 `CanJoinAllSpaces`。Window 创建后，macOS Host 使用仓库已有的 `objc2`/`objc2-app-kit` 能力在主线程上合并 `FullScreenAuxiliary`，保留既有 collection flags，不覆盖 Tauri 设置。`alwaysOnTop` 继续负责层级；三者组合形成“加入当前 Space、可与其他应用全屏 Window 共存、位于普通全屏内容之上”的完整策略。

这些 setter 只作用于完整原生 `main` Window，由 Rust setup 负责，不能进入 Tauri command、React adapter、插件 Host API 或 Runtime message。无法解析 Window、无法位于主线程或无法确认 collection behavior 时，setup 失败；不以降低断言、切换到原 Space 或只调用 `show` 作为回退。

### 3. 激活仍通过统一 action boundary，应用激活先于窗口聚焦

默认快捷键 pressed event 仍只路由到 `LauncherWindowAction::Toggle(GlobalShortcut)`。隐藏状态的 show 路径在 macOS accessory 应用中按“激活应用、restore、show、focus、发送 Host activation event、恢复当前 Child presentation”顺序执行；非 macOS 保持原顺序。应用激活和 Window collection setup 进入可诊断的原生 operation stage，失败时不得发送成功 activation event 或独立恢复 Child WebView。

不在全局快捷键 handler 中复制 Window/AppKit 操作。这样程序化 show、快捷键 show、`Cmd+W` 后恢复以及插件 Page 恢复继续共享同一原子边界。

### 4. 保留隐藏的应用菜单命令图作为前台本地快捷键路由

Accessory policy 移除可见应用菜单栏，但 Host 仍安装当前 Tauri application menu command graph。唯一自定义 Close Window item 拥有 `Cmd+W` 并进入统一 Hide action；唯一自定义 Quit item 拥有 `Cmd+Q`，先复用既有 Child teardown 再请求应用退出。两者都是 lensX 激活时的 application-local key equivalents，不注册为系统级全局快捷键，也不影响其他前台应用。

目标 macOS 产品证据必须证明隐藏菜单栏条件下两个 key equivalent 仍由 AppKit/Tauri 分发。实施验证确认隐藏 menu graph 不能可靠完成 `Cmd+Q` teardown，因此交付采用同一 Rust command router 下的 AppKit focused-only local event monitor 作为限定回退；不得把 `Cmd+W` 或 `Cmd+Q` 注册到 global-shortcut plugin。该回退具备幂等安装/释放、前台 lensX 约束、事件消费和相同诊断字段。

### 5. 将真实 macOS 产品证据与确定性测试分层

确定性 Rust 测试覆盖策略选择、setup 顺序、operation failure、shortcut routing、菜单 ID、Child presentation 原子性和非 macOS 无变化。配置策略检查覆盖 `LSUIElement`、`visibleOnAllWorkspaces`、`alwaysOnTop`、非全屏和无 `skipTaskbar` 伪解法。

目标 macOS gate 构建并启动当前打包 `.app`，记录 bundle 身份、运行时 Accessory policy、无 Dock tile、主 Window collection behavior、Window level/occlusion/focus和进程存活。独立的牺牲测试应用建立普通全屏 Space；gate 通过默认快捷键对应的生产 action 路径隐藏/恢复 Launcher，并用 AppKit/CoreGraphics 有界证据确认它出现在该全屏 Space 之上。真实 gate 还覆盖普通 Space、连续多次 toggle、当前插件 Child WebView、`Cmd+W`、恢复、`Cmd+Q` 和其他前台应用不受本地快捷键影响。

单元测试不能替代 Dock/Space 产品证据，产品证据也不能替代 failure/race 的确定性测试。

## Risks / Trade-offs

- [Accessory 同时移除 Dock、普通菜单栏和普通应用切换入口] → 这是键盘优先 Launcher 的明确产品行为；保留默认全局恢复快捷键、前台 `Cmd+Q` 和启动失败保护。
- [仅设置 `visibleOnAllWorkspaces` 可能无法覆盖其他应用全屏 Space] → Host 额外合并 `FullScreenAuxiliary`，并以目标 macOS 打包产品 gate 验证而不是从配置推断。
- [激活、show、focus 与 focus-loss hide 可能形成竞态或闪退式隐藏] → 所有操作继续串行进入统一 action boundary，增加顺序/failure 测试和重复真实 toggle 证据，禁止 handler 旁路调用。
- [无 Dock 时全局快捷键注册失败会削弱恢复入口] → 保留现有安全降级：在注册成功前不启用 close-to-hide、focus-loss hide 或应用本地 `Cmd+W`；保持窗口可见并允许退出。
- [Accessory 下隐藏菜单 command graph 的 key equivalent 可能随 macOS/Tauri 版本变化] → 真实验证 `Cmd+W`/`Cmd+Q`；失败时使用 focused-only AppKit local monitor，绝不扩大为全局快捷键。
- [多显示器用户可能期望 Launcher 跟随当前屏幕] → 本次只保证当前 Space 可见，保留上次位置；后续单独设计 active-monitor placement。

## Migration Plan

1. 先加入 bundle/runtime Accessory 和主 Window collection setup 的确定性策略层及失败诊断。
2. 将配置、action show 顺序和本地菜单快捷键接入该策略，保持非 macOS 与插件边界不变。
3. 更新英中文文档和 macOS 验证 gate，完成打包 `.app` 的普通/全屏 Space 验收后再视为交付。
4. 此变更不迁移用户数据或插件数据。回滚时移除 `LSUIElement`、Accessory setup、跨 Space/fullscreen auxiliary setup 和对应 gate，即恢复当前 Regular/Dock 行为；不需要数据恢复。

## Open Questions

无。自动跟随活动显示器与可见状态项均明确留待独立变更。
