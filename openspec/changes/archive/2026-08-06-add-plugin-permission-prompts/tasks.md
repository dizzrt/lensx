## 1. 升级首次安装私有 Contract

- [x] 1.1 将 Rust/TypeScript Local Plugin Installation Contract 从 `0.1.0` 升级为 `0.2.0`，定义严格的 `prepare | commit | cancel` operation、`cancelled | prepared | installed` result、opaque token、bounded candidate projection 和 operation-specific safe error；所有 parser/serde 拒绝 unknown/mismatched fields。
- [x] 1.2 为 candidate projection 建立最小 frozen types，只包含 plugin ID、version、localized display name、Publisher display facts 和 requested permission IDs/reasons；增加边界测试证明 path、digest、package bytes、staging、完整 Manifest、grant、raw error、stack 与 Host object 无法进入 payload。
- [x] 1.3 更新 Rust/TypeScript shared valid/invalid fixtures，覆盖每个 operation/result/error、token 格式、locale reason bounds、Publisher facts、unknown permission display、contract-version drift 与跨 operation payload，并接入现有 local-installation focused contract gate。
- [x] 1.4 更新 public export、workspace boundary 和 tarball consumer assertions，证明 installation token/candidate、prompt model、grant client 与 private commands 不进入 Contract、SDK、UI、Testkit、official/example plugin 或 iframe Runtime。

## 2. 实现 Rust 首次安装 Preparation 生命周期

- [x] 2.1 将现有 first-install 选择/读取/检查/提取拆为 process-local `prepare`：继续使用同一组 bounded bytes、package/Manifest/asset/checksum/compatibility 规则，在 installer-owned staging 完成验证后才发布一个 opaque token，且不写 Manager、revision、event 或 grant。
- [x] 2.2 实现每进程最多一个 preparation 的 state 与生命周期：新 prepare、显式 cancel、failed commit、service destruction 和 app exit 使旧 token terminal；只清理本 operation 可证明拥有的 staging，startup recovery 继续处理 crash residue。
- [x] 2.3 实现 token-only `commit`：在现有 in-process/cross-process installer lock 内重新验证 token、staging、candidate identity absence/quarantine、package facts 与 Host compatibility，不重开源路径；成功沿用原子 payload/Manager 提交并固定创建 empty grant snapshot。
- [x] 2.4 移除生产 root application 的旧 select-and-immediately-install command 旁路，注册新的 prepare/commit/cancel Tauri commands，并保持 main Host window、strict payload、stable error 与最小披露限制。
- [x] 2.5 增加 Rust preparation/commit/cancel 测试，覆盖 picker cancel、valid prepare、double commit、stale/unknown token、same-identity race、quarantine、unrelated Registration change、staging tamper、compatibility change、busy/new prepare、cleanup failure、restart recovery 和各 commit fault point。
- [x] 2.6 回归 first-install 原子性与安全边界：成功仍发布单一 Registration revision/event，失败不损坏 current records/filesystem，empty grant/`enabled=true`/`inactive` 事实不变，路径与 package 内容不进入错误或日志。

## 3. 建立 Host 权限提示投影与 Installation Adapter

- [x] 3.1 扩展 TypeScript installation desktop adapter/client/service，严格解析 `0.2.0` prepare/commit/cancel，从 service destroy/新 prepare 正确取消旧 token，并用 focused tests 覆盖 malformed payload、operation mismatch、cancel、retry 和 safe error mapping。
- [x] 3.2 新增 Host-private permission prompt derivation，将 candidate/current Manifest requests 与现有 permission catalog 合并为冻结 item，分开 Host risk/support、author reason、Publisher-unverified、persisted grant 与 effective state；official/external 走相同逻辑。
- [x] 3.3 为 prompt derivation 增加 `en-US`/`zh-CN` reason fallback、unknown/unsupported permission、long bounded text、no-permission、all-sensitive、partial-grant、retained/added/removed replacement diff 和 mutation-availability tests。
- [x] 3.4 保持 denied/deferred 为 interaction-only outcome：两者都不写 decision history、不调用 grant、不影响 catalog/Runtime；增加测试证明 UI selection、Publisher/source、install/replace confirmation 与插件自报 user gesture 均不能成为 authority。

