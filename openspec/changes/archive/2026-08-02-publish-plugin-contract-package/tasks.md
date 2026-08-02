## 1. 建立公共 Package 骨架与版本基线

- [x] 1.1 创建 `packages/plugin-contract` public workspace member，声明 `@lensx/plugin-contract@0.1.0`、ESM、受限 `exports`/`files`、发布 metadata 以及真实 `build`、`typecheck`、`test`、`check` scripts。
- [x] 1.2 使用现有 TypeScript/Node/Rstest 工具链建立 ES2022 JavaScript、`.d.ts` 与 Schema 复制构建，确保 package 自己声明 `ajv` 等直接运行时依赖和所需开发依赖，不引入 React、Semi Design、Tauri 或新 bundler。
- [x] 1.3 将根 private `lensx` package version 对齐为 `0.1.0`，声明对 `@lensx/plugin-contract` 的 `workspace:*` 依赖，并使用仓库声明的 pnpm 版本更新 lockfile，确认无关依赖没有升级。
- [x] 1.4 扩展 workspace lifecycle 与 boundary fixtures，证明真实 Contract member 的四个 scripts 会被根命令覆盖，允许 Host 通过 public export 消费，同时拒绝成员深层源码导入和 Contract 对 Host 私有代码的反向依赖。

## 2. 迁移 Schema、类型与纯 TypeScript 契约

- [x] 2.1 将 Draft 2020-12 Manifest Schema 迁入 Contract package，设置唯一 `manifest_version: "0.1.0"`、对应 versioned Schema identity，并保持所有现有结构、安全路径和未知字段约束。
- [x] 2.2 将类型生成脚本和已提交生成输出迁入 package，生成无 `V0` 后缀的 `PluginManifestInput`，提供确定性 generate/check 命令，并验证缺失或过期输出会使 drift gate 失败。
- [x] 2.3 将 normalized Manifest、compatibility、Host versions、diagnostic/result 类型和文本解析 helper 迁入公共根入口，导出 `PLUGIN_MANIFEST_VERSION` 与 `PLUGIN_HOST_API_VERSION` 且二者均为 `0.1.0`，不保留旧 symbol alias 或 deprecated export。
- [x] 2.4 将现有纯 TypeScript 实现重构为公开的两阶段 `validatePluginManifest` 与 `normalizePluginManifest`：前者接受 `unknown` 并返回可判别校验结果，后者仅接受成功结果与当前版本，保持输入不可变、确定性 defaults/trim、逐维兼容性和稳定 diagnostics。
- [x] 2.5 为两阶段 API 增加 package tests，覆盖合法/非法输入、普通对象或伪造结果不能绕过 normalize、输入不被修改、diagnostic path/code 排序、兼容与不兼容范围以及无 Host/DOM/Node/Tauri 私有依赖。
- [x] 2.6 将 valid、invalid、normalized 与 incompatible fixtures 迁入 package-owned 测试资产，全部使用从 `0.1.0` 开始的 Manifest/Host API 基线和普通 SemVer 边界案例，并确保 fixtures 不进入发布文件清单。

## 3. 迁移 Host、Rust 与共享门禁消费者

- [x] 3.1 将根 Host 和前端 Manifest boundary tests 改为只从 `@lensx/plugin-contract` public exports 导入，删除 `src/app/plugins/manifest/**` 中已迁移的重复类型、实现、生成输出和兼容转发层。
- [x] 3.2 调整 Host 调用编排以依次执行 validate/normalize，并增加回归测试证明 invalid、compatible、incompatible、locale fallback 和 Launcher descriptor boundary 行为保持一致。
- [x] 3.3 更新 Rust validator 的 Schema/fixture 路径与当前 LensX/Host API `0.1.0` 基线，保持 Rust 显式模型、语义校验、normalized output 和稳定 diagnostics，不引入 JavaScript Runtime 依赖。
- [x] 3.4 重建 TypeScript/Rust shared fixture gate，逐类断言 validity、compatibility、normalized JSON 与 diagnostic code/path 一致，并让任一端 drift 导致 canonical contract check 非零退出。

## 4. 验证发布产物与仓库外消费

- [x] 4.1 实现 package contents/exports 测试，检查 tarball 只包含运行代码、声明文件、两个 Schema 公共入口和必要 metadata，不包含 Host 私有源码、测试、fixtures 或生成脚本。
- [x] 4.2 建立只依赖 `@lensx/plugin-contract` 公共入口的最小插件 Contract 消费示例，使用真实 tarball 在隔离于 workspace 源码解析的临时消费者中完成安装或解析、TypeScript typecheck，以及版本、Schema、validate/normalize 的最小运行时调用。
- [x] 4.3 更新根 `check:plugin-contract` 和适用 scripts，使其编排 package drift/tests、Host boundary、tarball consumer 与 Rust fixtures，同时避免与 package lifecycle 递归或重复执行。
- [x] 4.4 增加发布配置回归测试，证明 package 依赖不含 `workspace:*` 发布泄漏、未声明 deep import 不可解析、缺失声明/Schema/运行入口或未声明运行时依赖都会使验证失败。

## 5. 更新维护文档与 Roadmap

- [x] 5.1 更新 canonical 英文架构/开发文档，说明 Contract package 公共入口、两阶段 API、四个独立版本维度、Schema/type generation、shared fixtures、tarball 验证和明确未实现的 Runtime 能力。
- [x] 5.2 更新 `docs/zh/` 相同相对路径的简体中文镜像和双语索引，验证文件布局、标题、命令、API 名称及版本策略语义一致。
- [x] 5.3 更新 `plugin-roadmap.md` 当前基线、Task 1.2 交付描述和后续消费者依赖，确保当前源码、Schema、stable specs、fixtures、示例、测试、Roadmap 与维护文档只描述从 `0.1.0` 开始的版本历史，并保持 OpenSpec archive 原貌。

## 6. 最终验证

- [x] 6.1 运行 `pnpm install --frozen-lockfile`、Schema/type generation drift check、package-focused tests、workspace boundary tests、canonical `pnpm run check:plugin-contract` 和真实 tarball external-consumer smoke test。
- [x] 6.2 运行完整前端/workspace `pnpm run test`、`pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`，确认根 Host 与每个实际 workspace member 全部通过且没有循环或静默跳过。
- [x] 6.3 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，确认 Rust Schema/fixture 迁移、`0.1.0` 兼容性判断和 Tauri workspace 无回归。
- [x] 6.4 验证英文/中文文档相对路径与索引镜像、当前内容版本策略、package tarball 文件清单，并运行 `openspec validate publish-plugin-contract-package --type change`。
- [x] 6.5 修复本 change 引入的每个 warning 或 error，重新运行失败命令以及 6.1 至 6.4 的完整验证集；全部成功后勾选 Roadmap Task 1.2，并再次运行文档/版本检查和 OpenSpec change validation。
