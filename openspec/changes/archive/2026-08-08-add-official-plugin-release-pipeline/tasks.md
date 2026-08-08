## 1. 官方插件 Release Contract 基础

- [x] 1.1 引入并固定 Changesets 开发依赖与 `.changeset/config.json`，允许 private official packages 独立 version 但禁止 npm publish；审查版本、许可证、Node 24/pnpm 11 兼容性与供应链影响，并保持根命令使用机器全局 pnpm store、不得传 `--store-dir`。
- [x] 1.2 实现 typed 官方插件发现与 metadata validator，只接受 `plugins/official/*` 直接 workspace member，校验唯一 slug/package/plugin ID、`private: true`、SemVer、Node/pnpm、根/构建 Manifest 版本、CHANGELOG、真实测试和 `build`/`typecheck`/`test`/`check`/`test:e2e` scripts。
- [x] 1.3 扩展 workspace boundary checker，证明官方插件继续只依赖允许的公共 Contract/SDK/UI/Testkit/CLI 与普通前端依赖，禁止 Host root、Tauri、Host-private、workspace deep import、跨插件源码 import，且 Host 不直接 import `plugins/official/*` 源码。
- [x] 1.4 新增 `.github/CODEOWNERS` 基线和 validator，要求每个实际官方插件有覆盖其完整目录的显式非空 owner；加入缺失、通配误覆盖、重复/冲突与未知插件条目的稳定诊断。
- [x] 1.5 建立合法/非法 official release contract fixtures 与 Rstest 覆盖，验证空成员、合法单/双成员、identity/version 漂移、缺 metadata/script/test/changelog/owner、非法依赖和安全诊断不泄漏绝对路径/secret。

## 2. 路径选择与 Changeset 版本编排

- [x] 2.1 实现从显式 base/head commit 读取 changed paths 的确定性 planner，输出 schema versioned、排序、去重的 JSON matrix；分别建模插件本地、共享 Contract/SDK/UI/Testkit/CLI/workspace/lockfile/package/安装/权限/Runtime/release-infra 触发路径和无关路径 no-op。
- [x] 2.2 实现 Changeset policy validator，要求每个 release-relevant 官方插件变化都有目标匹配的有效 patch/minor/major entry，拒绝缺失、未知、重复冲突、空 changeset 和隐式 SemVer 猜测；共享路径只扩大验证集合且不创建 release 意图。
- [x] 2.3 实现受控 `version:official-plugins` 命令：调用 Changesets 生成 package version/CHANGELOG 后，仅同步同目录源 Manifest version，重新校验 package/source/dist identity，并在任何失败时阻止部分 version plan 被使用。
- [x] 2.4 添加 planner/versioning 单元与 fixture 测试，证明单插件变化不触及另一插件/根应用、多个 changeset 仍形成独立 release 单元、共享变化验证全部但不升版、零插件稳定 no-op、修复后重跑产生同一计划。

## 3. Candidate 产物、Audit Record 与 E2E Gate

- [x] 3.1 实现候选构建入口，按插件依次运行 package lifecycle 和 public `lensx-plugin build`/`validate`/`pack`/`inspect`，重复 pack 并比较 byte/digest，禁止 workflow 自建 archive、重新解释 package protocol 或从 Host 源码复制内容。
- [x] 3.2 定义 schema version `1` 的 typed candidate manifest 与 canonical `*.release.json`/`*.lxp.sha256` 编码和 validator，覆盖 plugin/version、artifact name/size/SHA-256、repository、source commit/ref、workflow run 和 release tag，并拒绝未知字段、secret、signature、official/trust、permission/grant/authorization 声明。
- [x] 3.3 将同一不可变候选 `.lxp` 依次交给 TypeScript/Rust inspector 和普通 local-install preparation，比较 identity/version/package facts/digest；增加 bytes 在 handoff 后变化、inspector 分歧、incompatible/invalid 和 stale metadata 的失败测试。
- [x] 3.4 建立官方插件通用 Runtime E2E harness，自动覆盖 install preparation、资源解析、sandbox iframe、Runtime Session/SDK ready、Page/Action open 与 close/teardown，并运行每个插件的 `test:e2e`；权限路径复用现有 prompts/grants/revocation gate且不得自动 grant。
- [x] 3.5 建立临时双插件 release dry-run，证明只为一个模拟插件生成 bump、CHANGELOG、`.lxp`、checksum、audit record 和 release plan，另一插件与桌面应用保持不变；fixture 不进入 `plugins/official/*`、Host Registry 或 public release。
- [x] 3.6 新增根 `check:official-plugin-release-pipeline` focused gate，组合 contract/CODEOWNERS、planner/Changesets、candidate/audit、dry-run、workspace boundary、public CLI/package format、TypeScript/Rust install preparation、Runtime/permission 和文档检查，并对缺少任一阶段的 composition drift 失败。

## 4. 最小权限 CI、版本 PR 与独立 GitHub Release

