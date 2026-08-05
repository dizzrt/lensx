# lensX Plugin Roadmap

## 文档定位

本文档定义 lensX 插件平台从当前静态 Manifest 契约演进到可开发、可安装、可运行、
可管理和可发布生态的路线。Roadmap 使用 `Milestone` 和 `Task` 组织，每个可执行 Task
对应一个唯一的 kebab-case OpenSpec change。

本文档描述计划，不代表相应能力已经实现。实现状态必须以当前源码、测试、稳定规格和
验证结果为准，不能仅依据 Roadmap、OpenSpec artifact 或历史 Task checkbox 判断。

官方插件和外部插件共用同一套 Manifest、SDK、包格式、安装器、隔离 Runtime、Host API
与权限模型。官方插件只是插件平台的第一方消费者和端到端验证者；“官方”仅表示来源、
签名、分发渠道和维护责任经过 lensX 验证，不自动获得额外 Runtime 权限。

## 当前基线

当前仓库已经实现：

- `@lensx/plugin-contract@0.1.0` 公共 workspace package，以及三个受限公共入口；
- `@lensx/plugin-sdk@0.1.0` 框架无关公共 package 与受限根入口；
- 可选的 `@lensx/plugin-ui@0.1.0` React/Semi Design 公共 package、样式入口与十个语义 token；
- `manifest_version: "0.1.0"` 的严格外部插件 Manifest Schema；
- Schema 驱动的 `PluginManifestInput`、两阶段 TypeScript API 与独立 Rust 校验；
- valid、invalid、normalized、incompatible 共享 fixtures、真实 tarball 消费验证和契约 drift gate；
- Host 私有的持久化 Plugin Manager、逐插件原子记录、兼容性重算与 quarantine 恢复；
- Host 私有的 Plugin Registration Contract、只读 snapshot/detail 查询、revision 失效通知与
  TypeScript 恢复 adapter；
- canonical `.lxp` package format、跨语言 inspector、受限本地首次安装、enable/disable/uninstall，
  以及同 identity 本地包的两阶段单 active replacement；
- Host-owned Launcher Action descriptor、Registry、Dispatcher、搜索与集合能力；
- Host 私有的 Plugin Page Registry、Registration revision 驱动的 Action/Page surface projection、
  grant snapshot 预检、统一页面导航、scoped Resource Service、per-generation isolated origin、
  frame-aware exact navigation lease 与仅在 active Page 存在的 Host-owned iframe Runtime；
- Host 内建的隐藏 Launcher 和打开设置 Action；
- Host 设置页面中的插件空占位。

当前尚未实现：

- Plugin CLI package；
- 远程下载、自动更新和用户主动 rollback history；
- Runtime session、iframe message transport 与完整 CSP/lifecycle recovery；
- 真实 Host API、SDK transport、权限授权和插件私有存储；
- 插件管理 UI、开发模式、签名、更新、Catalog 和 Marketplace。

已归档的 `define-plugin-contract-v0` 只交付静态 Manifest 契约与校验，不代表插件已经可被
发现、安装、注册、运行或授权。当前根 `lensx` package 保持 private，并通过 public export 消费
Contract package；仓库验证不会执行 npm registry 发布操作。

## 平台边界

