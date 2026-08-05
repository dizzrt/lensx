## Why

lensX 已能为当前插件 Page 创建隔离 iframe，并通过 Host-private Runtime Session 绑定真实窗口、origin、身份与授权快照，但生产 Host 仍未启用明确 CSP，现有 Runtime 也没有统一覆盖加载/握手超时、重复失败熔断、Host reload、应用退出和所有异步资源的终止协议。Task 4.4 需要把这些安全边界收口，确保不可信插件只在当前授权页面会话内运行，终止后不残留 iframe、Port、listener、timer、lease 或 Runtime-owned pending work。

## What Changes

- 为 Host 主文档和插件隔离文档建立两套 Host-owned、默认拒绝的 CSP；插件 Manifest、作者 HTML 和来源身份均不能放宽策略。
- 由受信任资源响应为当前插件入口文档附加 CSP，并在真实 macOS WKWebView 中证明同源包内模块图可用、非法脚本/资源/连接/嵌套与导航稳定失败。
- 为外部插件 Runtime 建立统一、幂等、generation-aware 的终止流程；关闭、导航、重试、禁用、卸载、替换、current-fact 失效、Host reload、App unmount 与应用退出均收敛到同一清理语义。
- 为 iframe load 和 Runtime Session handshake 增加有界期限；不自动重启失败插件，并对短时间连续失败建立进程内熔断与显式恢复规则。
- 固化整个 lensX Page surface 最多一个活动外部插件 iframe 的策略，不保留隐藏实例、iframe pool、后台 Runtime 或跨 Page 复用。
- 提供稳定、有限、可本地化的 Runtime 安全诊断，并验证迟到事件、重复清理、旧 generation 和崩溃/重载场景无法恢复已终止能力。
- 将 “pending call” 限定为 Task 4.4 已拥有的 Runtime resolve、load、handshake、currentness 与 timer 等工作；公共 SDK transport、请求 ID、RPC pending call 及其取消继续属于 Task 5.2。
- 更新英文架构文档及其简体中文镜像，并补齐独立门禁和完整前端/Rust 验证。

非目标：本 change 不交付公共 SDK iframe transport、JSON-RPC、Host API、权限决策或管理 UI、插件私有存储、开发模式 CSP 放宽、后台/sidecar Runtime、自动重启、多窗口/多标签 Runtime、跨平台 Runtime 声明、远程 CSP 上报或通用资源配额。

用户可见影响：加载或握手超时、安全策略违规和连续失败会进入 Host-owned、可访问且可本地化的失败状态；普通成功加载、显式重试、关闭与焦点恢复保持现有交互模型。

## Capabilities

### New Capabilities

- `plugin-runtime-security-lifecycle`: 定义 Host/插件 CSP、安全生命周期状态、统一终止顺序、Runtime-owned pending work 取消、超时、连续失败熔断、实例上限、有限诊断与真实 WebView 证据。

### Modified Capabilities

- `plugin-resource-service`: 当前插件入口 HTML 响应增加 Host-owned CSP Header，同时保持既有 scoped origin、路径/MIME、generation、缓存和 bounded error 边界。
- `plugin-iframe-runtime`: 现有单 iframe 容器接入 load deadline、统一终止、连续失败熔断和安全失败反馈，并继续禁止隐藏/并发/后台实例。
- `plugin-runtime-session`: 现有 Host-private Session 接入 handshake deadline 和统一 Runtime 终止协调，保证 Port、nonce、listener 与迟到事件在所有结束路径上安全收口。

## Impact

- Frontend：`src/app/plugins/runtime/**` 的容器、Session service/adapters、状态与诊断；应用 composition、i18n locale/schema、React lifecycle tests。
- Rust/Tauri：`src-tauri/tauri.conf.json` 的 Host CSP、插件自定义协议/Resource response headers、应用退出与真实 WKWebView harness 证据路径。
- Specs/tests：新增 Runtime security/lifecycle 稳定能力，并修订 Resource Service、iframe Runtime 与 Runtime Session 的集成要求；扩展 normal/malicious/replacement/crash fixtures 和 focused gate。
- Docs：更新 `docs/en/architecture/extension-platform.md` 及对应 `docs/zh/architecture/extension-platform.md`，实现完成后再同步路线图状态。
- 依赖：不新增生产依赖或组件库；若实现证明需要新依赖，必须在 apply 阶段单独说明并重新评估范围。
