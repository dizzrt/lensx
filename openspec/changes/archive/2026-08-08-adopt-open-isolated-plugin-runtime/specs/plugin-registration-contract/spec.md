## MODIFIED Requirements

### Requirement: Registration wire payloads MUST use an independent explicit version

Registration snapshot、detail、event、error 与 request payload MUST 使用独立严格版本 `0.3.0`，并 MUST 拒绝旧 version、unknown field、missing field、wrong type 或 cross-operation variant。版本 MUST 独立于 Manifest `0.2.0`、Host API `0.2.0`、package、Manager record 和 application version。当前 payload MUST 不包含 `granted_permission_ids`、permission state、reason、risk 或 grant mutation facts。

#### Scenario: 当前 Registration payload 被读取
- **WHEN** trusted frontend adapter 接收一个完整 `0.3.0` snapshot 或 detail
- **THEN** 它严格验证并冻结当前 identity、source、lifecycle、availability、Manifest 与安全 diagnostics
- **THEN** payload 不包含 grant 或 permission authority

#### Scenario: 旧 payload 包含 grants
- **WHEN** adapter 收到 `0.2.0`、`granted_permission_ids` 或其他旧 permission fields
- **THEN** 整个 payload 被视为 incompatible/invalid boundary data
- **THEN** frontend 不从旧字段构造 capability 或管理 UI

### Requirement: Runtime, lifecycle, signature, and permission decision facts MUST remain narrowly scoped

Registration Contract MUST 只投影页面、Action、管理与 Runtime resolution 所需的当前 Host facts。Runtime attempt、Session、Port、nonce、CSP、network、Worker、signature authority、community trust、完整 package bytes 和原生 Host capability MUST 保持在其各自边界外。当前 Contract MUST 不投影 permission request、grant snapshot、risk 或 decision，因为这些 authority 已删除。

#### Scenario: Consumer reads current detail
- **WHEN** trusted Host consumer 读取健康插件 detail
- **THEN** 它获得管理、projection 与 Runtime resolution 所需的 bounded facts
- **THEN** 它不能从 detail 获取 Tauri、Host command、permission、grant、Session 或开放 Web 行为控制权

#### Scenario: Plugin source claims authority
- **WHEN** Manifest、Publisher、official source、remote code 或 plugin message 声称 permission、grant、signature 或 Host trust
- **THEN** Registration Contract 不接受或投影该 authority
- **THEN** 该声明不改变 isolation、Host API 或 Runtime lifecycle

### Requirement: Registration Contract MUST remain a Host-owned application boundary
Current read model MUST 不接受或投影 author-supplied granted permission/authority facts；Publisher 不改变 source、enabled、compatibility 或 native authority。

#### Scenario: Host composes detail
- **WHEN** Manager contains current Manifest/Host facts
- **THEN** detail 分层且无 grant field

### Requirement: Host MUST expose safe revision-bound registration details
Healthy detail MUST 包含 normalized Manifest、source、enabled、compatibility、Runtime inactive 与 bounded diagnostics，不再包含 granted permission IDs。

#### Scenario: read current detail
- **WHEN** trusted frontend 查询 current entry/revision
- **THEN** strict detail 无 permission/grant authority

### Requirement: Rust and TypeScript MUST share a complete Registration Contract drift gate
Fixtures MUST 用 legacy grant-field rejection 取代 sorted/duplicate current grants，并保持 version/variant/revision/sensitive disclosure parity。

#### Scenario: legacy fixture
- **WHEN** payload 包含 grant field
- **THEN** Rust/TypeScript 同时拒绝

### Requirement: Registration Contract delivery MUST NOT claim downstream plugin capabilities
Delivery MUST 不创建 install/execution/lifecycle writes/Page/Action/Runtime/Host API/native authority 或 UI。

#### Scenario: registration delivery alone
- **WHEN** read-only Contract gate 通过
- **THEN** no plugin execution or authority is created

