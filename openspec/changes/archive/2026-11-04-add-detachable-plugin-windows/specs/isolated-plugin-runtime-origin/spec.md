# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Every isolated origin MUST be bound to one actual current Child WebView`
- TO: `### Requirement: Every isolated origin MUST authorize only explicitly bound current Child WebView instances`

## MODIFIED Requirements

### Requirement: Every current resource generation MUST receive a distinct browser origin

The system MUST use an operating-system CSPRNG to generate at least 128 bits of
process-local, unguessable scope for every current `(entry_id,
resource_generation)` and MUST give its Runtime document a browser origin that
differs from the Host, every other plugin scope, and every old generation.

#### Scenario: Resolve the same current generation twice

- **WHEN** Host 两次解析同一 entry，且 Registration、resource generation 与仍被有效租约或有界创建预留持有的 scope 均未变
- **THEN** both results use the same opaque `entry_url`, scope, and browser
  origin
- **THEN** an unrelated plugin revision change does not revoke that current
  origin

#### Scenario: Resolve two different plugin identities

- **WHEN** two eligible plugins each resolve their current entry
- **THEN** they receive different browser origins even if their version, entry
  filename, or author content is identical
- **THEN** neither plugin can obtain the other's origin authority by guessing a
  plugin ID or path

#### Scenario: Replace the current resource generation

- **WHEN** disable and re-enable, replacement, reinstall, uninstall recovery, or
  process restart creates a new resource generation
- **THEN** the old scope, origin, and URL become invalid and the new generation
  receives a different origin
- **THEN** the old URL cannot return the new payload or become the current
  authority for the new Runtime

#### Scenario: Reuse or expose a generation scope

- **WHEN** a generation scope is allocated, resolved, validated, reused, or used at a boundary
- **THEN** 同一 generation 的有效 scope 存续期间，重复解析和多个实例 MUST 复用同一 scope 与 origin；仅窗口分离或关闭部分实例 MUST NOT 改变该 origin。
- **THEN** The scope MUST NOT be persisted, returned separately, written to an event or log, or added to a public contract.
- **THEN** The origin authority and URL path MUST contain the same scope and MUST be cross-validated exactly.

#### Scenario: Reopen after the final instance lease ends

- **WHEN** generation 的最后一个有效来源租约与创建预留释放，随后用户再次打开该插件
- **THEN** 旧 scope 与 origin MUST 永久退休，后续创建 MUST 使用新的不可预测 scope 与 origin
- **THEN** 同一插件、版本或 generation 的相等值 MUST NOT 让退休 URL、浏览器数据容器或旧来源重新获得授权

### Requirement: Every isolated origin MUST authorize only explicitly bound current Child WebView instances
Host MUST 为每个运行实例派生独立的 Runtime attempt、实际原生来源与浏览器 data-store 身份，并将其有效租约绑定到对应 generation 的共享 origin。资源与导航 MUST 同时校验原生来源、attempt 和租约；origin 本身不能授权 Host、远程文档、旧实例或未绑定实例。公共插件接口 MUST NOT 暴露 origin token、data-store 或实例标识。

#### Scenario: Current Child WebView loads its module graph
- **WHEN** the actual current Child WebView requests the exact entry and same-generation package resources
- **THEN** the isolated origin supports the representative module and Worker graph without CORS relaxation
- **THEN** Host DOM, Tauri authority and another generation remain unreachable

#### Scenario: An old WebView reuses a current origin URL
- **WHEN** a destroyed or replaced WebView requests a syntactically current resource URL
- **THEN** source binding rejects the request without revealing whether the scope exists

#### Scenario: Instances of the same plugin share a generation but not browser state

- **WHEN** 相同 plugin/Page/generation 的 A 与 B 同时运行，并各自写入相同名称的浏览器存储键或建立页面内状态
- **THEN** 两个实例 MUST 使用不同 data-store 身份及独立 document、Session、Worker 和业务内存，不能因相同 origin 字符串而合并运行实例
- **THEN** Host 的 `storage.*` 仍按插件身份共享持久化命名空间；浏览器存储隔离 MUST NOT 被解释为修改该公共存储契约或提供自动跨窗口同步

#### Scenario: A closed source reuses an origin that remains valid for a sibling

- **WHEN** A 已终止，B 仍运行且持有同一 generation 的共享 origin，而 A 或另一未绑定来源请求有效 URL
- **THEN** 来源与租约校验 MUST 拒绝该请求，不能以 B 的存续替 A 续权
- **THEN** B 的合法模块、资源和 Worker 请求 MUST 继续按自身来源成功

#### Scenario: Detachment changes window ownership while preserving browser identity

- **WHEN** Host 将当前实例迁移到新的独立窗口而未改变其 WebView、attempt 与 generation
- **THEN** 原 origin、来源租约和 data-store 身份 MUST 保持连续；浏览器存储、document 与 Session MUST 不因分离重建
- **THEN** Host MUST 仅更新可信窗口归属，插件不得选择新窗口或将该授权复制给第二个来源
