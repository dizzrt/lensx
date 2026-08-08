## 1. 公共 Contract Breaking Reset

- [x] 1.1 将 Manifest Contract 升级到 `0.2.0`，从 JSON Schema、generated author/normalized types、TypeScript/Rust validators、diagnostics 和 shared fixtures 中删除 `requested_permissions`、permission reason 与 Page `required_permissions`；补充旧版本、旧字段、Host policy 字段和跨语言一致性失败用例。
- [x] 1.2 将 Host API Contract 升级到 `0.2.0`，从 Schema、generated types/validators、method catalog、permission catalog、fixtures 和 public exports 删除 `clipboard.read`、`clipboard.write`、`HostApiPermission`、permission mapping 与仅为 permission denial 存在的语义；保留并复核 navigation/context/storage/close 的 exact contract。
- [x] 1.3 更新 `@lensx/plugin-contract`、SDK、Testkit 与 CLI 的 package metadata、exports、consumer fixtures 和 Changesets release intent，使真实 tarball 外部消费者只能编译当前 `0.2.0` Manifest/Host API，且旧调用在编译期或运行时确定性失败。
- [x] 1.4 更新 framework-neutral、React/Semi、development smoke 和 official-release 临时 fixtures 的 Manifest、Host API ranges、runtime context 与测试，删除所有 workspace/public template 中的 permission/grant 示例并保持无 Host-private import。
- [x] 1.5 扩展 Contract/generation drift gate，证明 Schema → generated TypeScript → Rust mirror → SDK/Testkit/CLI/templates 使用同一 `0.2.0` 事实链，且生成后 worktree 无未注册 drift。

## 2. Plugin Manager Store 与 Registration 迁移

- [x] 2.1 设计并实现新的 Plugin Manager record format，删除 `granted_permission_ids`、grant mutation 和相关 validation/projection；保留 installed/development payload、source、enabled、diagnostics、resource generation 与原子逐插件持久化。
- [x] 2.2 实现旧 record/Manifest `0.1.0` 的幂等 fail-closed 恢复：不得伪造 Manifest `0.2.0`、恢复 grant、删除 program/data 或泄漏 path/grant，必须发布稳定 incompatible/quarantine 管理事实并允许显式 removal/reinstall。
- [x] 2.3 将 Registration Contract 升级到 `0.3.0`，从 Rust/TypeScript snapshot、detail、event、strict parser、fixtures 和 adapters 删除 grant/permission facts，并保持 source/lifecycle/availability/diagnostic 与 revision/event-loss convergence。
- [x] 2.4 删除 Manager grant API、permission revision mutation 与 grant-specific invalidation branches；证明 installation、replacement、development reload、lifecycle 和 resource generation 仍各自发布精确 revision 且 unrelated plugin 不被 invalidated。
- [x] 2.5 添加 Manager/Registration migration matrix，覆盖新 record restart、旧空/非空 grant record、damaged/unknown version、旧 Host 读取新 record、重复恢复、persist failure、quarantine conflict、retained data 与 bounded diagnostics。

## 3. 安装、替换、开发与生命周期 Contract 收敛

- [x] 3.1 将 local installation Host-private contract 升级到 `0.3.0`，从 candidate projection、prepare/commit/cancel、token state、Manager commit 和 frontend adapter 删除 permission candidates、reasons、selections、empty-grant commit 与 post-commit grant sequence；保持 immutable bytes、TOCTOU、pathless picker、staging/recovery 与 revision convergence。
- [x] 3.2 将 replacement contract 升级到 `0.2.0`，删除 added/removed/retained permission diff、grant intersection 与 post-commit permission work；保持 identity/version/digest classification、opaque token、atomic replacement、quiesce、data policy 和 old payload cleanup。
- [x] 3.3 更新 Development Mode register/reload/remove，使 process-local snapshot 只接受 Manifest `0.2.0`，manual reload 不再比较或保留 grants，仍强制 fresh resource generation、fresh Runtime attempt 和失败时保留旧 generation。
- [x] 3.4 更新 lifecycle uninstall/reinstall 与 cleanup recovery，删除 grant reset/restore facts，证明 retained data、pending cleanup、new record identity 与旧 operation fencing 不变且旧 permission data 不会复活。
- [x] 3.5 为 installation/replacement/development/lifecycle 添加 Rust 与 TypeScript focused tests，覆盖 malformed legacy payload、cancel、stale revision、partial persistence、retry、restart、legacy record replacement 和零 permission authority。

## 4. 删除 Permission 与 Native Clipboard 生产 Authority

