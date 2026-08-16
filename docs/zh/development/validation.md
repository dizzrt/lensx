# 验证

## 原则

验证属于实现的一部分，不是后续补充。每个 OpenSpec task 列表都必须以明确的最终验证任务结束，
每个已经完成的变更都必须为受影响的前端和 Rust 层提供可复现证据。

修复此次变更引入的 warning 和 error。修复后，先重新执行失败命令，再重新执行完整的最终验证集合。

## 前端验证

执行单元测试和组件测试：

```bash
pnpm run test
```

对源码和测试执行 TypeScript 静态检查：

```bash
pnpm run typecheck
```

执行 Biome 格式和 lint 检查：

```bash
pnpm run check
```

构建前端生产产物：

```bash
pnpm run build
```

这四个标准命令会验证根应用和每个实际 workspace 成员。成员缺少对应 lifecycle script
或返回非零状态时，根命令会失败。修改聚合或依赖规则时，直接运行 workspace 专项回归：

```bash
pnpm run test:workspace-lifecycle
pnpm run test:workspace-boundaries
pnpm run check:workspace-boundaries
```

`pnpm run test:watch` 只用于开发过程。最终证据必须使用非 watch 命令。

## Plugin Contract 验证

修改 `@lensx/plugin-contract`、其 Schema、Host 消费方或 Rust 模型时，必须运行：

```bash
pnpm run check:plugin-contract
```

该门禁验证生成类型 drift、package tests、Host 边界、TypeScript/Rust 共享 fixtures、打包文件
清单与 exports，以及从真实 tarball 安装的隔离外部消费者。tarball smoke test 是必需项，因为
workspace link 可能掩盖缺失的声明、Schema 文件、export 目标或 runtime 依赖。

## Plugin Package Format 验证

修改 `.lxp` constants、codec/archive/hash dependencies、TypeScript reference packer/inspector、Rust
inspector、fixtures 或 package-format 文档时，必须运行：

```bash
pnpm run check:plugin-package-format
```

该门禁检查 dependency 和 constant drift，对比全部 committed fixture bytes 与 expectations 且不重写，证明
reference pack repeatability，运行 focused TypeScript tests，并让 Rust 消费同一组 valid、invalid、
incompatible 和 reproducible cases。只有在审查 dependency、parameter、format 与 diagnostic 变化后，才使用
`pnpm run generate:plugin-package-format-fixtures` 有意更新 fixture 或 digest。

该专项门禁是对 `check:plugin-contract`、workspace boundary/lifecycle checks，以及完整 frontend/shared 与
Rust 验证集合的补充，不会替代它们。

## Plugin Developer CLI 验证

修改 `@lensx/plugin-cli`、其打包模板、命令/输出 contract、项目 validator、canonical package core 或 CLI
文档时，必须运行：

```bash
pnpm run check:plugin-developer-cli
```

该门禁检查 executable tarball、受限 exports 与 dependency closure、workspace 和文档边界、template drift、
package-format corpus 与 CLI package tests。随后它会使用机器配置的全局 pnpm store，在系统临时 consumer
中安装真实 Contract、SDK、UI、Testkit 与 CLI tarball。两种模板都必须完成 create、install、test、
typecheck、build、只读 validate、可复现 pack、只读 inspect，以及 Rust inspector/installer preparation，
且不得回链 checkout 或根 `node_modules`。

CLI `build` 与默认 `pack` 会执行项目代码；`validate`、`inspect` 和 `pack --no-build` 不会。CLI compatibility
绝不替代 Host 对不可信 package bytes 的复验。该门禁不代表 Development Mode/watch/reload 或
signing/provenance 已交付；它们仍属于 roadmap Task 6.5 与 8.1。

## 官方插件发布流水线验证

修改 `plugins/official/*`、Changesets、CODEOWNERS、release planner、candidate/audit schema、
官方 release workflow、installer/Runtime gate 或双语发布文档时必须运行：

