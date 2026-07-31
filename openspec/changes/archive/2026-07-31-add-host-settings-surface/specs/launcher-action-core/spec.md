## ADDED Requirements

### Requirement: 默认 Registry 必须包含 Host 设置 Action

默认 Action 服务 MUST 注册 owner 为 `lensx.core`、已启用的
`lensx.core.open_settings` Action。其英文与简体中文标题、描述和搜索关键词
MUST 来自应用消息资源。公共描述符 MUST 继续只包含可序列化元数据，并 MUST
NOT 包含页面目标或可执行函数。

受信任 Host executor MUST 保持既有
`LauncherActionExecutor = () => Promise<void> | void` 合约，并 MUST 通过
与框架无关的应用导航服务请求 `lensx.core/settings` Host 页面。React 结果组件
MUST 继续只分派 Action ID。

#### Scenario: 创建默认 Action 服务

- **WHEN** Host 创建默认启动器 Action 服务
- **THEN** Registry 包含 `lensx.core.open_settings`
- **THEN** 描述符已启用并通过身份、归属、本地化、关键词和序列化验证
- **THEN** 描述符不暴露页面目标或 executor

#### Scenario: 找到设置 Action

- **WHEN** 受支持语言的查询匹配设置 Action 的标题、描述或关键词
- **THEN** Action Search 返回真实的 `lensx.core.open_settings` 描述符
- **THEN** 结果使用应用消息中的本地化元数据

#### Scenario: 执行设置 Action

- **WHEN** Dispatcher 执行 `lensx.core.open_settings`
- **THEN** 受信任 Host executor 请求应用导航服务打开 owner `lensx.core`、
  page `settings`
- **THEN** 请求记录 `lensx.core.open_settings` 为打开页面的 Action
- **THEN** React 组件不直接接收或调用 executor
- **THEN** 页面预检与打开成功时 Dispatcher 返回既有类型化成功结果

#### Scenario: 设置页面无法打开

- **WHEN** 应用导航服务因为设置页面缺失、不可用或没有活动 App Shell 处理器而
  拒绝请求
- **THEN** executor 报告执行失败
- **THEN** Dispatcher 返回 `action_execution_failed`
- **THEN** 公共 Action 与 Dispatcher 合约保持不变
