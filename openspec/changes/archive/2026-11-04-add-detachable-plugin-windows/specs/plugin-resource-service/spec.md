# Spec Delta

## MODIFIED Requirements

### Requirement: Resource scopes MUST be unguessable, process-local, and bound to exactly one payload generation

The system MUST use an operating-system CSPRNG to generate at least 128 bits of entropy for each scope and MUST NOT use time, process ID, an incrementing sequence, a path, or an unkeyed plain hash as a bearer token.

#### Scenario: The Host issues or reuses a current resource scope

- **WHEN** a current entry and resource generation is resolved to a scope
- **THEN** 每个当前 `(entry_id, resource_generation)` MUST 最多映射到一个有效 scope；只要该 scope 仍有有效实例租约或有界创建预留，重复解析和并发实例 MUST 复用它。
- **THEN** The scope MUST serve as both the isolated browser-origin key and the path-authorization key, and the authority scope and path scope MUST match exactly.
- **THEN** A scope MUST reside only in process memory and MUST NOT be persisted, sent in a changed event, written to logs, or returned as a standalone field.

#### Scenario: A scoped URL authorizes a protocol read

- **WHEN** a protocol request presents an opaque scope and readable URL fields
- **THEN** 每个协议请求 MUST 根据当前 Manager projection 重新确认 scope、entry、generation、plugin identity、version、digest 与 payload root，并确认调用实例的来源租约、attempt 和实际原生 WebView 来源仍有效。
- **THEN** URL 可读字段、浏览器 same-origin 结果或仅持有 opaque scope MUST NOT 替代完整的实例来源授权。

#### Scenario: The same generation is resolved repeatedly

- **WHEN** 调用者重复有效查询，且 Registration、resource generation 与仍被有效租约或创建预留持有的 scope 未变
- **THEN** the Host returns the same entry URL and isolated browser origin and
  does not create scopes without bound
- **THEN** a revision change for an unrelated plugin does not invalidate this
  scope

#### Scenario: The same version is reinstalled with different content

- **WHEN** the same plugin ID and semantic version are successfully replaced by
  a package with a different digest
- **THEN** the old resource generation, scope, and origin are permanently
  invalidated, and the new registration receives a different scope and origin
- **THEN** the old URL cannot return the new payload, stale cached content, or
  authority from the new generation

#### Scenario: A plugin is disabled and then re-enabled

- **WHEN** the same payload is enabled again after a successful disable
- **THEN** the pre-disable scope and origin are not restored, and the next
  successful resolution creates a new scope and origin
- **THEN** matching plugin ID, version, and digest cannot make the old bearer URL
  valid again

#### Scenario: The application process restarts

- **WHEN** the Manager recovers the same registration from the existing Store
- **THEN** all scopes and origins from the prior process are unavailable, and
  the recovered registration uses a new process-local generation
- **THEN** the Store record, Registration Contract, and package layout gain no
  persisted scope, origin, or generation field

#### Scenario: Reopen after the final source lease is released

- **WHEN** 同 generation 的最后一个有效实例租约及创建预留均已释放，之后用户再次打开该插件
- **THEN** Host MUST 永久撤销旧 scope，并为后续有效创建签发新的不可预测 scope；旧 URL MUST NOT 恢复有效
- **THEN** 仍有效的 immutable byte cache MAY 按现有 generation、来源和文件规则复用，但不能恢复旧 Session、Worker、模型或租约

#### Scenario: Concurrent creation and closure share a generation

- **WHEN** 实例 A 关闭，而同 generation 的 B 已有有效来源租约或仍持有有界的创建预留
- **THEN** A 的关闭 MUST NOT 撤销 B 所持有的共同 scope，也不能使 B 重载文档或重建 Session
- **THEN** 创建预留 MUST 绑定可信创建 attempt，并在失败、取消、超时或终止时释放；预留本身 MUST NOT 授权任意 WebView 读取资源

### Requirement: Lifecycle commits MUST invalidate old scopes precisely for the affected plugin

The resource generation MUST change on a successful state transition that affects the target plugin's resource eligibility and MUST preserve scopes for unrelated plugins.

#### Scenario: Lifecycle outcomes determine old-scope eligibility

- **WHEN** a lifecycle, replacement, recovery, or process transition determines whether an old resource scope remains eligible
- **THEN** Disable, replacement, uninstall, quarantine or incompatible recovery, and new requests after process termination MUST cause the old scope to fail; re-enable and reinstall MUST use a new scope.
- **THEN** A failed or cancelled lifecycle or replacement transition MUST preserve the original registration, generation, and scope.
- **THEN** Once logical uninstall commits, whether physical payload cleanup completes MUST NOT affect the revocation decision.

