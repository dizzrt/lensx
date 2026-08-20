## Context

根 `package.json` 当前同时承担六种角色：开发与生命周期入口、Rstest 测试子集别名、跨 TypeScript/Rust 的 focused gate、构建与真实 tarball consumer、视觉/macOS 证据，以及历史 OpenSpec Change 的一次性交付命令。结果是 132 个 scripts 中有 84 个 `check:*`，大量命令把相同测试文件、Cargo filter 和上游 gate 反复写入长 `&&` 字符串。根 Rstest 已经自动收集 `tests/**/*.test.{ts,tsx}`，workspace lifecycle 也会发现所有成员并执行其标准 `build`、`typecheck`、`test`、`check`；继续为测试子集增加根脚本并不会扩大普通测试覆盖，只是在 manifest 中复制调度信息。

现有 focused validation 本身不能简单删除：插件平台交付需要组合生成物漂移、Rstest、Cargo、构建、真实 tarball、隔离 consumer、浏览器视觉检查和真实 macOS/WKWebView 证据。问题是这些跨层阶段缺少自己的声明式编排边界，并且 OpenSpec 任务、文档和 Agent 规则默认把“新增 `check:<change>`”当成最容易复现的交付方式。

本变更是仓库验证基础设施和治理变更，不改变产品行为。主要维护者是后续开发者、CI 和执行 OpenSpec 工作流的 Agent。

## Goals / Non-Goals

**Goals:**

- 将根 package scripts 收敛为有限、稳定、可说明用途的仓库级接口。
- 建立一个类型化 Gate registry 和单一只读验证 CLI，以 capability ID 组合跨 Rstest、Cargo、构建、打包、视觉和原生证据阶段。
- 让同一次 Gate 执行中的共享依赖按稳定 step ID 拓扑排序并只执行一次，拒绝缺失依赖和循环。
- 将无外部副作用、可表达为断言的 TypeScript 策略/漂移检查交给 Rstest 自动发现，而不是为每个文件建立脚本别名。
- 将生成和真实证据的写入路径与只读 Gate 分离，要求显式目标和显式写入标志。
- 通过 `AGENTS.md`、OpenSpec 配置、双语工程文档、stable specs 和自动策略测试共同防止脚本表重新膨胀。
- 原子迁移所有 maintained CI、文档和 spec 引用，删除被替代入口且不保留双路径。

**Non-Goals:**

- 不改变任何 Host、插件 Runtime、公共 Contract/SDK、Tauri command 或用户界面行为。
- 不降低 focused gate、完整 frontend/Rust validation、视觉或真实 macOS 证据的覆盖和失败强度。
- 不让 Rstest 承担 Cargo、构建、打包、浏览器进程或原生 evidence harness 的任务编排职责。
- 不把 workspace 成员必须声明的 `build`、`typecheck`、`test`、`check` 四个 package-local lifecycle scripts 移除。
- 不引入新的产品运行时依赖，也不顺带重写现有测试实现或 CI 平台策略。

## Decisions

### 1. 根 manifest 只暴露稳定命令族

根 scripts 按职责分为：标准 workspace lifecycle、必要的应用内部 lifecycle、开发/格式化/Tauri 运维入口，以及单一 `gate`、`generate`、`evidence` dispatcher。具体允许集合由一个受测试的 policy module 声明；增加入口必须同时给出长期仓库级用途、不能由现有 dispatcher 表达的理由和相应文档。

以下模式默认禁止：以 active/archive Change ID 命名的 script；仅选择一个或若干 Rstest 文件的 `test:*`/`check:*`；只转发到另一个脚本的别名；以及在 `package.json` 内直接编码多阶段 `&&` 图。必要的 package-local scripts 仍保留在各 workspace member manifest 中，因为它们是成员自治和根 lifecycle discovery 的稳定契约。

备选方案是只格式化或拆行现有 scripts。它不能消除重复依赖、Change-specific 接口和 Agent 继续追加入口的激励，因此不采用。另一个备选是规定一个脚本数量上限；数量阈值无法表达用途是否合法，也会诱导把多个阶段塞入更长字符串，因此采用语义 policy 而非任意预算。

### 2. Gate registry 是跨层验证的唯一 capability 编排源

新增仓库私有的 TypeScript registry 和 runner。registry 使用稳定 capability ID，而不是 OpenSpec Change 名称；每个 Gate 声明描述、依赖 Gate、顺序阶段和运行约束。可执行阶段以结构化的 executable、argv、cwd、environment、step ID 和安全元数据表示，不保存 shell `&&` blob。runner 提供列举、计划和执行能力，验证未知 ID、重复定义、缺失依赖和循环，并以非零状态传播首个失败。

runner 对完整 Gate DAG 做拓扑展开，以稳定 step ID 去重；默认串行执行，确保构建输出、临时 consumer、浏览器和原生 harness 不因隐式并发互相污染。命令输出必须标识 Gate、step 和失败阶段，使迁移后的诊断不弱于现有 scripts。只读 `gate` 不修改 committed fixture/evidence；生成和证据更新分别通过 `generate`、`evidence` dispatcher，在显式目标和 `--write`/等价确认参数下运行。

备选方案是使用第三方 task runner。当前 Node/TypeScript、pnpm 和 workspace lifecycle 足以实现所需 DAG，新增工具会引入配置语言、安装和升级成本，因此不增加依赖。另一个备选是使用 Rstest projects 作为总编排器；projects 可整合 JavaScript tests，但不能自然表示 Cargo、tarball、构建和真实 macOS evidence 的安全边界，因此 Rstest 保持测试执行器角色。

### 3. 测试、静态检查、Gate 和 Evidence 使用明确分工

