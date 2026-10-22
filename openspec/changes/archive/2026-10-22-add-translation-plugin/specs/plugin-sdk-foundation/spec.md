# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: SDK 0.3.0 MUST preserve the current Host API compatibility boundary`
- TO: `### Requirement: SDK MUST preserve the declared Host API compatibility boundary`

## MODIFIED Requirements

### Requirement: SDK MUST expose an official zero-configuration WebView transport entry

包 MUST 导出 `@lensx/plugin-sdk/webview` 与 `createPluginWebviewTransport` 作为唯一生产 Runtime transport factory。根 `PluginSdkTransport` 抽象 MUST 保持 semantic、framework-neutral，并可在没有 DOM/native 类型的环境中使用。WebView entry MUST NOT 暴露或接受 bridge global、label、handle、identity、origin、nonce、frame codec、Tauri command 或 Host adapter。新增 `http.request` MUST 复用同一受控 typed request 和 WebView 传输，不增加插件可导入的 Tauri/native HTTP 入口。

#### Scenario: External plugin consumes SDK 0.4.0
- **WHEN** 临时外部 consumer 从打包 SDK 导入 root 与 `/webview` entry
- **THEN** TypeScript 与浏览器构建成功，不依赖 workspace source 或私有模块
- **THEN** factory 只发现 Host 安装的当前 bridge

#### Scenario: External plugin consumes SDK 0.3.0
- **WHEN** 外部插件仍携带旧 SDK `0.3.0`
- **THEN** 其 root 与 `/webview` 入口的既有契约保持独立，但不得声称已支持新的 HTTP 方法或 Host API `0.3.0`
- **THEN** 该插件需要升级 SDK、检查 Manifest 范围并重新打包才能在新 Host 使用新能力

#### Scenario: Root SDK is imported outside a browser
- **WHEN** 测试导入根包并注入 semantic fake transport
- **THEN** 不读取 browser/native global，正常 SDK lifecycle 保持可测试

### Requirement: SDK MUST preserve the declared Host API compatibility boundary

当前 SDK 包版本 MUST 为 `0.4.0`，Host API 支持范围 MUST 为 `>=0.2.0 <0.4.0`，并使用公共 Contract 的当前方法/请求/结果/Context 验证，不复制独立目录。支持范围的最低版本 MUST 保留 `0.2.0`，不能仅因当前 Contract 常量升至 `0.3.0` 就把旧 Host 排除。初始化 MUST 在 ready 前拒绝不兼容 Runtime Context。SDK MUST 仅在当前 Context 声明 `http.request` 后允许该方法；旧 Host 上未声明 HTTP 时 MUST 明确拒绝，MUST NOT 隐式退回浏览器 fetch 或私有 native 入口。

旧 SDK `0.3.0` 的既有支持范围和封闭目录 MUST NOT 被描述为已经支持 Host API `0.3.0`。作者 MUST 使用新的 SDK 及相应 Manifest 兼容范围重新构建、打包后使用新能力，Host MUST NOT 重写旧插件包。

#### Scenario: Compatible Host API initializes
- **WHEN** Runtime Context 报告有效 Host API `0.2.x` 或 `0.3.x`
- **THEN** SDK `0.4.0` 在其他校验通过后可以进入 ready
- **THEN** 只有实际 Context 包含 `http.request` 的 Session 才能调用 HTTP

#### Scenario: Incompatible Host API initializes
- **WHEN** Runtime Context 超出已声明的半开支持范围
- **THEN** 初始化以既有稳定不兼容错误失败

#### Scenario: HTTP request is cancelled or the SDK is disposed
- **WHEN** HTTP 进行中调用方取消、SDK dispose、Session disconnect 或 Runtime 被替换
- **THEN** 既有取消与生命周期语义使调用只结算一次，晚到响应不能恢复旧调用
- **THEN** SDK 使用同一公共 cancellation 边界，不暴露原生 request handle
