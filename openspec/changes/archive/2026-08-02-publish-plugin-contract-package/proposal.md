## Why

当前 Plugin Manifest Schema、生成类型和纯 TypeScript 校验/规范化实现仍位于 private Host 应用内部，仓库内外的插件作者、后续 CLI 与 Testkit 无法通过稳定公共入口消费与 Host 完全一致的契约。Task 1.1 已建立 workspace 与依赖护栏，现在需要在首次公开前统一从 `0.1.0` 起步的版本体系，并交付可独立构建、打包和验证的 `@lensx/plugin-contract`。

## What Changes

- 新建 public workspace package `@lensx/plugin-contract`，公开 JSON Schema、Schema 生成的 author-input 类型、Manifest/Host API 版本常量、规范化类型、兼容性结果和稳定诊断结构。
- 公开不依赖 React、Semi Design、Tauri、文件系统或 Host 私有状态的纯 TypeScript `validatePluginManifest` 与 `normalizePluginManifest` API，并要求规范化不能绕过校验。
- 让 private Host 应用通过 package exports 消费 TypeScript 契约；让 Rust validator、共享 fixtures、示例以及后续 CLI/Testkit 继续以同一 Schema 和契约输入为事实源。
- 定义有限的 package exports、打包内容、SemVer 与 breaking-change 策略，并使用真实 pack 产物验证仓库外消费者只依赖已打包 package 即可完成类型检查和契约调用。
- **BREAKING** 将 Manifest wire protocol 硬切换为 `0.1.0`，不接受任何更早的实验值，不提供兼容 Schema、deprecated symbol alias、转换器或迁移分支。
- **BREAKING** 将当前 Host API 协议基线设为 `0.1.0`；当前契约、兼容性 fixtures 和文档不保留任何更早实验版本的兼容范围或历史概念。
- **BREAKING** 将首次公开的 TypeScript API 使用不带 `V0` 的稳定领域名称，例如 `PluginManifestInput`、`NormalizedPluginManifest`、`validatePluginManifest` 与 `normalizePluginManifest`，不导出旧名称别名。
- 将根 private `lensx` package 版本从 `1.0.0` 对齐为 `0.1.0`，与当前 Tauri 应用和插件平台起始版本保持一致，但保持各版本维度后续独立演进。
- 更新稳定规格、Roadmap 当前基线、英文工程/架构文档及简体中文镜像，并要求除不可改写的 OpenSpec archive 外，当前生效内容只描述从 `0.1.0` 开始的版本历史。
- 本 change 不实现插件发现、安装、注册、iframe Runtime、Host API 方法、权限授权、SDK、UI、Testkit、CLI 或 npm registry 发布操作。

## Capabilities

### New Capabilities

- `plugin-contract-package`: 定义可发布的公共 Contract package、公共 exports、纯 TypeScript 校验/规范化 API、版本策略、打包消费验证和契约 drift gate。

### Modified Capabilities

- `plugin-manifest-contract`: 将 Manifest 与 Host API 契约基线统一为 `0.1.0`，硬切换现有 wire contract 和公共类型命名，并维持跨 TypeScript/Rust 的确定性校验、规范化与兼容性分类。

## Impact

- 新增 `packages/plugin-contract` workspace member、构建产物、package metadata、公共 exports、package-local tests 和外部消费者验证 fixture。
- Manifest Schema、生成脚本与生成类型、TypeScript validator/normalizer、Host imports、Rust Schema/fixture 路径以及现有共享 fixtures 将迁移或调整所有权。
- 根 `package.json` 版本、scripts、依赖归属和 lockfile workspace importer 会变化；`ajv` 等契约运行时依赖必须归属于公共 package，而不是通过根应用隐式获得。
- 任何不等于 `0.1.0` 的早期实验 Manifest 输入将不再有效；当前 Host API 兼容判断从 `0.1.0` 开始，不提供旧版本兼容。
- 英文稳定规格和 canonical 文档、对应简体中文镜像及 `plugin-roadmap.md` 当前状态需要同步；历史 archive 保持原貌。
