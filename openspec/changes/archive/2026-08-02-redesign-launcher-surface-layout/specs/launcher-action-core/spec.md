## MODIFIED Requirements

### Requirement: Launcher actions must use validatable, serializable descriptors

系统 MUST 为每个 Launcher Action 提供 plain-data descriptor。Descriptor MUST 至少包含 `action_id`、`owner_id`、本地化 `title`、可选本地化 `description`、按 locale 分组的 `default_keywords` 与 `enabled`，并 MAY 包含可选的 Host-owned 展示 `icon`。Icon 若存在，MUST 是由固定 `kind` 与通过验证的稳定 token 构成的可序列化 plain data；它 MUST NOT 是 ReactNode、函数、任意 URL、未验证文件路径或 Provider 私有对象。

Descriptor MUST 可序列化，且 MUST NOT 包含 executor、函数、React 状态、Tauri window、Rust internal type 或其他不可序列化值。注册前，系统 MUST 验证未知输入，并返回按 JSON Pointer path 和稳定 code 排序的结构化 diagnostics。Registry lookup、clone 和 snapshot MUST 保留有效 icon 元数据，同时继续隔离 executor。

#### Scenario: Accept a valid descriptor

- **WHEN** Host 注册的 descriptor 具有合法字段类型、身份、归属、本地化文本、关键词、enabled 状态和可选合法 Host icon token
- **THEN** validation boundary 返回规范化 plain-data descriptor
- **THEN** descriptor 可独立于 executor 序列化
- **THEN** Registry snapshot 保留可选 icon 元数据但不包含 executor
- **THEN** validation boundary 不返回 diagnostics

#### Scenario: Accept a descriptor without an icon

- **WHEN** 一个合法 descriptor 没有提供可选 icon
- **THEN** 系统接受该 descriptor
- **THEN** 展示层使用稳定的通用 Action 回退图标
- **THEN** Action 标题仍作为可访问名称

#### Scenario: Reject invalid icon metadata

- **WHEN** descriptor icon 包含未知 kind、非法 token、ReactNode、函数、任意 URL、未验证路径或未知字段
- **THEN** 系统拒绝该 descriptor
- **THEN** 系统返回带稳定 code 和对应 JSON Pointer path 的 diagnostic
- **THEN** Registry 不保存该输入

#### Scenario: Reject unknown or non-serializable fields

- **WHEN** descriptor 包含未知字段、函数、class instance 或 contract 未声明的其他值
- **THEN** 系统拒绝该 descriptor
- **THEN** 系统返回带稳定 code 和对应 JSON Pointer path 的 diagnostic
- **THEN** Registry 不保存该输入

#### Scenario: Keep multiple descriptor errors in deterministic order

- **WHEN** 一个 descriptor 包含多个可以安全聚合的错误
- **THEN** 系统返回所有可安全聚合的结构化 diagnostics
- **THEN** diagnostics 使用确定的 path 和 code 排序
- **THEN** 调用者无需检查 diagnostic message 即可确定错误类型

