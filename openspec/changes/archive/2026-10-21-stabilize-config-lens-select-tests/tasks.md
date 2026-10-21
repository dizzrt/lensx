# Tasks

## 1. 修复测试交互并保留业务回归

- [x] 1.1 在 `plugins/config-lens/tests/ConfigLensPage.test.tsx` 中建立定位前与定位后两条确定性回归，局部控制定位计时器并记录旧 helper 在动画路径下读到旧请求的失败；验证定位已完成、退出结束前未提交、退出结束后恰好一次提交，不能只依赖最终标签或多次偶然通过。
- [x] 1.2 统一选择 helper：通过 combobox 的 `aria-controls` 绑定当前 listbox、完整选项名称及所属 dialog，在必要时完成该弹层的退出 `animationend`；验证两条路径均能完成选择，并以选中标签、source、selection 和递增版本/请求数量识别新提交，空输入仍不派发分析。
- [x] 1.3 将首次 TOML 手写点击和其余语言选择调用点迁入同一流程，保留手动锁定、编辑/清空、返回 Auto 清除手动证据、迟到分析与转换结果失效、隐藏/卸载的断言；覆盖英文/简体中文与明暗主题相关组合，验证计时器及 portal 清理不会污染后续用例。
- [x] 1.4 同步更新 `docs/en/development/config-lens.md` 和 `docs/zh/development/config-lens.md` 的确定性验证说明，描述真实 Select、显式动画完成、局部计时器与证据边界；核对两种语言语义及现有索引/链接有效，不改变文档结构。
- [x] 1.5 在 `plugins/config-lens` 目录使用现有 Rstest CLI 先运行原失败场景，再运行完整 `tests/ConfigLensPage.test.tsx`；记录实际命令、断言及结果，确认不是依靠 retry、skip、固定 sleep 或降低断言通过，且设计中的延迟分支走到同一 helper。

## 2. 完整验证与归档准备

- [x] 2.1 在仓库根目录运行完整 `pnpm run gate -- ci-plugins`，记录公共依赖准备和所有直接插件的 `typecheck`、`test`、`check`、`build`、已声明纯 Node `test:e2e` 的实际结果；不得用文件级测试通过代替 Gate，也不得将本地通过报告为 GitHub Actions 已重新通过。
- [x] 2.2 运行适用的全量前端/工作空间验证：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，记录测试、格式/静态检查、类型检查和构建结果，并与 `ci-plugins` 的单独结果区分。
- [x] 2.3 核对最终 diff 并记录 Rust 验证适用性：本次仅修改插件测试、对应文档和规划文件，Rust/Host/vendor 生产代码、原生契约和构建配置均不变，因此 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 不适用；若范围发生变化，先报告与生产代码不变约束的冲突。
- [x] 2.4 修复本次引入的所有警告和错误，然后重跑失败命令及完整最终验证集合；确认 `plugins/config-lens/src/`、公共包生产代码、Host/Rust/vendor、Manifest、依赖/锁文件、工作流、Gate 和根脚本均无改动，记录实际检查结果。
- [x] 2.5 执行同步检查并记录 `.openspec.yaml` 的 `skip_specs: true` 与无 delta specs 的依据，确认既有语言选择和 CI 规格无需修改；归档前仍先完成该同步步骤，不将无需求变化解释为跳过同步检查。
- [x] 2.6 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 完成最终范围治理与文档审计，在本文件记录范围、检查对象/路径、项目级审计触发判断、结论与理由、实际更新路径及验证证据。当前普通分类文档修改不触发项目级治理审计；修复若触及索引、语言策略、Agent 指令或其他治理面，重新判断并完成相应审计。
- [x] 2.7 校验英中文档语义、索引和链接，扫描根 manifest、CI、维护文档与稳定规格中的 Change 专属脚本、已移除别名、直接测试文件列表脚本、递归生命周期及过时 dispatcher；运行 `openspec validate stabilize-config-lens-select-tests --strict --no-interactive`、`openspec validate --specs --strict --no-interactive` 和 `git diff --check`，确认同步与审计结论有效后记录归档就绪状态。归档、提交和推送均不属于本任务的自动执行范围。