```bash
pnpm run check:official-plugin-release-pipeline
```

该 gate 验证零/单/双 member 与非法 contract fixture、workspace/Host import 边界、确定性 base/head
规划、显式 Changeset policy、metadata-only versioning、canonical candidate record、mock GitHub
draft/幂等/冲突行为、固定 revision 的最小权限 workflow 与文档 drift。临时双插件 consumer 使用
全局 pnpm store，只升版其中一个插件，以公共 CLI build 并重复 pack，对比 TypeScript/Rust facts，
运行普通 install preparation 与 Runtime E2E harness，并证明另一个插件和根应用保持不变。它不会
创建 public release。

该 focused command 组合公共 CLI/package-format、本地安装、open isolated Runtime
与 workspace gate。最终完成仍必须运行下文完整 frontend/shared 与 Rust 命令。

## 插件开发模式验证

修改 feature/capability handshake、directory inspector、snapshot store、process-local Manager
state、Resource/Runtime invalidation、development adapter/service/UI、消息、文档或视觉证据时必须运行：

```bash
pnpm run check:plugin-development-mode
```

该 gate 组合 strict boundary parsing、共享 CLI/Host payload corpus、feature-enabled Rust transaction
tests、正式构建产物排除、Child WebView convergence 与可访问性、双语 schema/docs drift，以及
650×600 视觉矩阵。全局 workspace boundaries 仍由完整 workspace 与本 change 最终 gate 覆盖，
因此不相关的 official-plugin 迁移不会阻塞本 focused workflow。它应与现有 management、Runtime、
Resource、Registration、CLI 及完整 frontend/Rust gates 顺序运行。
最终真实 smoke 使用 `pnpm run dev:plugin-development-mode`；普通构建必须继续排除 development commands 与 UI。

focused gate 还会读取 normal 与 malicious development registration 的有界组合证据。它会固定
维护中的 macOS Child WebView ACL、native slot 与开放 Web capability 证据，再与 source-neutral
正式 resolver 检查及 Development Mode transaction tests 组合。transaction matrix 覆盖 register、
commit 后创建 fresh attempt、新 generation 投影前销毁旧 attempt、staging 被拒绝时 current attempt
保持不变，以及 remove。Task 8 另行维护完整真实 macOS 端到端矩阵。审阅这些正式边界或
Development Mode transaction 变更后刷新组合证据：

```bash
pnpm run refresh:plugin-development-runtime-evidence:normal
pnpm run refresh:plugin-development-runtime-evidence:malicious
pnpm run check:plugin-development-runtime-evidence
```

证据文件只能包含有界协议/平台标签、相对 fixture 引用、digest 与布尔值；不得记录 source directory、
scoped URL、origin、freshness value、token、payload value 或 raw error。

## Plugin Resource Service 验证

修改 Host 私有 Resource Contract、desktop adapter、Manager generation、Installer ownership proof、
custom protocol、path/MIME policy 或 resource lifecycle 时，必须运行：

```bash
pnpm run check:plugin-resource-service
```

该门禁消费精确的 Rust/TypeScript 共享 contract fixture，检查公共 package 与插件边界，并运行 Manager、
Installer、protocol、path attack、MIME/method、64 MiB、lifecycle、race、error-oracle，以及 macOS/
Windows/Linux URL 形态回归。当前主机无法原生执行的平台行为保留为纯 Rust URL/request fixture，同时仍
要求正常 desktop target CI/build 覆盖。

Resource scope 使用精确直接依赖 `getrandom = 0.3.4`（`MIT OR Apache-2.0`，由 Rust Random project
维护）。该版本已经存在于 `Cargo.lock`，且只用于从操作系统 CSPRNG 获得至少 128 bit entropy；
preparation-token hash、时间、进程 ID 与计数器都不能替代它。本 change 未增加 capability-filesystem
依赖：实现使用标准库 filesystem/platform metadata、逐段 link/reparse rejection、canonical
containment，以及打开后 file identity/size 复核。改变任一依赖决策前，必须重新审查精确版本、许可证、
维护情况与 macOS/Windows/Linux 语义。

