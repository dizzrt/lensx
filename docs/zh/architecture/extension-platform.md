# 扩展平台

## 文档状态

本文区分已经交付的静态插件 Manifest 契约、`.lxp` package inspection 与本地安装、Plugin SDK
foundation、Plugin Testkit、可选 Plugin UI package、Host 私有 Plugin surface 投影与 Page 导航、
Host 私有生命周期控制、本地 package replacement、Host 私有 scoped resource service、隔离 iframe
Runtime、进程内 Runtime Session、公共 SDK iframe transport、Host 私有 Port adapter 与公共 Host API
语义契约和预期的运行时扩展边界。原 permission core 与 native clipboard provider 已删除。公共
Plugin Developer CLI 与项目模板、完整前台插件执行 lifecycle、Host 私有管理 surface，以及
feature-gated Plugin Development Mode 也已交付。仓库还交付了独立官方插件 `.lxp` release
流水线，以及 Host 会忽略的外部 audit sidecar。npm 发布、签名、Marketplace 分发、远程更新、
decision history 和用户主动 rollback history 当前尚未实现。稳定 spec 和源码共同决定已经交付的子集；
外部作者应从[插件开发入口](../plugin-development/index.md)开始。

## 目标

扩展平台应当允许 lensX 暴露本地工作流，同时避免不受信任的代码访问具有特权的应用内部实现。
它应当提供：

- 可搜索的启动器 action；
- 通过明确 action 打开的页面；
- 开放隔离 Web 执行；
- 本地化名称和搜索别名；
- 版本化兼容边界；
- 可预测的生命周期和诊断。

## 概念模型

```text
Plugin
├── 元数据与兼容性
├── pages
├── actions ───────────────▶ 目标 pages
└── runtime
    ├── 可信 Host module
    └── 隔离的外部 iframe
```

归属和引用必须明确。插件、页面、action 和其他可引用资源使用的 ID 必须在全局范围内
没有歧义。

## 契约分层

平台区分：

1. 作者可控的 manifest 输入；
2. 经过校验和规范化的插件元数据；
3. 可信的 Host 注册元数据；
4. 向活动插件暴露的运行时上下文。

插件作者不能声明安装来源或 Host 所有的生命周期策略等可信事实。Host 在完成校验后
补充这些事实。

序列化契约应当具有唯一的版本化 schema 来源，并在 TypeScript 和 Rust 中进行一致校验。
跨边界暴露的校验错误必须包含稳定、机器可读的代码和位置。

## 已交付的公共契约与静态 Manifest

lensX 已交付可发布的 `@lensx/plugin-contract@0.2.0` workspace package。根 export 提供
Manifest/Host API 版本、生成输入类型、规范化值、稳定诊断、catalog 与纯 validator。Manifest
Schema 入口是 `@lensx/plugin-contract/schema` 与
`@lensx/plugin-contract/manifest.schema.json`；Host API Schema 入口是
`@lensx/plugin-contract/host-api-schema` 与
`@lensx/plugin-contract/host-api.schema.json`。未声明的 deep import 不受支持。

package 拥有作者可控的 `manifest_version: "0.2.0"` 协议，并将其实现为严格的 Draft
2020-12 JSON Schema。Schema 是 wire format 的结构真源，已提交的 `PluginManifestInput`
由它确定性生成。package TypeScript 实现与明确的 Rust 模型读取相同的 package-owned valid、
invalid、normalized 和 incompatible fixtures，从而保持 validity、compatibility、规范化输出
及诊断 `code`/`path` 一致。

项目自有的完整示例位于
[examples/plugin-contract-consumer/manifest.json](../../../examples/plugin-contract-consumer/manifest.json)。

### 字段模型

| 字段 | 契约 |
| --- | --- |
| `manifest_version` | 必填，且必须精确等于 `0.2.0`。 |
| `plugin_id` 和 `version` | 必填的稳定命名空间插件 ID 和 SemVer 发布版本。 |
| `display` | 必填的本地化 `name`；可选本地化 `description` 和包内 asset `icon`。 |
| `publisher` | 必填的作者声明 `author`、HTTPS `homepage` 和 HTTPS `repository`；三者都不建立信任。 |
| `compatibility` | 必填的 `lensx` 和 `host_api` SemVer 半开区间。 |
| `runtime` | 必填 `kind: "iframe"` 和包内 HTML `entry`；它只是元数据，不会创建 iframe。 |
| `contributes.pages` | 一个或多个具有唯一 ID 的 Page，包含本地化标题、内部 route，以及可选 parent/icon。 |
| `contributes.actions` | 可选的唯一 Action，包含本地化标题/描述、Action 自有的 `default_keywords`、可选 icon 和只指向 Page 的 target。 |
| `contributes.launcher` | 可选的 `default_action_id`，引用一个已贡献 Action；它不实现排序或注册。 |

用户可见的本地化文本在去除首尾空白后必须包含非空 `en-US`，并可提供 `zh-CN`；消费方回退到
英文。未知 locale key 和未知字段会被拒绝。缺失的可选集合规范化为空集合，而显式 `null`
始终无效。

Page 和 Action ID 都是插件内本地 ID。Host 私有 Plugin Action 投影会把全局 Action ID 派生为
`<plugin_id>.<local_action_id>`；公共校验器本身不会执行该投影。Page parent 引用必须存在，
且整个图必须无环。每个 Action target 必须是
`{ "kind": "page", "page_id": "<local-page-id>" }`。Action 关键词始终归属于对应 Action，
不会成为插件级别的共享别名。

### 校验、规范化与兼容性

`validatePluginManifest(unknown)` 执行严格 Schema 与语义检查，返回确定性的 invalid 诊断
或不透明的成功校验结果。只有该成功结果才能传给
`normalizePluginManifest(result, currentVersions)`；后者应用确定性的 trimming/defaults，
并返回 `compatible` 或 `incompatible`。两个函数都不会修改作者输入。公开诊断是可序列化的
`{code, path, message}` 对象，使用 JSON Pointer path，并依次按 `path` 和 `code` 排序。

插件版本和兼容边界使用 SemVer，包括预发布版本优先级。当前版本满足
`min_version <= current < max_version_exclusive` 时兼容。结构和语义有效、但超出任一范围的
Manifest 是 `incompatible`，而不是 `invalid`。

规范化 Manifest 只包含作者声明的数据和确定性默认值。它不能包含 executor、函数、React 或
Tauri 值、Rust 实现对象，或 `source`、`lifecycle`、`enabled`、安装路径、签名、runtime、CSP、
sandbox、network policy、native capability、permission 或 grant 等 Host-owned 字段。Publisher 元数据
是不受信任的作者输入，不能单独用于建立信任。

Contract package 版本、Manifest 协议、Host API 协议与 lensX 应用版本都从 `0.1.0` 起步，
但此后独立演进。package 实现修复不会改变 wire protocol；Manifest 或 Host API 的 breaking
change 更新各自版本维度。当前契约不提供更早 Schema、deprecated symbol alias、兼容 adapter
或迁移分支。

运行 `pnpm run generate:plugin-manifest-types` 与
`pnpm run generate:plugin-host-api-types` 可重新生成已提交的输入类型，运行
`pnpm run check:plugin-contract` 可执行完整 drift gate。门禁覆盖生成类型、package tests、Host
边界、Rust 共享 fixtures，以及把真实 tarball 安装到隔离外部消费者中的验证。tarball 只包含
运行时 JavaScript、声明、两个公共 JSON Schema 和 package metadata，不包含 tests、fixtures、生成
scripts 或 Host 私有源码。

### 静态校验范围外的能力

静态校验本身不会发现或安装包、创建生产 registration 或 iframe、交换 Host API 消息或
运行插件代码。下文的 Host 私有 capability 会把一个用户选中的兼容 `.lxp` 添加为 external
registration，把 current Registration facts 投影进 Page 与 Action Registry，并且只在 eligible Plugin
Page active 时创建隔离 iframe。Runtime Session 与 Host API 执行是独立 capability；其中下文的
Host 私有进程内 Runtime Session 与公共语义契约已经交付。

## 已交付的公共 Host API 语义契约

`@lensx/plugin-contract` 现在持有 Host API protocol `0.2.0`：闭集 Draft 2020-12 Schema、
生成的 TypeScript 输入、深度冻结的规范值、不可变 catalog，以及接受 `unknown` 的纯 validator。
TypeScript 与测试专用 Rust consumer 读取同一批 package-owned valid/invalid fixtures，并对
validity 及按 JSON Pointer 排序的诊断 `code`/`path` 达成一致。

catalog 精确包含以下方法：

| 范围 | 方法 |
| --- | --- |
| Runtime | `runtime.get_context` |
| 当前 Page 与 Action | `ui.close`、`actions.open` |
| 插件私有 storage | `storage.get`、`storage.set`、`storage.delete`、`storage.list`、`storage.get_quota` |

`PluginRuntimeContext` 由 Contract 与 SDK 共享，只包含 `hostApiVersion`、locale、theme 与排序去重的
当前可调用 method ID snapshot。空 capability 有效。`runtime.context_changed` 携带完整 replacement
Context，而不是 patch。capability 表示当前 Host 支持与实现可用。plugin identity、Page、source、
Manifest 数据、path、permission/grant fact 与 executor 都会作为作者可控 Context/method 字段被拒绝。
Worker、network、远程资源、Blob/Data、WASM 和 browser storage 不是 Host API method，不进入 Context。

Host API error 使用稳定闭集 code 与有界安全英文 message，并与 SDK 的 `disconnected`、`disposed`、
`transport_failure` 等 lifecycle error 保持可判别。package、Manifest protocol、Host API protocol、SDK
与应用版本独立演进。兼容新增 method 需要 Host API minor 版本并通过 capability discovery 暴露；
不兼容改形或删除需要 major 版本，且删除前必须先废弃。

