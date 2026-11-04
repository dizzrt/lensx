# Spec Delta

## MODIFIED Requirements

### Requirement: Runtime Context MUST derive from current Host facts and real provider availability

The Dispatcher MUST derive complete Context from the current Host API `0.4.0` catalog, trusted Session, locale/theme, and actually composed providers; a missing activation provider does not invalidate other capabilities or empty-capability Context.

#### Scenario: Only base and storage providers are available
- **WHEN** the current Session binds only base and scoped-storage providers
- **THEN** Context lists only their corresponding methods in sorted, unique order, excluding `http.request`
- **THEN** clipboard, permissions, ordinary browser network, and Worker do not appear in the method list

#### Scenario: HTTP provider is available
- **WHEN** the current trusted Session composes an available controlled HTTP provider
- **THEN** complete Context includes `http.request`, with the same decision for every plugin source
- **THEN** HTTP unavailability omits the method without falling back to plugin-specific native shortcuts

#### Scenario: Legacy permission facts remain in an isolated record
- **WHEN** recovery encounters old permission/grant fields in isolated records or stale frontend payloads
- **THEN** the Dispatcher ignores their authority and rejects incompatible boundary data
- **THEN** Context does not project old clipboard capabilities

#### Scenario: Unavailable capabilities are excluded from Context
- **WHEN** a composed provider is unavailable to the current Session
- **THEN** Context removes only the affected methods
- **THEN** catalog membership, Manifest content, official source, and old facts cannot make a method a current capability

#### Scenario: Storage namespace becomes degraded
- **WHEN** the Host confirms that the current identity's storage namespace is damaged or blocked while the rest of the Session remains valid
- **THEN** the Host publishes complete Context without the five storage capabilities, leaving other capabilities unchanged
- **THEN** identical degraded snapshots are not repeated, and Context contains no storage paths, values, usage, or diagnostics

#### Scenario: Locale or theme changes
- **WHEN** application locale/theme changes while Session identity and provider availability remain valid
- **THEN** the Host sends one complete, Contract-valid, frozen Context replacement
- **THEN** the SDK replaces all Context before notifying subscribers, and plugins see no Host-private state

#### Scenario: Session authority changes
- **WHEN** 与该实例相关的 Registration 事实、resource generation 或 Runtime attempt 变化使旧 Session 身份失效
- **THEN** the old Session terminates and its old Context cannot authorize subsequent provider calls
- **THEN** `runtime.context_changed` cannot grant new identity to or reauthorize the old Session

#### Scenario: Derive available methods from actually composed providers
- **WHEN** the Dispatcher constructs Context for a current Session
- **THEN** It MUST NOT read Manifest permission requests, persisted grants, permission catalogs, or clipboard availability, and MUST NOT list ordinary browser capabilities as Host API methods.
- **THEN** Context MUST list the separate `http.request` method only when the controlled HTTP provider is currently available.

#### Scenario: Publish complete Context replacements and retire invalid identities
- **WHEN** a runtime.get_context call or Host fact change occurs
- **THEN** `runtime.get_context` MUST accept exact `{}` and return complete, Contract-valid, copied, frozen Context.
- **THEN** Real locale, theme, or provider-availability changes in the same Session MUST publish one complete `runtime.context_changed` replacement; identical snapshots MUST NOT be published repeatedly.
- **THEN** 身份、相关 Registration 事实、resource generation 或 Runtime attempt 失效 MUST 终止受影响旧 Session，不能通过事件重新授权；无关全局 revision 或合法窗口分离 MUST NOT 使仍有效 Session 失效。

#### Scenario: Compose or omit an activation provider
- **WHEN** the current Session has a valid composed activation provider or that provider is absent
- **THEN** the former Context advertises the available actions.get_activation and actions.subscribe_activations methods, while the latter omits unavailable methods
- **THEN** Context retains its four-field shape, and independent queries and events provide activation facts without inventing plugin permissions or native input-monitoring capabilities

#### Scenario: Multiple instances receive the same application settings change