该 focused gate 不替代完整 frontend 与 Rust 验证集合。本 change 没有可见 UI、locale、theme、
keyboard、accessibility 或 Semi Design surface，因此这些区域需要回归验证，但不需要新增 product copy
或组件专项验收。

## 隔离 Plugin Runtime Origin 验证

修改隔离 Resource authority、host/path parser、translated URL 形态、origin evidence 或下游 origin
前置条件时，必须运行：

```bash
pnpm run check:isolated-plugin-runtime-origin
```

该门禁组合 canonical `.lxp` fixture 验证、有边界的已提交真实 macOS WKWebView evidence、Resource
Contract 与 Service tests、frame-aware navigation tests/evidence、workspace-private boundary check，以及
Plugin Page composition 回归。真实 evidence 必须覆盖 non-opaque serialized origin、完整 ES Module/
resource graph、same-generation storage roundtrip、Host/other-generation isolation、parent/frame/Tauri
absence、zero privileged hit，以及 normal/malicious/replacement package 经过真实 Resource Service 的路径。
它不得包含 raw URL、scope、path、storage value 或 invoke secret。

该门禁只证明 macOS 前置能力，本身不授权 production iframe，也不建立 Windows/Linux Runtime 支持。
任何 shared host、丢失 translated key、authority/path mismatch、wildcard/null CORS 或 opaque/classic-only
fallback 都会使验证失败。

## macOS Frame-Aware WebView Navigation 验证

修改 Host navigation policy、Tauri/Wry patch、main-only initialization、WebView harness、
evidence schema 或 Plugin Page/Resource 回归时，运行：

```bash
pnpm run check:frame-aware-webview-navigation-policy
```

该门禁检查全部 15 个维护中的 document、bounded evidence schema、已提交的真实 WKWebView
matrix、精确的 vendored dependency integrity 与 patch surface、Rust policy/epoch/normalization/
adapter tests、Resource Service 回归、workspace-private boundary，以及 Plugin Page composition。
evidence 仅适用于 macOS，必须确认 activate/replace/dispose/reactivate lease preflight，并包含原生
`main`/`descendant` 事实、pre-commit outcome、Host
bootstrap 可用、descendant bootstrap/invoke 缺失，以及 popup/download hook count。它绝不能包含
raw URL、scope、identity、invoke key 或 payload、bootstrap source 或本机路径。

只有在审查 fixture 变更后，才运行 `pnpm run generate:frame-aware-webview-navigation-fixtures`。
真实 evidence 必须先在目标 macOS WKWebView 重跑，再用
`pnpm run generate:frame-aware-webview-evidence-matrix` 有意提升。vendored dependency 变更必须先
审查精确 diff 与 license，再用 `pnpm run generate:frame-aware-navigation-dependency-drift` 更新
integrity record。这些 generator 不替代 focused gate 或完整 frontend/Rust validation 集合。

## 隔离 Plugin Child WebView Runtime 验证

修改 Runtime resolver、native container、slot presentation、resource binding、navigation policy 或
lifecycle cleanup 时，必须运行：

```bash
pnpm run check:plugin-child-webview-runtime
```

该门禁组合 React slot/state tests、物理 bounds revision、compare-current native lifecycle、
generation-bound resource、开放 Web 正向路径、top-level navigation deny、terminal cleanup、current
`.lxp` fixtures、有界 macOS WKWebView evidence、ACL negative matrix 与 workspace-private imports。
native load、bridge ready 与 SDK ready 始终是相互独立的 evidence fact。

## Plugin Child WebView Session 验证