- [x] 4.1 删除 Rust `plugin_permission` 状态、grant command、clipboard command、AppKit text clipboard provider、setup/managed state 与 production invoke registration；更新 Cargo/module wiring 并证明不存在可从 main 或 plugin WebView 调用的遗留 native boundary。
- [x] 4.2 删除 React permission catalog/service/mutation adapter、candidate projection、grant/revoke orchestration、root composition 与 Runtime permission provider wiring；保持 App root generation initialize/destroy、StrictMode 与其他 plugin services 生命周期正确。
- [x] 4.3 从 Host API Dispatcher、Runtime context composition 和 Session capability calculation 删除 clipboard provider与 grant-derived branches；保留 closed `0.2.0` non-privileged provider dispatch、cancellation、currentness、deadline、bounded validation 和 context replacement。
- [x] 4.4 删除或改写 permission/clipboard focused tests、fixtures、scripts、package exports、i18n keys 与 generated evidence，新增 negative gate 证明旧 commands、methods、grant fields、public prompt/mutation imports 和 Host-private clipboard provider 均不可达。
- [x] 4.5 审计 root、public packages、official/examples、Tauri commands、Rust features 与 production bundles，证明删除 permission authority 没有意外暴露任意 Tauri、filesystem、Shell、process、native clipboard 或 private Host state。

## 5. Open Web / Closed Host Runtime

- [x] 5.1 将 plugin response CSP 改为 Host-owned isolation profile：保持精确 Host ancestor、Host main CSP 独立、scope/generation/path、`nosniff`、`no-store` 与 no-Host-CORS，停止以 lensX grant 阻止 Dedicated Worker、network、remote HTTPS/WSS resource、`blob:`、`data:`、WASM 与 origin storage；添加字节级 Host/plugin policy drift tests。
- [x] 5.2 更新 iframe sandbox、referrer 与 Permissions Policy 的固定基线，只保留 Host、navigation、cross-plugin、device-support 与 lifecycle 必需限制；证明 Manifest/HTML/message 不能选择 sandbox、Host bridge、shared origin、top navigation、popup、download 或 external-protocol escape。
- [x] 5.3 扩展 Plugin Resource Service 与 MIME/URL tests，验证 package Worker/module/resource 可由当前 scoped origin 加载，remote/Blob/Data 内容不获得 Host resource authority，旧 generation、cross-plugin、query/fragment/path escape 和 symlink/race 继续 fail closed。
- [x] 5.4 建立 canonical open-Web fixtures，自动覆盖 package/remote module、Dedicated Worker、Worker message、fetch、WebSocket、Blob/Data、WASM、IndexedDB/local storage 和 author-owned stricter CSP；对目标 WebView 不支持的项目给出明确 bounded unsupported evidence而不是伪造成功。
- [x] 5.5 扩展 Runtime controller 与真实 WKWebView harness，证明 close、navigation、disable、uninstall、replacement、development reload、Session disconnect、breaker、Host reload/unmount/exit 会终止旧 iframe、Dedicated Worker、network activity、Blob URL、Session、Port、timer/listener 与 navigation lease。
- [x] 5.6 添加恶意隔离矩阵：remote/Worker/Blob/Data code 尝试 Host DOM、Tauri globals/IPC、private commands、另一个 plugin origin/storage/Session、旧 generation、popup、top navigation、SharedWorker/ServiceWorker 或 persistent background 时必须 fail closed 且无敏感诊断。
- [x] 5.7 添加本 change 的最小 Host 可用性压力证据，覆盖 Worker/connection churn、message burst、failure/reload loop 与 teardown race；复用现有 deadline/breaker/RPC budgets，明确完整 CPU/memory/rate 配额仍属于 Task 7.5。
- [x] 5.8 新增 `check:open-isolated-plugin-runtime` focused gate，组合 policy/resource/iframe/Session/transport/Host API、cross-plugin、legacy migration、real WKWebView、teardown 与 public boundary evidence，并对缺少任一阶段的 composition drift 失败。

## 6. Trusted Host UI 移除权限交互

- [x] 6.1 更新 local installation UI 为 bounded identity/version/Publisher 加“安装即信任、开放 Web、封闭 Host”双语说明，删除 permission checklist、single-permission Modal、transient selection、post-commit grant 与 partial-permission状态；保持 prepare/confirm/cancel、键盘、focus、live status、light/dark 和固定 viewport。
- [x] 6.2 更新 replacement UI，删除 permission diff、grant retention/new permission confirmation 与 partial-grant feedback，保留 upgrade/downgrade/reinstall classification、explicit confirmation、quiesce/convergence、cancel/retry 和可访问反馈。
- [x] 6.3 更新 Plugin Management list/detail，删除 permission section、grant/revoke controls、mutation pending/conflict 与 permission diagnostics；为 legacy incompatible record 显示 bounded recovery/removal guidance且不暴露 grants/path/raw record。
- [x] 6.4 删除 English/Chinese permission i18n keys、schema entries与不可达样式，更新 remaining copy/schema/key parity；使用自动 screenshots、computed styles 和 deterministic Testing Library scenarios 覆盖 `en-US|zh-CN × light|dark`、keyboard/focus、empty/loading/degraded/legacy states，无需人工 UI replay。
- [x] 6.5 扩展 PluginManagementService 与 App StrictMode integration tests，证明删除 permission composition 后每个 root effect generation 仍只初始化/销毁一组 current services，stale async completion、replacement/installation race 和 unmount 不恢复旧 authority。

