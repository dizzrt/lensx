# Tasks

## 1. 安装时存在的公共 CLI 入口与包契约

- [x] 1.1 新增 `packages/plugin-cli/bin/lensx-plugin.mjs` 并调整 manifest 的 `bin` 与精确发布文件清单，保留现有 `src/bin.ts`/`dist/src/bin.js`；在现有 CLI Rstest 范围补充入口存在、shebang、相对转发与元数据边界断言，运行 `pnpm --dir packages/plugin-cli run test` 确认通过。
- [x] 1.2 同步 `packages/plugin-cli/scripts/verify-package.mjs` 的白名单、必需文件、bin 元数据与可执行模式检查；先执行 `pnpm --dir packages/plugin-contract run build`，再执行 `pnpm --dir packages/plugin-cli run test:pack`，确认 tarball 含新入口和原构建目标，且原有 exports、依赖、大小及私有文件检查保持有效。
- [x] 1.3 更新 `docs/en/development/plugin-developer-cli.md` 及 `docs/zh/development/plugin-developer-cli.md`，说明安装时链接、构建后执行和不隐式构建的边界；逐项对照实现及两种语言，确认既有公共命令和协议说明未发生语义漂移。

## 2. 真实干净安装回归

- [x] 2.1 在现有 `scripts/check-plugin-developer-cli.ts` consumer 流程内增加 source-only 临时工作区阶段，复制真实 workspace/lockfile 输入与所需源码模板，排除输出和依赖目录；安装前断言 CLI/Contract 无 `dist` 且无消费者 shim，安装后检查首次入口、无相关缺文件警告和锁文件不变，并以运行 `plugin-developer-cli` Gate 的该阶段作为完成证据。
- [x] 2.2 在临时副本内构建 Contract → CLI，再通过首次安装的消费者入口验证 `--help`、`--version`、公共 create 及兼容产物 `validate --json`；记录 shim 身份、退出结果与 JSON，确认没有再次安装、重链接、全局 CLI 或内部路径直调，并验证若入口指回不存在的构建目标，安装后检查能够失败。
- [x] 2.3 为临时工作区选择、产物排除、路径边界与结果判定等纯逻辑补充现有 Rstest discovery 内的回归，验证成功/失败清理边界；在真实阶段审计 PATH/NODE_PATH、关键包 realpath 及机器全局 store 使用，确认当前 checkout 的源码、锁文件和根 `node_modules` 未被该阶段改写。实际安装和构建只由 Gate 执行，不塞入 Rstest。
- [x] 2.4 保留现有两个模板的 tarball consumer、双次 pack、inspect 和 Rust 准备检查，通过 `pnpm run gate -- plugin-developer-cli` 同时验证新旧阶段；分别记录源码安装回归与发布包消费结果，不能用后者成功替代前者。
- [x] 2.5 同步更新 `docs/en/development/continuous-integration.md`、`docs/en/development/plugin-developer-cli.md` 与两个 `docs/zh/` 对应文档，写清新增回归、离线依赖前置条件及覆盖边界；核对命令均指向现有 Gate，双语语义与链接一致。

## 3. 插件产物检查的启动错误诊断

- [x] 3.1 从 Translation E2E 提取无顶层 I/O 的 CLI 结果判定辅助模块，按 error、signal/null status、非零退出、JSON 协议顺序处理；保留真实 `spawnSync('lensx-plugin', ...)` 及全部既有产物断言，检查诊断包含命令/子命令、可用错误标识/状态/信号和至多 4 KiB 的每路输出摘要，空输出有占位。
- [x] 3.2 在 Translation 现有 Rstest discovery 范围通过构造结果覆盖 ENOENT、EACCES、无输出、signal、非零退出、未知 null 状态、空/非法 JSON、结果形状/状态错误及 validate/pack/inspect 成功，运行 `pnpm --dir plugins/translation run test`；测试不启动子进程，也不导入 E2E 主脚本。
- [x] 3.3 完成必要依赖与插件构建后运行 `pnpm --dir plugins/translation run test:e2e`，确认 validate、双次 pack、inspect、摘要及临时目录清理仍通过；同步更新 `docs/en/development/translation.md` 与 `docs/zh/development/translation.md` 的验证/排障说明，核对工程诊断未改写公共 CLI 协议或产品文案。

## 4. 最终验证与归档准备

