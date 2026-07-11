## MODIFIED Requirements

### Requirement: 插件系统必须提供统一插件 Contract

系统 MUST 为内建插件和外部插件提供统一插件 contract，至少包含插件 ID、本地化展示名、不可变默认别名、来源、生命周期策略、运行时策略、页面、行为、权限、SDK/Host API 兼容信息和 sidecar 预留信息。插件展示名 MUST 包含必填英文名，并 MUST 支持按应用当前语言读取本地化名称。插件来源 MUST 只描述插件来自内建包还是外部安装包，MUST NOT 隐含插件能否卸载或禁用；卸载和禁用能力 MUST 由生命周期策略显式表达。

#### Scenario: 注册内建插件元数据

- **WHEN** 系统加载来源为 `builtin` 的插件 contract
- **THEN** 系统通过统一插件 registry 注册该插件
- **THEN** 系统根据 lifecycle 字段判断插件是否可卸载和可禁用

#### Scenario: 注册外部插件元数据

- **WHEN** 系统读取来源为 `external` 的插件 manifest
- **THEN** 系统通过统一插件 registry 注册该插件
- **THEN** 系统根据同一套 display_names、default_aliases、pages、actions 和 permissions contract 暴露插件能力

#### Scenario: 来源不决定生命周期策略

- **WHEN** 插件来源为 `builtin`
- **THEN** 系统仍然 MUST 读取 lifecycle 字段决定是否允许禁用
- **THEN** 系统 MUST NOT 仅因为插件来源为 `builtin` 就推导所有生命周期策略

## ADDED Requirements

### Requirement: 插件展示名必须支持本地化并要求英文名

插件 manifest MUST 使用本地化展示名字段表达插件名称。英文名 MUST 必填且非空；其他语言名称 MAY 按 locale 提供。系统在展示插件名称时 MUST 优先使用当前应用 locale 对应名称，并在缺失时回退英文名。系统 MUST NOT 继续把单一不可本地化的 `name` 字段作为插件名称事实源。

#### Scenario: 英文名必填

- **WHEN** 插件 manifest 缺少英文展示名或英文展示名为空
- **THEN** 系统拒绝注册该插件
- **THEN** 系统返回可诊断的 manifest 名称错误

#### Scenario: 当前语言名称存在时使用当前语言

- **WHEN** 应用 locale 为 `zh-CN`
- **AND** 插件 manifest 同时提供英文名和 `zh-CN` 名称
- **THEN** 系统展示该插件的 `zh-CN` 名称

#### Scenario: 当前语言名称缺失时回退英文名

- **WHEN** 应用 locale 为 `zh-CN`
- **AND** 插件 manifest 只提供英文名
- **THEN** 系统展示该插件的英文名

### Requirement: 插件默认别名必须作为不可变搜索词

插件 manifest MAY 声明 `default_aliases` 作为默认搜索词数组。默认别名 MUST 由 manifest 提供并在注册后保持不可变；用户偏好只能隐藏或重新启用默认别名，MUST NOT 修改 manifest 本身。默认别名允许中英文混写，MUST NOT 要求按语言分组。单个插件内默认别名 MUST 使用 `trim + locale lowercase` 归一化后大小写不敏感去重。

#### Scenario: 接受中英文混写默认别名

- **WHEN** 插件 manifest 声明默认别名 `["settings", "preferences", "设置", "偏好"]`
- **THEN** 系统接受该默认别名数组
- **THEN** 系统将这些别名作为插件搜索词候选

#### Scenario: 拒绝重复默认别名

- **WHEN** 插件 manifest 声明默认别名 `["Settings", "settings"]`
- **THEN** 系统按归一化结果识别重复别名
- **THEN** 系统拒绝注册该插件并返回可诊断错误

#### Scenario: 默认别名不按语言分组

- **WHEN** 插件 manifest 声明默认别名
- **THEN** 系统将默认别名视为普通搜索词数组
- **THEN** 系统 MUST NOT 要求默认别名具备 locale key 或本地化结构
