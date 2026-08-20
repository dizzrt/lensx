## 1. 固化精简后的验证边界

- [x] 1.1 生成并审阅 active CI、root/package scripts、Gate/Generate/Evidence targets、复合 Gate steps、visual/browser/native producers、fixtures、baselines、evidence records 与文档引用清单；为每项记录“迁入确定性验证”或“删除”，并明确 `openspec/changes/archive/**` 不参与 stale 判定。
- [x] 1.2 在现有 Rstest discovery 范围补充验证策略测试：仅允许 Rstest/Cargo、格式与静态检查、TypeScript/Rust 检查、构建、pack/inspect/tarball、临时纯 CLI consumer 和确定性 Generate；拒绝 visual、screenshot、pixel、browser、WebView、GUI `.app`、Launch Services、native harness、目标环境性能和 Evidence dispatcher。
- [x] 1.3 为受影响复合 Gate 建立步骤迁移断言，确保原有 Rstest、Cargo、build、pack、纯 Node consumer 和 public/private boundary 阶段都有明确去向，同时允许有意删除环境专用阶段且不生成空 Gate 或转发壳。

## 2. 精简 CI 与 workspace lifecycle

- [x] 2.1 扩展 `scripts/workspace-lifecycle.ts` 的 workspace 图能力，为指定 plugin/package 计算、拓扑排序并去重传递 workspace 依赖闭包；补充 absent `dist`、共享依赖、传递依赖、循环和失败传播测试。
- [x] 2.2 更新 `scripts/validation/catalog.ts` 中 `ci-lensx-test` 的 build 准备，使用依赖闭包先构建 `@lensx/plugin-contract` 等传递公共包，再构建 `plugin-cli` 与模板消费者，禁止依赖工作区残留 `dist`。
- [x] 2.3 规范所有 `packages/*`、`plugins/*`、`examples/plugins/*` 的 `typecheck`、`test`、`check`、`build`：每个类别只做自身工作；移除 `check` 对 `typecheck`/`test` 的递归调用及 visual scripts；仅为不启动浏览器/native Runtime 的 build 后纯 Node 产物检查保留 `test:e2e`。
- [x] 2.4 更新 `scripts/ci.ts`，使 Plugins CI 对每个 direct plugin 恰好执行一次 `typecheck → test → check → build`，只按确定性条件执行 `test:e2e`，并删除 `visual` 探测与执行；补充顺序、一次性执行、失败传播和环境脚本拒绝测试。
- [x] 2.5 保持 `.github/workflows/lensx-ci.yml` 与 `.github/workflows/plugins-ci.yml` 为现有两个只读 macOS workflow，分别只调用精简后的 `ci-lensx-frontend` / `ci-lensx-rust` 与 `ci-plugins` Gate；更新 workflow policy 测试以阻止第三个 workflow、发布写权限或环境验证命令回流。

## 3. 删除 Evidence dispatcher 与环境 Gate 模型

- [x] 3.1 从根 `package.json`、`scripts/validation/cli.ts`、types、runner 和 tests 删除 `evidence` dispatcher、命令分支、`evidenceTargets`、专用执行逻辑与 usage 文案；`gate` 保持只读，`generate` 继续要求单一 target 与显式 `--write`。
- [x] 3.2 从 validation catalog 与 migration baseline 删除七个 Evidence target（`macos-accessory-launcher`、`plugin-child-webview-macos`、`plugin-pointer-cursor-macos`、两个 `plugin-development-runtime-evidence-*`、`frame-aware-webview-harness`、`plugin-development-runtime-harness`）及全部调用关系。
- [x] 3.3 删除 registry 中 browser/native/evidence safety metadata 和解析分支，并让 registry validation 直接拒绝 visual/browser/WebView/GUI/native-harness/environment-evidence 命令；保留 platform、read-only、working directory、environment 与 committed-write 等确定性执行元数据。
- [x] 3.4 审计 Generate targets，只保留 Host API/Manifest 类型、package-format 和其他可由源码完全重现的确定性生成物；删除 frame-aware evidence matrix/navigation evidence fixtures、WebView Runtime environment fixtures 等环境专用 target、runner、类型和测试。
- [x] 3.5 重写 Gate CLI、registry DAG、migration inventory、root-script policy 和 no-dual-entry 测试，验证 `pnpm run gate -- --list` 与 `pnpm run generate -- --list` 不暴露环境入口，未知/重复/循环/写入/禁用命令在启动子进程前失败。

## 4. 删除视觉、浏览器、原生 harness 与 evidence 资产

- [x] 4.1 删除 `plugins/config-lens/visual/**`、`plugins/config-lens/scripts/verify-visual.mjs`、`visual` script、40 个 baseline 及 ConfigLens WKWebView/cold-open/launcher evidence producer、checker 和 committed records；把 256 KiB JavaScript、64 KiB CSS、bootstrap 顺序、single SDK、single-flight Monaco 和 Worker 资源检查迁入确定性 build/package tests。
- [x] 4.2 删除 `packages/plugin-ui/visual/**` 与 `scripts/verify-visual.mjs`、React/Semi example/template 的 `visual/**`、visual scripts 和 baselines；在 Rstest 中保留 locale/theme semantic state、loading/error/ready、long text、keyboard、focus、accessibility 与 public token 断言，并在纯 CLI tarball consumer 中保留导出/样式/React peer 检查。
- [x] 4.3 删除 `scripts/verify-plugin-management-visual.mjs`、`scripts/verify-plugin-runtime-slot-visual.mjs` 及只服务于固定视口、computed style、截图或像素比较的 fixture；把 management、presentation、theme、focus 和 resize 状态断言迁入现有组件/controller/Rust 测试。
- [x] 4.4 删除 frame-aware navigation、Child WebView ACL/slot/web-capabilities/lifecycle、pointer cursor、Development Mode Runtime、macOS accessory launcher 等 native/WebView evidence producers、checkers、harnesses 和 `fixtures/**/evidence/**` records；保留并迁移 policy、source binding、generation、cleanup、zero-handler-hit 和恶意边界的确定性断言。
- [x] 4.5 删除因上述资产退役而失去唯一调用者的 helper、schema、dependencies、ignore 条目和构建配置；通过 import/caller、package manifest 和 tracked-file 扫描确认没有孤立 visual/evidence 基础设施。