## 7. Public Tooling、文档、Release 与 Roadmap

- [x] 7.1 更新 public CLI create/build/validate/pack/inspect、project templates 与 isolated tarball consumers，证明普通插件可使用 Worker/network/Blob/Data 等 Web 能力而无需 lensX permission fields，并继续只依赖公开 Contract/SDK/UI/Testkit/CLI。
- [x] 7.2 更新 canonical `docs/en/architecture/extension-platform.md`、plugin package/runtime 架构说明及同路径 `docs/zh` 镜像，明确安装信任、开放 Web、封闭 Host、跨插件隔离、digest 只覆盖 package bytes、远程行为非 Host 背书和 native capability 未交付。
- [x] 7.3 更新双语 plugin-development hub、tutorials、Host API reference、Runtime/security、tooling/installation、development mode 与 troubleshooting，删除 permission/grant/clipboard Host API 旧指导，保持 runnable blocks、relative links、indexes 与 external-consumer validation。
- [x] 7.4 更新 official plugin release pipeline、candidate/runtime E2E、CODEOWNERS/docs drift 组合，移除已删除 permission focused gate，保留 official 与 external 同一 open Runtime/Host isolation、最小发布权限、digest/audit 不产生 Host authority以及零 product member no-op。
- [x] 7.5 更新 validation scripts 与 capability status markers，使 strict gates 对旧 Manifest/Host API versions、permission commands/UI/docs、grant fields 或 restrictive Worker/network claims 失败，并保持 README/AGENTS/OpenSpec config 不承载具体实现设计。
- [x] 7.6 在所有实现和初轮最终验证通过前保持 Task 7.2、Task 7.3 与 Task 7.5 未完成；通过后仅把 `adopt-open-isolated-plugin-runtime` 记录为 Task 7.2 前置 change，明确 Task 7.3 因 clipboard permission contract 删除而待重新规划，绝不把 Task 7.2 产品或 Task 7.5 完整配额误标完成。

## 8. Focused 与初轮完整验证

- [x] 8.1 顺序运行 Contract/generation/public consumer focused gates，包括 Manifest、Host API、SDK、Testkit、CLI、project templates、package format、workspace boundaries 与 official release；修复全部 warning/error 后重跑失败项。
- [x] 8.2 顺序运行 Manager/Registration/installation/replacement/lifecycle/development/management focused gates与 migration fixtures，证明旧 record fail closed、无 grant authority、Store/data 安全和 UI convergence；修复后重跑失败项。
- [x] 8.3 顺序运行 `pnpm run check:open-isolated-plugin-runtime`、resource/origin/navigation/iframe/Session/transport/RPC/security lifecycle focused gates与真实 macOS WKWebView harness，证明开放 Web 成功路径及 Host/跨插件/旧 generation negative paths。
- [x] 8.4 顺序运行双语文档结构/links、runnable examples、capability status、official release docs与 repository boundary checks，确保 English canonical 与 Chinese mirrors 完整且没有旧 permission 能力声明。
- [x] 8.5 执行一次完整 frontend/shared 与 Rust 验证集合，并在全部成功后完成 7.6 的 Roadmap 编辑；Roadmap 编辑后不得直接勾选 Final Validation，必须执行第 9 节完整最终重跑。

## 9. Final Validation

- [x] 9.1 顺序运行 `pnpm run test`、`pnpm run format`、检查格式化 diff、`pnpm run check`；修复所有 warning/error 后重跑受影响项与本步骤完整集合。
- [x] 9.2 顺序运行 `pnpm run typecheck`、`pnpm run build`，确认 permission/clipboard dead code 不进入 production bundle、open Runtime harness/fixtures 不污染 Host frontend bundle；修复后重跑本步骤。
- [x] 9.3 顺序运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，确认 permission commands/provider 已删除、Manager migration与真实 Runtime边界通过；修复后重跑本步骤。
- [x] 9.4 运行所有第 8.1–8.4 focused gates、`openspec validate adopt-open-isolated-plugin-runtime --type change`、双语文档严格检查与 `git diff --check`，核对 proposal/design/spec/tasks/roadmap 一致且所有 checkbox 都有自动化证据。
- [x] 9.5 修复任何引入或暴露的 warning/error 后，按 9.1 → 9.4 顺序重跑完整最终集合；仅在最终重跑全部成功后勾选本 change 的验证项，保持 Task 7.2/7.3/7.5 product checkboxes 未完成，并为后续先 sync English stable specs 再 archive 留下干净状态。
- [x] 9.6 归档前对全部稳定 specs 执行 permission/grant/clipboard 语义扫描，补齐遗漏 capability 与完整 MODIFIED requirement block，重新同步英文稳定 specs，并重跑 strict change/all-spec validation、change-specific aggregate gate 与 `git diff --check`；仅在无正向旧 authority 矛盾后归档。
