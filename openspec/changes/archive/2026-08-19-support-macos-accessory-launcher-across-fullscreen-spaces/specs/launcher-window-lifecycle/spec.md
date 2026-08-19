## ADDED Requirements

### Requirement: macOS Host MUST run as an accessory Launcher without a Dock tile

在 macOS 上，系统 MUST 从打包应用的可观察启动开始把 lensX 配置为可程序化激活的 accessory 应用。运行中的 lensX MUST NOT 显示 Dock tile 或普通应用菜单栏，MUST NOT 使用禁止创建或激活窗口的 prohibited 策略，并且 MUST 在 Launcher Window 隐藏后保持进程和默认全局快捷键可用。该策略 MUST 只属于受信任 Rust Host，React、插件和公共 Host API MUST NOT 获得修改应用激活策略或 Dock 可见性的能力。

若 Host 无法建立或确认要求的 accessory 策略，系统 MUST 在呈现普通 Dock 应用之前使启动失败，并提供安全、可诊断的 setup stage。系统 MUST NOT 静默降级到 Regular 策略。

#### Scenario: Launch the packaged macOS application

- **WHEN** 用户通过 Launch Services 启动打包的 lensX `.app`
- **THEN** 进程以可程序化激活的 accessory 策略运行
- **THEN** Dock 从可观察启动到进程退出均不出现 lensX tile
- **THEN** 系统不显示普通 lensX 应用菜单栏

#### Scenario: Hide an accessory Launcher

- **WHEN** 已就绪的 macOS Launcher 通过统一 action boundary 隐藏
- **THEN** lensX 进程和默认全局快捷键继续运行
- **THEN** 隐藏操作不创建 Dock tile、状态项或其他常驻可点击入口

#### Scenario: Accessory setup fails

- **WHEN** Host 无法设置或确认 macOS accessory activation policy
- **THEN** 系统在显示普通 Regular 应用 Window 前终止启动
- **THEN** 开发者诊断标识应用策略 setup stage，但不向用户暴露原生错误详情

#### Scenario: Untrusted code requests application policy authority

- **WHEN** React、插件 Runtime、插件 Host API 或公共 Contract 尝试修改 activation policy、Dock visibility 或应用菜单身份
- **THEN** 系统不提供该操作边界
- **THEN** Host 保持已确认的 accessory 策略

### Requirement: macOS Launcher MUST restore over another application's full-screen Space

macOS 完整原生 `main` Window MUST 参与所有 Spaces，并 MUST 被配置为可与其他应用的全屏 Window 共存。`always-on-top`、跨 Space 和全屏辅助行为 MUST 由受信任 Rust Host 建立，MUST 保留现有非全屏 Launcher 自身语义，并 MUST NOT 暴露为前端、插件、DOM measurement 或 Runtime message 可控制的原生 setter。

当 Launcher 隐藏且用户正在其他应用的全屏 Space 中按下默认全局快捷键时，系统 MUST 通过统一 `toggle`/`show` action boundary 激活 accessory 应用、恢复并显示完整原生 Window、请求键盘焦点，然后发送 Host activation event。系统 MUST 在用户当前全屏 Space 中将 Launcher 显示于全屏内容之上，MUST NOT 把用户切回 Launcher 先前所在的普通 Space，也 MUST NOT 退出或最小化前台全屏应用。

#### Scenario: Restore from another application's full-screen Space

- **WHEN** macOS Launcher 已隐藏
- **AND** 另一个应用在用户当前 Space 中全屏显示
- **AND** 用户按下默认全局快捷键
- **THEN** pressed event 通过统一 `toggle` action 进入 show 路径
- **THEN** 完整 lensX Window 在当前全屏 Space 的全屏内容之上可见并获得键盘焦点
- **THEN** 系统不切换到旧 Space，也不退出、最小化或改变前台全屏应用的全屏状态

#### Scenario: Restore from an ordinary Space

- **WHEN** macOS Launcher 已隐藏且用户位于普通非全屏 Space
- **AND** 用户按下默认全局快捷键
- **THEN** 系统通过同一 action boundary 显示并聚焦 Launcher
- **THEN** 跨 Space 策略不改变既有尺寸、位置、非全屏或 presentation state

#### Scenario: Repeated full-screen toggles

- **WHEN** 用户在其他应用的全屏 Space 中连续多次隐藏和恢复 Launcher
- **THEN** 每次 pressed event 恰好执行一次 hide 或 show
- **THEN** 每次 show 后 Window 可见且可输入，每次 hide 后 Window 不再遮挡全屏内容
- **THEN** 系统不累积重复 shortcut、Window、Space 或 focus listener

#### Scenario: Restore a current plugin Page over full-screen content