本次交付是可独立消费的语义契约，不是执行路径。它不注册 Tauri command，也不实现 iframe
transport、私有 RPC envelope、request ID、Dispatcher、Action/close 副作用、storage persistence、
clipboard native 调用、permission decision 或 RPC resource limit。`system.open_external` 与外链权限
明确不作为占位能力发布。

## 已交付的 Host 私有 Plugin Package Inspection

lensX 现已实现 package protocol `0.1.0`：`.lxp` 是一个受限 Zstandard frame，其中包含 canonical、
ustar-compatible TAR 流。workspace-private TypeScript reference packer/inspector 与 Host-private Rust
inspector 共享已提交的 valid、invalid、incompatible 和 reproducible fixtures。两侧对 status、normalized
Manifest、compatibility、受限 file facts、安全 diagnostics 以及完整 `.lxp` 的 SHA-256 digest 达成一致。

Inspector 验证单 frame Zstandard profile、canonical TAR 顺序和 metadata、可移植 paths、硬资源 limits、
canonical `checksums.json`、每文件 SHA-256、现有 Manifest Contract，以及精确的 Runtime/asset resource
resolution。Invalid 结果 fail closed，不返回 partial Manifest、file map、可信 digest fact、raw error、绝对
path 或 Host state。Publisher 文本和 author 声明的 Host 字段永远不会生成 source、signature、grant、
lifecycle 或 trust 结论。

这是 inspection core，不是 installer 或 plugin-facing API。它没有 Tauri command、Plugin Manager mutation、
安装目录写入、公共 CLI、development-directory input、resource service、iframe、Runtime session、权限决策或
签名行为。精确 layout、limits、dependency review、diagnostics 与 drift gate 见
[插件包格式](plugin-package-format.md)。

## 已交付的 Host 私有 Plugin Manager

Rust Host 现已交付一个 Plugin Manager 实例。Tauri setup 从 `app_config_dir` 初始化该实例，并通过
Tauri managed state 在 Host 内部共享。它仍然是 Host 私有核心。它的读取投影是下文所述的私有
Registration Contract，而当前生产写入方是下文的本地安装协调器和 Host 私有生命周期协调器。
没有暴露通用的插件侧生命周期 API、前端管理界面或插件执行路径。

每个健康条目明确区分四种生命周期：

- 经过校验的 normalized Manifest 只包含作者可控数据和确定性默认值；
- 持久化的 Host registration facts 包含安装路径、由 Host 提供且带算法标签的包摘要、Host 控制的
  source、enabled intent，以及最多最近 32 条规范且安全的诊断；
- 每次构造或恢复记录时，都根据 Manifest 范围以及当前 lensX 和 Host API 版本重新计算
  compatibility；
- Runtime 状态只属于当前进程，并且在本基础中始终以 `inactive` 恢复。

Host 控制的 source、作者声明的 publisher 数据和官方 provenance 声明都只是存储或展示事实；
它们都不能建立信任或创建生命周期豁免。

Plugin Manager 专用 Store 为每个插件使用一个 version 2 JSON 记录。确定性的十六进制编码 record
key 构成安全文件名。每次转换先校验完整 next record，在同目录写入唯一临时文件并刷新，然后只对
该插件的目标记录执行原子替换。只有持久化成功后，Manager 才发布新的内存 snapshot。临时文件创建、
写入、刷新或替换失败都会保留原有内存和磁盘状态；恢复时忽略未完成的临时文件。

启动时会独立读取每条记录。语法损坏、未知格式版本、record key 与 Manifest identity 不一致，或
registration facts 不一致的记录会变成内存中的 quarantine stub，并携带稳定、安全的恢复诊断。
原文件保持不变，其他健康记录继续加载。如果整个 Store 目录不可读，Manager 会以空健康集合和
manager-level degraded 恢复报告启动；Tauri 启动仍然完成，也不会覆盖不可读数据。清除 quarantine
要求可信 Host 调用方使用完整有效记录进行原子替换，其中 enabled intent 必须显式提供。

这一内部状态只表示 Host 已知一条 installed registration。本地安装器可以为一个选中的兼容包建立
package digest、payload 和首条 external registration。生命周期协调器可以通过绑定 revision 的 opaque
identity 原子更新 enabled intent，或移除健康、quarantine 条目。Manager record 本身仍不能证明发现
来源。更新、权限决策、Runtime session 和面向插件的公共 registration API 仍是独立能力。

## 已交付的 Host 私有插件开发模式

feature-gated 插件开发模式在同一个 process-local Plugin Manager snapshot 中加入
`source=development` 条目，同时保持 version-1 Store format 不变。专用 build capability 与 native
process switch 都默认关闭；正式 frontend/native artifacts 不会注册其 state、commands、picker、
coordinator 或 UI。

native 文件夹选择器提供 Host-private directory capability。bounded inspector 只接受由普通文件组成的
自包含 `dist/` payload，然后通过已 flush 的 staging tree，把它复制到
`app_cache_dir()/plugin-development/<process-session>/` 下随机、不可变的 current generation。
Manager facts 私有保留 source capability 供手动 reload；Resource 与 Runtime 只使用 Host-owned current
snapshot。内部 domain-separated `sha256-development-tree-v1` identity 不是 `.lxp` package digest。

register、reload、remove 与 mode shutdown 都是串行的 revision-bound transactions。Manager commit
会推进 Resource generation，旧 Resource URL 立即失败；macOS navigation policy 会在清理旧 snapshot
前撤销匹配插件的 current lease。frontend surfaces 在 native transition 前 quiesce，并在之后完整重读
Registration state，因此 event 丢失不会成为 authority。reload 总会发布新 generation，且不会增加 watch 或 retry。

development entries、diagnostics、source capabilities、snapshots 与 Runtime activity 都只存在于
当前进程。remove 与 mode shutdown 会保留插件数据与 Launcher collections，并且不改变正式安装包、
quarantine records 或其他插件。bounded cleanup failure 永远不会恢复已撤销的 authority。操作流程与限制见
[插件开发模式](../development/plugin-development-mode.md)。

## 已交付的 Host 私有从本地文件安装插件

设置页的 Plugins tab 提供一个 Host-owned **从本地安装** 操作。“本地”只描述本次安装来源，
不是一种独立的插件类别。无路径参数的
`install_local_plugin` command 打开原生文件选择器并只选择一个 `.lxp`；取消选择返回普通的
cancelled 结果。前端只会看到严格的 installation contract `0.3.0` 成功、取消或有界错误值，
不会提供或接收所选 source path、package digest、installation path、Store key、原始 native error
或内部恢复事实。

Rust 协调器先检查 source metadata，再把所选普通文件一次性读入有上限的不可变 byte buffer，并确认
文件在读取期间没有增长、截断或变化。只有 `compatible` inspection 才能继续。Inspection 与 extraction
复用同一个 canonical Zstandard/TAR traversal 和 limits。Extraction 使用 `create_new` 把普通文件写入
新的 Host-owned staging directory，再次校验 entry facts 与 checksums，刷新文件和目录，并且绝不调用
通用 archive unpack 操作。

Installer state 位于 `app_local_data_dir()/plugins`，与 Manager Store 相互独立。一个进程内 mutex 和
跨进程 `.install.lock` 会串行化 recovery、installation 与 lifecycle cleanup。Staging 使用
`.staging/<random-id>`，已提交 payload 使用
`packages/<v1-plugin-id-utf8-lowercase-hex>/<package-sha256>`，按需插件数据使用
`data/<v1-plugin-id-utf8-lowercase-hex>`，持久 cleanup intent 使用
`.cleanup/<v1-plugin-id-utf8-lowercase-hex>.json`。首次安装不会创建 plugin data directory。这是
single-active-registration digest layout。首次安装仍拒绝已有健康或 quarantine identity；下文独立的
replacement workflow 可以为同一健康 identity 提交另一个兼容 digest，但不会改变首次安装 command
的语义。

在已刷新的 staging directory 于同一文件系统原子 rename 后，协调器使用完整 Host facts 注册 normalized
Manifest：已提交绝对路径、带算法标签的 digest、`source=external`、`enabled=true` 和
`inactive` Runtime。已有健康 registration 或 quarantined identity 会在 commit 前 fail closed。Manager
持久化失败会回滚 payload，或留下可证明的 orphan 供 recovery 处理；changed event 发送失败不会撤销
已经成功持久化和发布的 registration。

Installer startup recovery 只会在 Plugin Manager recovery 之后、并在同一个共享 commit boundary 下
运行。它先恢复 cleanup record，再处理 orphan；清理合法的废弃 staging directory，并且只删除能够
证明没有 owner 的 canonical digest payload。Cleanup record 会在 Manager removal 前持久化，并记录
插件数据应保留还是删除；重试是幂等的，completed evidence 只会在同 identity reinstall 成功提交后
清除。Recovery 会保留冲突或 malformed cleanup evidence、健康 installation path、没有合法 cleanup
intent 的 quarantine-key subtree、未知 entry、symlink 以及 installer root 之外的任何内容。证据不可读
或不一致时，installer 会转为 unavailable 或 degraded，而不会进行推测性清理。

Installer root 属于 application-local data。在 macOS 上，它与已签名的 `lensX.app` bundle 分离，通常位于
应用的 Application Support 区域；直接删除 `lensX.app` 并不能保证这些数据被清理。Host 私有 plugin
uninstall 与本地 replacement 已在下文交付；专用应用卸载器、远程更新策略和用户主动 rollback
history 仍需要后续已接受 change。

## 已交付的 Host 私有 Registration Contract

Host 现已通过 Registration Contract version `0.3.0` 投影 managed Plugin Manager。该 contract
只在 Rust、Tauri 与根应用 TypeScript 之间私有共享。`@lensx/plugin-contract`、
`@lensx/plugin-sdk` 和其他插件 package 都不会导出它；workspace boundary 会拒绝官方插件与
示例插件导入其类型、desktop adapter 或 event 入口。

