## 1. Build Capability And Contract Foundation

- [x] 1.1 新增默认关闭的 native `plugin-development-mode` feature、同源 frontend compile-time capability 和专用开发启动命令；增加 mismatch fail-closed 测试，并证明普通 dev/release build 不会误注册 development managed state 或 commands。
- [x] 1.2 定义最小 versioned Host capability snapshot 与 process-local Development Mode switch，覆盖 startup disabled、显式 enable、disable-before-quiescence、重复操作和 unsupported build；保证 frontend 状态不成为 native authority。
- [x] 1.3 定义 Host-private development register/reload/remove strict request/result/error contract：register 使用 pathless native picker，reload/remove 使用 opaque entry identity 与 expected revision，所有 diagnostics bounded 且不序列化绝对路径、bytes、raw error、token 或 private facts。
- [x] 1.4 将 Registration Contract 从 `0.1.0` 一次性升级到 `0.2.0` 并加入 closed `development` source；同步 Rust serializer、TypeScript exact parser、snapshot/detail/event fixtures 和 adapter failure tests，不增加双版本 fallback。
- [x] 1.5 扩展 workspace/release artifact boundary gate，证明 public Contract、SDK、UI、Testkit、CLI、official/example plugins 不导入或打包 Development coordinator/path/snapshot/command internals，正式 frontend/native artifacts 不含开发入口。

## 2. Plugin Manager Process-Local Development State

- [x] 2.1 将 Host-owned payload facts 重构为严格 installed-package 与 development-snapshot variants，保留现有 Store format/installed recovery，同时拒绝 Manifest author 提交 path、digest/identity、source、enabled、grants 或 Runtime facts。
- [x] 2.2 在同一 Plugin Manager current snapshot 中实现 process-local development entries，复用全局 plugin ID/quarantine collision、compatibility、enabled、grant、diagnostic、revision、resource generation 和 changed-event语义，但不执行 Store write/delete。
- [x] 2.3 实现 revision-bound development register、forced-reload replacement 和 remove transitions；覆盖相同 bytes reload 仍推进 generation、stale race、plugin ID 变化、同 ID installed/quarantine 冲突和 unrelated-plugin stability。
- [x] 2.4 实现 reload grant reconciliation：首次 register grants empty，仅保留新旧 Manifest 共同声明的 grants，删除不再声明的 grants，新增 requests 不授权；覆盖 grant/disable/reload/remove 竞态。
- [x] 2.5 增加 Manager restart/recovery tests，证明 development entry、directory capability、snapshot、grant、diagnostic 和 Runtime activity均不持久化，installed/quarantine records 与 Store revision 保持原语义。

## 3. Bounded Development Directory Inspection

- [x] 3.1 建立 Rust development directory inspector 和可注入 filesystem seam，只接受 picker-authorized `dist/` 根下普通文件；实现无 symlink/special file、portable path、case collision、文件数/单文件/总大小和有界读取。
- [x] 3.2 在 copied staging bytes 上复用 Manifest normalization/compatibility 和 resource completeness 规则，保持 valid compatible、invalid、incompatible 三态，不读取 `package.json`、不检查项目 imports、不执行 build、不要求 `checksums.json`。
- [x] 3.3 实现 root/entry read-before/read-after currentness 检查和 stable `source_changed`/unsafe diagnostics，覆盖增长、截断、替换、link race、删除、权限/I/O failure 和不泄露绝对路径/partial Manifest。
- [x] 3.4 建立 CLI `validate` 与 Rust inspector 的共享 directory corpus，只比较双方共同的 `dist/` payload 语义；覆盖正常、Manifest/resource/path/limit/compatibility 负例并明确 CLI 项目 metadata/import 检查不属于 Host 结论。

## 4. Host-Owned Snapshot Storage And Coordinator

- [x] 4.1 在 `app_cache_dir()/plugin-development/<process-session>/` 下实现受限 staging/current layout、随机 session/generation identity、same-filesystem atomic rename、必要 flush 和 domain-separated `sha256-development-tree-v1` snapshot identity，明确其不是 `.lxp` package digest。
- [x] 4.2 实现 register transaction：native folder picker cancel、bounded copy、staging validation、atomic snapshot publish、Manager compare-and-commit、changed event 与 failure cleanup；覆盖各 fault point 不发布 partial authority。
- [x] 4.3 实现 reload transaction：从 Host-private saved directory capability 重新 snapshot、比较 expected identity/revision、强制新 generation、失败保留旧 registration/snapshot/Runtime，成功后安全 retire 旧 snapshot。
- [x] 4.4 实现 single-entry remove 与 mode shutdown 全量 quiescence，按确定顺序撤销 Manager/Resource/Runtime authority并清理 snapshot，同时保留 plugin data、Launcher collections、正式 packages 和其他插件状态。
- [x] 4.5 实现当前 process 的受限 staging/retired snapshot residue recovery 与 bounded cleanup diagnostics；覆盖 cleanup failure 不恢复旧 authority、异常命名/路径不猜测删除、Drop/app exit best-effort cleanup。
- [x] 4.6 将 feature-gated coordinator、commands、native picker 和 managed state 接入 Tauri setup/invoke composition；增加 build-enabled/build-disabled command registration 与 capability handshake tests。

## 5. Resource And Runtime Reload Integration

