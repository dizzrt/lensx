## 1. 协议冻结与原生可行性门禁

- [x] 1.1 将 Manifest Contract 升级到 `0.3.0`，把唯一 external Runtime kind 改为 `webview`，重新生成 TypeScript/Rust 类型与 normal/malicious fixtures，并验证旧 `0.2.x`/`iframe` 得到稳定 incompatibility 而非重写或 fallback。
- [x] 1.2 将 `@lensx/plugin-sdk` 升级到 `0.3.0`，保持 Host API `>=0.2.0 <0.3.0` 兼容范围，冻结新的 private bridge carrier 版本和 closed frame corpus。
- [x] 1.3 在 Tauri/Rust 中启用并封装 `unstable-multiwebview`，以最小 Child WebView spike 验证 macOS create、exact top-level navigation、bounds、show/hide、focus 和 destroy；Tauri API 类型只允许存在于单一 Host-private adapter。
- [x] 1.4 用实际插件 WebView 运行 ACL/IPC negative harness，证明所有 Tauri core/plugin/app command、global event 和 window/WebView authority 在 handler 前零命中；若 scoped Tauri IPC 无法证明仅开放 lensX bridge，则改用 vendored Wry per-WebView IPC handler，并登记及生成 dependency drift baseline。
- [x] 1.5 用 native slot prototype 验证 Retina scale、resize、Host overlay 遮挡、键盘焦点和 IME；无法证明 bounds/focus/overlay 安全时停止后续迁移并修订 design/spec。

## 2. Child WebView、资源与导航核心

- [x] 2.1 实现 Host-private `PluginChildWebviewService`/registry，以 opaque attempt 管理至多一个 current entry、native handle、可信 identity、状态、bounds 和 compare-current teardown。
- [x] 2.2 定义并实现 React-to-Rust slot contract，校验 window、surface mode、scale factor、physical bounds 和 presentation revision，拒绝 stale、越界、非有限或 plugin-derived 更新。
- [x] 2.3 将 Resource Service 的 entry resolution、custom-protocol request 和 generation-bound cache 绑定到实际 current Child WebView source；在 replacement/destroy/retirement 前撤销 authority，并补齐 late-request/cache race tests。
- [x] 2.4 为每个 current generation 派生隔离 origin 与 data-store identity，验证 package modules、Dedicated Worker 和 origin storage 正向路径以及 Host、跨插件、旧 generation 和错误 WebView 负向路径。
- [x] 2.5 删除 Host descendant plugin target lease 和 plugin-document exception，使 Host 主 WebView 只接受可信 App document；保留 Tauri initialization 仅在 Host main frame。
- [x] 2.6 实现 Child WebView top-level navigation hook，只允许 Host 派生 exact entry 与 same-document route，独立拒绝 remote/package escape、file/javascript/data/blob top-level navigation、popup、new window 和 download。
- [x] 2.7 为 create、update-bounds、show、hide、focus 和 destroy 增加 Rust unit/integration/race tests，证明 stale callback 不能操作 replacement WebView，且全局永远不出现两个 current plugin WebView。

## 3. Native bridge、Session 与 RPC

- [x] 3.1 在 document 创建前安装最小、不可重配的 per-WebView bridge bootstrap；bridge 只承载 versioned closed frames，不暴露 label、handle、origin、path、Tauri command 或 Host object。
- [x] 3.2 实现 actual native WebView source、plugin/Page/entry、generation、attempt 和 single-use freshness 的 compare-current ingress binding，并对 forged、old、duplicate、wrong-label 和 malformed ready 添加零 Dispatcher side-effect tests。
- [x] 3.3 将 Runtime Session 状态机迁移为 native `loaded`、bridge Session ready、`runtime.get_context` 后 SDK ready、disconnect 和 disposed，保留 10 秒 load、5 秒 ready deadlines 与稳定错误映射。
- [x] 3.4 将现有 RPC budget、request ID、32 in-flight、Host deadline、cancel、out-of-order settlement、egress validation 和 bounded diagnostics 接到新 bridge carrier，保持 Host API semantic contract 不变。
- [x] 3.5 实现 Host-to-plugin 的结构化安全投递，禁止 payload 字符串拼接；用 Unicode、HTML、script-shaped、oversized、duplicate、late response/event corpus 验证不会注入脚本或跨 Session 投递。
- [x] 3.6 将 Dispatcher authority 绑定到 current Child WebView Session，并回归 `runtime.get_context`、`ui.close`、`actions.open`、scoped storage、events、cancellation 和 provider teardown。
- [x] 3.7 将 SDK public production entry 改为 `@lensx/plugin-sdk/webview`/`createPluginWebviewTransport`，保持 root semantic transport 可在非浏览器 Testkit 中注入，并验证 bridge absent 时安全失败且不探测 fallback。
- [x] 3.8 实现 bridge/Session/SDK 双端幂等 cleanup，终止 pending request、Host handler、subscription、listener 和 timer，使 destroy 后所有 native callback 与 plugin event inert。

