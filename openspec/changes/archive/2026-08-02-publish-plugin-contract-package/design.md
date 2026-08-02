## Context

Task 1.1 已把根 `lensx` 应用保留为 private workspace root，并建立 `packages/*`、`plugins/official/*` 与 `examples/plugins/*` 的成员拓扑、聚合生命周期命令和依赖边界。当前尚无真实公共 package；Manifest Schema、生成 TypeScript 类型、纯 TypeScript 校验/规范化实现和共享 fixtures 仍分别位于根目录与 Host 私有源码中，Rust validator 通过根级路径读取相同 Schema 和 fixtures。

本 change 是插件平台第一个公共 package 边界。它需要同时服务仓库外插件作者、根 Host、未来 CLI/Testkit 和 Rust 一致性门禁，因此公共 API、打包内容、版本语义和事实源必须在首次发布前确定。当前不存在已安装的外部插件或已发布的 Contract package，版本可以直接从 `0.1.0` 建立，不需要数据迁移或旧协议兼容。

## Goals / Non-Goals

**Goals:**

- 建立可独立构建、测试、打包和消费的 `@lensx/plugin-contract` public workspace package。
- 让 JSON Schema、生成 author-input 类型、公共 TypeScript 类型、纯校验/规范化逻辑和共享 fixtures 具有明确的单一所有权。
- 公开安全、确定性、无 Host/React/Tauri 依赖的 `validatePluginManifest` 与 `normalizePluginManifest`。
- 让 Manifest、Host API、Contract package 和根 private package 从 `0.1.0` 建立清晰但彼此独立的版本维度。
- 通过 Host 消费、TypeScript/Rust 共享 fixture 和真实 pack 产物的外部消费者验证阻止契约 drift。
- 保持现有 Manifest 字段、Page-only Action、安全路径、权限引用、规范化默认值与兼容性分类语义，版本与公共所有权调整除外。

**Non-Goals:**

- 不实现插件发现、安装、注册、升级、卸载或持久化 Plugin Manager。
- 不创建 iframe Runtime、Host API 方法、RPC transport、权限授权或插件私有存储。
- 不创建 Plugin SDK、UI、Testkit 或 CLI package；本 change 只为这些后续 package 提供依赖。
- 不执行 npm registry 发布、组织权限配置、签名或 Catalog 分发。
- 不修改已经归档的 OpenSpec artifact；archive 继续作为历史审计记录，不属于当前兼容性表面。
- 不增加或修改任何用户界面、主题、locale 或用户可见产品行为。

## Decisions

### 1. 使用一个 public package 拥有全部 TypeScript Contract 表面

新增 `packages/plugin-contract`，package 名为 `@lensx/plugin-contract`，初始版本为 `0.1.0`。它不是 private package，并声明完整的 metadata、打包文件和四个必需 lifecycle scripts。根 Host 将通过 `workspace:*` 声明依赖并只从 package exports 导入，不再从 `src/app/plugins/manifest/**` 持有或转发另一套公共类型。

package 只提供三个受支持入口：

```text
@lensx/plugin-contract                       constants, types, validate, normalize
@lensx/plugin-contract/schema                importable Schema value
@lensx/plugin-contract/manifest.schema.json  raw Draft 2020-12 JSON Schema
```

未声明的深层路径不属于公共 API。打包内容限于运行时代码、声明文件、Schema、必要 metadata 和许可/说明文件，不包含 Host 源码、测试、fixtures 或生成脚本。

选择 package export 而不是根路径 alias，可以让仓库内外消费者经过相同边界，并让 Task 1.1 的依赖检查发现越界导入。选择少量 subpath 而不是导出内部目录，可以在不破坏消费者的情况下重组实现。

### 2. 使用现有 TypeScript 工具链构建纯 ESM package

Contract package 使用现有 TypeScript、Node 和 Rstest 工具链输出 ES2022 ESM 与 `.d.ts`，构建过程显式复制并校验 Schema，不引入新的 bundler 或组件库。`ajv` 是公共校验 API 的直接运行时依赖，必须由 Contract package 自己声明；Schema 生成工具和测试工具仅作为开发依赖存在。公共运行时代码不得依赖 React、Semi Design、Tauri、DOM、Node 文件系统、环境变量或 Host 私有模块，因此同一 API 可以在插件构建工具、浏览器测试和 Host 前端中使用。

