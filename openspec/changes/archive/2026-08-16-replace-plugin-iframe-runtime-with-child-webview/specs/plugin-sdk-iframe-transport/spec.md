## REMOVED Requirements

### Requirement: The official iframe transport MUST consume exactly one authenticated Runtime Session Port
**Reason**: Child WebView没有parent MessagePort bootstrap。
**Migration**: 使用`@lensx/plugin-sdk/webview`的current native bridge。

### Requirement: The authenticated Port wire MUST be private, versioned and closed
**Reason**: Port carrier被per-WebView native bridge carrier替代。
**Migration**: 保留closed wire语义并升级private carrier contract。

### Requirement: The Host transport adapter MUST derive authority only from the current Port lease
**Reason**: 不再存在Port lease。
**Migration**: authority从actual current Child WebView source与Session binding派生。

### Requirement: Requests MUST support concurrency, cancellation, timeout and exactly-once settlement
**Reason**: 该要求迁入WebView transport capability。
**Migration**: 在native bridge上保留相同semantic operation guarantees。

### Requirement: Host API results, errors and events MUST retain Contract semantics across the transport
**Reason**: 该要求迁入WebView transport capability。
**Migration**: 新carrier继续使用相同Host API semantic validators。

### Requirement: Every transport endpoint MUST have one idempotent terminal cleanup path
**Reason**: iframe/Port endpoint被Child WebView/bridge endpoint替代。
**Migration**: cleanup终止bridge、WebView source、pending operations和Host handlers。

### Requirement: Transport delivery MUST stop before real Host API dispatch and permission decisions
**Reason**: 历史分阶段delivery不适用于当前完整平台迁移。
**Migration**: 新transport重新接入已交付Dispatcher但不新增Host API authority。

### Requirement: Delivery MUST prove public packaging, malicious isolation and target WebView behavior
**Reason**: iframe/MessageChannel evidence不再验证current carrier。
**Migration**: 使用real Child WebView、native bridge、generic Tauri denial和public tarball evidence。
