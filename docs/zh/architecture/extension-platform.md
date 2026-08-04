# 扩展平台

## 文档状态

本文区分已经交付的静态插件 Manifest 契约、`.lxp` package inspection 与本地安装、Plugin SDK
foundation、Plugin Testkit、可选 Plugin UI package、Host 私有 Plugin surface 投影与 Page 导航，
以及预期的运行时扩展边界。公共 packaging CLI、分发、插件执行、完整权限决策、iframe transport、
签名和 Host API 当前尚未实现。稳定 spec 和源码共同决定已经交付的子集。

## 目标

扩展平台应当允许 lensX 暴露本地工作流，同时避免不受信任的代码访问具有特权的应用内部实现。
它应当提供：

- 可搜索的启动器 action；
- 通过明确 action 打开的页面；
- 声明式权限；
- 本地化名称和搜索别名；
- 版本化兼容边界；
- 可预测的生命周期和诊断。

## 概念模型

```text
Plugin
├── 元数据与兼容性
├── pages
├── actions ───────────────▶ 目标 pages
├── permissions
└── runtime
    ├── 可信 Host module
    └── 隔离的外部 iframe
```

归属和引用必须明确。插件、页面、action、权限和其他可引用资源使用的 ID 必须在全局范围内
没有歧义。

## 契约分层

平台区分：

1. 作者可控的 manifest 输入；
2. 经过校验和规范化的插件元数据；
3. 可信的 Host 注册元数据；
4. 向活动插件暴露的运行时上下文。

插件作者不能声明安装来源、已授予权限或 Host 所有的生命周期策略等可信事实。Host 在完成校验后
补充这些事实。

序列化契约应当具有唯一的版本化 schema 来源，并在 TypeScript 和 Rust 中进行一致校验。
跨边界暴露的校验错误必须包含稳定、机器可读的代码和位置。

## 已交付的公共契约与静态 Manifest

lensX 已交付可发布的 `@lensx/plugin-contract@0.1.0` workspace package。根 export
提供 `PLUGIN_MANIFEST_VERSION`、`PLUGIN_HOST_API_VERSION`、生成的作者输入类型、
规范化类型、稳定诊断、`validatePluginManifest`、`normalizePluginManifest` 和本地化文本
解析 helper。额外公共入口仅有 `@lensx/plugin-contract/schema` 与
`@lensx/plugin-contract/manifest.schema.json`；未声明的 deep import 不受支持。

package 拥有作者可控的 `manifest_version: "0.1.0"` 协议，并将其实现为严格的 Draft
2020-12 JSON Schema。Schema 是 wire format 的结构真源，已提交的 `PluginManifestInput`
由它确定性生成。package TypeScript 实现与明确的 Rust 模型读取相同的 package-owned valid、
invalid、normalized 和 incompatible fixtures，从而保持 validity、compatibility、规范化输出
及诊断 `code`/`path` 一致。

项目自有的完整示例位于
[examples/plugin-contract-consumer/manifest.json](../../../examples/plugin-contract-consumer/manifest.json)。

### 字段模型

| 字段 | 契约 |
| --- | --- |
| `manifest_version` | 必填，且必须精确等于 `0.1.0`。 |
| `plugin_id` 和 `version` | 必填的稳定命名空间插件 ID 和 SemVer 发布版本。 |
| `display` | 必填的本地化 `name`；可选本地化 `description` 和包内 asset `icon`。 |
| `publisher` | 必填的作者声明 `author`、HTTPS `homepage` 和 HTTPS `repository`；三者都不建立信任。 |
| `compatibility` | 必填的 `lensx` 和 `host_api` SemVer 半开区间。 |
| `runtime` | 必填 `kind: "iframe"` 和包内 HTML `entry`；它只是元数据，不会创建 iframe。 |
| `requested_permissions` | 可选的唯一权限请求及本地化原因；请求不等于授权。 |
| `contributes.pages` | 一个或多个具有唯一 ID 的 Page，包含本地化标题、内部 route，以及可选 parent/icon 和已请求权限依赖。 |
| `contributes.actions` | 可选的唯一 Action，包含本地化标题/描述、Action 自有的 `default_keywords`、可选 icon 和只指向 Page 的 target。 |
| `contributes.launcher` | 可选的 `default_action_id`，引用一个已贡献 Action；它不实现排序或注册。 |

用户可见的本地化文本在去除首尾空白后必须包含非空 `en-US`，并可提供 `zh-CN`；消费方回退到
英文。未知 locale key 和未知字段会被拒绝。缺失的可选集合规范化为空集合，而显式 `null`
始终无效。

