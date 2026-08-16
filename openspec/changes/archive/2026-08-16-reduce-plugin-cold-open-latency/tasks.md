## 1. 建立可重放的启动性能证据基础

- [x] 1.1 定义 Host/Rust/ConfigLens 共用的 closed stage catalog（`resolve`、`create`、`navigation`、`load`、`bridge`、`sdk`、`ui_bundle`、`editor`、`worker`、`host_loading`、`first_interactive`、`restore`），使用各层 monotonic duration 而不暴露跨层绝对 timestamp、sample identity 或 Host-private facts。
- [x] 1.2 将 cold-open evidence schema 升级为包含 `release_like`、`development_snapshot` 和 `same_attempt_restore` profiles、p50/nearest-rank p95/max、sample counts、asset-size facts、Host heartbeat 与 terminal cleanup facts 的严格 closed schema，并为缺 stage、错误 percentile、样本不足、未知字段和 privacy violation 增加 metric/schema 单元测试。
- [x] 1.3 在 production Child WebView service、Resource Service、bridge/RPC/SDK 和 Host presentation 中接入 typed internal stage sink；production 默认保持 content-free/no-op 输出，evidence harness 可附加一次 bounded observer，且 stale/duplicate/late observations 不改变 visibility、Session 或 authority。
- [x] 1.4 为 ConfigLens 增加无 payload、无 authority 的 first-interactive evidence signal，并让 target harness 独立确认 current editor/model/layout、package-owned editor Worker、真实键盘输入与 terminal cleanup，证明单独 DOM marker 或 plugin signal 不能伪造成功。
- [x] 1.5 新建或扩展 target macOS product-path producer，使 canonical ConfigLens candidate 通过普通 release-like registration/resource path 和 Development snapshot path 运行；先在临时目录采集优化前 baseline 并证明当前数秒问题能按负责 stage 失败，不更新 committed positive evidence。

## 2. 用一次性 readiness wait 取代产品轮询

- [x] 2.1 在 Rust presentation/Session service 中实现 Host-private typed async readiness wait，绑定 opaque current attempt，并在 `BridgeReady`、closed failure、timeout、destroy、replacement 和 app teardown 上 exactly-once settle；保留 snapshot read 仅供诊断或迁移测试。
- [x] 2.2 扩展严格 Tauri presentation contract、Rust serialization 和 TypeScript unknown-value validation，确保 wait request/response 不包含 plugin identity、URL、origin、generation、label、nonce、native handle 或其他 Host-private authority。
- [x] 2.3 将 `PluginRuntimeSlot` 产品路径切换为单次 readiness wait，删除固定 25 ms polling loop，保留 loading/error/retry 的双语、accessibility、focus 和 compare-current 行为，并在 React unmount 后忽略 late completion。
- [x] 2.4 增加 Rust state-machine/command tests 和 Rstest/Testing Library regressions，覆盖 ready、load/handshake timeout、disconnect、retry、unmount、replacement、stale attempt、late result、StrictMode 和 Host loading 撤除时机。

## 3. 实现安全的 generation-bound Resource byte cache

- [x] 3.1 使用 Rust 标准库实现 process-local verified byte cache：key 包含 entry、installed/development payload variant、resource generation 和 normalized path，value 仅包含 immutable `Arc<[u8]>`、fixed MIME 与 bounded length，并强制 32 MiB、256 entries 和现有 per-file 上限。
- [x] 3.2 将 cache miss 接入现有完整 canonicalize、symlink/reparse、regular-file、size、opened/path identity、read 和 final revalidation 流程，只有全部成功后才 publish；容量不足时安全 eviction 或不缓存，不能改变功能结果。
- [x] 3.3 将 cache hit 接入 pre/post scope、Manager projection、payload ownership、generation、Runtime attempt 和 actual current WebView source checks；保留 protocol `Cache-Control: no-store`，且 close/reopen 只可复用 package bytes而不能复用 Session、authority、Worker、model 或 user content。
- [x] 3.4 在 replacement、reload、disable、uninstall、development retirement/shutdown 和 payload cleanup 顺序中同步撤销 cache eligibility 并主动 eviction，保证 generation 变化期间的 in-flight hit fail closed。
- [x] 3.5 增加 Rust unit/integration/race tests，覆盖 installed/development hit/miss、同 generation 新 attempt、variant collision、linked/changed file、partial read、unknown MIME、32 MiB/256-entry eviction、replace-during-hit、reload、disable、uninstall、retirement、old URL 与零敏感诊断。

## 4. 缩短 ConfigLens bootstrap 与 editor 关键路径

