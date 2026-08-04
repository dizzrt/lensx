## Why

真实 macOS WKWebView 探针证明，当前共享 resource origin 配合 `sandbox="allow-scripts"` 虽能保持 opaque origin 和 Tauri isolation，却无法加载代表性 ES Module dependency graph；直接在共享 `lensx-plugin://localhost` origin 上增加 `allow-same-origin` 又会产生跨插件同源与 storage 风险。Task 4.2 因此需要一个独立前置能力：把每个 current plugin resource scope/generation 映射为独立 browser origin，并在真实目标 WebView 上证明模块可用性和隔离边界。

## What Changes

- 为每个 current `(entry_id, resource_generation)` 派生一个 Host-owned、process-local、不可猜测且与 Host、其他插件、旧 generation 不同的 Runtime browser origin；重复解析同一 generation 保持幂等。
- **BREAKING**：Plugin Resource Service 的 native/translated `entry_url` 从共享 host 迁移为 scope-bound isolated host，并同时保留 path 中的 scope/identity信息进行 host/path交叉验证；旧共享-host URL 不再是可接受的 Runtime入口。
- 扩展 Plugin Resource Service 解析与 request enforcement：origin host、path scope、entry identity、generation 和 current Manager projection 必须一致；不添加 wildcard/null CORS，不暴露 standalone origin/scope token，也不持久化 origin mapping。
- 扩展 macOS frame-aware URL normalization，使 exact active-target lease 能规范化并比较新 isolated-origin native/translated URL，同时继续拒绝 shared host、query、port、userinfo、编码歧义、Host/external origin 和旧 generation。
- 建立不进入 production iframe composition 的真实 `.lxp`/WKWebView gate，验证 `sandbox="allow-scripts allow-same-origin"` 下的 ES Module graph、current-origin storage、Host/other-plugin/old-generation storage isolation、parent/frameElement/Tauri absence，以及 Resource/navigation lifecycle revocation。
- 更新 canonical English 架构/开发/验证文档及其简体中文镜像，记录 URL migration、security invariants、macOS-only evidence 与下游 iframe Runtime 消费约束。

本 change 的非目标包括：创建 production iframe、修改 `App.tsx` 或替换 Runtime-unavailable placeholder、Runtime Session、SDK transport、Host API、permissions、完整 CSP、public Manifest/SDK origin contract、wildcard/null CORS、远程网络 origin broker、Windows/Linux支持或正式插件模板。

用户可见行为保持不变：插件 Page 仍显示现有 Host-owned placeholder；只有该前置 capability 与后续 `add-isolated-plugin-iframe-runtime` 均通过后才执行插件 UI。

## Capabilities

### New Capabilities

- `isolated-plugin-runtime-origin`: 定义 per-current-resource-generation browser origin、同源/storage隔离、真实 WKWebView module/security gate、lifecycle revocation 和 Host-private边界。

### Modified Capabilities

- `plugin-resource-service`: 将 opaque scoped `entry_url` 迁移为 scope-bound isolated host，并要求 origin host、path scope、identity、generation 与 current Manager facts 交叉验证。
- `frame-aware-webview-navigation-policy`: 使 canonical document target normalization 接受 isolated-origin native/translated URL、拒绝旧共享 host，并保持 exact current-target lease 语义。

## Impact

- Rust/Tauri：Plugin Resource Service scope/origin issuance、custom protocol request parsing、platform URL translation、frame-aware target normalization、bounded diagnostics 与 real WKWebView harness。
- TypeScript/React private boundary：Resource Contract validator、Desktop Adapter URL validation 与 drift gates；不创建 production iframe，不改变 public plugin packages。
- Tests/fixtures：复用并扩展 canonical normal/malicious `.lxp`，增加 origin collision、host/path mismatch、ES Module graph、storage partition、parent/Tauri、lifecycle、cache/oracle 和 navigation matrix。
- 文档与 specs：修改 Plugin Resource Service 与 frame-aware policy requirements，新增 isolated Runtime origin capability，并同步 `docs/en`/`docs/zh`。
- 依赖：以已完成的 `add-frame-aware-webview-navigation-policy` 为前置；默认复用现有 Tauri/Wry、Rust、TypeScript 和 test stack，不引入新的 runtime dependency。
- 下游：`add-isolated-plugin-iframe-runtime` 必须只消费本 capability 交付的 isolated-origin `entry_url`，不得保留共享-origin或 classic-only fallback。
