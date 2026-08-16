## REMOVED Requirements

### Requirement: Runtime delivery MUST consume completed navigation and isolated-origin prerequisites
**Reason**: iframe Runtime被Child WebView Runtime完整替代。
**Migration**: 使用`plugin-child-webview-runtime`的resource、navigation和real WebView prerequisites。

### Requirement: Host MUST derive each iframe Runtime target from current trusted facts
**Reason**: Host不再创建iframe descriptor或DOM target。
**Migration**: 从current trusted facts派生Child WebView registry entry和native attempt。

### Requirement: Isolated iframe MUST use the exact Host-fixed capability policy
**Reason**: 不再存在iframe sandbox、referrer或Permissions Policy容器。
**Migration**: 使用Child WebView origin、navigation、bridge、ACL和Host-owned Web policy。

### Requirement: Document navigation and package resources MUST remain current-target scoped
**Reason**: descendant-frame navigation lease被Child WebView top-level policy替代。
**Migration**: 将exact entry/resource currentness迁入Child WebView registry与resource binding。

### Requirement: Runtime origins and storage MUST be isolated across identities and generations
**Reason**: requirement由Child WebView与isolated-origin capability共同承担。
**Migration**: 每个current generation绑定独立Child WebView origin/data-store identity。

### Requirement: Container lifecycle MUST distinguish loaded presentation from trusted Runtime readiness
**Reason**: iframe load lifecycle被native Child WebView load/bridge lifecycle替代。
**Migration**: 保持loaded、Session ready和SDK ready分离，但source改为actual Child WebView。

### Requirement: Runtime feedback MUST be accessible, localized, and theme-compatible
**Reason**: feedback继续存在但不再属于iframe capability。
**Migration**: Host Page chrome和Child WebView presentation controller拥有该要求。

### Requirement: Exactly one active Plugin Page iframe MUST exist only for the current Page lifetime
**Reason**: 单iframe被单Child WebView替代。
**Migration**: Host最多维护一个current plugin Child WebView，不保留hidden Runtime或pool。

### Requirement: Delivery MUST prove the Runtime boundary on real package and WebView paths
**Reason**: 原gate验证错误的container与carrier。
**Migration**: 使用真实Child WebView package/navigation/bridge/lifecycle matrix。

### Requirement: Task 4.2 MUST leave later Runtime and Host API capabilities unimplemented
**Reason**: 历史milestone分层已被完整交付后的breaking migration取代。
**Migration**: 新change整体迁移现有Session、SDK transport和Dispatcher，不重演旧任务切片。

### Requirement: Iframe lifetime MUST own every supported child execution context
**Reason**: iframe不再是execution owner。
**Migration**: Child WebView attempt owns并终止其Worker、network、Blob和browser contexts。