该边界明确区分四层：author input、normalized Manifest、Host-owned registration summary/detail，
以及当前进程的 Runtime status。`read_plugin_registration_snapshot` 返回按 opaque entry identity
确定性排序的严格 `registered | quarantined` summary，以及 `available | degraded` Manager
availability。`read_plugin_registration_detail` 只接受合法 opaque entry identity，并返回绑定 revision
的 registered 或 quarantine detail。健康详情包含 normalized Manifest、`builtin | external | development` source、
enabled intent、逐维 compatibility、有界安全诊断，以及当前唯一的 `inactive`
Runtime variant。quarantine 详情只包含 opaque identity、可选的已验证 plugin ID 和一条安全诊断。

每个 snapshot、detail response 和 `plugin-registration://snapshot-changed` event 都携带独立的
Registration Contract version。revision 是只在当前进程内单调递增的十进制字符串；重启恢复会从
新的 revision 序列开始，不改变持久化 Store format。真实状态转换只有在完整记录成功持久化并发布
next in-memory state 后才递增 revision。拒绝、失败和 no-op 转换都不会产生 revision 或 event。
changed event 只包含 contract version 与 revision；它是失效提示，不是 patch 或历史记录。

私有 TypeScript adapter 会先订阅再执行首次完整读取，把所有 command/event 值作为 `unknown`
校验，深度冻结接受的 payload，把并发通知合并为串行刷新，并在 revision 变化时使 snapshot 与 detail
cache 失效。监听恢复和 Launcher activation 后会执行完整刷新；detail 与 snapshot revision 不一致时
会重新读取。稳定 query error 只暴露 `code`、`operation` 与安全英文 message。

该 contract 永远不暴露安装路径、package digest、Store key 或文件名、损坏记录内容、原始异常、
stack、函数或 Tauri 对象。publisher、source 与 enabled intent 是相互独立的事实；任何一项都不能
建立信任。该 contract 不会安装、
更新、卸载、enable、disable、执行或渲染插件。Registration Contract 本身仍然只读；下文的 Host
私有 lifecycle 与 Action 投影核心消费它，但不改变 wire contract。管理 UI、真实 Runtime session、
Host API method 已在本文其他章节交付；decision history 与签名仍未实现。

## 已交付的 Host 私有 Plugin Lifecycle Controls

根应用现已交付 Plugin Lifecycle Contract version `0.1.0`，用于 enable、disable 与 uninstall 操作。
该 contract 只在 Rust、Tauri 和根应用 TypeScript 之间私有共享，不由任何公共 plugin package 导出。
请求只接受 opaque registration entry identity，以及调用方所观察到的精确 snapshot revision。未知字段、
stale revision、unmanaged entry、Manager unavailable，以及不受支持或不安全的 cleanup target 都会
fail closed；有界 code 和 message 不暴露路径、record key、损坏数据、原始异常或 stack。

Enable 与 disable 会原子更新 Host-owned enabled intent，不改变 source、compatibility fact 或
Runtime state。兼容与不兼容的健康 registration 都可独立保留 enabled intent；quarantine entry 不能
被 enable。真实变化会递增 Registration revision，并发送既有 snapshot-changed invalidation hint；no-op
保留 revision。Event 发送失败不会回滚已持久化状态。

Disable 或 uninstall 到达 Rust 前，TypeScript lifecycle service 会先 quiesce provider 的 Action surface，
再 quiesce Page surface。任一步失败都不会调用 Rust，并按 Page 后 Action 的顺序恢复先前 surface。
关闭当前活动的插件 Page 时，会先把导航返回 Home，再注销 Page。Rust command 失败时也会尝试同样
恢复；command 成功后，service 会通过共享 Registration adapter 主动刷新，直到观察到返回的 revision。
因此 event 丢失只会形成可恢复的 invalidation gap，不会留下 stale search、Recent、Pinned、dispatch
或 navigation 状态。Enable 会先在 Rust 中提交，再从返回 revision 收敛 provider surface。

Uninstall 必须显式选择 `retain_data` 或 `delete_data` policy。Host 会先证明 program 与可选 data subtree
是各自专用 root 下规范且真实的 descendant，再持久化 cleanup intent。之后它原子移除 Manager entry，
并执行幂等 program/data cleanup。逻辑 removal 后的 cleanup 失败会返回成功和
`cleanup_pending=true`，并在重复操作或 startup recovery 中通过同一进程内、跨进程 commit boundary
继续执行。Malformed、冲突、symlink 或 root 之外的 evidence 会被保留，并阻止破坏性 cleanup。

专用 Rust、TypeScript、surface convergence、workspace boundary 与公共 package 打包门禁是
`pnpm run check:plugin-lifecycle-controls`。这些控制有意不增加管理 UI、plugin Runtime、native capability、
公共 lifecycle API、应用卸载或 replacement 行为；replacement 是下文独立的私有能力。

## 已交付的 Host 私有本地插件替换

根应用现已交付独立的私有 Plugin Replacement Contract `0.2.0`。无路径参数的 prepare command
只接受当前健康 entry identity 与调用方观察到的 Registration revision，打开一个原生 `.lxp` picker，
并返回 `cancelled`、`duplicate` 或有界 `prepared` 结果。Prepared 结果包含进程内 opaque token、
from/to version、`upgrade | downgrade | reinstall` 分类与安装信任边界；不会包含
source/staging path、package digest、Store key、package bytes 或原始 native error。Commit 与 cancel
只接受该 token 及其原 entry/revision 绑定。Contract、desktop adapter、token 与 service 都不会向公共
package 或插件代码开放。

Prepare 复用首次安装的不可变 capped source read、package inspection、compatibility policy 与受限
extraction。完整 package digest 相同即为 `duplicate`，不会创建 token。否则 SemVer 顺序只分类用户
显式选择，不阻止 compatible downgrade 或同版本 reinstall。plugin ID 不匹配、quarantine entry、当前
path/digest 非规范、revision 过期或 staging evidence 改变都会 fail closed。每个 Host 进程最多保留一个
preparation；cancel、失败 commit、service destroy 和 startup recovery 会清理 staging，token 不跨重启。

Commit 与 installation/lifecycle 共用进程 mutex 和 `.install.lock`。它重新读取 Manager 与 canonical
filesystem facts，重新 inspection 不可变 bytes，校验每个 staging 文件，把候选原子 rename 到 sibling
digest directory 并刷新，然后要求 Manager 完成一次绑定 revision 的完整 record replacement。Version-2
Manager record 中的 Manifest、installation path 和 digest 继续是唯一 active pointer；不存在第二 pointer、
`previous` record、version history 或 rollback catalog。Manager persistence 与内存发布是 durable commit
point。

Next registration 保留 source、enabled intent、有界 diagnostics 和独立 plugin-data subtree，重新计算
compatibility，并把 Runtime 重置为 `inactive`。在 Rust commit 前，可信 TypeScript
service 先撤销 Action 再撤销 Page surface；提交前失败按 Page 后 Action 恢复原投影。提交后 service 主动
刷新并等待 committed revision 按 Page 后 Action 收敛；收敛失败会报告 committed revision 并让 surface
fail closed，而不会回滚 durable state。

Manager commit 后，Host 以 no-follow 方式删除旧 canonical payload。删除或 changed-event 失败不能回滚
新 record：结果仍为 `committed` 且 cleanup 为 `pending`，后续可信操作或 startup recovery 只重试 canonical
non-active sibling。异常名称、symlink、root escape 以及 healthy/quarantine ownership 冲突会被保留为证据，
并阻止不安全写入。本能力不提供远程/自动更新、用户主动 rollback、多版本保留、Runtime health rollback、
data migration、权限/管理 UI、签名验证或 quarantine repair。

运行 `pnpm run check:plugin-upgrade-and-rollback` 可执行私有 contract、adapter/service、boundary、
package/registration/lifecycle 回归、公共 package 打包与 Rust focused 门禁。该命令不会发布 package，
也不会重写 fixture baseline。

## 已交付的 Host 私有 Plugin Resource Service

Rust Host 注册唯一异步 `lensx-plugin` custom protocol，并在现有 Plugin Manager 与 Installer 旁管理
一个 `PluginResourceService`。独立 Resource Contract `0.1.0` 只向可信根应用暴露
`resolve_plugin_resource_entry`。其精确 request 为
`{ contract_version, entry_id, expected_revision }`；success 只包含当前 entry ID、revision、plugin ID、
version 与 opaque `entry_url`。path、digest、record key、installation root、独立 scope 字段、Manager
object 与原始 native error 都不会跨越该边界。TypeScript parser 和 desktop adapter 校验 `unknown`、
deep-freeze 结果、不跨 revision cache，并且 Manifest 代码、公共 package 与插件都无法使用它们。

Manager 为每个 healthy entry 持有进程内 `resource_generation`。它不会进入 Store version 1、
Registration snapshot/detail 或 changed event。register、已提交 enable/disable、replacement、remove
与后续 re-register 只改变目标 generation；幂等 no-op、diagnostic、失败 transition 与无关插件
revision 保持不变。Scope map 从不持久化，因此重启会使全部旧 URL 失效。

只有 healthy、enabled，并同时兼容 lensX 与 Host API 的插件才能成功 resolve。Source 和 Publisher
文本不是授权。Service 复用 Installer ownership proof，要求精确
`packages/<plugin-key>/<sha256>` active pointer、匹配的 record identity 与 digest、canonical real
payload tree，以及 regular 且非 link 的 Runtime entry。每个 `(entry_id, resource_generation)` 最多
获得一个由 OS CSPRNG 生成、具有 128-bit entropy 的 scope。重复 resolve 保持幂等；
disable/re-enable、replacement、逻辑 uninstall、incompatible/quarantine 状态与重启会永久撤销旧
scope；无关的全局 revision 变化不会撤销它。

