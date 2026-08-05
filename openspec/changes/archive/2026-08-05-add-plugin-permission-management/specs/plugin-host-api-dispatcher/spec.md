## MODIFIED Requirements

### Requirement: Production Host MUST route requests through a closed Dispatcher bound to a trusted Session

系统 MUST 为每个 current、ready Runtime Session 创建一个 Host-private Dispatcher binding。每次 dispatch MUST 只使用 authenticated Port lease 中冻结的 identity、Contract-valid Host API request、Host-owned cancellation signal 与当前 Host service state。plugin 或 wire payload MUST NOT 选择或覆盖 plugin ID、Page ID、Registration revision、Runtime attempt、origin、grant、provider、executor、Tauri command、storage namespace、path 或其他 Host object。

Dispatcher MUST 为 Host API `0.1.0` method catalog 使用闭集 dispatch table。正常生产路径中的 unknown 或 malformed method MUST 在到达 handler 前被 Contract 或 transport 拒绝；防御性直接 dispatch MUST 以稳定 `method_not_found` 失败。缺少当前生产 provider 的已声明 method MUST 以稳定 `unavailable` 失败，且 MUST NOT 产生 side effect。五个 `storage.*` methods MUST 只路由到 Host-private scoped-storage provider。`clipboard.read` 与 `clipboard.write` MUST 只路由到 Host-private、permission-backed 的纯文本 clipboard provider，并 MUST 在每次 native effect 前依据当前 Host facts 重新授权当前 Session。

#### Scenario: 当前 Session 调用已实现 method

- **WHEN** current ready Session 通过 authenticated Port 发送 Contract-valid `runtime.get_context`、`ui.close`、`actions.open`、`storage.get`、`storage.set`、`storage.delete`、`storage.list`、`storage.get_quota`、`clipboard.read` 或 `clipboard.write` request
- **THEN** Host adapter 将 lease identity、validated request 与 Host-owned cancellation signal 传给该 Session 的 Dispatcher
- **THEN** Dispatcher 只调用该 method 的窄 provider，且不允许 request 选择 identity、storage namespace、path、native clipboard object、permission decision 或 executor

#### Scenario: Plugin 尝试伪造 authority

- **WHEN** request、private frame 或 plugin code 尝试提交 plugin/Page identity、origin、grant、Registration revision、provider、executor、Tauri command、storage namespace、path 或 Host object
- **THEN** exact Contract/transport boundary 在 Dispatcher 前拒绝该值，或 Dispatcher 忽略所有不是从 lease 派生的 authority value
- **THEN** 不会通过伪造值操作任何 plugin、Page、Registration、permission、storage namespace 或 Host service

#### Scenario: Method 未知或 provider 不可用

- **WHEN** caller 调用 Host API catalog 外 method、在 storage provider 不可用时调用 storage method，或在 native/permission provider 不可用时调用 clipboard method
- **THEN** unknown method 以稳定 `method_not_found` 失败，已声明但 unavailable 的 method 以稳定 `unavailable` 失败
- **THEN** Dispatcher 不调用任何 fallback storage、clipboard、browser、native、permission 或 arbitrary executor

#### Scenario: Clipboard 缺少授权

- **WHEN** current Session 调用其 Manifest 未请求或当前 Registration 未 grant 的 clipboard method
- **THEN** Dispatcher 返回稳定 `permission_denied`
- **THEN** 不发生 native clipboard read/write，clipboard content 也不进入 error 或 diagnostic

### Requirement: Runtime Context MUST derive from current Host facts and real provider availability

`runtime.get_context` MUST 只接受精确 `{}`，并返回完整、Contract-valid、复制且冻结的 Runtime Context。Context fields MUST 只包含 Contract 的当前 Host API SemVer、当前 `en-US | zh-CN` locale、当前 `light | dark` theme，以及排序去重的 capability method ID 列表。

capability MUST 表示 Host 当前同时具备真实 provider、该 provider 对当前 Session 可用且当前 authorization 允许调用。生产 Dispatcher 交付的 capabilities MUST 在相应 Host service 与当前 namespace 可用时包含真实 `runtime.get_context`、`ui.close`、`actions.open`、`storage.get`、`storage.set`、`storage.delete`、`storage.list` 与 `storage.get_quota` providers。`clipboard.read` 或 `clipboard.write` MUST 仅在当前平台具备窄 native provider、permission catalog 支持该 method 且 Session identity 包含对应实际 grant 时独立出现。Context MUST NOT 包含 plugin/Page identity、source、Manifest requests、raw grants、Registration revision、storage usage、clipboard content、paths、executors 或 Host lifecycle objects。

同一 Session 保持 current 时，真实 locale、theme 或 capability snapshot 变化（包括确认 storage provider degraded/recovered）MUST 发布一个完整 `runtime.context_changed` replacement；相同 snapshot MUST NOT 重复发布。identity、Registration revision、resource generation、Runtime attempt 或 grant snapshot 失效 MUST 终止旧 Session，且 MUST NOT 仅通过 event 重新授权它。

#### Scenario: SDK 从真实 Context 初始化

- **WHEN** official iframe transport 在 storage provider 可用且 identity 具有一个当前受支持 clipboard grant 的 current ready Session 上发送初始化 `runtime.get_context` request
- **THEN** Dispatcher 返回当前 Host API version、locale、theme 与排序的可调用 capability snapshot，其中包含全部五个 storage methods 且只包含被 grant 的 clipboard method
- **THEN** SDK 通过 Contract validation，并可调用这些 methods，而不会收到原生产 placeholder `unavailable`

#### Scenario: Context 排除 unavailable capabilities

- **WHEN** scoped storage 不可用、native clipboard provider 不可用，或 Session 缺少一个 clipboard grant
- **THEN** Context capabilities 只排除受影响 methods
- **THEN** catalog membership、Manifest permission request、official provenance 或 stale grant snapshot 不会把 method 变成当前 capability

#### Scenario: Storage namespace degraded

- **WHEN** Host 确认当前 identity 的 storage namespace 已损坏或 blocked，而同一 Session 的其他部分仍 current
- **THEN** Host 发布一个不含五个 storage methods 的完整 Context replacement，且不修改无关 capabilities
- **THEN** 相同 degraded snapshot 不重复发送，Context 中也不出现 storage path、value、usage 或 diagnostic

#### Scenario: Locale 或 theme 变化

- **WHEN** application locale 或 theme 变化，而当前 Session 的 trusted identity 与 capability availability 仍有效
- **THEN** Host 发送一个完整、Contract-valid 且冻结的 Context replacement
- **THEN** SDK 在通知 subscribers 前替换整个 Context，plugin 不观察到 Host-private state

#### Scenario: Session authority 变化

- **WHEN** Registration revision、resource generation、Runtime attempt 或 grant snapshot 变化使旧 Session identity 不再 current
- **THEN** 旧 Session 通过既有 lifecycle 终止并拒绝新调用，包括 event 收敛前发起的 clipboard calls
- **THEN** `runtime.context_changed` 不会为旧 Session 提供新 identity 或重新授权
