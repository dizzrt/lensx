## ADDED Requirements

### Requirement: Host API v1 MUST expose one closed, versioned semantic catalog

系统 MUST 定义 Host API `0.1.0` 的闭集 method catalog，且只包含 `runtime.get_context`、`ui.close`、`actions.open`、`storage.get`、`storage.set`、`storage.delete`、`storage.list`、`storage.get_quota`、`clipboard.read` 和 `clipboard.write`。每个 catalog entry MUST 绑定唯一 params Schema、result Schema 和 `null | clipboard.read | clipboard.write` permission requirement。package patch MUST NOT 静默增加、删除、重命名或改变 method、permission、result 或 error 语义。

`system.open_external`、任意文件、任意网络、Shell、进程、Tauri command、插件间消息和后台执行 MUST NOT 成为 v1 method 或 permission 占位。

#### Scenario: Consumer enumerates the v1 catalog

- **WHEN** 外部 consumer 通过公共 Contract entry 读取 Host API v1 catalog
- **THEN** consumer 得到按 method ID 稳定排序、不可修改且无重复的十个 entry
- **THEN** 每个 entry 都引用已发布的 params/result Schema 和明确的 permission requirement

#### Scenario: Consumer requests an undeclared method

- **WHEN** consumer 校验 `system.open_external`、任意字符串或另一个未声明 method
- **THEN** Contract 以稳定 `method_not_found` 语义拒绝该 method
- **THEN** 未知 method 不会因为匹配命名约定而成为 capability

#### Scenario: Official provenance attempts to expand the catalog

- **WHEN** plugin 的 source、publisher 或未来 signature 状态表示官方来源
- **THEN** catalog、permission requirement 和 payload Schema 与第三方插件完全相同
- **THEN** 官方来源不会获得隐藏 method 或 permission bypass

### Requirement: Runtime Context MUST be the single capability-discovery snapshot

`runtime.get_context` MUST 接受 exact empty params 并返回一个只读 `PluginRuntimeContext`，其字段严格为 Host API SemVer `hostApiVersion`、`en-US | zh-CN` locale、`light | dark` theme 和排序、去重的 `capabilities` method ID 列表。capability MUST 表示该 method 对当前 Session 同时满足 Host 支持、实现可用与当前有效授权；Context MUST NOT 包含或接受 plugin ID、entry、Page、source、publisher、Manifest request、raw grant、安装路径、executor 或 Host 生命周期对象。

系统 MUST 定义 `runtime.context_changed` event，其 payload 是完整、可独立校验的 Context replacement 而不是字段 patch。使可信 Session 身份或 grant snapshot 失效的变化 MUST 终止旧 Session，MUST NOT 仅通过该 event 重新授权旧 Session。

#### Scenario: Current Session receives its Context

- **WHEN** 当前可信 Session 请求 `runtime.get_context`
- **THEN** result 使用当前 Host API version、locale、theme 和当前可调用 method ID 生成
- **THEN** result 被复制、排序、去重并冻结，且不泄露 raw grant 或 Host-private facts

#### Scenario: Session currently has no callable capability

- **WHEN** Host 对当前 Session 没有可公开的已实现 method
- **THEN** `runtime.get_context` 返回空 `capabilities`
- **THEN** Contract 不根据 Manifest request、source 或 catalog 全集发明可用能力

#### Scenario: Locale or theme changes without invalidating identity

- **WHEN** 当前 Session 保持有效而应用 locale 或 theme 改变
- **THEN** `runtime.context_changed` 携带完整的新 Context snapshot
- **THEN** 未列入新 snapshot 的 capability 不再被 plugin 视为当前可调用

#### Scenario: Plugin supplies trusted Context fields

- **WHEN** params、event 或另一个 author-controlled payload 尝试提交 identity、grant、source、Host API version、locale、theme 或 capability override
- **THEN** exact Schema 拒绝额外字段或错误来源的 Context
- **THEN** 插件输入不能改变 Host 派生的 Runtime facts

### Requirement: Session-scoped UI and Action methods MUST NOT become general Host executors

`ui.close` MUST 接受 exact empty params，只能请求关闭发起调用的当前插件 Page Session，并 MUST 先产生 `{ accepted: true }` success result 的 transport handoff，再调度 Host-owned terminal teardown。它 MUST NOT 接受 window、Page、plugin、route 或 application target。