修改私有 bridge bootstrap、source identity、readiness state、strict RPC frame、Host dispatcher、
cancellation 或 cleanup 时，必须运行：

```bash
pnpm run check:plugin-child-webview-session
```

该门禁证明 source-bound ready admission、current attempt/generation/nonce 校验、bounded request、
乱序 settle、event delivery、disconnect/dispose、stale replacement rejection 与零通用 Tauri authority。
已提交 evidence 必须保持有界，且不得包含完整 URL、resource token、nonce、payload、identity、本机路径或
private error。该 focused macOS gate 只补充完整 frontend/Rust validation 集合，绝不能替代它们。

## Plugin SDK Transport 验证

修改 typed SDK request/event API、私有 transport codec、WebView entry、Host bridge adapter、Runtime
Session handoff、transport fixture、package export 或目标 WebView evidence 时，必须运行：

```bash
pnpm run check:plugin-sdk-transport
```

该门禁检查 plugin/Host codec 的确定性 drift、strict `unknown` parsing、request/result 配对、安全 error、
并发乱序 response、取消、timeout、event、disconnect/dispose、stale Page/source-WebView 隔离与 production
Session-binding boundary。它打包真实 Contract/SDK tarball，保留 no-DOM ES2022 root consumer，在隔离 browser
consumer 中构建并运行声明的 WebView entry，拒绝私有 deep import，并运行 source-bound SDK/Host bridge
fixture。

有界 macOS WKWebView evidence 还覆盖 exact source WebView、single-use nonce、transport
result/error/event round-trip、乱序 response、取消、replacement/close cleanup、pending termination 与
privileged handler zero-hit。evidence 不含 URL、nonce、bridge 内容、payload、token、identity、path
或 private error。该门禁证明公共 transport 与 Host adapter；独立 Dispatcher 与 scoped-storage 门禁证明
当前 production provider。两者都不独立证明完整 RPC v1 policy 或 Windows/Linux Runtime transport。

## Plugin RPC 验证

修改 Host 私有 RPC policy/analyzer、Port admission、request sequence state、concurrency/deadline settlement、
result/event containment、安全 diagnostic、post-response effect、恶意 fixture 或 resource-limit evidence 时，必须运行：

```bash
pnpm run check:plugin-rpc-validation
```

该门禁检查不可变的 5 MiB/32 层语义深度/36 层 frame 深度/16,384 节点/单 request/32 并发/10,000 ms policy；
低于、恰好等于和超过限制的 fixture；UTF-8 与 JSON escaping cost；循环与非 JSON value；严格递增 request ID；
controlled-clock deadline/cancel race；安全 error、event、diagnostic 与 effect；以及被拒输入的零 Handler hit。
它通过真实 Contract 与 SDK MessageChannel、Dispatcher、closed-catalog/storage regression、Runtime Session cleanup、
公共 Contract/SDK tarball、workspace/private-import boundary 和目标 macOS 有界 WKWebView evidence 进行组合验证。

提交的 WKWebView evidence 必须证明一个超深 request 以零 Handler hit 被拒绝，且同一健康 Session 上后续合法
request 仍能完成。evidence 只保存有界布尔事实，不得包含 payload、URL、origin、identity、request ID、
diagnostic 或 private error。该 macOS evidence 不代表 Windows/Linux transport。

该门禁证明 per-frame byte/depth/node/单 request 限制，以及 per-Session concurrency、replay 与 Host execution
deadline。它不证明持续频率控制、iframe/CPU/memory 监控、插件暂停、隔离升级、自动恢复、公共 policy 配置或
持久化 diagnostic history；这些 control 仍属于 Task 7.5 或后续 change。

## Plugin Host API Dispatcher 验证

修改 Host 私有 provider table、Runtime Context source、私有 post-response outcome、匹配 Page 关闭、
plugin-local Action dispatch、App 组合或 Dispatcher 文档时，必须运行：

```bash
pnpm run check:plugin-host-api-dispatcher
```

