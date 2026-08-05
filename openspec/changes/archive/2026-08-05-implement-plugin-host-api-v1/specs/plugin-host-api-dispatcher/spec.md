## ADDED Requirements

### Requirement: 生产 Host 必须通过可信 Session 绑定的封闭 Dispatcher 路由请求

系统 MUST 为每条 current、ready Runtime Session 创建一个 Host 私有 Dispatcher binding。每次 dispatch MUST 只使用认证 Port lease 冻结的 identity、Contract-valid Host API request、Host-owned cancellation signal 和当前 Host service 状态；插件或 wire MUST NOT 选择或覆盖 plugin ID、Page ID、Registration revision、Runtime attempt、origin、grant、provider、executor、Tauri command 或其他 Host 对象。

Dispatcher MUST 对 Host API `0.1.0` method catalog 进行封闭分派。正常生产路径中的未知或 malformed method MUST 在 handler 前被 Contract/transport 拒绝；防御性 direct dispatch MUST 使用稳定 `method_not_found` 失败。已声明但没有当前生产 provider 的 method MUST 使用稳定 `unavailable` 失败，且 MUST NOT 产生副作用。

#### Scenario: current Session 调用已实现方法

- **WHEN** current ready Session 通过认证 Port 发送 Contract-valid `runtime.get_context`、`ui.close` 或 `actions.open` request
- **THEN** Host adapter 将 lease identity、validated request 和 Host-owned cancellation signal 交给该 Session 的 Dispatcher
- **THEN** Dispatcher 只调用与 method 对应的窄 provider，不允许 request 选择 identity 或 executor

#### Scenario: 插件尝试伪造 authority

- **WHEN** request、私有 frame 或插件代码尝试提交 plugin/Page identity、origin、grant、Registration revision、provider、executor、Tauri command 或 Host 对象
- **THEN** exact Contract/transport boundary 在 Dispatcher 前拒绝该值，或 Dispatcher 忽略所有非 lease authority
- **THEN** 任何插件、Page、Registration、权限或 Host service 都不会因伪造值而被操作

#### Scenario: method 未知或尚未实现

- **WHEN** 调用不属于 Host API catalog 的 method，或调用本 change 尚未提供 provider 的 `storage.*` 或 `clipboard.*`
- **THEN** 未知 method 使用稳定 `method_not_found`，已声明但未实现 method 使用稳定 `unavailable`
- **THEN** Dispatcher 不调用 storage、clipboard、native、permission 或任意 fallback executor

### Requirement: Runtime Context 必须来自当前 Host 事实与真实 provider 可用性

`runtime.get_context` MUST 接受 exact `{}` 并返回完整、Contract-valid、复制且冻结的 Runtime Context。Context 字段 MUST 仅包含 Contract 当前 Host API SemVer、当前 `en-US | zh-CN` locale、当前 `light | dark` theme，以及按 method ID 排序、去重的 capability list。

Capability MUST 同时表示当前 Host 有真实 provider、该 provider 对当前 Session 可用且当前授权允许调用。Task 5.3 初始生产 capability MUST 仅来自真实可用的 `runtime.get_context`、`ui.close` 和 `actions.open` provider；没有 storage provider 的 `storage.*` 和没有完整当前权限/native provider 的 `clipboard.*` MUST NOT 出现。Context MUST NOT 包含 plugin/Page identity、source、Manifest request、raw grant、Registration revision、路径、executor 或 Host lifecycle 对象。

同一 Session 保持 current 时，locale、theme 或 capability snapshot 的实际变化 MUST 通过 `runtime.context_changed` 发布一个完整 replacement；相同 snapshot MUST NOT 重复发布。identity、Registration revision、resource generation、Runtime attempt 或 grant snapshot 失效 MUST 终止旧 Session，MUST NOT 只靠 event 重新授权。

#### Scenario: SDK 使用真实 Context 初始化

- **WHEN** 官方 iframe transport 在 current ready Session 上发送初始化 `runtime.get_context`
- **THEN** Dispatcher 返回当前 Host API version、locale、theme 和真实可调用 capability snapshot
- **THEN** SDK 可以通过 Contract validation 进入 `ready`，而不是收到生产占位 `unavailable`

#### Scenario: 未实现能力不进入 Context

- **WHEN** Host API catalog 声明 storage 和 clipboard method，但对应生产 provider 或完整当前授权尚未交付
- **THEN** Context capabilities 不包含这些 method
- **THEN** Manifest permission request、official provenance、catalog membership 或旧 grant snapshot 不会把 method 变成当前 capability

