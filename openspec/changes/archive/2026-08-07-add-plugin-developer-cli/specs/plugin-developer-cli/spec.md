## ADDED Requirements

### Requirement: Public Plugin Developer CLI MUST expose a bounded and portable command surface

系统 MUST 提供可独立打包的公共 `@lensx/plugin-cli` package 和 `lensx-plugin` 可执行入口，并公开 `create`、`build`、`validate`、`pack`、`inspect`、`--help` 与 `--version`。CLI MUST 在声明的 Node 与 pnpm 版本范围内跨受支持桌面平台运行，MUST NOT 要求 lensX checkout、根 `node_modules`、Tauri、Rust toolchain 或正在运行的 Host，且 MUST NOT 暴露未声明的 codec 深路径作为公共 API。

#### Scenario: External consumer invokes every supported command

- **WHEN** 一个仓库外临时 consumer 只从真实 package tarball 安装 CLI 及声明依赖
- **THEN** `--help` 和 `--version` 成功，五个命令均可被解析和执行
- **THEN** 模块解析、bin 入口和运行文件不回链到 lensX checkout 或根 `node_modules`

#### Scenario: Consumer imports an internal codec path

- **WHEN** 外部项目尝试 import 未在 `@lensx/plugin-cli` exports 中声明的 package-format 内部模块
- **THEN** 模块解析失败
- **THEN** 插件不能把 CLI 内部 codec 当成插件 Runtime API

### Requirement: Create MUST generate one of the maintained project templates without external side effects

`create` MUST 要求显式目标目录、`framework-neutral | react-semi` 模板、合法 plugin ID 和项目名称，MUST 从 CLI tarball 内受验证且与 Task 6.3 canonical examples 保持一致的资产生成项目。生成项目 MUST 只使用公开 lensX packages 和普通可发布依赖，MUST 通过 Contract 校验，且命令 MUST NOT 下载依赖、初始化 Git、安装或运行插件。

#### Scenario: Create a framework-neutral project

- **WHEN** 开发者对不存在的目标目录执行 `create` 并选择 `framework-neutral`
- **THEN** CLI 生成包含 Manifest、Page、Action、build/typecheck/test/check lifecycle 和无权限 Runtime 示例的完整项目
- **THEN** 项目不包含 React、Semi Design、Plugin UI、Host 私有 import 或 workspace/file/link dependency

#### Scenario: Create a React/Semi project

- **WHEN** 开发者执行 `create` 并选择 `react-semi`
- **THEN** CLI 生成由插件文档自身拥有 React、React DOM、Semi Design 与 Plugin UI 的完整项目
- **THEN** 生成结果使用与 canonical React/Semi example 相同的公共 Runtime、locale、theme 和测试边界

#### Scenario: Target or substitution is unsafe

- **WHEN** 目标目录非空、plugin ID 非法、名称无法安全替换或生成结果未通过 Contract
- **THEN** CLI 以确定性诊断失败且不覆盖任何现有文件
- **THEN** staging 内容被清理，不留下看似成功的半生成项目

### Requirement: Build MUST execute only the explicit supported project lifecycle

`build` MUST 从显式 `--project` 或当前工作目录解析单一插件项目，MUST 校验 package metadata、受支持的 pnpm package manager 和非递归 `build` script，然后在项目根以不经过 shell 拼接的参数执行该 script。成功结果 MUST 包含自包含 `dist/manifest.json` 及全部引用资源；CLI MUST 将缺失脚本、失败进程或缺失输出分类为受控失败。

#### Scenario: Build a generated project

- **WHEN** 生成项目的依赖已安装且开发者运行 `build`
- **THEN** CLI 执行该项目声明的 build lifecycle 并成功产生自包含 `dist/`
- **THEN** build summary 不把执行脚本误报为 validation 或 Host installation

#### Scenario: Build configuration is absent or recursive

- **WHEN** package metadata 缺少 build script、声明不受支持的 package manager，或 build script 直接递归调用相同 CLI build 命令
- **THEN** CLI 在执行项目代码前以 usage/configuration 诊断失败
- **THEN** 不创建或修改 `.lxp`

#### Scenario: Project build fails

- **WHEN** 项目 build process 返回非零或未产生要求的 `dist/`
- **THEN** CLI 返回受控 operational failure 和有界日志摘要
- **THEN** JSON 输出不混入任意 child-process stdout、stack 或原始异常

### Requirement: Validate MUST provide a read-only project and payload gate