```text
                              lensX Plugin Platform

┌──────────────────────────────────────────────────────────────────────────┐
│ Public packages                                                          │
│ plugin-contract │ plugin-sdk │ plugin-ui │ plugin-testkit │ plugin-cli   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ same public contract
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
        plugins/official/*              third-party repositories
        workspace development           released package dependencies
                 └──────────────┬──────────────┘
                                ▼
                              .lxp package
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Host: ingest → validate → install → register → isolate → authorize      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 公共插件能力

- `plugin-contract`：Manifest Schema、生成类型、协议版本和公共诊断结构。
- `plugin-sdk`：框架无关的 TypeScript API、Runtime context、RPC 和稳定错误类型。
- `plugin-ui`：可选的 React/Semi Design 组件、主题 token 和 locale 适配层。
- `plugin-testkit`：当前提供 Manifest、Runtime context 与 SDK lifecycle 测试核心；Host API、权限和
  页面 Runtime 工具只随对应后续 Milestone 扩展。
- `plugin-cli`：create、dev、validate、inspect、build、pack 和 sign 命令。

### 私有 Host 能力

- Plugin Manager、安装目录、注册状态、授权、包校验和 Runtime session 属于 Host。
- Rust 负责持久化、受信任路径、系统能力、权限决策和稳定 Tauri command 边界。
- React 负责插件管理界面、iframe 容器、页面交互和可见诊断。
- 插件不能 import `src/app/**`、直接调用 Tauri、读取 React Context 或持有 Host executor。
- 必须访问私有 React/Tauri 对象的功能属于 `lensx.core` Host 模块，不属于可发布插件。

## Roadmap 原则

- 官方插件与外部插件必须经过同一包校验、安装、注册、Runtime 和权限路径。
- `plugin-sdk` 必须保持框架无关；`plugin-ui` 是可选能力，不能成为运行插件的前提。
- Monorepo 内部可以使用 `workspace:*`，发布产物必须转换为明确的 SemVer 依赖。
- Manifest 的 Publisher 字段不建立信任；来源、签名、授权和生命周期由 Host 注入。
- 注册元数据时不加载插件 UI；只有打开 Page 时才创建 iframe，关闭后必须销毁。
- 插件只通过小型、类型化、版本化并经过权限检查的 Host API 使用 lensX 能力。
- 第一阶段只支持本地包和开发目录；远程 Catalog 不得阻塞本地闭环。
- 每个 Task 独立创建 OpenSpec change，并使用本文给出的 change 名。
- 每个 change 必须包含适用的测试、英文文档及中文镜像，并完成最终验证。

## 依赖关系

```text
Milestone 1  Plugin Development Foundation
      │
      ▼
Milestone 2  Host Registration Model
      │
      ▼
Milestone 3  Package And Lifecycle
      │
      ▼
Milestone 4  Isolated Runtime
      │
      ▼
Milestone 5  Host API And Permissions
      │
      ▼
Milestone 6  User And Developer Experience
      │
      ▼
Milestone 7  Official Plugins And Hardening
      │
      ▼
Milestone 8  Trusted Distribution Ecosystem
```

## Milestone 1：建立通用插件开发基础

- [x] **Task 1.1：建立 Plugin Platform Workspace**

**OpenSpec change**：`establish-plugin-platform-workspace`

**目标**：将当前单包应用演进为可容纳公共 package、官方插件和示例插件的 pnpm workspace。

**范围**：

- 保留当前根应用为 private package，第一阶段不强制迁移到 `apps/desktop`。
- 增加 `packages/*`、`plugins/official/*` 和 `examples/plugins/*` workspace 边界。
- 定义公共 package、Host 私有代码和插件源码之间的依赖方向。
- 禁止插件直接依赖根应用的 `src/app/**`、Tauri adapter 和内部样式入口。
- 建立按 workspace 执行 build、typecheck、test 和 check 的根命令。

**依赖**：无。

**完成标准**：根应用行为保持不变；workspace 安装和全量验证通过；依赖边界可由 CI 检查。

- [x] **Task 1.2：发布 Plugin Contract Package**

**OpenSpec change**：`publish-plugin-contract-package`

**目标**：让仓库内外的插件开发者消费与 Host 完全一致的 Manifest 公共契约。

**范围**：

- 建立 `@lensx/plugin-contract`，承载 Schema、生成 TypeScript 类型、版本和诊断结构。
- 公开不可绕过的 `validatePluginManifest` 与 `normalizePluginManifest` 两阶段纯 TypeScript API。
- 保持 JSON Schema 为 author-input wire format 的结构事实源。
- 让 Host、外部示例和 Rust fixture 使用同一 package-owned 契约输入。
- 从 `0.1.0` 建立 package、Manifest、Host API 与应用四个独立版本维度。
- 定义受限 exports、SemVer 和 breaking-change 策略，并以真实 tarball 验证仓库外消费。
- 保持 TypeScript/Rust 共享 fixture gate，并拒绝发布内容与运行时依赖 drift。

**依赖**：Task 1.1。

**完成标准**：隔离外部示例只依赖真实 tarball 即可完成 typecheck 和运行时契约调用；任何
Schema、类型、Host、Rust、exports、内容或依赖 drift 都会使门禁失败。

- [x] **Task 1.3：建立框架无关 Plugin SDK**

**OpenSpec change**：`create-plugin-sdk-foundation`

**目标**：建立不依赖 React、Semi Design 或 Tauri 的 `@lensx/plugin-sdk` 公共边界。

**范围**：

- 定义 SDK 初始化、Runtime context、请求、事件、取消、超时和错误抽象。
- 只暴露版本化公共类型，不暴露 `postMessage` 私有 envelope 或 Host 内部类型。
- 建立 transport interface，实际 iframe transport 留给后续 Task。
- 定义 SDK 与 Host API 的独立版本及兼容范围。
- 支持在非浏览器测试环境注入 fake transport。

**依赖**：Task 1.1、Task 1.2。

**完成标准**：SDK 可以独立构建、发布和测试；公共入口不包含 React、Semi 或 Tauri 依赖。

- [x] **Task 1.4：建立可选 Plugin UI Package**

**OpenSpec change**：[create-plugin-ui-package](openspec/changes/archive/2026-08-03-create-plugin-ui-package/)
（已完成并归档）

**目标**：允许 React 插件复用 lensX 的稳定视觉语言，同时不限制其他前端技术栈。

**范围**：

- 建立 `@lensx/plugin-ui`，提供页面框架、状态反馈和少量稳定组件。
- 基于 Semi Design 与公开主题 token，不导出 Host React Context 或应用私有组件。
- 支持 `en-US`、`zh-CN`、light 和 dark Runtime context。
- 定义插件自行打包运行依赖的策略，不共享 Host React 实例。
- 建立可访问性、主题和 locale 的视觉与自动化验证。

**依赖**：Task 1.1、Task 1.3。

**完成标准**：使用和不使用 React 的插件都可运行；UI package 不成为 SDK 的传递依赖。

- [x] **Task 1.5：建立 Plugin Testkit**

**OpenSpec change**：[create-plugin-testkit](openspec/changes/archive/2026-08-03-create-plugin-testkit/)
（已完成并归档）

**目标**：让插件作者在不启动完整桌面应用的情况下验证当前 Manifest Contract 与 SDK lifecycle。

**范围**：

- 提供 Manifest fixture/mutation、Runtime context fixture、语义 fake transport、取消 controller 与
  deferred 控制。
- 使用真实 SDK 覆盖初始化成功、无效或不兼容 context、transport failure、超时、取消、Host 断开、
  显式重试和幂等销毁。
- 复用 `plugin-contract` 和 SDK 公共入口，不复制协议、校验、规范化或兼容算法。
- 输出适合 Rstest/Vitest 等测试运行器消费的框架无关核心；初版不提供 permission harness、真实
  Host API 调用、iframe wire、页面 Runtime 或插件执行。

**依赖**：Task 1.2、Task 1.3。

**完成标准**：真实 Contract、SDK 与 Testkit tarball 的隔离 consumer 可以覆盖 Manifest/context
fixture、SDK 初始化、观测和销毁，不依赖 Host 私有模块；本 Task 只交付 Testkit core，正式插件
项目模板在 Runtime 与 Host API 基础完成后由 Task 6.3 交付。

### Milestone 1 完成标准

- 仓库具备清晰的公共 package、Host 私有代码和官方插件目录边界。
- Contract、SDK、可选 UI 和 Testkit 可以被仓库外 consumer 独立构建、测试和验证。
- 完成后建立 **Plugin Development Foundation**；此阶段不交付正式项目模板、插件安装或执行能力。

## Milestone 2：建立 Host 插件注册模型

- [x] **Task 2.1：建立持久化 Plugin Manager**

**OpenSpec change**：[add-persistent-plugin-manager](openspec/changes/archive/2026-08-03-add-persistent-plugin-manager/)
（已完成并归档）

**目标**：在 Rust 中建立统一、持久化且可诊断的插件管理核心。

**范围**：

- 使用 Tauri managed state 持有 Plugin Manager。
- 区分 normalized Manifest 与 Host-owned registration state。
- 管理 installed、enabled、compatible、quarantined 和 runtime 状态。
- 记录安装位置、包 hash、来源、授予权限和最近诊断。
- 单个损坏插件不能阻止应用启动。

**依赖**：Task 1.2。

**完成标准**：注册状态可持久化和恢复；损坏记录进入 quarantine；Rust 测试覆盖状态转换。

- [x] **Task 2.2：定义 Plugin Registration Contract**

**OpenSpec change**：[define-plugin-registration-contract](openspec/changes/archive/2026-08-03-define-plugin-registration-contract/)
（已完成并归档）

**目标**：建立 Rust、Tauri 和 TypeScript 共享的 Host 注册与查询边界。

**范围**：

- 定义 author Manifest、normalized Manifest、registered plugin read model 和瞬时 runtime status 的独立层次。
- Host 组合 source、enabled、compatibility、quarantine、permission grant 和安全诊断事实；
  lifecycle、signature 与 permission decision 继续由后续 Task 定义。
- 定义 snapshot、详情、稳定查询错误和状态变更通知的可序列化 payload。
- Publisher 声明不得转换为可信 provenance。
- 定义注册状态变化事件和完整 snapshot 恢复语义。

**依赖**：Task 2.1。

**完成标准**：前端只能读取 Host 组合后的注册状态；author input 无法覆盖 Host-owned 字段；
完整 snapshot 可以从事件竞态或丢失中恢复，Rust 与 TypeScript 共享 drift gate。

- [x] **Task 2.3：投影 Plugin Actions 到 Launcher**

**OpenSpec change**：[project-plugin-actions-to-launcher](openspec/changes/archive/2026-08-03-project-plugin-actions-to-launcher/)
（已完成并归档）

**目标**：将已注册插件的 Manifest Action 安全映射到现有 Host Action Registry。

**范围**：

- 以 `<plugin_id>.<local_action_id>` 派生全局 Action ID。
- 通过 provider adapter 映射本地化文本、关键词、enabled 和安全 icon。
- Host 合成打开插件 Page 的 executor，插件不能提交函数或 executor。
- 一批 Action 必须原子注册、替换和注销。
- 禁用、不兼容或隔离插件的 Action 不进入可执行搜索结果。

**依赖**：Task 2.2。

**完成标准**：插件 Action 使用现有 Registry、搜索和 Dispatcher；搜索层没有插件专用分支。

- [x] **Task 2.4：建立 Plugin Page Registry 与导航**

**OpenSpec change**：[add-plugin-page-navigation](openspec/changes/archive/2026-08-03-add-plugin-page-navigation/)
（已完成并归档）

**目标**：让 Page-only Action 通过 Host 控制的导航边界打开插件页面。

**范围**：

- 派生稳定全局 Page identity，并保留插件内父子关系。
- 扩展 framework-neutral navigation service，禁止插件控制 React setter。
- 解析 Owner、Page、opening Action 和错误 fallback 的展示信息。
- 拒绝未知、禁用、不兼容、未授权或已卸载的 Page。
- 保持当前单窗口 page surface 与关闭行为。

**依赖**：Task 2.2、Task 2.3。

**完成标准**：Host 可以导航到已注册插件 Page descriptor；此 Task 不执行插件 UI 代码。

### Milestone 2 完成标准

- Host 具备持久化插件注册状态以及 Action/Page 的安全元数据投影。
- 插件仍未被安装或执行；完成本 Milestone 不代表 Runtime 已交付。

## Milestone 3：实现插件包与本地生命周期

- [x] **Task 3.1：定义 Plugin Package Format**

**OpenSpec change**：`define-plugin-package-format`

**目标**：定义可验证、可重复构建的 `.lxp` canonical `tar.zst` 交付格式。

**范围**：

- 第一版使用一个带 content size/checksum 的受限 Zstandard frame，内部是 canonical ustar-compatible TAR。
- 固定 `manifest.json`、`checksums.json`、entry 顺序、metadata、portable path profile 和资源硬上限。
- 逐文件 SHA-256、Zstandard frame checksum 和整个 `.lxp` 的 algorithm-labelled SHA-256 各自保持独立职责。
- 复用 Manifest Contract，并要求 Runtime entry 与全部 display/Page/Action assets 精确解析到 checksummed 普通文件。
- TypeScript reference packer/inspector 与 Rust Host-private inspector 消费同一 valid、invalid、incompatible、reproducible corpus。
- 开发来源、未签名来源与未来签名来源共享相同 canonical payload；source、signature、grant 和 lifecycle 均为包外 Host facts。

**依赖**：Task 1.2。

**完成标准**：固定 tool revision 对相同 canonical file map 产生 byte-for-byte 相同 `.lxp`；TypeScript 与 Rust 对 status、facts、diagnostics 和 digest 给出一致结论；本 Task 不实现 installer、CLI、Runtime 或 signing。

- [x] **Task 3.2：实现本地插件安装**

**OpenSpec change**：`add-local-plugin-installation`

**目标**：让用户通过本地 `.lxp` 完成安全、原子的首次安装。

**范围**：

- 解包到临时 staging 目录后执行结构、Manifest、兼容性和路径验证。
- 消费 Task 3.1 的受限 Zstandard/TAR inspection，防御路径穿越、特殊 entry、compression bomb、重复路径和大小写冲突。
- 验证成功后原子移动到正式版本目录并注册。
- 安装失败不得留下半安装状态或污染 Registry。
- 第一阶段不提供远程下载。

**依赖**：Task 2.1、Task 2.2、Task 3.1。

**完成标准**：有效本地包无需重启即可注册；无效包失败可诊断且无残留。

- [x] **Task 3.3：实现启用、禁用与卸载**

**OpenSpec change**：[add-plugin-lifecycle-controls](openspec/changes/archive/2026-08-04-add-plugin-lifecycle-controls/)
（已完成并归档）

**目标**：形成插件 enabled state 和卸载的完整 Host-owned 生命周期。

**范围**：

- 实现 enable、disable 和 uninstall 的状态转换与幂等语义。
- 禁用或卸载前关闭活跃页面并注销 Action/Page。
- 插件程序目录与插件数据目录分离。
- 卸载时明确保留或清除数据策略。
- 官方 provenance 不自动改变可禁用、可卸载或权限策略。

**依赖**：Task 2.3、Task 2.4、Task 3.2。

**完成标准**：状态变化无需重启生效；重启后保持；生命周期失败可恢复到一致状态。

- [x] **Task 3.4：实现插件升级与回滚**

**OpenSpec change**：`add-plugin-upgrade-and-rollback`

**目标**：安全处理相同 plugin ID 的版本替换、失败恢复和权限差异。

**范围**：

- 区分重复安装、升级、降级、重装和 package identity 冲突。
- 通过 prepare/commit/cancel 两阶段 Host-private contract 先检查候选，再协调 surface 并提交。
- 使用同 plugin key 下的 sibling digest directory，并让 version-1 Plugin Manager record 保持为唯一
  active pointer；不保留 previous pointer 或版本历史。
- 替换前检查 compatibility、完整 package digest、identity、revision 与 permission diff；当前 unsigned
  local policy 不伪造 signature status。
- 提交前失败保持旧 payload、record 与 projection；提交成功后删除旧 payload，清理失败进入可恢复 pending。
- 用户显式选择的 compatible 本地包允许升级、降级与同版本重装；该语义不授权未来静默自动降级。
- 保留 source、enabled intent 与独立 data subtree，并把 grants 收缩为旧 grants 与新 requested
  permissions 的交集。

**依赖**：Task 3.2、Task 3.3。

**完成标准**：失败替换不会破坏可用旧版本；durable commit 后只有新 record active；新增权限不会自动
生效；专用门禁与完整前端/Rust 验证全部通过。本 Task 不提供远程更新、主动 rollback、多版本、签名、
Runtime health rollback、数据迁移、权限 UI 或完整管理 UI。

### Milestone 3 完成标准

- 本地插件包具备安装、启用、禁用、卸载、升级和回滚事务。
- 所有生命周期最终都落到同一 Plugin Manager 和注册模型。

## Milestone 4：建立隔离插件 Runtime

- [x] **Task 4.1：安全提供插件资源**

**OpenSpec change**：`serve-plugin-resources-securely`

**目标**：让插件资源通过 Host 控制的 scoped origin 加载，而不是暴露普通文件路径。

**范围**：

- 为每个已安装插件生成 Host-owned 资源 origin 或等价自定义协议 URL。
- Rust canonicalize 所有请求路径并限制在当前插件版本目录内。
- 拒绝绝对路径、父目录、符号链接逃逸、跨插件资源和未知 MIME。
- URL 中的 plugin ID、version 和 entry 均从 Registry 推导。
- 定义缓存、错误和卸载后的失效行为。

**依赖**：Task 3.2。

**完成标准**：插件只能读取自己的已安装资源；路径攻击具有 Rust 集成测试。

- [x] **Task 4.1.1：隔离 Plugin Runtime Origin**

**OpenSpec change**：[add-isolated-plugin-runtime-origin](openspec/changes/archive/2026-08-04-add-isolated-plugin-runtime-origin/)
（已完成并归档）

**目标**：把每个 current resource generation 映射为独立 browser origin，为安全使用
`allow-same-origin` 的后续 iframe Runtime 提供前置能力。

**范围**：

- 使用同一个 process-local 128-bit scope 同时绑定独立 authority 与 path authorization。
- Resource Contract、handler 与 frame-aware policy 严格交叉验证 authority/path scope、identity 与 version。
- 在真实 macOS WKWebView 中验证 ES Module graph、storage partition、parent/frameElement/Tauri absence，
  并保持 no-CORS、lifecycle revocation 与 production placeholder。

**依赖**：Task 4.1、
[add-frame-aware-webview-navigation-policy](openspec/changes/archive/2026-08-04-add-frame-aware-webview-navigation-policy/)（macOS）。

**完成标准**：`pnpm run check:isolated-plugin-runtime-origin` 与完整验证通过；真实 bounded evidence
证明隔离 authority 和 module/storage/security 边界，且没有启用 production iframe。

- [x] **Task 4.2：实现隔离 iframe Runtime**

**OpenSpec change**：[add-isolated-plugin-iframe-runtime](openspec/changes/archive/2026-08-04-add-isolated-plugin-iframe-runtime/)
（已完成并归档）

**目标**：在打开插件 Page 时创建不继承 Tauri bridge 的隔离 iframe。

**范围**：

- Host 根据 Page registry 和资源服务生成 iframe entry。
- sandbox token、allow policy、origin 和导航策略由 Host 固定。
- iframe 不访问主应用 React state、Tauri API、文件系统或其他插件。
- 提供加载中、已加载（不等于 Session ready）、失败、重试和页面错误状态。
- iframe 只在 Page 活跃时存在。

**依赖**：Task 2.4、Task 4.1，以及
[add-frame-aware-webview-navigation-policy](openspec/changes/archive/2026-08-04-add-frame-aware-webview-navigation-policy/)
→ [add-isolated-plugin-runtime-origin](openspec/changes/archive/2026-08-04-add-isolated-plugin-runtime-origin/)（macOS）。

**完成标准**：有效插件页面可被打开；未注册 URL、跨 origin 导航和 Tauri 访问被拒绝。

- [x] **Task 4.3：绑定 Runtime Session 与消息来源**

**OpenSpec change**：[bind-plugin-runtime-sessions](openspec/changes/archive/2026-08-05-bind-plugin-runtime-sessions/)
（已完成并归档）

**目标**：将消息来源、插件身份、Page、权限和生命周期绑定为不可伪造的 session。

**范围**：

- Session 绑定 plugin ID、version、Page ID、contentWindow、origin 和随机 nonce/MessagePort。
- Host 从 session 推导身份，不相信消息 payload 自报 plugin ID。
- 拒绝错误 window、origin、过期 nonce、已禁用插件和旧版本 session。
- 定义握手、ready、disconnect 和 Host reload 状态机。
- 为伪造来源和跨插件消息建立测试夹具。

**依赖**：Task 4.2。

**完成标准**：只有当前活跃 iframe 能以其真实身份建立 Host 通信；伪造消息稳定失败。

- [ ] **Task 4.4：完善 Runtime CSP 与生命周期**

**OpenSpec change**：`complete-plugin-runtime-security-lifecycle`

**目标**：确保插件资源、iframe、监听器和 pending 调用只在授权页面会话期间存在。

**范围**：

- 为 Host 和插件 iframe 建立明确 CSP，不使用无约束策略。
- 关闭页面、禁用、卸载、升级或导航离开时销毁 session。
- 取消 pending 请求、移除监听器并释放 iframe。
- 处理加载超时、重复崩溃、Host reload 和应用退出。
- 明确单插件页面实例数量策略。

**依赖**：Task 4.2、Task 4.3。

**完成标准**：关闭后无残留 iframe、listener 或 pending call；非法脚本与导航被阻止并诊断。

### Milestone 4 完成标准

- 插件资源、origin、identity、session、CSP 和页面生命周期形成安全绑定。
- 完成 Milestone 1–4 后达到 **Local Plugin Preview**。

## Milestone 5：实现 Host API 与权限系统

- [ ] **Task 5.1：定义 Host API v1 Contract**

**OpenSpec change**：`define-plugin-host-api-v1`

**目标**：定义少量、真实、版本化且可独立验证的首版 Host API。

**范围**：

- 第一版定义 `runtime.get_context`、`ui.close`、`actions.open` 和插件私有存储 API。
- 将剪贴板和打开外链作为首批显式权限能力候选。
- 不开放任意文件、任意网络、Shell、进程或 Tauri command。
- 定义 method、params、result、event、permission 和错误 Schema。
- 定义 Host API 版本协商、能力发现和废弃策略基础。

**依赖**：Task 1.2、Task 2.2。

**完成标准**：每个方法都有规范、Schema、权限需求和成功/失败场景；无占位方法进入公共 API。

- [ ] **Task 5.2：实现 SDK iframe Transport**

**OpenSpec change**：`implement-plugin-sdk-transport`

**目标**：让公共 SDK 通过受控 MessagePort/`postMessage` transport 使用 Runtime session。

**范围**：

- 实现握手、请求 ID、并发调用、超时、取消、事件和断开处理。
- SDK 不允许调用未声明的私有 method 或手工覆盖 plugin identity。
- 映射稳定 Host 错误，不暴露原始异常、栈或 Host 对象。
- 支持测试 transport 与真实 iframe transport 的一致行为。
- 页面销毁时拒绝所有新调用并终止 pending 调用。

**依赖**：Task 1.3、Task 4.3、Task 5.1。

**完成标准**：示例插件只通过 SDK 完成握手和调用；transport 异常可预测、可测试。

- [ ] **Task 5.3：实现 Host API Dispatcher**

**OpenSpec change**：`implement-plugin-host-api-v1`

**目标**：把 Host API Contract 路由到真实应用 service 或窄 Rust command。

**范围**：

- 按 session identity、method、params 和当前状态执行统一 dispatch。
- `runtime.get_context` 返回真实版本、locale、theme 和有效权限。
- `ui.close` 与 `actions.open` 复用现有 Host 导航和 Action Dispatcher。
- 特权操作经过明确的应用 service 和 Rust 二次约束。
- 未知或未实现 method 使用稳定错误拒绝。

**依赖**：Task 4.3、Task 5.1、Task 5.2。

**完成标准**：首版方法产生真实效果；插件无法得到 executor、Tauri 对象或 Rust 内部值。

- [ ] **Task 5.4：提供插件私有存储**

**OpenSpec change**：`add-plugin-scoped-storage`

**目标**：让插件持久化自己的数据，同时禁止访问应用偏好和其他插件数据。

**范围**：

- 按 plugin ID 隔离 key-value namespace。
- 提供 get、set、delete、list 和容量查询 API。
- 限制单值、总容量、key 格式和序列化深度。
- 明确升级、禁用、卸载和清除数据行为。
- 存储损坏不能阻止 Host 启动。

**依赖**：Task 5.1、Task 5.3。

**完成标准**：两个插件无法读写彼此数据；数据可跨重启恢复；超限和损坏有稳定诊断。

- [ ] **Task 5.5：实现 Plugin Permission Management**

**OpenSpec change**：`add-plugin-permission-management`

**目标**：区分 Manifest 请求、用户授权、Host 支持和当前 session 有效权限。

**范围**：

- 建立 permission catalog、风险等级、授权状态和方法需求映射。
- 每次调用检查声明、Host 支持、用户授权和 session 状态。
- 禁止“Manifest 声明即授权”和“官方来源即自动授权”。
- 插件升级新增权限时暂停相关能力并要求重新确认。
- 权限撤销立即影响活跃 session。

**依赖**：Task 2.1、Task 5.1、Task 5.3。

**完成标准**：未声明、未支持、未授权和已撤销权限均被稳定拒绝；无法伪造 grant state。

- [ ] **Task 5.6：校验 RPC 输入、输出与资源限制**

**OpenSpec change**：`validate-plugin-rpc-contracts`

**目标**：在 Host API 执行前后校验 envelope、params、result 和错误语义。

**范围**：

- 使用共享 Schema 校验 request、response、event 和 error。
- 限制消息大小、嵌套深度、批量数量、并发和超时。
- 统一 InvalidRequest、InvalidParams、PermissionDenied、Timeout 和 InternalError。
- Host handler 的非法返回值转换为受控内部错误。
- 日志记录 plugin ID、method 和诊断，但不记录敏感 payload。

**依赖**：Task 5.1、Task 5.2、Task 5.3、Task 5.5。

**完成标准**：非法输入不进入 handler；非法输出不会到达插件；SDK 与 Host 错误含义一致。

### Milestone 5 完成标准

- 插件只能通过真实、类型化、版本化、来源校验和权限控制后的 Host API 使用能力。
- Contract、SDK、Host 和测试对方法与错误保持一致。
- Runtime、SDK transport、Host API、权限与 RPC 校验为正式项目模板提供稳定基础；本 Milestone
  仍不交付模板、CLI 或开发模式。

## Milestone 6：完善用户与开发者体验

- [ ] **Task 6.1：新增插件管理设置页面**

**OpenSpec change**：`add-plugin-management-settings`

**目标**：让用户通过 Host 设置页面管理本地插件和查看诊断。

**范围**：

- 将当前插件空占位替换为安装列表与详情页面。
- 展示名称、版本、来源、状态、兼容性、权限和最近错误。
- 提供本地安装、启用、禁用、卸载、升级和清除数据操作。
- 所有文案接入中英文 i18n，并支持 light/dark、键盘和焦点恢复。
- UI 只调用 typed service，不复制 Plugin Manager 业务逻辑。

**依赖**：Task 3.3、Task 3.4、Task 5.5。

**完成标准**：用户无需开发命令即可完成生命周期操作；失败状态具有可操作诊断。

- [ ] **Task 6.2：新增权限授权与撤销交互**

**OpenSpec change**：`add-plugin-permission-prompts`

**目标**：让用户在安装、升级和运行时清楚理解并控制权限。

**范围**：

- 安装前展示权限用途、风险和 Publisher 未验证边界。
- 对高风险权限单独确认，不使用默认全选。
- 设置页面支持查看、授予和撤销权限。
- 升级新增权限时阻止相关能力静默启用。
- 明确拒绝、稍后决定和权限被撤销后的插件体验。

**依赖**：Task 5.5、Task 6.1。

**完成标准**：用户选择与 Host grant state 一致；拒绝不会被静默转为授权；撤销立即生效。

- [ ] **Task 6.3：提供 Plugin Project Template**

**OpenSpec change**：`create-plugin-project-template`

**目标**：提供官方插件和第三方插件共同使用的最小项目模板。

**范围**：

- 提供 framework-neutral 和 React/Semi 两种模板入口。
- 包含 Manifest、Page、Action、构建、测试和本地验证示例。
- 默认只依赖公共 Contract、SDK、可选 UI 和 Testkit package。
- 示例使用纯前端无权限能力，避免在基础阶段依赖未实现 Host API。
- 自动验证模板可安装依赖、构建和打包。

**依赖**：Task 1.2、Task 1.3、Task 1.5、Task 3.1、Task 4.4、Task 5.2、Task 5.3、Task 5.6；
React 模板额外依赖 Task 1.4。

**完成标准**：从模板生成的新项目无需访问 lensX 源码即可完成构建和契约验证。

- [ ] **Task 6.4：提供 Plugin Developer CLI**

**OpenSpec change**：`add-plugin-developer-cli`

**目标**：提供 create、validate、inspect、build 和 pack 的可重复开发工作流。

**范围**：

- 建立 `@lensx/plugin-cli`，复用 Contract、Testkit 和包格式实现。
- 提供人类可读和机器可读诊断。
- `pack` 复用 Task 3.1 canonical payload，生成 checksums、构建摘要和 `.lxp`。
- CLI 与 Host installer 对同一输入给出一致结论。
- 第一阶段支持 workspace 内执行，稳定后发布 npm package。

**依赖**：Task 1.5、Task 3.1、Task 6.3。

**完成标准**：新项目可以一条命令验证并打包；CI 可以只依赖公开 CLI 验证插件。

- [ ] **Task 6.5：支持 Plugin Development Mode**

**OpenSpec change**：`add-plugin-development-mode`

**目标**：缩短本地开发反馈周期，同时保持正式 Runtime 和权限边界。

**范围**：

- 提供显式开启的开发目录安装和重新加载。
- 标识未打包、未签名和开发来源，不伪装为官方插件。
- 支持 Manifest、资源和 iframe session 手动 reload。
- 开发模式不得扩大 Host API 权限或跳过来源校验。
- 正式构建可以完全关闭开发入口。

**依赖**：Task 4.4、Task 6.4。

**完成标准**：开发插件可快速 reload；正式与开发状态清晰区分；安全边界保持一致。

- [ ] **Task 6.6：发布插件开发文档**

**OpenSpec change**：`publish-plugin-development-documentation`

**目标**：让仓库外开发者能够独立完成创建、开发、测试、打包和本地安装。

**范围**：

- 编写 Contract、SDK、UI、Testkit、CLI 和 Runtime 生命周期文档。
- 提供 framework-neutral 与 React/Semi 两条完整教程。
- 记录 Host API、权限、错误码、版本兼容和安全限制。
- 所有示例代码进入自动构建或类型检查。
- English 文档为 canonical，并维护对应简体中文镜像。

**依赖**：Task 6.4、Task 6.5。

**完成标准**：全新外部仓库不读取 lensX 私有源码即可按文档产出可安装插件。

### Milestone 6 完成标准

- 用户具备图形化生命周期和权限管理入口。
- 开发者具备基于真实 Runtime 与 Host API 的正式项目模板、公共 CLI、开发模式和双语文档闭环。
- 完成 Milestone 1–6 后达到 **Plugin Developer Preview**。

## Milestone 7：落地官方插件并完成平台加固

- [ ] **Task 7.1：建立官方插件发布流水线**

**OpenSpec change**：`add-official-plugin-release-pipeline`

**目标**：让 `plugins/official/*` 可以独立版本、验证、构建和发布，而不绑定 lensX 应用版本。

**范围**：

- 每个官方插件拥有独立 package、Manifest、SemVer、CHANGELOG、测试和 CODEOWNERS。
- 使用 path filter 和 changeset 触发单插件 release。
- 发布前运行 Contract、SDK、包格式、权限、Runtime 和 E2E gate。
- 产出与外部插件相同的 `.lxp`，不得由 Host 直接 import 源码。
- 记录官方发布来源，但不自动授予权限。

**依赖**：Task 3.1、Task 6.4、Task 6.6。

**完成标准**：一个官方插件可单独发版且不触发桌面应用发布；产物可由普通安装器验证。

- [ ] **Task 7.2：交付首个无权限官方插件**

**OpenSpec change**：`add-official-json-tools-plugin`

**目标**：以纯前端 JSON 工具插件验证公共平台，而不是依赖 Host 私有代码。

**范围**：

- 在 `plugins/official/json-tools` 实现格式化、压缩和基础校验页面。
- 通过 Manifest 贡献 Page 和 Page-only Actions。
- 只依赖公开 Contract、SDK、可选 UI 和 Testkit。
- 不申请系统权限，不 import 根应用 `src/app/**`。
- 使用正式 CLI、包格式、安装器和 Runtime 完成 dogfood。

**依赖**：Task 4.4、Task 6.4、Task 7.1。

**完成标准**：官方 JSON 工具从独立产物安装、搜索、打开、关闭、禁用、升级和卸载均通过。

- [ ] **Task 7.3：交付首个权限型官方插件**

**OpenSpec change**：`add-official-clipboard-tools-plugin`

**目标**：用剪贴板工具验证真实 Host API、权限提示、撤销和升级权限差异。

**范围**：

- 使用公开 SDK 调用受控 clipboard read/write API。
- Manifest 声明权限与中英文原因。
- 覆盖拒绝、授予、撤销、Host 不支持和新增权限升级场景。
- 不直接调用浏览器或 Tauri 剪贴板能力。
- 独立版本和发布，不与 JSON 工具共享生命周期。

**依赖**：Task 5.5、Task 6.2、Task 7.1、Task 7.2。

**完成标准**：权限选择始终由 Host 强制；官方来源不能绕过拒绝或撤销。

- [ ] **Task 7.4：加固插件包摄入**

**OpenSpec change**：`harden-plugin-package-ingestion`

**目标**：系统化防御恶意、异常和跨平台不一致的插件包。

**范围**：

- 扩展受限 Zstandard/TAR、路径穿越、特殊 entry、compression bomb、重复路径、保留名称和大小写冲突测试。
- 限制压缩前后大小、文件数、路径长度和嵌套深度。
- 验证 macOS、Windows 和 Linux 路径行为。
- 安装失败不得泄露主机绝对路径或留下 staging 数据。
- 建立恶意插件包 fixture corpus。

**依赖**：Task 3.2、Task 3.4。

**完成标准**：恶意包测试集全部被拒绝；任何失败都不污染正式安装目录。

- [ ] **Task 7.5：限制插件 Runtime 资源**

**OpenSpec change**：`add-plugin-runtime-resource-limits`

**目标**：防止单个插件通过 iframe、RPC 或持续失败影响 Launcher 稳定性。

**范围**：

- 限制 iframe 实例、RPC 并发、pending call、消息大小、频率和执行时间。
- 处理重复崩溃、持续 reload、握手风暴和加载超时。
- 超限时隔离插件，不终止 Host。
- 建立压力测试和恢复策略。
- 资源限制错误可在插件管理页面诊断。

**依赖**：Task 4.4、Task 5.6。

**完成标准**：滥用测试不会导致 Launcher 无响应；超限插件可暂停、诊断和恢复。

- [ ] **Task 7.6：建立插件系统端到端验证**

**OpenSpec change**：`add-plugin-system-e2e-tests`

**目标**：用自动化验证覆盖 Contract 到正式插件发布的完整闭环。

**范围**：

- 覆盖 build、pack、install、register、search、open、RPC、permission 和 close。
- 覆盖 disable、upgrade、rollback、uninstall、restart 和数据保留。
- 覆盖伪造来源、过期 session、跨插件访问、恶意包和 Runtime 滥用。
- 将官方无权限和权限型插件作为真实 fixtures。
- 保留 Rust focused、前端 boundary、CLI integration 和 Tauri E2E 分层。

**依赖**：Task 7.2、Task 7.3、Task 7.4、Task 7.5。

**完成标准**：主流程和主要安全失败均有可重复 CI 证据，失败可定位到具体平台层。

### Milestone 7 完成标准

- 官方插件完全使用公开平台能力并可以独立发布。
- 无权限和权限型插件均完成真实 dogfood。
- 平台具备包摄入、Runtime 限制和端到端安全验证。
- 完成 Milestone 1–7 后达到 **Plugin Platform Beta**。

## Milestone 8：建立可信插件分发生态

- [ ] **Task 8.1：支持插件包签名与 Provenance**

**OpenSpec change**：`add-plugin-package-signing-and-provenance`

**目标**：验证插件包内容与发布来源，为官方和第三方分发建立统一信任基础。

**范围**：

- 定义覆盖完整 canonical `.lxp` digest 的签名格式、签名范围和发布者公钥身份，或使用独立外层/sidecar。
- CLI 支持签名与离线验证，Host 安装和升级时复验。
- 区分 official、verified publisher、unsigned local 和 development 来源。
- Provenance 由 Host 注入，不写入 author Manifest。
- 私钥不由桌面 Host 托管，包内容变化必须使签名失效。

**依赖**：Task 6.4、Task 7.1、Task 7.4。

**完成标准**：官方和第三方使用相同签名格式；篡改包无法安装；来源不改变权限结果。

- [ ] **Task 8.2：建立信任、密钥轮换与撤回**

**OpenSpec change**：`add-plugin-trust-and-revocation`

**目标**：阻止已撤回、密钥失效或确认恶意的插件版本继续传播和运行。

**范围**：

- 定义 publisher、key、plugin version 和 package hash 的信任状态。
- 支持密钥轮换、版本撤回、恶意 hash 阻断和缓存过期。
- 定义离线状态下的最后可信 snapshot 和降级策略。
- 已安装撤回版本进入受限状态，但不得静默删除用户数据。
- 提供用户可见诊断与恢复路径。

**依赖**：Task 7.5、Task 8.1。

**完成标准**：撤回版本不能新安装或升级；已安装实例得到一致、可解释的受限处理。

- [ ] **Task 8.3：实现插件更新管理**

**OpenSpec change**：`add-plugin-update-management`

**目标**：提供可验证、可授权、可回滚的远程更新流程。

**范围**：

- 定义更新元数据、版本比较、渠道和手动检查更新。
- 下载后复用 hash、签名、兼容性、包摄入和权限差异校验。
- 新权限必须重新授权；不兼容版本不得静默启用。
- 复用本地升级事务和回滚能力。
- 自动更新作为显式策略，不作为首个生态版本默认行为。

**依赖**：Task 3.4、Task 8.1、Task 8.2。

**完成标准**：更新失败恢复旧版本；来源、权限或兼容性异常版本不能静默生效。

- [ ] **Task 8.4：建立远程 Plugin Catalog**

**OpenSpec change**：`add-plugin-catalog`

**目标**：提供可验证、可缓存的官方和第三方插件发现目录。

**范围**：

- 定义 Catalog Schema、分页、搜索、版本、权限和兼容性元数据。
- Catalog 只提供发现和下载信息，不直接获得安装或 Host 权限。
- 官方插件和 verified publisher 使用同一 Schema，通过 provenance 区分。
- 支持缓存、离线浏览、撤回同步和服务失败降级。
- 下载后仍必须经过本地安装器全部校验。

**依赖**：Task 8.1、Task 8.2、Task 8.3。

**完成标准**：用户可查询可信目录；伪造 Catalog 元数据不能绕过本地校验。

- [ ] **Task 8.5：新增 Plugin Marketplace**

**OpenSpec change**：`add-plugin-marketplace`

**目标**：在可信安装、签名、更新和 Catalog 稳定后提供完整分发体验。

**范围**：

- 提供浏览、搜索、详情、安装、更新、禁用和卸载入口。
- 展示权限、发布者、provenance、版本、兼容性和信任状态。
- 支持下载进度、失败重试、回滚和撤回诊断。
- 与本地管理 UI 共享 Installer、Plugin Manager 和 permission services。
- 网络不可用时不得影响本地 Launcher 和已安装插件。

**依赖**：Task 6.1、Task 8.3、Task 8.4。

**完成标准**：Marketplace 操作始终复用本地安全管线；完成后达到 **Plugin Ecosystem**。

### Milestone 8 完成标准

- 插件具备统一签名、来源、撤回、更新、Catalog 和 Marketplace 闭环。
- 官方和第三方插件共享平台与分发协议，只在 provenance 和维护责任上区分。

## Release Checkpoints

### Local Plugin Preview

包含 Milestone 1–4。

- 本地 `.lxp` 可以安装、注册、搜索、打开、关闭、禁用和卸载。
- 重启后插件状态可恢复。
- 插件资源、iframe 和 session 具备基本隔离。
- Host API 仍可能只具备 Runtime 基础握手，不承诺系统能力。

### Plugin Developer Preview

包含 Milestone 1–6。

当前进度：Contract、SDK、可选 UI 与 Testkit core 已完成；注册、包生命周期、隔离 Runtime、
Host API、正式项目模板和开发者工具仍待完成，因此尚未达到本 checkpoint。

- 内外部开发者可以消费 Contract、SDK、可选 UI、Testkit 和正式项目模板。
- 本地插件可以通过公共 SDK、真实 iframe transport 和 Host API 完成受控执行。
- 开发者可以使用公共 CLI、开发模式和双语文档完成创建、验证、打包与本地安装。

### Plugin Platform Beta

包含 Milestone 1–7。

- 真实 Host API、权限、用户管理和开发者工具形成闭环。
- 官方插件通过与外部插件相同的公共路径完成 dogfood。
- 主流程、恶意包、伪造 session 和资源滥用具备自动化验证。

### Plugin Ecosystem

包含 Milestone 1–8。

- 插件具有签名、provenance、撤回、更新、Catalog 和 Marketplace。
- 远程分发复用本地 Installer、Registry、Permission 和 Runtime 核心。

## 暂缓方向

以下能力不进入 Plugin Platform Beta，必须通过独立 OpenSpec change 重新评估安全边界：

- Sidecar 和任意子进程执行。
- 插件注入 Rust、动态库或主进程原生模块。
- 后台常驻插件和无界定时作业。
- 任意文件系统访问。
- 任意网络访问、自定义代理或任意请求头。
- 插件之间直接通信。
- 流式 RPC 和大文件传输。
- 云同步插件状态与权限。
- 共享 Host React、Semi Design 实例或应用私有 Context。
- 绕过签名、权限或本地校验的官方插件特殊通道。

## OpenSpec 执行规则

- 开始 Task 前运行 `openspec list --json`，检查活动 change 和依赖状态。
- 直接使用 Task 指定的 OpenSpec change 名，不创建同义或重复名称。
- 使用 `openspec status --change <name> --json` 获取真实 artifact 顺序和路径。
- proposal、design、delta spec 和 tasks 默认使用中文；稳定 specs 保持 English。
- 每个 change 保持单一 Task 范围；跨 Task 新需求进入对应后续 change。
- 实施状态以源码、测试和验证结果为准，不能只根据 tasks checkbox 判断。
- 实现按 tasks 顺序执行，并在每个步骤验证后更新 checkbox。
- 每个 change 都要验证适用的 Contract、SDK、CLI、示例、前端、Rust/Tauri 和 E2E 层。
- 最终验证必须包含格式、静态分析、类型检查、测试和构建；不适用项需说明原因。
- 修复引入的全部 warning 和 error，并重新运行失败命令和完整最终验证集。
- 同步 English 稳定 specs 后才能归档 change。

## Roadmap 维护规则

- Task 开始时增加状态与对应 change 链接，但 Roadmap 状态不能替代 OpenSpec 状态。
- Task 完成后以源码、测试和 archive 证据更新当前基线和 Release Checkpoint。
- 新增 Task 必须使用唯一 kebab-case change 名，并明确依赖和完成标准。
- 如果平台公共边界发生 breaking change，先更新 Contract、SDK 和兼容策略，再调整插件。
- 官方插件需求发现的通用能力必须回到公共平台设计，不能只在官方插件中添加私有入口。
