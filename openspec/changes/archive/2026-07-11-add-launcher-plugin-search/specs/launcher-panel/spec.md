## ADDED Requirements

### Requirement: 搜索栏必须搜索已安装插件行为

启动器搜索栏 MUST 作为 launcher 固有内部入口搜索已安装插件暴露的 actions。系统 MUST 从插件 registry 中读取可用 actions，并将每个搜索结果映射到可执行的插件 action。搜索能力 MUST NOT 作为内建搜索插件注册。

#### Scenario: 输入插件 action 标题后展示结果

- **WHEN** 应用已加载插件 registry
- **AND** 用户在启动器搜索栏输入与某个插件 action 标题匹配的关键词
- **THEN** 内容主体展示“匹配结果”分区
- **THEN** 匹配结果包含该插件 action
- **THEN** 结果展示该 action 标题和所属插件信息

#### Scenario: 输入插件名称后展示所属 action

- **WHEN** 应用已加载插件 registry
- **AND** 用户在启动器搜索栏输入与某个插件名称或插件 ID 匹配的关键词
- **THEN** 内容主体展示“匹配结果”分区
- **THEN** 匹配结果包含该插件暴露的可打开 actions

#### Scenario: 点击搜索结果打开插件页面

- **WHEN** 用户点击某个插件 action 搜索结果
- **THEN** 系统通过现有插件 action dispatcher 触发该 action
- **THEN** 插件页面出口打开该 action 的目标页面
- **THEN** 插件页面独占搜索框下方的 launcher 主体区域

#### Scenario: 搜索无结果时展示空状态

- **WHEN** 应用已加载插件 registry
- **AND** 用户输入的关键词无法匹配任何插件 action、插件名称或插件 ID
- **THEN** 内容主体展示搜索空状态
- **THEN** 系统 MUST NOT 展示表现层 mock 搜索结果

#### Scenario: 插件 registry 加载失败时展示错误

- **WHEN** 用户输入搜索词
- **AND** 插件 registry 加载失败
- **THEN** 内容主体展示可诊断的插件 registry 错误
- **THEN** 系统 MUST NOT 使用假数据伪装真实搜索结果

### Requirement: 插件搜索结果必须接入前端基座

插件搜索结果的用户可见文案 MUST 来自应用 i18n message。搜索结果 UI MUST 位于现有 Naive UI Provider、应用主题、Naive UI locale/dateLocale 同步机制之下，并 MUST 兼容 light 和 dark 主题。静态布局 MUST 优先使用 UnoCSS；语义样式、状态样式和主题变量桥接 MUST 使用 Less。

#### Scenario: 搜索结果文案来自应用 i18n

- **WHEN** 启动器展示插件搜索结果、空状态、错误状态或操作文案
- **THEN** 这些文案来自应用级 i18n message

#### Scenario: 搜索结果兼容明暗主题

- **WHEN** 应用主题在 light 与 dark 之间切换
- **THEN** 插件搜索结果的文本、背景、边框、hover 状态和 focus 状态保持可读
- **THEN** 页面不出现亮色硬编码导致的暗色主题冲突