- **WHEN** 隐藏的 Launcher 包含同一个等价 current plugin attempt
- **AND** 用户从其他应用的全屏 Space 按默认全局快捷键恢复 Launcher
- **THEN** 系统先显示并聚焦完整原生 parent，再恢复同一个 Child WebView presentation
- **THEN** Host chrome 和插件内容在同一当前全屏 Space 中一起可见
- **THEN** Runtime attempt、Session、插件 document 和内存状态不因跨 Space 恢复而重建

#### Scenario: Full-screen Space setup cannot be established

- **WHEN** Host 无法解析完整原生 `main` Window、无法在主线程应用 collection behavior 或无法确认跨 Space/fullscreen auxiliary 策略
- **THEN** 系统在宣告 Launcher 就绪前使 setup 失败
- **THEN** 系统不以只调用 `show`、切换回旧 Space 或削弱可见性断言作为回退
- **THEN** 开发者诊断标识安全的 native setup stage

### Requirement: Accessory Launcher MUST retain application-local close and quit shortcuts

在 macOS accessory 策略不显示普通应用菜单栏时，系统 MUST 继续提供恰好一个 lensX application-local `Cmd+W` 入口和恰好一个 lensX application-local `Cmd+Q` 入口。`Cmd+W` MUST 遵循现有 recoverable hide requirement 并进入统一 Hide action；`Cmd+Q` MUST 终止 lensX 进程并执行既有应用 teardown。两个入口 MUST 只在 lensX 是前台应用时处理按键，MUST NOT 注册为系统级全局快捷键，也 MUST NOT 拦截其他前台应用的对应命令。

#### Scenario: Press Cmd+W without a visible application menu bar

- **WHEN** accessory lensX Window 可见、已聚焦且没有普通应用菜单栏
- **AND** 用户按下 `Cmd+W`
- **THEN** 恰好一个 application-local 入口通过统一 Hide action 隐藏完整 Launcher
- **THEN** 进程和默认恢复快捷键继续运行

#### Scenario: Press Cmd+Q without a visible application menu bar

- **WHEN** accessory lensX Window 可见、已聚焦且没有普通应用菜单栏
- **AND** 用户按下 `Cmd+Q`
- **THEN** 恰好一个 application-local 入口请求退出 lensX
- **THEN** 应用 teardown 终止当前 Child WebView 和 Host 资源后结束进程

#### Scenario: Another application owns the foreground

- **WHEN** 其他应用是 macOS 前台应用
- **AND** 用户在该应用中按下 `Cmd+W` 或 `Cmd+Q`
- **THEN** lensX 不隐藏、不退出且不消费对应按键
- **THEN** 前台应用保留其自身的本地快捷键行为

#### Scenario: Recovery shortcut registration fails

- **WHEN** 默认 lensX 全局恢复快捷键无法注册
- **THEN** 系统不启用会隐藏 Launcher 的 application-local `Cmd+W` 或 focus-loss hide
- **THEN** 可见 Window 保留可退出路径，且系统不会留下无 Dock、无恢复入口的隐藏进程

### Requirement: macOS accessory and full-screen behavior MUST have target product evidence

交付 MUST 组合确定性 Rust 测试、配置与 bundle policy checks，以及受支持目标 macOS 上当前打包 `.app` 的有界产品路径证据。证据 MUST 覆盖 bundle agent 身份、运行时 Accessory policy、无 Dock tile、完整 `main` Window 的跨 Space/fullscreen auxiliary/level 状态、普通 Space 恢复、其他应用全屏 Space 恢复、键盘焦点、重复 toggle、当前 Child WebView 同尝试恢复、`Cmd+W`、`Cmd+Q`、其他前台应用不受影响和 setup failure diagnostics。开发模式、静态源码检查或模拟 Window MUST NOT 单独替代打包应用的 Dock 与全屏 Space 证据；真实产品证据 MUST NOT 替代确定性 failure 和 race tests。

#### Scenario: Target macOS product matrix passes

- **WHEN** 维护者对当前打包 lensX `.app` 和独立全屏测试应用运行 focused macOS gate
- **THEN** 所有 accessory、Dock、Space、全屏层级、focus、shortcut、Child presentation 和 teardown 断言以有界证据通过
- **THEN** 证据记录 macOS、Tauri/Tao/Wry revision 和失败诊断，而不依赖用户默认浏览器配置或现有用户应用会话

#### Scenario: Only simulated evidence is available

- **WHEN** unit tests 和配置检查通过但目标 macOS 打包产品 gate 未运行或未证明无 Dock 及全屏 Space 可见性
- **THEN** 变更 MUST NOT 被标记为完整交付
- **THEN** 维护者明确报告缺少的目标产品证据