- **WHEN** locale、theme 或实际 provider availability 改变，主窗口及独立窗口中存在多个有效 Session
- **THEN** Host MUST 为每个受影响 Session 分别发布完整、合法且去重的 Context replacement，并按其自身 provider 状态派生 capabilities
- **THEN** 同插件的 Session MUST 不共享事件队列或身份；一个实例失效不能使其他有效实例漏掉更新或收到错误身份的事件

### Requirement: ui.close MUST close only the calling Session's current Page after delivering a successful response

`ui.close` MUST 仅接受精确 `{}`。Host MUST 从可信调用 Session 的实例租约派生唯一关闭目标；相同 plugin/Page 的兄弟实例不能成为替代目标。成功响应 MUST 先交付，随后只关闭调用实例及其所属 Page；独立实例关闭所属独立窗口，主窗口实例按主窗口导航契约返回 Home。

#### Scenario: Current plugin closes its own Page

- **WHEN** 有效且就绪的插件 Session 调用 `ui.close`，且响应交付时其原实例及所属 surface 中的 Page 仍匹配
- **THEN** the SDK first receives
  `{ method: "ui.close", result: { accepted: true } }`
- **THEN** the Host closes that Page and terminates its Runtime, and the effect
  executes only once

#### Scenario: Old Session attempts to close a replacement Page

- **WHEN** Page navigation, Session replacement, disable, uninstall,
  disconnect, disposal, or cancellation occurs while a `ui.close` response is
  pending
- **THEN** the post-response effect fails its currentness or target-match check
  and does not close the new or unrelated Page
- **THEN** a late callback does not revive the old Session, send a second
  result, or affect another plugin

#### Scenario: Plugin selects a close target

- **WHEN** `ui.close` params contain a plugin ID, Page ID, window, route, or any
  extra field
- **THEN** the Contract rejects the request with stable `invalid_params`
- **THEN** no current or other Page is closed

#### Scenario: Derive the close target only from current Session identity
- **WHEN** the calling plugin requests ui.close
- **THEN** Dispatcher MUST 从可信 Session 身份及独立实例租约派生唯一目标；`{ owner_id: plugin_id, page_id }` 只能描述业务 Page，不能单独选择运行实例。公共调用 MUST NOT 接受 window、instance、route、plugin、Page 或其他目标字段。
- **THEN** 只有目标仍是调用 Session 绑定的未终止 Plugin Page 实例，且 attempt、Session 与当前来源租约仍有效时，调用才可返回 `{ accepted: true }`；`recovery_required` 中可由 Host 保留的同一实例/事务上下文选择明确终止目标，无需伪称稳定窗口归属。当前操作系统焦点和主窗口 active Page MUST NOT 替代该判断。

#### Scenario: Deliver the close response before a compare-current effect
- **WHEN** the Host transport completes or loses a pending ui.close result
- **THEN** The Host transport MUST validate and successfully deliver the Contract result and terminal the request before executing at most one Host-owned close effect.
- **THEN** The close effect MUST recheck currentness and the target match.
- **THEN** If the Page or Session was replaced while the response was pending, the call was cancelled, or the adapter terminated, the effect MUST NOT close any Page.
- **THEN** 关闭 MUST 使用 Host 的实例级导航边界并执行该实例的 WebView、Session、桥接、待完成请求和监听器清理；不得清理相同 plugin/Page 的其他实例。

#### Scenario: Close the caller among multiple instances of the same plugin

- **WHEN** A 与 B 属于相同 plugin/Page，A 调用 `ui.close`，而焦点位于 B 或主窗口
- **THEN** 合法响应交付后 Host MUST 只关闭 A 及其所属独立窗口；B 和主窗口其他 Page MUST 保持不变
- **THEN** 调用者不能借助相同业务身份、焦点变化或已知公共 Action 关闭其他实例

#### Scenario: Valid detachment occurs before a close response is delivered

- **WHEN** A 的合法 close 响应尚未交付，A 成功迁移到独立窗口且 Session 与 attempt 仍有效
- **THEN** 交付后的唯一 close effect MUST 解析 A 当前可信归属并只关闭迁移后的 A
- **THEN** 它 MUST NOT 关闭已经回 Home 或已打开新实例的 Launcher，也不能因迁移而重复执行