#### Scenario: locale 或 theme 变化

- **WHEN** current Session 的应用 locale 或 theme 改变，而 trusted identity 与 capability availability 保持有效
- **THEN** Host 发送一个完整、Contract-valid、冻结的新 Context replacement
- **THEN** SDK 在通知 subscriber 前替换整个 Context，且插件看不到 Host 私有状态

#### Scenario: Session authority 发生变化

- **WHEN** Registration revision、resource generation、Runtime attempt 或 grant snapshot 的变化使旧 Session identity 不再 current
- **THEN** 旧 Session 通过既有 lifecycle 终止并拒绝新调用
- **THEN** `runtime.context_changed` 不会让旧 Session 获得新 identity 或重新授权

### Requirement: ui.close 必须只在成功响应交付后关闭调用 Session 的当前 Page

`ui.close` MUST 只接受 exact `{}`。Dispatcher MUST 从 trusted Session identity 推导唯一目标 `{ owner_id: plugin_id, page_id }`，并且 MUST NOT 接受 window、route、plugin、Page 或其他关闭目标。只有该目标仍然是当前 active Plugin Page 且 Runtime attempt/current Session 仍有效时，调用才可返回 `{ accepted: true }`。

Host transport MUST 先验证并成功交付 Contract result、终结该 request，再执行至多一次 Host-owned close effect。close effect MUST 再次进行 currentness 与 target match；若响应等待期间 Page/Session 已替换、调用已取消或 adapter 已终止，effect MUST 不关闭任何 Page。关闭 MUST 复用窄 App Navigation boundary，并汇入既有 iframe、Session、Port、pending request 与 listener cleanup。

#### Scenario: current 插件关闭自己的 Page

- **WHEN** current ready Plugin Page Session 调用 `ui.close`，且目标在响应交付时仍匹配 active Page
- **THEN** SDK 先收到 `{ method: "ui.close", result: { accepted: true } }`
- **THEN** Host 随后关闭该 Page 并终止对应 Runtime，且 effect 只执行一次

#### Scenario: 旧 Session 尝试关闭替换后的 Page

- **WHEN** `ui.close` 响应等待期间发生 Page navigation、Session replacement、disable、uninstall、disconnect、dispose 或 cancellation
- **THEN** post-response effect 的 currentness 或 target match 失败，不关闭新的或无关 Page
- **THEN** late callback 不会恢复旧 Session、发送第二个结果或影响另一插件

#### Scenario: 插件选择关闭目标

- **WHEN** `ui.close` params 包含 plugin ID、Page ID、window、route 或任意额外字段
- **THEN** Contract 使用稳定 `invalid_params` 拒绝 request
- **THEN** 当前或其他页面不发生关闭副作用

### Requirement: actions.open 必须限定为调用插件当前可用的局部 Action

`actions.open` MUST 只接受符合 Contract 的 plugin-local `actionId`。Dispatcher MUST 从 trusted Session `plugin_id` 和 local ID 推导现有投影规则使用的全局 Action ID，并 MUST 通过当前 Launcher Action Registry/Dispatcher 重新解析与执行；插件 MUST NOT 提交 global ID、owner、Page route 或 executor。

只有当前 Registry 中属于调用 plugin、enabled、available 且可执行的 Page-only Action 才可返回 `{ opened: true }`。未知、禁用、不兼容、已卸载、属于 `lensx.core` 或其他插件的目标 MUST 使用稳定 `not_found` 失败；executor 的未知失败 MUST 映射为安全 `internal_error`。任何错误 MUST NOT 暴露 executor、registry record、route、原始异常或 Host 对象。

#### Scenario: 插件打开自己的当前 Action

- **WHEN** current Session 使用局部 ID 调用一个由同一 plugin 当前投影、enabled 且 available 的 Page Action
- **THEN** Dispatcher 从 trusted plugin ID 推导全局 ID并复用现有 Launcher Action Dispatcher
- **THEN** Action 产生真实导航效果并返回 `{ method: "actions.open", result: { opened: true } }`

#### Scenario: 插件尝试调用 core 或其他插件 Action

- **WHEN** local ID 尝试表达 global/core/其他 provider namespace，或推导后的 Action owner 与 Session plugin 不一致
- **THEN** Contract 或 Dispatcher 使用稳定 `invalid_params` 或 `not_found` 拒绝调用
- **THEN** `lensx.core`、其他插件和任意 plugin-supplied executor 均不执行

