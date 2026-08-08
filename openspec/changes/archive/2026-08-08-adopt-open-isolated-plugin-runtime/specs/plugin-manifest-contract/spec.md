## MODIFIED Requirements

### Requirement: Plugin author Manifests must be strict and versioned inputs

插件 author Manifest MUST 是严格、versioned、JSON Schema 驱动的输入，当前版本 MUST 为 `0.2.0`。Schema MUST 拒绝未知字段，包括旧 `requested_permissions`、Page `required_permissions`、Host source、grant、trust、signature、lifecycle、sandbox、CSP 与 Host bridge 配置。Manifest、Host API、package protocol 和 application version MUST 独立演进。

#### Scenario: 接受当前 Manifest
- **WHEN** author input 声明 `manifest_version: "0.2.0"` 并满足当前严格 Schema
- **THEN** Contract 验证并规范化该输入且不产生 permission 或 Host authority
- **THEN** 缺失的可选普通集合按当前规范归一化为空集合

#### Scenario: 旧 Manifest 请求权限
- **WHEN** author input 声明 `manifest_version: "0.1.0"`、`requested_permissions` 或 Page `required_permissions`
- **THEN** 当前 Contract 将其分类为 unsupported version 或 unknown field
- **THEN** Host 不静默忽略、迁移或把旧声明解释为开放 Web 或原生 authority

#### Scenario: Author 尝试声明 Host Web policy
- **WHEN** Manifest 声明 CSP、sandbox、network allowlist、Worker policy、Tauri bridge 或 Host command
- **THEN** Schema 拒绝未知字段
- **THEN** 开放 Web 与 Host isolation 继续由当前 Runtime Contract 定义

### Requirement: Page contributions must form a valid plugin-local navigation graph

每个 external plugin MUST 至少贡献一个 Page。每个 Page MUST 包含唯一 local `id`、localized `title` 和 plugin-internal `route`，且 MAY 包含 `parent_page_id` 与 asset icon；MUST NOT 包含 `required_permissions` 或其他 grant gate。local ID、route、parent reference 与 acyclic graph MUST 继续满足现有 plugin-local navigation 规则。

#### Scenario: 接受多个无权限 Page
- **WHEN** Manifest 声明 `home` 与 `settings` Page，并把 `home` 设为 `settings` 的 parent
- **THEN** 系统接受集合和 parent relationship
- **THEN** 每个 Page 的可用性不依赖 lensX permission request 或 grant

#### Scenario: Page 声明旧权限 gate
- **WHEN** Page 包含 `required_permissions`
- **THEN** 系统把该字段作为 unknown field 拒绝
- **THEN** Page 不会形成表面存在但由已删除 grant 控制的导航状态

#### Scenario: Page graph 无效
- **WHEN** Page 缺少、ID 重复、route 外部化、parent 缺失或 parent graph 成环
- **THEN** 系统拒绝整个 Manifest 并产生稳定 JSON Pointer diagnostic
- **THEN** 删除权限字段不放宽 Page identity 或内部导航规则

### Requirement: User-visible metadata must be localized with English fallback
Localized metadata MUST 覆盖 plugin/Page/Action/description，不再存在 permission reason locale field。

#### Scenario: locale fallback
- **WHEN** zh-CN 缺失
- **THEN** current user-visible field fallback en-US 且无 permission copy

### Requirement: Normalization and diagnostics must be deterministic and cross-language consistent
Normalizer MUST 只为 current optional collections 建默认值；legacy `requested_permissions|required_permissions` MUST reject 而不是 normalize empty。

#### Scenario: legacy field
- **WHEN** author input 包含 removed permission field
- **THEN** TypeScript/Rust 返回相同 strict diagnostic

### Requirement: Author Manifests, normalized Manifests, and Host registration state must be layered
Host state MUST 分离 source/lifecycle/enabled/compatibility/Runtime/signature/update facts；current layer 不再组合 granted permissions。

#### Scenario: Host registers current Manifest
- **WHEN** trusted Host 注册 normalized Manifest `0.2.0`
- **THEN** injected Host facts 无 permission/grant authority 且 author 不能覆盖

## REMOVED Requirements

### Requirement: Permission declarations must preserve internal reference consistency
**Reason**: 当前阶段删除 lensX permission request、grant 和 Page permission gate，标准 Web 行为由安装信任与隔离 Runtime 管理。
**Migration**: 插件作者升级到 Manifest `0.2.0`，删除 `requested_permissions`、permission reasons 和所有 `required_permissions`；需要 Host 原生特权的功能在未来独立 Contract 交付前保持不可用。