## 4. 扩展 Plugin Management Service 编排

- [x] 4.1 扩展 management view model 的 mutation、confirmation、operation availability 与 feedback types，覆盖 installation preparation、单 permission sensitive grant/revoke、零授权继续、post-commit grant progress/partial failure，并保持所有 view data frozen 和 detail revision-consistent。
- [x] 4.2 将首次安装改为 prepare → confirm/cancel → commit → Registration convergence：prepared state 只保存 opaque token 与 transient confirmed permission IDs；安装 durable commit 总是 empty grant，取消/冲突/destroy 清理 token 与 transient selection。
- [x] 4.3 在安装成功后按稳定 permission ID 顺序逐项调用现有 `PluginPermissionService.setGrant`，每次使用上一结果 revision；任一失败立即停止、完整刷新并区分 durable install success 与 partial/no grant，不回滚 package 或自动重放。
- [x] 4.4 扩展 replacement confirmation，分别投影 retained grants、removed requests 与 added requests；只有 current Host-supported added permissions可默认关闭并逐项确认，durable replacement 前零 grant mutation，commit 后复用同一顺序 grant orchestration。
- [x] 4.5 增加 settings 单 permission grant/revoke operations：绑定 current entry/revision、与所有页面 mutation 串行、等待 returned revision snapshot/detail 收敛、不 optimistic update；conflict 关闭 stale modal、清空 transient decision 并要求重试。
- [x] 4.6 在 revoke success、Session invalidation、active Page close、grant/revoke unchanged、persist failure、event/convergence failure 时输出稳定安全 feedback；不自动 reopen Page、不修改无关插件，也不把 UI state 传入 Runtime authority。
- [x] 4.7 扩展 management service tests，覆盖零权限/零授权安装、逐项两权限、拒绝/稍后、install/replacement partial grant、retained/removed/add diff、stale revision/token、duplicate submission、destroy cleanup、degraded/quarantined/unsupported 和 selection/detail convergence。

## 5. 实现设置页权限提示与控制

- [x] 5.1 在现有连续 Plugins list/detail surface 中实现 prepared-install confirmation，显示 bounded candidate name/version、Host permission risk/support、author reason 和 Publisher-unverified；全部 sensitive choices 默认关闭，支持取消或零授权安装。
- [x] 5.2 扩展 replacement Modal，分区显示 retained/removed/added permissions、风险与 Publisher 边界；added sensitive permission 逐项确认且默认关闭，upgrade/downgrade/reinstall 使用同一授权规则。
- [x] 5.3 将当前只读 permission rows 升级为 current typed operation controls：not-granted supported request 提供单项 grant，persisted grant 提供 revoke，unsupported/unrequested/quarantined/degraded/stale 状态保持不可写。
- [x] 5.4 使用 Semi Design Modal/Button/Checkbox/Tag/Banner/Typography 完成单 permission grant/revoke confirmation、partial-permission feedback 和 pending 防重入；使用 UnoCSS 处理简单布局、Less 处理权限层级、滚动、主题、focus/hover/disabled 状态，不新增依赖或组件库。
- [x] 5.5 补齐 canonical English、语义一致 `zh-CN` 和 `messages.schema.json` keys，覆盖 Host risk、author-provided reason、Publisher unverified、allow/deny/later、install without grants、revoke Runtime impact、conflict、partial grant 和 retry；验证 locale key parity。
- [x] 5.6 完成 keyboard/accessibility/focus：每个 Modal 有 accessible title/description/initial focus，Esc/cancel/reject/success/error/stale 后回到 current trigger 或确定性入口，pending 不可重复/关闭，live status/alert 不依赖颜色或 raw permission ID。
- [x] 5.7 扩展 PluginManagementSettings/SettingsPage integration tests，覆盖 prepared install、zero grant、per-item confirmation、replacement added permission、settings grant/revoke、unsupported、partial failure、conflict refresh、Session-close feedback、两语言/主题与 raw error 最小披露。

## 6. Runtime、安全与聚焦验证