该门禁运行 Dispatcher、transport、MessageChannel、React Runtime、Navigation、Action projection 与
workspace boundary 聚焦测试。它还打包真实公共 Contract/SDK tarball，并验证 Dispatcher binding、
Session identity、private wire value、Host service 与 post-response effect 不进入公共 export 或 declaration。
Context capability snapshot 在当前 namespace 可用时包含 `actions.open`、`runtime.get_context`、`ui.close`
与五个 `storage.*` method；已删除的 clipboard 与未知 method 会通过封闭的 `0.2.0` catalog 失败。

现有目标 macOS WKWebView transport evidence 仍用于验证认证 Port、取消、replacement 与 terminal cleanup。
production-style MessageChannel fixture 增加 Dispatcher Context、Action、storage 与 response-before-close
证据，但不把 fake native boundary 描述成 Rust persistence 或通用 RPC 交付。该聚焦门禁只补充
完整 frontend/Rust validation 集合，不能替代它们。

## Open Isolated Plugin Runtime 验证

Manifest/Host API `0.2.0`、permission authority 删除、plugin response CSP、
Worker/network/Blob/Data/WASM 支持、Runtime teardown 或 trust copy 变化时必须运行：

```bash
pnpm run check:open-isolated-plugin-runtime
```

该门禁组合 generated Contract drift、真实 public tarball、封闭 Dispatcher、canonical open-Web fixture、
scoped Resource Service、iframe/origin/navigation 隔离、Runtime Session 与 security lifecycle。负向扫描会在
native clipboard command、permission module、grant field、prompt/mutation import 或限制性 Worker/network
policy 回流时失败。canonical WKWebView harness 提供 package/Blob/Data Worker、message、fetch、WebSocket
构造、WASM、origin storage、author-owned stricter CSP 正向证据，以及平台基线外能力的有界 unsupported 结果。

## ConfigLens 官方插件验证

修改 `plugins/official/config-lens`、已审查语言依赖、release 选择、package chunk、
Runtime lifecycle、视觉证据或产品文档时，必须运行：

```bash
pnpm run check:official-config-lens-plugin
```

该门禁运行成员 lifecycle 与四语言恶意/golden 语料，检查依赖许可证和准确版本，
构建 Monaco 与 language module Worker，验证全部包内 chunk 和预算，对比固定双语
light/dark 28 场景视觉矩阵，并消费单一可编辑 model、直接替换和 undo 的有界真实
macOS WKWebView 证据。随后它使用公共 CLI
执行 build、validate、inspect 和两次 pack，与 Rust inspector 和普通安装 preparation
达成一致，再把同一 digest-fixed `.lxp` 传入 Host Runtime E2E。证据和诊断不得包含
配置内容、URL、origin、path、nonce、Port、payload、stack 或 raw error。

## Plugin Scoped Storage 验证

修改 Host 私有 storage contract、fixture、Rust store/command、Installer data coordinator、desktop provider、
Dispatcher storage routing、Runtime capability availability、公共 consumer evidence 或 storage 文档时，必须运行：

```bash
pnpm run check:plugin-scoped-storage
```

该门禁验证 TypeScript/Rust 完全共享的 valid/invalid fixture、严格边界 result 与安全 error、确定性 quota 与
Unicode ordering、绑定 revision 且有完整性保护的 cursor、durable atomic mutation、restart recovery、namespace
corruption/symlink 隔离、Installer replacement/disable/retain/delete-data 行为、provider cancellation/currentness、
全部五个 Dispatcher method、Context degradation event 与真实 SDK/MessageChannel 路径。

