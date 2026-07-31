# 扩展平台

## 文档状态

本文区分已经交付的静态插件 Manifest 契约与预期的运行时扩展边界。安装、分发、插件执行、
权限、插件 action 投影与搜索和 Host API 当前尚未实现。稳定 spec 和源码共同决定已经交付的子集。

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

## 已交付的静态 Manifest 契约

lensX 已经把作者可控的 Manifest 协议 `manifest_version: "1.0.0-dev"` 实现为严格的
Draft 2020-12 JSON Schema。Schema 是 wire format 的结构真源。生成的 TypeScript 作者输入
类型、明确的 Rust 作者输入模型以及两端校验器共同消费该契约。共享的 valid、invalid、
normalized 和 incompatible fixtures 约束分类、规范化输出以及诊断 `code`/`path` 行为一致。

项目自有的完整示例位于
[examples/plugin-manifest-v0/manifest.json](../../../examples/plugin-manifest-v0/manifest.json)。

### 字段模型

| 字段 | 契约 |
| --- | --- |
| `manifest_version` | 必填，且必须精确等于 `1.0.0-dev`。 |
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

校验依次经过严格 Schema 检查、确定性规范化、语义引用/路径/图检查和兼容性分类。公开诊断是
可序列化的 `{code, path, message}` 对象，使用 JSON Pointer path，并依次按 `path` 和
`code` 排序。

插件版本和兼容边界使用 SemVer，包括预发布版本优先级。当前版本满足
`min_version <= current < max_version_exclusive` 时兼容。结构和语义有效、但超出任一范围的
Manifest 是 `incompatible`，而不是 `invalid`。

规范化 Manifest 只包含作者声明的数据和确定性默认值。它不能包含 executor、函数、React 或
Tauri 值、Rust 实现对象，或 `source`、`lifecycle`、`enabled`、安装路径、已授予权限、签名
状态、runtime 状态等 Host-owned 字段。Publisher 元数据是不受信任的作者输入，不能单独用于
授予信任或权限。

### 明确未实现的能力

静态校验不会发现或安装包、注册插件、创建 iframe、授予权限、把插件 Action 投影进 launcher
registry、搜索这些 Action、导航 Page、交换 Host API 消息或运行插件代码。当前 App Shell 可以
搜索唯一的内建 launcher Action，但静态 Manifest 校验与该 registry 或搜索路径没有连接。

## Host Action Registry

已经交付的 launcher action 核心建立了 Host 所有的 TypeScript registry，用于保存经过校验且可
序列化的 action descriptor。descriptor 元数据与 executor 相互分离：消费者可以读取不可变的
descriptor snapshot，只有可信 Host dispatcher 能够解析和调用 executor。外部代码绝不能把
函数、React 状态、Tauri 对象或 Rust 实现值放进 descriptor。

Launcher 搜索 service 只消费该 registry 的不可变 descriptor snapshot。它对每个已注册
descriptor 使用相同的确定性 locale 解析、token 匹配、评分、排序和 enabled 过滤。它不会读取插件
display name、Manifest 私有数据或 provider 来源，也不会提升 Manifest 的
`contributes.launcher.default_action_id`。

未来的内建 module 和外部插件必须通过经过校验的 provider adapter 投影 action。该 adapter 负责
先把 provider 身份和元数据映射到稳定的 launcher descriptor 契约，再进行原子 Host 注册。
插件 Action 注册后会自动使用与内建 Action 相同的搜索路径；搜索本身不会增加 provider-specific
分支。provider 不能直接修改 registry、选择可信 executor、调用特权桌面 command，或绕过 Host
dispatcher。特权行为仍然必须是明确的 Host capability，并具有自己的授权及类型化应用或 Rust
边界。

当前 registry 只包含一个 Host 内建 action。静态插件 Manifest 契约不会注册已贡献 Action，
且尚未定义 provider lifecycle、unregister 或 replace 语义、权限、插件投影或外部执行。这些
能力需要各自已接受的规格，不能通过隐式扩展 action descriptor 获得。

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
