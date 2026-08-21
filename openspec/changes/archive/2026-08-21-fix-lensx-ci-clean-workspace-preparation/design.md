## Context

`ci-lensx-frontend` 由 `ci-lensx-check → ci-lensx-typecheck → ci-lensx-test → ci-lensx-build` 组成。当前 `ci-lensx-typecheck` 从迁移基线展开出 `plugin-cli` build，但没有同时展开它对 `plugin-contract` 的 workspace 构建依赖；正确的传递依赖准备只被加在后续 `ci-lensx-test` 上。clean checkout 没有被忽略且未提交的 `dist`，因此 CLI 在 Contract 公共 exports 尚不存在时失败，本地残留输出则会形成假通过。

仓库已有 `discoverWorkspaceMembers`、`selectWorkspaceBuildOrder`、typed Gate step intern/de-duplication 和稳定 `ci-lensx-frontend` 入口。本变更应修正这些现有边界的组合方式，而不是在 workflow、package build script 或 TypeScript path mapping 中建立第二条路径。

## Goals / Non-Goals

**Goals:**

- 让 `ci-lensx-frontend` 在没有任何预生成 workspace `dist` 时可复现执行。
- 保证每个 CI build consumer 都晚于其传递 workspace 依赖，并在一次 Gate plan 中去重共享构建步骤。
- 让 Rstest 直接覆盖完整 frontend plan 的关键相对顺序，防止只验证较晚子 Gate 的漏检再次发生。
- 保持 CI workflow 与本地文档使用完全相同的稳定 Gate 入口。

**Non-Goals:**

- 不改变业务代码、Plugin Contract/CLI 公共 API、package 依赖或构建产物格式。
- 不新增或改名 workflow、Gate、root lifecycle、root script 或 Change-specific alias。
- 不通过提交 `dist`、源码 path alias、移除 `--ignore-scripts` 或递归 package build 绕过 workspace 拓扑。
- 不扩展浏览器、真实 WebView、GUI、native harness、视觉或环境 evidence 验证。
- 不改写历史 archive、迁移基线或过去的完成记录。

## Decisions

### 1. 在 Gate registry 中统一声明 workspace build preparation

从现有 `ci-lensx-test` 逻辑提取一个 registry-local preparation helper。它接收目标 Gate、目标 workspace 路径和可选的 step 环境前缀，使用 `discoverWorkspaceMembers` 解析成员、验证目标完整性，并通过 `selectWorkspaceBuildOrder` 得到包含传递依赖的稳定拓扑顺序。

该 helper 同时服务：

- `ci-lensx-typecheck`：以 `packages/plugin-cli` 为目标，生成 `plugin-contract → plugin-cli`；
- `ci-lensx-test`：保留当前 CLI、framework-neutral、react-semi 目标及模板专用环境标记，生成完整传递依赖闭包。

选择 registry 而不是 workflow，是因为本地与 GitHub 必须调用相同的可复现 Gate。选择 registry helper 而不是在 `plugin-cli` build 中递归构建 Contract，是为了保持 package build 只负责自身输出，避免标准 workspace lifecycle 重复执行依赖。

### 2. 利用现有 step identity 去重，而不是维护第二套执行状态

preparation helper 将拓扑步骤前置到目标 Gate。相同命令通过 `internStep` 获得相同 step ID，Gate 自身与完整 DAG 的既有去重规则保证 Contract 和 CLI 在一次 `ci-lensx-frontend` invocation 中只执行一次。模板 build 继续携带阶段环境，使确实具有不同产物语义的步骤不会被错误合并。

不修改 `migration-baseline.json`：它是迁移前根命令的历史清单，不是当前正确顺序的配置源。registry overlay 负责把历史命令安全地映射为当前 Gate DAG。

### 3. 回归测试验证依赖不变量与完整入口

保留 `ci-lensx-test` 的现有精确计划断言，并增加：

- `ci-lensx-typecheck` 的 Contract-before-CLI 断言；
- 完整 `ci-lensx-frontend` plan 中 Contract 早于 CLI，且共享 Contract/CLI build 各出现一次；
- workspace closure 对缺失目标和循环继续 fail closed。

相对顺序与出现次数是长期不变量；测试不应把无关 formatter、test 或 build step 的完整位置固化为新的脆弱契约。最终验收还必须在由当前提交导出的临时 clean checkout 中执行真实 frontend Gate，不能依赖主工作区已有 `dist`。

### 4. 稳定规格与双语文档明确 LensX clean-checkout 边界

在 `repository-continuous-integration` capability 增加 LensX frontend workspace dependency preparation requirement。英文文档说明 LensX Gate 与 Plugins CI 一样不信任预生成 `dist`，并由 Gate registry 而非 workflow YAML 推导顺序；中文镜像保持语义一致。

`validation-gate-governance` 已要求确定性 DAG、共享 step 去重和可定位失败，本变更不改变该能力的规范语义。

## Risks / Trade-offs

- [preparation helper 被不同 Gate 以不一致参数调用] → 集中目标解析和缺失目标校验，并用每个 Gate 的计划断言锁定关键依赖顺序。
- [全 DAG 去重错误复用本应重建的产物] → 只有命令、cwd、环境、平台与 safety 完全相同的 step 才共享 ID；阶段敏感模板 build 保留独立环境标记。
- [本地残留 `dist` 继续掩盖未来问题] → 最终验证使用提交导出的临时目录、`--ignore-scripts` 安装和完整 `ci-lensx-frontend`，同时保留纯计划回归测试。
- [精确计划测试因无关步骤调整而频繁变化] → 新测试以相对顺序、依赖闭包和唯一出现次数为主，不复制完整 frontend step 列表。
- [CI 时间因依赖准备增加] → Contract 本来已在后续 test preparation 中构建；step 去重只会把它提前，不会在同一 invocation 中增加重复构建。

## Migration Plan

1. 先增加 frontend/typecheck Gate plan 的失败回归断言，证明当前顺序不满足 clean-checkout 不变量。
2. 提取并应用通用 workspace build preparation，使 Contract 在 CLI 前构建并保持共享步骤去重。
3. 更新稳定 CI delta requirement、英文 CI/validation 文档及对应中文镜像。
4. 运行聚焦 Rstest、完整 `ci-lensx-frontend`、完整 `ci-lensx` 与标准 frontend/workspace/Rust 验证。
5. 从当前提交导出临时 clean checkout，在没有预生成 `dist` 的条件下安装依赖并执行完整 frontend Gate，然后运行 strict OpenSpec 和 diff 检查。

回滚只需整体还原 registry、测试、文档与规格修改；没有数据迁移、公共 API 迁移或外部状态变更。不得用 workflow 预构建或提交 `dist` 作为部分回滚后的兼容路径。

## Open Questions

无。失败链路、最小因果验证和现有 workspace 拓扑能力均已确认。
