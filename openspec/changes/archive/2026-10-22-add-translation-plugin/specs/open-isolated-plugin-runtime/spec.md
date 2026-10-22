# Spec Delta

## MODIFIED Requirements

### Requirement: The open Web Runtime must remain separate from Host-native authority

插件 Runtime MUST 支持目标 WebView 基线内的普通 Web 内容与连接，包括 page-lifetime Dedicated Worker、浏览器网络请求、远程资源、`blob:`、`data:`、WASM 和 browser origin storage。普通 Web 能力 MUST NOT 暴露 Tauri IPC、Host DOM、任意 Rust command、filesystem、Shell、process 或未公开原生 provider，也 MUST NOT 承诺 SharedWorker、ServiceWorker 或超过页面生命周期的后台执行。

Host API `0.3.0` 新增的 `http.request` MUST 是独立、显式、受控的公共方法，经 SDK 与当前可信 Session 调用；它不改变浏览器 fetch 的 CORS/CSP 行为，不提供任意原生 API。该方法只 MUST 提供受限的公共 Internet HTTPS 443 传输，并遵循独立 HTTP 规范的目的地址、DNS、header/body、deadline、并发、取消和清理限制。翻译业务与服务签名 MUST 保持在插件内；所有插件使用同一 HTTP 边界。

#### Scenario: Plugin uses open Web capabilities
- **WHEN** 当前插件加载远程 subresource、创建 package/remote/Blob Dedicated Worker 或使用浏览器网络连接
- **THEN** WebView 遵循浏览器标准行为，不查询 lensX grant
- **THEN** Worker/network context 仍不能获得 Tauri、Host-private command、其他插件 Session 或浏览器策略禁止的跨域数据

#### Scenario: Plugin requests an unpublished native capability
- **WHEN** 插件尝试调用 Tauri、任意 Rust command、Shell、filesystem 或已移除 Host clipboard 方法
- **THEN** Host 边界拒绝调用或不提供入口
- **THEN** 普通 Web 行为、官方/开发来源和安装事实不创建额外原生 authority

#### Scenario: Plugin uses the published HTTP capability
- **WHEN** 当前 Context 包含 `http.request` 且插件通过公共 SDK 发送符合受控 HTTP 契约的请求
- **THEN** Host 传输可以返回不依赖浏览器 CORS 响应头的有界 HTTP 状态和内容
- **THEN** 插件不能获得 Host cookie、文件、内网访问、其他 Session 或通用原生执行能力

### Requirement: Source and community information must not change Runtime authority

官方、外部和开发插件 MUST 使用相同 Web Runtime、Host 隔离、Session、resource 与 lifecycle 边界。公开 `http.request` 的可用性和控制策略 MUST 同样适用于所有插件来源，不得绑定 Translation ID 或官方 provenance。Publisher、repository、release digest、未来 scan/rating/community label 可以用于展示与选择，但 MUST NOT 放宽 Host 隔离、授予额外原生 capability 或改变跨插件判断。

#### Scenario: Official and external plugins perform the same behavior
- **WHEN** 官方与外部插件加载相同 Worker/network/remote resource，或调用同一公开 HTTP 方法
- **THEN** 它们分别遵循相同浏览器基线或相同受控 HTTP provider 策略
- **THEN** 官方来源不获得 Tauri、私有 Host API、跨插件或持久后台例外

#### Scenario: Community information is absent or changes
- **WHEN** 插件没有 rating/scan/signature，或其社区信息之后变化
- **THEN** 已安装 Runtime 的 Host authority 不因此扩大或缩小
- **THEN** 用户仍可以通过 Host disable/uninstall 控制插件是否继续运行