## 4. Host presentation 与完整生命周期

- [x] 4.1 用 React `PluginRuntimeSlot` 和 presentation controller 替换 `PluginRuntimeFrame` 的 DOM iframe；Host 继续拥有 Page chrome、title、close、loading、retry 和 terminal error presentation。
- [x] 4.2 保证 Child WebView 仅在 current load 与 Session ready 后显示；Settings、Host modal、Home/Search、loading 或 failure overlay 呈现前先 compare-current 隐藏或销毁 native subview。
- [x] 4.3 将 Launcher resize、scale、hide/restore、shortcut activation、focus/blur、close 和 App teardown 接入 native presentation binding；语义等价 hide/restore 复用同一 WebView/Session 且不 reload。
- [x] 4.4 统一 close、换页、disable、uninstall、replacement、upgrade、development reload、retry、disconnect、bridge fatal failure、breaker、Host reload、StrictMode root teardown 和 process exit 的 terminal coordinator。
- [x] 4.5 回归 current identity/resource 未变时的 continuity，并证明真实 close/reopen、generation 变更和 Host reload 创建新 attempt；禁止 hidden Runtime、preload pool、后台 Page 或多插件并发。
- [x] 4.6 更新 Host Runtime 失败的 English/zh-CN i18n、accessible status/alert、focus restoration、light/dark theme 与非 oracle logging，并用自动化 UI/visual evidence 验证。

## 5. 安装、开发工具与公共包迁移

- [x] 5.1 更新 Contract、package-format、installer 和 replacement preparation/commit，使 `.lxp` profile 保持不变但只提交 WebView-compatible registration；旧 iframe package 在 staging/commit 前稳定失败。
- [x] 5.2 更新 framework-neutral 与 React/Semi templates 的 Manifest、SDK lifecycle、tests、canonical packages 和 production smoke，使两者仅通过公开 tarballs 与 Child WebView 路径运行。
- [x] 5.3 更新 Plugin Developer CLI 的 create/build/validate/pack/inspect、fixtures、machine output 和 external consumer tests，生成 WebView 项目并拒绝 iframe authoring，且不自动改写旧项目。
- [x] 5.4 更新 Development Mode registration/reload/evidence，使正式与开发插件共用同一 Child WebView、bridge、origin、navigation 和 teardown；成功 reload 先销毁旧 generation，失败 staging 不影响 current Runtime。
- [x] 5.5 保持 `@lensx/plugin-testkit` 为 semantic fake、`@lensx/plugin-ui` 为 document-local UI；更新 public declarations、tarball consumers 和 boundary tests，禁止两者暴露 native WebView/bridge facts。
- [x] 5.6 更新 local install、upgrade/replacement、management 与 lifecycle tests，证明旧 iframe registration 不被执行、replacement 无跨协议 Session/authority 复用、删除后可安全重装新协议。

## 6. ConfigLens 与 official release 迁移

- [x] 6.1 将 ConfigLens Manifest、SDK import、build、canonical `.lxp` 和 lifecycle tests 迁移到公开 WebView 协议，禁止 official-only Runtime、Host source import、native bridge 或权限例外。
- [x] 6.2 为 ConfigLens 增加分段 cold-open 指标（resolve/create/navigation/load/bridge/SDK/bundle/editor/Worker/first-interactive）和 Host heartbeat，证据不得记录用户内容或 Host-private token。
- [x] 6.3 优化并验证 ready 状态下 maintained small-JSON corpus 的显式 format p95 不超过 100 ms，同时保留 Worker timeout/crash/retry、lexical correctness 和编辑连续性测试；不得用容器迁移掩盖 bundle/Worker 延迟。
- [x] 6.4 更新 official release candidate inspector、CI gate、dry-run 和 audit sidecar，让 exact digest candidate 经过 normal install、Child WebView load、bridge/SDK ready、representative interaction、close 和 zero-residual teardown。
- [x] 6.5 证明 official、external 与 development plugin 对同一 native/Host escape corpus 得到相同拒绝结论，Publisher、repository location、provenance 和 release metadata 不改变 Runtime authority。