选择不打包依赖的标准 ESM 输出，可以保持依赖归属和许可证清晰。若现有 TypeScript 工具无法可靠生成所需 exports，才允许在实现中提出新的构建工具；该选择必须先更新 design 并说明必要性。

### 3. Schema、生成类型和 fixtures 归 Contract package 所有

Draft 2020-12 JSON Schema 移入 Contract package 并继续作为 author-input wire structure 的唯一事实源。类型生成脚本改为 package-local 输入/输出，生成的 `PluginManifestInput` 声明继续提交到仓库；drift check 比较 Schema 和生成输出，缺失或过期均失败。

共享 valid、invalid、normalized 与 incompatible fixtures 迁入 Contract package 的测试资产区域，但不进入发布 tarball。TypeScript package tests 和 Rust tests读取同一组文件；Rust 继续拥有显式 Rust 模型和语义实现，但编译时读取 package-owned Schema，并通过共享 fixtures 证明分类、规范化结果及诊断 code/path 一致。Rust 不依赖 npm Runtime，也不从 TypeScript 生成 Rust 代码。

选择让 package 拥有 Schema/fixtures，而不是把它们保留在根 Host，可以使事实源的物理所有权与发布边界一致。保留独立 Rust 实现是因为 Rust/Tauri 是稳定原生边界，跨语言 fixture gate 比在构建时引入 JavaScript Runtime 更可控。

### 4. 校验与规范化作为两个公开但不能绕过的纯函数

公共调用顺序定义为：

```text
unknown author input
        │
        ▼
validatePluginManifest
        │
        ├── invalid + deterministic diagnostics
        │
        └── successful validation result
                    │
                    ▼
          normalizePluginManifest
                    │
                    ▼
     compatible | incompatible + normalized Manifest
```

`validatePluginManifest` 接受 `unknown`，执行 Schema 解码和全部与当前 Host 版本无关的语义校验，并返回 discriminated result。成功结果携带只能由校验函数产生的 validated value；`normalizePluginManifest` 接受该成功结果和当前 LensX/Host API 版本，应用 trim/defaults、计算半开区间兼容性并返回 normalized Manifest。它不接受裸 `PluginManifestInput`，运行时也必须确认输入来自成功校验结果，从而避免调用者仅通过类型断言绕过边界。

两个函数均不修改作者输入，所有可序列化输出保持 readonly 数据结构。结构/语义失败返回 stable `{code, path, message}` diagnostics；code 与 JSON Pointer path 是兼容性表面，message 可在不改变含义的前提下改进。兼容范围之外的有效 Manifest 返回 `incompatible`，不产生结构错误。

选择显式两阶段 API 而不是公开一个接受已类型化对象的无保护 normalizer，可以满足插件工具的组合需求，同时保留唯一可信校验入口。Host 可以用一个私有 orchestration helper 串联两步，但该 helper 不成为第二套公共契约。

### 5. 所有当前版本维度从 0.1.0 开始但独立演进

Contract package 导出：

```text
PLUGIN_MANIFEST_VERSION = 0.1.0
PLUGIN_HOST_API_VERSION = 0.1.0
```

根 private `lensx` package 版本从 `1.0.0` 对齐到 `0.1.0`；当前 Tauri application 已是 `0.1.0`。这些相同初值用于建立一致起点，不建立永久锁步关系：

- package 实现修复可以发布 `@lensx/plugin-contract@0.1.1`，Manifest 与 Host API 仍为 `0.1.0`；
- 向后兼容的公共 package export 增加使用 minor，修复使用 patch；
- 在 1.0 前，公共 package API 的 breaking change 使用下一个 minor；
- author-input wire compatibility 发生破坏时才改变 Manifest version；
- Host API 请求/响应或语义发生破坏时才改变 Host API version。

Schema 只接受 `manifest_version: "0.1.0"`。不提供旧 Schema、旧 symbol alias、deprecated export、迁移函数或双版本分支。当前 fixtures、示例、源码、稳定规格、Roadmap 与维护文档只描述从 `0.1.0` 开始的版本历史；负例使用其他普通 SemVer 值，不保存更早实验版本概念。历史 OpenSpec archive 不参与构建、搜索门禁或兼容性判断。

