## REMOVED Requirements

### Requirement: Host permission catalog MUST be closed, risk-classified, and Contract-aligned
**Reason**: Host API `0.2.0` 不再定义 permission catalog；普通 Web 行为不经过 lensX 权限，敏感原生 clipboard provider 被删除。
**Migration**: 删除 catalog、drift gate 和公共 permission mapping；未知 Host 原生能力保持不可用。

### Requirement: Effective permission state MUST keep requests, support, grants, and Sessions separate
**Reason**: Manifest request、grant 和 effective permission state 全部退出当前平台模型。
**Migration**: Registration、Management detail 与 Runtime Context 删除 permission projection，只保留实际非特权 Host API capability。

### Requirement: Grant mutations MUST be trusted, revision-bound, and fail closed
**Reason**: 不再存在可 grant 的 permission 或 grant snapshot。
**Migration**: 删除 mutation command/service/parser；旧调用返回不兼容或 unavailable，不能改变 Manager revision。

### Requirement: Every permission-backed call MUST reauthorize against current Host facts
**Reason**: permission-backed clipboard methods 被 Host API `0.2.0` 删除。
**Migration**: 删除逐调用 permission authorization path；保留所有非特权 Host API 的 Session identity、currentness、Contract 和 provider checks。

### Requirement: Clipboard provider MUST expose only bounded plain text through a narrow native boundary
**Reason**: 当前阶段不在无权限模型下向插件暴露敏感原生剪贴板。
**Migration**: 删除 Rust/AppKit provider、Tauri command 和 frontend binding；插件不得依赖该 provider，Task 7.3 重新规划。

### Requirement: Grant changes MUST invalidate only affected Runtime authority
**Reason**: grant mutation 与 grant-driven authority 被删除。
**Migration**: Runtime 继续响应 installation、replacement、development reload、lifecycle、resource generation 和 Session currentness invalidation，不再处理 permission invalidation。

### Requirement: Task 5.5 MUST not deliver permission UI or broader privileged APIs
**Reason**: Task 5.5 capability 整体退出当前稳定平台，而不仅是继续限制 UI 范围。
**Migration**: 文档与路线图把历史实现标记为被本 change supersede；新的开放 Runtime 仍不提供 broader native APIs。

