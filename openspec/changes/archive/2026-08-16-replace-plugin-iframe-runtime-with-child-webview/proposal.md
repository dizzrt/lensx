## Why

当前外部插件 Page 作为 Host WebView DOM 内的 iframe 运行，插件执行、Host 展示和浏览器嵌入语义仍耦合在同一 FrameTree 中。为了把 lensX 建设为面向开放社区的桌面插件平台，需要让每个当前插件 Page 成为同一原生窗口中的独立顶层 Web 执行上下文，同时继续严格封闭 Host/Tauri/native authority。

## What Changes

- **BREAKING**：用 Host 创建并管理的 Child WebView 完全替代插件 iframe；Host WebView 与当前插件 Child WebView 成为同一原生 Launcher Window 中互不重叠的兄弟视图，运行期最多存在一个当前插件 Child WebView。
- **BREAKING**：Manifest 升级到新的协议版本，`runtime.kind` 从 `iframe` 改为 `webview`。旧 Manifest、旧 `.lxp` 和旧 iframe Runtime 不获得兼容别名、静默迁移或双运行路径；ConfigLens、模板和所有正式 fixture 必须重新构建为新协议。
- **BREAKING**：公共 SDK 移除 `@lensx/plugin-sdk/iframe` 与 `createPluginIframeTransport`，改为零配置的 `@lensx/plugin-sdk/webview` 与 `createPluginWebviewTransport`；根入口的抽象 `PluginSdkTransport` 语义保持框架无关。
- **BREAKING**：移除父子窗口 `postMessage`、`contentWindow`、转移 `MessagePort` 和 iframe-origin bootstrap。Host 以实际 Child WebView label/handle、插件、Page、resource generation 和 Runtime attempt 派生 Session，并通过仅对该 Child WebView 开放的私有、版本化 bridge 承载 ready、request、cancel、response、event 和 disconnect。
- 将插件文档导航从 Host 主 WebView 的 descendant-frame 例外迁移为 Child WebView 自身的顶层导航策略。Host 主 WebView 不再加载任何插件文档；Child WebView 仅能提交当前 Host 派生入口，popup、download、外部顶层导航和旧 generation 继续 fail closed。
- 保持“开放 Web、封闭 Host”：插件 Child WebView 继续支持目标 WebView 已验证的 Dedicated Worker、HTTPS/WSS、远程资源、Blob/Data、WASM 和浏览器 origin storage，但不获得 Host DOM、通用 Tauri IPC、任意 Rust command、文件系统、Shell、进程、其他插件或旧 Session authority。
- 新增 Host-owned native slot/bounds/focus 协调。React 只声明当前插件内容矩形和展示状态；Rust 创建、定位、显示、隐藏、聚焦和销毁 Child WebView。插件不能提交自身位置、尺寸、z-order、窗口或 WebView 配置。
- 保留精确生命周期：语义等价的 Launcher hide/restore 与无关 Registration 变更复用同一 Child WebView/Session；close、换页、disable、replacement、upgrade、uninstall、development reload、retry、Host reload 和 App teardown 完整销毁旧 WebView、bridge、Session、Worker/网络上下文和资源 authority。
- 为 cold open、ready、hide/restore、格式化交互期间的 Host 响应性、内存释放和 teardown 增加真实 macOS WKWebView 性能与隔离证据；Child WebView 不是独立 OS 进程保证，安全结论只来自 Host-owned identity、origin、bridge、resource 和 lifecycle enforcement。

### Goals

- 将社区插件提升为独立顶层 Web 页面，消除 iframe sandbox、父页面和第三方嵌入语义对普通插件框架的限制。
- 让插件执行生命周期与 Host React DOM 解耦，同时保持单窗口、单当前插件 Page 的产品模型。
- 只通过版本化 lensX Host API bridge 暴露能力，防止 Child WebView 变成 Tauri 或 Rust authority 的旁路。
- 一次性切换公共 Contract、SDK、CLI、模板、官方插件和真实 Runtime 证据，不维护 iframe 兼容层。

### Non-goals

- 不新增文件系统、Shell、进程、原生剪贴板、通知、设备访问或任意窗口控制 Host API。
- 不保证一个插件对应独立 OS WebContent 进程，也不以 Tauri `unstable-multiwebview` 的 API 形态作为公共插件契约。
- 不同时运行多个插件 Child WebView，不新增标签页、后台插件、预加载池、隐藏 Runtime 或跨 Page 保活。
- 不在本 change 内扩展 Marketplace、签名、远程更新、自动 HMR 或 Windows/Linux 交付声明。
- 不把 Child WebView 迁移本身当作 ConfigLens 秒级格式化问题的完整修复；插件内部 Worker 与 bundle 性能另由实现任务以独立指标验证和修正。

### User-visible impact

- 插件继续在现有 Launcher Page 区域显示，但运行在独立 Child WebView 中；Host chrome、Page 标题、关闭和导航仍由 lensX 控制。
- 当前插件 hide/restore 保留页面内存，真实 close/reopen 创建全新页面；失败状态继续由 Host 以双语、主题和可访问方式呈现。
- 旧协议插件明确显示为不兼容，不能继续通过 iframe 运行；新的社区插件获得更接近普通顶层 Web 页面的运行环境。

## Capabilities

### New Capabilities

