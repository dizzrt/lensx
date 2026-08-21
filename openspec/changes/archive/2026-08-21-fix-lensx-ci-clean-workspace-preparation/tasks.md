## 1. 固化 clean-checkout 回归

- [x] 1.1 在 `tests/validation-governance.test.ts` 增加 `ci-lensx-typecheck` 计划断言，验证 `@lensx/plugin-contract` build 严格早于 `@lensx/plugin-cli` build，且两者各出现一次。
- [x] 1.2 增加完整 `ci-lensx-frontend` DAG 的回归断言，验证共享 Contract/CLI preparation 在 typecheck 与 test 阶段间去重，并保持阶段敏感模板 build 的独立环境语义。
- [x] 1.3 保留并核对 `tests/workspace-lifecycle.test.ts` 对传递闭包、稳定拓扑、缺失目标、共享依赖和循环 fail-closed 的覆盖；仅在新 helper 暴露未覆盖边界时补充聚焦断言。

## 2. 修正 LensX frontend Gate 编排

- [x] 2.1 从 `scripts/validation/catalog.ts` 的 `ci-lensx-test` 专用逻辑提取 registry-local workspace build preparation helper，复用 `discoverWorkspaceMembers` 与 `selectWorkspaceBuildOrder`，集中处理目标完整性、环境前缀和 step interning。
- [x] 2.2 将 helper 应用于 `ci-lensx-typecheck` 的 `packages/plugin-cli` 目标，使生成计划按 `plugin-contract → plugin-cli` 执行，再进入 root TypeScript 检查。
- [x] 2.3 用同一 helper 保留 `ci-lensx-test` 对 CLI、framework-neutral 与 react-semi 的完整传递依赖准备；确认完整 frontend plan 对完全相同的 Contract/CLI build step 去重，但不合并具有不同环境语义的模板步骤。
- [x] 2.4 确认 `.github/workflows/lensx-ci.yml`、根 `package.json`、workspace package manifests 与 `scripts/validation/migration-baseline.json` 无需修改，且不存在 workflow-only prebuild、递归 package dependency build、源码 path alias、提交 `dist` 或兼容入口。

## 3. 同步规范与维护文档

- [x] 3.1 审阅 `repository-continuous-integration` delta requirement，确保 clean checkout、Contract-before-CLI、共享步骤去重、本地/GitHub 同入口和失败传播场景与实现及测试一致，并保持所有未来进入 stable specs 的内容为英文。
- [x] 3.2 更新 `docs/en/development/continuous-integration.md` 与 `docs/en/development/validation.md`，说明 LensX frontend Gate 自行按 workspace 拓扑准备公共 package 输出且不信任预生成 `dist`。
- [x] 3.3 同步更新 `docs/zh/development/continuous-integration.md` 与 `docs/zh/development/validation.md`，保持与英文规范、Gate ID、命令和 clean-checkout 边界语义一致。

## 4. 最终验证

- [x] 4.1 运行聚焦 Rstest（validation governance、registry、workspace lifecycle），检查 `pnpm run gate -- ci-lensx-typecheck --plan` 与 `pnpm run gate -- ci-lensx-frontend --plan`，修复所有失败或 warning 后重新运行聚焦验证。
- [x] 4.2 从当前提交与工作区实现导出不含预生成 `dist` 的临时 clean-checkout 等价副本，执行 `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm run gate -- ci-lensx-frontend` 与 `pnpm run gate -- ci-lensx`；不得改用仓库本地 pnpm store，也不得把主工作区残留产物作为通过证据。
- [x] 4.3 运行完整 frontend/workspace 验证：`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`，并确认所有受支持的确定性 package/build 阶段通过且没有浏览器、真实 WebView、GUI、native harness、视觉或环境 evidence 进程。
- [x] 4.4 运行 Rust 完整验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`；虽然 Rust 产品代码不变，但 CI/Gate 编排是仓库级边界，完成声明仍需证明 Rust 路径未回归。
- [x] 4.5 运行中英文文档一致性与 Gate 引用检查、`openspec validate fix-lensx-ci-clean-workspace-preparation --strict`、全部 stable specs strict validation、active source stale alias/Change ID/root script 扫描及 `git diff --check`。
- [x] 4.6 修复 4.1–4.5 发现的每个 error 或 warning，重新运行对应失败命令，然后重新执行 4.1–4.5 的完整最终验证集并记录 clean-checkout Gate plan 与通过结果。

## 验证记录（2026-08-21）

- clean-checkout 等价副本在无 `dist`、`node_modules`、Rust `target` 与仓库本地 pnpm store 的条件下，使用 `pnpm config get storeDir` 返回的机器全局 store 完成 frozen、ignore-scripts 安装；429 个 package 全部从该 store 复用。
- `ci-lensx-typecheck --plan` 与 `ci-lensx-frontend --plan` 均将 `packages/plugin-contract` build 排在 `packages/plugin-cli` build 前；完整 frontend plan 中两者各出现一次，模板 build 保留 `ci-lensx-test` 环境语义。
- clean-checkout 等价副本的 `ci-lensx-frontend` 与 `ci-lensx` 均通过；frontend Rstest 为 526/526，Rust 为 218/218。
- 主工作区完整 test、check、typecheck、build 与 Rust format/test/check/build 均通过；focused Rstest 为 33/33，validation-governance 为 54/54。
- change strict validation 与 `openspec validate --all --strict --no-interactive` 均通过（42/42），active-source stale scans 与 `git diff --check` 无输出。