- [x] 6.1 增加真实 management permission mutation → Registration invalidation → surface projection → Runtime Session/Port/Dispatcher 集成测试，证明 grant 只进入新 identity、revoke 立即终止旧 authority/pending calls、event delivery failure 仍由 per-call check fail closed，且无关插件不重启。
- [x] 6.2 增加 plugin-driven negative tests：iframe RPC、`permission_denied`、Manifest reason、SDK payload、Publisher/source 和伪造 user activation 不打开 Host modal、不导航、不调用 grant、不增加 public permission-request API。
- [x] 6.3 建立 fixed `650×600` visual fixtures 与 computed-style/interaction gate，逐一验证 `en-US`/`zh-CN` × light/dark 的 prepared install、zero grant、all-sensitive、partial grant、replacement diff、settings granted/not-granted/unsupported、revoke、conflict 和 long reason 状态。
- [x] 6.4 新增 `pnpm run check:plugin-permission-prompts` focused gate，串行组合 installation `0.2.0` contracts/Rust、prompt/service/UI、Runtime invalidation、public/workspace boundaries、i18n/schema、keyboard/focus、screenshots/computed styles 和 required related regressions。
- [x] 6.5 运行并修复 focused 回归：`pnpm run check:local-plugin-installation`、`pnpm run check:plugin-upgrade-and-rollback`、`pnpm run check:plugin-management-settings`、`pnpm run check:plugin-permission-management`、`pnpm run check:plugin-runtime-session` 与 `pnpm run check:plugin-host-api-dispatcher`，失败后重跑原命令及本组完整集合。

## 7. 同步双语文档与交付边界

- [x] 7.1 更新 `docs/en/architecture/extension-platform.md`，说明 shipped permission core 与 proposed/delivered prompt 的边界、installation `0.2.0` preparation、默认拒绝、Publisher-unverified、post-commit grants、partial failure、revoke invalidation 和无 plugin-driven runtime auto-prompt；同步 `docs/zh` 同路径语义镜像。
- [x] 7.2 更新 `docs/en/development/frontend-guidelines.md` 与中文镜像，记录 Host permission prompt 的 Semi Design、continuous surface、single-permission confirmation、i18n、keyboard/focus、live feedback 和 fixed-viewport模式。
- [x] 7.3 更新 `docs/en/development/validation.md` 与中文镜像，记录 `check:plugin-permission-prompts`、相关回归、视觉矩阵、security negative evidence 和 partial-grant验证；如索引结构变化则同步英中索引。
- [x] 7.4 审核 docs、copy、fixtures、tests 和 logs，确认不泄露 path、digest、package/staging、完整 Manifest/grant set、clipboard text、raw error、stack 或 Host object，并明确不新增 public SDK、权限目录、decision history、签名、Marketplace 或通用运行时 prompt。

## 8. 最终验证

- [x] 8.1 运行 `pnpm run format` 与 `pnpm run src-tauri:format`，修复本 change 引入的格式问题；随后顺序运行 `pnpm run check:plugin-permission-prompts` 和第 6.5 节全部 focused gates，修复每个 warning/error 后重跑失败命令及 focused 完整集合。
- [x] 8.2 顺序运行完整 frontend/shared 验证：`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`；修复本 change 引入的每个 warning/error 后重跑原失败命令及四项完整集合。
- [x] 8.3 顺序运行完整 Rust 验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`；修复本 change 引入的每个 warning/error 后重跑原失败命令及三项完整集合。
- [x] 8.4 核对 English/Chinese 文档语义与相对路径、public/private boundaries、proposal/design/specs/tasks 和实现证据，运行 `openspec validate add-plugin-permission-prompts --type change` 并直接统计 `tasks.md` checkbox；只有 8.1–8.3 全部通过后才将 `plugin-roadmap.md` Task 6.2 标为完成并链接本 change，不顺带勾选 Task 6.3 或 Milestone 6。
- [x] 8.5 路线图更新后重跑 `pnpm run check` 与 OpenSpec validation；任何新失败先修复对应问题，再按 8.1–8.3 顺序重跑完整最终验证集合，确认零 warning/error、零未报告限制且 change apply evidence 完整。
