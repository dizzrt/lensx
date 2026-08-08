## MODIFIED Requirements

### Requirement: Plugin replacement MUST use a private two-stage Host contract

replacement MUST 使用独立 Host-private contract `0.2.0`，以 prepare/token 与 commit/cancel 两阶段处理当前 healthy identity。payload MUST 严格、versioned、bounded 且不包含 permission diff、grant selection、permission reason 或 post-commit authority。版本 MUST 独立于 Manifest、Host API、installation、Registration、Manager record 与 application version。

#### Scenario: Current replacement contract succeeds
- **WHEN** trusted management service prepares and commits 一个 matching compatible candidate
- **THEN** contract 返回 bounded identity、version classification、token 与 current revision facts
- **THEN** 不计算或应用 permission/grant diff

#### Scenario: Legacy replacement payload appears
- **WHEN** payload 使用 `0.1.0` 或包含 added/removed/retained permission IDs
- **THEN** strict Rust/TypeScript boundary 拒绝整个 payload
- **THEN** 当前 registration、payload、data、revision 与 Runtime 保持不变

### Requirement: Preparation MUST inspect one immutable local package without changing active state

Prepare MUST 通过 Rust-owned pathless picker 读取一个 `.lxp`，复用 capped read、package/Manifest/resource/checksum/digest/compatibility 检查，并验证 candidate ID 与当前 healthy registration 匹配。只有 compatible Manifest `0.2.0` candidate 可进入 staging。Prepare MUST NOT 修改 Manager、active payload、Registry、revision、event 或 plugin data，且 MUST 返回 opaque token、entry/current/candidate versions 与 replacement classification，不返回 permission diff。

#### Scenario: Compatible candidate is prepared
- **WHEN** candidate valid、compatible、identity matches 且 current revision 可验证
- **THEN** Host 在 bounded staging 验证并返回无 permission diff 的 `0.2.0` prepared result
- **THEN** response 不包含 source/staging/install path、digest、bytes 或 raw error

#### Scenario: Candidate is incompatible or legacy
- **WHEN** candidate invalid、Host incompatible、plugin ID mismatch 或使用旧 Manifest permission contract
- **THEN** prepare 返回稳定 invalid/incompatible/identity-mismatch
- **THEN** 当前 record、payload、surfaces、data 与 revision 不变

### Requirement: Replacement MUST preserve and safely narrow Host-owned state

replacement commit MUST preserve only仍适用于相同 identity 的 Host-owned enabled intent、plugin data ownership、Launcher references 与 current safe diagnostics，并 MUST 发布新 payload、Manifest、resource generation 与 revision。它 MUST 不保留、比较、创建或恢复 permission grants；旧 record 中任何 grant facts 都不能进入新 registration。candidate Publisher、official source 或开放 Web 行为 MUST NOT 改变 Host source/trust。

#### Scenario: Upgrade replaces a legacy permission plugin
- **WHEN** 当前旧 registration 被一个 compatible Manifest `0.2.0` package 显式替换
- **THEN** 新 record 不含 grants，旧 Runtime/Session/Port 被终止且新 generation 从 inactive/current facts 开始
- **THEN** plugin data policy 与允许保留的 Host-owned state 按 identity 规则继续

#### Scenario: Commit fails after staging
- **WHEN** persistence、revision、payload move 或 Registration publication 失败
- **THEN** current registration 和 authority 保持最后成功状态并清理仅 owned staging
- **THEN** 不产生部分 permission migration、grant 或新 Runtime

### Requirement: Trusted application MUST quiesce and converge plugin surfaces around commit

trusted application MUST 在 replacement commit 周围序列化管理操作、quiesce 当前 Page/Action/Runtime，并在 commit 后通过完整 Registration snapshot/detail 收敛。确认 UI MUST 展示 candidate identity、version、classification 与安装信任说明，MUST NOT 展示 permission diff、grant selection 或 partial-grant result。交互 MUST 保持双语、主题、键盘、focus 与 bounded feedback。

#### Scenario: User confirms upgrade
- **WHEN** 用户确认 current prepared upgrade
- **THEN** Host 先终止旧 Runtime authority，再提交并等待 current Registration convergence
- **THEN** UI 报告 replacement 结果而不执行 post-commit grant work

#### Scenario: User cancels replacement
- **WHEN** 用户取消 prepared candidate
- **THEN** service 取消 token、恢复 focus 并保持旧插件可用
- **THEN** 不留下 permission selection、grant decision 或新 authority

### Requirement: Preparation tokens MUST be bounded, opaque, and revision-bound
Token/currentness MUST 比较 identity/revision/payload/diagnostics，不再比较或覆盖 grant state。

#### Scenario: revision changes
- **WHEN** lifecycle/replacement 在 prepare 后改变 revision
- **THEN** stale token fail closed 且不覆盖 current Host facts

### Requirement: Commit MUST atomically replace the single active registration
Commit failure MUST 保持 old record/payload/enabled/diagnostics/data，不再声称保存 grants。

#### Scenario: commit fails
- **WHEN** staging/rename/persistence 失败
- **THEN** old current registration remains authoritative 且无 partial authority migration

### Requirement: Task 3.4 MUST not deliver later update, trust, Runtime, permission UI, or rollback capabilities
该 historical capability MUST 不交付 remote update、Runtime、native authority、complete management/authorization UI、signature 或 rollback；legacy permission claims 只作为 untrusted facts。

#### Scenario: replacement scope alone
- **WHEN** local replacement validation 通过
- **THEN** plugin code/native authority 仍不可用且不产生 grant