每个 request 都重新检查 scope 与当前 Manager facts。URL 中的 plugin key 和 version 来自 Host，
只用于交叉校验，不是 authority。native URL 为
`lensx-plugin://<scope>.runtime.localhost/v1/<scope>/<plugin-key>/<version>/<path>`；受支持的 translated
形态为 `http(s)://lensx-plugin.<scope>.runtime.localhost/...`。两者都在 authority 与 path 中保留同一个
32 位 lowercase hexadecimal scope。shared host、丢失 translation key 或 authority/path mismatch 都会
在查询 scope 前失败。Package-relative path 使用 portable package grammar，并拒绝
absolute/root-relative form、空或 dot segment、反斜杠、percent encoding、NUL、query、过长/过深
path、metadata record、目录、未知文件与跨 payload target。Rust 逐段检查 link/reparse point、证明
canonical containment、打开一个 regular file、复核打开后的 identity 与 size，并执行最多 64 MiB 的
完整 bounded read。validation/open/read race 只能返回一个一致文件或完整安全失败。Service 不列举
目录也不重写 HTML，因此插件 HTML、CSS 与 JavaScript 必须使用 package-relative URL。

协议只支持 `GET` 与 `HEAD`。固定、大小写不敏感的表覆盖 HTML、JavaScript/ES module、CSS、JSON、
Wasm、PNG、JPEG、GIF、WebP、AVIF、SVG、ICO 与 WOFF2；不嗅探内容，也不回退
`application/octet-stream`。成功响应包含准确 `Content-Type`/`Content-Length`、`nosniff` 与
`Cache-Control: no-store`；成功 HTML 还会获得准确的 Host-owned Plugin Runtime CSP。`HEAD` 使用相同 status/header 且无 body。不支持 Range、conditional
request、query routing、directory index、content negotiation、wildcard CORS 或 download。所有成功
与错误都使用 `no-store`。

unknown/expired scope、identity/generation mismatch、unsafe/missing path、metadata、unknown MIME 与
unavailable registration 共用固定 `404`。非 GET/HEAD 使用固定 `405` 与 `Allow: GET, HEAD`；managed
state 不可用或无法分类的内部失败使用固定 `500`。response 与 log 均不包含 scope、identity、version、
digest、record key、absolute path、raw I/O、stack、partial bytes 或存在性细节。

运行 `pnpm run check:plugin-resource-service` 可验证 Rust/TypeScript 共享 fixture、desktop adapter、
workspace boundary、Manager generation、Installer ownership 回归，以及 protocol/path/MIME/lifecycle/
race/oracle/platform URL 测试。该 service 本身不创建 iframe、不执行插件代码、不建立 Runtime Session
或 Host API transport，也不授予权限。它会强制执行由 Host 私有安全 profile 选择的 document policy；
iframe container 与下游 Runtime Session 会消费它校验后的 `entry_url`。

## 已交付的 macOS 隔离 Plugin Runtime Origin 前置能力

每个 current `(entry_id, resource_generation)` 都复用现有 128-bit process-local Resource scope，同时
作为 browser-origin key 与 path authorization key。同一个 generation 重复 resolve 保持幂等。
disable/re-enable、replacement、uninstall 与 restart 会撤销旧 scope，使未来 document 进入不同 origin
与 storage partition；无关插件变化不会轮换 current scope。该映射不持久化，也不会在 opaque
`entry_url` 之外单独导出。

Resource Contract、protocol handler 与 frame-aware target normalizer 解析同一个 canonical tuple，并要求
authority/path scope、plugin key 与 version 逐字节一致。旧共享 `lensx-plugin://localhost/...` 与 translated
`lensx-plugin.localhost` host 会被拒绝。request 不使用 `Origin` 或 `Accept` 做授权，也不会添加 wildcard
或 reflected-null CORS。既有 fixed 404/405/500 oracle、`no-store`、bounded diagnostic、path/MIME 检查、
opened-file 验证与 lifecycle revocation 保持不变。

已提交的真实 macOS 26.6 / WKWebView `605.1.15` evidence 使用 canonical normal、malicious 与 replacement
`.lxp`，并让请求经过真实 `PluginResourceService`。在下游策略
`sandbox="allow-scripts allow-same-origin"` 下，每个隔离 authority 都序列化为稳定 non-opaque origin，
能够加载 HTML、CSS、image、classic script 与 package-relative ES Module graph，并且同名 storage key
只保留自身值。Host storage 不变；parent DOM、`frameElement` 与全部 Tauri surface 均不可达；代表性
privileged handler 保持 zero-hit。evidence 有严格边界，不包含 raw URL、scope、path、storage value 或
invoke secret。

运行：

```bash
pnpm run check:isolated-plugin-runtime-origin
```

这是下文 production iframe container 所消费的 macOS-only origin 前置能力。它本身不创建 iframe，
也不交付 Runtime Session、Host API、permissions 或选择 CSP profile。translated URL 形态的 parser coverage
不代表 Windows 或 Linux Runtime 支持。container 只能消费经过验证的 isolated `entry_url`；没有
shared-origin、opaque classic-only 或 wildcard/null CORS fallback。

## 已交付的 macOS Frame-Aware WebView Navigation 前置能力

Rust Host 会在 production `main` WKWebView 首个 document 加载前安装唯一的进程内 navigation
policy。经过审查的 macOS-only Tauri/Wry 补丁向 policy 提供 `main | descendant | unknown`：Wry
从 `WKNavigationAction.targetFrame` 与 `isMainFrame` 派生事实，再由 `tauri-runtime`、
`tauri-runtime-wry` 和 Tauri 将其传到应用 callback，同时保留现有 URL-only plugin hook。
unknown frame、非法 URL、callback failure 或任一 policy deny 都会在 commit 前 fail closed。

main-frame 与 descendant allowlist 完全分离。main-frame navigation 只匹配当前配置的开发或
production App document。policy idle 时所有 descendant navigation 都被拒绝；可信 Host Runtime
adapter 会通过 opaque epoch lease 原子激活一个精确 Plugin Resource entry 与 Host-derived
fragment。replacement 会使旧 target 失效，只有 current lease 的 disposal 才能清空 target。native
isolated-authority 与保留 origin key 的 translated document URL 会规范化为同一个内部 tuple；shared
host、丢失 translation key、authority/path mismatch 与歧义 target 都会被拒绝。普通 subresource 仍完全
由 Resource Service 负责。

production 以无 active plugin target 的状态安装 policy。Host Runtime adapter 会在挂载 current iframe
前激活，并在 close、retry、replacement、invalidation 或 App teardown 时 compare-current dispose。
policy 也拒绝全部 WebView new-window request 与 download，不会把 target 转交 opener。Tauri
initialization 保持 main-frame-only：Host
继续拥有 `isTauri`、`__TAURI_INTERNALS__`、metadata、invoke initialization 与 IPC，而
descendant document 看不到这些 surface。

项目提交的 15-case 真实 WKWebView evidence 记录 macOS、WKWebView `605.1.15`、Tauri
`2.11.5`、Wry `0.55.1`、native custom-protocol shape、native frame class、pre-commit outcome、
bootstrap isolation 与有界 callback count，且不记录 URL 或私有 identity。每次运行还会在打开目标
document 前验证 activate、replacement、late disposal、current disposal 与 idle-to-reactivate lease
lifecycle。Host、external、
cross-plugin、stale、fragment 与 data document attempt 会进入 policy 并被拒绝。WKWebView 会在
navigation callback 前 preflight-block `file:`、no-op `javascript:` 与 same-document `blob:`；
evidence 如实记录 `blocked_by_webview`、原 document 保留和 callback count 不变，而不宣称 policy
deny。popup/targeted-context 与 blob-download 用例会进入各自独立 deny hook。运行：

```bash
pnpm run check:frame-aware-webview-navigation-policy
```

该 capability 仅支持 macOS，不宣称 Windows 或 Linux 支持。Task 4.2 container 会消费它的精确
target lease；下文已交付的 Session 也消费该 lease，但不会改变 native policy contract。Host API 与
permissions 仍是后续独立 capability。

## 已交付的 macOS 隔离 Plugin iframe Runtime

available external Plugin Page 现在会在现有单窗口 Page slot 中渲染唯一 Host-owned
`PluginRuntimeFrame`。Host 私有 resolver 会交叉检查 current Page identity、provider、eligible
Registration entry、Registration revision、Resource response identity、isolated-origin URL 与 Registry
route。它只从 Host route 派生 fragment target，绝不回退到 Manifest path、shared host、stale URL 或
plugin 提供的 iframe policy。显式 retry 会刷新 current projection 并创建新的 attempt identity；没有
自动 retry 或 hidden iframe 复用。

container 固定 `sandbox="allow-scripts allow-same-origin"`、`referrerPolicy="no-referrer"`，并拒绝
camera、microphone、geolocation、fullscreen、clipboard、display capture、payment、USB、serial、HID、
Bluetooth 与 screen wake lock。native lease activation 完成后才会给 iframe 设置 `src`。close、Registry
invalidation、replacement、retry、返回 home/search 与 App teardown 都会移除 iframe，并 compare-current
dispose lease。最多存在一个 plugin iframe；Host Page 仍是可信 React surface。

UI 提供本地化 `resolving`、`loading`、`loaded` 与有边界的 failure 状态，以及可访问的显式 retry。
`loaded` 只表示 iframe load event 已触发，并不等于 SDK 或 Session `ready`。该能力不增加 message
readiness 声明。下游 Session capability 只增加私有 MessagePort bootstrap；下述安全生命周期会增加
deadline、有边界的 crash-loop recovery 与 CSP，但不会引入 JSON-RPC、Host API 或 permission dispatcher。
Plugin Runtime resolver、Resource/Registration adapter、iframe policy、native lease boundary 与
origin facts 保持 Host 私有，并由 workspace boundary 阻止公共 package 和 plugin workspace import。

