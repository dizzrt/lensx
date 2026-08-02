# 扩展平台

## 文档状态

本文区分已经交付的静态插件 Manifest 契约、Plugin SDK foundation、Plugin Testkit、可选
Plugin UI package 与预期的运行时扩展边界。安装、分发、插件执行、权限、插件 action 投影与
搜索、iframe transport 和 Host API 当前尚未实现。稳定 spec 和源码共同决定已经交付的子集。

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

Page 和 Action ID 都是插件内本地 ID。未来 Host 投影可以把全局 Action ID 派生为
`<plugin_id>.<local_action_id>`，但已经交付的校验器不会执行该投影。Page parent 引用必须存在，
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

静态校验不会发现或安装包、注册插件、创建 iframe、授予权限、把插件 Action 投影进 launcher
registry、搜索这些 Action、导航 Page、交换 Host API 消息或运行插件代码。当前 App Shell 可以
搜索 Host 内建 launcher Action，但静态 Manifest 校验与该 registry、搜索路径、Action 集合或
Host icon 投影没有连接。

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

未来的内建 module 和外部插件必须通过经过校验的 provider adapter 投影 action。该 adapter 负责
先把 provider 身份和元数据映射到稳定的 launcher descriptor 契约，再进行原子 Host 注册。
插件 Action 注册后会自动使用与内建 Action 相同的搜索路径；搜索本身不会增加 provider-specific
分支。provider 不能直接修改 registry、选择可信 executor、调用特权桌面 command，或绕过 Host
dispatcher。特权行为仍然必须是明确的 Host capability，并具有自己的授权及类型化应用或 Rust
边界。

当前 registry 包含 Host 内建的隐藏 launcher 和打开设置 Action。静态插件 Manifest 契约不会注册
已贡献 Action，且尚未定义 provider lifecycle、unregister 或 replace 语义、权限、插件 Action/icon
投影或外部执行。因此，持久化的最近使用与已固定集合目前只会解析已注册的 Host Action。这些剩余能力
需要各自已接受的规格，不能通过隐式扩展 action descriptor 获得。

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

静态 Manifest 格式和校验器已经交付。其余每项能力——provider 投影、安装、权限、Host API
方法、打包、生命周期、runtime 执行或 sidecar——都需要独立的已接受规格和实现证据。本文定义
架构方向和边界，不是发布检查清单。
