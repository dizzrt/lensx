## MODIFIED Requirements

### Requirement: Development execution MUST use the exact formal Runtime and permission boundaries

Development execution MUST 使用与 installed source 相同的 open isolated Web Runtime、iframe sandbox、origin、Resource Service、Session/SDK、Host API `0.2.0`、deadline、breaker、single-iframe 与 teardown boundaries。Development source MUST 不获得 Tauri、Host-private command、shared origin、persistent background 或 management authority，也 MUST 不使用 lensX permission/grant path，因为该 path 已删除。普通 Worker、network、remote resource、Blob/Data 与 WASM 行为 MUST 与 installed/official source 一致。

#### Scenario: Development plugin uses Monaco-style Worker
- **WHEN** 当前 development snapshot 页面创建 Dedicated Worker 并进行普通网络活动
- **THEN** WebView 按与 installed plugin 相同的开放 Runtime 基线执行
- **THEN** development provenance 不放宽 Host/跨插件隔离或 lifecycle

#### Scenario: Development code attempts Host bypass
- **WHEN** development plugin 尝试 Tauri、private command、Host DOM、另一个 plugin origin 或 persistent background
- **THEN** formal isolation boundary 阻止该尝试
- **THEN** local source path 或 explicit mode opt-in 不产生例外

### Requirement: Host MUST publish only an immutable validated development snapshot
Published development Registration MUST 包含 source、enabled、current Manifest/snapshot/generation 与 Runtime inactive facts，但 MUST 不创建 empty grant snapshot；失败保留 current snapshot/Runtime 且不恢复 legacy grant authority。

#### Scenario: snapshot commit succeeds
- **WHEN** staging、validation、flush、rename 与 Manager commit 全部成功
- **THEN** current process 发布 permissionless development entry 与 immutable generation

### Requirement: Development identity and source MUST remain Host-owned, process-local, and non-authoritative
Development source/snapshot MUST process-local 且 Host-owned，MUST 不持久化 permission/grant facts；Publisher 不能改变 source、Host API 或 Runtime policy。

#### Scenario: author claims trust
- **WHEN** development Manifest 声称 official/trusted authority
- **THEN** source 仍为 Development/Unpacked/Unsigned 且无额外 capability

### Requirement: Manual reload MUST be atomic, revision-bound, and force a fresh Runtime generation
Reload MUST 只比较 identity/revision/snapshot/current generation；disable/remove/replace/reload race MUST fail closed，不再存在 grant mutation race。

#### Scenario: reload loses currentness
- **WHEN** entry 在 prepare 中被 disable、remove、replace 或再次 reload
- **THEN** stale snapshot 不能覆盖 current Manifest、enabled intent、revision 或 Runtime

### Requirement: Delivery MUST prove safe directory handling, atomic reload, production exclusion, and real Runtime teardown
Delivery matrix MUST 用 legacy-contract rejection 取代 permission delta，并证明 source distinction、Host-authority non-escalation、generation teardown 与 production exclusion。

#### Scenario: focused gate passes
- **WHEN** development aggregate gate 运行
- **THEN** no grant authority exists and old generation has zero residual Runtime authority

## REMOVED Requirements

### Requirement: Development reload MUST preserve only still-declared grants and never auto-grant new permissions
**Reason**: Manifest permission declarations与 Manager grants 被删除。
**Migration**: manual reload 继续 revision-bound、atomic 并强制 fresh generation，但不比较、保留或创建 grants；旧 Web context 完整终止。
