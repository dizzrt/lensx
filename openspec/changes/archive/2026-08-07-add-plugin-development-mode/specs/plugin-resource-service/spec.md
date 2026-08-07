## MODIFIED Requirements

### Requirement: Scope issuance MUST derive from a current and provably safe registration

Host MUST 在一次 atomic Plugin Manager read projection 中验证 expected revision，并解析 healthy registration、process-local resource generation、enabled intent、两维 compatibility、normalized Manifest 和严格 payload variant。对于 installed payload，Host MUST 证明 installation path 是 installer 在 `packages/<plugin-key>/<package-sha256>` 下唯一当前 active payload，且 package digest 完全匹配。对于 development payload，Host MUST 证明 snapshot root 是 Development coordinator 在当前 process cache/session 下原子发布的唯一当前 generation、snapshot identity 完全匹配，且 Resource service 从不回退读取作者 source directory。

只有 Manager 非 degraded、registration healthy/enabled/compatible 且对应 payload ownership 可证明时，Host 才能签发 URL。Host source、publisher 文本、requested permissions 和 Runtime `inactive` 本身 MUST NOT grant 或 deny resource access；无法证明 managed payload ownership 时 Host MUST fail closed。

#### Scenario: A current managed registration can receive a scope

- **WHEN** record/entry identity、plugin identity、payload variant identity 和 canonical installer-owned package 或 current Host-owned development snapshot 完全匹配，且 registration healthy、enabled、lensX-compatible 与 Host API-compatible
- **THEN** Host 为当前 resource generation 签发或复用 scoped entry URL
- **THEN** URL 的 plugin key、version 和 entry 全部来自同一次 atomic read projection

#### Scenario: The caller uses a stale revision

- **WHEN** request expected revision 与当前 Registration revision 不同
- **THEN** query 以 stable `stale_revision` 失败，且既不返回旧 URL 也不返回新 URL
- **THEN** caller 必须从完整当前 Registration snapshot 重新开始

#### Scenario: The registration is not currently executable

- **WHEN** entry missing、quarantined、disabled、任一 compatibility dimension incompatible，或 Manager recovery degraded
- **THEN** query 以 stable `not_found` 或 `unavailable` 结果失败
- **THEN** 系统不会仅因为 package/snapshot directory 仍存在就签发 resource capability

#### Scenario: The registration points to a payload whose safety cannot be proven

- **WHEN** installed path 不在 canonical installer packages root、plugin key/digest 不匹配，或 development snapshot 不属于当前 process/session/generation；或者任一 root/entry missing、为 link 或 tree unsafe
- **THEN** query 以 stable `unsafe_state` 失败且不返回 path evidence
- **THEN** builtin、external、development source designation 或 Publisher declaration 均不能覆盖失败

#### Scenario: Development source directory changes after snapshot publication

- **WHEN** 作者在成功 register/reload 后修改、删除或替换原始 `dist/` 目录
- **THEN** 当前 scope 继续只绑定已验证且不可变的 Host-owned snapshot，不读取变化后的 source bytes
- **THEN** 只有后续成功的显式 reload 才能发布新 generation；失败的 reload 保留当前 scope

## ADDED Requirements

### Requirement: Development snapshot retirement MUST revoke resource authority before cleanup

成功 development reload、remove、disable 或 Development Mode shutdown MUST 先通过 Manager currentness/revision/resource-generation transition 撤销旧 scope，然后才 MAY 清理旧 snapshot。cleanup 成功、失败或延迟 MUST NOT 让旧 snapshot 重新变成 current。Resource cache MUST 以 entry identity、payload variant 和 generation 区分 installed 与 development bytes，并 MUST NOT 因相同 plugin ID/version 或相同 snapshot identity 复用已撤销 scope。

#### Scenario: Successful manual reload retires the old snapshot

- **WHEN** development reload 原子提交新 generation
- **THEN** 旧 scope/origin 立即停止返回旧或新 bytes，新 generation 获得不同 scope/origin
- **THEN** 旧 snapshot 的延迟删除不会延长其 browser 或 Runtime authority

#### Scenario: Identical bytes are manually reloaded

- **WHEN** development reload 发布与当前 snapshot identity 相同的 bytes，但 resource generation 已强制推进
- **THEN** 旧 scope/origin 仍被永久撤销，新 generation 使用新的 scope/origin
- **THEN** digest equality 不能绕过显式 reload 的 terminal lifecycle
