## Context

仓库当前只有 `@lensx/plugin-contract@0.1.0` 公共 package。它负责 Manifest wire format、生成类型、校验/归一化、诊断以及 `PLUGIN_HOST_API_VERSION`，但不提供插件运行时客户端。现有 workspace 已允许 `packages/*` 成为公共 package，并通过根 lifecycle 命令和依赖边界检查统一验证。

路线图后续 change 才会定义具体 Host API method、Runtime session 和真实 iframe transport。因此本 change 需要建立一个可发布、可测试的 SDK kernel，同时避免提前固定 `postMessage` envelope、可信身份、权限或具体 Host method。它还必须给 Plugin UI 和 Testkit 提供稳定的公共类型基础，而不能依赖 React、Semi Design、Tauri、DOM 全局对象或 Host 私有模块。

## Goals / Non-Goals

**Goals:**

- 建立 `@lensx/plugin-sdk@0.1.0` 的受限公共入口、独立构建和真实 tarball 验证。
- 提供显式实例化、无全局状态的 SDK client 生命周期。
- 定义真实 Runtime transport 可以实现、测试 transport 可以注入的框架无关 interface。
- 稳定初始化、请求、事件、取消、超时、断开、销毁和 SDK 错误的语义。
- 提供只读、经过运行时验证的 Runtime context，覆盖 Host API 版本、locale、theme 与 capability snapshot。
- 复用 Contract package 的 Host API 当前版本事实源，并独立表达 SDK 版本及其 Host API 支持范围。

**Non-Goals:**

- 不创建 iframe，不实现 MessagePort、`postMessage`、JSON-RPC envelope、握手、origin/source 校验或 Runtime session。
- 不定义 `runtime.get_context`、`ui.close`、`actions.open`、存储等具体 Host API method/event Schema。
- 不实现权限声明、授权、dispatcher、插件身份推导、安装、注册、页面执行或 UI。
- 不向插件作者发布 fake transport、permission harness 或完整 Testkit；本 change 的 fake 仅作为 package 内部测试夹具。
- 不提供通用 raw Host API 调用入口，使其成为绕过未来 typed SDK method 的永久公共 escape hatch。

## Decisions

### 1. SDK 是单实例 client，不使用全局 singleton

公开 `createPluginSdk(options)`，每次返回独立的 client。client 暴露只读 `state`、只读 `context`、`initialize()`、生命周期订阅和 `dispose()`；状态模型为：

```text
idle ──initialize──▶ initializing ──success──▶ ready
  ▲                       │                     │
  └──── retryable error ──┘                     ├──transport disconnect──▶ disconnected
                                                │
                                                └──dispose────────────────▶ disposed

idle / initializing / disconnected ──dispose──▶ disposed
```

- 同一实例并发调用 `initialize()` 共享一次初始化结果，避免重复连接。
- 可恢复的初始化失败回到 `idle`，允许显式重试；SDK 不自动重试。
- `disconnect` 是当前实例的终止通信状态；本 change 不预定义 Host reload/reconnect 策略。
- `dispose()` 幂等，取消 SDK 管理的 pending 操作、移除订阅并调用 transport dispose。
- `disposed` 后所有初始化或通信尝试稳定失败。

选择实例 client 而不是 singleton，是为了支持隔离测试、未来多个 Page session，以及按页面销毁资源。选择显式重试而不是自动重连，是为了不在 Runtime session 策略确定前引入隐藏生命周期。

### 2. Transport 是语义接口，不是 wire protocol

公开 `PluginSdkTransport` 作为依赖注入边界。它表达：

- 建立连接并返回 Runtime context；
- 发起带 method、params、取消信号的抽象请求；
- 订阅抽象事件与断开通知，并返回 unsubscribe；
- 销毁 transport。

接口不包含 request ID、nonce、plugin identity、origin、`Window`、`MessagePort`、`postMessage` 或 JSON-RPC envelope。后续真实 transport 可以在内部把这些语义映射到受控 wire protocol。

transport 的 request/event primitive 是实现 SDK adapter 的低层注入契约，不作为 `PluginSdkClient` 的任意 method 调用入口。具体、typed 的插件作者 API 必须等待 Host API contract；这样后续可以只开放已声明 method，而不会保留一个任意字符串调用的公共 client escape hatch。

替代方案是在本 change 直接实现 iframe transport，但它依赖尚未交付的 Runtime session、来源绑定和 Host API Schema，会混淆 Task 1.3 与 Task 5.2。另一个替代方案是完全不公开 transport interface，但这会阻止非浏览器测试注入并迫使 Testkit 依赖私有 SDK 实现。

### 3. SDK 统一拥有超时，取消采用 AbortSignal-compatible 结构

SDK 为初始化和请求应用统一的默认超时，默认值为 10 秒；调用方可以用正的有限毫秒数覆盖。SDK 在超时或销毁时触发传给 transport 的取消信号，并把结果映射为稳定 SDK 错误。

公共声明使用与原生 `AbortSignal` 结构兼容的最小只读接口，而不是引用 DOM `AbortSignal` 类型。浏览器和 Node 调用方可以直接传入原生 signal，同时没有 DOM lib 的 TypeScript consumer 也可以解析 SDK 声明。

transport 仍必须观察取消信号并尽快停止工作；SDK 忽略取消之后迟到的成功/失败结果。事件订阅返回幂等 unsubscribe，client dispose 后不再交付事件。

替代方案是让每个 transport 自行决定 timeout，但 fake 与真实 transport 会产生不同可观察行为。使用自定义 cancel token 则会增加插件作者适配成本。

### 4. Runtime context 与 client 生命周期分离

`PluginRuntimeContext` 是 Host/transport 提供的只读数据，而 `PluginSdkState` 描述本地 client 生命周期。首版 context 包含：

