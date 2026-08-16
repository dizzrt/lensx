## MODIFIED Requirements

### Requirement: Each official plugin must be an independent, constrained release unit

系统 MUST 把 `plugins/` 下每个 direct workspace member 视为独立 release unit。每个 unit MUST 具有唯一 package name、`private: true`、独立 SemVer、根 source Manifest、`CHANGELOG.md`、真实自动化测试、`build`/`typecheck`/`test`/`check`/`test:e2e` scripts，以及覆盖整个 `/plugins/<slug>/` 的显式 CODEOWNERS entry。source Manifest、built Manifest、package metadata 和 inspected `.lxp` MUST 具有一致 plugin identity/version。官方插件 MUST 遵守与 external plugins 相同的 public dependency/import boundaries，并 MUST NOT 因位于产品 `plugins/` 目录而导入 Host/Tauri private source 或另一个插件源码。

#### Scenario: A valid official plugin enters release validation

- **WHEN** `plugins/<slug>` 直接子目录满足 package、Manifest、SemVer、CHANGELOG、test、script、CODEOWNERS 和 public dependency constraints
- **THEN** 系统把它识别为独立 candidate，并从 validated Manifest identity/version 派生 release identity
- **THEN** 其他官方插件和 lensX desktop application version 不属于该 candidate 的 version

#### Scenario: The official directory cannot bypass external plugin boundaries

- **WHEN** 官方插件依赖 Host root package、Tauri API、Host-private module、workspace-only deep import 或另一个插件源码
- **THEN** release contract gate MUST 用稳定 diagnostic 拒绝 candidate
- **THEN** 系统 MUST NOT 为 `plugins/*` 增加 import exception 或从 Host 直接导入插件

#### Scenario: Version or ownership metadata drifts

- **WHEN** package、source/built Manifest、inspected `.lxp` identity/version 不一致，或 CHANGELOG、真实 test、required script、`/plugins/<slug>/` CODEOWNERS entry 缺失
- **THEN** candidate MUST 在创建 tag/public release 前失败
- **THEN** diagnostic MUST 标识 plugin-relative path 和 drift category，并 MUST NOT 泄露 absolute path 或 secret

### Requirement: Path impact and Changesets must control validation scope and release intent separately

系统 MUST 从显式 base/head commits 计算 sorted、deduplicated、schema-validated official-plugin validation set。`plugins/<slug>/**` change MUST 选择该插件。public Contract、SDK、UI、Testkit、CLI、workspace、lockfile、package format、installation、permission、Runtime 或 release infrastructure 的 shared trigger change MUST 选择所有现有官方插件。无关路径 MUST 产生显式 no-op。release-relevant official-plugin change MUST 具有指向该插件的 valid Changeset，而 shared-path change MUST NOT 创建自动 version/release intent。

#### Scenario: A single-plugin change selects one release unit

- **WHEN** diff 只改变一个 `plugins/<slug>` official plugin 的 release-relevant path，并包含该 package 的 valid Changeset
- **THEN** PR gate MUST 只把该插件加入 plugin-local validation 和 version plan
- **THEN** 其他官方插件和 desktop application MUST NOT 被 versioned 或加入 release plan

#### Scenario: A shared-boundary change expands validation but not release intent

- **WHEN** diff 改变 public SDK、CLI、package format、permissions、Runtime 或 release infrastructure，但没有改变 official-plugin Changeset
- **THEN** 系统 MUST 验证所有现有官方插件和 release fixtures
- **THEN** 系统 MUST NOT 为任何插件创建 implicit bump、tag 或 release

#### Scenario: A plugin change has a missing or mismatched Changeset

- **WHEN** release-relevant official-plugin change 缺少 Changeset、指向错误插件、使用 invalid bump 或引用 unknown official plugin
- **THEN** PR gate MUST 用 deterministic diagnostic fail closed
- **THEN** version/publish workflows MUST NOT 推断 SemVer 或继续发布

#### Scenario: The repository has no product official plugins

