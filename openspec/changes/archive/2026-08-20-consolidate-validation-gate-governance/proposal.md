## Why

根 `package.json` 已从少量稳定生命周期入口增长为由大量 `test:*`、`check:*`、生成、证据和历史 OpenSpec Change 验收命令组成的隐式任务图；同一 Rstest、Cargo、构建和打包阶段被多处重复枚举，归档后的 Change-specific focused gate 也继续占用长期脚本接口。现在需要把测试执行与跨层验收编排分离，并用文档、OpenSpec 规则和自动化策略共同约束后续 Agent，避免根 manifest 继续无边界膨胀。

## What Changes

- **目标**：把根 package scripts 收敛为少量、稳定、仓库级入口；为跨 Rstest、Cargo、构建、打包、视觉和 macOS 原生证据的 focused validation 建立单一、可发现、可组合且可去重的 Gate registry。
- **目标**：将可以表达为 TypeScript/TSX 断言的源码、文档、策略和漂移检查迁入 Rstest 自动发现范围，保留 Cargo 和有副作用的构建/打包/真实证据阶段在 Gate runner 中编排。
- **目标**：更新 `AGENTS.md`、`openspec/config.yaml`、canonical English engineering documentation、Simplified Chinese mirrors 和受影响的 stable specs，明确 Agent 不得为单个测试、能力切片或 OpenSpec Change 随意新增根 `test:*`、`check:*` 等脚本。
- **目标**：增加由标准验证自动执行的 root-script policy 和 Gate graph 回归，拒绝未登记的根入口、Change-specific 脚本、长串跨层 shell 编排、无效文档引用、重复/循环 Gate 依赖和遗漏的归档清理。
- **BREAKING**：移除现有 Change-specific、纯测试子集别名和被 Gate registry 取代的根 scripts；将 maintained focused validation、CI、文档和 stable specs 原子迁移到统一 Gate CLI，不保留长期双入口或兼容别名。
- **非目标**：不改变产品 Runtime、Host/native 权限、插件公共 API、测试语义或验证强度；不把 Cargo、打包、浏览器或 macOS 真实证据强行塞进 Rstest；不以跳过、弱化或删除验收覆盖来换取脚本数量下降。

## Capabilities

### New Capabilities

- `validation-gate-governance`: 定义稳定根命令、Rstest 与跨层 Gate 的职责边界、声明式 Gate registry、去重执行、文档/Agent/OpenSpec 治理、归档清理和自动防回归要求。

### Modified Capabilities

- `plugin-platform-workspace`: 将根 workspace lifecycle 约束扩展为受治理的根 script surface，并要求标准 lifecycle、成员 package scripts 与统一 Gate runner 分工明确且保持完整覆盖。
- `plugin-rpc-validation`: 将硬编码的 `pnpm run check:plugin-rpc-validation` focused gate 入口迁移为稳定的 registry Gate 标识，同时保持现有 RPC 验证范围和强度。

## Impact

- 受影响的实现主要包括根 `package.json`、现有 `scripts/check-*`/evidence 编排、workspace lifecycle、Rstest 测试、CI 调用点和新的 Gate registry/runner。
- `AGENTS.md` 与 `openspec/config.yaml` 将增加面向后续 Agent 和 Change 生命周期的强制治理规则；具体架构与命令写入 `docs/en/development/validation.md`、`docs/en/development/plugin-workspace.md` 及其 `docs/zh/` 镜像。
- 所有 maintained focused-gate 文档引用和受影响 stable specs 必须与命令迁移同步，不能留下失效命令或双路径。
- 不新增产品运行时依赖；若 Gate runner 需要辅助实现，应优先使用现有 Node/TypeScript、pnpm、Rstest 和 Cargo 工具链。