- `hostApiVersion`：用于 SDK 支持范围检查的 SemVer；
- `locale`：`en-US | zh-CN`；
- `theme`：`light | dark`；
- `capabilities`：唯一、非空、稳定 ID 的只读 snapshot；空数组是有效状态。

SDK 在进入 `ready` 前运行时校验 context，复制并冻结公开 snapshot，拒绝未知 locale/theme、非法 Host API 版本、重复或空 capability ID。context 不包含由插件提供的 plugin/Page identity、已授予权限、安装来源或生命周期事实。

真实 Runtime 后续可以通过握手或 `runtime.get_context` 产生相同公共类型；本 change 不规定 wire 获取方式，也不为 capability 预先定义具体 method 名。

替代方案是把 locale/theme 放入 Plugin UI 私有 props，但这会让不同 UI 技术栈得到不同 Runtime 信息。把身份和权限放入 context 则会在可信 session 设计之前固定安全敏感字段。

### 5. SDK 与 Host API 使用独立版本维度

`PLUGIN_SDK_VERSION` 从 `0.1.0` 开始，随 SDK 公共 package API 独立演进。`PLUGIN_SDK_SUPPORTED_HOST_API_RANGE` 使用半开范围 `>=0.1.0 <0.2.0`，并由 SDK 在初始化时检查 Runtime context。

当前 Host API 版本继续只从 `@lensx/plugin-contract` 的 `PLUGIN_HOST_API_VERSION` 导入；SDK 不定义第二个“当前 Host API 版本”常量。范围比较由 SDK 内部的小型 SemVer 实现完成并以边界/预发布用例测试，不增加新的 runtime dependency，也不公开另一套通用 SemVer API。

选择范围而不是精确相等，使兼容的 `0.1.x` Host 修订不要求 SDK 同步发版。选择 `0.2.0` 作为首个排他上限，符合当前 pre-1.0 breaking-change 策略。

### 6. SDK 错误与未来 Host API 错误分层

SDK 公开 `PluginSdkError` 和稳定 `PluginSdkErrorCode`，至少包括：

- `cancelled`
- `timeout`
- `disconnected`
- `disposed`
- `incompatible_host_api`
- `invalid_runtime_context`
- `invalid_argument`
- `transport_failure`

错误对插件提供稳定 code、message 和必要的安全元数据，但不公开 transport 原始异常、stack、Host 对象或私有 envelope。未知 transport failure 统一映射为 `transport_failure`。权限拒绝、未知 method、参数校验等属于未来 Host API error contract，不在本 change 中虚构。

选择抛出稳定 SDK Error 而不是为所有调用返回 result union，可以保留常规异步 API 使用方式；code 仍允许调用方可靠分支。未来 Host API error 可以作为另一层稳定 code 映射，而不改变 SDK lifecycle error。

### 7. Package 与发布边界沿用 Contract package 模式

`packages/plugin-sdk` 使用 ESM、`sideEffects: false`、单一根 export，并声明有意义的 `build`、`typecheck`、`test`、`check` 与 `test:pack`。它只把 `@lensx/plugin-contract` 作为直接 workspace runtime dependency，不新增 React、Semi Design、Tauri、DOM shim、Node filesystem runtime 或第三方运行时依赖。

真实 tarball 测试必须在隔离 consumer 中安装 `@lensx/plugin-contract` 与 SDK tarball，只通过公开入口完成 typecheck 和生命周期 runtime smoke test；同时检查 tarball 不包含测试、fixture、脚本或 Host 私有源码。公共声明边界测试确保没有被禁止的框架/Host/DOM 类型泄漏。

文档在 extension platform 中记录 SDK 与未来 Runtime 的边界，在 plugin workspace 中记录 package、命令、依赖方向与消费方式，并同步英文 canonical 与中文镜像。

## Risks / Trade-offs

- **[基础类型可能早于真实 Runtime 固化]** → 仅稳定与后续实现无关的语义；不暴露 wire envelope、具体 Host method、身份或权限字段，并用 pre-1.0 版本策略管理必要变更。
- **[公开 transport interface 可能被误当成任意 Host API]** → client 不暴露 raw request；文档把 transport 标记为 adapter/Testkit 注入边界，真实 Host 仍对未知 method deny-by-default。
- **[SDK 与 Contract 各自实现 SemVer 比较可能漂移]** → SDK 只实现其固定支持范围所需的私有比较逻辑，覆盖相同 SemVer 边界与预发布场景；不导出第二套通用 SemVer API。未来如需共享，应通过独立 change 扩展 Contract package。
- **[10 秒默认超时不适合所有未来方法]** → 允许 SDK 初始化选项和单次 operation 覆盖；具体 Host method 可在其 contract 中给出更窄默认值。
- **[capability snapshot 尚无真实来源]** → 允许空 snapshot，package 内测试 transport 提供数据；真实来源与 method ID 留给 Host API/Runtime changes。

## Migration Plan

1. 新增 SDK workspace package、package-local 测试和发布验证，不修改当前 Host 或插件运行行为。
2. 接入根 workspace 聚合命令与边界测试，确认现有 Contract package 和应用行为不变。
3. 更新双语架构/开发文档，将 SDK foundation 标记为已交付而 iframe Runtime、Host API 和 Testkit 仍未交付。
4. 后续 change 通过公共 transport interface 添加真实 adapter 和 typed Host API，不修改私有 Host 消息为公共 API。

回滚时可移除新 SDK package、对应文档和验证入口；当前没有生产 Runtime consumer、持久化数据或 wire migration。

## Open Questions

无。真实 iframe wire protocol、Runtime session 重连和具体 Host API capability identifier 由其各自后续 change 决定。
