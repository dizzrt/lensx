## Why

当前仓库仍是单一 private 应用 package，现有安装与验证命令只面向根应用，也没有可执行的依赖边界来阻止插件或公共 package 导入 Host 私有实现。后续 Plugin Contract、SDK、官方插件和示例插件都依赖一个稳定且可由 CI 验证的 workspace 基础，因此需要先建立仓库级开发边界，同时保持现有应用行为不变。

## What Changes

- 将仓库声明为 pnpm workspace，纳入 `packages/*`、`plugins/official/*` 与 `examples/plugins/*`，同时保留根 lensX 应用为 private package，且不迁移到 `apps/desktop`。
- 定义根 Host、公共 package、官方插件和示例插件之间的允许依赖方向。
- 禁止插件与公共 package 直接依赖 `src/app/**`、Tauri adapter、Host 内部样式入口或其他根应用私有实现，并提供可在 CI 中运行的边界检查。
- 建立从仓库根部聚合执行 build、typecheck、test 与 check 的 workspace 命令，同时保留根应用现有开发、构建和桌面运行能力。
- 更新英文工程文档及其简体中文镜像，说明 workspace 布局、命令和依赖规则。
- 保持用户可见行为、Manifest wire format、Launcher 行为和 Rust/Tauri 运行时不变。

本 change 不创建或发布 `@lensx/plugin-contract`、Plugin SDK、Plugin UI、Testkit 或 CLI，不实现插件安装、注册、iframe Runtime、Host API、权限或分发，也不迁移现有 Manifest 契约代码；这些能力仍由后续独立 change 交付。

## Capabilities

### New Capabilities

- `plugin-platform-workspace`: 定义插件平台 workspace 的成员边界、依赖方向、根级聚合验证和可执行的越界依赖检查。

### Modified Capabilities

无。

## Impact

- 仓库级 pnpm workspace 配置、根 `package.json` scripts 与 lockfile importer 结构。
- 用于依赖边界检查的仓库脚本、配置、测试或验证 fixture。
- `packages/`、`plugins/official/` 与 `examples/plugins/` 下后续 workspace 成员的接入约定。
- 英文开发/架构文档及对应简体中文镜像。
- CI 和本地完整验证流程；不改变公开产品 API、Manifest Schema、Tauri command 或用户界面。