#### Scenario: Disable or uninstall succeeds

- **WHEN** disable or logical uninstall of the target plugin has successfully
  committed
- **THEN** every new request rejects the old scope even if the payload directory
  still exists or cleanup is pending
- **THEN** the Resource Service does not wait for a frontend cache, physical
  deletion, or application restart before revoking the capability

#### Scenario: Replacement succeeds

- **WHEN** the candidate payload and Manager record have durably committed
- **THEN** the old scope is invalid immediately, and the new scope points only
  to the candidate's canonical payload
- **THEN** pending cleanup of the sibling old payload cannot cause the old scope
  to return any bytes

#### Scenario: Lifecycle or replacement fails

- **WHEN** disable or uninstall persistence or the replacement commit fails and
  the original registration remains valid
- **THEN** the original resource generation and scope remain valid
- **THEN** the Resource Service neither incorrectly revokes the original scope
  nor issues a candidate scope based on uncommitted intent

#### Scenario: Another plugin changes

- **WHEN** the global Registration revision increases because a different
  plugin's installation, diagnostics, or lifecycle changes
- **THEN** the unchanged current plugin's resource generation and scope remain
  valid
- **THEN** the global revision is not the sole authorization condition for a
  protocol request

#### Scenario: Plugin generation invalidation reaches every instance

- **WHEN** 禁用、卸载、替换、开发 reload 或 retirement 提交了目标插件的 eligibility 或 generation 变化
- **THEN** Host MUST 在清理 payload 前撤销该目标的全部旧实例来源租约、创建预留和 scope，包括无焦点独立窗口
- **THEN** 已关闭实例、晚到创建和缓存读取 MUST NOT 重新获得旧授权；无关插件仍有效的租约 MUST 保持不变

### Requirement: Resource authority MUST match the current Child WebView source
资源解析 MUST 仅产生 Host 私有事实。同 generation 可由多个实例共享 scope，但每个协议请求及缓存命中 MUST 同时匹配调用实例的有效租约、Runtime attempt 与实际原生 WebView 来源。终止只撤销对应来源；generation 失效撤销全部匹配来源。Host、未知来源与已撤销来源 MUST fail closed，知道有效 URL 不构成授权。

#### Scenario: Current WebView requests a package file
- **WHEN** the current bound Child WebView requests a safe regular file in its exact generation
- **THEN** the service returns fixed MIME and security headers under the existing bounded rules
- **THEN** the response confers no authority on any other WebView

#### Scenario: Generation is replaced during a cached request
- **WHEN** a replacement commits before a previous-generation request or cache lookup completes
- **THEN** compare-current validation rejects the late result and no bytes reach the replacement WebView

#### Scenario: Two instances of the same plugin read the same resource concurrently

- **WHEN** A 与 B 属于同一当前 generation，各自拥有独立有效的 source/attempt 租约并请求同一包文件
- **THEN** 两个请求 MUST 分别完成来源和 generation 校验后成功，允许复用共同的已验证 immutable bytes
- **THEN** A 的授权 MUST NOT 被 B 覆盖；共享 scope MUST NOT 使其他未授权来源获得读取能力

#### Scenario: An old source impersonates a sibling through their shared URL after closure

- **WHEN** A 已关闭而 B 仍有效，A 的旧 WebView 或晚到请求使用 B 仍在使用的同 generation URL
- **THEN** A 的来源租约 MUST 已失效，该请求及其缓存结果 MUST 被拒绝
- **THEN** B 的文档、来源租约、资源读取和 Session MUST 保持有效，不因 A 清理而撤销共同 scope

#### Scenario: Detaching the original instance preserves its resource lease

- **WHEN** Host 成功将原实例从主窗口迁移到独立窗口，实际 WebView、attempt 与 generation 均未改变
- **THEN** 原来源租约和资源 URL MUST 连续有效；窗口归属变化不能触发 scope 撤销、资源重解析或文档重载
- **THEN** 迁移失败或与终止竞争时，只有仍获 Host 确认的当前来源与归属可以继续使用租约

#### Scenario: An instance closes after request validation but before delivery

- **WHEN** A 的资源读取或缓存命中已开始，但在字节交付前 A 终止，而同 generation 的 B 仍在运行
- **THEN** 最终校验 MUST 丢弃 A 的结果；不能因 B 仍拥有共同 scope 就向 A 交付
- **THEN** 结果 MUST NOT 改投 B；B 自己的有效请求保持独立
