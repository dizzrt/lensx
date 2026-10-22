# Spec Delta

## MODIFIED Requirements

### Requirement: Host API v1 MUST expose one closed, versioned semantic catalog

公共 Host API MUST 提供独立版本 `0.3.0` 的封闭语义目录，包含 `actions.open`、`http.request`、`runtime.get_context`、五个插件专属 `storage.*` 方法和 `ui.close` 的请求、结果、事件及有界错误。`http.request` MUST 是所有插件使用同一契约和控制边界的通用 HTTP 传输能力；翻译业务、语言判断、服务签名和凭据配置 MUST 留在插件内。目录 MUST NOT 包含 `clipboard.read`、`clipboard.write`、权限类型、权限需求映射、任意 Tauri 命令或通用原生执行器。未知或已移除方法 MUST 通过 Contract 与 Dispatcher fail closed。

#### Scenario: Consumer reads the Host API 0.3.0 catalog
- **WHEN** 外部消费者读取生成类型与运行时目录
- **THEN** 消费者看到九个当前 Session-bound 方法和独立协议版本，其中 HTTP 只暴露受控传输语义
- **THEN** 目录不存在剪贴板方法、权限目录、grant helper、私有传输类型或翻译专属原生方法

#### Scenario: Consumer reads the Host API 0.2.0 catalog
- **WHEN** 既有消费者仍使用旧 Host API `0.2.0` 的八方法封闭目录
- **THEN** 新增 `http.request` 不得被描述为旧目录已支持的方法，消费者必须升级 Contract/SDK 后才能理解新目录
- **THEN** 不满足新 Host 版本的旧包明确不兼容，不以静默目录裁剪绕过声明

#### Scenario: Legacy plugin calls clipboard
- **WHEN** 插件提交 `clipboard.read`、`clipboard.write` 或不兼容的旧 Host API 请求
- **THEN** Contract 或 Dispatcher 返回不兼容、method-not-found 或稳定 unavailable 结果，不产生原生副作用
- **THEN** 安装事实不能自动授权旧调用

#### Scenario: Consumer requests an undeclared method
- **WHEN** 消费者校验 `system.open_external`、任意字符串或其他未声明方法
- **THEN** Contract 以稳定 `method_not_found` 语义拒绝该方法
- **THEN** 方法不会仅因符合命名习惯就成为 capability

#### Scenario: Official provenance attempts to expand the catalog
- **WHEN** 插件来源、Publisher 或未来签名状态标识为官方
- **THEN** 它使用与外部插件相同的方法目录、payload Schema 和 HTTP 控制边界
- **THEN** 官方身份不提供隐藏方法、翻译专属原生捷径或 Host authority 绕过

### Requirement: Runtime Context MUST be the single capability-discovery snapshot

`PluginRuntimeContext` MUST 包含 Host API 版本、locale、theme 及当前 Session 实际可用方法的完整、排序、去重 capability 集合。Capability MUST 只来自可信当前 Session、provider 可用性和 Host 事实；MUST NOT 包含权限、grant、Manifest 理由、Publisher、来源或普通浏览器 Worker/network 能力。浏览器能力仍由 Web Runtime 决定。公开的受控 `http.request` 是独立 Host 方法，只有当前 HTTP provider 可用时才 MUST 出现在 capability 集合中；它不表示浏览器 CORS 策略变化。

`runtime.get_context` MUST 接受严格空参数并返回只读、复制、冻结的 Context。`runtime.context_changed` MUST 携带可独立校验的完整 Context 替换，不得发送局部 patch。可信 Session 身份失效时 MUST 终止旧 Session，MUST NOT 仅通过事件重新授权它。

#### Scenario: New Session receives Context
- **WHEN** 当前插件完成 Session 与 SDK 初始化
- **THEN** Context 返回 Host API `0.3.0` 及当前实际可用方法，包括可用时的 `http.request`
- **THEN** 空 capability 集合仍有效，且不表示普通浏览器 Worker/network 已被拒绝

#### Scenario: Provider or context changes
- **WHEN** locale、theme、provider 可用性或 Session currentness 改变
- **THEN** Host 发送完整 Context 替换或终止旧 Session
- **THEN** 不产生 grant mutation 或权限驱动的热注入