- [x] 5.1 扩展 Resource service 的 atomic current projection，使 installed package 与 current Host-owned development snapshot 分别证明 ownership/identity；拒绝 author directory fallback、错误 session/generation、unsafe tree 和 path disclosure。
- [x] 5.2 扩展 scope/cache key 与 invalidation tests，证明 successful reload/remove/disable/mode shutdown 先撤销旧 scope，cleanup 延迟不延长 authority，same identity/same bytes 也不复用已撤销 origin。
- [x] 5.3 将 development reload/remove/mode shutdown 接入统一 Runtime terminal cleanup；为仍是 current navigation target 的成功 reload 显式创建 fresh attempt，不建立 watch、hidden Runtime 或 automatic retry。
- [x] 5.4 扩展 deterministic TypeScript lifecycle/Session/transport/dispatcher race tests，证明旧 iframe、Session、nonce、Port、listener、timer、pending RPC、navigation lease 和 handler currentness 全部失效，late callbacks 不能影响新 attempt。
- [x] 5.5 扩展 macOS real WebView harness 与 canonical development fixtures，验证 register/open/reload/permission delta/remove 的正常和恶意路径，以及 development 与 external 插件使用相同 CSP、sandbox、Permissions Policy、deadline、breaker、Host API 和权限边界。

## 6. Frontend Typed Development Service

- [x] 6.1 新增 Host-private desktop adapter，严格解析 capability/switch/register/reload/remove contract，映射 stable errors，并保证绝对路径、snapshot identity、operation token、raw error 和 private object 不进入前端类型/state/log。
- [x] 6.2 扩展 Plugin management domain/view model 支持 `source=development`、build/native/session 三重 gate、development operation availability、pending duplicate protection 和 safe localized feedback，不复制 Manager/inspector 业务规则。
- [x] 6.3 实现 typed service 的 enable/disable/register/reload/remove convergence：mutation 后完整 reread snapshot/detail，处理 event loss、stale revision、entry disappearance、partial shutdown/cleanup 和 unrelated-plugin events。
- [x] 6.4 增加 adapter/service unit tests，覆盖 unsupported/disabled/enabled、cancel、success、invalid/incompatible/source_changed/conflict/cleanup pending、same-byte reload、permission delta、remove、mode shutdown 和 StrictMode initialize/destroy generation。

## 7. Plugin Management Settings UI

- [x] 7.1 使用现有 Semi Design 与 theme/i18n 机制增加 Development Mode warning、process-local Switch 和 Register development directory control；capability 不存在时完全不渲染，并且开启动作不声称插件已安装/授权/运行。
- [x] 7.2 为 development entries 增加明确的 Development、Unpacked、Unsigned 文本标签和安全 detail presentation；publisher、source、requested/granted/effective permission 必须分开，状态不只依赖颜色/icon。
- [x] 7.3 增加仅 development entry 可见的 Reload/Remove controls、确认和 pending/error/success feedback；失败 reload 保留旧事实，remove 明确保留 plugin data/Launcher collections，普通 installed/quarantine 操作不改变。
- [x] 7.4 完成 `en-US` canonical messages、`zh-CN` 语义镜像和 message schema，覆盖 capability说明、来源标签、确认、所有 stable diagnostics、partial/convergence 与 cleanup 状态。
- [x] 7.5 增加 Testing Library/Rstest 可访问性测试，覆盖 keyboard-only enable/register/reload/remove、Modal title/description/initial focus、pending close protection、live announcements、cancel/success/failure/stale 后 deterministic focus recovery。
- [x] 7.6 在固定 `650×600` native page viewport 对 en-US/zh-CN、light/dark、empty/multiple/long-copy/error/pending 状态执行 screenshot 与 computed-style QA，修复截断、滚动、重叠、对比度和 focus-ring 问题并保存 bounded evidence。

## 8. Documentation And Focused Gates

- [x] 8.1 更新 `docs/en/architecture/extension-platform.md`、相关 architecture/validation 文档及 `docs/zh` 同路径镜像，记录 process-local Manager lifetime、snapshot/resource/Runtime 数据流、安全边界和正式构建排除。
- [x] 8.2 新增 English canonical Plugin Development Mode 使用文档及 Simplified Chinese 镜像并更新两个 indexes；说明专用启动命令、`build/validate` 后选择 `dist/`、手动 reload、权限变化、重启失效、诊断与非目标。
- [x] 8.3 更新 Plugin Developer CLI 双语文档，明确 CLI 仍不启用/安装/reload Host，Host directory inspector 只与 CLI 的 payload-level validation 对齐；不把 Development Mode 写成公共 CLI API。
- [x] 8.4 新增 `check:plugin-development-mode` aggregate gate，组合 contract/corpus、Rust inspector/snapshot/Manager/Resource、frontend adapter/service/UI、workspace/release boundaries、i18n/docs drift 和目标 WebView evidence，并纳入适当 workspace validation。

## 9. Final Validation

- [x] 9.1 顺序运行 focused gates：`pnpm run check:plugin-development-mode`、`pnpm run check:plugin-management-settings`、`pnpm run check:plugin-runtime-security-lifecycle`、`pnpm run check:plugin-resource-service`、`pnpm run check:plugin-registration-contract`、`pnpm run check:plugin-developer-cli`、`pnpm run test:workspace-boundaries`；修复全部 warning/error 后重跑失败项。
- [x] 9.2 顺序运行完整 frontend/shared validation：`pnpm run test`、`pnpm run format`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`，检查格式化后的 diff 并重跑受影响检查。
- [x] 9.3 顺序运行完整 Rust validation：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，修复全部 warning/error 后重跑失败项。
- [x] 9.4 使用专用 feature-enabled 开发启动命令完成一次真实 `build → validate → register dist → open → edit/build → manual reload → permission delta → remove → disable mode` smoke；随后执行正式 build artifact gate，确认正式 frontend/native artifacts 不含开发入口。
- [x] 9.5 顺序重跑 9.1–9.4 的完整最终集合；然后运行 `openspec validate add-plugin-development-mode --type change`，核对所有 task/spec/design 证据、English/Chinese 文档一致性和无剩余 warning/error，仅在全部通过后标记 `plugin-roadmap.md` Task 6.5 完成。