- `plugin-child-webview-runtime`: 定义同一原生窗口中的单当前插件 Child WebView、Host-owned native slot、顶层导航、展示、焦点、生命周期、隔离和真实桌面证据。
- `plugin-sdk-webview-transport`: 定义零配置公共 WebView transport、Child WebView 私有 native bridge、current-source Session 绑定、RPC carrier 和终止语义。

### Modified Capabilities

- `plugin-manifest-contract`: 升级 Manifest，并将唯一外部 Runtime kind 从 `iframe` 改为 `webview`，旧协议 fail closed。
- `plugin-contract-package`: 发布新的 Manifest Schema/类型/fixture，并移除 iframe Runtime authoring 语义。
- `plugin-package-format`: 让 `.lxp` 检查与 fixture 接受新 Manifest 并拒绝旧 iframe 协议，不改变 canonical archive profile。
- `plugin-iframe-runtime`: 删除完整 iframe 容器 capability，不保留隐藏兼容路径。
- `frame-aware-webview-navigation-policy`: 收敛为 Host 主 WebView 导航保护，删除 descendant plugin target lease；插件顶层导航迁入 Child WebView Runtime。
- `isolated-plugin-runtime-origin`: 将独立 origin/resource generation 绑定到实际 Child WebView，不再依赖 `allow-same-origin` iframe。
- `plugin-resource-service`: 将资源请求与当前 Child WebView/generation 绑定，并支持安全的 WebView 创建、销毁和缓存生命周期。
- `plugin-runtime-session`: 以实际 Child WebView identity 和私有 bridge 取代 `contentWindow`、parent origin、MessagePort transfer 与 iframe bootstrap。
- `plugin-sdk-iframe-transport`: 删除 iframe/MessagePort transport capability。
- `plugin-sdk-foundation`: 发布 `/webview` 入口并更新 SDK 版本、tarball、consumer 和边界说明。
- `plugin-rpc-validation`: 将 private wire ingress/egress 从 MessagePort frame 改为 current Child WebView bridge frame，保持限额、取消和非 oracle 诊断。
- `plugin-runtime-security-lifecycle`: 以 Child WebView load/bridge deadlines、单实例和完整 native teardown 替代 iframe/Port 生命周期。
- `open-isolated-plugin-runtime`: 把开放 Web 基线绑定到独立 Child WebView 顶层上下文，同时保持 Host/跨插件封闭。
- `plugin-host-api-dispatcher`: 让 Dispatcher authority 仅来自当前 Child WebView Session/bridge，而不是 iframe Port lease。
- `plugin-page-navigation`: 让外部 Page presentation 创建 Host-owned Child WebView slot，并保持 Host-controlled Page identity/close。
- `launcher-window-lifecycle`: 协调 Host WebView 与 Child WebView 的 native bounds、visibility、focus、hide/restore 和窗口 teardown。
- `plugin-development-mode`: development register/reload 使用与正式安装相同的 Child WebView Runtime，并在 reload 时替换 generation/WebView。
- `plugin-project-template`: 两个模板改用 Manifest webview Runtime 和 `@lensx/plugin-sdk/webview` 的真实执行路径。
- `plugin-developer-cli`: create/validate/pack/inspect 生成和验证新 Manifest/SDK Runtime，拒绝 iframe authoring。
- `plugin-development-documentation`: 双语文档改为 Child WebView、native bridge、顶层 Web 和 Host isolation 的完整开发路径。
- `official-config-lens-plugin`: 将 ConfigLens 迁移为普通 public-boundary Child WebView 插件，并重做 Runtime/性能/生命周期证据。
- `official-plugin-release-pipeline`: 要求 official candidate 通过 Child WebView 安装、打开、SDK ready 和 teardown gate。
- `local-plugin-installation`: 安装准备明确拒绝旧 iframe Manifest，并只提交可由 Child WebView Runtime 消费的新 registration。
- `plugin-upgrade-and-rollback`: replacement 不得在旧 iframe 与新 Child WebView 协议之间建立静默运行兼容或回滚 authority。
- `plugin-host-api-contract`: 保持 Host API 语义不变，但明确公共值不包含 native WebView、bridge、label 或 Runtime handle。
- `plugin-testkit`: 保持 semantic fake，不模拟真实 Child WebView/native bridge，并更新边界与 consumer 证据。
- `plugin-ui-package`: 保持纯插件 UI package，不获取 Child WebView、native slot 或 Host bridge authority。

## Impact

- 公共协议与包：Manifest Schema/生成类型/fixtures、Contract/SDK SemVer、SDK exports、CLI 模板与真实外部 tarball consumers。
- Rust/Tauri/Wry：启用并封装 multiwebview、Child WebView registry、native slot/bounds/focus、navigation hooks、resource protocol context、bridge ingress/egress、ACL 和 terminal teardown。
- React Host：以 presentation controller/placeholder 取代 `PluginRuntimeFrame` 的 DOM iframe，继续拥有 loading/error chrome、Page identity、locale/theme 和 root lifecycle。
- Runtime/安全：移除 iframe sandbox/Permissions Policy/parent MessagePort，新增 per-WebView identity、无通用 Tauri authority 的 bridge、顶层导航、popup/download 和 data-store/origin evidence。
- 产品插件与工具：ConfigLens、framework-neutral/React-Semi 模板、Development Mode、官方 release、安装/替换和 lifecycle harness。
- 文档与验证：English canonical 与 Simplified Chinese mirrors、架构图、开发教程、稳定规格、macOS real WebView matrix、frontend/Rust/package/consumer/strict OpenSpec gates。
