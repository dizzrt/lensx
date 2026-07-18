## ADDED Requirements

### Requirement: 系统必须持久化最近使用的 action

系统 MUST 以 plugin action 的 `action_id` 记录最近使用入口，并将记录持久化到 Rust/Tauri 管理的应用偏好。只有 action 已通过 launcher dispatcher 成功打开目标页面后，系统才 MUST 记录该 action。最近使用列表 MUST 按最近成功打开时间倒序、按 `action_id` 去重，并且 MUST 最多保留 10 项。

#### Scenario: 成功打开 action 后记录最近使用

- **WHEN** 用户通过 launcher 成功打开一个已注册 action 的目标页面
- **THEN** 系统将该 action 的 `action_id` 写入最近使用列表首位
- **THEN** 更新后的列表在应用重启后仍可恢复

#### Scenario: 重复打开 action 不产生重复记录

- **WHEN** 最近使用列表已包含某个 `action_id`
- **AND** 用户再次成功打开该 action
- **THEN** 系统仅保留该 `action_id` 的一个记录
- **THEN** 该记录移动到最近使用列表首位

#### Scenario: 最近使用列表达到上限

- **WHEN** 最近使用列表已包含 10 个不同 action
- **AND** 用户成功打开第 11 个不同 action
- **THEN** 系统保留新 action 和最近的其余 9 个 action
- **THEN** 最旧的 action 记录被移除

#### Scenario: 旧偏好文件没有历史字段

- **WHEN** 系统读取不包含最近使用或固定项字段的旧偏好文件
- **THEN** 系统将最近使用和固定项视为空列表
- **THEN** 系统继续保留该文件中已有的主题和插件别名偏好

### Requirement: 系统必须持久化 action 固定项

系统 MUST 以 `action_id` 持久化用户固定的 action。固定列表 MUST 按最近固定时间倒序且按 `action_id` 去重。固定和取消固定 MUST 是独立于打开 action 的操作；固定 action 本身 MUST NOT 自动写入最近使用列表。

#### Scenario: 用户固定 action

- **WHEN** 用户在 launcher action 卡片上固定一个当前未固定的 action
- **THEN** 系统将该 action 的 `action_id` 写入固定列表首位
- **THEN** 更新后的固定状态在应用重启后仍可恢复

#### Scenario: 用户取消固定 action

- **WHEN** 用户在 launcher action 卡片上取消固定一个 action
- **THEN** 系统从固定列表中移除该 `action_id`
- **THEN** 系统不修改最近使用列表

#### Scenario: 重新固定 action 的排序

- **WHEN** 用户曾取消固定某个 action
- **AND** 用户再次固定该 action
- **THEN** 系统仅保留该 action 的一个固定记录
- **THEN** 该记录位于固定列表首位

### Requirement: 系统必须容忍陈旧的 action 记录

系统 MUST 使用当前 plugin registry 解析持久化的 `action_id` 后再将其展示为 launcher 条目。系统 MUST 忽略当前 registry 中不存在的 action 或其所属插件，不得在读取记录时隐式删除对应的偏好数据。

#### Scenario: 已移除 action 留在历史中

- **WHEN** 最近使用或固定项包含当前 plugin registry 中不存在的 `action_id`
- **THEN** launcher 不展示该 action 的卡片
- **THEN** 系统不因读取该记录而修改持久化偏好文件

#### Scenario: action 所属插件不可用

- **WHEN** 最近使用或固定项引用的 action 存在但其所属插件无法从当前 registry 解析
- **THEN** launcher 不展示该 action 的卡片
- **THEN** 其余可解析的 action 保持原有持久化顺序

### Requirement: 使用记录持久化失败不得阻塞已打开的 action

系统 MUST 将成功打开 action 与更新使用记录分离。最近使用记录写入失败时，系统 MUST 保持已打开的目标页面；固定状态写入失败时，系统 MUST 保持写入前的固定状态。两类失败均 MUST 向用户展示可诊断的应用级 i18n 错误文案。

#### Scenario: 最近使用写入失败

- **WHEN** action 已成功打开目标页面
- **AND** 最近使用记录的持久化操作失败
- **THEN** 目标页面保持打开
- **THEN** launcher 展示可诊断的持久化错误

#### Scenario: 固定状态写入失败

- **WHEN** 用户固定或取消固定 action
- **AND** 固定状态的持久化操作失败
- **THEN** launcher 保持写入前的固定状态
- **THEN** launcher 展示可诊断的持久化错误
