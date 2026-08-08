## Context

Task 7.1 位于首个官方插件之前。当前仓库已经把 `plugins/official/*` 纳入 pnpm workspace 和公共依赖边界，也已经交付 public Contract/SDK/Testkit/UI/CLI、canonical `.lxp`、Host Rust inspection/安装准备、权限管理、Runtime Session 与外部教程 gate。当前缺口是发布编排：仓库仅有面向 `src-tauri/**` 的只读检查 workflow，没有 `.changeset/`、官方插件 CODEOWNERS、官方插件 release workflow 或 release 资产审计记录，`plugins/official/` 也尚无产品插件。

这意味着本 change 必须先交付一条对“零个或多个官方插件”均成立的流水线，并用确定性 fixture/dry-run 证明单插件选择和产物链路；它不能为了测试流水线而抢先交付 Task 7.2 的首个产品插件。后续实际插件进入 `plugins/official/<slug>` 后，必须无需修改流水线即可成为独立 release 单元。

安全边界保持不变：官方插件仍是普通插件内容，Release 页面或仓库归属不是 Host 权威事实。当前安装器继续注入 `source=external` 和空 grants；可信签名、verified publisher、Host `official` 来源以及撤回属于 Milestone 8。

## Goals / Non-Goals

**Goals:**

- 为每个 `plugins/official/<slug>` 建立独立的版本、CHANGELOG、所有权、验证和 `.lxp` release 单元。
- 使用路径影响分析缩小插件本地 gate，使用 Changesets 表达明确的版本意图，并让共享边界变化扩大验证而不自动扩大发布。
- 在发布前复用现有 Contract、SDK、包格式、权限、Runtime 与 Host 安装能力，并增加候选插件的通用安装/运行 E2E 和插件自有 E2E。
- 将构建插件代码的低权限 job 与具有 `contents: write` 的发布 job 隔离；公开 release 必须完整、可重试且不可静默覆盖。
- 生成不可授信、机器可验证的 release 审计记录，关联插件、版本、完整 `.lxp` digest、源 commit/ref 和 workflow run。

**Non-Goals:**

- 不实现任何具体官方插件业务，不把 fixture 发布为产品，也不改变 Task 7.2/7.3 的顺序。
- 不向 npm 发布公共 package 或官方插件 package；插件的交付物是 `.lxp`。
- 不实现 Marketplace、自动更新、桌面应用 release、跨插件聚合版本或常驻发布服务。
- 不实现 artifact attestation、插件签名、公钥身份、Host 信任来源、密钥轮换/撤回，且不修改权限授予逻辑。
- 不改变 Manifest、package protocol、Registration、Runtime Session、Host API 或安装器既有数据模型。

## Decisions

### 1. 每个直接子目录是一个独立、不可 npm 发布的官方插件 release 单元

`plugins/official/<slug>` 必须是 pnpm workspace 的直接成员，并具有：

- 唯一 package name、`private: true`、独立 SemVer 和固定 Node/pnpm 约束；
- 根 `manifest.json`，其 `version` 与 package version 完全一致，构建后的 `dist/manifest.json` 仍保持一致；
- `CHANGELOG.md`、`build`、`typecheck`、`test`、`check`、`test:e2e` 和至少一个真实测试；
- `.github/CODEOWNERS` 中覆盖该目录的显式条目；
- 仅依赖已允许的公共插件 package 和普通前端依赖，不获得 Host-private、Tauri 或跨插件源码 import 例外。

发布工具按目录 slug 发现成员，但以经过 Contract 验证的 `plugin_id` 和 SemVer 生成内容身份。目录名、package name、plugin id 和版本映射由一个仓库 checker 严格验证，避免在 workflow YAML 中维护第二份插件清单。

选择这一约定而不是一个聚合 `official-plugins` package，是为了让版本、依赖、变更记录和失败域保持独立。选择 `private: true` 是为了阻止误发 npm；Changesets 仅负责版本与 CHANGELOG，`.lxp` 才是发布资产。

### 2. 路径影响决定验证集合，Changeset 决定版本与发布意图

PR 规划器读取 base/head commit 并输出经过 schema 校验、排序且去重的 JSON matrix：

- `plugins/official/<slug>/**` 的变化选择该插件；
- workspace/lockfile、公共 Contract/SDK/UI/Testkit/CLI、package format、安装、权限、Runtime、发布脚本或 workflow 等共享触发路径选择全部实际官方插件；
- 仅无关路径变化产生显式 no-op，不启动插件 build/release；
- 发布基础设施变化即使在零插件仓库中也必须运行 committed fixture/dry-run gate。