## 5. 重组确定性 Gate 与能力覆盖

- [x] 5.1 将 frame-aware navigation、isolated origin、open Runtime、CSP/security lifecycle、Runtime Session 和 Child WebView lifecycle 中仍有价值的策略、状态、header/resource、bridge adapter、竞态、终止与恶意 fixture 检查纳入标准 Rstest、Cargo 或确定性 capability Gates。
- [x] 5.2 将 Host API Dispatcher、RPC validation、SDK WebView transport、Development Mode、Page presentation 和 plugin management 的生产组合、public/private boundary、tarball、storage、cancellation、replacement、focus/keyboard/theme 与状态转换检查迁入确定性 Gates，并删除原 Gate 中的环境前置依赖。
- [x] 5.3 更新 `plugin-project-template`、`plugin-ui`、`plugin-testkit` 与 official ConfigLens Gates，只运行 build、test、typecheck、check、pack/inspect、临时 CLI consumer 和 production-composition tests；Testkit 与 deterministic adapters 不得被描述为真实 WebView/native isolation 证明。
- [x] 5.4 运行 Gate plan 与迁移映射测试，确认共享步骤一次执行、无空/转发 Gate、无 Change-specific alias、无直接 Rstest 文件列表 root script，且每个保留 Gate 都有稳定 capability ID 和可定位失败输出。

## 6. 同步规格与双语文档

- [x] 6.1 更新 canonical English CI/validation 文档与相同路径的 Simplified Chinese 镜像，说明四类受支持确定性验证、两个 workflow、本地复现、非重叠 lifecycle、Gate/Generate 权限边界，以及 visual/browser/WebView/native/environment evidence 不再维护且没有按需入口。
- [x] 6.2 更新 Runtime、安全、窗口、Development Mode、Plugin workspace/template/UI/Testkit、ConfigLens 和其他受影响的 `docs/en/**` 及 `docs/zh/**`，保留产品语义但删除目标环境完成声明、旧 Gate/dispatcher 命令、截图/性能 evidence 维护说明；同步双语 index（如文件链接发生变化）。
- [x] 6.3 在同步前将本 Change 的 19 个 delta spec 中会进入 `openspec/specs/**` 的 Requirement 内容翻译为 canonical English，保持 proposal/design/tasks 为中文；同步 stable specs 后逐项核对删除/新增/修改结果和 Requirement 场景。
- [x] 6.4 更新验证治理文档与 OpenSpec/agent 规则中对 Evidence dispatcher、browser/macOS safety、visual 保留和“迁移不得减弱环境覆盖”的过时要求，使其明确反映有意删除且不得保留兼容路径。
- [x] 6.5 对 active source、tests、package manifests、CI、validation registry、stable specs、`docs/en` 和 `docs/zh` 执行 stale 扫描，确认无 `evidence` dispatcher、removed target/alias、visual/baseline/screenshot/pixel、browser/WebView/native harness 或目标环境性能完成要求；历史 archive 仅作记录并排除在失败范围外。

## 7. 最终验证

- [x] 7.1 在 clean checkout 等价条件下移除或隔离预生成 workspace `dist`，运行 `pnpm run gate -- ci-lensx-test` 与 `pnpm run gate -- ci-plugins`，确认传递依赖准备正确、每类 plugin lifecycle 只执行一次且没有浏览器、WebView、GUI 或 native harness 进程。
- [x] 7.2 运行完整 frontend/workspace 单测 `pnpm run test`；修复本 Change 引入的失败或 warning，并重新运行失败命令。
- [x] 7.3 运行 frontend/workspace 格式与静态检查 `pnpm run check` 和类型检查 `pnpm run typecheck`；修复本 Change 引入的全部问题并重新运行失败命令。
- [x] 7.4 运行 frontend/workspace 生产构建 `pnpm run build` 以及保留的确定性 pack/inspect/tarball/CLI consumer Gates，确认无残留 `dist` 假阳性、私有源码导入或环境型启动。
- [x] 7.5 运行 Rust 格式检查 `pnpm run src-tauri:format:check`、测试 `pnpm run src-tauri:test`、静态检查 `pnpm run src-tauri:check` 和 workspace build `pnpm run src-tauri:build`；虽然不改变产品行为，Rust 仍受 Gate 重组、状态与边界测试迁移影响，不能标记为 unaffected。
- [x] 7.6 运行双语文档/索引/术语策略测试、active stale 扫描、`openspec validate simplify-ci-and-retire-environment-evidence --strict` 与全部 stable spec strict validation，并运行 `git diff --check`。
- [x] 7.7 修复最终验证发现的每个 error 或 warning，重新运行对应失败命令，然后重新执行 7.1–7.6 的完整验证集；记录最终通过数量、Gate plan 和已明确接受的“未运行真实环境证明”限制。
