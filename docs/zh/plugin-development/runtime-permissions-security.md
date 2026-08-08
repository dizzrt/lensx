# Runtime 与安全

## Runtime 生命周期

每个 eligible plugin Page 都在一个使用 scoped plugin origin 的隔离 iframe 中运行。Host
创建私有 Session、传递 SDK transport、等待 ready，并拥有 deadline、retry、breaker、
navigation lease 与最终 teardown。close、navigation、disable、uninstall、replacement、
development reload、disconnect、Host reload 和 app unmount 会让旧 iframe、Worker、连接、
Blob URL、timer、listener、Session 与 port 失效。

## Context replacement

每个 iframe attempt 只初始化一次 SDK。`runtime.get_context` 与后续 Context event 提供完整
Host API 状态：版本、locale、theme 和当前非特权 method capabilities。一次状态变更中替换整个
Context。Worker/network 支持不是 Host API method，也不会出现在 capability 列表中。

## 开放 Web 能力

当前 macOS WKWebView 基线无需 Manifest 字段或 lensX grant 即允许页面生命周期内的
Dedicated Worker、package/HTTPS/Data/Blob 内容、HTTPS/WSS 连接、WASM 和浏览器 origin
storage。插件可在自身 HTML 中添加更严格的 CSP；浏览器会把它与 Host response policy 取交集，
因此只能收窄行为，不能削弱 Host 隔离。

SharedWorker、ServiceWorker、脱离页面的后台执行和设备/原生 API 不在承诺范围内。相机、
麦克风、定位、全屏和浏览器剪贴板可能因 WebView、Permissions Policy 或 OS 行为不可用。
lensX 不会把浏览器结果重新解释为 grant 决策。

## 失败与恢复

通过标准 feature detection 与 rejection 处理不可用的浏览器能力。对 Host API
`method_not_found`、`unavailable`、取消、超时、限制、disconnect 和不兼容 Context 做降级，
不要盲目重试。replacement 或 reload 后创建新的 Worker、连接、SDK 状态和订阅。绝不把上一
generation 的 URL、port、cursor 或浏览器状态复用为 Host authority。

## 安全边界

开放 Web 基线不会暴露 Host DOM、Tauri globals/IPC、Rust command、文件系统、Shell、进程、
原生剪贴板、另一个插件 origin 或旧 generation。Host 保留精确可信 ancestor、隔离 origin 与
generation、scoped resource path、`nosniff`、`no-store`、无 Host CORS authority、iframe
sandbox、referrer policy、设备限制、bounded RPC、deadline、breaker 与确定性 teardown。

因此安装是关于代码在该隔离 Web Runtime 中运行的信任决定。lensX 不审查、批准或持续监控插件
如何使用用户交给它的数据，也不对普通 Web 行为逐项授权。