`actions.open` MUST 只接受调用者 Manifest Action ID 规则下的 plugin-local `actionId`，并 MUST 返回 `{ opened: true }`。Host MUST 从可信 Session plugin ID 派生全局 Action ID，只能解析当前 Registry 中属于该 plugin 且当前可用的 Page-only Action；它 MUST NOT 调用 `lensx.core`、其他插件 Action、未知/禁用 Action或插件提交的 executor。

#### Scenario: Current plugin closes its own Page

- **WHEN** 当前 ready Session 以 `{}` 调用 `ui.close`
- **THEN** Host API success 语义为 `{ accepted: true }`
- **THEN** response handoff 之后的关闭仍由 Host 当前性检查与终端 lifecycle 执行

#### Scenario: Plugin attempts to choose a close target

- **WHEN** `ui.close` params 包含 plugin ID、Page ID、window ID、route 或其他字段
- **THEN** exact params Schema 以 `invalid_params` 拒绝请求
- **THEN** 当前页面、其他插件页面和应用窗口均不会因该非法 payload 被选择

#### Scenario: Plugin opens its own available Action

- **WHEN** 当前 Session 以有效 local `actionId` 调用 `actions.open`，且同 owner 的已投影 Page-only Action 当前可用
- **THEN** Host 可以派生全局 ID并返回 `{ opened: true }`
- **THEN** payload 不需要也不允许携带 plugin identity、global ID、route 或 executor

#### Scenario: Plugin targets another provider or unavailable Action

- **WHEN** `actionId` 试图表达全局/core/其他 plugin Action，或 local Action 未知、禁用、不兼容、已卸载或当前不可用
- **THEN** Contract 或后续 Host 以 `invalid_params` 或 `not_found` 的稳定语义拒绝
- **THEN** Dispatcher 不执行任意 Host 或跨插件 Action

### Requirement: Private storage methods MUST derive namespace from trusted Session identity

Host API v1 MUST 定义 `storage.get`、`storage.set`、`storage.delete`、`storage.list` 与 `storage.get_quota`。key MUST 是有界非空字符串；value MUST 是 JSON-compatible 值且 MUST NOT 接受 function、symbol、bigint、循环对象、DOM、Tauri 或 Host object。任何 storage params MUST NOT 接受 plugin ID、namespace、路径或安装位置。

`storage.get` MUST 区分 `{ found: false }` 与 `{ found: true, value }`；`storage.delete` MUST 返回是否删除了现有 key；`storage.list` MUST 以稳定顺序分页返回 key 与 opaque continuation cursor，MUST NOT 批量返回 value；`storage.get_quota` MUST 返回当前 namespace 的非负安全整数 `usedBytes` 与正安全整数 `limitBytes`。具体持久化、总容量、单值字节和损坏恢复由后续 storage capability 实现，但 MUST NOT 改变这些 v1 判别结构。

#### Scenario: Plugin stores and reads JSON data

- **WHEN** 当前 Session 使用有效 key 与 JSON-compatible value 调用 `storage.set`，随后调用 `storage.get`
- **THEN** success 结构分别为 `{ stored: true }` 与 `{ found: true, value }`
- **THEN** namespace 始终从当前可信 Session plugin ID 推导

#### Scenario: Plugin reads or deletes a missing key

- **WHEN** 当前 namespace 不存在所请求 key
- **THEN** `storage.get` 返回 `{ found: false }` 且不附带 value
- **THEN** `storage.delete` 返回 `{ deleted: false }`，而不是泄露其他 namespace 是否存在同名 key

#### Scenario: Plugin lists an empty or paged namespace

- **WHEN** 当前 namespace 为空或 key 数量超过当前 page limit
- **THEN** `storage.list` 分别返回空 `keys`，或稳定排序的当前 page 与 opaque `nextCursor`
- **THEN** response 不包含 value、其他 plugin key、物理路径或内部 storage key

#### Scenario: Plugin queries its quota

- **WHEN** 当前 Session 调用 `storage.get_quota`
- **THEN** result 只包含当前 namespace 的 `usedBytes` 与 `limitBytes`
- **THEN** result 不公开其他插件用量、应用偏好用量或底层文件系统容量

