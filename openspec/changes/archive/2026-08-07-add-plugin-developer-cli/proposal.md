## Why

lensX 已经具备公共 Contract、SDK、Testkit、两类正式项目模板、canonical `.lxp` 包格式以及 Host 安装校验，但仓库外开发者仍没有公共入口来创建、构建、验证、检查和打包插件，只能依赖仓库脚本或不可导入的 Host 私有工具。现在需要把这些既有边界组合成稳定、可重复且适合本地与 CI 使用的开发者工作流，同时保证 CLI 预检与桌面 Host 对同一产物不会给出相互矛盾的结论。

## What Changes

- 新增公共 `@lensx/plugin-cli` package，提供 `create`、`build`、`validate`、`pack` 和 `inspect` 命令，并先支持 workspace 内消费，再通过独立打包与外部消费者验证证明可发布边界。
- 以 Task 6.3 的 framework-neutral 与 React/Semi 模板作为 `create` 的受维护来源，使生成项目不依赖 lensX 仓库、根 `node_modules` 或 Host 私有源码。
- 建立可复用的包格式纯核心边界，让 CLI 使用现有 Contract 与 canonical package-format 规则；CLI 不导入 Host installer、Tauri 或 Rust 私有实现，也不产生第二套 `.lxp` 判断标准。
- 为交互终端提供简洁的人类可读输出，并为 CI 提供版本化、确定性的 JSON 输出、稳定退出码和不泄露本机路径或原始异常的诊断。
- 让 `build` 通过受约束的项目生命周期契约产生自包含 payload；让 `validate` 在不执行构建脚本的情况下检查项目、Manifest 和已有构建产物；让 `pack` 默认组合 build、validate 与 canonical packaging，生成 checksums、构建摘要和可复现 `.lxp`；让 `inspect` 对已有 `.lxp` 在不安装或执行插件的前提下报告三态兼容性和安全事实。
- 增加 Contract、模板、包格式、CLI 单元/集成、确定性打包、TypeScript/Rust 一致性、tarball 外部消费和端到端 CLI 验证，并更新 English canonical 文档及对应简体中文镜像。
- 明确不包含 Development Mode、自动 reload、插件安装或授权、签名与 provenance、发布流水线以及绕过 Host 安装时复验。

## Capabilities

### New Capabilities

- `plugin-developer-cli`: 定义公共插件 CLI 的命令面、项目发现与构建边界、确定性验证和打包、只读包检查、人类/机器诊断、外部消费及与 Host 校验一致性。

### Modified Capabilities

- 无。现有 `plugin-project-template`、`plugin-contract-package` 与 `plugin-package-format` 的规范要求保持不变，由新 capability 组合消费。

## Impact

- 新增 `packages/plugin-cli` workspace member、公共 bin/exports、独立 package 构建与 tarball consumer gate。
- 需要重构当前 `tools/plugin-package-format` 的纯 TypeScript codec/inspection 能力，使 CLI 可以通过批准的公共边界复用，而 Host 私有安装、持久化、来源与生命周期逻辑继续留在 Rust/Tauri 边界内。
- 会触及根 workspace lifecycle、workspace boundary 检查、模板生成/外部消费 fixture、CLI 测试和 package-format 跨语言一致性验证。
- 增加 CLI 及包格式相关开发依赖时必须锁定版本、记录用途并通过许可证、体积、跨平台与维护性审查；不引入新的 UI 组件库。
- 更新 `docs/en` 中的插件 workspace、项目模板、包格式与 CLI 使用说明，并维护 `docs/zh` 同路径镜像及双语索引。