对官方插件的 release-relevant 变化必须存在以该插件为目标的 Changeset。一个 PR 可以为多个插件提供独立 changeset，但每个插件仍获得自己的 bump、tag、release 和资产。共享触发路径只扩大验证集合，不隐式为插件升版。版本 PR 通过受控脚本执行 `changeset version`，随后只把 Changesets 产生的 package version 同步到同目录源 `manifest.json` 并验证 CHANGELOG；发布 workflow 只消费已经提交且一致的版本，不在发布时改写源码。

相比“任何 main push 都重发全部插件”，该模型避免无意义版本；相比只看 changeset，它又能在共享 SDK/Runtime 边界变化时回归所有消费者。相比手工 tag，Changeset 提供可审查的 SemVer 意图和 CHANGELOG。

### 3. 全局平台 gate 与候选插件 gate 分层，最终产物只由公共 CLI 产生

Release candidate 流程分为两层：

1. 全局平台 gate 运行现有 Contract、SDK transport、package format、permission prompts、Runtime security/session 以及发布基础设施检查。
2. 每个候选插件运行 package-local lifecycle、`lensx-plugin build/validate/pack/inspect`、重复 pack digest 一致性、TypeScript 与 Rust inspection、普通 local-install preparation、通用 Runtime open/session/close smoke，以及插件自己的 `test:e2e`。

最终 `.lxp` 必须由发布版本对应的 public CLI `pack` 生成，并用同一不可变文件计算 digest；workflow 不自建 TAR/Zstandard 格式，也不从 Host 源码复制插件内容。通用 E2E 只验证所有插件共有的安装、资源、iframe、Session 与关闭路径；插件特有行为由 `test:e2e` 负责，权限型插件仍必须在其后续 change 中增加授权/拒绝/撤销覆盖。

候选资产进入临时 artifact staging 后即按 digest 固定。后续 job 只能读取和验证这些 bytes，不能重新 build。这样可以证明被测试的 bytes 就是被发布的 bytes。

### 4. Changesets 管理版本 PR，GitHub Release 管理 `.lxp` 分发

引入 Changesets 作为 root 开发依赖，并配置 private official packages 可版本化但不可 npm publish。主分支 workflow 在存在 changeset 时创建/更新一个版本 PR；版本 PR 合并后，发布计划识别没有对应 release tag 的官方插件版本，并为每个插件建立独立 matrix 项。

每个插件使用稳定 tag `official/<plugin-id>/v<version>` 和一个 draft GitHub Release。资产至少包含：

- `<plugin-id>-<version>.lxp`；
- `<plugin-id>-<version>.lxp.sha256`；
- `<plugin-id>-<version>.release.json`。

发布 job 先创建 draft、上传并回读验证完整资产集合与 digest，再转为 public。失败保持或清理 draft，不允许暴露缺少资产的 public release。若目标 tag/release 已存在：完全相同的 digest/记录视为幂等成功；任何不一致均 fail closed，禁止覆盖 published asset 或移动既有 tag。

选择 GitHub Release 而不是 npm，是因为 Runtime 消费 `.lxp` 而不是 JavaScript package。选择 draft promotion 而不是逐个直接上传，是为了把单插件公开可见性推迟到资产完整之后。一个 matrix 项失败不会回滚另一个已经完成的独立插件版本，但同一插件版本绝不能部分公开。

### 5. 构建与发布权限隔离，所有第三方 action 固定到不可变 revision

PR 和 candidate build job 仅有 `contents: read`，不接收 release token、环境 secret 或持久化 Git credentials。它们可以执行插件代码，但不能发布。具有 `contents: write` 的版本/发布 job 不执行插件 lifecycle、安装脚本或 `.lxp` 内容；它只运行受审查的版本元数据操作，或下载已固定的 candidate artifact、复验 digest 并调用 GitHub Release API。

Workflow 使用 job 级最小 permissions、受保护的 `main`/environment、并发组和不可变 action commit SHA。来自 fork/PR 的事件永远不进入写权限 job。发布 job 下载 artifact 后按 build job 输出的 manifest 逐文件复验，防止 job 间替换或错配。

相比在单一 write-token job 中 build 并发布，这个隔离避免被插件构建脚本直接读取发布凭据。当前不请求 OIDC 或 artifact attestation，因为它们会把本 change 扩展到 Task 8.1 的可信 provenance。

### 6. Release audit record 是严格 sidecar，不是 Host provenance

`*.release.json` 使用 locale-neutral、schema version `1` 的固定字段与 canonical JSON 编码，至少记录 `plugin_id`、`version`、artifact name/size/SHA-256、repository、source commit/ref、workflow run URL 和 release tag。记录不写入 `.lxp` 或 author Manifest，不包含 secret、权限、grant、publisher 信任或 Host source 结论。