#### Scenario: Plugin supplies another namespace or non-JSON value

- **WHEN** params 包含 plugin ID、namespace、路径、Host object 或非 JSON-compatible value
- **THEN** exact Schema 或纯 Runtime validator 以 `invalid_params` 拒绝
- **THEN** 非法输入不能进入后续 storage handler

### Requirement: Clipboard methods MUST require explicit, distinct permissions

`clipboard.read` MUST 接受 exact empty params、要求 `clipboard.read` permission 并返回 `{ text }`；空剪贴板文本 MUST 是有效成功结果。`clipboard.write` MUST 接受 `{ text }`、要求独立的 `clipboard.write` permission 并返回 `{ written: true }`；空文本 MUST 可用于清空文本剪贴板。一个 permission MUST NOT 暗含另一个，Manifest request、官方来源或 Host 支持 MUST NOT 单独构成授权。

#### Scenario: Authorized plugin reads text

- **WHEN** 当前 Session 的有效 capability snapshot 包含 `clipboard.read` 且后续 permission check 仍通过
- **THEN** `clipboard.read` 可以返回有界文本或空字符串
- **THEN** response 不包含原生剪贴板对象、格式列表或非文本 payload

#### Scenario: Write permission does not grant read permission

- **WHEN** 当前 Session 只有 `clipboard.write` 的有效授权并调用 `clipboard.read`
- **THEN** 调用以 `permission_denied` 拒绝
- **THEN** Host 不读取或回传剪贴板文本

#### Scenario: Permission changes during a call

- **WHEN** permission 在 capability discovery 后、handler 执行前被撤销或当前 Session 已失效
- **THEN** 每次调用的后续授权检查以 `permission_denied` 或 terminal disconnect 失败
- **THEN** 旧 Context snapshot 不能作为持久授权凭证

### Requirement: Semantic payload Schemas MUST be exact, paired and independently validatable

系统 MUST 为每个 method params/result、每个 event payload 和 Host API error 提供 Draft 2020-12 JSON Schema 与对应的生成 TypeScript 类型。对象 MUST 拒绝未知字段，method MUST 只与其声明的 params/result 配对，validator MUST 接受 `unknown`、不修改输入，并返回冻结的规范值或按 JSON Pointer path 与 code 稳定排序的有界诊断。

公共语义 Schema MUST NOT 包含 request ID、nonce、origin、Window、MessagePort、`postMessage`、JSON-RPC envelope、plugin identity、Registration revision、resource token、Tauri command 或 Host-private error。

#### Scenario: Valid method payload round-trips through validators

- **WHEN** consumer 为 catalog 中每个 method 提交其声明的 params 与 result fixture
- **THEN** 纯 validator 接受并返回与 Schema 语义一致的冻结值
- **THEN** repeated validation 产生 byte-equivalent normalized output

#### Scenario: Method and payload are mismatched

- **WHEN** `clipboard.write` 携带 storage params，或 `storage.get` 携带 clipboard result
- **THEN** validator 以稳定 path/code 诊断拒绝错误配对
- **THEN** payload 不会仅因自身是合法 JSON 而进入错误 handler

#### Scenario: Payload contains private transport or identity fields

- **WHEN** payload 增加 request ID、nonce、origin、plugin ID、grant、path、Tauri command 或 executor
- **THEN** exact Schema 拒绝额外字段
- **THEN** 诊断不回显敏感字段值或 raw payload

### Requirement: Host API errors MUST be stable, bounded and separate from SDK lifecycle errors

Host API v1 MUST 定义闭集错误码 `invalid_request`、`invalid_params`、`method_not_found`、`permission_denied`、`not_found`、`conflict`、`limit_exceeded`、`unavailable`、`cancelled`、`timeout` 与 `internal_error`。错误值 MUST 只包含 code 与稳定、有界、非本地化的安全 message，MUST NOT 包含 raw exception、stack、URL、路径、payload、grant、Host/Rust/Tauri object 或本地化产品文案。

Host API error MUST 与 SDK 的 `disposed`、`disconnected`、`transport_failure` 等生命周期错误保持可判别；未来 transport MUST NOT 把合法 Host API rejection 统一折叠为 `transport_failure`。