- [x] 4.1 执行 `pnpm run gate -- ci-plugins`、`pnpm run gate -- plugin-host-http`、`pnpm run gate -- plugin-developer-cli`，记录真实公共命令入口、源码干净安装及发布包消费者的结果；执行 `pnpm run gate -- ci-workflows`、`pnpm run gate -- workspace-boundaries`、`pnpm run gate -- workspace-lifecycle`，确认现有工作流、依赖准备与非重叠生命周期契约未回退。
- [x] 4.2 执行完整前端/工作区 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，记录每项结果；`check` 覆盖格式与静态检查。focused Gate 的成功不得替代这组完整验证。
- [x] 4.3 执行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 并记录结果；本变更不修改原生实现，但保留既有 CLI/Rust 包内容及准备边界的完整验证，且不得引入 GUI、浏览器、WebView、截图、原生交互或环境性能步骤。
- [x] 4.4 修复本变更引入的所有警告与错误，重跑失败命令及最终验证集合；记录实际结果，不能用旧提交、已有本地 shim 或单一 tarball 通过结果代替新增干净安装证据。
- [x] 4.5 同步前检查 root manifest、CI、维护文档与 specs 中的 Gate 引用、Change 专属根脚本、旧别名、直接 Rstest 文件列表脚本、递归 check 和已移除 dispatcher；确认本变更未新增这些入口，运行 `openspec validate fix-plugin-cli-clean-install-entry --strict` 与 `git diff --check`。
- [x] 4.6 在归档准备时将接受的两个 delta 按 `stable_specs: en` 同步到稳定规范，保留既有场景并核对新增行为；记录同步路径和结果，再运行 `openspec validate --specs --strict` 与本 Change 的严格验证。此项不执行归档。
- [x] 4.7 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 对最终接受范围执行变更级治理与文档审计，并在本文件追加实际证据：已审查范围、代码/测试/spec/doc 路径、双语及链接、项目级触发决定、结论与理由、更新路径、真实验证命令及结果。计划只更新既有分类文档，项目级审计是否触发必须按最终 diff 和修复结果重新判断；若触及索引、根规则、语言/目录关系或其他治理表面，则执行并记录项目级审计。
- [x] 4.8 确认同步后的 specs、双语文档、索引入口与链接均有效，修复范围内缺失、陈旧或冲突内容后重新验证；仅记录 archive-ready 或具体阻塞原因，等待单独归档授权。任何先前审计都需按最终范围复核，未完成实现、验证或同步不得标为归档就绪。

## 实施与归档准备审计（2026-10-22）

### 最终接受范围与审查对象

- CLI：`packages/plugin-cli/package.json`、`bin/lensx-plugin.mjs`、`scripts/verify-package.mjs`、`tests/install-entry.test.ts`。安装入口仅相对导入原构建目标；原 TypeScript runner、公共命令、依赖版本、exports 与 JSON/退出码未改变。源码入口可执行，tarball 同时包含新入口与原构建目标，精确文件清单、私有内容和大小检查保持有效。
- 源码安装回归：`scripts/check-plugin-developer-cli.ts`、`scripts/plugin-cli-clean-install.ts`、`tests/plugin-cli-clean-install.test.ts`。现有 Gate 内新增真实源码安装阶段；复制当前真实 manifest、workspace/lockfile、Contract/CLI 源码与模板校验输入，排除依赖、产物和缓存，不依赖已提交文件枚举。
- Translation：`plugins/translation/scripts/test-e2e.mjs`、`scripts/cli-result.ts`、`tests/cli-result.test.ts`。保留真实 `spawnSync('lensx-plugin', ...)` 及所有原有产物断言；纯辅助模块区分启动、信号、未知退出状态、非零退出和 JSON 协议错误，每路 UTF-8 输出摘要连同截断标记不超过 4 KiB。
- 文档与规范：复核本 Change 的 proposal/design/tasks 和两个 delta；检查并同步 `openspec/specs/plugin-developer-cli/spec.md`、`openspec/specs/repository-continuous-integration/spec.md`；更新 `docs/en/development/{plugin-developer-cli,continuous-integration,translation}.md` 及三个同路径 `docs/zh/` 镜像。两份稳定规范分别保留全部 32 个既有场景，现为 39 和 37 个场景。
- 治理输入：复核根 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、双语 `docs/*/index.md`、`docs/en/development/project-workflow.md`、`validation.md`、根 manifest 和两条 CI workflow。

### 实际验证结果

