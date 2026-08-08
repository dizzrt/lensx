## MODIFIED Requirements

### Requirement: The authenticated Port wire MUST be private, versioned and closed

Private wire MUST 只承载 current Contract request/result/event/error/cancel/disconnect frames，MUST 不含 identity、origin、generation、legacy grant/permission、path、executor 或 Host object。

#### Scenario: frame 注入旧 authority
- **WHEN** frame 加入 grant、permission、Tauri 或 identity field
- **THEN** exact parser fail closed 且无 Handler side effect

### Requirement: The Host transport adapter MUST derive authority only from the current Port lease

Adapter MUST 只从 current Session Port lease、Contract-valid request 与 Host cancellation signal 派生调用，MUST 不从 permission/grant facts 或 ordinary Web behavior 派生 authority。

#### Scenario: stale Port request
- **WHEN** old generation Port 提交 valid-shaped request
- **THEN** adapter 在 Handler 前拒绝且不创建 native authority

### Requirement: Host API results, errors and events MUST retain Contract semantics across the transport

Transport MUST 保留 Host API `0.2.0` current error set 与 Context replacement；`permission_denied`、grant detail 与 clipboard error MUST 不再跨 Port。

#### Scenario: Handler 返回 current rejection
- **WHEN** Handler 返回 `not_found|limit_exceeded|unavailable` 等 Contract-valid error
- **THEN** SDK 获得相同 code 且无 private/legacy authority detail

### Requirement: Transport delivery MUST stop before real Host API dispatch and permission decisions

Transport capability MUST 不独立交付 real Dispatcher、native clipboard、arbitrary Rust/Tauri、authority mutation 或 privileged effect；历史 permission decision 不再是后续 capability。

#### Scenario: production 未配置 Dispatcher
- **WHEN** real SDK/transport ready 而无 configured Dispatcher
- **THEN** production 返回 `unavailable` 且不产生 Host authority

