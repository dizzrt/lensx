## 1. 先证明 CSP 交付路径与策略边界

- [x] 1.1 在 Host-private 模块中定义 Host 与 Plugin Runtime 两套不可由 Manifest/插件输入修改的 CSP profile，并添加 source/drift 测试，证明 production policy 非 `null`、无 wildcard/remote script、无 script inline/eval，且没有新增公共 package export 或生产依赖。
- [x] 1.2 扩展真实 macOS WKWebView harness，在不先放宽 production policy 的前提下验证 `lensx-plugin` native/translated HTML response CSP Header、GET/HEAD 一致性、精确 Host ancestor、canonical classic/ES Module/CSS/image/font graph，以及 remote/inline/eval/connect/worker/frame/object/base/form/`data:`/`blob:` 负例；若关键行为不能证明，停止实现并更新 design/spec。
- [x] 1.3 根据 1.2 的真实证据配置 production Tauri Host CSP，并用 production bundle smoke/visual matrix 验证 Launcher、Settings、Plugin Page、Tauri invoke、英语/简体中文及明暗主题；任何必要的 style-only 例外必须最小化并由测试锁定，不能扩展 script policy。

## 2. 让 Resource Service 强制插件文档 CSP

- [x] 2.1 在 Rust Plugin Resource response 中为每个成功的当前 scoped HTML GET/HEAD 添加完全一致的 Host-owned Plugin Runtime CSP 与既有 `nosniff`/`no-store`/MIME/length headers，保持已校验 package bytes 不变且不重写 HTML。
- [x] 2.2 增加 Rust focused tests 覆盖 HTML GET/HEAD、普通子资源、unknown MIME、unsupported method/Range、stale generation、scope/path mismatch、unavailable lifecycle 和 failure response，证明任何 author meta、query/header、source/publisher/grant 输入都不能省略或放宽 CSP。
- [x] 2.3 更新 Resource Service 共享 fixtures/harness assertions 和 dedicated gate，确认 isolated origin、module graph、no-CORS、path/MIME、lifecycle revocation、bounded error 及旧 generation 行为没有回归。

## 3. 建立 Host-private Runtime 生命周期核心

- [x] 3.1 定义只在根 Host 使用的 Runtime attempt/controller、terminal state、stable failure code、可注入 scheduler 与 cancellable-work adapter；attempt key、timer、Abort/cancel handle、descriptor/window/Session/lease 引用不得进入公共 contract、持久化状态或 plugin workspace。
- [x] 3.2 实现统一幂等 terminal operation：先拒绝新工作，再取消或使 resolve/currentness/load/handshake stale completion 无效，清除 timers/subscriptions/listeners，dispose Session/Ports，解除 iframe binding，compare-current 释放 navigation lease，最后丢弃所有 attempt 引用。
- [x] 3.3 为 lifecycle core 增加确定性状态/race/leak tests，覆盖 close、retry、navigation、quiesce、disable、uninstall、replacement、grant/current-fact change、failure、Host reload、App teardown、重复 cleanup 与旧 promise/timer/load/Port event，证明旧 attempt 不能影响新 attempt。

## 4. 将 iframe Runtime 接入 deadline、统一终止与单实例规则

- [x] 4.1 在 navigation lease 激活且 iframe `src` 提交后启动 10,000 ms load deadline；匹配 load 清除本 attempt timer，超时产生 `runtime_load_timeout` 并走统一 terminal cleanup，迟到 load 不得启动 Session。
- [x] 4.2 将 manual close、Home/Search/Host Page navigation、provider quiescence、disable、uninstall、replacement、relevant invalidation、retry、Session failure、Host reload、App unmount 和正常应用退出全部接入同一 controller，而不是维护分散 cleanup 分支。
- [x] 4.3 固化 dispose-before-create 与全局最多一个外部插件 iframe，禁止 preload、hidden iframe、pool、background Runtime 和跨 Page 复用，并保留 unrelated Registration revision 不重建当前 Runtime 的语义。
- [x] 4.4 扩展 React/adapter tests 覆盖 resolving/loading/loaded 与私有 awaiting-handshake/ready 的区分、load timeout、explicit retry、Page switching、App teardown、late event、iframe count、lease disposal、focus restoration 和 Host Page 不创建 iframe。

## 5. 为 Runtime Session 增加握手期限并参与统一清理

- [x] 5.1 在 bootstrap 成功发送后启动 5,000 ms Host-private handshake deadline；第一个 exact acknowledgement 清除 timer，超时产生 `runtime_handshake_timeout`、关闭两端可控 Port 并请求 owning Runtime terminal cleanup。
- [x] 5.2 让 Session dispose/disconnect 清理 nonce、Port handlers、subscribers、deadline 与 window/Port lease，并用 owning attempt guard 拒绝迟到 acknowledgement、timer、messageerror、Port event 和旧 Session cleanup。
- [x] 5.3 扩展 Session parser/service/React/real-WebView tests，覆盖 deadline 前 ready、never acknowledge、late/replayed ack、wrong source/origin、duplicate cleanup、Host reload、unexpected disconnect、replacement/grant invalidation、unrelated revision 和 zero privileged handler hits。