- [x] 4.1 新增官方插件 PR workflow，以路径过滤启动 planner 和 focused gates；job 仅有 `contents: read`、不接收 environment secret、持久 Git credential 或 release token，并对 fork/非受保护 ref 证明 write job 不可达。
- [x] 4.2 新增 Changesets version-PR workflow，在 job 级最小写权限下只执行受控 metadata/version 操作，不执行插件 lifecycle 或依赖 lifecycle scripts；验证无 changeset no-op、版本 PR 更新、同步失败恢复和并发去重。
- [x] 4.3 新增 main candidate workflow：低权限 build jobs 运行全局平台 gate 与每插件 matrix，将精确 `.lxp`、checksum、audit/candidate manifest 作为 digest 固定的 handoff artifact；所有第三方 actions 固定完整不可变 revision。
- [x] 4.4 实现写权限 publish 入口，只下载/复验候选 artifact，不安装依赖或执行插件代码；使用 `official/<plugin-id>/v<version>` 创建 draft release、上传/回读完整三件资产后公开，且不得触发桌面应用 release 或 npm publish。
- [x] 4.5 添加 mock GitHub API/release planner 测试，覆盖首次发布、相同 digest 幂等重试、tag commit 冲突、asset/record digest 冲突、上传/回读失败、draft 清理/保留、多插件独立失败域，以及禁止覆盖 public asset、移动 tag、删除历史或回退 SemVer。
- [x] 4.6 实现 workflow policy drift checker，静态验证事件边界、paths、job permissions、protected environment/concurrency、build/publish 权限隔离、action SHA pin、artifact digest handoff 和 write job 禁止执行插件/安装脚本。

## 5. 双语文档、状态与路线图收敛

- [x] 5.1 新增 English canonical `docs/en/development/official-plugin-release.md` 及同路径 `docs/zh` 简体中文镜像，完整说明目录契约、Changeset、PR gate、版本 PR、candidate/E2E、asset/tag、CODEOWNERS、失败/重试和最小权限操作。
- [x] 5.2 更新 English/Chinese indexes、plugin workspace、validation 和相关 developer capability status，使已交付 release pipeline、仍未发布的 npm packages、尚无 Task 7.2 产品插件以及未交付 signing/Marketplace/automatic update/Host official trust 状态一致。
- [x] 5.3 扩展文档/release drift gate，校验双语同路径/标题/相对链接、真实 scripts/workflows/Changesets 配置、JSON/tag/asset schema 和 locale-neutral identifiers；所有 runnable 命令必须自动检查且不得依赖人工 GitHub UI replay。
- [x] 5.4 检查 README、`AGENTS.md`、`openspec/config.yaml`、Manifest/package protocol、Host registration/permission/runtime 代码和 public package exports，证明本 change 没有把具体发布设计放入 onboarding/rules、没有新增 Runtime API/dependency、没有 Host `official` authority 或自动 permission grant。
- [x] 5.5 在 focused 与完整最终验证全部通过前保持 `plugin-roadmap.md` Task 7.1 未完成；全部证据成功后再将该 Task 链接到本 change、标记完成，并保持 Task 7.2、7.3、8.1 及其他未验证任务状态不变。

## 6. Final Validation

- [x] 6.1 顺序运行 focused gates：`pnpm run check:official-plugin-release-pipeline`、`pnpm run check:plugin-developer-cli`、`pnpm run check:plugin-package-format`、`pnpm run check:plugin-contract`、`pnpm run check:plugin-sdk-transport`、`pnpm run check:plugin-permission-prompts`、`pnpm run check:plugin-runtime-security-lifecycle`、`pnpm run check:local-plugin-installation` 和 `pnpm run test:workspace-boundaries`；修复全部 warning/error 后重跑失败项。
- [x] 6.2 顺序运行完整 frontend/shared tests 与 formatting/static checks：`pnpm run test`、`pnpm run format`、检查格式化 diff、`pnpm run check`；修复全部 warning/error 后重跑受影响检查。
- [x] 6.3 顺序运行完整 frontend/shared type/build validation：`pnpm run typecheck`、`pnpm run build`；确认 release tooling/fixture 不进入生产 frontend bundle，修复全部 warning/error 后重跑失败项。
- [x] 6.4 因候选产物必须通过 Rust inspector、installer preparation 和 Runtime evidence，顺序运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`；修复全部 warning/error 后重跑失败项。
- [x] 6.5 运行 `openspec validate add-official-plugin-release-pipeline --type change`、双语结构检查和 `git diff --check`，核对 proposal/design/spec/tasks 一致、active delta spec 在同步/归档前改写为 English，并确认所有完成 checkbox 都有自动化证据。
- [x] 6.6 修复所有引入或暴露的 warning/error，顺序重跑 6.1–6.5 的完整最终集合；仅在最终重跑全部成功后执行 5.5 的 Roadmap 更新并勾选本 tasks 的验证项，归档仍遵循先同步 English stable specs 再 archive 的独立流程。
