## MODIFIED Requirements

### Requirement: Host and plugin documents MUST run under distinct Host-owned Content Security Policies

生产 Host 主文档和每个 eligible plugin Runtime document MUST 使用非空、彼此独立、由 lensX 控制的 Content Security Policy。Host policy MUST 继续只允许已验证 Host bundle、Tauri IPC 和当前插件 frame class。插件 policy MUST 只强制保护可信 Host ancestor、Host/跨插件隔离和不可由作者放宽的 Runtime 边界，MUST NOT 再把 Worker、网络、远程 HTTPS/WSS 资源、`blob:`、`data:`、WASM 或浏览器 origin storage 作为 lensX permission-gated 内容类别。插件自己的 policy MAY 进一步收窄其内容来源，但 Manifest、HTML 或远程内容 MUST NOT 放宽 Host header 中的隔离策略。

Host main policy MUST NOT 因开放插件 Web Runtime 而改变。两种 policy 都 MUST 禁止插件获得 Host Tauri authority、把插件 document 作为 Host main document、跨插件复用 origin，或通过 wildcard ancestor 嵌入。

#### Scenario: 插件使用开放内容能力
- **WHEN** 当前插件 document 创建 Dedicated Worker、加载 package/remote/Blob/Data 内容或发起网络连接
- **THEN** plugin policy 不要求 lensX grant，并由目标 WebView 按开放 Web 基线执行
- **THEN** Host main CSP、可信 ancestor、Tauri 初始化和另一个插件 origin 保持不可达

#### Scenario: 插件尝试放宽 Host 隔离
- **WHEN** Manifest、HTML、remote script 或 plugin message 声明 wildcard ancestor、Host/Tauri source、共享 plugin origin 或更宽 Host bridge
- **THEN** Host-owned response policy 与 iframe/origin boundary 保持权威并阻止该扩权
- **THEN** 安装、official source、Publisher 或社区标签均不产生例外

### Requirement: Plugin CSP MUST be delivered by the current scoped resource response and proven on the target WebView

Host MUST 将当前 plugin isolation CSP 作为 response header 附加到每个成功的 current scoped HTML response，并为 GET/HEAD 保持一致的安全 header。该 policy MUST 使用精确可信 Host ancestor，且 MUST 与 scope、generation、path、MIME、`nosniff`、`no-store` 和 no-Host-CORS 保证共同生效。它 MUST NOT 依赖 author meta element、HTML rewriting、reflected Host origin、共享 plugin origin 或删除 frame/navigation negative cases。

开放的 package/remote module graph、Dedicated Worker、network、Blob/Data 与 WASM MUST 在目标 WebView 中通过正向证据；Host/Tauri、cross-plugin、stale generation、popup、top navigation 和 persistent background execution MUST 通过负向证据。插件 author policy 可以与 Host header 取交集并收窄自身行为。

#### Scenario: 当前开放 module graph 加载
- **WHEN** 当前隔离插件加载 package 与 remote script/style/image/font、创建 Dedicated Worker 并发起浏览器连接
- **THEN** 支持的 graph 在当前插件 origin 与 sandbox 内执行
- **THEN** 每个 Host-owned resource response 保留 current scope、generation、MIME、`nosniff`、`no-store` 和安全诊断边界

#### Scenario: 开放内容尝试取得 Host 或旧 authority
- **WHEN** package、remote、Blob/Data 或 Worker 代码尝试访问 Host/Tauri、另一个插件、旧 generation、popup、顶层导航或持久后台上下文
- **THEN** iframe、origin、navigation、Session 或 Resource boundary 阻止该尝试
- **THEN** negative evidence 只记录有界内容类别和平台事实，不泄漏目标 URI、origin token、scope、path、payload 或私有错误

#### Scenario: 目标 WebView 无法实施开放且隔离的策略
- **WHEN** 支持平台不能同时证明开放 Web 成功路径、精确 Host ancestor、GET/HEAD header agreement、Host/跨插件负面路径与 teardown
- **THEN** capability 保持未完成
- **THEN** 生产不得回退到共享 origin、Tauri 暴露、无 ancestor 限制或未验证的残留 Worker

### Requirement: Every Runtime attempt MUST have one idempotent generation-aware terminal cleanup
Cleanup/current-fact invalidation MUST 不再读取 grant changes，development reload MUST 保持 open Runtime/closed Host boundary。

#### Scenario: generation teardown
- **WHEN** close/replacement/reload/remove race
- **THEN** old contexts terminal 且无 permission boundary branch

### Requirement: Repeated Runtime failures MUST open a bounded process-local circuit breaker without automatic restart
Breaker reset MUST 不修改 Manager、source、enabled、quarantine 或不存在的 grant state。

#### Scenario: current generation becomes healthy
- **WHEN** ready 30 seconds 或 generation changes
- **THEN** only matching failure history clears

### Requirement: Task 4.4 MUST leave SDK transport and later platform capabilities unimplemented
该 historical capability MUST 不独立交付 SDK transport、Host API/native authority、storage、management UI 或 quotas；permission decisions 已删除。

#### Scenario: security lifecycle capability 独立成立
- **WHEN** focused gate passes
- **THEN** Runtime isolation/cleanup exists without native authority

## ADDED Requirements

### Requirement: 开放执行上下文必须随 Runtime attempt 完整终止

每个 Dedicated Worker、由插件页面发起的长连接、Blob URL 和其他页面拥有的开放 Web 上下文 MUST 受当前 Runtime attempt 与 resource generation 生命周期约束。close、navigation away、disable、uninstall、replacement、development reload、Session disconnect、breaker、Host reload、App unmount 或 process exit MUST 使旧上下文不可继续取得 Session、Host 或新 generation authority。

#### Scenario: 页面关闭时存在 Worker 和长连接
- **WHEN** 用户关闭一个仍有 Dedicated Worker 与进行中网络活动的插件页面
- **THEN** iframe teardown 使其页面拥有的执行上下文终止或变为不可控且无 Host authority
- **THEN** 新页面不复用旧 Worker、连接、Blob URL、Session、Port 或 origin scope

#### Scenario: 持久 worker 被请求
- **WHEN** 插件尝试注册 SharedWorker、ServiceWorker 或可脱离当前页面/generation 的后台上下文
- **THEN** 当前支持基线拒绝或不声明支持该能力
- **THEN** 该上下文不得在页面关闭、replacement 或 Host restart 后保留插件 authority