#### Scenario: Handler failure is exposed safely

- **WHEN** 后续 Host handler 抛出未知异常或返回非法内部值
- **THEN** plugin 只接收 `internal_error` 与安全 message
- **THEN** 原始异常、stack、路径、payload 和 Host object 不会进入公共错误

#### Scenario: Consumer handles a stable rejection

- **WHEN** plugin 捕获 `permission_denied`、`not_found`、`limit_exceeded` 或 `unavailable`
- **THEN** plugin 可以按 code 分支而不匹配 message 文本
- **THEN** message 语言不会随应用 locale 改变

#### Scenario: Transport disconnects before a Host result exists

- **WHEN** Session/transport 在 Host API success 或 rejection 产生前断开
- **THEN** SDK 保留其 `disconnected` 生命周期语义，而不伪造 Host API `internal_error`
- **THEN** 两类错误来源保持可预测

### Requirement: Host API evolution MUST use capability discovery and explicit deprecation

Host API protocol、SDK package 与 lensX application MUST 独立版本化。SDK MUST 先按 SemVer 检查 Host API 支持范围，再接受 Runtime Context；plugin MUST 只调用当前 Context `capabilities` 中声明的 method。兼容新增 method MUST 提升 Host API minor version 并通过 capability discovery 暴露；修改已有 payload/error/permission 的不兼容行为或删除 method MUST 提升 Host API major version。废弃 method MUST 保持原语义、在规范和 machine-readable catalog 中标记，并至少跨一个兼容 minor 窗口后才可在 major 版本删除。

#### Scenario: New compatible method appears

- **WHEN** 未来 Host API minor 版本新增 method，而 SDK 的支持范围包含该版本
- **THEN** 旧插件仍可按其已知 capability 工作，新插件只在 Context 声明后调用新 method
- **THEN** package patch 不会伪装成协议新增

#### Scenario: Host version is incompatible

- **WHEN** Runtime Context 的 Host API SemVer 不满足 SDK 支持范围
- **THEN** SDK 初始化以 `incompatible_host_api` 失败且不进入 ready
- **THEN** capability snapshot 不能绕过版本不兼容

#### Scenario: Method is deprecated

- **WHEN** method 在兼容 minor 版本被标记 deprecated
- **THEN** catalog 和维护文档提供稳定替代方向，同时 method 的 params/result/error 语义保持兼容
- **THEN** 删除只发生在声明的不兼容 major 版本

### Requirement: Contract delivery MUST prove cross-consumer drift without claiming execution

交付 MUST 包含 Schema/生成类型 drift gate、覆盖所有 method/result/event/error/permission 的 valid/invalid fixtures、TypeScript 与 Rust shared-fixture agreement、package boundary tests、真实 Contract 与 SDK tarball 的仓库外 no-DOM consumer，以及中英文语义一致的维护文档。门禁 MUST 证明 public exports 不泄露 Host-private类型，并证明 `PluginSdkClient` 仍没有 raw method entry 或具体 Host API 执行能力。

本 capability MUST NOT 注册 Tauri command、发送 MessagePort 请求、执行 Action/关闭/剪贴板/存储副作用、授予权限或声称 Milestone 5 Runtime 调用链已经完成。

#### Scenario: Complete contract gate passes

- **WHEN** focused Host API Contract gate 与 root validation 运行
- **THEN** Schema、生成类型、catalog、fixtures、TypeScript、Rust、tarball 和文档边界全部一致
- **THEN** 仓库外 consumer 可以独立校验契约而无需 React、DOM、Tauri 或 Host 私有源码

#### Scenario: Public types drift from Schema or catalog

- **WHEN** method、permission、Context、event、error 或 payload 的任一事实只在某个 consumer 中改变
- **THEN** 生成检查、shared fixture、package boundary 或 tarball gate 至少一项失败
- **THEN** drifted artifact 不被视为可发布

#### Scenario: Contract completes before transport and dispatch

- **WHEN** 本 change 的全部验证通过而 Task 5.2–5.6 仍未交付
- **THEN** Host API v1 可以被规范、生成类型和独立校验
- **THEN** 插件仍不能通过公共 SDK 发出或执行真实 Host API 请求