#### Scenario: Recovery-required state still permits explicitly closing the calling instance
- **WHEN** `recovery_required` 中仍通过当前来源与 Session 校验的原实例请求合法 `ui.close`
- **THEN** 成功响应交付后唯一关闭效果 MUST 按原 attempt 终止该实例及恢复上下文，不等待无限恢复、不依赖主窗 active Page 或推测 owner，不关闭兄弟/替代实例
- **THEN** 失败或取消的响应 MUST 不产生关闭效果，终止后迟到恢复 MUST 不复活或重新授权该实例

### Requirement: actions.open MUST be limited to the calling plugin's currently available local Action

`actions.open` MUST 仅接受合法的插件本地 `actionId`，并从调用 Session 派生所属实例和承载窗口。合法 Action MUST 在调用者所属 surface 内导航：相同 Page 保留该实例，其他 Page 仅替换该 surface 的实例。调用 MUST NOT 自动新建窗口、劫持 Launcher 或选择同插件其他独立窗口。普通迁移期间归属解析 MUST 有界等待；`recovery_required` 期间 MUST 有界返回现有 `unavailable`，不得替换原实例或在恢复后自动重放。

#### Scenario: Plugin opens its own current Action

- **WHEN** a current Session calls an enabled and available Page Action
  currently projected by the same plugin using its local ID
- **THEN** Dispatcher MUST 从可信插件身份派生全局 ID，复用统一 Action 校验与执行语义，并将导航限定到调用实例所属 surface
- **THEN** the Action produces its real navigation effect and returns
  `{ method: "actions.open", result: { opened: true } }`

#### Scenario: Plugin attempts to invoke a core or other-plugin Action

- **WHEN** a local ID attempts to express a global, core, or other-provider
  namespace, or the derived Action owner differs from the Session plugin
- **THEN** the Contract or Dispatcher rejects the call with stable
  `invalid_params` or `not_found`
- **THEN** `lensx.core`, other plugins, and every plugin-supplied executor do
  not execute

#### Scenario: Action is no longer available at call time

- **WHEN** an Action was removed, disabled, became incompatible, was
  uninstalled, or can no longer be resolved from the current Registry after
  Context discovery
- **THEN** the Dispatcher returns stable `not_found` from current Registry
  facts
- **THEN** a cached descriptor or old capability snapshot does not execute a
  stale executor

#### Scenario: Resolve a plugin-local Action through the unified Registry
- **WHEN** the calling plugin submits an actions.open request
- **THEN** Dispatcher MUST 根据可信 Session `plugin_id` 与既有投影规则派生全局 Action ID，经过当前统一 Registry 和 Dispatcher 校验执行，并通过 Host 私有调用上下文绑定所属实例和 surface；公共参数不增加目标实例或窗口。
- **THEN** A plugin MUST NOT submit a global ID, owner, Page route, or executor.

#### Scenario: Reject unavailable or foreign Action targets safely
- **WHEN** the requested local Action is unavailable or its Host executor fails
- **THEN** Only an enabled, available, executable Page-only Action owned by the calling plugin in the current Registry may return `{ opened: true }`.
- **THEN** An unknown, disabled, incompatible, uninstalled, `lensx.core`, or other-plugin target MUST fail with stable `not_found`.
- **THEN** An unknown executor failure MUST map to safe `internal_error`.
- **THEN** No error MUST expose an executor, Registry record, route, original exception, or Host object.

#### Scenario: Open the same Page Action within a detached window

- **WHEN** 有效独立实例 A 调用自身插件的 Action，目标仍是 A 当前 Page
- **THEN** Host MUST 向 A 的现有实例交付新的 `normal` activation，并保留 A 的 document、Session、输入和业务状态
- **THEN** 主窗口和同 plugin/Page 的 B MUST 不被聚焦、重载、替换或接收 A 的 activation

#### Scenario: Navigate to another Page of the same plugin within a detached window