Page 和 Action ID 都是插件内本地 ID。Host 私有 Plugin Action 投影会把全局 Action ID 派生为
`<plugin_id>.<local_action_id>`；公共校验器本身不会执行该投影。Page parent 引用必须存在，
且整个图必须无环。每个 Action target 必须是
`{ "kind": "page", "page_id": "<local-page-id>" }`。Action 关键词始终归属于对应 Action，
不会成为插件级别的共享别名。Page 权限依赖必须是顶层请求权限的子集。

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
Tauri 值、Rust 实现对象，或 `source`、`lifecycle`、`enabled`、安装路径、已授予权限、签名
状态、runtime 状态等 Host-owned 字段。Publisher 元数据是不受信任的作者输入，不能单独用于
授予信任或权限。

Contract package 版本、Manifest 协议、Host API 协议与 lensX 应用版本都从 `0.1.0` 起步，
但此后独立演进。package 实现修复不会改变 wire protocol；Manifest 或 Host API 的 breaking
change 更新各自版本维度。当前契约不提供更早 Schema、deprecated symbol alias、兼容 adapter
或迁移分支。

运行 `pnpm run generate:plugin-manifest-types` 可重新生成已提交的输入类型，运行
`pnpm run check:plugin-contract` 可执行完整 drift gate。门禁覆盖生成类型、package tests、Host
边界、Rust 共享 fixtures，以及把真实 tarball 安装到隔离外部消费者中的验证。tarball 只包含
运行时 JavaScript、声明、两个 Schema 入口和 package metadata，不包含 tests、fixtures、生成
scripts 或 Host 私有源码。

### 明确未实现的能力

静态校验本身不会发现或安装包、创建生产 registration、创建 iframe、授予权限、交换 Host API
消息或运行插件代码。下文的 Host 私有本地安装器可以把一个用户选中的兼容 `.lxp` 添加为 external
registration。独立的 surface 协调器可以把当前 Registration facts 投影进 Page 与 Action Registry，
并导航到 Host-owned placeholder，但该 placeholder 不是插件 Runtime。

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
Registration Contract，而当前唯一的生产写入方是下文的本地安装协调器。没有暴露通用生命周期写
command、前端管理界面或插件执行路径。

每个健康条目明确区分四种生命周期：

- 经过校验的 normalized Manifest 只包含作者可控数据和确定性默认值；
- 持久化的 Host registration facts 包含安装路径、由 Host 提供且带算法标签的包摘要、Host 控制的
  source、enabled intent、排序去重的 grant snapshot，以及最多最近 32 条规范且安全的诊断；
- 每次构造或恢复记录时，都根据 Manifest 范围以及当前 lensX 和 Host API 版本重新计算
  compatibility；
- Runtime 状态只属于当前进程，并且在本基础中始终以 `inactive` 恢复。

grant snapshot 默认为空。requested permissions 永远不会自动变成 grant。Host 控制的 source、
作者声明的 publisher 数据、requested permissions 和官方 provenance 声明都只是存储或展示事实；
它们都不能建立信任、授予权限或创建生命周期豁免。

Plugin Manager 专用 Store 为每个插件使用一个 version 1 JSON 记录。确定性的十六进制编码 record
key 构成安全文件名。每次转换先校验完整 next record，在同目录写入唯一临时文件并刷新，然后只对
该插件的目标记录执行原子替换。只有持久化成功后，Manager 才发布新的内存 snapshot。临时文件创建、
写入、刷新或替换失败都会保留原有内存和磁盘状态；恢复时忽略未完成的临时文件。

启动时会独立读取每条记录。语法损坏、未知格式版本、record key 与 Manifest identity 不一致，或
registration facts 不一致的记录会变成内存中的 quarantine stub，并携带稳定、安全的恢复诊断。
原文件保持不变，其他健康记录继续加载。如果整个 Store 目录不可读，Manager 会以空健康集合和
manager-level degraded 恢复报告启动；Tauri 启动仍然完成，也不会覆盖不可读数据。清除 quarantine
要求可信 Host 调用方使用完整有效记录进行原子替换，其中 enabled intent 必须显式提供。

这一内部状态只表示 Host 已知一条 installed registration。本地安装器现在可以为一个选中的兼容包
建立 package digest、payload 和首条 external registration，但 Manager record 本身仍不能证明发现来源。
卸载、更新、权限决策、Runtime session 和面向插件的公共 registration API 仍是独立能力。

