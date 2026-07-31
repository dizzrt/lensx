## 1. Schema 与共享契约基础

- [x] 1.1 新增 Draft 2020-12 插件 Manifest `1.0.0-dev` JSON Schema，严格定义顶层身份、展示、Publisher、兼容范围、iframe Runtime、权限请求、Page、Page-only Action、Launcher 默认 Action 和 asset 引用，并对所有对象启用未知字段拒绝。
- [x] 1.2 在 Schema 中落实必填项、可选集合、`en-US`/`zh-CN` 本地化、SemVer 基础格式、本地 ID、HTTPS Publisher URL、包内资源路径、插件内部 route 以及 `target.kind = page` 的结构约束。
- [x] 1.3 新增项目自有的完整 Manifest 示例，并确保它只使用 Page Target、Action `default_keywords` 以及包含 `author`、`homepage`、`repository` 的 Publisher。
- [x] 1.4 建立共享的 valid、invalid、normalized 和 incompatible fixture 集合，覆盖未知字段、显式 `null`、Host-owned 字段、无效 ID/URL/path/route、Page 引用与循环、权限子集、Action Target、关键词、默认 Action 和 SemVer 边界。

## 2. TypeScript 作者输入与校验边界

- [x] 2.1 增加从 JSON Schema 生成 TypeScript 作者输入类型的脚本与产物，并提供不改文件的 drift check；仅在现有工具无法满足时增加最小且有说明的开发依赖。
- [x] 2.2 定义与作者输入分离的 `NormalizedPluginManifestV0`、兼容性分类和稳定 `{code, path, message}` 诊断/结果类型，保持所有跨边界数据可序列化。
- [x] 2.3 使用现有 Ajv 完成严格 Schema 校验，并把结构错误映射成确定性 JSON Pointer 诊断；未知字段与显式 `null` 必须保持拒绝。
- [x] 2.4 实现字符串与缺失集合规范化、Plugin/Page/Action/Permission ID 校验、Publisher URL、资源路径和 Page route 语义校验，且不得就地修改作者输入。
- [x] 2.5 实现 Page 唯一性、父级引用和无环校验，Action 到 Page、Launcher 默认 Action以及 Page required permissions 到 requested permissions 的跨字段引用校验。
- [x] 2.6 实现 LensX 与 Host API 的 SemVer 半开区间兼容性判定，使结构有效但超出范围的 Manifest 返回 `incompatible` 而不是 `invalid`。
- [x] 2.7 添加 TypeScript 单元测试，逐项验证共享 fixtures、诊断 path/code 排序、本地化回退、Action 关键词归属、缺失集合规范化、输入隔离和兼容性边界。

## 3. Rust Manifest 契约

- [x] 3.1 在 Rust 中增加作者输入、规范化 Manifest、兼容性状态和诊断模型，并为未知字段、可选字段和序列化命名建立与 Schema 一致的 serde 边界；仅增加实现 SemVer/Schema 校验所必需的最小依赖。
- [x] 3.2 实现 Rust 结构与语义校验、确定性规范化、Page 图/跨字段引用检查、包内路径与 Publisher URL 约束以及 `{code, path, message}` 诊断排序。
- [x] 3.3 实现 Rust 的 LensX/Host API SemVer 半开区间判定，并保持 `invalid`、`compatible` 和 `incompatible` 分类与 TypeScript 一致。
- [x] 3.4 添加 Rust 测试读取同一共享 fixtures，核对分类、规范化结果和诊断 code/path，并覆盖显式 `null`、未知 Host 状态、Page-only Target 与预发布 SemVer。

## 4. 契约门禁与边界保护

- [x] 4.1 新增 `check:plugin-contract` 项目命令，依次验证 Schema/生成类型 drift、TypeScript fixtures 和 Rust fixtures，使跨语言契约漂移能够由一个命令失败。
- [x] 4.2 添加边界测试，确认完成本 change 后不会创建 iframe、不会发现或注册外部插件、不会向当前 Launcher Action Registry 注入插件 Action，也不会改变现有 App Shell。
- [x] 4.3 检查 Manifest、规范化类型和公开诊断中不存在 executor、函数、React/Tauri/Rust 内部对象，以及 `source`、`lifecycle`、`enabled`、已授予权限等 Host-owned 字段。

## 5. 架构文档

- [x] 5.1 更新英文 `docs/en/architecture/extension-platform.md`，记录已实现的 Manifest 静态契约、完整字段模型、Page-only Action Target、Action 关键词语义、Publisher 非可信属性、兼容性与 Host 状态分层，并继续把安装、Runtime、权限授予、Action 投影和搜索标记为未实现。
- [x] 5.2 同步更新 `docs/zh/architecture/extension-platform.md`，保持标题、示例、边界和实现状态与英文文档语义一致。
- [x] 5.3 检查英文与简体中文文档的术语、相对链接和实现状态一致，确认没有在 README、Agent 指南或稳定文档中引用临时材料。

## 6. 最终验证

- [x] 6.1 运行 `pnpm run check:plugin-contract`，修复 Schema、生成类型、共享 fixture 或跨语言分类/诊断不一致，并重新运行直到通过。
- [x] 6.2 运行前端测试 `pnpm run test`，修复本 change 引入的全部错误与警告并重新运行。
- [x] 6.3 运行前端格式和静态检查 `pnpm run check`，修复本 change 引入的全部错误与警告并重新运行。
- [x] 6.4 运行前端类型检查 `pnpm run typecheck` 与构建 `pnpm run build`，修复本 change 引入的全部错误与警告并重新运行。
- [x] 6.5 运行 Rust 格式检查 `pnpm run src-tauri:format:check`，必要时执行 `pnpm run src-tauri:format` 后重新检查。
- [x] 6.6 运行 Rust 测试 `pnpm run src-tauri:test` 与静态检查 `pnpm run src-tauri:check`，修复本 change 引入的全部错误与警告并重新运行。
- [x] 6.7 重新运行 `pnpm run check:plugin-contract`、全部前端与 Rust 最终验证命令，并执行严格 OpenSpec change 校验；确认所有任务、文档镜像和范围边界满足后再报告实施完成。
