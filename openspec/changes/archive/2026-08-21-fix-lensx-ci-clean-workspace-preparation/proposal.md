## Why

当前 `ci-lensx-frontend` 在 clean checkout 中先由 `ci-lensx-typecheck` 构建 `@lensx/plugin-cli`，之后才由 `ci-lensx-test` 构建其 workspace 依赖 `@lensx/plugin-contract`。由于公共包导出指向未提交的 `dist`，CI 会在 Contract 输出缺失时失败，而已有本地 `dist` 会掩盖这一编排缺陷；因此需要让 LensX frontend CI 自身具备完整、可复现的 workspace 依赖准备。

## What Changes

- 让 `ci-lensx-typecheck` 在任何 workspace consumer 构建或类型检查前，按传递依赖拓扑准备其所需公共 package 输出。
- 复用现有 workspace member 发现、依赖闭包与拓扑排序能力，并让完整 `ci-lensx-frontend` Gate plan 对共享构建步骤保持去重。
- 增加完整 frontend Gate 顺序的 Rstest 回归断言，覆盖 `@lensx/plugin-contract` 必须早于 `@lensx/plugin-cli`，而不仅检查后续 `ci-lensx-test` 子计划。
- 把 LensX CI 的 clean-checkout 依赖准备补入稳定 CI 要求及中英文维护文档。
- 保持两个现有只读 macOS workflow、现有 Gate ID 与根命令接口不变。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `repository-continuous-integration`: LensX frontend CI 必须在没有预生成 workspace `dist` 的 clean checkout 中，按传递依赖顺序准备公共 package 输出后再运行消费者。

## Impact

- 主要影响 `scripts/validation/catalog.ts` 中 LensX frontend Gate 的构建准备，以及相关 validation/workspace lifecycle Rstest。
- 更新 `openspec/specs/repository-continuous-integration/spec.md` 的要求，并同步 `docs/en/development/continuous-integration.md`、`docs/en/development/validation.md` 及对应 `docs/zh` 镜像。
- 不改变产品功能、Plugin 公共 API、package manifest、依赖版本、Rust/Tauri 行为、workflow 权限或 runner 选择。
- 不新增 workflow、root `package.json` script、Change-specific alias、源码 path alias或提交 `dist` 产物。