## 已交付的 Host 私有从本地文件安装插件

设置页的 Plugins tab 提供一个 Host-owned **从本地安装** 操作。“本地”只描述本次安装来源，
不是一种独立的插件类别。无路径参数的
`install_local_plugin` command 打开原生文件选择器并只选择一个 `.lxp`；取消选择返回普通的
cancelled 结果。前端只会看到严格的 installation contract `0.1.0` 成功、取消或有界错误值，
不会提供或接收所选 source path、package digest、installation path、Store key、原始 native error
或内部恢复事实。

Rust 协调器先检查 source metadata，再把所选普通文件一次性读入有上限的不可变 byte buffer，并确认
文件在读取期间没有增长、截断或变化。只有 `compatible` inspection 才能继续。Inspection 与 extraction
复用同一个 canonical Zstandard/TAR traversal 和 limits。Extraction 使用 `create_new` 把普通文件写入
新的 Host-owned staging directory，再次校验 entry facts 与 checksums，刷新文件和目录，并且绝不调用
通用 archive unpack 操作。

Installer state 位于 `app_local_data_dir()/plugins`，与 Manager Store 相互独立。一个进程内 mutex 和
跨进程 `.install.lock` 会串行化 recovery 与 installation。Staging 使用 `.staging/<random-id>`，
已提交 payload 使用
`packages/<v1-plugin-id-utf8-lowercase-hex>/<package-sha256>`。这是 single-registration digest
layout：它有意不创建 `versions`、`transactions` 或 plugin data directory，也不会把不同 version 或
digest 解释为 upgrade、downgrade、reinstall 或 repair。

在已刷新的 staging directory 于同一文件系统原子 rename 后，协调器使用完整 Host facts 注册 normalized
Manifest：已提交绝对路径、带算法标签的 digest、`source=external`、`enabled=true`、空 grants 和
`inactive` Runtime。已有健康 registration 或 quarantined identity 会在 commit 前 fail closed。Manager
持久化失败会回滚 payload，或留下可证明的 orphan 供 recovery 处理；changed event 发送失败不会撤销
已经成功持久化和发布的 registration。

Installer startup recovery 只会在 Plugin Manager recovery 之后、并在同一 installation lock 下运行。
它清理合法的废弃 staging directory，并且只删除能够证明没有 owner 的 canonical digest payload；健康
installation path、quarantine-key subtree、未知 entry、symlink 以及 installer root 之外的任何内容都会
保留。证据不可读或不一致时，installer 会转为 unavailable 或 degraded，而不会进行推测性清理。

Installer root 属于 application-local data。在 macOS 上，它与已签名的 `lensX.app` bundle 分离，通常位于
应用的 Application Support 区域；直接删除 `lensX.app` 并不能保证这些数据被清理。专用应用卸载器、
plugin uninstall 和 upgrade/rollback 都需要后续已接受 change。

## 已交付的 Host 私有 Registration Contract

Host 现已通过 Registration Contract version `0.1.0` 投影 managed Plugin Manager。该 contract
只在 Rust、Tauri 与根应用 TypeScript 之间私有共享。`@lensx/plugin-contract`、
`@lensx/plugin-sdk` 和其他插件 package 都不会导出它；workspace boundary 会拒绝官方插件与
示例插件导入其类型、desktop adapter 或 event 入口。

该边界明确区分四层：author input、normalized Manifest、Host-owned registration summary/detail，
以及当前进程的 Runtime status。`read_plugin_registration_snapshot` 返回按 opaque entry identity
确定性排序的严格 `registered | quarantined` summary，以及 `available | degraded` Manager
availability。`read_plugin_registration_detail` 只接受合法 opaque entry identity，并返回绑定 revision
的 registered 或 quarantine detail。健康详情包含 normalized Manifest、`builtin | external` source、
enabled intent、逐维 compatibility、排序去重 grant、有界安全诊断，以及当前唯一的 `inactive`
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
stack、函数或 Tauri 对象。publisher、source、enabled intent、requested permissions，以及空或非空
grant snapshot 都是相互独立的事实；任何一项都不能建立信任或自动授权。该 contract 不会安装、
更新、卸载、enable、disable、执行或渲染插件。下文的 Host 私有 Action 投影核心消费它，但不改变
wire contract。管理 UI、真实 Runtime session、完整权限决策、签名、生命周期写操作、scoped
resource 解析和 Host API method 仍未实现。

## 已交付的 Host 私有 Plugin Surface 投影与 Page 导航