`validate` MUST 在不执行 build script、不写 `.lxp` 且不修改项目的前提下，校验项目 metadata、公共 dependency/import 边界、Manifest Contract、既有 `dist/` 的普通文件与可移植路径、资源完整性和当前版本兼容性。它 MUST 在内存中使用 canonical pack/inspect 规则证明 payload 可打包，并 MUST 将 `valid compatible`、`invalid` 与 `incompatible` 明确区分。

#### Scenario: Validate a complete compatible build

- **WHEN** 项目和现有 `dist/` 满足公共边界、Manifest、资源、路径、限制及当前 Host 兼容范围
- **THEN** `validate` 成功并报告 compatible
- **THEN** 项目文件、`dist/` 和 artifact 目录保持逐字节不变

#### Scenario: Build output is missing or empty

- **WHEN** 项目不存在 `dist/`、`dist/` 为空或缺少 `manifest.json`
- **THEN** `validate` 以确定性诊断失败
- **THEN** CLI 不隐式运行 build、不猜测其他输出目录且不生成空 package

#### Scenario: Payload contains an unsafe file or unresolved resource

- **WHEN** `dist/` 含 symlink、特殊文件、非法/碰撞路径、超限文件，或 Manifest 引用不存在的资源
- **THEN** `validate` 在读取或跟随未授权目标前失败
- **THEN** 诊断不暴露绝对路径、文件内容或部分可信 Manifest facts

#### Scenario: Manifest is valid but incompatible

- **WHEN** Manifest 结构和资源有效但 lensX 或 Host API range 不包含当前版本
- **THEN** `validate` 返回 `incompatible` 而不是 `invalid`
- **THEN** CI 获得确定性的非零退出状态且项目不被修改

### Requirement: Pack MUST create a canonical reproducible package transactionally

`pack` MUST 默认组合 build、validate、canonical pack 和 self-inspect；`--no-build` MUST 跳过且只跳过 build。命令 MUST 从已验证 `dist/` 生成 package protocol `0.1.0` 要求的 canonical checksums 和 `.lxp`，MUST 拒绝输出到 payload 内，并 MUST 通过目标同目录临时文件、flush 和原子 commit 防止半成品。相同 payload 的重复 pack MUST 产生逐字节相同的 `.lxp` 和完整包 SHA-256。

#### Scenario: Pack a generated project with one command

- **WHEN** 依赖已安装的新项目运行默认 `pack`
- **THEN** CLI 依次完成 build、validate、pack 和 self-inspect，并只在全部成功后写入 `.lxp`
- **THEN** 结果包含 plugin ID、Manifest version、package protocol、compatibility、文件数、大小、digest 和输出位置的版本化 build summary

#### Scenario: Pack an existing build without executing code

- **WHEN** CI 已隔离完成构建并执行 `pack --no-build`
- **THEN** CLI 只运行只读 validation、canonical pack 和 self-inspect
- **THEN** 项目 lifecycle 不被再次执行

#### Scenario: Packing fails before commit

- **WHEN** validation、编码、self-inspection、flush 或输出 commit 的任一步失败
- **THEN** CLI 返回失败且不把临时 bytes 暴露为成功 `.lxp`
- **THEN** 已存在目标只在本次命令全部成功时才被替换，其他 artifact 不被删除

#### Scenario: Same payload is packed twice

- **WHEN** 文件路径和 bytes 相同但来源文件系统的枚举顺序、mtime、owner 或 mode 不同
- **THEN** 两次 `.lxp` bytes、checksums、build summary 内容事实和 digest 相同
- **THEN** source metadata 不进入 canonical package

### Requirement: Inspect MUST classify an existing package without installation or execution

`inspect` MUST 对一个受 package-format 大小上限约束的 `.lxp` 执行只读检查，MUST 返回 `compatible | incompatible | invalid`、安全 normalized Manifest/compatibility 和允许的 package facts，且 MUST NOT 解压到文件系统、调用 Host installer、改变 Plugin Manager、授予权限、创建 Runtime session 或执行 payload。

#### Scenario: Inspect a compatible package

- **WHEN** 开发者检查一个 canonical 且当前兼容的 `.lxp`
- **THEN** CLI 返回 compatible、完整包 digest、协议版本、文件/大小 facts 和安全 Manifest 摘要
- **THEN** 不创建安装目录、注册记录或 Runtime 状态

#### Scenario: Inspect an invalid or incompatible package

- **WHEN** package bytes 非 canonical、校验和错误、资源缺失或只是不在当前兼容范围
- **THEN** CLI 分别返回 `invalid` 或 `incompatible`，不把两者合并
- **THEN** invalid 结果不返回部分 Manifest、文件 map 或可信 digest fact