- **WHEN** A 调用本插件的有效 Action，目标为不同 Page
- **THEN** Host MUST 仅在 A 所属独立窗口执行 Page 替换及对应终止/新建规则，保留该窗口的独立承载身份
- **THEN** 新 Page MUST 使用其自身经过校验的 presentation，主窗口和兄弟实例 MUST 不变
- **THEN** 成功结果和旧请求终止 MUST 保持既有响应、取消与严格当前性规则，不能为送达结果复活旧 Session

#### Scenario: External Launcher entry and plugin-internal entry use separate routes

- **WHEN** Launcher 搜索、点击、最近使用、固定条目或全局 Action 快捷键发起插件 Action，且同插件已有独立实例
- **THEN** Host MUST 将外部入口路由到主 Launcher surface，按照主窗口规则复用其当前 Page 或建立新实例
- **THEN** 外部入口 MUST NOT 默认选择、聚焦或广播给独立实例；插件内部 `actions.open` 仍只属于调用者 surface

#### Scenario: Action calls in recovery-required state are rejected within a bound
- **WHEN** 调用 Session 对应实例正在 `recovery_required`，或等待普通迁移归属期间进入该状态
- **THEN** `actions.open` MUST 在既有有界等待范围内返回 `unavailable`，不创建/替换 Page、不重新选择窗口、不排队至用户恢复后自动执行
- **THEN** 原 Session 的其他仍合法数据调用和进行中结果 MUST 继续受当前 source/generation/租约与配额校验；恢复状态不授予新权限，也不改变成功响应后明确关闭的边界

### Requirement: Dispatcher MUST preserve stable error, cancellation, and terminal lifecycle semantics

Dispatcher providers MUST produce only a Contract-valid Host API result, a Contract-valid Host API error, or a Host-private post-response effect that never crosses the wire.

#### Scenario: Provider throws an unknown exception

- **WHEN** a Context, Navigation, or Action provider throws an unclassified
  exception or returns an internal value that does not match the method
- **THEN** the plugin receives at most a Contract-valid `internal_error` with
  a fixed safe message, or the existing fatal transport path terminates
- **THEN** 原异常、调用栈、内部值与 Host 对象 MUST 不进入插件可观察的原生桥接响应、事件或诊断

#### Scenario: Cancellation wins before a side effect

- **WHEN** SDK cancellation, timeout, or Host terminal cleanup wins before a
  provider effect
- **THEN** the Host-owned signal is aborted and pending navigation, Action, or
  Context event work does not execute
- **THEN** a late completion sends no second response, event, or effect

#### Scenario: One plugin Dispatcher fails

- **WHEN** a Session request, provider, codec, or lifecycle fails
- **THEN** the failure terminates at most that Session or adapter and produces
  a safe bounded diagnostic
- **THEN** 其他实例的 Session、Registration 与应用服务状态 MUST 不被附带修改；旧 permission 或 grant 事实不能改变该隔离边界

#### Scenario: Keep provider failures inside the safe wire contract
- **WHEN** a Dispatcher provider returns, throws, or prepares a post-response effect
- **THEN** Known domain failures MUST map to closed error codes.
- **THEN** An unknown throw, invalid provider output, or internal failure MUST become `internal_error` with a fixed safe English message.
- **THEN** An original exception, stack, URL, path, payload, grant, identity, executor, Tauri, Rust, or Host object MUST NOT enter a plugin-observable result, error, event, or diagnostic.

#### Scenario: Cancel stale asynchronous provider work
- **WHEN** an operation crosses an asynchronous boundary or its Session is cancelled or invalidated
- **THEN** Every provider MUST check Host cancellation and Session currentness before a side effect and again after an asynchronous boundary.
- **THEN** 取消、超时、断连、所属实例的 Page 替换或 disposal，以及使该实例失效的禁用、卸载或可信 Host 协调器 reload，MUST 阻止尚未发生的效果；普通主窗口呈现替换与隐藏不属于独立实例的终止。
- **THEN** A late result, event, or effect MUST be dropped and MUST NOT affect a replacement Session.

