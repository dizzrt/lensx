## MODIFIED Requirements

### Requirement: Host API v1 MUST expose one closed, versioned semantic catalog

公共 Host API MUST 以独立版本 `0.2.0` 暴露一个 closed semantic catalog，只包含 `actions.open`、`runtime.get_context`、plugin-scoped storage 和 `ui.close` 的当前方法、request、result、event 与 bounded error。Catalog MUST 不包含 `clipboard.read`、`clipboard.write`、Host API permission type、permission requirement mapping 或任意 Tauri/native executor。未知或已移除方法 MUST 通过 closed Contract 与 Dispatcher fail closed。

#### Scenario: 消费者读取 Host API 0.2.0 catalog
- **WHEN** 外部消费者读取生成类型与 runtime catalog
- **THEN** 只看到当前非特权、Session-bound 方法和独立版本
- **THEN** 不存在 clipboard method、permission catalog、grant helper 或 private transport type

#### Scenario: 旧插件调用 clipboard
- **WHEN** 插件发送 `clipboard.read`、`clipboard.write` 或 Host API `0.1.0` request
- **THEN** Contract/Dispatcher 返回 incompatible、method-not-found 或稳定不可用结论且不执行 native effect
- **THEN** 安装事实不把旧调用自动授权

### Requirement: Runtime Context MUST be the single capability-discovery snapshot

`PluginRuntimeContext` MUST 继续包含 Host API version、locale、theme 和当前 Session 实际 composed 的完整、排序、唯一 method capability 集合。capabilities MUST 只从当前 trusted Session、provider availability 和 Host facts 派生，MUST NOT 包含 permission、grant、Manifest reason、Publisher、source、network、Worker 或其他普通 Web 能力。普通 Web 能力由 Runtime 基线决定，不通过 Host API context 发现。

#### Scenario: 新 Session 获取 Context
- **WHEN** 当前插件完成 Session/SDK 初始化
- **THEN** Context 返回 Host API `0.2.0` 与当前非特权 method capabilities
- **THEN** 空 capability 仍有效，且不表示 Worker、网络或其他 Web 能力被拒绝

#### Scenario: Provider 或上下文变化
- **WHEN** locale、theme、非特权 provider availability 或 Session currentness 变化
- **THEN** Host 发送完整 replacement context 或终止旧 Session
- **THEN** 不存在 grant mutation 或 permission-driven hot injection

### Requirement: Semantic payload Schemas MUST be exact, paired and independently validatable
Payload pairing MUST 只覆盖 Host API `0.2.0` methods；removed clipboard payload 与 legacy grant/identity field MUST fail closed。

#### Scenario: method/payload mismatch
- **WHEN** `actions.open` 携带 storage params 或 `storage.get` 携带 Action result
- **THEN** exact Schema 在 Handler 前拒绝

### Requirement: Host API errors MUST be stable, bounded and separate from SDK lifecycle errors
Closed error set MUST 删除 `permission_denied`，保留 `invalid_request|invalid_params|method_not_found|not_found|conflict|limit_exceeded|unavailable|cancelled|timeout|internal_error` 与 safe message boundary。

#### Scenario: current stable rejection
- **WHEN** plugin 收到 `not_found|limit_exceeded|unavailable`
- **THEN** 可按 code 分支且不依赖 locale 或 legacy permission semantics

### Requirement: Host API evolution MUST use capability discovery and explicit deprecation
Breaking payload/error/method removal MUST 增加 major version；permission behavior 不再是当前演进维度，ordinary Web capability 也不进入 Context catalog。

#### Scenario: method removal
- **WHEN** incompatible major 删除旧 method
- **THEN** SDK range 与 Context discovery fail closed，不以 grant compatibility 维持旧 method

### Requirement: Contract delivery MUST prove cross-consumer drift without claiming execution
Delivery MUST 覆盖每个 current method/result/event/error，不再覆盖 permission facts 或执行 clipboard/grant side effect。

#### Scenario: Contract drift
- **WHEN** method、Context、event、error 或 payload 只在一个 consumer 改变
- **THEN** generation/shared-fixture/package gate 失败

## REMOVED Requirements

### Requirement: Clipboard methods MUST require explicit, distinct permissions
**Reason**: Host API `0.2.0` 删除原生 clipboard methods 和整个 lensX permission model，避免取消授权后把敏感原生能力默认开放。
**Migration**: 插件删除 clipboard Host API 调用；浏览器 clipboard 是否可用由未来明确的 WebView 支持基线决定，Task 7.3 必须重新规划。