## 实施与验证记录

### 1.1 确定性分支回归

- 在 ConfigLens 包目录执行 `pnpm exec rstest run tests/ConfigLensPage.test.tsx -t 'commits once'`。以旧 helper 的点击后直接读取流程运行：定位前的四个语言/主题组合通过，定位后的四个组合失败，期望手动 TOML 却读到旧 Auto 请求。初始化期间校正了锁定 Semi 的 DOM 契约：`aria-controls` 指向包含 listbox 的包装节点，完整选项可访问名称含 `tick` 图标前缀。
- 同一命令在加入当前 dialog 的退出 `animationend` 后，8 个分支全部通过；其余 14 个用例仅因 CLI 名称过滤未运行，无新增 skip/retry。推进局部 50ms 虚拟定位任务后，断言目标 dialog 进入 `semi-tooltip-animation-show`；退出结束前旧标签、请求对象、版本与请求数量保持不变，结束后只提交一个新请求。每次在 finally 中卸载、清理有限待执行计时器、验证无 portal 和计时器残留并恢复真实计时器。

### 1.2–1.3 统一交互与业务覆盖

- `openLanguageOptions` 经 combobox 的 `aria-controls` 包装节点取得唯一 listbox 和最近 dialog；`choose` 按完整名称选择，只向同一仍连接且处于退出阶段的 dialog 派发动画结束事件。8 个分支均经此 helper 完成 TOML → 本地化 Auto；每次核对旧请求未提前提交、新请求对象/数量、source、selection、inputVersion 与 selectionVersion。空输入下 XML → Auto 不派发分析，后续输入保留递增的选择版本。
- 首次 TOML、返回 Auto、迟到转换、隐藏/卸载全部迁入同一 helper。原选项列表、手动锁定、编辑/清空、旧 XML 检测、四类迟到转换和重开重置断言保留。最终完整文件 22/22 通过，无 skip/retry。
- 初次局部静态检查发现测试代码对 mock 类型及 ByRole 参数的两处类型错误和一处格式问题，已修复；再次执行 ConfigLens 包内 `pnpm exec tsc -p tsconfig.json` 与根目录 `pnpm exec biome check plugins/config-lens/tests/ConfigLensPage.test.tsx` 均通过。

### 1.4–1.5 文档与文件级验证

- 更新 `docs/en/development/config-lens.md` 与对应中文镜像的现有确定性验证章节，说明真实 Select、当前弹层退出事件、局部定位计时器、新请求证据和 Happy DOM 的证据边界。新增段落英中文义一致，两份文档各 7 个标题及原导航不变；双语文档与双语索引的 42 个相对目标、4 个 anchor 校验通过。
- 在 `plugins/config-lens` 依次执行 `pnpm exec rstest run tests/ConfigLensPage.test.tsx -t 'locks a manual choice'`（原失败场景 1/1 通过，其余仅 CLI 过滤）、`pnpm exec rstest run tests/ConfigLensPage.test.tsx`（22/22 通过，0 skipped/todo）。迟到分析/转换、隐藏与重新挂载等原有断言保留；未添加 retry、skip、真实 sleep 或全局动画补丁，8 个定位回归实际调用同一 helper。

### 2.1 完整插件 Gate

- 根目录 `pnpm run gate -- ci-plugins` 退出码 0。Gate 发现 1 个直接插件，先构建 4 个公共依赖包，再完成 ConfigLens 的 `typecheck`、`test`（13 文件、186/186）、`check`（50 文件及依赖/边界/隐私/产物检查）、`build`、纯 Node `test:e2e`（45 个自包含文件）。无失败或警告。
- 这是本机完整入口结果，不代表 GitHub Actions 已重新执行或通过；没有浏览器动画、真实 WebView 或操作系统交付验收。

### 2.2–2.4 最终工作空间验证与范围

