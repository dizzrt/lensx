## ADDED Requirements

### Requirement: Public Plugin Contract package must expose a bounded author contract

系统 MUST 提供可独立构建和打包的 public workspace package `@lensx/plugin-contract`。package 根入口 MUST 公开 Manifest/Host API 版本常量、Schema 生成的 author-input 类型、normalized Manifest 类型、兼容性结果、稳定诊断结构以及纯 TypeScript 校验和规范化函数；package MUST 同时提供可导入的 Schema module 和原始 Draft 2020-12 JSON Schema subpath。未在 package `exports` 中声明的内部路径 MUST NOT 构成公共 API。

#### Scenario: Consumer imports supported public entries

- **WHEN** Host、插件工具或仓库外消费者只从 package 根入口或声明的 Schema subpath 导入
- **THEN** TypeScript 和 ESM 解析成功
- **THEN** 消费者无需访问根 private package 或 `src/app/**`

#### Scenario: Consumer attempts a deep internal import

- **WHEN** 消费者尝试导入未声明的源码、生成目录或内部实现路径
- **THEN** package resolution 拒绝该导入
- **THEN** 内部目录不会因位于发布 tarball 中而意外成为公共 API

### Requirement: Public validation and normalization must form one safe deterministic boundary

`validatePluginManifest` MUST 接受 `unknown` author input，执行 Schema 和语义校验，并返回可判别的成功或 invalid 结果。`normalizePluginManifest` MUST 只接受成功校验结果及当前 LensX/Host API 版本，MUST NOT 接受未经校验的裸输入，并 MUST 返回 `compatible` 或 `incompatible` 的 normalized Manifest 结果。两个函数 MUST 是确定性纯 TypeScript API，MUST NOT 修改调用方输入，也 MUST NOT 依赖 React、Semi Design、Tauri、DOM、Node 文件系统、环境变量或 Host 私有状态。

#### Scenario: Validate and normalize a valid Manifest

- **WHEN** 调用方把一个结构和语义均合法的未知 JSON 值交给 `validatePluginManifest`，再把成功结果交给 `normalizePluginManifest`
- **THEN** API 返回应用确定性 defaults 和 trimming 的 normalized Manifest
- **THEN** 当前版本位于两个声明范围内时结果为 `compatible`
- **THEN** 原始输入保持不变

#### Scenario: Validation rejects invalid unknown input

- **WHEN** 未知输入违反 Schema 或 Manifest 语义
- **THEN** `validatePluginManifest` 返回 `invalid` 和稳定 `{code, path, message}` diagnostics
- **THEN** diagnostics 按 JSON Pointer path 和 code 确定性排序
- **THEN** 调用方不能从失败结果调用正常规范化路径

#### Scenario: Normalization rejects an unvalidated value

- **WHEN** 调用方在运行时把普通对象或伪造失败结果传给 `normalizePluginManifest`
- **THEN** API 拒绝该值并且不产生可被 Host 接受的 normalized Manifest
- **THEN** 类型声明也不会把裸 `PluginManifestInput` 暴露为合法参数

#### Scenario: Valid input is outside a compatibility range

- **WHEN** 输入通过结构和语义校验，但当前 LensX 或 Host API `0.1.0` 不在对应半开区间内
- **THEN** 规范化结果为 `incompatible` 而不是 `invalid`
- **THEN** normalized author data 和逐维兼容性结果仍可供诊断使用

### Requirement: Schema and shared fixtures must prevent cross-consumer contract drift

package-owned Draft 2020-12 JSON Schema MUST 是 author-input wire structure 的唯一事实源，生成的 TypeScript author-input 类型 MUST 可由确定性命令重建并由 drift check 验证。Host TypeScript、package API、示例以及后续 CLI/Testkit MUST 通过 public package contract 消费该事实源；Rust MUST 读取同一 Schema 和同一组 valid、invalid、normalized 与 incompatible fixtures，并与 TypeScript 保持分类、normalized output 及 diagnostic code/path 一致。

#### Scenario: Generated types match the Schema

- **WHEN** Schema 与已提交 TypeScript author-input 类型一致
- **THEN** generation drift check 成功
- **THEN** 重复生成产生字节一致的输出

#### Scenario: Schema changes without regenerated types