- Rstest：TypeScript/TSX 单元、组件、契约、文档/源码策略和无副作用漂移断言；普通 `pnpm run test` 必须自动覆盖它们。
- Package `check`：package-local typecheck、生成物一致性和静态质量，仍由标准 workspace lifecycle 聚合。
- Gate：组合 Rstest 子集或项目、Cargo、构建、pack、consumer、视觉和只读 evidence 校验的 capability acceptance。
- Evidence/Generate：显式运行可能耗时、调用原生应用或更新 committed artifact 的受控工作流；更新后仍必须通过相应只读 Gate。

迁移 standalone `scripts/check-*.ts` 时按行为判断，而不是按文件名机械移动：纯读取并断言仓库状态的检查优先成为 Rstest；需要生成进程、Cargo、构建产物、包安装、浏览器或原生系统服务的阶段保留为 registry command。focused Gate 可以选择必要的 Rstest 文件以提供快速局部证据，但这种选择只存在于 registry，不能成为新的 root script；完整 `pnpm run test` 仍是最终验证的一部分。

### 4. 治理由同一次标准验证自动执行

新增 Rstest policy tests 读取根 manifest、Gate registry、OpenSpec change 目录和维护文档引用，至少验证：允许的根入口、禁止 Change-specific 名称、禁止未批准的长跨层编排、Gate ID/依赖/step 唯一性、DAG 无环、文档引用可解析，以及 active/archive Change 不遗留同名入口。测试位于现有 Rstest include 范围内，不为自身增加 `check:root-script-policy`。

`AGENTS.md` 仅写短而强制的操作规则并链接详细 validation 文档；具体分类、CLI、迁移和排障写入 canonical English docs，并维护 Simplified Chinese mirror。`openspec/config.yaml` 约束未来 proposal/design/tasks：focused validation 必须复用或登记 capability Gate，禁止把 Change ID 写入根 script，归档前必须执行无陈旧入口检查。新增 stable governance spec 让这些规则不依赖 Agent 自觉。

### 5. 迁移是一次性破坏性收敛，不保留兼容别名

实现先生成当前 root scripts、调用点、Gate 依赖和文档/spec 引用的完整清单，再为每个 maintained 验证入口分配稳定 Gate/Generate/Evidence ID 或标准 lifecycle。runner 与 policy tests 就绪后，原子更新 package manifest、GitHub Actions、内部脚本、文档和 delta specs，最后删除旧 `test:*`/`check:*`/Change-specific aliases，并扫描仓库确认没有陈旧命令或双入口。

选择不保留兼容别名是因为别名本身会继续扩大受支持接口，并让 Agent 复制旧示例。变更在同一仓库内完成，所有调用点可被一次迁移；失败时通过版本控制整体回滚本 change，而不是在主分支持两套调度模型。

## Risks / Trade-offs

- **[迁移遗漏某个 CI、文档或低频人工命令]** → 在删除前建立机器可读清单，扫描所有 `pnpm run` 引用，并以 policy test 验证文档 Gate ID 和 manifest 入口。
- **[去重改变依赖原先重复执行的隐式状态]** → 每个 step 必须可重复且不得依赖另一个 Gate 的偶然第二次执行；迁移时比较展开计划和现有命令顺序，必要时拆分有状态阶段为不同 step ID。
- **[单一 runner 成为复杂的新维护点]** → registry 仅提供依赖、顺序命令、环境和安全元数据，不实现通用工作流语言；用 fixtures 覆盖拓扑、去重、失败、循环和未知 ID。
- **[focused Gate 与完整测试的边界被误解]** → docs 和 OpenSpec tasks 明确 focused Gate 只补充、不替代完整 frontend/Rust validation；最终任务继续运行标准 lifecycle 和 Rust 命令。
- **[真实 macOS/浏览器证据被意外并发或写入]** → 默认串行、Gate 只读、Evidence 写入显式化，并保留现有 headless、临时 profile、批准上下文、超时和清理规则。
- **[根脚本 policy 过严，妨碍合法运维入口]** → 允许通过一次受评审的 policy、文档和测试更新增加真正稳定的仓库级入口；禁止的是无设计依据的临时/重复入口，而不是所有扩展。

## Migration Plan

1. 记录现有根 scripts、递归调用图、Rstest/Cargo/构建/evidence 阶段、CI 和 Markdown/spec 引用，建立旧入口到新稳定 ID 的完整映射。
2. 实现类型化 registry、只读 Gate runner、受控 Generate/Evidence dispatcher 及其单元测试，不改变现有调用点。
3. 将纯 TypeScript 策略检查迁入 Rstest，将跨层阶段登记为可去重 steps；比较新旧 Gate 展开计划和覆盖。
4. 更新根 lifecycle/manifest、CI、内部调用点、`AGENTS.md`、`openspec/config.yaml`、English docs、Chinese mirrors 和受影响 stable/delta specs。
5. 删除被替代和 Change-specific scripts，不保留兼容 alias；运行陈旧名称、直接 `rstest` 文件列表、长 shell 编排和文档命令扫描。
6. 运行所有迁移后的 focused Gates、标准 frontend/workspace lifecycle、Rust format/test/check、build、文档镜像检查、严格 OpenSpec 验证和 `git diff --check`。

回滚以整个 change 的版本控制回退为单位；不通过重新引入部分旧 alias 进行运行时回滚，因为这会恢复双路径并破坏 policy 不变量。

## Open Questions

- 无。具体旧脚本到 Gate ID 的映射属于实现清单，但命名必须使用稳定 capability，而不能使用 Change ID；若实现时发现无法归类的命令，应先更新本设计和 specs，而不是直接在根 manifest 增加例外。