它还打包公共 Contract、SDK 与 Testkit tarball，让隔离 no-private-import consumer 调用全部五个语义 storage
method，检查 export/dependency/workspace boundary，并复用认证 Port 与 terminal lifecycle 的既有有界 macOS
WKWebView evidence。门禁不得暴露 key、value、path、plugin data、raw payload、exception 或 stack evidence。
它只补充完整 frontend/Rust validation 集合，不能替代它们。本 change 没有产品 UI、copy、theme、
accessibility、keyboard 或 Semi Design surface，因此不适用 visual acceptance；完整 frontend suite 仍覆盖普通 UI 回归。

## Plugin Management Settings 验证

修改根级私有 management facade、data-clear contract/Rust coordinator、Settings Plugins 表面、management
message/style 或 App composition 时，必须运行：

```bash
pnpm run check:plugin-management-settings
```

该门禁检查严格共享的 data-management fixture、desktop/private boundary、Registration revision 与 selection
行为、mutation serialization、replacement confirmation、lifecycle/storage 回归、Host component
行为、message-schema 对齐、workspace/public tarball boundary、root `StrictMode` composition 重建，以及
Rust atomic clear 行为。它还会构建隔离
fixture，并在 `650×600` 下对 `en-US`/`zh-CN` 的 light/dark 组合捕获 empty、healthy、quarantined、
degraded、replacement、uninstall 与 clear-data 全部维护状态。每张截图都配套检查连续 split surface、border、
locale、theme 与 modal 的 computed style。

该聚焦门禁只补充完整 frontend/Rust suite，以及上游 installation、Registration、lifecycle、replacement、
open Runtime 与 scoped-storage 门禁，不能替代它们。若平台在受限 sandbox 内阻止 GUI process，应在正常本机
环境中重跑 headless Chrome；仅 sandbox launch failure 不能判定为产品失败。

## Open-Web Trust Confirmation 验证

installation 与 replacement test 必须证明可信主窗口 UI 显示双语 open-Web trust notice，只 commit 精确的
prepared candidate，并且没有 permission checklist 或 commit 后 grant 阶段。固定 `650×600` 视觉矩阵覆盖
英文/简体中文与 light/dark，并保存 screenshot 与 computed style。插件来源 message、Publisher/source claim、
SDK payload 或伪造 user activation 不能打开 Host 私有 management UI 或 native authority。

## Rust 验证

检查 Rust 格式：

```bash
pnpm run src-tauri:format:check
```

执行 Rust 测试：

```bash
pnpm run src-tauri:test
```

执行 Rust 静态编译检查：

```bash
pnpm run src-tauri:check
```

变更引入 Clippy 等更严格 Rust 工具时，在 OpenSpec task 列表中记录并执行准确命令。

## 文档验证

对于文档变更：

- 比较 `docs/en/` 和 `docs/zh/` 的相对 Markdown 路径；
- 确认两个语言索引都链接到每个持续维护的主题；
- 确认相对 Markdown 链接能够解析；
- 确认英文和简体中文标题及语义一致；
- 确认两个 README 包含一致的接入内容；
- 确认正式产物没有引用或依赖临时材料；
- 确认规划中的功能没有被描述为已经实现。

## 范围规则

- 仅前端变更仍需执行前端测试、typecheck、check 和 build 集合。
- 仅 Rust 变更仍需执行 Rust format、test 和 check。
- 跨边界或仓库级变更执行两侧完整集合。
- 每个 OpenSpec task 列表都要记录前端和 Rust 验证。一侧确实不受影响时，记录理由而不是省略。
- 仅文档变更必须执行文档验证，以及格式化或生成文件影响的仓库检查。

## 最终检查清单

- [ ] 变更行为具有有效测试。
- [ ] 前端验证通过，或已经记录不受影响的理由。
- [ ] Rust 验证通过，或已经记录不受影响的理由。
- [ ] 英文文档和简体中文镜像一致。
- [ ] OpenSpec 产物和稳定 spec 保持一致。
- [ ] 没有此次变更引入的 warning 或 error。
- [ ] 已重新执行失败命令和完整最终验证集合。
- [ ] 已报告剩余限制和未验证假设。