可信 TypeScript 应用现已在 Plugin Registration Desktop Adapter、统一 Page Registry 与唯一
Launcher Action Registry 之间交付一个生产 surface 投影协调器。它消费完整 snapshot 与同 revision
detail，而不是 event patch。只有 registered、enabled，并同时兼容 lensX 与 Host API 的插件才具备
资格；quarantine、degraded availability、消失或事实无法验证都会使对应 provider fail closed
注销。builtin 与 external source 使用完全相同的映射和执行规则。

两个 Registry 都支持可信 provider-scoped 完整批次替换，以及用空批次注销。Page Registry 保护
`lensx.core`，在提交前校验 Page identity、parent ownership、本地化字段、私有 route、排序后的
permission ID 与 availability，并返回隔离且确定性的 lookup 和 snapshot。非法、重复、跨 owner 或
部分无效输入会保留完整调用前状态，且不能删除其他 provider 的 Page、descriptor 或 executor。

纯 Page mapper 保持 `(owner_id = plugin_id, page_id = 插件本地 Page ID)` 为唯一 Page identity，
保留同 owner parent target 与私有 route，并派生本地化 provider/Page presentation。Page 仅在全部
required permission ID 都存在于当前 Host-owned grant snapshot 时 available；空 requirements 自然
available。该子集检查不会创建 grant，也不代表 permission catalog、用户决策或 session enforcement。

纯 Action mapper 设置 `owner_id = plugin_id`，派生
`action_id = <plugin_id>.<local_action_id>`，保留规范化的本地化 Action metadata 与关键词，并设置
`enabled = true`。Host-owned executor 只为注入的窄 Page opener 捕获冻结的插件 Page target 和 opening
Action ID。只有目标当前 available 的 Action 会被发布。Manifest route、permission、publisher、
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
同一 subscription。available Plugin Page 在现有单窗口 page surface 中渲染本地化 Host-owned
placeholder。placeholder 不会读取 route、加载 entry/asset、创建 iframe、调用 Tauri 或执行插件代码。
Task 4.1 scoped resources、Task 4.2 iframe Runtime 与 Task 5.5 完整权限管理仍未实现。

## 已交付的公共 Plugin SDK Foundation

lensX 已交付框架无关的 `@lensx/plugin-sdk@0.1.0` workspace package。package 只有一个公共
根入口，Runtime 只依赖 `@lensx/plugin-contract`。未声明的 deep import 不受支持；其公共声明
不要求 React、Semi Design、Tauri、DOM 全局、Node filesystem 类型或 Host 私有模块。

根入口公开 `createPluginSdk`、`PluginSdkError`、SDK lifecycle、Runtime context、取消和
transport 类型，以及下列独立版本事实：

| Export | 含义 |
| --- | --- |
| `PLUGIN_SDK_VERSION` | SDK package 与公共 API 版本，当前为 `0.1.0`。 |
| `PLUGIN_SDK_SUPPORTED_HOST_API_RANGE` | 支持的 Host API 半开区间，当前为 `>=0.1.0 <0.2.0`。 |
| `PLUGIN_HOST_API_VERSION` | SDK 不会重新导出；当前 Host API 版本仍由 `@lensx/plugin-contract` 持有。 |

`createPluginSdk({ transport })` 返回相互隔离的 client，而不是全局 singleton。client 依次使用
`idle`、`initializing`、`ready`、`disconnected` 和 `disposed` 状态。并发初始化共享同一次连接
尝试；被取消、超时或失败的尝试回到 `idle`，允许显式重试。断开对当前 client 是终止状态，不会
自动重连。销毁是幂等的，会取消 SDK 管理的 pending operation、移除 listener，并且最多销毁一次
transport。

进入 `ready` 前，SDK 校验、复制并冻结 `PluginRuntimeContext`。该 context 包含兼容的
`hostApiVersion`、`en-US | zh-CN` locale、`light | dark` theme，以及唯一且只读的 capability
ID snapshot。空 capability 列表有效，并不代表存在任何 Host API method。plugin identity、Page
identity、已授予权限、安装来源和 Host lifecycle 事实都不是受支持的 context 输入。

SDK 管理的 operation 默认超时为 10000 毫秒，并允许正有限整数覆盖。取消输入使用与原生
`AbortSignal` 结构兼容的最小 signal，但公共声明不引用 DOM 类型。超时、取消、断开或销毁会把
取消传给 transport、清理 timer 和 listener，并抑制迟到结果。