- [x] 4.1 将 ConfigLens entry 拆为最小 bootstrap/runtime module 与延迟 mount module，使 HTML graph 在 React、React DOM、Semi Design、Plugin UI、Monaco 和 language adapters 之前立即创建唯一的 public WebView transport/SDK client 并等待既有 native finished-load + one-task boundary。
- [x] 4.2 在 valid Runtime Context 后并行加载完整 React/Semi/Plugin UI mount bundle 与 single-flight Monaco loader，将已连接 client/context 注入 mount composition，证明不会创建第二个 SDK client、第二个 Session 或 alternate bridge。
- [x] 4.3 实现轻量、可访问的 startup/error shell：Context 未知的正常启动阶段保持视觉空白并只保留 accessible busy semantics，失败时才显示可聚焦 retry；Context 到达后使用 English-default/简体中文 catalog 与 light/dark Semi theming，保留 focus 和 error recovery。
- [x] 4.4 将 first-interactive 完成绑定到 current Monaco model creation、initial layout、package-owned editor Worker readiness 和 evidence keyboard probe；保持 language Worker demand-created、editor/model/observer/listener/timer/Worker teardown 以及 SDK retry/close/replacement late-result guards。
- [x] 4.5 更新 Rsbuild split strategy、HTML/module inventory 和 package gate，强制 HTML-referenced JavaScript ≤256 KiB、CSS ≤64 KiB，initial graph 不含 React/Semi/Plugin UI/Monaco/language adapters，完整 `dist`/`.lxp` 仍自包含且无 CDN、source map、`eval` 或 runtime package resolution。
- [x] 4.6 扩展 ConfigLens runtime/component/bundle/E2E/visual tests，覆盖 early bootstrap、single client、loading-to-ready、retry/disconnect、English/简体中文、light/dark、keyboard/focus、single editor、Monaco single-flight、Worker readiness、close/reopen freshness 与 28-case visual matrix 的必要 startup additions。
- [x] 4.7 重新执行 deterministic pack/inspect、ordinary local install、official candidate/release selection 和 public-package boundary gates，证明优化后的 ConfigLens bytes 仍走 external plugin 的 Manifest `0.3.0` Child WebView Runtime 且没有官方特权或私有 Host import。

## 5. 收敛真实 macOS budgets、privacy 与 lifecycle evidence

- [x] 5.1 让真实 evidence run 在临时目录自动完成至少 20 次 release-like fresh opens、20 次 Development snapshot fresh opens和 40 次 same-attempt restores，并在每个 cold sample 前证明无 current WebView、结束后证明 WebView/Session/Worker/bridge/resource authority 全部 terminal。
- [x] 5.2 验证 release-like Host loading-to-bridge-ready p95 ≤250 ms、release-like first-interactive p95 ≤500 ms、Development Mode first-interactive p95 ≤1000 ms、restore p95 ≤100 ms、Host heartbeat p95 gap ≤50 ms；任何失败按 stage 修复后重跑，不静默放宽 budget。
- [x] 5.3 保持 ConfigLens 四-case/40-sample warm small-JSON action-to-model-update p95 ≤100 ms，并验证 startup/format 期间 Host heartbeat、Worker timeout/recreation、四语言最小操作、恶意输入 fail-closed 和 lexical correctness。
- [x] 5.4 增加 evidence privacy 与 anti-bypass gates，拒绝 user content、完整 URL、origin、path、label、nonce、payload、raw error、stack、data-store ID、Host-private token、per-sample identity，以及只读 historical JSON、mock timing、source-only 或 synthetic DOM 对真实 producer 的替代。
- [x] 5.5 仅在真实 producer、所有 budgets、security、lifecycle、teardown 和 privacy checks 通过后显式更新 committed evidence；普通 `--run` 不得静默重写 positive records，并验证新鲜重跑与 committed summary 的 schema/profile/budget agreement。

## 6. 文档、术语与 focused gate 维护

- [x] 6.1 更新 `docs/en/architecture/plugin-child-webview-runtime.md` 的 stage definitions、250/500/1000/100/50 ms budgets、真实 producer 命令、async readiness、Host byte-cache safety、cold/reopen/restore 区分和排障方法，并同步语义一致的 `docs/zh/architecture/plugin-child-webview-runtime.md`。
- [x] 6.2 更新 English canonical ConfigLens development documentation 及相同路径的简体中文镜像，说明最小 bootstrap、lazy React/Semi/Monaco、initial graph budgets、first-interactive definition、debug/release 差异与无 privileged Runtime/retained state。
- [x] 6.3 更新 Resource Service/extension architecture 的 English canonical 文档及简体中文镜像，说明 Host memory cache key/bounds、hit currentness、revocation/cleanup order 与 browser `no-store` 不变；保持两个语言 index 在新增文档时同步。
- [x] 6.4 扩展 focused composition/drift gates，要求新 evidence producer、readiness wait、byte-cache races、ConfigLens bootstrap/bundle budgets、双语文档和 delta specs 全部在 aggregate validation 中出现，并阻止 active/stable Runtime requirements 重新出现 iframe container 术语或 dual Runtime path。

## 7. 最终验证

- [x] 7.1 运行所有变更相关的 focused TypeScript/Rstest gates，包括 Runtime slot/presentation、stage metrics、Resource contract adapter、ConfigLens runtime/component/bundle/E2E/visual、official candidate/release、workspace boundary 和 evidence privacy tests；修复所有 warning/error 后重跑失败项。
- [x] 7.2 运行真实 target macOS release-like、Development snapshot、restore、warm-format、ACL、navigation、bridge/RPC、slot/focus 和 teardown evidence commands，确认新 producer 重新采样并满足所有预算、negative checks 与 content-free schema。
- [x] 7.3 运行完整 frontend/shared tests：`pnpm run test`，确认无失败、跳过或未解释的回归。
- [x] 7.4 运行 frontend formatting/static/type/build：`pnpm run format`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`，并在 formatter 产生预期修改后重跑 `pnpm run check`、`pnpm run typecheck` 和 `pnpm run build`。
- [x] 7.5 运行 Rust formatting、tests 与 static checks：`pnpm run src-tauri:format`、`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，覆盖 default、plugin-development-mode 和相关 macOS harness features；修复所有 warning/error 后重跑完整集合。
- [x] 7.6 运行 `openspec validate reduce-plugin-cold-open-latency --strict`、`openspec validate --all --strict`、文档 mirror/drift/no-dual-Runtime gates和 `git diff --check`，逐项核对 proposal、design、三个 delta specs、实现、evidence 与 tasks checkbox 一致；任何失败修复后重跑本节全部验证再声明完成。