Checker 必须验证 sidecar 与 `.lxp` inspection facts、实际 bytes 和 CI 上下文一致。普通 Host installer忽略 sidecar，继续把用户选择的文件按既有 `external` 安装路径处理，并从空 grants 开始。Task 8.1 可在未来定义签名与 Host provenance，但不得把该未签名记录追认为信任证据。

选择独立 sidecar 而不是扩展 `checksums.json`，是为了保持 package protocol `0.1.0` 和可重复 `.lxp` bytes 不变；选择 workflow run/commit 记录而不是签名，是为了满足运维审计而不虚构密码学身份。

### 7. 零插件状态用 fixture 验证，首个真实发布仍由 Task 7.2 完成

实现阶段加入 committed 合法/非法 release-contract fixture 和临时生成的双插件 dry-run。测试必须证明：只选择/升版/打包其中一个插件时，另一个插件和桌面应用版本、CHANGELOG、tag 与 release plan 均不变化；共享输入变化只扩大验证；空成员集合稳定 no-op；缺 changeset、版本不一致、CODEOWNERS 缺失、gate 失败和 digest 冲突均拒绝发布。

Fixture 不放入 `plugins/official/*`，不生成 public GitHub Release，也不被产品 Host 注册，因此不会抢占“首个官方插件”的语义。Task 7.2 新增真实插件时，只需满足本 change 的目录契约和提交 changeset。

### 8. 文档保持双语，但发布接口保持机器可读且无本地化分支

新增 English canonical 的官方插件发布维护文档及 Simplified Chinese 镜像，说明目录契约、changeset、PR gate、版本 PR、release、重试、权限/信任边界和 Task 8.1 分界，并更新两侧索引。命令、JSON、tag、资产名和诊断 code 不随 locale 改变；人类文档提供双语说明。

本 change 没有产品 UI，因此 Semi Design、主题、键盘与焦点行为不适用；如果后续 workflow 增加可视化报告页面，应另行提出 UI change。

## Risks / Trade-offs

- [全量平台 gate 较慢] → 仅在官方插件或共享触发路径变化时运行，并把全局 gate 与插件 matrix 分层；不能为了速度删减 Task 7.1 明确要求的安全 gate。
- [Changesets package version 与 Manifest version 可能漂移] → 只允许版本脚本同步源 Manifest，并在 PR、version PR 和 release 三个阶段重复验证 source/dist/inspection facts。
- [插件构建代码可能攻击 CI] → build job 无写权限/secret，发布 job 不执行插件代码，job 间使用 digest 固定的 artifact handoff。
- [GitHub Release API 无跨多个插件的全局事务] → 以“单插件版本”为原子单位使用 draft promotion；不同插件 release 本来就是独立生命周期。
- [未签名 sidecar 可能被误解为官方信任] → 使用 `release record`/`audit` 术语，明确非权威，Host 完全忽略；签名与 trusted provenance 延后到 Task 8.1。
- [零真实插件使 CI 路径未被生产成员触发] → committed fixture 覆盖选择与失败矩阵，临时双插件 dry-run 覆盖完整 build/pack/install 流程；Task 7.2 接入时必须复跑相同 gate。
- [共享依赖变化未升版但可能破坏插件] → 共享路径选择全部插件进行验证；是否升版仍需显式 changeset，避免 CI 自行决定 SemVer。

## Migration Plan

1. 先加入 release contract、Changesets 配置、path planner、fixture 和只读检查入口；此阶段对零官方插件稳定 no-op。
2. 加入 version 同步与双语文档，验证 changeset、package/Manifest/CHANGELOG/CODEOWNERS 契约。
3. 加入低权限 candidate build workflow、全局 gate、每插件 dry-run/E2E 与固定 artifact handoff。
4. 最后启用受保护环境中的 draft/publish job；用 fixture/mock API 测失败与幂等，不发布产品 fixture。
5. Task 7.2 新增首个真实插件和 changeset 后，流水线首次生成真实独立 release。

回滚时先禁用 write 权限的 version/publish job，保留只读验证；删除未公开 draft，但不删除或覆盖任何已公开 tag/release。若版本 PR 已合并但发布失败，修复后对同一 commit/version 幂等重试；不得回退 SemVer 或移动 tag。基础设施代码和文档可以普通 revert，现有 `.lxp` 与 Host 行为不受影响。

## Open Questions

无阻塞问题。首个真实插件的具体 `plugin_id`、CODEOWNERS 人员和产品 E2E 场景由 Task 7.2 决定；Task 8.1 决定签名、可信 provenance 与 Host `official` 来源模型。
