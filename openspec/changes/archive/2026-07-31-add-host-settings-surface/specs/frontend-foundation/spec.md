## MODIFIED Requirements

### Requirement: The application must provide a product-owned React root interface

前端应用 MUST 渲染产品自有、语义化且可访问的 Launcher App Shell，MUST NOT
继续显示构建工具欢迎文案、示例交互或仅用于展示的模拟功能。App Shell MUST
使用当前语言显示 lensX 产品名称与描述，并 MUST 提供由本地 React 状态控制、
通过既有 Action Search 能力连接真实 Host Action Registry 的启动器输入。

没有活动页面时，空的规范化查询 MUST 选择 `home` 呈现状态，非空规范化查询
MUST 选择 `search` 呈现状态。`home` MUST 提供公共内容区域，但 MUST NOT
暗示推荐、最近使用或固定内容已经实现。`search` MUST 能够显示和操作真实注册
的 Action 结果。App Shell MUST 通过类型化 Host 边界请求与呈现状态对应的固定
窗口高度，使公共内容区域保持可见；MUST NOT 根据 DOM 测量或搜索结果数量调整
窗口高度。

存在已验证的活动页面时，`page` 呈现状态 MUST 优先于查询。可编辑的启动器输入
MUST 替换为不可搜索的页面上下文头部，公共内容区域 MUST 显示活动页面。头部
MUST 使用当前语言标识页面能力和打开它的 Action，并 MUST 提供返回 `home`
的可访问关闭控件。App Shell MUST NOT 把模拟 Action、未实现的插件入口、历史、
最近使用、固定内容或未实现的持久化描述为可用能力。

#### Scenario: 启动应用

- **WHEN** React 应用完成根渲染、没有活动页面且规范化查询为空
- **THEN** 页面包含可访问的主内容区域
- **THEN** 页面使用当前语言显示 lensX 产品名称与描述
- **THEN** 页面显示具有可访问名称和本地化占位文案的启动器输入
- **THEN** 公共内容区域显示主页呈现状态
- **THEN** App Shell 请求 `home` 固定呈现高度且主页内容在主窗口中可见
- **THEN** 页面不显示 Rsbuild 欢迎文案、示例交互、结果列表或虚构推荐

#### Scenario: 从启动器输入搜索

- **WHEN** 用户在没有活动页面时输入或删除启动器输入中的文本
- **THEN** 输入通过本地 React 状态反映当前文本
- **THEN** 非空规范化查询选择搜索呈现状态并在真实、不可变的 Action Registry
  快照上求值
- **THEN** 页面只显示既有 Action Search 结果或既有本地化空状态
- **THEN** App Shell 请求 `search` 固定呈现高度且不根据结果数量改变高度
- **THEN** 恢复为空的规范化查询选择主页呈现状态

#### Scenario: 操作真实 Action 结果

- **WHEN** 当前查询匹配已注册且启用的 Action
- **THEN** 页面通过可访问的键盘和指针交互暴露该结果
- **THEN** 执行结果时只把 `action_id` 路由到 Host Dispatcher，而不是从
  React 调用 executor

#### Scenario: 进入已验证页面

- **WHEN** 受信任 Host executor 成功打开已验证页面
- **THEN** App Shell 清除查询、搜索结果和搜索选择
- **THEN** App Shell 选择页面呈现状态
- **THEN** 顶部区域显示不可编辑的页面上下文头部，而不是启动器输入
- **THEN** 公共内容区域显示活动页面
- **THEN** App Shell 请求 `page` 固定呈现高度，使页面头部和内容区域同时可见

#### Scenario: 关闭活动页面

- **WHEN** 用户激活页面上下文头部的关闭控件
- **THEN** App Shell 清除活动页面并返回主页呈现状态
- **THEN** App Shell 请求恢复 `home` 固定呈现高度
- **THEN** 键盘焦点返回启动器输入

#### Scenario: 页面预检失败

- **WHEN** Host Action 在 App Shell 进入页面状态前请求缺失或不可用的页面
- **THEN** 当前主页或搜索呈现状态保持不变
- **THEN** 当前查询和选择保持不变
- **THEN** 用户收到本地化的安全失败反馈

#### Scenario: 检查不可用功能

- **WHEN** 用户查看 Launcher App Shell
- **THEN** 页面不显示模拟 Action、最近使用、固定内容、历史或未实现的插件入口
- **THEN** 页面不把计划中的能力描述为已经实现

## ADDED Requirements

### Requirement: 活动页面必须隔离内容故障且保留导航

公共内容区域 MUST 隔离进入活动页面后发生的故障。页面加载、渲染或运行时故障
MUST 保留页面呈现状态、页面上下文头部与关闭控件。失败界面 MUST 使用当前语言
和主题，并 MUST NOT 暴露错误堆栈或内部实现细节。

#### Scenario: 活动页面内容失败

- **WHEN** 活动页面在加载、渲染或运行期间失败
- **THEN** 公共内容区域显示本地化且可访问的页面失败界面
- **THEN** 页面上下文头部与关闭控件保持可用
- **THEN** App Shell 不自动返回主页
- **THEN** 失败界面不显示错误堆栈

#### Scenario: 离开失败页面

- **WHEN** 用户在页面失败界面可见时激活关闭控件
- **THEN** App Shell 清除失败的活动页面并返回主页
- **THEN** 键盘焦点返回启动器输入