## 6. 实现进程内连续失败熔断

- [x] 6.1 实现以 trusted entry identity + resource generation 为 key 的 process-local breaker：60,000 ms 内第三次 qualifying failure 开启 30,000 ms cooldown；close/navigation/invalidation/graceful exit 不计数，generation change 或连续 ready 30,000 ms 清除记录，进程退出不持久化。
- [x] 6.2 在 cooldown 期间于 resolve/lease/iframe/Session 创建之前拒绝启动，保持无自动 retry；cooldown 到期仍等待下一次显式用户 retry，并确保旧 retry/cooldown timer 不能启动新 Runtime。
- [x] 6.3 添加 virtual-clock tests 覆盖 rolling window 边界、第三次失败、非 qualifying 事件、cooldown expiry、generation reset、healthy reset、unrelated plugin isolation、process recreation 和 no hidden construction。

## 7. 完成有限诊断、双语反馈与可访问交互

- [x] 7.1 建立 `runtime_load_timeout`、`runtime_handshake_timeout`、`runtime_session_disconnected`、`runtime_security_policy_failure`、`runtime_crash_loop` 和 `runtime_unavailable` 的 Host-private mapping；不得记录或显示完整 URL/blocked URI、scope/origin、nonce/Port、path、grant list、payload、raw exception 或 stack，也不增加远程 CSP report channel。
- [x] 7.2 使用现有 Semi Design feedback surface 和 i18n 增加 canonical English copy、语义一致的 Simplified Chinese copy 及 schema/type coverage；保留 alert/status、busy state、键盘 retry/close、visible focus、焦点恢复和 light/dark theme 行为。
- [x] 7.3 增加 UI/i18n/accessibility/theme tests，覆盖 timeout、disconnect、可确认 CSP failure、无可靠 CSP callback 时的 bounded fallback、cooldown、locale/theme switching、manual retry 和无敏感诊断泄漏。

## 8. 建立完整真实证据与 focused gate

- [x] 8.1 增加或扩展 canonical normal、malicious、slow-load、never-acknowledge、unexpected-disconnect、repeated-failure、Host-reload 和 replacement `.lxp` fixtures，且不从临时目录导入、链接或引用任何产物。
- [x] 8.2 扩展 bounded macOS WKWebView evidence schema/runner，记录 CSP directive/content class、deadline/breaker/single-iframe/cleanup 的布尔结果与必要 platform/dependency facts，同时拒绝 URL、token、nonce、Port content、path、payload、storage value 和 private error。
- [x] 8.3 新增 `pnpm run check:plugin-runtime-security-lifecycle`，顺序组合 Rust/TypeScript/React tests、production/harness CSP drift、real WebView matrices、public tarball/workspace boundaries 及 resource/origin/navigation/iframe/session prerequisite gates；任何安全负例或 cleanup assertion 失败都必须使 gate 失败。

## 9. 更新维护文档

- [x] 9.1 更新 canonical English `docs/en/architecture/extension-platform.md`，准确区分 CSP、origin、sandbox、Permissions Policy、navigation 和 Session，记录 deadline、breaker、统一 cleanup、单实例、支持平台、诊断限制与 Task 5.2 非目标。
- [x] 9.2 同步更新 `docs/zh/architecture/extension-platform.md`，保持相同结构与语义，并校验双语 indexes 无需变更或在需要时同步更新。
- [x] 9.3 修正 `plugin-roadmap.md` 当前基线中仍称 Runtime Session 未实现的漂移，保持 Task 4.4 checkbox 未选中，直到实现、规格同步、归档和要求的验证全部完成。

## 10. 最终验证

- [x] 10.1 顺序运行 `pnpm run check:plugin-runtime-security-lifecycle` 及其列出的 Resource Service、isolated origin、frame-aware navigation、iframe Runtime、Runtime Session、lifecycle、workspace/public-package 前置门禁，确认真实 WebView 与确定性 race tests 全部通过。
- [x] 10.2 运行前端格式化、测试、静态检查、类型检查和构建：`pnpm run format`、`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`。
- [x] 10.3 运行 Rust 格式化、格式检查、测试和静态检查：`pnpm run src-tauri:format`、`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`。
- [x] 10.4 运行 `git diff --check` 与 `openspec validate complete-plugin-runtime-security-lifecycle --type change --strict`，直接核对 tasks checkbox、双语文档和 change artifacts；修复本 change 引入的每个 warning/error 后，重跑失败命令以及 10.1–10.4 的完整最终验证集。


