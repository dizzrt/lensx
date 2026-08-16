## Why

当前 `pnpm run dev:plugin-development-mode` 只编译并暴露插件开发能力，开发者仍需进入设置手动开启模式、逐个选择 `dist/` 注册，重复启动成本较高。同时，仓库内所有产品插件都是官方插件，`plugins/official/*` 的额外目录层级已经不再提供有效分类价值，并阻碍以统一 `plugins/*/dist` 约定发现开发构建。

## What Changes

- 将执行专用 `pnpm run dev:plugin-development-mode` 视为当前进程的显式开发 opt-in：原生 Host 在启动时真实启用插件开发模式，使设置中的开关直接显示为开启；普通开发启动和生产构建仍不具备该能力。
- 为专用开发启动增加仓库插件发现：默认检查直接成员 `plugins/*/dist`，并允许通过可选插件根目录参数覆盖默认 `plugins/`；缺少 `dist/` 的成员视为尚未构建并忽略。
- 让 Host 对发现的候选继续执行现有安全目录检查、不可变快照和 process-local `development` 注册；无效、不兼容、读取变化或内容不完整的候选被跳过并产生稳定终端诊断，只有候选之间或候选与现有 Registration 的插件 ID 冲突会阻断开发 bootstrap。Host 或 Plugin Manager 无法初始化仍作为系统错误报告。
- 保留设置中的手动注册、reload、remove 和 disable 操作。启动 bootstrap 不自动打开插件 Page、不创建 Runtime、不增加 `--open`、不监听文件、不自动构建且不自动 reload；用户仍从 Launcher 选择要调试的插件。
- **BREAKING**：将官方插件 workspace 从 `plugins/official/*` 扁平化为 `plugins/*`，把 ConfigLens 从 `plugins/official/config-lens` 迁移到 `plugins/config-lens`，并同步 workspace、发布发现、Changeset 路径选择、CODEOWNERS、CI、边界检查、harness、lockfile、测试和双语文档。
- 继续把每个直接 `plugins/<slug>` 成员视为独立官方发布单元；目录位置、官方 Publisher 或发布 sidecar 不授予额外 Host 信任、权限、签名结论、Runtime 能力或私有源码访问。

目标是让仓库插件开发进程启动后即可在 Launcher 中使用已构建的有效插件，同时简化官方插件目录拓扑。非目标包括自动打开插件页面、开发版本遮蔽同 ID 已安装插件、持久化开发注册、自动安装、watch/HMR、自动构建、自动 reload、签名、Marketplace 或改变生产 Runtime/Session/Host API 边界。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `plugin-development-mode`：允许专用开发启动作为显式 per-process opt-in，定义默认批量发现、候选跳过、ID 冲突阻断和不自动打开 Page 的启动语义。
- `plugin-platform-workspace`：将官方插件 workspace 成员模式从 `plugins/official/*` 改为直接的 `plugins/*`，同时保持现有公共依赖和 Host 隔离边界。
- `official-plugin-release-pipeline`：将官方发布单元发现、路径选择、CODEOWNERS 和流水线触发契约迁移到 `plugins/<slug>`。
- `official-config-lens-plugin`：将 ConfigLens 的规范化源码位置迁移到 `plugins/config-lens`，不改变其产品、发布或 Host 权限边界。

## Impact

- 原生层：插件开发模式启动配置、候选发现/预检/快照协调、Plugin Manager ID 唯一性检查、稳定终端诊断和 production feature gating。
- 前端层：开发模式 capability 初始化、设置 Switch 的启动状态和双语说明；Launcher 导航与插件 Page 打开流程保持用户触发。
- 仓库布局：`plugins/official/config-lens` 整体迁移到 `plugins/config-lens`，并更新 pnpm workspace、lockfile、workspace lifecycle/boundary checks、官方发布脚本、Changesets 选择、CODEOWNERS、GitHub workflows、ConfigLens harness 与测试 fixtures。
- 规范与文档：更新四项稳定能力对应的 delta spec，并在实现阶段同步 canonical English 文档及其 Simplified Chinese 镜像；归档 OpenSpec 工件保持历史原貌。
- 验证：扩展插件开发模式、workspace、官方发布和 ConfigLens focused gates，并继续证明普通/生产构建不包含开发入口，开发插件仍使用生产 Child WebView、Resource、Session、RPC、Host API 和 teardown 路径。
