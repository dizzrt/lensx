## MODIFIED Requirements

### Requirement: The launcher main window must use a compact native window shape

系统 MUST 将 label 为 `main` 的 main window 配置为固定宽度 650px、初始高度 320px、最小高度 180px、最大高度 800px 的 launcher window。Window MUST undecorated、non-resizable、non-fullscreen、transparent 且 always on top。

通过 Rust-validated typed boundary，Host MUST 为 App Shell 的 `home`、`search`、`page` 呈现状态分别使用 320px、480px、600px 固定离散高度。系统 MUST NOT 接受 frontend 提交的任意 dimensions，也 MUST NOT 根据 DOM measurements、首页集合数量或 search-result counts 改变 Native window height。

#### Scenario: Start the desktop application

- **WHEN** lensX 创建 main window 并进入 `home` 呈现状态
- **THEN** main window 以 650px 宽度和 320px 初始高度显示
- **THEN** launcher input、最近使用与已固定 shared content region 在 window 中可见
- **THEN** main window undecorated 且保持 always on top
- **THEN** 用户不能手动调整 main window 大小或进入 fullscreen

#### Scenario: Search Actions

- **WHEN** App Shell 从 `home` 移动到 `search` 呈现状态
- **THEN** Host 请求 480px 固定 main-window height
- **THEN** 最多八项的搜索结果 grid 在 window 内有界显示
- **THEN** window height 不随 result 数量变化

#### Scenario: Open a Host page

- **WHEN** App Shell 进入 `page` 呈现状态
- **THEN** Host 请求 600px 固定 main-window height
- **THEN** page-context bar 与 shared page content region 同时可见

#### Scenario: Close a Host page

- **WHEN** App Shell 关闭 active page 并返回 `home`
- **THEN** Host 请求恢复 320px 固定 main-window height
- **THEN** launcher input、最近使用与已固定 shared content region 保持可见

#### Scenario: Home collections change

- **WHEN** 最近使用或已固定集合在 `home` 状态中从空变为非空或改变项数
- **THEN** main window 保持 320px 固定高度
- **THEN** frontend 不测量 DOM 或提交另一高度

#### Scenario: Submit an unsupported presentation mode

- **WHEN** Tauri boundary 收到 `home`、`search`、`page` 之外的 mode
- **THEN** Rust 拒绝该请求
- **THEN** frontend 不能通过该 boundary 提交任意 window dimensions

#### Scenario: Native height transition fails

- **WHEN** Rust 无法解析 main window 或为 requested mode 设置固定高度
- **THEN** command 返回包含稳定 code、mode、operation 与安全 message 的可序列化 error
- **THEN** 当前 App Shell state 不被清除