| 验证 | 实际结果 |
| --- | --- |
| `pnpm --dir packages/plugin-cli run test` | 7 个测试文件、66 项通过，包括源码入口、shebang、可执行模式、相对转发、精确发布清单及 exports 边界。 |
| `pnpm --dir packages/plugin-contract run build`；`pnpm --dir packages/plugin-cli run test:pack` | 通过；tarball 为 81 个文件、36,488 字节，包含新的可执行 bin 和既有运行产物。最终 Gate 内再次通过。 |
| `pnpm exec rstest run tests/plugin-cli-clean-install.test.ts`；`pnpm exec tsc --noEmit -p tests/tsconfig.json` | 32 项回归及类型检查通过；覆盖输入选择、排除规则、路径边界、PATH 符号链接别名、结果判定、首次入口与成功/各失败阶段清理。Rstest 不执行安装或构建。 |
| `pnpm --dir plugins/translation run test` | 10 个测试文件、209 项通过，含 31 项纯进程结果回归；覆盖 ENOENT/EACCES、缺输出、signal/null/非零退出、非法 envelope/status、三种命令成功及多字节摘要边界。 |
| `pnpm --dir plugins/translation run build`；`pnpm --dir plugins/translation run test:e2e` | 通过；9 个产物文件的公共 validate、两次 pack、inspect、字节与 SHA-256 一致性及临时目录清理通过。 |
| `pnpm run gate -- ci-plugins`；`pnpm run gate -- plugin-host-http`；`pnpm run gate -- plugin-developer-cli` | 最终集合全部退出 0。CI 验证 2 个直接插件并准备 5 个公共依赖包；HTTP Gate 与 CI 均使用真实公共命令。CLI Gate 独立验证源码安装及两模板发布包消费。 |
| `pnpm run gate -- ci-workflows`；`pnpm run gate -- workspace-boundaries`；`pnpm run gate -- workspace-lifecycle` | 全部退出 0；工作流、依赖边界及非重叠生命周期保持有效。 |
| `pnpm run test`；`pnpm run typecheck`；`pnpm run check`；`pnpm run build` | 完整工作区四项全部退出 0；11 个 Rstest 报告合计 1,444 项测试通过。格式、静态分析、类型检查与全部构建通过。 |
| `pnpm run src-tauri:format:check`；`pnpm run src-tauri:test`；`pnpm run src-tauri:check`；`pnpm run src-tauri:build` | 最终集合全部退出 0；Rust 265 项测试通过，无新增警告或错误。原生实现未变，验证保留 CLI/Rust 包内容边界。 |
| `openspec validate --specs --strict`；`openspec validate fix-plugin-cli-clean-install-entry --strict`；`git diff --check` | 44 份稳定规范全部通过，Change 通过，diff 检查通过。长 requirement 文本为 INFO 建议，不是失败；同步后 ADDED 已存在的 INFO 见下述归档说明。 |

### 干净安装与发布包的独立证据

- 源码阶段使用 pnpm `11.17.0` 和机器配置的全局 store，以 offline/frozen-lockfile/ignore-scripts 安装。安装前后 Contract/CLI 均无 `dist`，首次 Translation shim 可执行，安装日志的 stdout/stderr 无相关缺入口警告，锁文件字节不变；未构建调用以非零状态失败且不产生构建输出。
- 仅在副本内依次构建 Contract、CLI；首次 shim 的 dev、inode、内容与 SHA-256 身份保持一致。通过该 shim 执行 `--help`、`--version`、公共 framework-neutral `create` 与 `validate --json`，全部退出 0；create 为 `success`，validate 为 `compatible`，均为 schema version `1`、WebView 结果。
- 清除继承的 NODE_PATH，对 PATH 及其符号链接别名按 realpath 排除 checkout/依赖路径，审计 shim 的模块搜索路径，以及 CLI、Contract、Zstd、Ajv、TypeScript 的 realpath 全部留在副本。安装与构建期间未重装、重链接或回退到全局/内部入口。
- 独立的反向副本将 bin 改回缺失的 `dist/src/bin.js`；真实首次安装后入口检查按预期拒绝，且没有构建产物。两个副本均经同一 finally 清理；原 checkout 复制输入与锁文件字节、根 node_modules 身份及依赖元数据保持不变。
- 发布包阶段另行消费真实 tarball，两种模板的 test/typecheck/build、validate、双次 pack、inspect 通过；Rust 对两个包均返回 `compatible: true` 与 `installerPrepared: true`。此证据没有替代源码安装回归。

### 修正、文档与治理结论

