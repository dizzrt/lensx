## MODIFIED Requirements

### Requirement: Plugin author Manifests must be strict and versioned inputs

系统 MUST 接受 JSON 对象形式的外部插件作者 Manifest，并 MUST 要求 `manifest_version` 精确匹配 Host 支持的 `0.1.0` 协议版本。Manifest 顶层 MUST 包含 `plugin_id`、`version`、`display`、`publisher`、`compatibility`、`runtime` 和 `contributes`。Schema 声明范围外的字段以及任意显式 `null` MUST 被拒绝。作者 Manifest MUST NOT 包含 Host-owned 的来源、生命周期、启用状态、安装状态、兼容性结果、运行时状态、权限授予、签名或更新事实。系统 MUST NOT 通过兼容 alias、fallback Schema 或迁移路径接受其他 Manifest 协议值。

#### Scenario: Accept a complete first-version Manifest

- **WHEN** 作者输入包含 `manifest_version: "0.1.0"`、所有必需结构以及通过语义校验的值
- **THEN** 系统把输入识别为结构和语义均合法的 Manifest
- **THEN** 系统不会把作者输入视为已安装或已启用的插件

#### Scenario: Reject an unsupported Manifest protocol version

- **WHEN** 作者输入包含 `0.1.0` 以外的任意 `manifest_version`
- **THEN** 系统拒绝该 Manifest
- **THEN** diagnostic 指向 `/manifest_version`
- **THEN** 系统不会通过其他协议契约翻译或重试该输入

#### Scenario: Reject an unknown field

- **WHEN** 作者输入在任一严格对象中包含 Schema 未声明的字段
- **THEN** 系统拒绝该 Manifest
- **THEN** diagnostic 指向未知字段的 JSON Pointer

#### Scenario: Reject an explicit null value

- **WHEN** 作者把必需或可选字段显式设置为 `null`
- **THEN** 系统拒绝该 Manifest
- **THEN** 系统不会把 `null` 视为字段缺失或默认空集合

#### Scenario: Reject author-declared Host state

- **WHEN** 作者 Manifest 包含 `source`、`lifecycle`、`enabled`、`granted_permissions` 或其他 Host-owned 状态
- **THEN** 系统把对应字段作为未知字段拒绝
- **THEN** 作者不能通过 Manifest 获得受信任状态或权限

### Requirement: Compatibility status must be separate from Manifest validity

当前 LensX 与 Host API 协议版本 MUST 均从 `0.1.0` 开始。LensX 与 Host API 兼容范围 MUST 分别包含合法 SemVer `min_version` 和 `max_version_exclusive`，并且最小版本 MUST 严格小于排他的最大版本。当当前版本满足 `min_version <= current_version < max_version_exclusive` 时，对应维度兼容。若结构和语义均合法的 Manifest 有任一当前版本位于声明范围之外，系统 MUST 返回 `incompatible` 而不是 `invalid`。兼容性 MUST 只依据声明范围和当前 `0.1.0` 基线判断；系统 MUST NOT 识别或转换任何更早的实验 Host API 版本。

#### Scenario: Initial current versions are within both ranges

- **WHEN** 当前 LensX 与 Host API 版本均为 `0.1.0`，并分别位于声明的半开区间内
- **THEN** 系统把合法 Manifest 分类为 `compatible`

#### Scenario: A current version is outside its range

- **WHEN** 当前 LensX 或 Host API `0.1.0` 位于对应声明的半开区间之外
- **THEN** 系统把合法 Manifest 分类为 `incompatible`
- **THEN** 系统不会使用 alias 或迁移规则满足该范围

#### Scenario: A current version equals its exclusive upper bound

- **WHEN** 当前 LensX 或 Host API 版本等于对应的 `max_version_exclusive`
- **THEN** 系统把合法 Manifest 分类为 `incompatible`
- **THEN** 系统不会把 Manifest 错误报告为结构损坏

#### Scenario: A compatibility range is empty or inverted

- **WHEN** 任一范围满足 `min_version >= max_version_exclusive`
- **THEN** 系统把 Manifest 分类为 `invalid`
- **THEN** diagnostic 指向无效兼容范围
