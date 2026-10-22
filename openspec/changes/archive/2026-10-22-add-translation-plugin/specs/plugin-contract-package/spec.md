# Spec Delta

## MODIFIED Requirements

### Requirement: Public validation and normalization must form one safe deterministic boundary

`validatePluginManifest` MUST 接受 unknown 作者输入并返回成功 validation result 或确定性 invalid diagnostics。`normalizePluginManifest` MUST 只接受成功校验结果及当前 LensX、Host API 版本，并返回 compatible 或 incompatible normalized Manifest。函数 MUST NOT 修改输入或依赖 React、Semi Design、Tauri、DOM、Node filesystem、环境变量或 Host-private 状态。

#### Scenario: Validate and normalize a valid Manifest
- **WHEN** unknown 输入通过校验且按当前版本规范化
- **THEN** API 应用确定性的 trimming/defaults，返回正确兼容状态并保持原输入不变

#### Scenario: Validation rejects invalid unknown input
- **WHEN** unknown 输入违反 Schema 或 Manifest 语义
- **THEN** 校验返回按 JSON Pointer path/code 排序的稳定 `{code, path, message}` diagnostics
- **THEN** 调用方不能通过受支持路径规范化失败结果

#### Scenario: Normalization rejects an unvalidated value
- **WHEN** 调用方向 normalizer 传递普通对象或伪造的 failure result
- **THEN** runtime 拒绝，类型声明不接受原始 `PluginManifestInput`

#### Scenario: Valid input is outside a compatibility range
- **WHEN** 有效输入的半开范围不包含当前 LensX `0.1.0` 或 Host API `0.3.0`
- **THEN** normalizer 返回 `incompatible`，而不是 `invalid`，并保留规范化作者数据及各维度兼容信息

### Requirement: Plugin platform versions must begin at 0.1.0 and evolve independently

包版本、`PLUGIN_MANIFEST_VERSION`、`PLUGIN_HOST_API_VERSION` 与私有根 `lensx` 版本 MUST 从各自 `0.1.0` 起独立演进。当前 Contract 包 MUST 为 `0.3.0`、Manifest 协议 MUST 保持 `0.4.0`、Host API MUST 为 `0.3.0`，私有根 application MUST 保持 `0.1.0`。新增通用 HTTP MUST NOT 改变 `.lxp` 包格式或私有 WebView bridge carrier `0.2.0`。当前 Contract MUST NOT 提供旧实验 Schema、symbol alias、deprecated export、converter 或隐式兼容分支。

#### Scenario: Package implementation receives a patch release
- **WHEN** 实现变化没有改变公共 API 或任一 wire protocol
- **THEN** package patch 可以增加，同时 Manifest 与 Host API 版本保持不变

#### Scenario: A public breaking change occurs before 1.0
- **WHEN** 公共 export、diagnostic code/path、normalized output、Manifest wire 或 Host API protocol 不兼容变化
- **THEN** 对应版本维度按照已维护的 pre-1.0 SemVer 策略提升

#### Scenario: Consumer looks for an earlier compatibility surface
- **WHEN** 消费者导入旧 symbol/Schema subpath 或调用 migration alias
- **THEN** 包不提供该入口
- **THEN** 当前维护文档描述各自从 `0.1.0` 起演进的当前契约及明确迁移边界

### Requirement: Public Contract package MUST expose the bounded Host API semantic contract

`@lensx/plugin-contract` root entry MUST 暴露 Host API `0.3.0` 的 method/event/error literal union、Schema 生成的 params/result/payload 输入类型、normalized readonly 输出类型、pure unknown-input validator 和 immutable method catalog，包括通用 `http.request`。声明的 Host API Schema subpath MUST 暴露原始 Draft 2020-12 Schema。导出 MUST 复用 `PLUGIN_HOST_API_VERSION`，MUST NOT 暴露 permission union/catalog、已移除 clipboard 方法、私有 RPC envelope、request ID、Runtime Session identity、`Window`、`MessagePort`、Host executor、React、Tauri 或 Rust 实现值。

#### Scenario: External consumer imports the Host API contract
- **WHEN** no-DOM consumer 安装真实 Contract tarball 并仅导入 root 和声明的 Host API Schema subpath
- **THEN** TypeScript 与每种公共 Host API semantic kind 的 ESM runtime validation 均成功
- **THEN** consumer 不需要 lensX source、SDK internals、React、DOM、Tauri 或 Rust

#### Scenario: Consumer attempts a private wire import
- **WHEN** consumer deep-import 内部 generated file、fixture、RPC envelope 或 Host Runtime module
- **THEN** package resolution 拒绝未声明路径
- **THEN** 不能因为包同时拥有 Host API Schema 就将私有传输事实公开

### Requirement: Contract package MUST publish the WebView Manifest boundary as one fact chain

`@lensx/plugin-contract` MUST 继续发布 Manifest `0.4.0` 的 Schema、生成类型、正常/恶意 fixtures、validator 与 normalizer，保持 WebView Runtime 及既有 Page presentation 契约。公共声明和打包文件 MUST NOT 保留 iframe Runtime authoring types 或暴露 Child WebView、Tauri、bridge、label、origin token 或 Host-private Session 事实。Host HTTP 扩展 MUST NOT 新增 Manifest 网络权限、私有 transport 配置或直接原生入口。

#### Scenario: An external consumer installs the packed Contract
- **WHEN** 临时 consumer 使用打包 Contract 校验 canonical WebView 与 legacy iframe fixture
- **THEN** WebView fixture 成功，iframe fixture 与 Host 返回相同稳定 incompatible 结果
- **THEN** 不需要 workspace source import 或私有 Runtime 声明

#### Scenario: Contract artifacts drift
- **WHEN** Schema、generated types、fixtures、validator、normalizer 或 Rust consumer 在 Runtime kind/protocol version 上不一致
- **THEN** contract drift gate 在发布前失败
