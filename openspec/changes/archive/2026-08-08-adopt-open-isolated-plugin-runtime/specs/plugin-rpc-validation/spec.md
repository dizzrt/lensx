## MODIFIED Requirements

### Requirement: The Host MUST enforce one immutable RPC v1 budget before recursive Contract validation

RPC budget MUST 在 Contract validation/Handler 前固定执行；Manifest、source、legacy permission/grant claim、SDK option 或 payload MUST NOT 扩大限制，analyzer MUST 不派生 identity 或 authority。

#### Scenario: bounded request 进入 Contract validation
- **WHEN** current Session request 在 byte/depth/node limits 内
- **THEN** Host 继续 current Contract validator 且不创建 permission decision

### Requirement: Recoverable request failures and terminal protocol violations MUST remain distinct

Recoverable error MUST 只使用 Host API `0.2.0` closed codes；`permission_denied` 与 permission-aware Dispatcher MUST 不存在。Uncorrelatable/private-authority violation MUST 继续终止 affected Session。

#### Scenario: current Dispatcher 返回稳定 rejection
- **WHEN** Handler 返回 `not_found|limit_exceeded|unavailable` 等 Contract-valid error
- **THEN** transport 保留该 code 且不重分类为 lifecycle failure

### Requirement: RPC diagnostics MUST be bounded, private, and non-authoritative

Diagnostic sink failure MUST 不改变 request settlement、provider effects、Host authority、Session currentness 或 cleanup，record MUST 不含 legacy grant/permission payload。

#### Scenario: diagnostic delivery 失败
- **WHEN** optional sink throws 或拒绝 record
- **THEN** request 仍 exactly-once settle 且 authority 不变

### Requirement: Delivery MUST prove RPC limits without expanding the public plugin platform

Focused gate MUST 组合 current Contract、SDK、transport、Dispatcher、storage、Session 与 WebView evidence，不再依赖 permission capability/gate。

#### Scenario: focused RPC gate 通过
- **WHEN** limits、correlation、deadline、egress 与 diagnostics matrix 全部通过
- **THEN** 无 public quota override、permission authority 或 private executor 泄漏

