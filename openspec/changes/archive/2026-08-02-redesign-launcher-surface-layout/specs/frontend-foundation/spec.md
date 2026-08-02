## MODIFIED Requirements

### Requirement: The application must provide a product-owned React root interface

Frontend application MUST 渲染 product-owned、semantic 且 accessible 的 Launcher App Shell，并 MUST NOT 继续显示 build-tool welcome copy、示例交互、presentation-layer mock feature、独立产品标题或产品介绍文本。App Shell MUST 在统一顶部区域中显示搜索输入或页面上下文，并 MUST 在最右侧显示圆形 avatar 视觉占位。Avatar MUST 是非交互装饰元素，MUST NOT 提供账户、菜单、通知、点击、hover、focus 或 accessible action 语义。

当没有活动页面时，空的规范化查询 MUST 选择 `home` 呈现状态，非空规范化查询 MUST 选择 `search` 呈现状态。`home` MUST 在共享内容区依次显示“最近使用”和“已固定”两个真实 Action 集合，并 MUST 在“已固定”标题右侧显示非交互“全部”占位。首页 MUST NOT 使用模拟 Action、Registry 默认顺序、推荐或市场内容填充集合。`search` MUST 能够显示并操作真实注册 Action 的单一“搜索结果”网格。App Shell MUST 通过类型化 Host boundary 请求当前呈现状态的固定窗口高度，以保证共享内容区可见；它 MUST NOT 根据 DOM 测量或 Action/搜索结果数量调整窗口。

当 validated page 活动时，`page` 呈现状态 MUST 优先于查询。与搜索输入位于相同顶部槽位的 non-searchable page-context bar MUST 替换 editable launcher input，共享内容区 MUST 显示活动页面。Context bar MUST 在当前 locale 中标识所属方名称和打开页面的 Action 名称，并 MUST 提供 accessible close icon button 返回 `home`。App Shell MUST NOT 把 avatar、“全部”、插件入口或其他未实现能力呈现为可操作功能。

#### Scenario: Start the application

- **WHEN** React application 在没有活动页面且规范化查询为空时完成 root render
- **THEN** 页面包含 accessible main content region
- **THEN** 页面顶部显示带 accessible name 与本地化 placeholder 的 launcher input
- **THEN** 页面顶部最右侧显示非交互圆形 avatar 占位
- **THEN** 共享内容区显示 home 呈现状态中的“最近使用”和“已固定”分区
- **THEN** “全部”随“已固定”标题显示但不是 button、链接或可聚焦元素
- **THEN** App Shell 请求固定 `home` 呈现高度，且 home 内容在主窗口内可见
- **THEN** 页面不显示 lensX 标题/介绍、Rsbuild welcome copy、示例交互、搜索结果或虚构推荐

#### Scenario: Search from the launcher input

- **WHEN** 用户在无活动页面时输入或删除 launcher input 文本
- **THEN** input 通过本地 React state 反映当前文本
- **THEN** 非空规范化查询选择 search 呈现状态，并根据真实 immutable Action Registry snapshot 求值
- **THEN** 页面只显示 accepted Action Search 结果网格或 accepted 本地化空状态
- **THEN** App Shell 请求固定 `search` 呈现高度，且不根据结果数量改变高度
- **THEN** 恢复空规范化查询后选择 home 呈现状态并显示真实 Action 集合

#### Scenario: Operate a real Action result

- **WHEN** 当前查询匹配一个已注册且启用的 Action
- **THEN** 页面通过 accessible keyboard 和 pointer 交互公开该真实结果
- **THEN** 执行结果时通过 Host Dispatcher 路由 `action_id`，而不是从 React 调用 executor

#### Scenario: Enter a validated page

- **WHEN** trusted Host executor 成功打开 validated page
- **THEN** App Shell 清空查询、搜索结果和搜索选择
- **THEN** App Shell 选择 page 呈现状态
- **THEN** 顶部槽位显示 non-editable page-context bar，而不是 launcher input
- **THEN** context bar 显示所属方名称、打开页面的 Action 名称和 close icon button
- **THEN** 圆形 avatar 占位继续显示且保持非交互
- **THEN** 共享内容区显示活动页面
- **THEN** App Shell 请求固定 `page` 呈现高度，使 context bar 与内容区同时可见

#### Scenario: Close the active page

- **WHEN** 用户激活 page-context bar 中的 close icon button
- **THEN** App Shell 清除活动页面并返回 home 呈现状态
- **THEN** App Shell 请求固定 `home` 呈现高度
- **THEN** keyboard focus 返回 launcher input

#### Scenario: Page preflight fails

- **WHEN** Host Action 在 App Shell 进入 page 状态前请求缺失或不可用页面
- **THEN** 当前 home 或 search 呈现状态保持不变
- **THEN** 当前查询与选择保持不变
- **THEN** 用户收到本地化、安全的失败反馈

#### Scenario: Inspect non-interactive placeholders

- **WHEN** 用户或辅助技术检查 Launcher App Shell
- **THEN** avatar 与“全部”占位不具有 button、链接、菜单触发器或键盘焦点语义
- **THEN** 页面不描述这些占位具有账户、导航或管理能力

#### Scenario: Inspect unavailable features

- **WHEN** 用户查看 Launcher App Shell
- **THEN** 页面不显示模拟 Action、推荐、市场内容或未实现插件入口
- **THEN** 最近使用与已固定只显示 accepted Launcher Action collections 解析出的真实 Action
- **THEN** 页面不把 planned capability 描述为已实现