- 开发期间修正了 tarball 对非 bin 构建文件的权限规范化断言、macOS 临时目录 `/var` 与 `/private/var` 的路径别名误判，以及 Rstest 参数化空数组被当作参数列表的问题。相应失败命令均已重跑通过，之后执行了上述完整最终验证集合。
- pnpm 在受限环境首次运行出现机器数据库访问错误；使用获准的执行权限继续，未修改全局配置、依赖版本或 root node_modules，未进行根目录重装。
- 六篇受影响文档的双语含义、范围、命令、限制和相对路径一致；连同双语索引检查的 54 个本地链接目标均存在，新增 `#validation` 与 `#验证` 锚点有效。所有文档均由现有分类页面承载，无新增、移动、删除页面，也无需修改索引。
- 根 manifest、CI、维护文档与 specs 的检查，以及既有治理测试确认：未新增 Change 专属根脚本、转发别名、直接 Rstest 文件列表脚本、递归 check 或已移除 dispatcher 调用。所用 Gate 均为现有稳定 ID；无浏览器、GUI、WebView、截图、原生交互或目标环境性能步骤。
- **项目级审计不触发**：最终 diff 仅涉及既有功能实现/测试、分类文档及能力规范，没有改变根/目录规则、README、索引、语言集合、目录/同步关系、spec driver 配置或生成集成。已在修正后按最终 diff 重新核对；变更级审计覆盖充分，没有未解决的范围内冲突或缺失。
- **规范同步已完成**：按 `stable_specs: en` 合并两个 delta，保留未涉及的要求与场景。后续单独授权归档时，应先复核同步内容，再使用 `--skip-specs` 避免重复应用已同步的 ADDED 条款，保留正常验证；本次没有执行归档。
- **结论：archive-ready**。实现、测试、完整验证、规范同步、双语文档与链接审计全部完成；等待单独归档授权。此结论不包含发布、远端 CI、GUI 或真实 WebView 验收。

## 归档复核（2026-10-22）

### 范围、同步与治理

- 用户已明确授权归档本 Change。`openspec list --json` 确认本仓库为规划根且仅有一个同名变更，19/19 项任务完成；`openspec status --change fix-plugin-cli-clean-install-entry --json` 确认 `spec-driven` 的 proposal、design、specs、tasks 全部为 `done`。
- 读取当前 archive 指引和一次 specs 指令快照，内联逐项对照状态返回的两个 delta 与对应英文稳定规范。CLI 的两项新增要求、CI 的一项修改要求及一项新增要求均已同步，语义与场景完整，无待合并差异；本轮无需重写稳定规范。结构检查确认两个既有标题及 Purpose 完全保留，无 delta 操作标题，未涉及的要求逐字保留，全部旧场景仍在，场景总数分别为 39 和 37。
- 复核上节所有实施范围、当前 diff、入口/manifest/包校验、干净安装辅助模块、真实 consumer 调用及 Translation 结果判定；没有发现实现与接受范围、稳定规范或文档之间的新冲突。完整前端/工作区、Rust、CLI consumer 及插件 Gate 的结果沿用上节实施阶段记录，本轮未重新执行这些完整验证，不将其计为归档轮新增结果。
- 文档复核覆盖 `docs/en/development/{plugin-developer-cli,continuous-integration,translation}.md`、三个 `docs/zh/` 镜像、双语索引，以及 `project-workflow.md`、`validation.md`；六篇文档的含义、命令、限制一致，八篇文档共 54 个本地链接及锚点有效，双语 Markdown 相对路径集合一致，无需更新文档或索引。
- 重新检查 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、根 manifest、CI 和最终文件范围。**项目级审计仍不触发**：现有 Gate 内部新增确定性 consumer 验证没有改变根命令接口、Gate ID 或治理政策；根/目录规则、README、索引、语言集合、目录与同步关系、spec driver、临时目录规则及生成集成均未改变。变更级审计覆盖充分，无新增修复触发治理范围扩大。

### 本轮实际验证与归档决定

- `openspec validate --specs --strict`：44/44 份稳定规范通过；`openspec validate fix-plugin-cli-clean-install-entry --strict`：通过。仅有长要求文本及已同步 ADDED 的 INFO 提示，无失败。已同步 ADDED 无需再次应用，按归档技能在同步复核完成后移动整个变更目录。
- `node scripts/validation/cli.ts gate --list`：成功，所引用 Gate 均存在。对根 manifest、`.github/`、维护文档和稳定规范的定向扫描未发现本 Change ID、已移除 Evidence 调用、直接 Rstest 文件列表根脚本或递归 check 新入口。
- `pnpm run gate -- validation-governance`：退出 0；workspace lifecycle 6 项、workspace boundaries 21 项及最终四文件集合 71 项全部通过，工作区边界静态检查通过。最后集合包含前两组测试，不重复累计。最初直接用 Node 调用 dispatcher 因 PATH 缺少 `rstest` 返回 ENOENT；按项目约定先 `source ~/.zshrc`，再使用标准 pnpm 入口完整重跑成功。shell 初始化的补全缓存清理被沙箱拒绝，不影响 Gate，未修改全局配置。
- `git diff --check`：通过；归档目的目录事前不存在。更新路径仅为本 `tasks.md` 的复核记录，随后整体移动到 `openspec/changes/archive/2026-10-22-fix-plugin-cli-clean-install-entry/`，保留 `.openspec.yaml` 和全部产物。
- **归档就绪**：先前审计已经按当前接受范围复核，规格同步、文档镜像/链接及治理验证均满足归档条件。归档后检查完整文件清单、内容摘要、相对链接与 active list；不提交、推送或发布。