`PluginSdkError.code` 提供稳定的 SDK 级分支：`cancelled`、`timeout`、`disconnected`、
`disposed`、`incompatible_host_api`、`invalid_runtime_context`、`invalid_argument` 和
`transport_failure`。transport exception 会映射为安全 SDK error，不暴露原始异常、私有 stack、
Host 对象或 wire 数据。权限、未知 method 和 Host 参数错误仍属于后续 Host API contract。

`PluginSdkTransport` 是连接、抽象请求、抽象事件、断开通知与销毁的语义 adapter 注入边界。
它不定义 request ID、nonce、identity、origin、`Window`、`MessagePort`、`postMessage` 或
JSON-RPC envelope。公共 `PluginSdkClient` 特意不提供任意字符串 Host method 调用。SDK package
的白盒测试 fake 仍是私有 fixture；公共黑盒控制位于独立 Testkit package。

## 已交付的公共 Plugin Testkit

lensX 已交付只有一个公共根入口的 `@lensx/plugin-testkit@0.1.0`。它的 Runtime dependency 是
`@lensx/plugin-contract` 与 `@lensx/plugin-sdk` 的公共根入口；Contract 与 SDK 不反向依赖
Testkit。其 Runtime 和声明不需要 DOM、React、Semi Design、Tauri、Node filesystem、Host 私有
module 或测试运行器。

根入口提供：

- `createPluginManifestFixture()`：创建满足当前 Contract 的全新最小输入；
- `mutatePluginManifestFixture()`：按顺序执行基于 JSON Pointer 的 `set`/`remove`，并返回深拷贝；
- `createPluginRuntimeContextFixture()`：创建复制并冻结的 locale、theme、Host API version 与
  capability snapshot；
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
request hook 不是已交付的 Host API method client。capability ID 仍是不透明 context 数据，不是权限
请求、grant 或 decision。

`pnpm run check:plugin-testkit` 校验 package 测试与声明、Contract -> SDK -> Testkit 依赖方向、真实
tarball 内容，以及安装到 workspace 外的无 DOM ES2022 consumer。该 consumer 是发布 smoke fixture，
不是正式插件项目模板。Testkit 不提供 permission harness、iframe Runtime、插件执行或真实 Host API
method/error；后续 Host API、权限和 Runtime change 只能在对应契约接受后扩展此 package。

## 已交付的可选 Plugin UI Package

lensX 已交付面向 React 插件的可选 `@lensx/plugin-ui@0.1.0` package。根 export 严格限制为
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
交付不会创建 iframe、Runtime session、Host API、installer、registry、template 或插件执行路径。

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
icon/resource 解析、完整权限决策、生命周期写操作和外部 Runtime 执行仍是独立能力。最近使用与已
固定集合继续只保存 Action ID，因此投影 Action 会在 provider 缺失时隐藏，并在相同稳定 ID 返回时
恢复解析。

## 运行时边界

### 可信 Host Module

内建界面可以作为可信 React module 在应用 Provider 内运行。其注册元数据应与外部插件使用相同的
页面、action、权限和兼容性概念模型，同时 module 加载仍由 Host 控制。

可信 module 的契约名称必须保持框架中立，避免外部契约依赖 React 实现细节。

### 外部插件

实现外部插件执行后，插件 UI 必须在隔离的 iframe 中运行，并且只能通过受控 Host Bridge 通信。
外部插件不能直接访问：

- 应用 React 状态或组件实例；
- 私有前端模块；
- Tauri command；
- Rust 对象；
- 已授权 Host 方法之外的本地文件系统或操作系统 API。

外部运行时资源必须解析在已安装插件的边界内。

## Host API

预期通信流程为：

```text
iframe
  -> 类型化 Plugin SDK
  -> 基于 postMessage 的 JSON-RPC
  -> 来源、身份、方法、参数和权限校验
  -> Host API dispatcher
  -> 应用服务或 Rust command
```

Bridge 必须校验真实消息来源和受限制的 origin。已声明权限不等于已授予权限。特权方法必须在
分发前检查当前授权状态。

Host API 方法应当保持小型、类型化、版本化，并且可以独立测试。官方 SDK 已经提供相应方法时，
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

静态 Manifest 格式、校验器、Host 私有本地安装、Plugin surface 投影、生产 Action 激活、Page
Registry/navigation 与 Runtime-free Host placeholder 已经交付。其余每项能力——完整权限、scoped
resources、Host API 方法、公共打包、包含 uninstall 与 upgrade/rollback 的生命周期写操作、iframe
Runtime 执行或 sidecar——都需要独立的已接受规格和实现证据。本文定义架构方向和边界，不是发布
检查清单。