- **WHEN** Schema 发生变化但生成类型没有同步
- **THEN** package 或根级 contract check 返回非零状态
- **THEN** CI 不会发布或接受漂移的 package

#### Scenario: TypeScript and Rust consume a shared fixture

- **WHEN** 两端使用相同当前版本读取同一个 shared fixture
- **THEN** 两端返回相同 validity 和 compatibility 分类
- **THEN** normalized output 以及 diagnostic code/path 保持一致

### Requirement: Plugin platform versions must begin at 0.1.0 and evolve independently

`@lensx/plugin-contract` 初始 package version、`PLUGIN_MANIFEST_VERSION` 和 `PLUGIN_HOST_API_VERSION` MUST 分别为 `0.1.0`，根 private `lensx` package version MUST 对齐为 `0.1.0`。这些版本维度 MUST 独立演进：package 实现修复不得强制改变 wire protocol，Manifest wire compatibility 变化不得被 package patch 隐藏，Host API contract 变化不得通过 Manifest version 代替表达。当前契约 MUST NOT 提供早期实验版本的 Schema、alias、deprecated export、转换器或兼容分支。

#### Scenario: Package implementation receives a patch release

- **WHEN** Contract package 修复实现但不改变公共 API、Manifest wire format 或 Host API protocol
- **THEN** package version 可以增加 patch
- **THEN** Manifest 和 Host API version 保持 `0.1.0`

#### Scenario: A public breaking change occurs before 1.0

- **WHEN** 公共 export、diagnostic code/path、normalized output、Manifest wire format 或 Host API protocol 出现不兼容变化
- **THEN** 对应版本维度按照已记录的 pre-1.0 SemVer 策略增加
- **THEN** 该变化不会被描述成兼容 patch

#### Scenario: Consumer looks for an earlier compatibility surface

- **WHEN** 消费者尝试导入旧 symbol、旧 Schema subpath 或调用迁移 alias
- **THEN** package 不提供该入口
- **THEN** 当前维护文档只描述从 `0.1.0` 开始的契约

### Requirement: Packed artifact must be consumable outside the workspace

仓库 MUST 使用真实 package tarball 验证 `@lensx/plugin-contract` 的发布形态。隔离消费者 MUST 只依赖该 tarball 和其声明依赖，MUST 能从公共入口完成 TypeScript typecheck，并 MUST 能加载版本常量、Schema、validation 与 normalization API。tarball MUST 包含运行代码、声明文件和 Schema，且 MUST NOT 包含 Host 私有源码、测试或内部 fixtures。

#### Scenario: External consumer uses the packed package

- **WHEN** pack smoke test 在隔离于 workspace source resolution 的消费者中安装或解析生成 tarball
- **THEN** 消费者只通过 package name 和 public exports 即可通过 typecheck
- **THEN** 最小运行时调用可以校验并规范化示例 Manifest

#### Scenario: Required artifact is missing from the tarball

- **WHEN** 声明文件、运行入口或任一公开 Schema 入口未进入 tarball
- **THEN** pack smoke test 返回非零状态
- **THEN** package 不被视为可发布

#### Scenario: Private material leaks into the tarball

- **WHEN** tarball 文件清单包含 Host 私有源码、package tests 或 shared fixtures
- **THEN** package contents check 返回非零状态
- **THEN** CI 阻止该发布形态

### Requirement: Contract package must participate in complete workspace validation

Contract package MUST 声明并实际执行 `build`、`typecheck`、`test` 和 `check` lifecycle scripts，现有根聚合命令 MUST 覆盖这些 scripts 并传播失败。根 contract gate MUST 编排 Schema/type drift、package tests、Host boundary tests、tarball consumer 和 Rust shared fixtures，而不得在 Host 中维护第二套公共契约实现。

#### Scenario: Repository-wide validation includes the Contract package

- **WHEN** 开发者运行任一根级标准 lifecycle 命令
- **THEN** 对应 Contract package script 被执行
- **THEN** package 或根应用失败会使根命令失败

#### Scenario: Host consumes the public contract

- **WHEN** Host 构建、类型检查或 Manifest boundary tests 运行
- **THEN** Host 从 `@lensx/plugin-contract` public exports 获取类型和函数
- **THEN** Host 不依赖 Contract package 的源码深层路径或保留重复公共实现