运行 `pnpm run check:plugin-iframe-runtime` 可验证 resolver、component、navigation lease、Page/
lifecycle/replacement/resource 回归、真实 normal/malicious/replacement `.lxp` evidence、两项前置 gate 与
workspace boundary。真实 WKWebView evidence 仅适用于 macOS，不宣称 Windows 或 Linux Runtime 支持。

## 已交付的 Host 私有 Plugin Runtime Session

current iframe 报告 `load` 后，`PluginRuntimeFrame` 只把真实 `contentWindow` 与 Host 派生 descriptor
交给进程内 `PluginRuntimeSessionService`。resolver 会收敛 Registration summary/detail、Page route、
Resource entry 与 current revision，并绑定包含 opaque entry、plugin/version/Page、隔离 origin 与
resource generation 与 Runtime attempt 的不可变 identity。Manifest 数据、source、publisher 文本、enabled
文本与 plugin message 都不能创建或覆盖 identity。

每次 attempt 都由 Host 新建 128-bit 小写十六进制 nonce 与 `MessageChannel`，只向记录的 window 和
精确隔离 `targetOrigin` 发送私有 `0.1.0` bootstrap，并且只 transfer 一次 child Port。只有 Host Port
收到首个 exact、携带相同 nonce 的 ready acknowledgement，Session 才会从 `awaiting_handshake`
进入 `ready`。bootstrap/ack 不含 plugin、entry、Page、revision、resource token、URL 或 Host
object。非法 Port input、重复或迟到 acknowledgement、`messageerror`、Host reload 或 current fact
失效都会断开 Session，不提供 oracle，也不会自动重连。

每次 Registration invalidation 后，currentness 会比较受影响的 entry、Page、version、origin/generation、
attempt 与 availability。任一相关事实改变都会撤销旧 Session、Port、iframe 与 navigation
lease；只有其他插件导致的 global revision 变化会保留这四者，revision 只是竞态检测值而不是 Session
generation。close、retry、replacement、进入 Home/Search/Host Page 与 App unmount 都进行幂等终止
清理。Session、nonce、Port、window reference 与 message state 永不持久化；进程恢复后 Registration
仍只报告 `inactive`。

四层 ready 语义保持分离：

1. iframe `loaded` 只表示 browser load completion；
2. Session `ready` 只表示 current window/origin/nonce/Port binding 已认证；
3. transport connected 表示已交付的 iframe transport 接管该 Port、确认 nonce，后续 frame 只走 Port；
4. SDK `ready` 表示 `runtime.get_context` 返回 Contract-valid 且兼容的 Runtime context；它仍不表示
   production Host method 已执行。

Session contract、parser、adapter、identity 与 Port lease 都只属于 root Host，不进入 Contract、SDK、UI、
Testkit、官方/示例/外部插件 import 或 tarball。该能力本身不定义公共 wire/Host adapter、permission
decision/UI、privileged dispatch、plugin storage、background Runtime、sidecar 或 Windows/Linux 支持。
已交付的 SDK transport 与 Host adapter 会消费该私有 lease，但不改变 Session contract。安全生命周期会增加下述私有 handshake deadline
与清理。运行
`pnpm run check:plugin-runtime-session` 可验证 focused logic/React、真实 package、边界、前置 gate 与
有界真实 macOS WKWebView evidence。

## 已交付的 Plugin Runtime CSP 与安全生命周期

Host document 与外部插件 document 使用两套相互独立、不可修改的 CSP profile。production Host
profile 只允许打包的 Host resource、现有 Tauri IPC endpoint 与 `lensx-plugin:` child frame。当前
Semi Design Runtime 唯一需要的 style 例外是 `style-src 'unsafe-inline'`；script inline/eval、wildcard、
remote script、object、base、form 与 ancestor 放宽仍被拒绝。Resource Service 会给每个成功且 current
的 plugin HTML `GET`/`HEAD` 添加同一套 Plugin Runtime profile。该 profile 允许 current origin 加上
HTTPS/Data/Blob 内容、HTTPS/WSS 连接、页面生命周期内的 Dedicated Worker 与 WASM，同时继续拒绝
object、base 变更、form 与非可信 ancestor。production application document 只接纳准确的
`tauri://localhost` ancestor；`tauri dev`
只把 ancestor 替换为配置中准确的 `http://localhost:40755` application origin，其余 directive 保持逐字节
一致。Manifest、publisher、source、query、request header 与 plugin-authored meta 都不能修改这两套
profile。

CSP、隔离 origin、iframe sandbox、Permissions Policy、native navigation 与 Runtime Session 是互补
边界。CSP 控制 resource/document destination；per-generation origin 分离 DOM 与 storage；sandbox 和
Permissions Policy 约束 frame capability；native lease 控制顶层与 descendant navigation；Session
认证一个 current window 与专用 Port。这些边界不会通过 Host API 中介普通 Web 行为。

Host 私有 controller 会拥有一个 Runtime attempt，并在全局最多创建一个 external-plugin iframe。
独立的 10,000 ms resolution boundary 覆盖上一 terminal operation 的收敛、当前 Resource resolution 与
native navigation activation；超时会 fail closed，且不会构造另一个 iframe。navigation lease 激活且
`src` 提交后才启动 10,000 ms load deadline；bootstrap transfer 成功后，Session 才启动 5,000 ms
handshake deadline。close、navigation、quiescence、disable、uninstall、replacement、
相关 fact 变化、retry、timeout、Session failure、Host reload 与 App teardown 全部收敛到同一幂等
terminal operation：先让工作 stale，再取消 timer/subscription，dispose Session/Port，unbind/remove
iframe，compare-current 释放 navigation lease，最后丢弃引用。因此迟到 promise、load、acknowledgement、
timer 与 Port event 无法影响新 attempt。不存在 preload、hidden pool、background Runtime、跨 Page
复用、自动 retry 或持久化 Runtime state。

进程内 breaker 以 trusted entry identity 与 resource generation 为 key。60,000 ms 内第三次 qualifying
load、handshake 或 unexpected-disconnect failure 会在 resolve、lease、iframe 或 Session 创建前开启
30,000 ms cooldown；cooldown 到期后仍必须由用户显式 retry。close、navigation、invalidation 与
graceful exit 不计数；generation 变化或连续 30,000 ms 健康 `ready` 会清除记录，进程退出也会忘记它。

可见 failure 只使用 `runtime_load_timeout`、`runtime_handshake_timeout`、
`runtime_session_disconnected`、`runtime_security_policy_failure`、`runtime_crash_loop` 或
`runtime_unavailable`，并通过现有可访问 feedback surface 提供 canonical English 和语义一致的简体中文
文案。diagnostic/evidence 不包含完整或 blocked URL、origin/scope、path、nonce/Port 内容、payload、
storage value、raw exception 或 stack，也没有远程 CSP report channel。已提交的真实 WKWebView matrix
仅支持 macOS。公共 SDK iframe transport 不会继承这些 Host 私有 attempt、timer、breaker record 或
failure code。运行 `pnpm run check:open-isolated-plugin-runtime` 可执行组合 gate
及其 Resource、origin、navigation、iframe、Session、workspace 与 public-tarball 前置门禁。

## 已交付的 Host 私有 Plugin Surface 投影与 Page 导航

可信 TypeScript 应用现已在 Plugin Registration Desktop Adapter、统一 Page Registry 与唯一
Launcher Action Registry 之间交付一个生产 surface 投影协调器。它消费完整 snapshot 与同 revision
detail，而不是 event patch。只有 registered、enabled，并同时兼容 lensX 与 Host API 的插件才具备
资格；quarantine、degraded availability、消失或事实无法验证都会使对应 provider fail closed
注销。builtin 与 external source 使用完全相同的映射和执行规则。

Production composition 会在 surface coordinator 与 lifecycle service 之间共享同一个 Registration
adapter。因此 surface coordinator 暴露 provider-scoped quiesce 和显式 revision reconciliation，而不
创建第二份订阅或 cache。Lifecycle controls 可以立即移除 stale Action/Page projection，再复用正常
的完整 snapshot 映射完成收敛。

两个 Registry 都支持可信 provider-scoped 完整批次替换，以及用空批次注销。Page Registry 保护
`lensx.core`，在提交前校验 Page identity、parent ownership、本地化字段、私有 route 与 availability，
并返回隔离且确定性的 lookup 和 snapshot。非法、重复、跨 owner 或
部分无效输入会保留完整调用前状态，且不能删除其他 provider 的 Page、descriptor 或 executor。

纯 Page mapper 保持 `(owner_id = plugin_id, page_id = 插件本地 Page ID)` 为唯一 Page identity，
保留同 owner parent target 与私有 route，并派生本地化 provider/Page presentation。其他条件 eligible
的 registration 中每个 Page 都 available；普通 Web capability 不进入 Page availability 计算。

纯 Action mapper 设置 `owner_id = plugin_id`，派生
`action_id = <plugin_id>.<local_action_id>`，保留规范化的本地化 Action metadata 与关键词，并设置
`enabled = true`。Host-owned executor 只为注入的窄 Page opener 捕获冻结的插件 Page target 和 opening
Action ID。只有目标当前 available 的 Action 会被发布。Manifest route、publisher、
source 与 `default_action_id` facts 不会进入
descriptor，也不影响搜索排序。package-local asset icon 会被有意省略，在 scoped resource service
存在前使用现有通用 Action fallback。

投影按 Registration revision 串行收敛，每个已协调 revision 对每个 provider 读取一次 detail。
新增或替换先提交完整 Page 批次，再提交 available-target Action 批次；失效、移除、rollback 和
destroy 都先注销 Action，再注销 Page。detail identity 与 revision 必须匹配当前 summary；过期异步
结果会被丢弃，重复刷新保持幂等，destroy 后不会再提交 Registry。detail、映射或替换失败只注销该
插件，并产生不包含 route、安装路径、stack、原始错误或 Host 对象的有界诊断。成功投影的 Action
自动复用共享搜索、Dispatcher 和只持有 ID 的 recent/pinned 解析。

