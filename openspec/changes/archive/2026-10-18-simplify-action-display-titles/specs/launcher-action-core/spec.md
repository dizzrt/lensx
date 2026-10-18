# Spec Delta

## ADDED Requirements

### Requirement: Action titles MUST express user-facing entry names

Action 的 `title` MUST 表示供用户识别和选择的主要展示名称，不要求使用动词句式。项目维护的页面或工具入口 MUST 使用可区分的目的地名称，省略仅重复进入行为的“打开 / Open”；实际执行操作的入口 MUST 保留表达操作含义所需的动词。文案变更 MUST 保留 Action 的稳定身份和执行语义。

#### Scenario: A maintained entry opens a destination

- **WHEN** 项目维护的 Action 仅用于进入一个工具或页面
- **THEN** 标题使用用户能够识别该目的地的名称
- **THEN** 不因该入口可以执行就额外添加通用“打开 / Open”前缀

#### Scenario: A maintained Action performs an operation

- **WHEN** 用户选择执行隐藏启动器窗口的 Action
- **THEN** 标题仍为 `Hide launcher` / `隐藏启动器`
- **THEN** 命名规则不会移除表达隐藏操作的动词或改变执行行为

#### Scenario: A renamed entry already appears in collections

- **WHEN** Recent 或 Pinned 中存在标题已更新 Action 的稳定 ID
- **THEN** 该记录继续解析为同一 Action，并显示当前 locale 的新标题
- **THEN** 通过搜索、集合或键盘激活仍执行同一操作；标题继续提供对应入口的 accessible name，并沿用既有主题和焦点语义

### Requirement: Entry title simplification MUST NOT introduce legacy search aliases

维护的入口标题简化时，系统及其作者工具 MUST NOT 将被替换的完整标题或为兼容而补充的“打开 / Open”写入 `default_keywords`，也 MUST NOT 引入隐藏别名或额外搜索来源。此次设置、ConfigLens 和模板改名 MUST 保留既有功能关键词。匹配与评分 MUST 继续仅使用当前声明的标题和关键词；不保证旧完整标题仍可命中。

#### Scenario: Search uses the simplified metadata

- **WHEN** 用户按新标题或既有功能关键词搜索已经改名的入口
- **THEN** 系统按既有跨语言规则匹配当前标题和关键词
- **THEN** 评分可因新标题自然变化，description 不参与匹配或评分

#### Scenario: An old full title has no remaining searchable match

- **WHEN** 受控快照中仅有已改名的目标 Action，且旧完整标题的至少一个查询 token 在当前标题和既有关键词中均无匹配
- **THEN** 旧完整标题不返回该 Action
- **THEN** 系统不会通过旧标题别名、自动补前缀或 description 恢复匹配

## MODIFIED Requirements

### Requirement: The default registry must contain the Host settings Action

默认 Action 服务 MUST 注册 owner 为 `lensx.core`、启用的 `lensx.core.open_settings` Action。其英文和简体中文标题、说明及搜索关键词 MUST 来自应用消息资源；标题 MUST 分别为 `Settings` 和 `设置`。公开描述符 MUST 只包含可序列化元数据，MUST NOT 包含页面目标或可执行函数。

可信 Host executor MUST 保留 `LauncherActionExecutor = () => Promise<void> | void` 契约，并通过与框架无关的应用导航服务请求 `lensx.core/settings` Host 页面。React 结果组件 MUST 继续仅分发 Action ID。

#### Scenario: Create the default Action service

- **WHEN** Host 创建默认 Launcher Action 服务
- **THEN** Registry 包含 `lensx.core.open_settings`
- **THEN** 描述符处于启用状态，并通过身份、归属、本地化、关键词和序列化校验
- **THEN** 描述符不暴露页面目标或 executor，英文标题为 `Settings`，简体中文标题为 `设置`

#### Scenario: Find the settings Action

- **WHEN** 支持语言中的查询匹配设置 Action 任一已声明语言的标题或关键词
- **THEN** Action Search 返回实际 `lensx.core.open_settings` 描述符
- **THEN** 结果使用当前界面语言的应用消息，description 不作为搜索来源

#### Scenario: Execute the settings Action

- **WHEN** Dispatcher 执行 `lensx.core.open_settings`
- **THEN** 可信 Host executor 请求应用导航服务打开 owner `lensx.core`、page `settings`
- **THEN** 请求记录打开页面的 Action 为 `lensx.core.open_settings`
- **THEN** React 组件不直接接收或调用 executor
- **THEN** 页面预检和打开成功时，Dispatcher 返回既有类型化成功结果，页面 Action 上下文显示当前 locale 的 `Settings` 或 `设置`

#### Scenario: The settings page cannot open

- **WHEN** 应用导航服务因设置页面不存在、不可用或没有活跃 App Shell handler 而拒绝请求
- **THEN** executor 报告执行失败
- **THEN** Dispatcher 返回 `action_execution_failed`
- **THEN** 公开 Action 与 Dispatcher 契约保持不变
