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

## 隔离 Plugin iframe Runtime 验证

修改 Runtime resolver、iframe policy/container、Host navigation adapter、Plugin Page composition 或
lifecycle cleanup 时，必须运行：

```bash
pnpm run check:plugin-iframe-runtime
```

该门禁组合 resolver 与 React state/cancellation tests、精确 sandbox/Permissions Policy/referrer 断言、
native lease activation 与 compare-current disposal、Page/lifecycle/replacement/resource 回归、workspace
私有 import、canonical 真实 `.lxp` fixture、有边界的 macOS WKWebView evidence，以及 origin/navigation
两项前置 gate。evidence 必须继续证明 ES Module graph、route fragment、storage partition、parent/frame/
Tauri absence、zero privileged hit，以及恶意 navigation/capability rejection。

该门禁只证明 iframe `loaded`，绝不证明 Runtime Session 或 SDK `ready`。它不验证 message bridge、
Host API、permission dispatcher、完整 CSP、通用 timeout/crash recovery 或 Windows/Linux Runtime。
应在完整 frontend/Rust validation 集合前运行，但不能替代它们。

## Plugin Runtime Session 验证

修改 Host 私有 Session contract/parser/service、nonce 或 MessageChannel adapter、Runtime descriptor/
currentness、iframe ref/bootstrap、canonical Session fixture、evidence schema 或 workspace/package
boundary 时，必须运行：

```bash
pnpm run check:plugin-runtime-session
```

该门禁组合 strict parser/state-machine tests、resolver/detail/grant 收敛、相关与无关 invalidation、React
iframe lifecycle、Registration/Page/lifecycle/replacement/resource 回归、canonical 真实 `.lxp` drift
检查、公共 tarball consumer，以及完整 iframe/origin/navigation 前置 gate。专用 macOS
`plugin_runtime_session_harness` 会在 WKWebView 中复用 production Resource Service、隔离 origin 的真实
package path、sandbox、Permissions Policy 与 frame-aware navigation policy。

已提交的有界 evidence 必须对 normal、malicious 与 replacement fixture 证明 exact target window/origin、
MessagePort transfer、cryptographic single-use nonce、ready/disconnect/dispose、retry 与同版本 replacement
后 old Port 失效、无关 Registration 变化稳定，以及 privileged Tauri handler zero-hit。evidence 不得包含
URL、origin/resource token、nonce、Port 内容、entry/plugin/Page identity、本机路径、raw payload 或
private error。

这是 macOS-only delivery gate，不建立 Windows 或 Linux Runtime Session 支持。它只证明私有认证
Session 与 Port lease；不会交付公共 SDK iframe transport、RPC/request ID、Host API method、permission
decision、完整 CSP、通用 handshake timeout/crash recovery 或 background Runtime。focused gate 只补充
完整 frontend/Rust validation 集合，绝不能替代它们。

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