#### Scenario: Detachment does not cancel the caller's valid requests

- **WHEN** 原实例在合法 storage、HTTP、Context 或 activation 操作进行中成功分离
- **THEN** 同一 Session 的待完成操作与请求序列 MUST 保持有效，结果只返回原调用实例；主窗口回 Home MUST NOT 取消它们
- **THEN** HTTP MUST 继续执行既有每 attempt 4 个、全局 16 个并发与 deadline 约束，不因迁移重复提交或重置额度

#### Scenario: Terminating one instance of the same plugin cancels only its own operations

- **WHEN** A 与 B 并行调用 Host API，且只有 A 关闭、重试或故障终止
- **THEN** Host MUST 仅取消 A 的待完成请求、事件和未执行效果，并丢弃其迟到结果；B 的有效请求 MUST 继续
- **THEN** 已提交的插件级 storage 写入 MUST 保留既有原子提交语义，不能因 A 响应丢失而回滚；B 可通过后续正常读取观察已提交值

#### Scenario: Plugin invalidation or application exit terminates all affected requests

- **WHEN** 插件禁用、卸载、generation 变化或应用退出使多个 Session 失效
- **THEN** Host MUST 对所有受影响 Session 幂等取消待完成操作，并抑制未执行的效果和迟到响应
- **THEN** 无关且仍有效的 Session MUST 不被取消；应用退出则清理全部 Session

### Requirement: Dispatcher authority MUST derive only from the current Child WebView Session
生产 dispatch MUST 仅接受原生来源、独立实例租约与 RPC 校验共同确认的有效 Session 请求。插件/Page、实例归属、capability 与 storage namespace MUST 全部来自可信 Session；每次效果和响应 MUST 再确认原调用实例，而不能以全局当前 Page、焦点或相同 plugin/Page 的另一实例代替。插件不能提供 native source、handle、instance、window 或其他 authority。

#### Scenario: Current WebView calls a supported method
- **WHEN** a validated bridge request reaches Dispatcher from the current ready Session
- **THEN** existing Host API semantics execute for that Session only

#### Scenario: Old WebView calls a valid method
- **WHEN** a replaced or destroyed source sends an otherwise valid request
- **THEN** request is rejected before provider invocation with zero side effect

#### Scenario: Identical request sequence numbers return to their own sources

- **WHEN** A 与 B 属于同 plugin/Page，且各自 Session 使用相同公共请求序号并调用相同方法
- **THEN** Host MUST 以原生来源和实例/Session 绑定分别校验、执行和返回；取消 A MUST NOT 取消 B
- **THEN** A 的私有帧、响应或事件 MUST 不能伪造 B 的源绑定，也不能利用共用 generation scope 绕过检查

## ADDED Requirements

### Requirement: Host API services MUST remain available independently of Launcher presentation lifecycle

主窗口隐藏、返回 Home 或切换其页面 MUST NOT 卸载服务于仍有效独立实例的受信 Host 协调能力。各窗口 MUST 使用实例范围内的受信呈现与控制边界；共享应用事实和服务不得因窗口增加产生相互竞争的全局快捷键注册、Action 注册或 Settings 持久化所有者。

#### Scenario: A detached plugin continues calling Host API while main is hidden

- **WHEN** 分离成功后 Launcher 处于隐藏 Home，而独立实例继续调用 Context、storage、HTTP 或自身 Action
- **THEN** 其有效调用 MUST 按现有能力和实例路由正常服务，不能因主窗口没有 active plugin Page 而被判定过期
- **THEN** 主窗口再次显示、隐藏或打开另一个插件 MUST 不重建独立实例的 Dispatcher 绑定

#### Scenario: Close one trusted window presentation

- **WHEN** 一个独立窗口关闭并移除其受信 chrome，而其他窗口实例仍有效
- **THEN** Host MUST 仅移除该窗口与实例的呈现、监听和控制租约，保留其他实例所需的公共协调服务
- **THEN** 真正的应用退出或协调器失效 MUST 走统一终止流程，不能留下失去 Host 服务却仍保有原生 authority 的实例
