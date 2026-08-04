## Why

当前 macOS Tauri/Wry 导航回调虽然能观察 Host main frame 与 nested iframe navigation，却只向应用提供 URL，不能可信区分 main/descendant frame。继续实现插件 iframe Runtime 会允许恶意插件把自己的 browsing context 导航到 Host、外部或其他插件目标，而 Host 无法在目标获得执行机会前应用 disjoint allowlist 并统一 fail closed。

当前 macOS WKWebView spike 已证明 Tauri initialization script 的 `for_main_frame_only` 标记在 descendant 中生效：Host bootstrap 可用而 descendant bootstrap 缺失。该行为仍作为本 capability 的强制回归条件，避免后续依赖或 adapter 漂移破坏隔离。

本 change 建立一个独立、面向当前 macOS 产品平台验证的 frame-aware 原生导航强制边界，作为 `add-isolated-plugin-iframe-runtime` 的实施前置条件。

## What Changes

- 为 Host WebView 定义 frame-aware navigation decision：区分 main frame 与 descendant frame，并在提交前返回 allow/deny。
- 在 macOS WKWebView 上保持并回归验证 Tauri main-frame-only initialization semantics：Host App main frame 保留既有 bootstrap，任何 descendant frame 都不得执行或观察 Tauri internals、invoke metadata、invoke key 或 IPC initialization。
- 保持 main frame 只属于 lensX App；descendant plugin frame 只允许 Host 当前激活的精确 Runtime document target 与 Host-derived fragment。
- 将 CSS、JavaScript、图片、字体、JSON、Wasm 等普通包内读取继续交给现有 Plugin Resource Service；导航策略不复制路径、MIME、scope/generation 或 payload ownership 规则。
- 在 macOS WKWebView 上建立真实 WebView 证据，覆盖初始导航、nested self-navigation、Host/external/cross-plugin policy 拒绝、不会形成 navigation callback 的 dangerous-scheme WKWebView preflight block、popup/download 拒绝、native custom-protocol、Host bootstrap 保留和 descendant Tauri bootstrap 缺失。
- 若上游 Wry 尚未提供 macOS 所需 frame context，采用可审查、固定版本且范围最小的 Wry/Tauri 依赖补丁，并优先形成 upstream-compatible 改动；禁止用 DOM listener、插件脚本、自报身份或未广泛支持的 CSP directive 作为唯一强制边界。
- 提供 Host-private active target activation/replacement/disposal 边界、main-only initialization enforcement 和安全诊断，不新增插件可调用 command、公共 package export、Runtime Session、SDK transport、Host API 或权限模型。
- 更新 canonical English 架构/开发/验证文档及其简体中文镜像，记录平台支持矩阵、依赖维护策略与后续 iframe Runtime 的消费约束。

本 change 的非目标包括：Windows/Linux 支持或证据、创建或渲染插件 iframe、解析 Registration/Page/Resource Runtime descriptor、执行插件代码、建立 Runtime Session、注入 SDK transport、实现 JSON-RPC/Host API/权限、完整 CSP、通用 Router/history、多 WebView Runtime、独立插件窗口，以及改变 Manifest 或公开插件 package contract。

用户可见行为不变：插件 Page 仍显示现有 Host-owned Runtime-unavailable placeholder。只有该前置能力通过真实平台门禁后，后续 change 才能安全启用插件 iframe UI。

## Capabilities

### New Capabilities

- `frame-aware-webview-navigation-policy`: 定义 macOS WKWebView 中 Host main frame 与 descendant plugin frame 的可信导航分类、当前目标授权、main-only Tauri initialization 隔离、原生拒绝、生命周期失效、安全诊断和真实 WebView 交付门禁。

### Modified Capabilities

- 无。现有 Plugin Resource Service、Plugin Page navigation 与 public plugin contracts 的要求保持不变；本 capability 作为后续 iframe Runtime 的独立前置边界组合使用。

## Impact

- Rust/Tauri/Wry：WebView navigation/new-window/download hook、Host-private active target policy state、平台 URL 规范化、initialization script frame enforcement 与安全诊断；可能需要固定版本的 Wry/Tauri dependency patch。
- 测试：新增纯 allow/deny matrix、Rust 集成测试、恶意/正常文档 fixtures，以及 macOS WKWebView 真实 harness 与可审查证据。
- 前端：只允许增加 Host-private desktop adapter 或测试 harness 接线；`App.tsx`、现有 Plugin Page placeholder、公开 Page/Action contracts 与产品 UI 不变。
- 文档：更新 `docs/en` canonical 架构/开发/验证说明并同步 `docs/zh` 镜像；README、AGENTS 与 public package declarations 不承载具体设计。
- 后续变更：`add-isolated-plugin-iframe-runtime` 在本 capability 的 macOS 门禁通过前保持阻塞，并在恢复实施时消费这里交付的 policy，而不是自行实现第二套导航边界；它不得据此宣称 Windows/Linux 支持。
