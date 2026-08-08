## MODIFIED Requirements

### Requirement: Storage and plugin lifecycle MUST share one data ownership boundary

Storage MUST 继续由 current Session identity 与 plugin data ownership 派生；replacement/disable/re-enable/retain-data reinstall MUST 保持 data semantics，但 MUST 不保存或恢复 grant authority。

#### Scenario: retain-data reinstall
- **WHEN** uninstall `retain_data` 后相同 identity 用 Manifest `0.2.0` 重装
- **THEN** new Session 可读 retained data，legacy grant/Manager facts 不恢复

### Requirement: Storage delivery MUST preserve public package and documentation boundaries

Delivery MUST 证明五个 storage methods、public Contract/SDK/Testkit tarballs、Session/Dispatcher 与 persistence，而 MUST 不宣称 native clipboard、permission management 或 general RPC quotas。

#### Scenario: focused storage delivery 通过
- **WHEN** external consumer 通过 authenticated Port 调用 storage
- **THEN** 只产生 plugin-scoped effects 且无 permission/grant authority

### Requirement: Trusted Host management MUST clear a disabled plugin namespace through a private contract

Private clear MUST 只清空 disabled current Registration 的 data namespace，并保持 Registration、Manifest、program payload、source、enabled intent 与 diagnostics；当前 payload MUST 不包含 grants。

#### Scenario: clear disabled namespace
- **WHEN** trusted root 对 current disabled identity 提交 valid clear
- **THEN** namespace atomically empty，Registration 与 Host authority facts 不变

