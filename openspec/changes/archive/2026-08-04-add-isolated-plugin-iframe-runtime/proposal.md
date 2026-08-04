## Why

Plugin Page 导航、安全资源服务和 macOS frame-aware navigation policy 已经交付，但外部插件 Page 仍只显示 Host-owned 占位内容。真实 WKWebView 探针进一步证明：`sandbox="allow-scripts"` 虽能保持 opaque origin 并加载 HTML、CSS、图片与 classic script，却无法加载代表性 ES Module 图，因此 Task 4.2 必须先消费独立 Runtime origin，而不能通过共享 origin、wildcard/null CORS 或 classic-only bundle 绕过现代插件 Runtime 的安全边界。

## What Changes

- 将 `add-isolated-plugin-runtime-origin` 设为新的实施前置条件；它负责交付每个当前 resource scope/generation 独立的浏览器 origin、Resource Service URL contract、frame-aware target normalization 以及真实 macOS WKWebView module/storage/security 门禁。
- 在现有单窗口 Page surface 中，以 Host-owned 隔离 iframe 替换可用外部插件 Page 的 Runtime-unavailable 占位内容；Host Page 仍直接渲染受信任 React 模块。
- Host 只根据当前 Page Registry、Registration revision、Plugin Resource Service 的已验证独立-origin `entry_url` 生成 iframe 入口；插件不能提交 URL、origin、sandbox token、allow policy 或导航权限。
- iframe 固定使用 `sandbox="allow-scripts allow-same-origin"`，但仅允许装载由前置 capability 证明为当前 scope/generation 独占、与 Host 及其他插件不同源的入口；共享 `lensx-plugin://localhost` 或等价 translated origin 必须 fail closed。
- 保持 deny-by-default 的 Permissions Policy、`no-referrer`、精确 frame-aware navigation lease、Tauri main-frame-only bootstrap 和跨插件资源隔离；不添加 wildcard/null CORS，也不把 classic-only/inlined fixture 变成公共打包约束。
- 将容器生命周期限定为 `resolving`、`loading`、`loaded`、`failed` 和 `disposed`；`loaded` 不表示 Runtime Session 或 SDK `ready`。
- 提供 Host-owned 加载反馈、可诊断失败和显式重试。每次重试重新读取当前 Registration snapshot、重新解析入口并重新挂载 iframe，不复用旧 URL、origin lease 或 iframe。
- 同一时刻只保留当前活跃插件 Page 的一个 iframe；关闭、Page invalidation、插件禁用/卸载/替换、resource generation 或入口身份变化时销毁旧容器。
- 更新英文架构文档及其简体中文镜像，明确已交付 Runtime 容器、隔离 origin 前提，以及仍未交付的 Session、Host API、permissions 和完整 CSP。

本 change 的非目标包括：设计或实现独立 Runtime origin 本身、Windows/Linux Runtime、Runtime Session、nonce/MessagePort、SDK iframe transport、JSON-RPC、Host API、权限决策、完整 Host/iframe CSP、通用 timeout/crash recovery、pending RPC 清理、多标签或历史路由、后台/保活 iframe、多实例池、外部链接、任意网络/文件系统能力，以及正式插件项目模板。

用户可见影响是：前置能力和本 change 均通过后，打开有效插件 Page 将显示真实插件 UI 与 Host-owned 加载/失败/重试反馈；关闭或失效时仍沿用当前 Page context、关闭按钮和返回 Home 行为。

## Capabilities

### New Capabilities

- `plugin-iframe-runtime`: 定义可信独立-origin入口消费、隔离 iframe 策略、容器状态、显式重试、安全导航、Tauri 拒绝和单活跃 Page 生命周期。

### Modified Capabilities

- 无。独立 Runtime origin、Plugin Resource Service URL contract 与 frame-aware URL normalization 由前置 `add-isolated-plugin-runtime-origin` 修改；本 change 只组合其已验证输出。

## Impact

- 前端：`src/App.tsx` 的插件 Page 分支、`src/app/pages/PluginPagePlaceholder.tsx`、Host-private Runtime resolver、Plugin Resource Desktop Adapter 消费边界、i18n、Semi Design 反馈与 Runtime 样式。
- Rust/Tauri：消费 `add-frame-aware-webview-navigation-policy` 和 `add-isolated-plugin-runtime-origin` 交付的 macOS policy、独立-origin entry URL 与单 active-target epoch lease；不得复制原生 policy 或新增插件可调用 command。
- 测试：新增 Runtime 状态、入口派生、重试、销毁、精确 sandbox、origin 前置校验、模块图、storage isolation、导航拒绝、Tauri bridge 拒绝和真实 `.lxp`/WKWebView coverage。
- 文档与规格：新增 iframe Runtime capability，并同步 `docs/en` 与 `docs/zh`；Plugin Page navigation、Resource Service 和 Runtime origin 继续保有各自职责。
- 依赖：复用现有 React、Semi Design、Tauri、Resource Service 和测试栈；不引入新的运行时依赖或组件库。
- 前置能力：`add-frame-aware-webview-navigation-policy` 与 `add-isolated-plugin-runtime-origin` 均必须通过各自的 macOS WKWebView 门禁；本 change 不宣称 Windows/Linux 支持。