## 7. 删除 iframe 路径并建立防回归门禁

- [x] 7.1 删除 `PluginRuntimeFrame`、iframe sandbox/Permissions Policy、`contentWindow`、parent `postMessage`、`MessageChannel`/transferred `MessagePort`、descendant plugin navigation lease 和全部生产调用方。
- [x] 7.2 删除 `@lensx/plugin-sdk/iframe`、`createPluginIframeTransport`、private iframe codec/adapter、旧 Manifest/fixtures/harness exports，并重命名 current gates/scripts/evidence 为 container-accurate WebView 名称。
- [x] 7.3 增加禁止术语/符号与 no-dual-runtime drift gate，扫描生产源码、tests、public tarballs、templates、official candidates、current docs/specs 和 generated artifacts；archive 历史与明确迁移说明可被窄 allowlist。
- [x] 7.4 更新所有 aggregate gate 依赖与 workspace lifecycle，确保不再调用已删除 iframe script，同时保留 resource、navigation、Session、RPC、Host API、development、official 和 open-isolated coverage。
- [x] 7.5 若修改 vendored Tauri/Wry 源码或补丁，登记每个 reviewed edit 到 dependency drift manifest，重新生成 baseline，并验证未来 dependency update 会对未复核漂移 fail closed。

## 8. 真实 macOS 证据与维护文档

- [x] 8.1 建立真实 macOS Child WebView harness/evidence matrix，覆盖 create/load/bridge/SDK ready、module/Worker/network/WASM/storage、bounds/focus/IME/Retina、hide/restore、close/reopen 和 stage timings。
- [x] 8.2 在真实 WebView 上覆盖 Host DOM、generic Tauri、跨插件/旧 generation、top-level escape、popup/download、forged source、malformed carrier、crash/timeout、replacement、late callback 与 zero-residual teardown；不得以 OS process 隔离假设替代结果。
- [x] 8.3 更新 `docs/en/**` 中 Runtime 架构、安全、生命周期、开发、发布和故障排查内容，并维护同路径 `docs/zh/**` 语义镜像、索引和自动检查；iframe 仅保留在明确 migration 说明。
- [x] 8.4 更新维护的架构图、性能预算与 evidence schema，明确 cold create 和 same-attempt restore、ConfigLens warm format、Host heartbeat、内存/资源释放的测量方法与无敏感数据规则。
- [x] 8.5 更新 roadmap 和 change-specific aggregate gate，使任务状态只在 public packages、official candidate、真实 macOS evidence、文档镜像和 strict OpenSpec validation 全部通过后收敛。

## 9. 最终验证

- [x] 9.1 运行全部新增/改名的 Child WebView focused gates，以及 `check:plugin-contract`、`check:plugin-package-format`、`check:plugin-resource-service`、navigation、Session、SDK transport、RPC、Host API、security lifecycle、development、templates、CLI、ConfigLens、official release、installation/replacement、Testkit、UI 和 open-isolated aggregate gates；修复所有失败后重跑失败项。
- [x] 9.2 运行 `pnpm run test`，修复所有测试失败与警告后重跑。
- [x] 9.3 运行 `pnpm run format` 与 `pnpm run check`，修复所有格式、静态分析、文档镜像和 workspace boundary 问题后重跑。
- [x] 9.4 运行 `pnpm run typecheck` 与 `pnpm run build`，修复所有类型、public declaration、tarball consumer 和构建问题后重跑。
- [x] 9.5 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 与 `pnpm run src-tauri:check`，覆盖默认与本 change 引入的 multiwebview/development/harness feature 组合；修复所有 Rust 警告和错误后重跑。
- [x] 9.6 运行完整真实 macOS normal/malicious/lifecycle/performance evidence matrix，确认 ConfigLens warm JSON format p95、Host responsiveness、single-WebView、generic Tauri denial 与 terminal release 均满足维护预算。
- [x] 9.7 运行 `openspec validate replace-plugin-iframe-runtime-with-child-webview --type change` 及仓库 strict OpenSpec/roadmap gate，确认 proposal、design、全部 delta specs、tasks 和 English/zh-CN 文档一致。
- [x] 9.8 在任何最终修复后重新执行 9.1–9.7 的完整验证集，只在零 warning/error、无未解释 limitation 且所有自动证据通过时勾选本任务。
- [x] 9.9 回归真实 Development Mode ConfigLens cold open，验证 Child WebView slot 通过 native parent window 更新、SDK ready 不早于 native finished-load boundary，且编辑器可交互而非进入 Runtime unavailable 或 handshake timeout。
