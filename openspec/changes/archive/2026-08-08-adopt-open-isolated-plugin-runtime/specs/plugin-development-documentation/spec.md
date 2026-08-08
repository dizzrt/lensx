## MODIFIED Requirements

### Requirement: The Host API reference MUST distinguish public contract, Host provider, and session capability

双语 Host API reference MUST 为 Host API `0.2.0` 的每个 method 记录 request、result、stable errors、version、provider condition、Session capability 与 recovery。它 MUST 明确公共 catalog 不等于当前 provider，provider 不等于任意 Host authority；当前 complete `PluginRuntimeContext.capabilities` 只描述 Session 实际非特权 methods。文档 MUST 不再描述 Manifest permission、grant、clipboard provider 或 permission-denied flow，并 MUST 区分 Host API methods 与无需 Context 枚举的普通 Web capabilities。

#### Scenario: Developer looks up current Host methods
- **WHEN** developer 查询 context、navigation、storage 或 close method
- **THEN** reference 给出 exact contract/provider/session/recovery facts
- **THEN** 不暗示 Worker/network 需要 Host API，也不提供 clipboard/permission method

#### Scenario: Contract or provider drifts
- **WHEN** method、error、version、provider 或 context mapping 与真实 package/production composition 不一致
- **THEN** coverage gate 失败并识别 missing/extra/misclassified facts
- **THEN** 文档不能通过保留旧 permission 章节掩盖 drift

### Requirement: Runtime, permission, and security guidance MUST cover success, error, and recovery lifecycles

Runtime/security guidance MUST 说明从 isolated iframe、Session/Port、SDK initialize、Context、ready、request/cancel 到 close/reload/replacement/destroy 的完整 lifecycle，并覆盖开放 Worker/network/remote/Blob/Data 成功路径、unsupported browser APIs、transport/deadline/breaker、Host/跨插件隔离和旧 generation inertness。文档 MUST 把安装描述为当前插件行为信任决定，明确 lensX 不逐项授权或审核普通 Web 行为，同时不把开放 Web 描述为 Tauri/native authority。

#### Scenario: Developer builds an open Web plugin
- **WHEN** tutorial plugin 使用 Dedicated Worker、network 或 remote resource
- **THEN** 文档说明其在 isolated Runtime 内的支持、teardown、错误和平台差异
- **THEN** 示例不创建 permission request、grant UI 或 private Host bypass

#### Scenario: Developer handles unavailable native capability
- **WHEN** plugin 需要未公开的 file、Shell、process、camera、microphone 或 clipboard Host capability
- **THEN** 文档将其标记为未交付/不保证，而不是建议 Tauri、private import 或自动授权
- **THEN** plugin 提供 degraded state 或调整功能范围

#### Scenario: Development source follows formal boundary
- **WHEN** 文档描述 Development Mode
- **THEN** 它要求相同 open Runtime 与 Host isolation、manual reload 和 teardown
- **THEN** 不描述 permission/grant 差异或 development-only CSP bypass

### Requirement: Task 6.6 completion MUST depend on complete validation evidence

`check:plugin-development-documentation` MUST 覆盖双语结构/links、runnable blocks、external consumers、public packages/CLI/templates、Development Mode、open isolated Runtime、Host API `0.2.0` 与 canonical installation。历史 Task 6.6 状态只有在文档和当前 source/spec 一致时才能保持完成；旧 permission/clipboard claims MUST 使 gate 失败。

#### Scenario: Updated documentation gate passes
- **WHEN** focused docs gate、frontend/Rust complete validation 与 strict OpenSpec validation 全部成功
- **THEN** developer hub 可以声明当前开放 Web/封闭 Host 边界已交付
- **THEN** 不把 Task 7.2、Task 7.3、Marketplace、signature 或 native permissions 描述为已完成

#### Scenario: Legacy permission guidance remains
- **WHEN** English 或 Chinese 文档仍指导 requested permissions、grant/revoke、clipboard Host API 或 restrictive Worker/network CSP
- **THEN** gate 失败并提供 repository-relative deterministic diagnostic
- **THEN** capability 状态不能标记为已收敛

### Requirement: Both tutorials MUST independently complete the development loop from create to an installable package
Tutorials MUST 解释 Development Mode 与 `.lxp` installation 在 source、persistence、trust disclosure、restart 上的差异，不再描述 permission/grant 差异或 automatic grant。

#### Scenario: developer chooses a loop
- **WHEN** developer 选择 process-local Development Mode 或 canonical install
- **THEN** docs 给出对应步骤且两者共享 open Runtime/closed Host boundary

