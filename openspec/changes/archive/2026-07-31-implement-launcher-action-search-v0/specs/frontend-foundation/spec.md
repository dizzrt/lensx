## MODIFIED Requirements

### Requirement: The application must provide a product-owned React root interface

前端应用 MUST 渲染项目自有、语义化且可访问的 Launcher App Shell，MUST NOT 继续显示构建工具欢迎文案、示例交互或展示层模拟功能。App Shell MUST 使用当前 locale 显示 lensX 产品身份与描述，并 MUST 提供受本地状态控制的 Launcher 输入，通过已接受的 Action Search capability 连接真实的 Host-owned Action Registry。非空查询 MUST 能够展示和操作真实的已注册 Action 结果，空查询 MUST NOT 暗示推荐、最近使用或固定内容。App Shell MUST NOT 把模拟 Action、尚未实现的插件入口、设置、历史或持久化表现为可用。

#### Scenario: 启动应用

- **WHEN** React 应用以空查询完成根节点渲染
- **THEN** 页面包含可访问的 main 内容区域
- **THEN** 页面使用当前 locale 显示 lensX 产品身份和产品描述
- **THEN** 页面显示具有可访问名称和本地化 placeholder 的 Launcher 输入
- **THEN** 页面不显示 Rsbuild 欢迎文案、示例交互、结果列表或虚构推荐

#### Scenario: 从 Launcher 输入搜索

- **WHEN** 用户在 Launcher 输入中输入或删除文本
- **THEN** 输入通过本地 React 状态反映当前文本
- **THEN** 非空查询针对真实且不可变的 Action Registry snapshot 求值
- **THEN** 页面只显示已接受的 Action Search 结果或已接受的本地化空状态

#### Scenario: 操作真实 Action 结果

- **WHEN** 当前查询匹配一个已注册且启用的 Action
- **THEN** 页面通过可访问的键盘和指针交互公开该结果
- **THEN** 执行结果时通过 Host Dispatcher 路由其 `action_id`，而不是从 React 调用 executor

#### Scenario: 检查不可用功能

- **WHEN** 用户查看 Launcher App Shell
- **THEN** 页面不显示模拟 Action、设置入口、最近使用、固定内容或插件入口
- **THEN** 页面不把规划中的 capability 描述为已实现