#### Scenario: Package read exceeds the authorized bound

- **WHEN** 输入文件大小、流式解压输出或任一内部资源超过 package protocol 上限
- **THEN** `inspect` 尽早停止并返回安全诊断
- **THEN** 不依据不可信声明预分配无界内存

### Requirement: Human and machine output MUST be deterministic, safe, and automation-ready

每个命令 MUST 支持人类输出与 `--json`。人类输出 MUST 以 `en-US` 为默认并支持显式 `zh-CN`，CLI 自有文案 MUST 来自语义对齐的 message catalogs；JSON MUST 与 locale 无关，并恰好输出一个包含 `schema_version`、`command`、`status`、`result` 和排序去重 `diagnostics` 的 document。诊断 MUST 使用稳定 code、受限 path、message key 和结构化 arguments，MUST NOT 包含绝对 Host 路径、文件内容、stack、nonce、grant、环境 secret 或原始异常。

#### Scenario: CI requests JSON for success and failure

- **WHEN** CI 对成功、invalid、incompatible、usage error 或 operational failure 调用任一命令并传入 `--json`
- **THEN** stdout 是 schema version `1` 的单一可解析 JSON document，没有进度文本或 child-process 输出混入
- **THEN** 相同输入产生相同 status、result facts、diagnostic 顺序和退出码

#### Scenario: Developer selects Simplified Chinese human output

- **WHEN** 开发者以 `--locale zh-CN` 运行命令且未请求 JSON
- **THEN** CLI 使用与 English message key 语义一致的简体中文文案
- **THEN** diagnostic code、path、compatibility 和退出码不因 locale 改变

#### Scenario: Exit codes distinguish failure classes

- **WHEN** 命令分别成功 compatible、确定性 invalid/incompatible、遇到 usage/configuration error 或受控 build/I/O failure
- **THEN** 进程分别返回 `0`、`1`、`2` 或 `3`
- **THEN** `--help` 与 `--version` 返回 `0`

### Requirement: CLI and Host MUST agree on package-content classification while preserving Host-private authority

CLI TypeScript inspector 与 Host Rust inspector MUST 对同一 package bytes、当前 lensX/Host API versions 和 committed corpus 返回相同的三态 status、normalized Manifest、compatibility、文件 facts、完整包 digest 和排序 diagnostic code/path。Host installer MUST 继续独立复验不可信 bytes，并 MAY 因来源文件身份、竞态、安装存储、Manager 或生命周期状态等 Host 私有条件额外拒绝；CLI 结果 MUST NOT 声称安装授权、来源信任、签名或权限。

#### Scenario: Shared corpus is evaluated in both languages

- **WHEN** valid、invalid、incompatible、超限和可复现 fixtures 同时进入 CLI 与 Rust inspector
- **THEN** 两者对内容语义和安全 facts 完全一致
- **THEN** 本地化 message 文本不被当作跨语言 wire contract

#### Scenario: CLI accepts content but Host source checks fail

- **WHEN** `.lxp` 内容 compatible，但 Host 检测到来源替换、文件身份变化、不可用存储或冲突 Manager state
- **THEN** Host 可以拒绝安装且不改变 package-content classification
- **THEN** CLI 的成功只表示内容兼容，不表示可信、已授权或可安装承诺

### Requirement: Public tarball validation MUST prove isolated end-to-end consumption

系统 MUST 提供 CLI package gate 和根级 aggregate gate，检查 metadata、license、bin/exports、模板资产、精确允许文件、依赖与体积边界，并在系统临时目录使用真实公共 package tarballs 执行两类项目的 create、依赖安装、build、validate、两次 pack、inspect 以及 Rust preparation。验证 MUST 审计依赖解析和产物，阻止 checkout/root `node_modules` 回链、Host 私有源码、fixture generator 或绝对路径进入 consumer 和 tarball。

#### Scenario: Both templates complete the external CLI workflow

- **WHEN** clean temporary consumers 分别使用 framework-neutral 与 React/Semi template 运行完整 CLI 流程
- **THEN** 两者独立通过测试、类型检查、构建、验证、可复现打包、CLI inspect 和 Rust content/preparation boundary
- **THEN** CI 只通过公开 tarballs 和 CLI 命令完成作者侧 gate

#### Scenario: Packaged CLI contains a private or undeclared file

- **WHEN** CLI tarball 包含根 `tools/**`、`src-tauri/**`、其他 workspace source、测试生成器、未声明深入口或绝对路径
- **THEN** package gate 失败
- **THEN** 该 tarball 不能被当作可发布的 Task 6.4 产物