`AppNavigationService` 在把唯一扁平 `ActivePage` 交给 App Shell handler 前解析当前 available
descriptor。Registry replacement 只会在 active Plugin Page identity 消失或变为 unavailable 时使其
失效。当前 locale presentation 从 Registry facts 解析 provider 名称、Page 标题与 opening Action，
支持 `zh-CN` 到 `en-US` 以及 Action 缺失到 Page 标题的回退。Plugin Owner icon 仍使用通用 provider
fallback。

生产组合初始化该协调器，在 Launcher activation 与 listener recovery 时刷新，并在 cleanup 时销毁
同一 subscription。available Plugin Page 会把 current resolution 交给已交付的 Host 私有 iframe
Runtime resolver。surface projection 仍不会向插件暴露 route、entry ID、revision、origin fact、resource
URL 或 native object。Host 私有 management capability 消费这些 facts，但不改变 surface projection；
decision history 仍不属于本次交付。

## 已交付的公共 Plugin SDK 与 iframe Transport

lensX 已交付框架无关的 `@lensx/plugin-sdk@0.2.0` workspace package。package 具有公共 root 与
`@lensx/plugin-sdk/iframe` 入口，Runtime 只依赖 `@lensx/plugin-contract`。未声明的 deep import 不受支持；其公共声明
不要求 React、Semi Design、Tauri、DOM 全局、Node filesystem 类型或 Host 私有模块。

根入口公开 `createPluginSdk`、`PluginSdkError`、SDK lifecycle、Runtime context、取消和
transport 类型，以及下列独立版本事实：

| Export | 含义 |
| --- | --- |
| `PLUGIN_SDK_VERSION` | SDK package 与公共 API 版本，当前为 `0.2.0`。 |
| `PLUGIN_SDK_SUPPORTED_HOST_API_RANGE` | 支持的 Host API 半开区间，当前为 `>=0.2.0 <0.3.0`。 |
| `PLUGIN_HOST_API_VERSION` | SDK 不会重新导出；当前 Host API 版本仍由 `@lensx/plugin-contract` 持有。 |

`createPluginSdk({ transport })` 返回相互隔离的 client，而不是全局 singleton。client 依次使用
`idle`、`initializing`、`ready`、`disconnected` 和 `disposed` 状态。并发初始化共享同一次连接
尝试；被取消、超时或失败的尝试回到 `idle`，允许显式重试。断开对当前 client 是终止状态，不会
自动重连。销毁是幂等的，会取消 SDK 管理的 pending operation、移除 listener，并且最多销毁一次
transport。

进入 `ready` 前，SDK 通过 Contract validator 校验、复制并冻结共享 `PluginRuntimeContext`。该 context 包含兼容的
`hostApiVersion`、`en-US | zh-CN` locale、`light | dark` theme，以及唯一且只读的 capability
已声明 Host API method ID 的排序去重只读 snapshot。空 capability 列表有效，并不代表存在任何 method。plugin identity、Page
identity、安装来源和 Host lifecycle 事实都不是受支持的 context 输入。
SDK 消费的 Host API validator 会在构建时生成并提交为 AJV standalone function。它们不会在插件
document 内编译 Schema 或执行动态求值，因此 SDK 无需增加 `unsafe-eval`，仍与 Runtime 的
`script-src 'self'` policy 兼容。

SDK 管理的 operation 默认超时为 10000 毫秒，并允许正有限整数覆盖。取消输入使用与原生
`AbortSignal` 结构兼容的最小 signal，但公共声明不引用 DOM 类型。超时、取消、断开或销毁会把
取消传给 transport、清理 timer 和 listener，并抑制迟到结果。

`PluginSdkError.code` 提供稳定的 SDK 级分支：`cancelled`、`timeout`、`disconnected`、
`disposed`、`incompatible_host_api`、`invalid_runtime_context`、`invalid_argument` 和
`transport_failure`。transport exception 会映射为安全 SDK error，不暴露原始异常、私有 stack、
Host 对象或 wire 数据。Host method、参数、domain 与 internal error 类型来自 Contract，
并与 SDK lifecycle failure 保持可判别；SDK 仍不会执行它们。

`PluginSdkTransport` 是连接、抽象请求、抽象事件、断开通知与销毁的语义 adapter 注入边界。
它不定义 request ID、nonce、identity、origin、`Window`、`MessagePort`、`postMessage` 或
JSON-RPC envelope。公共 `PluginSdkClient` 特意不提供任意字符串 Host method 调用。SDK package
的白盒测试 fake 仍是私有 fixture；公共黑盒控制位于独立 Testkit package。

`PluginSdkClient.request()` 只接受 Contract `HostApiRequest` 判别联合；进入 transport 前完成校验与
冻结，并从 method 推导配对 result payload 类型。client 会拒绝 `ready` 前调用，也会拒绝当前
capability snapshot 未包含的 method。`subscribe()` 只接受 `runtime.context_changed`；完整校验并冻结的
replacement 会先成为 `client.context`，再通知 subscriber。Contract-valid Host API error 与 SDK 的
cancellation、timeout、disconnect、dispose、invalid argument、transport failure 保持可判别。

`createPluginIframeTransport()` 不接受 trust 配置。它只接受 SDK 自有 Host origin policy 下 current
parent 发出的首个 exact bootstrap，只返回一次现有 nonce acknowledgement，之后只使用 transferred
Port。该 policy 包含 production Tauri origins、配置中准确的 `http://localhost:40755` development origin
与私有 real-WebView harness origin；相邻 localhost port 仍被拒绝。package 私有 `0.1.0` wire 由 exact
request/response/event/cancel/disconnect frame 与 transport
自有 bounded request ID 组成；不含 plugin/Page identity、origin、path、executor、Tauri/Host
object、stack 或 raw exception。package 不 export frame、codec、fixture、Host projection、nonce/origin
policy 或 deep-import path。

Host 最多消费 ready lease 一次。私有 adapter 向窄 handler 注入不可变 Session identity 与 Host-owned
cancellation signal，校验所有 result/error/event，支持并发乱序 settle，并让 Session/Page replacement
与 dispose 收敛到幂等 cleanup。Production 会为每个 current ready Session 创建一个 Host 私有 Dispatcher
binding。该 binding 实现 `runtime.get_context`、`ui.close`、`actions.open` 与五个 `storage.*` method；
已删除的 clipboard 与未知 method fail closed。私有 post-response outcome 让 adapter
先校验并发送成功的 `ui.close` result，再执行匹配目标的关闭 effect。该 outcome 永不跨 wire，也不改变
公共 SDK transport。

### 已交付的 Host 私有 RPC v1 校验

Host adapter 现在会在递归 Contract 校验之前以及每次出站交付之前，强制执行一套不可变的 RPC v1 policy：

| Budget | 固定 v1 上限 |
| --- | ---: |
| 每个私有 frame 的 canonical JSON-compatible cost | 5,242,880 bytes |
| 语义 payload 嵌套深度 | 32 |
| 私有 frame 总嵌套深度 | 36 |
| 已访问 value 与 object key | 16,384 |
| 每个 frame 的 request 数 | 1 |
| 每个 Runtime Session 的 in-flight Handler 数 | 32 |
| Host execution deadline | 10,000 ms |

analyzer 以迭代方式遍历 JSON-compatible 输入，在不先序列化完整 value 的前提下计算 UTF-8 与 JSON escaping
成本，在首次确认超限时停止；它拒绝循环、非 plain object、非有限数字及其他非 JSON value，且不会修改输入。
Manifest、插件来源、SDK option 或 payload 都不能提高这些上限。

入站顺序固定为：浅层 exact envelope/request ID 分类、有界 frame 与语义 payload 分析、公共 Contract 校验，
最后才准入 closed Host API Dispatcher。可安全关联的 malformed request 返回 `invalid_request`，无效 params
返回 `invalid_params`，未声明 method 返回 `method_not_found`，byte/depth/node/concurrency 拒绝返回
`limit_exceeded`。这些失败不占用 Handler slot，并保持健康 Session 可用。未知版本、未知 frame type、私有
envelope 字段、非 JSON frame，以及重复或倒退 request ID 仍属于 terminal protocol violation。严格递增的
request sequence high-water mark 在不保存无限增长 terminal-ID 集合的情况下拒绝 replay。

每个获准 request 都拥有一个 AbortController 与 10,000 ms Host deadline。Handler completion、SDK cancel、
deadline、currentness 丢失和 cleanup 通过同一个 exactly-once settlement 竞争。Host deadline 先胜出时释放
slot、abort Handler 并返回 Contract-valid `timeout`；SDK lifecycle timeout 先胜出时仍保持 SDK 自己可区分的
lifecycle `timeout`，并且最多发送一次 cancel。

result、error 和 event 在 `postMessage` 前都要经过同一 frame budget 与配对的公共 Contract validator。
Handler throw、无效/超限 value 或 method/result mismatch 会转换为一个固定安全的 `internal_error`，而不会
断开其他方面健康的 Session。无效 event 会被抑制且不通知 subscriber。post-response effect 仅在有效 response
已经发送、request 与 Session 仍 current 时执行。

production 通过冻结的 Host 私有 diagnostic record 观察失败；record 只包含 trusted plugin ID、存在时已验证的
method、`ingress | execution | egress`、闭集 code 和固定英文消息。它绝不包含 request ID、payload、URL、path、
origin、exception、stack、Port、provider 或 Host object，sink throw 也不能影响 settlement。diagnostic
不会持久化，也不会向插件公开。

