## MODIFIED Requirements

### Requirement: The SDK client MUST expose only Contract-closed Host API requests and events

SDK client MUST 只接受 Contract `0.2.0` declared request/event，MUST 不接受 arbitrary string、identity、legacy grant/permission state、origin、Port、executor 或 Tauri command。

#### Scenario: undeclared request
- **WHEN** plugin 绕过类型提交 removed clipboard、permission 或 arbitrary method
- **THEN** Contract validation 在 transport 前拒绝

### Requirement: Runtime context MUST be read-only, versioned, and validated at Runtime

Runtime Context MUST 只包含 Host API SemVer、locale、theme 与 current method capability snapshot；它 MUST 不接受 plugin-provided identity、permission、source 或 authority，empty capability MUST 有效。

#### Scenario: empty current Context
- **WHEN** Host 返回 empty method capability list
- **THEN** SDK ready 且不从 catalog、Manifest 或 ordinary Web behavior 发明 capability

### Requirement: The SDK MUST expose stable, safe SDK-level errors

SDK lifecycle errors MUST 与当前 Contract method/domain/internal errors 区分；`permission_denied` MUST 不再属于 Host API `0.2.0` error set，SDK MUST 不保留其 copy。

#### Scenario: Contract-valid rejection 跨 transport
- **WHEN** SDK 收到 current Contract `not_found|limit_exceeded|unavailable` 等 rejection
- **THEN** error discrimination 保留且不 collapse 为 `transport_failure`

### Requirement: The SDK package MUST participate in complete workspace, release, and documentation validation

SDK package/docs/gates MUST 明确它不交付 iframe Runtime、Host API execution、native authority 或 plugin execution，不得把 removed permission system 描述为当前或待 grant capability。

#### Scenario: SDK tarball external validation
- **WHEN** isolated consumer 安装真实 SDK tarball
- **THEN** public boundary 可用且无 permission catalog、grant helper 或 private Host code

