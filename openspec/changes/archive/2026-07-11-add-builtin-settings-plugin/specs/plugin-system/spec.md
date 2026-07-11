## ADDED Requirements

### Requirement: 插件系统必须注册内建设置插件

系统 MUST 将 `lensx.core.settings` 作为内建插件注册到默认插件 registry。该插件 MUST 使用统一插件 contract 声明 runtime、pages、actions 和 lifecycle，并 MUST 通过现有内建 Vue module 页面加载机制渲染。

#### Scenario: 默认 registry 包含内建设置插件

- **WHEN** 系统加载默认插件 registry
- **THEN** registry 包含 ID 为 `lensx.core.settings` 的内建插件
- **THEN** 该插件来源为 `builtin`
- **THEN** 该插件 runtime 为 `vue_module`

#### Scenario: 设置插件页面和行为通过统一 contract 校验

- **WHEN** 系统注册内建设置插件
- **THEN** 系统使用现有三段式 ID 校验规则校验插件、页面和行为 ID
- **THEN** 系统使用现有引用校验规则校验 `plugin_id`、`parent_page_id` 和 `target_page_id`

#### Scenario: 设置 action 打开设置主页面

- **WHEN** 用户触发 `lensx.core.settings_action_open`
- **THEN** 插件 action dispatcher 定位到 `lensx.core.settings_page_main`
- **THEN** 插件页面出口加载该页面对应的内建 Vue module
