## ADDED Requirements

### Requirement: Launcher 主窗口必须使用紧凑的原生窗口形态

系统 MUST 将标签为 `main` 的主窗口配置为 650px 固定宽度、180px 初始与最小高度、800px 最大高度的 launcher 窗口。窗口 MUST 无系统边框、不可由用户调整大小、非全屏、使用透明背景并保持置顶。系统 MUST NOT 在本能力中根据搜索结果或其他业务内容自动修改窗口高度。

#### Scenario: 启动桌面应用

- **WHEN** lensX 创建主窗口
- **THEN** 主窗口以 650px 宽度和 180px 初始高度显示
- **THEN** 主窗口无系统边框且保持置顶
- **THEN** 用户不能手动调整主窗口尺寸或进入全屏

#### Scenario: 检查窗口高度边界

- **WHEN** 系统读取主窗口约束
- **THEN** 主窗口最小高度为 180px 且最大高度为 800px
- **THEN** 本能力不因输入内容变化而自动调整原生窗口高度

### Requirement: Rust 必须统一执行 launcher 窗口动作

系统 MUST 在 Rust 中提供统一的 launcher 主窗口动作边界，至少支持 `show`、`hide` 和 `toggle`。所有全局快捷键和窗口生命周期入口 MUST 通过该边界执行动作，MUST NOT 在各自 handler 中复制原生窗口操作。窗口动作失败 MUST 返回包含动作和失败操作阶段的可诊断错误。

#### Scenario: 显示隐藏的 launcher

- **WHEN** 系统对不可见的主窗口执行 `show`
- **THEN** 系统恢复已最小化的窗口并显示窗口
- **THEN** 系统请求主窗口获得焦点

#### Scenario: 隐藏 launcher

- **WHEN** 系统对主窗口执行 `hide`
- **THEN** 系统隐藏主窗口
- **THEN** lensX 应用进程继续运行

#### Scenario: 切换可见窗口

- **WHEN** 系统对当前可见的主窗口执行 `toggle`
- **THEN** 系统通过统一动作边界隐藏主窗口

#### Scenario: 切换不可见窗口

- **WHEN** 系统对当前不可见的主窗口执行 `toggle`
- **THEN** 系统通过统一动作边界显示并聚焦主窗口

#### Scenario: 原生窗口操作失败

- **WHEN** launcher 动作中的窗口查找、可见性读取、恢复、显示、隐藏或聚焦操作失败
- **THEN** 系统返回可诊断错误
- **THEN** 错误标识失败的 launcher 动作和原生操作阶段

### Requirement: 默认全局快捷键必须切换 launcher

系统 MUST 注册默认全局快捷键 `Ctrl+Shift+Space`。该快捷键的按下事件 MUST 路由到统一的 `toggle` 动作；释放事件和未知快捷键 MUST NOT 触发窗口动作。应用运行期间 MUST 至多维护一个该默认绑定。

#### Scenario: 从隐藏状态按下默认快捷键

- **WHEN** 主窗口不可见且用户按下 `Ctrl+Shift+Space`
- **THEN** 系统执行 `toggle`
- **THEN** 主窗口显示并请求焦点

#### Scenario: 从显示状态按下默认快捷键

- **WHEN** 主窗口可见且用户按下 `Ctrl+Shift+Space`
- **THEN** 系统执行 `toggle`
- **THEN** 主窗口隐藏且应用继续运行

#### Scenario: 释放默认快捷键

- **WHEN** 系统收到 `Ctrl+Shift+Space` 的释放事件
- **THEN** 系统不再次执行 launcher 窗口动作

#### Scenario: 默认快捷键注册失败

- **WHEN** 全局快捷键插件不可用或 `Ctrl+Shift+Space` 无法注册
- **THEN** 系统报告包含绑定和失败原因的可诊断错误
- **THEN** 系统保持主窗口可见且可按普通窗口行为关闭
- **THEN** 系统不启用会导致窗口无法通过已配置路径恢复的关闭转隐藏或失焦隐藏行为

### Requirement: 可恢复的 launcher 必须在关闭和失焦时隐藏

默认全局快捷键成功注册后，系统 MUST 阻止主窗口关闭请求终止应用，并 MUST 将该请求路由为 `hide`。主窗口失去焦点时，系统 MUST 将该事件路由为 `hide`。系统自身执行隐藏后产生的后续窗口事件 MUST NOT 造成动作循环或应用退出。

#### Scenario: 用户关闭已就绪的 launcher 窗口

- **WHEN** 默认全局快捷键已经成功注册
- **AND** 用户请求关闭主窗口
- **THEN** 系统阻止默认关闭行为
- **THEN** 系统通过统一动作边界隐藏主窗口
- **THEN** 应用进程继续运行

#### Scenario: launcher 主窗口失去焦点

- **WHEN** 默认全局快捷键已经成功注册
- **AND** 可见的主窗口失去焦点
- **THEN** 系统通过统一动作边界隐藏主窗口
- **THEN** 用户可以再次通过默认全局快捷键恢复窗口

### Requirement: Launcher 激活后必须恢复输入焦点

系统 MUST 在主窗口首次渲染时聚焦 launcher 输入。Rust 完成后续 `show` 动作后 MUST 向主窗口发送类型化激活事件，React MUST 订阅该事件并再次聚焦同一输入。事件载荷 MUST 使用稳定、可序列化的字段表示激活原因，MUST NOT 暴露原生窗口对象或 Rust 内部类型。React 卸载订阅者时 MUST 释放事件监听。

#### Scenario: 首次打开应用

- **WHEN** 最小 launcher 界面首次完成渲染
- **THEN** launcher 输入获得焦点
- **THEN** 用户可以立即输入文本

#### Scenario: 通过快捷键恢复 launcher

- **WHEN** 隐藏的主窗口通过默认全局快捷键显示
- **THEN** Rust 在窗口显示并请求焦点后发送激活事件
- **THEN** React 收到事件并聚焦 launcher 输入

#### Scenario: 重复显示 launcher

- **WHEN** 主窗口被多次隐藏和重新显示
- **THEN** 每次成功显示后 launcher 输入都恢复焦点
- **THEN** 系统不因重复显示而累积重复事件监听器

#### Scenario: React 界面卸载

- **WHEN** 订阅 launcher 激活事件的 React 界面卸载
- **THEN** 系统释放该界面的激活事件监听
- **THEN** 后续事件不再调用已卸载界面的焦点逻辑