#### Scenario: Action 在调用时已经不可用

- **WHEN** Action 在 Context discovery 后被移除、禁用、变为不兼容、卸载，或当前 Registry 无法解析它
- **THEN** Dispatcher 使用当前 Registry 事实返回稳定 `not_found`
- **THEN** 缓存 descriptor 或旧 capability snapshot 不会执行 stale executor

### Requirement: Dispatcher 必须保持稳定错误、取消与 terminal lifecycle 语义

Dispatcher provider MUST 只产生 Contract-valid Host API result、Host API error 或不会跨 wire 的 Host 私有 post-response effect。已知 domain failure MUST 映射为封闭错误代码；未知 throw、非法 provider output 或内部失败 MUST 转换为 `internal_error` 和固定安全英文消息。原始异常、stack、URL、path、payload、grant、identity、executor、Tauri/Rust/Host 对象 MUST NOT 进入插件可观察的 result、error、event 或诊断。

每个 provider MUST 在副作用前检查 Host cancellation 与 Session currentness，并在异步边界后重新检查。cancellation、timeout、disconnect、Page replacement、disable、uninstall、Host reload 或 disposal MUST 阻止尚未发生的 effect；late result/event/effect MUST 被丢弃，且 MUST NOT 影响 replacement Session。

#### Scenario: provider 抛出未知异常

- **WHEN** Context、Navigation 或 Action provider 抛出未分类异常或返回与 method 不匹配的内部值
- **THEN** 插件最多收到 Contract-valid `internal_error` 与安全固定消息，或按既有 fatal transport path 终止
- **THEN** 原始异常、stack、内部值和 Host 对象不跨越 Port

#### Scenario: cancellation 先于副作用

- **WHEN** SDK cancellation、timeout 或 Host terminal cleanup 在 provider effect 前获胜
- **THEN** Host-owned signal 被 abort，尚未发生的导航、Action 或 Context event 不执行
- **THEN** late completion 不发送第二个 response、event 或 effect

#### Scenario: 一个插件 Dispatcher 失败

- **WHEN** 某 Session 的 request、provider、codec 或 lifecycle 发生失败
- **THEN** 失败最多终止该 Session/adapter 并产生安全有界诊断
- **THEN** 其他插件 Session、Registration、权限和应用 service 状态不被连带修改

### Requirement: 交付必须证明真实生产接线且不吞并后续能力

生产 `PluginRuntimeFrame` MUST 为 current ready lease 安装真实 session-scoped Dispatcher，而不是固定 unavailable handler；测试 MUST 仍能显式注入 fake/unavailable binding。交付 MUST 覆盖 Dispatcher 单元测试、Navigation/Action 回归、真实 SDK 与 MessageChannel round-trip、并发/取消/替换/cleanup、malicious or stale identity、完整 Context event、响应后关闭顺序和目标 macOS WKWebView 证据。

英文架构、workspace/validation 文档及其相同路径中文镜像 MUST 将 Host API Contract、transport、Dispatcher、permission/storage/RPC validation 的交付状态区分开。根前端 build/typecheck/test/check、格式与静态检查，以及 Rust format/test/check 无回归门禁 MUST 全部通过。本 capability MUST NOT 声称 storage persistence、clipboard native execution、完整 permission management、通用 RPC limits、模板、CLI 或开发模式已经交付。

#### Scenario: 生产 Dispatcher 闭环通过

- **WHEN** 外部插件只使用公共 Contract 与 SDK tarball，在真实 Runtime Session 上初始化并调用三个已实现方法
- **THEN** Context、Page close 和本插件 Action 通过同一认证 Port 与真实 Host provider 完成，并保持稳定结果/错误和 terminal cleanup
- **THEN** 插件不需要也不能 import Host 私有模块、private wire、Tauri 或 executor

#### Scenario: 后续方法仍未交付

- **WHEN** Task 5.3 的聚焦和全量门禁通过，而 storage、permission 或 RPC limit change 尚未完成
- **THEN** `storage.*` 与 `clipboard.*` 不进入当前 capabilities 并稳定失败关闭
- **THEN** Roadmap 与文档只将 Task 5.3 标记为 Host API Dispatcher 完成，不将 Task 5.4、5.5、5.6 或 Milestone 5 描述为完成
