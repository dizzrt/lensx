## MODIFIED Requirements

### Requirement: Every release candidate must pass platform and plugin automation gates

每个 selected official plugin candidate MUST 在 build authority 内依次通过 Contract `0.2.0`、SDK、package format、open isolated Runtime、Host/跨插件 isolation、plugin unit/integration/E2E、typecheck、build 与 official boundary gates。candidate MUST 作为 canonical `.lxp` 通过 public CLI inspect、ordinary local-install preparation 与 Runtime execution；release pipeline MUST 不再依赖已删除的 permission prompt/management gate，也 MUST 不因为官方来源增加 Host authority。

#### Scenario: Official candidate uses Worker or network
- **WHEN** candidate 的 E2E 使用支持的 Dedicated Worker、remote resource 或 network
- **THEN** open Runtime 成功路径与 Host/跨插件负面路径都通过
- **THEN** release job 不创建 grant、permission exception 或 official-only CSP

#### Scenario: Candidate or platform gate fails
- **WHEN** Contract、package、Runtime、isolation、plugin test、type/build 或 candidate agreement 任一失败
- **THEN** candidate 不进入 write-authorized publish job
- **THEN** 修复后必须重跑 failed gate 与完整 candidate gate，不复用旧 artifact

### Requirement: The release audit record must be verifiable and must never create Host trust or permission

每个 `.lxp` MUST 继续生成 schema version `1` 的 locale-neutral、field-restricted、deterministic external audit record，记录 identity/version、artifact fact、repository、commit/ref、workflow run 与 release tag。record MUST 位于 `.lxp` 与 author Manifest 之外，并 MUST 不声明 signature、trusted publisher、Host source、permission、grant 或 authorization。ordinary Host installer/Runtime MUST 忽略该 sidecar；official release source MUST 不改变 open Web、Host isolation、Session 或 native Host API 结论。

#### Scenario: Audit record matches candidate
- **WHEN** sidecar facts 与 candidate bytes 和 CI context 完全一致
- **THEN** checker 接受 operational audit relationship
- **THEN** 接受不等于 signature、Host trust、permission 或 Runtime capability

#### Scenario: User installs official release asset
- **WHEN** 用户通过普通 local-install entry 选择 release `.lxp`
- **THEN** Host 仍注入 normal external installation source 并使用 installation-as-trust flow
- **THEN** release URL、sidecar、repository ownership 或 Publisher 不放宽 Host/跨插件 isolation

### Requirement: The official release process must have bilingual maintenance documentation and automated drift validation

canonical English 与 path-matched Chinese release 文档 MUST 保持 Changesets、PR/version/candidate/release、CODEOWNERS、least privilege、audit、open Runtime 和 Host isolation 边界一致。文档 MUST 不描述已删除的 permission gate/grant，也 MUST 不把 official source 解释为 Host trust。真实 scripts、workflows、Contract versions、JSON/tag/assets 与 capability status MUST 由自动化 drift gate 覆盖。

#### Scenario: Permission model or Runtime docs drift
- **WHEN** workflow、script、Contract、Runtime、audit 或文档仍依赖旧 permission gate，或声称 official source 获得额外 authority
- **THEN** release documentation gate 失败并给出 stable repository-relative reason
- **THEN** pipeline completion 状态不能掩盖当前 platform drift