### 6. 使用真实 tarball 证明仓库外消费，而不是只验证 workspace symlink

package 验收同时覆盖 workspace 消费和发布形态。根 Host/示例在日常开发中通过声明的 workspace dependency 使用 package；pack smoke test 则生成实际 tarball，在隔离临时消费者中仅通过 package name/public exports 安装或解析该 tarball，执行 TypeScript typecheck，并调用版本、Schema、validate 和 normalize 入口。测试还要检查 tarball 文件清单，防止遗漏 Schema/声明文件或泄露 Host 私有源码和 fixtures。

选择 tarball smoke test 是因为 workspace symlink 可能掩盖错误的 `exports`、`files`、声明路径或未声明依赖。实际 registry 发布需要凭据和发布治理，留在版本发布流程，不作为本 change 的完成条件。

### 7. 契约门禁纳入 package 与根级完整验证

Contract package 的 `build`、`typecheck`、`test` 和 `check` 必须执行有效检查，并被现有根聚合命令覆盖。根 `check:plugin-contract` 调整为编排 package Schema/type drift、TypeScript fixtures、pack consumer 和 Rust fixtures，不重复实现 package-local 逻辑。Host boundary tests 改为从 package 公共入口导入，证明 private Host 不再拥有契约实现。

英文 canonical 文档说明公共入口、版本维度、生成/fixture 工作流与本地 pack 验证；`docs/zh/` 同路径镜像保持语义一致。Roadmap 只更新当前基线和 Task 状态，不把 package 发布描述成插件可安装或可运行。

## Risks / Trade-offs

- **[两阶段 API 被调用方误用]** → `normalizePluginManifest` 只接受成功 validation result，并在运行时验证结果标记；增加类型负例和运行时拒绝测试。
- **[移动 Schema/fixtures 使 Rust 相对路径失效]** → 集中定义 package-owned 路径，先迁移 Rust include/test helper，再运行 canonical contract gate 和完整 Cargo validation。
- **[workspace symlink 掩盖发布包缺陷]** → 强制生成并检查真实 tarball，在隔离消费者中验证 types、runtime imports、Schema subpaths 和未声明依赖。
- **[公共 exports 过宽导致后续无法重构]** → 只导出根入口和两个 Schema 入口，使用 `exports`/`files` 白名单并测试深层导入不可用。
- **[TypeScript 与 Rust 语义漂移]** → 保持一组跨语言 fixtures，任何分类、normalized output 或 code/path 差异均使 CI 失败。
- **[相同初始版本被误认为永久锁步]** → 文档和常量命名区分 package、Manifest、Host API 与应用版本，并分别记录 SemVer 触发条件。
- **[当前内容与历史 archive 的版本文本不同]** → 当前扫描明确排除 archive；archive 不参与生成、构建、测试或产品文档，不改写历史审计材料。

## Migration Plan

1. 创建 Contract workspace member、package metadata、构建配置和受限 exports，先让空 package 生命周期接入根聚合验证。
2. 将 Schema、生成脚本/类型、纯 TypeScript 类型与校验/规范化逻辑、共享 fixtures 迁入 package，建立 `0.1.0` 常量和无 `V0` 公共命名。
3. 迁移根 Host imports、边界测试、示例和 Rust Schema/fixture 路径，删除 Host 私有重复实现与旧名称，不增加兼容层。
4. 对齐根 private package 版本和 lockfile，建立 package-local、共享契约、tarball consumer 与当前内容版本扫描门禁。
5. 更新 stable delta 对应的英文规格、英文文档及中文镜像、Roadmap 当前基线，运行完整 frontend/workspace/Rust validation。

本 change 不涉及已安装插件或持久化数据，因此无需数据迁移。若在首次发布前需要回滚，应整体回退 workspace member、Host imports、Schema/fixture 路径和版本变更，恢复到 change 之前的未发布状态；不得只恢复旧 public alias 或双版本接受路径。实际 package 一旦发布，后续回滚必须以新 package 版本修复，不能覆盖已发布版本。

## Open Questions

无。版本起点、硬切换、无兼容别名、根 private package 对齐、公开 validate/normalize 和 archive 保留策略均已确认。