本次交付不新增 batch/streaming RPC、持续调用频率限制、iframe/CPU/memory 监控、插件暂停、隔离升级、自动
恢复、公共 policy 配置或 diagnostic history。这些 Runtime resource control 仍属于 Task 7.5 或后续独立 change。

运行 `pnpm run check:plugin-sdk-transport` 可验证 codec drift、SDK/Testkit、iframe/Host adapter、真实
tarball no-DOM/browser consumer、真实 MessageChannel integration、Runtime lifecycle 与有界 macOS
WKWebView evidence。本交付不声称 Windows/Linux Runtime transport 支持。
运行 `pnpm run check:plugin-rpc-validation` 可验证 RPC policy、恶意 fixture、admission/egress race、
Dispatcher/provider integration、私有边界和真实资源拒绝 evidence。

## 已交付的 Host 私有 Plugin Host API Dispatcher

Production App 使用当前 locale/theme 状态、App Navigation Service、Launcher Action Registry/Dispatcher
与 Runtime currentness 组合出 Session-scoped Dispatcher。认证 lease 是 plugin/Page identity 的唯一来源；
request 不能选择 owner、Page、provider、executor、route、Tauri command 或其他 Host object。

`runtime.get_context` 返回 Host API `0.2.0`、当前 `en-US | zh-CN` locale、当前 `light | dark` theme，
以及排序并冻结的 `actions.open`、`runtime.get_context`、五个 `storage.*` method 与 `ui.close` capability
snapshot（scoped-storage provider 可用时）。只有当前 locale、
theme 或 capability snapshot 实际变化时才发送完整 `runtime.context_changed` replacement。identity、
Registration revision、Runtime attempt、source、Manifest 数据、path 与 Host lifecycle state
继续保持私有。

`ui.close` 只接受 `{}` 并从 Session 推导目标。Host 先发送并终结 `{ accepted: true }`，再执行至多一次
match-and-close effect，因此 stale Session 无法关闭 replacement Page。`actions.open` 只接受 plugin-local
Action ID，由 Host 推导 `<plugin_id>.<local_action_id>`，并通过统一 Launcher Dispatcher 重新查询。
core、跨插件、缺失、禁用、不兼容或已移除的 Action 都会失败关闭，不暴露 Registry 或 executor。

storage 调用只使用认证 Session lease 中冻结的 identity。Dispatcher 把该 identity 注入 Host 私有 desktop
provider，绝不接受插件选择的 namespace、path、plugin key、command 或 executor。确认 namespace 损坏或
blocked 后，Host 只发送一次移除五个 storage capability 的完整 Context replacement；它不会改变独立授权的
clipboard capability。

运行 `pnpm run check:plugin-host-api-dispatcher` 可执行 Dispatcher、Navigation、Action、Runtime、
MessageChannel、公共 tarball、export、dependency 与 workspace boundary 聚焦门禁。该能力不增加公共 export、
wire frame 或 SDK dependency。持续 Runtime resource isolation、项目模板、CLI 与开发模式仍是独立能力。

## 已删除的 Host Permission 与 Native Clipboard Authority

Host API `0.2.0` 删除 permission catalog 与 native clipboard method。Manifest `0.2.0`、Manager
record format `2`、Registration `0.3.0`、installation `0.3.0` 与 replacement `0.2.0` 不携带
request、grant、risk 或 permission fact。Rust permission state、grant command、AppKit clipboard
provider、frontend service、prompt、Settings mutation 与 commit 后 grant 阶段均不在 production
composition 中。旧 record 与 wire field fail closed。

可信安装与 replacement confirmation 改为说明开放隔离 Web Runtime 的信任决定。lensX 隔离 Host 与
其他插件 authority，但不审查或逐项授权普通 Worker、network、远程资源、Blob/Data、WASM 或浏览器
origin storage 行为。设备/native capability 仍不可用，除非未来设计明确的公共 Host boundary。
`pnpm run check:open-isolated-plugin-runtime` 提供负向 authority 扫描与组合 Runtime 验证。

## 已交付的插件 Scoped Storage

Host 私有 Rust `PluginScopedStorage` service 在 Installer 持有的
`app_local_data_dir()/plugins/data/<plugin-key>` namespace 下持久化唯一 canonical
`storage-v1.json`。Host 在持有 Installer 共享的进程内与跨进程 commit boundary 时，根据 live Manager
identity 推导并重新校验 plugin key 与真实路径。读取缺失 namespace 不会创建目录；第一次成功
`storage.set` 才按需创建 data subtree。

key 限制为 1–256 个 Unicode code point，且不含 C0/DEL 控制字符。JSON value 最大嵌套深度为 32，
compact UTF-8 最大为 256 KiB。每个 namespace 最多 1,024 entries、1 MiB logical usage；usage 等于 key
UTF-8 bytes 与 compact value bytes 之和。`storage.list` 使用 Unicode code-point 顺序，默认每页 100、
最大 1,000，并返回绑定 namespace revision 与下一位置且带完整性保护的 cursor。分页后发生 mutation
返回 `conflict`；malformed 或伪造 cursor 返回 `invalid_params`。

mutation 先序列化 deterministic JSON，再写入 create-new owned 临时文件，flush/sync 后以 atomic rename
作为 commit point，最后同步 parent directory。commit 前失败保留旧 store，只清理自己拥有的临时文件。
commit 后变成 late 的 result 由 Session transport 丢弃，不伪造 rollback。

compatible replacement 与 disable 保留数据；disable 会撤销访问。`retain_data` 卸载后，同 identity 重装
可以重新读取 store；持久化的 `delete_data` cleanup 则在相同 coordinator 下删除完整 owned data subtree。
bounded lazy validation 只降级存在 oversized、malformed、non-canonical、symlink 或异常 evidence 的单个
namespace。诊断只包含稳定 code、operation 与 message，不包含 key、value、plugin identity、payload、path、
exception 或 stack。

运行 `pnpm run check:plugin-scoped-storage` 可验证共享 TypeScript/Rust fixture、Rust persistence/lifecycle、
desktop provider/Dispatcher、真实 SDK/MessageChannel loop、公共 tarball consumer、私有边界与既有有界 macOS
WKWebView transport evidence。本交付不增加管理 UI、产品 copy、theme/accessibility surface、permission
prompt、通用 RPC limit、模板、CLI 或开发模式。

## 已交付的 Host 私有插件管理设置

可信 Settings 页面现在只消费一个根级私有 `PluginManagementService`。该 facade 观察完整且不可变的
Registration snapshot，只针对同一 revision 加载详情，投影有界 diagnostic、lifecycle 与 source fact，并串行
编排 prepared installation、启用/禁用、替换、卸载和数据清除。React 只接收 typed operation availability 与安全
outcome；它不直接 invoke Tauri，也不复制 Manager transition 规则。

根级 plugin composition 是共享 management、plugin lifecycle、Runtime lifecycle、replacement 与 Registration
projection service 的唯一生命周期 owner。每次 React effect setup 都创建并初始化一代 composition，其配对
cleanup 只销毁这一代实例；`App`、`PluginRuntimeFrame` 与 Settings 组件只消费注入的 service，不执行 terminal
dispose。这样开发模式 `StrictMode` 的 setup-cleanup-setup 不会复用已经销毁的 service，也不会让管理视图永久
停留在 `loading`，或让 Runtime 在 iframe 尚未创建时永久停留在 `resolving`。

替换仍采用 prepare/confirm/commit 流程。确认界面展示版本分类与信任边界；Registration revision
变化后确认立即失效。卸载默认 `retain_data`，`delete_data` 必须显式选择。只有 current、disabled、registered
entry 可以清除数据；该操作使用 Host 私有 Plugin Data Management Contract `0.1.0`。Rust 在持有 Installer
data boundary 时重新校验 opaque entry identity、expected revision、disabled state、canonical ownership 与安全
filesystem evidence，再以原子方式提交空的 canonical `storage-v1.json`。缺失或已经为空的 storage 保持幂等；
ambiguous、linked、escaped、stale、enabled、quarantined 或 degraded evidence 一律 fail closed。

管理表面不暴露 raw path/error、Publisher trust、
Registry patch/history protocol 或公共管理 API，也不会通过 Contract、SDK、Testkit 或 Plugin UI 导出任何
管理能力。运行 `pnpm run check:plugin-management-settings` 可验证私有边界、facade/UI 回归、公共 package
检查，以及固定 `650×600` 的双语 light/dark screenshot 与 computed style。

## 已交付的公共 Plugin Testkit

lensX 已交付只有一个公共根入口的 `@lensx/plugin-testkit@0.2.0`。它的 Runtime dependency 是
`@lensx/plugin-contract` 与 `@lensx/plugin-sdk` 的公共根入口；Contract 与 SDK 不反向依赖
Testkit。其 Runtime 和声明不需要 DOM、React、Semi Design、Tauri、Node filesystem、Host 私有
module 或测试运行器。

根入口提供：

- `createPluginManifestFixture()`：创建满足当前 Contract 的全新最小输入；
- `mutatePluginManifestFixture()`：按顺序执行基于 JSON Pointer 的 `set`/`remove`，并返回深拷贝；
- `createPluginRuntimeContextFixture()`：创建复制并冻结的 locale、theme、Host API version 与
  已知 method capability snapshot；
- `createInvalidPluginRuntimeContextFixture()`：创建 unknown、duplicate、unsorted 与 trusted-field
  负向 Context case；
- `PluginTestCancellationController` 与 `createDeferred()`：提供 runner-neutral 的取消和 pending
  operation 控制；
- `FakePluginSdkTransport`：提供语义 connect/request handler、抽象 event、disconnect、dispose 和
  不可变 observation snapshot。

典型 lifecycle 测试把 fake 注入真实 SDK：

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import { FakePluginSdkTransport } from '@lensx/plugin-testkit';

