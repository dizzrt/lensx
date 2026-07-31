## MODIFIED Requirements

### Requirement: The launcher main window must use a compact native window shape

系统 MUST 将带有 `main` 标签的主窗口配置为固定 650px 宽、初始 240px 高、
最小 180px 高、最大 800px 高的 launcher 窗口。窗口 MUST 无系统边框、不可由
用户缩放、非全屏、透明且保持置顶。

Host MUST 通过 Rust 校验的类型化边界，为 App Shell 的 `home`、`search` 和
`page` 呈现状态分别使用 240px、480px 和 600px 的固定离散高度。系统 MUST NOT
接受前端提供的任意尺寸，MUST NOT 根据 DOM 测量或搜索结果数量改变原生窗口高度。

#### Scenario: 启动桌面应用

- **WHEN** lensX 创建主窗口并进入 `home` 呈现状态
- **THEN** 主窗口宽度为 650px、初始高度为 240px
- **THEN** 主页公共内容区域在窗口中可见
- **THEN** 窗口无系统边框、保持置顶且不能由用户手动缩放或进入全屏

#### Scenario: 搜索 Action

- **WHEN** App Shell 从 `home` 进入 `search` 呈现状态
- **THEN** Host 请求把主窗口设置为固定 480px 高
- **THEN** 搜索结果在窗口内部的有界区域滚动
- **THEN** 窗口高度不随结果数量变化

#### Scenario: 打开 Host 页面

- **WHEN** App Shell 进入 `page` 呈现状态
- **THEN** Host 请求把主窗口设置为固定 600px 高
- **THEN** 页面上下文头部与公共页面内容区同时可见

#### Scenario: 关闭 Host 页面

- **WHEN** App Shell 关闭活动页面并返回 `home`
- **THEN** Host 请求把主窗口恢复为固定 240px 高
- **THEN** launcher 输入与主页公共内容区保持可见

#### Scenario: 提交不支持的呈现模式

- **WHEN** Tauri 边界收到 `home`、`search`、`page` 之外的模式
- **THEN** Rust 拒绝请求
- **THEN** 前端不能使用该边界提交任意窗口宽高

#### Scenario: 原生高度切换失败

- **WHEN** Rust 无法解析主窗口或设置对应的固定高度
- **THEN** 命令返回包含稳定错误码、模式、操作和安全消息的可序列化错误
- **THEN** 当前 App Shell 状态不被清除
