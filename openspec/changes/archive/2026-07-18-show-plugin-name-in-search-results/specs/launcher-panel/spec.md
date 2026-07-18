## MODIFIED Requirements

### Requirement: 搜索栏必须搜索已安装插件行为

启动器搜索栏 MUST 作为 launcher 固有内部入口搜索已安装插件暴露的 actions。系统 MUST 从插件 registry 中读取可用 actions，并将每个搜索结果映射到可执行的插件 action。搜索匹配范围 MUST 包含插件 action 标题、插件 action ID、插件 ID、插件英文名、当前应用语言下的插件名称以及该插件所有有效别名。每个结果的可见主标题 MUST 展示所属插件在当前应用语言下的名称；当前语言名称缺失时 MUST 回退英文名。系统 MUST NOT 将插件 action 标题作为搜索结果的可见主标题。搜索能力 MUST NOT 作为内建搜索插件注册。

#### Scenario: 输入插件 action 标题后展示结果

- **WHEN** 应用已加载插件 registry
- **AND** 用户在启动器搜索栏输入与某个插件 action 标题匹配的关键词
- **THEN** 内容主体展示“匹配结果”分区
- **THEN** 匹配结果包含该插件 action
- **THEN** 结果的可见主标题展示该 action 所属插件的当前语言名称，而不展示该 action 标题

#### Scenario: 输入插件英文名后展示所属 action

- **WHEN** 应用已加载插件 registry
- **AND** 用户在启动器搜索栏输入与某个插件英文名匹配的关键词
- **THEN** 内容主体展示“匹配结果”分区
- **THEN** 匹配结果包含该插件暴露的可打开 actions

#### Scenario: 输入当前语言插件名称后展示所属 action

- **WHEN** 应用已加载插件 registry
- **AND** 应用 locale 为 `zh-CN`
- **AND** 用户在启动器搜索栏输入与某个插件 `zh-CN` 名称匹配的关键词
- **THEN** 内容主体展示“匹配结果”分区
- **THEN** 匹配结果包含该插件暴露的可打开 actions
- **THEN** 每个结果的可见主标题展示该插件的 `zh-CN` 名称

#### Scenario: 当前语言插件名称缺失时搜索英文名

- **WHEN** 应用已加载插件 registry
- **AND** 应用 locale 对应的插件名称缺失
- **AND** 用户在启动器搜索栏输入与该插件英文名匹配的关键词
- **THEN** 内容主体展示“匹配结果”分区
- **THEN** 匹配结果包含该插件暴露的可打开 actions
- **THEN** 每个结果的可见主标题展示该插件的英文名

#### Scenario: 输入插件有效别名后展示所属 action

- **WHEN** 应用已加载插件 registry
- **AND** 用户在启动器搜索栏输入与某个插件有效别名匹配的关键词
- **THEN** 内容主体展示“匹配结果”分区
- **THEN** 匹配结果包含该插件暴露的可打开 actions

#### Scenario: 已禁用默认别名不参与搜索

- **WHEN** 应用已加载插件 registry
- **AND** 用户已在设置中删除某个插件默认别名
- **AND** 用户在启动器搜索栏输入该已删除默认别名
- **THEN** 系统不再因为该默认别名命中该插件 action

#### Scenario: 重新启用默认别名后参与搜索

- **WHEN** 应用已加载插件 registry
- **AND** 用户重新添加此前删除的默认别名
- **AND** 用户在启动器搜索栏输入该默认别名
- **THEN** 匹配结果包含该插件暴露的可打开 actions

#### Scenario: 输入插件 ID 后展示所属 action

- **WHEN** 应用已加载插件 registry
- **AND** 用户在启动器搜索栏输入与某个插件 ID 匹配的关键词
- **THEN** 内容主体展示“匹配结果”分区
- **THEN** 匹配结果包含该插件暴露的可打开 actions

#### Scenario: 点击搜索结果打开插件页面

- **WHEN** 用户点击某个插件 action 搜索结果
- **THEN** 系统通过现有插件 action dispatcher 触发该 action
- **THEN** 插件页面出口打开该 action 的目标页面
- **THEN** 插件页面独占搜索框下方的 launcher 主体区域

#### Scenario: 搜索无结果时展示空状态

- **WHEN** 应用已加载插件 registry
- **AND** 用户输入的关键词无法匹配任何插件 action、插件 ID、插件英文名、当前语言插件名称或有效别名
- **THEN** 内容主体展示搜索空状态
- **THEN** 系统 MUST NOT 展示表现层 mock 搜索结果

#### Scenario: 插件 registry 加载失败时展示错误

- **WHEN** 用户输入搜索词
- **AND** 插件 registry 加载失败
- **THEN** 内容主体展示可诊断的插件 registry 错误
- **THEN** 系统 MUST NOT 使用假数据伪装真实搜索结果