const transport = new FakePluginSdkTransport();
const client = createPluginSdk({ transport });
const context = await client.initialize();
const observation = transport.observation;
await client.dispose();
```

Manifest fixture 由真实 Contract validator/normalizer 校验；Runtime context 失败、取消、超时、
transport failure、断开、重试与迟到结果抑制仍由真实 SDK 决定。fake transport 不定义 RPC
envelope、request identity、nonce、origin、browser messaging object 或可信 Host identity。它的抽象
request hook 不是已交付的 Host API method client。capability ID 使用共享闭集 method 类型，不是普通
Web capability 声明。

`pnpm run check:plugin-testkit` 校验 package 测试与声明、Contract -> SDK -> Testkit 依赖方向、真实
tarball 内容，以及安装到 workspace 外的无 DOM ES2022 consumer。该 consumer 是发布 smoke fixture，
不是正式插件项目模板。Testkit 不提供 iframe Runtime、插件执行或真实 Host API 执行；后续 transport
和 Runtime change 只能在对应契约接受后扩展此 package。

## 已交付的可选 Plugin UI Package

lensX 已交付面向 React 插件的可选 `@lensx/plugin-ui@0.2.0` package。根 export 严格限制为
`PluginUiProvider`、`PluginPage`、`PluginFeedback` 及其公共类型；唯一额外公共入口是
`@lensx/plugin-ui/styles.css`。未声明的 deep import、Host React Context、应用私有组件、
Tauri adapter、Host 样式和完整 Semi Design API 都不会被导出。

`PluginUiProvider` 接收 SDK 的只读 `PluginRuntimeContext` snapshot，并且只在插件 document
内适配其 `locale` 与 `theme` 字段：

```text
经过校验的 PluginRuntimeContext snapshot
  -> PluginUiProvider
     -> Semi LocaleProvider（en-US 或 zh-CN）
     -> package 自有反馈文案
     -> document lang 与 color-scheme
     -> body[theme-mode="dark"]
```

传入新的 snapshot 会更新所有映射后的呈现值。Provider 不读取 Host provider 或 preference、
不订阅 SDK transport、不轮询，也不定义 context 更新 event。它在 mount 时记录 document 状态，
并在 unmount 时恢复；预期的后续执行环境是插件自有的隔离 document。

`PluginPage` 只提供稳定页面语义：单一 `main`、可访问 heading、可选 description/actions 和
内容区域。`PluginFeedback` 提供本地化 `loading`、`empty`、`error` 状态，包含 busy/status/
alert/live-region 语义与可选的插件自有 recovery handler。通用控件仍由插件直接从 Semi
Design 导入，不由 lensX 进行薄包装。

样式入口包含必要的 Semi 基础样式，并且只稳定以下十个 lensX 语义 custom properties：

```text
--lensx-plugin-color-background
--lensx-plugin-color-surface
--lensx-plugin-color-text
--lensx-plugin-color-text-secondary
--lensx-plugin-color-border
--lensx-plugin-color-accent
--lensx-plugin-color-danger
--lensx-plugin-color-focus
--lensx-plugin-radius-page
--lensx-plugin-space-page
```

这些 properties 映射到受支持的 Semi theme token 以及 package 自有页面间距/圆角。插件可以
使用其他 Semi token，但它们不是 lensX 兼容承诺。发布 CSS 不依赖 Host global style 或
UnoCSS scan。

React、React DOM 与 Plugin SDK 是 UI 的 peer dependency，Semi Design 是 UI package 的直接
Runtime dependency。React 插件安装这些 peers，并构建一个自包含 browser bundle，其中包含
插件自有的单份 React Runtime、React DOM、Semi、Plugin UI JavaScript 与样式。它不会从 Host
获得 external、import map、window global、React 实例或私有 CSS。非 React 插件可以完全忽略
UI，继续只消费 Contract 与 SDK。

package tests、真实 tarball Rsbuild consumer、module graph/bundle 检查和 `650×600` browser
visual matrix 共同覆盖公共边界、locale/theme、可访问性、键盘恢复、focus 与双语长内容。本次
交付不会创建 iframe、Runtime session、可执行 Host API、installer、registry、template 或插件执行路径。

## Host Action Registry

已经交付的 launcher action 核心建立了 Host 所有的 TypeScript registry，用于保存经过校验且可
序列化的 action descriptor。descriptor 元数据与 executor 相互分离：消费者可以读取不可变的
descriptor snapshot，只有可信 Host dispatcher 能够解析和调用 executor。外部代码绝不能把
函数、React 状态、Tauri 对象或 Rust 实现值放进 descriptor。

Launcher descriptor 可以携带经过校验的 plain-data Host icon token。Host resolver 把受支持 token
映射到应用 icon 组件，并为缺失或无法解析的 token 使用通用 Action 降级图标。Manifest 的包内 asset
icon 属于不同契约，当前运行时不会把它投影进该 Host token 字段。

Launcher 搜索 service 只消费该 registry 的不可变 descriptor snapshot。它对每个已注册
descriptor 使用相同的确定性 locale 解析、token 匹配、评分、排序和 enabled 过滤。它不会读取插件
display name、Manifest 私有数据或 provider 来源，也不会提升 Manifest 的
`contributes.launcher.default_action_id`。可选 icon metadata 与最近使用/已固定集合都不影响匹配、
评分或排序。

内建 module 和外部插件通过上文经过校验的 Host 私有 provider adapter 投影 action。该 adapter 负责
先把 provider 身份和元数据映射到稳定的 launcher descriptor 契约，再进行原子 Host 注册。
插件 Action 注册后会自动使用与内建 Action 相同的搜索路径；搜索本身不会增加 provider-specific
分支。provider 不能直接修改 registry、选择可信 executor、调用特权桌面 command，或绕过 Host
dispatcher。特权行为仍然必须是明确的 Host capability，并具有自己的授权及类型化应用或 Rust
边界。

生产环境注册 Host 内建的隐藏 launcher 和打开设置 Action，并在 available Page target 提交后通过
已交付 surface 协调器发布合格 Plugin Action。静态 Manifest 契约本身仍不会注册 Action。安全插件
icon 解析与生命周期写操作仍是独立能力。最近使用与已
固定集合继续只保存 Action ID，因此投影 Action 会在 provider 缺失时隐藏，并在相同稳定 ID 返回时
恢复解析。

## 运行时边界

### 可信 Host Module

内建界面可以作为可信 React module 在应用 Provider 内运行。其注册元数据应与外部插件使用相同的
页面、action 和兼容性概念模型，同时 module 加载仍由 Host 控制。

可信 module 的契约名称必须保持框架中立，避免外部契约依赖 React 实现细节。

### 外部插件

外部插件 UI 运行在已交付的隔离 iframe 中。已交付的私有 Runtime Session 会通过受控 Host bootstrap
认证唯一专用 Port，公共 iframe SDK 会通过私有闭合 wire 消费它；production 只开放上文三个 Host 私有
Dispatcher method。
外部插件不能直接访问：

- 应用 React 状态或组件实例；
- 私有前端模块；
- Tauri command；
- Rust 对象；
- 本地文件系统或操作系统 API。

外部运行时资源必须解析在已安装插件的边界内。

## Host API

已交付的公共语义契约定义了上文八个 method ID、exact params/result、
`runtime.context_changed`、`PluginRuntimeContext`、error 与 capability/version 规则。
Contract 校验本身不会发送或执行请求。公共 SDK client 现在提供一个 Contract-closed typed request
operation，而不是 raw string method 或具体副作用 provider。

预期通信流程为：

```text
iframe
  -> 基于已认证 Port 的类型化 Plugin SDK
  -> 私有闭合 request/response/event/cancel wire
  -> 注入 Session-derived identity 的 Host Port adapter
  -> Session-scoped Host 私有 Dispatcher
  -> Context / 匹配当前 Page 的关闭 / 当前插件 Action / scoped storage
```

Bridge 必须校验真实消息来源和受限制的 origin。公共 Host API 不包含 native capability method；
未知或已删除 method 会在分发前 fail closed。

Host API 方法保持小型、类型化、版本化，并且可以独立测试。官方 SDK 已经提供相应方法时，
插件不能手写私有传输消息。

## 加载与性能

- 注册元数据时不加载未激活的外部 UI。
- 仅在对应页面打开时创建 iframe。
- 页面关闭时释放监听器、待处理调用和运行时资源。
- 在专门 spec 被接受之前，不把后台常驻行为和 sidecar 执行纳入初始运行时。
- 对不支持或不兼容的能力返回可诊断错误。

## 安全原则

- 先校验结构，再校验语义引用和权限。
- 将插件包和消息视为不受信任的输入。
- 解析包路径时不允许绝对路径或父目录穿越。
- 区分已声明、已请求和已授予权限。
- 对未知方法和能力默认拒绝。
- 永远不向 iframe 暴露内部 Tauri 或原生对象。

## 能力交付

静态 Manifest 格式、校验器、Host 私有本地安装与同 identity replacement、绑定 revision 的
enable/disable/uninstall 基础设施、scoped package-relative resources、Plugin surface 投影、生产
Action 激活、Page Registry/navigation、macOS 隔离 iframe Runtime、Host 私有进程内 Runtime Session、
公共 SDK iframe transport/Host Port adapter、公共 Host API 语义契约、Host 私有 RPC v1 validation boundary、
Dispatcher、插件 scoped storage provider、open isolated Web Runtime 与 Plugin Management Settings 已交付。
其他能力还包括公共项目模板与 CLI、feature-gated Plugin
Development Mode、双语外部开发者文档与官方插件 release 流水线。其余每项能力——npm 发布、签名、Marketplace 分发、
远程/自动更新、decision 或用户主动 rollback history、后台 Runtime 或 executable/trusted sidecar——都需要独立的已接受
规格和实现证据。本文定义架构方向和边界，不是发布检查清单。外部 package、API、教程和排障细节位于
[canonical 插件开发参考](../plugin-development/index.md)。