| 根目录命令 | 实际结果 |
| --- | --- |
| `pnpm run test` | 退出码 0；根应用及工作空间共 131 个测试文件、1174/1174 用例，0 failed/skipped；包含 ConfigLens 186 个用例。 |
| `pnpm run typecheck` | 退出码 0；根应用及所有适用成员类型检查通过。 |
| `pnpm run check` | 退出码 0；Biome、生成文件漂移、模板与插件边界静态检查通过，无写入修复。 |
| `pnpm run build` | 退出码 0；根应用、公共包、插件示例和 ConfigLens 构建通过。 |

- 完整 Gate 与上述四项工作空间最终验证均在测试类型/格式错误修复后执行，无新增 warning/error；与文件级结果分别记录，不相互替代。
- 最终 `git diff --name-only` 仅列出插件测试和两份 ConfigLens 文档；当前变更规划目录为开始时已有的未跟踪目录，本次更新其 tasks 记录。`git diff --exit-code -- plugins/config-lens/src packages src src-tauri vendor package.json pnpm-lock.yaml pnpm-workspace.yaml .github scripts openspec/specs` 退出码 0。生产代码、原生契约、Manifest、依赖/锁文件、工作流、Gate 和根脚本均无修改。
- Rust/Host/vendor 和构建配置没有受影响，因而 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 不适用，未执行；没有将前端通过当作 Rust 或平台验收。

### 2.5 同步检查

- 按同步流程重新执行 `openspec status --change stabilize-config-lens-select-tests --json`；planning root 为当前仓库，`artifactPaths.specs.existingOutputPaths` 为空，specs artifact 状态为 skipped，与 `.openspec.yaml` 的 `skip_specs: true` 一致。同步检查已完成，结果为无适用 delta，不写入或推断新的稳定规格。
- 已核对 `openspec/specs/official-config-lens-plugin/spec.md` 的语言选择、手动锁定、清空、Auto 与迟到结果隔离，以及 `openspec/specs/repository-continuous-integration/spec.md` 的公共依赖准备、全部直接插件验证、失败后的完整入口重跑要求。测试修正既有验证机制，没有产品或 CI 契约变化，稳定规格无需更新。

### 2.6 最终范围治理与文档审计

