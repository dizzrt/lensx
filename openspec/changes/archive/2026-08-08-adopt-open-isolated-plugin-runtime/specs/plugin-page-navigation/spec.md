## MODIFIED Requirements

### Requirement: Page availability must fail closed from current Registration facts

Plugin Page availability MUST 从当前 healthy Registration、enabled intent、compatibility、quarantine、current descriptor 与 resource/runtime prerequisites 派生。它 MUST 不读取 `required_permissions`、grant snapshot 或 permission service。开放 Web 行为、Publisher/source 或 remote content MUST 不改变 Host-owned Page identity、route 或 availability；invalid、disabled、incompatible、quarantined、stale 或 removed entry 继续 fail closed。

#### Scenario: Healthy permissionless Page is available
- **WHEN** 当前 Manifest `0.2.0` Page 属于 healthy、enabled、compatible Registration 且 runtime prerequisites 可用
- **THEN** Page descriptor 可用且不需要 lensX grant
- **THEN** Worker/network 等普通 Web 行为不进入 Page availability calculation

#### Scenario: Legacy Page contains required permissions
- **WHEN** package 使用旧 Manifest 或 Page `required_permissions`
- **THEN** Contract/Registration 将其分类为 incompatible or invalid，不创建部分 Page descriptor
- **THEN** navigation 不静默忽略旧 gate 后打开页面

#### Scenario: Registration becomes unavailable
- **WHEN** plugin disabled、removed、replaced、quarantined 或 current facts stale
- **THEN** Page 立即从 current registry 消失并关闭匹配 active Page
- **THEN** open network、Worker 或 remote code 不能维持旧 descriptor

### Requirement: Plugin Pages must project into stable Host-owned descriptors
Descriptor MUST 保留 Page identity/title/route/parent/current availability，不再保留 required permission IDs；sensitive presentation props MUST 不含 legacy permission/grant facts。

#### Scenario: project current Page graph
- **WHEN** Manifest `0.2.0` contributes valid Pages
- **THEN** stable descriptors 无 permission gate 且 identity 规则不变

### Requirement: Active Plugin Pages must close when their descriptor becomes unavailable
Active Page MUST 在 remove/provider ineligible/current availability false 时关闭；grant snapshot 不再是 keep/close 条件。

#### Scenario: provider becomes unavailable
- **WHEN** current Registration removes Page 或 provider ineligible
- **THEN** Host closes Page and returns Home

### Requirement: Plugin Page navigation delivery must not claim Runtime or lifecycle capabilities
该 historical delivery boundary MUST 不独立创建 Runtime、Host API/native authority 或 management UI；permission-grant decision 已删除。

#### Scenario: navigation capability 独立成立
- **WHEN** Page projection/navigation gate 通过
- **THEN** navigation itself creates no native authority