#### Scenario: Locale or theme changes without invalidating identity
- **WHEN** application locale 或 theme 改变且当前 Session 仍有效
- **THEN** `runtime.context_changed` 携带完整新 Context
- **THEN** 插件不再把新快照中省略的方法当作可调用能力

#### Scenario: Plugin supplies trusted Context fields
- **WHEN** 参数、事件或作者可控 payload 尝试提交 identity、source、Host API version、locale、theme 或 capability override
- **THEN** 严格 Schema 拒绝额外字段或错误来源的 Context
- **THEN** 插件输入不能改变 Host 推导的 Runtime 事实

### Requirement: Host API errors MUST be stable, bounded and separate from SDK lifecycle errors

Host API `0.3.0` MUST 保持封闭错误码集合 `invalid_request`、`invalid_params`、`method_not_found`、`not_found`、`conflict`、`limit_exceeded`、`unavailable`、`cancelled`、`timeout` 和 `internal_error`。错误只 MUST 包含 code 与稳定、有界、未本地化、安全的 message；MUST NOT 包含原始异常、stack、URL、路径、payload、请求/响应正文、鉴权头、grant、Host/Rust/Tauri 对象或产品本地化文案。完成的 HTTP 非 2xx 状态 MUST 按 `http.request` 的结果契约返回，不得误当成 Host transport 错误。

Host API 错误 MUST 与 SDK `disposed`、`disconnected`、`transport_failure` 等生命周期错误可区分。传输 MUST NOT 将有效 Host API 拒绝折叠为 `transport_failure`。

#### Scenario: Handler failure is exposed safely
- **WHEN** Host handler 抛出未知异常或返回无效内部值
- **THEN** 插件只接收到 `internal_error` 和安全消息
- **THEN** 原始异常、stack、路径、payload 和 Host 对象不进入公共错误

#### Scenario: Consumer handles a stable rejection
- **WHEN** 插件捕获 `not_found`、`limit_exceeded` 或 `unavailable`
- **THEN** 插件可以只根据 code 分支，不匹配消息文字
- **THEN** message 语言不随应用 locale 改变

#### Scenario: Transport disconnects before a Host result exists
- **WHEN** Session 或传输在 Host API 成功或拒绝结果存在前断开
- **THEN** SDK 保持 `disconnected` 生命周期语义，不编造 Host API `internal_error`
- **THEN** 两类错误来源保持可预测

### Requirement: Host API evolution MUST use capability discovery and explicit deprecation

Host API 协议、SDK 包与 lensX 应用 MUST 独立版本化。SDK MUST 在接受 Runtime Context 前按 SemVer 检查支持范围；插件 MUST 只调用当前 Context `capabilities` 中声明的方法。新增兼容方法 MUST 提升 Host API minor version 并通过 capability discovery 暴露。本次受控 HTTP 扩展 MUST 使用 Host API `0.3.0`，保持旧方法的 payload 和错误语义；Manifest 范围与 SDK 支持范围仍 MUST 分别验证。落在范围外的既有插件包 MUST 明确判为 incompatible 并由作者升级 SDK、调整声明及重新打包，Host MUST NOT 静默协商旧目录、隐藏新方法来冒充旧协议，或重写安装包。

现有 payload/error 的不兼容变化或方法移除 MUST 提升 Host API major version。被弃用的方法 MUST 保留原语义、在规范和机器目录中标记，并至少保留一个兼容 minor window 后才能在 major version 移除。

#### Scenario: New compatible method appears
- **WHEN** 新 Host API minor version 增加方法且插件 Manifest 和 SDK 支持范围均包含该版本
- **THEN** 已有方法保持原语义，新方法仅在 Context 声明可用后才被调用
- **THEN** package patch 不得冒充协议新增；旧封闭目录消费者必须升级到能理解新目录的 SDK

#### Scenario: Host version is incompatible
- **WHEN** Runtime Context 的 Host API SemVer 不满足 SDK 支持范围
- **THEN** SDK 初始化以 `incompatible_host_api` 失败且不进入 ready
- **THEN** capability 快照不能绕过版本不兼容

#### Scenario: Method is deprecated
- **WHEN** 方法在一个兼容 minor version 中标记为 deprecated
- **THEN** 目录与维护文档提供稳定替代方向，同时保留 params、result 和 error 语义
- **THEN** 移除只发生在已声明不兼容的 major version