- **审查范围**：当前 change 的 proposal/design/tasks/.openspec.yaml、`plugins/config-lens/tests/ConfigLensPage.test.tsx` 和两份 ConfigLens 开发文档；复核生产 Page 的选择/分析契约、锁定 Semi 的 Select/Tooltip/CSSAnimation 生命周期与现有 Rstest 配置，未修改这些生产或配置文件。
- **检查对象**：上述两项稳定规格、`docs/en/development/config-lens.md` 及中文镜像、双语 `docs/{en,zh}/index.md`、`docs/en/development/validation.md`、`docs/en/development/project-workflow.md`、`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、根 manifest 与两个 CI 工作流。
- **项目级审计判断**：不触发。实际只改变现有分类文档正文、插件测试及当前任务证据，未改变语言策略、Agent 指令、索引、文档路径/结构、同步关系、spec driver 配置、临时材料规则或生成集成；最终 diff 和修复后的范围均已复核。
- **结论与理由**：范围审计通过。真实 Select 回归保留既有业务语义；目标弹层、退出前后、新请求和空输入证据明确。双语文档已同步，解释 Happy DOM 建模范围，不把模拟事件当作浏览器或 OS 验收。独立只读代码审查未发现需修复问题。
- **实际更新路径**：测试文件、上述两份 ConfigLens 文档、当前 `tasks.md`；稳定规格、索引与治理文件均无需更新，原因是契约和导航未变化。

### 2.7 入口、链接与归档就绪

- 双语新增段落人工语义核对通过；两份 ConfigLens 文档均保持 7 个标题。文档及双语索引 42 个相对目标、4 个 anchor 检查通过，未添加临时材料引用。
- 执行 `pnpm run gate -- --list`、`pnpm run generate -- --list` 并结合只读 Node/文本扫描核对根 manifest、CI、维护文档与稳定规格：25 个根 scripts 无 Change 专属入口、根多阶段链、直接 Rstest 文件列表或 Evidence dispatcher；90 个维护 docs/specs/CI 文件的 177 处 Gate/Generate 引用均可解析。包内已有同类静态检查组合不构成递归生命周期；无待移除临时入口或过时别名。
- `openspec validate stabilize-config-lens-select-tests --strict --no-interactive` 通过，明确接受 skip_specs 的零 delta；`openspec validate --specs --strict --no-interactive` 42/42 通过；`git diff --check` 通过。稳定规格仅输出既有长条款 INFO 建议，无校验失败，未改写无关规格。
- **归档就绪**：实施、无 delta 同步检查、最终范围审计、双语/链接检查和适用完整验证均完成。归档前应再核对届时最终范围；本次未执行归档、staging、提交或推送。本地结果不代表远端 CI 重新通过。

### 归档前复核（2026-10-21）

- **授权与状态**：本次按用户明确的归档请求复核。`openspec list --json` 确认当前仓库为 planning root，任务为 12/12；`openspec status --change stabilize-config-lens-select-tests --json` 确认 proposal、design、tasks 均 done，specs 为 skipped，schema 为 `spec-driven`。`openspec schemas --json` 确认该 schema 可用。
- **先行同步检查**：再次核对 `.openspec.yaml` 的 `skip_specs: true` 与 status 返回的空 `artifactPaths.specs.existingOutputPaths`。语言锁定、清空、Auto、迟到结果隔离和 CI 验证契约仍由 `official-config-lens-plugin`、`repository-continuous-integration` 稳定规格覆盖，无适用 delta，不写入稳定规格。
- **最终范围与检查对象**：复核本变更全部制品、`plugins/config-lens/tests/ConfigLensPage.test.tsx`、生产 Page 与锁定 Semi 的选择提交边界、两份 ConfigLens 文档、双语索引、上述稳定规格，以及 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml` 和项目工作流/验证文档。独立只读审查确认真实 Select 未被替换，定位前后八个组合经过同一 helper，旧选择与新请求断言保留且加强，没有真实固定等待或降低断言。
- **文档与治理结论**：两种语言的新增正文语义一致，均说明 Happy DOM 事件的建模范围。两份文档各保留 7 个标题，双语索引入口有效；7 份范围内 Markdown 的 43 个相对链接与 4 个 anchor（含显式 HTML anchor）校验通过。25 个根 scripts 与 91 个维护文档/稳定规格/CI 文件的入口扫描通过，177 处 Gate/Generate 引用均可解析，未发现被扫描的过时别名或 Change 专属根入口。四类临时目录均被忽略且无已跟踪文件。
- **项目级审计判断**：归档前再次确认不触发。最终范围仍仅为测试、现有分类文档正文与变更制品；未改变语言策略、Agent 指令、索引、目录结构、翻译关系、driver 配置或生成集成。本轮无需修复治理或文档，实际新增内容仅为本文件的归档复核证据。
- **本轮实际验证**：ConfigLens 包内 `pnpm exec rstest run tests/ConfigLensPage.test.tsx` 为 22/22 通过，0 failed/skipped/todo；根目录 `pnpm exec biome check plugins/config-lens/tests/ConfigLensPage.test.tsx` 通过且未修复文件；`openspec validate --all --strict --no-interactive` 为 43/43 通过（42 项稳定规格与本变更），仅保留已有长条款及 skip_specs 的 INFO 提示。`git diff --check` 和前述生产/配置路径的 `git diff --exit-code` 均通过。
- **验证边界与归档决定**：此前 2.1–2.4 的完整 `ci-plugins` 与工作空间 test/typecheck/check/build 结果保留为实施阶段证据；本轮未修改测试或产品文件，没有重复执行这些全量命令。Rust/Host/vendor 仍未受影响，Rust 验证不适用。无未完成制品、任务或归档阻碍，允许进入目录移动；不将本地结果表述为远端 CI、浏览器动画或操作系统验收。
