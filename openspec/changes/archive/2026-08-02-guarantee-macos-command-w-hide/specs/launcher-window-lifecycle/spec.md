## MODIFIED Requirements

### Requirement: A recoverable launcher must hide on close and focus loss

默认全局快捷键成功注册后，系统 MUST 阻止主窗口关闭请求终止应用，并 MUST 将该请求路由到 `hide`。在 macOS 上，系统 MUST 提供恰好一个应用内 `Cmd+W` 关闭窗口快捷键入口；该入口 MUST 在无边框主窗口无法通过原生关闭命令产生关闭事件时，仍通过统一 action boundary 路由到 `hide`。系统 MUST NOT 将 `Cmd+W` 注册为系统级全局快捷键。系统 MUST 将主窗口焦点丢失路由到 `hide`。系统发起隐藏后产生的窗口事件 MUST NOT 形成 action loop 或终止应用。

在默认全局快捷键尚未成功注册时，系统 MUST NOT 通过新的 macOS `Cmd+W` 入口隐藏主窗口。菜单事件无法安装、无法路由或隐藏操作失败时，系统 MUST 提供可供开发者诊断的失败信息，MUST NOT 暴露原生错误细节给用户，并 MUST NOT 因该失败终止应用进程。

#### Scenario: Close a ready launcher window

- **WHEN** 默认全局快捷键已经成功注册
- **AND** 用户请求关闭主窗口
- **THEN** 系统阻止默认关闭行为
- **THEN** 系统通过统一 action boundary 隐藏主窗口
- **THEN** 应用进程继续运行

#### Scenario: Press Cmd+W in a ready macOS launcher

- **WHEN** 默认全局快捷键已经成功注册
- **AND** macOS 主窗口可见且 lensX 是前台应用
- **AND** 用户按下 `Cmd+W`
- **THEN** 恰好一个应用内菜单快捷键入口处理该按键
- **THEN** 系统通过统一 action boundary 隐藏主窗口
- **THEN** 主窗口不被销毁且应用进程继续运行

#### Scenario: Restore the launcher after Cmd+W

- **WHEN** macOS 主窗口已经由 `Cmd+W` 隐藏
- **AND** 用户按下默认全局快捷键
- **THEN** 系统通过统一 action boundary 显示并聚焦主窗口
- **THEN** 既有 typed activation event 使 launcher 输入恢复焦点

#### Scenario: Default recovery shortcut is unavailable on macOS

- **WHEN** 默认全局快捷键插件不可用或快捷键注册失败
- **AND** 用户按下 `Cmd+W`
- **THEN** 新的应用内 `Cmd+W` 入口不隐藏主窗口
- **THEN** 系统不会产生无法通过已配置路径恢复的隐藏窗口

#### Scenario: Cmd+W hide fails

- **WHEN** macOS 应用内 `Cmd+W` 入口已经处理按键
- **AND** 统一 `hide` action 无法解析或隐藏主窗口
- **THEN** 系统保留窗口最后成功的可见性状态
- **THEN** 失败信息标识请求的 action 和失败的原生操作阶段，供开发者诊断
- **THEN** 系统不向用户暴露原生错误细节且不终止应用进程

#### Scenario: The launcher main window loses focus

- **WHEN** 默认全局快捷键已经成功注册
- **AND** 可见的主窗口失去焦点
- **THEN** 系统通过统一 action boundary 隐藏主窗口
- **THEN** 用户可以通过默认全局快捷键恢复窗口