- **WHEN** `plugins/` 没有任何真实 direct member，且没有 candidate Changeset
- **THEN** member selection MUST 返回稳定成功 no-op
- **THEN** release-infrastructure changes MUST 仍验证 committed fixtures 和 dry-run，但 MUST NOT 创建 product release

### Requirement: The release pipeline MUST exercise ConfigLens as its first real product member

当 `plugins/config-lens` 存在时，系统 MUST 将其发现为真实独立 release unit，并 MUST 把它纳入 path selection、Changeset planning、package lifecycle、canonical repeated packing、TypeScript/Rust inspection、ordinary installation preparation、isolated Runtime 和 plugin E2E validation。真实 member path MUST 补充而非替代 zero-member 和 temporary two-member fixture coverage。candidate/release processing MUST 使用相同 external-plugin protocol，并 MUST NOT 从 ConfigLens identity、repository path 或 audit sidecar 推断 Host trust、permission、signing 或 native authority。

#### Scenario: ConfigLens-only change selects the real member

- **WHEN** release-relevant diff 只改变 `plugins/config-lens/**`，并包含 `@lensx/official-config-lens` 的 valid Changeset
- **THEN** PR plan 选择 ConfigLens 进行 member-local validation/version intent，且不 version desktop application 或无关插件
- **THEN** candidate 在任何 write-authorized release job 可达前运行包括 `test:e2e` 在内的所有 declared lifecycle

#### Scenario: Shared plugin boundary changes after ConfigLens exists

- **WHEN** public Contract、SDK、UI、Testkit、CLI、package、installation、Runtime、workspace 或 official release infrastructure path 改变，且没有 ConfigLens Changeset
- **THEN** ConfigLens 作为当前真实 consumer 被选中验证，但不获得 implicit version bump/release intent
- **THEN** zero-member/two-member fixtures 继续证明 no-op 和独立 multi-member behavior

#### Scenario: Real candidate reaches ordinary installation and Runtime

- **WHEN** 两次 ConfigLens pack byte-identical，且两个 inspectors 对 identity、version、files 和 digest 结论一致
- **THEN** 同一 immutable `.lxp` 通过 ordinary local-install preparation、Action/Page projection、isolated Child WebView open、SDK ready、plugin E2E 和 deterministic close
- **THEN** installer/Runtime 都不把 repository location、Changeset metadata 或 release sidecar 当作 authority

#### Scenario: Real member or candidate drifts

- **WHEN** ConfigLens metadata、ownership、dependency boundary、Worker resource closure、lifecycle、candidate bytes、inspector facts、install result 或 Runtime E2E drift/fail
- **THEN** release gate 在创建 tag/public release 前失败，且不回退为 fixture-only success
- **THEN** 修复后必须生成 fresh candidate 并重跑 complete real-member gate

### Requirement: Task 7.1 completion must depend on repeatable independent-release evidence

系统 MUST 使用 committed valid/invalid fixtures 和 temporary two-plugin dry-run 证明 single-plugin path selection、independent version bumps、canonical packing、ordinary installation preparation、Runtime E2E、audit records、idempotency 和 failure recovery。Fixtures MUST NOT 位于产品 `plugins/*`、被 Host 注册或产生 public release。只有 focused gate、frontend tests、formatting、static analysis、type checking/build、Rust formatting/tests/checks 和 strict OpenSpec validation 全部成功，Task 7.1 才可保持 complete。

#### Scenario: The dry-run releases only one simulated plugin

- **WHEN** two-plugin fixture 中只有一个 plugin path 和 Changeset 改变
- **THEN** dry-run MUST 只为该插件生成 bump、CHANGELOG、`.lxp`、checksum、audit record 和 release plan
- **THEN** 另一个插件与 root application versions、CHANGELOGs 和 release plan MUST 保持不变，且不得调用 public release API

#### Scenario: Final validation fails or an assumption remains unverified

- **WHEN** focused gate、complete frontend/Rust validation、strict OpenSpec validation 或 required fixture scenario 失败
- **THEN** Task 7.1 MUST 保持 incomplete，Roadmap MUST NOT 声称 official release pipeline 已交付
- **THEN** 修复后必须重跑 failed command 和 complete final validation set
