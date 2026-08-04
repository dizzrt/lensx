## 1. 前置能力复核与 Runtime 门禁

- [x] 1.1 确认 `add-frame-aware-webview-navigation-policy` 与 `add-isolated-plugin-runtime-origin` 均已完成各自 macOS gate，运行两项 dedicated checks，并核对依赖 revision、isolated-origin URL contract、module/storage/Tauri evidence 未 drift；任何缺失都保持 production iframe 阻塞。
- [x] 1.2 使用现有 normal/malicious canonical `.lxp` fixtures 在不进入 production composition 的 WKWebView harness 中固定 `sandbox="allow-scripts allow-same-origin"`、Host Permissions Policy 与 `no-referrer`，证明 isolated origin、HTML/CSS/image/classic script/ES Module graph、current storage、Host/other-plugin/old-generation isolation、parent/frameElement/Tauri absence 与 exact frame-aware lease。
- [x] 1.3 复核所有前置 Open Questions 已关闭；若 shared origin、module graph、storage partition、Tauri rejection 或 native lease 任一失败，先更新相应 OpenSpec change，禁止 wildcard/null CORS、opaque-origin classic-only fallback、共享-origin `allow-same-origin` 或删除 negative case。

## 2. Host-private Runtime target resolution

- [x] 2.1 在 `src/app/plugins/runtime` 建立 framework-neutral Runtime descriptor、bounded error、resolver interface、origin-contract validator 与纯 route/identity helpers；保持 `ActivePage`、Page descriptor、Launcher snapshot 和 public plugin packages 字段不变，并证明不泄露 entry ID、revision、scope、origin token、路径、digest、URL 或 Host object。
- [x] 2.2 实现 production Runtime resolver：从 `PluginSurfaceProjectionService.currentSnapshot()` 查找匹配 owner 的 current eligible entry，使用 Plugin Resource Desktop Adapter 解析入口，交叉验证 entry ID/revision/plugin ID 与 isolated-origin contract，并从 verified entry URL 与 Registry route 派生 fragment-based `iframe_src` 和 `runtime_key`；拒绝共享 host 或旧 URL fallback。
- [x] 2.3 为 snapshot unavailable/degraded、missing/disabled/incompatible entry、stale revision、typed resource error、invalid payload、identity mismatch、shared/unknown origin、origin/path scope mismatch、非法 route/URL 和 concurrent stale result 添加 fail-closed resolver tests；错误必须 bounded 且可本地化。
- [x] 2.4 为 explicit retry 增加 current snapshot refresh/re-read、new origin/lease 与 attempt identity 规则，证明失败 promise、旧 iframe target、旧 origin lease 和自动循环不会被复用，同时 unrelated provider revision 不会误映射 Runtime。

## 3. iframe sandbox、origin 与导航边界

- [x] 3.1 建立唯一 Host-owned iframe policy 常量与 validator，精确固定 `allow-scripts allow-same-origin`、禁止所有额外 sandbox token、设置 `no-referrer` 和 deny-by-default Permissions Policy，并在 isolated-origin contract 不成立时拒绝 container；拒绝 Manifest/plugin override。
- [x] 3.2 复用 frame-aware policy：挂载前激活绑定 isolated-origin exact entry 与 Host-derived fragment 的 current epoch lease，在 close/invalidation/retry/replacement 时 compare-current dispose；普通 package subresource 继续只由 current origin/scope/generation 的 Resource Service 授权。
- [x] 3.3 实现最小 Host main-frame Runtime adapter 以激活/释放现有 macOS native policy，不复制 policy、不新增插件可调用 command、不暴露 invoke key；覆盖 initial/fragment、idle/active/replacement/late cleanup、其他 origin/scope/plugin/version/generation、Host/external、危险 scheme、popup/new-window/download/form/top-navigation 与 encoded bypass。
- [x] 3.4 增加 malicious iframe negative tests，证明 `window.parent` DOM、`frameElement`、Host React/storage、`window.__TAURI_INTERNALS__`、代表性 Tauri invoke、filesystem/native objects、其他插件/旧 generation resource/storage 与敏感 browser features 在 privileged Host behavior 前稳定失败。
- [x] 3.5 回归 Plugin Resource Service 的 origin/scope/generation、host/path cross-check、path/MIME、no-store、no wildcard/null CORS、disable/re-enable、replacement/uninstall/restart 与 cross-plugin oracle tests，确保 Runtime integration 不放宽前置 contract。

## 4. React Runtime 容器与单 Page composition

- [x] 4.1 实现可独立测试的 `resolving -> loading -> loaded/failed -> disposed` 状态与 cancellation/late-result guards；只使用 `loaded`，不得把 iframe load signal 命名为 SDK/Session `ready`，timeout/crash/reload/pending-call 保持在 Task 4.4 范围外。
- [x] 4.2 使用 Semi Design、应用 i18n 与现有 theme 实现 `PluginRuntimeFrame`：提供 busy/polite loading、safe alert failure、键盘可操作 retry、visible focus、localized iframe title 和填满 Page slot 的布局，不新增组件库或 runtime dependency。
- [x] 4.3 在 `App.tsx` plugin Page branch 中以 `PluginRuntimeFrame` 替换 `PluginPagePlaceholder`，保持 Host Settings/Host Page React composition、PageErrorBoundary、Page context、shared close、surface resizing、query/selection cleanup 与 input focus restoration。
- [x] 4.4 以 owner/page/entry/revision/isolated entry URL/attempt 绑定 React identity，并在 manual close、Registry invalidation、provider quiesce、disable/uninstall/replacement、origin/identity change、home/search、Host Page 和 App unmount 时移除旧 iframe；证明最多一个 iframe且没有 hidden keep-alive、pool、Router/history/tab 或跨 Page reuse。
- [x] 4.5 增加 Testing Library/Rstest coverage：resolving、loaded-not-ready、known failure、retry、late result、locale/theme、ARIA/focus、exact sandbox/allow/referrer、origin validation、route fragment、Host Page unaffected、close/invalidation/replacement cleanup 与 single-iframe invariant。

## 5. 真实包与专用回归门禁

- [x] 5.1 将 normal/malicious fixtures 接到 production Runtime path，验证真实安装、Registration/Page projection、isolated-origin Resource resolve、iframe render、ES Module/resource graph、route、retry、disable/uninstall/replacement invalidation、旧 origin/scope rejection 与 storage partition。
- [x] 5.2 增加 `check:plugin-iframe-runtime` 根命令，组合 Runtime resolver/component/navigation tests、`check:frame-aware-webview-navigation-policy`、`check:isolated-plugin-runtime-origin`、workspace boundary、Plugin Page/lifecycle/replacement/resource regressions、必要 Rust tests、真实 `.lxp` installation 与 WKWebView security harness；CI 输出必须确定且 fail closed。
- [x] 5.3 在目标 macOS WKWebView 上运行 dedicated gate 并保存可审查的 platform/dependency/bundle evidence；DOM 模拟不得替代 isolated origin、ES Module、storage/parent/Tauri 或 nested navigation 实证，本 change 不验证或宣称 Windows/Linux Runtime。
- [x] 5.4 验证 Contract、SDK、UI、Testkit、官方/示例/外部 plugin workspace 均不能 import Runtime resolver、Registration/Resource adapters、origin token、Tauri boundary 或 Host iframe policy；本 change 不新增 public Runtime/session/API export。

## 6. 文档与路线图准备

- [x] 6.1 按 `docs/AGENTS.md` 更新 canonical English `docs/en/architecture/extension-platform.md` 及相关 architecture/development documents，并同步相同路径 `docs/zh` 镜像；明确 isolated-origin prerequisite、scoped `allow-same-origin`、`loaded`/`ready` 区别、真实 WebView evidence 和未交付 Task 4.3/4.4/5.x。
- [x] 6.2 更新当前能力清单、验证命令与示例，删除“Plugin Page 仍只显示 Runtime-unavailable placeholder”的过时现状，但保留 Plugin Page navigation、Resource Service、Runtime origin 和 iframe container 的职责分离。
- [x] 6.3 检查 README、AGENTS、public package declarations 与 Manifest schema 不承载本 change 具体设计；不提前建设正式插件模板，也不把 classic-only/inlined fixture、origin token 或 sandbox policy 暴露为作者 contract。

## 7. 最终验证

- [x] 7.1 运行 `pnpm run check:plugin-iframe-runtime`，修复 Runtime、real package、WebView/security、workspace boundary、Page/lifecycle/replacement/resource 与 Rust focused gate 的所有 warning/error，并重新运行至通过。
- [x] 7.2 顺序运行 `pnpm run test`，修复本 change 引入的所有 failure/warning，然后重新运行至通过。
- [x] 7.3 运行 `pnpm run check`，修复 Biome、workspace boundary 和 member check 问题，然后重新运行至通过。
- [x] 7.4 运行 `pnpm run typecheck` 与 `pnpm run build`，修复所有 error/warning并重新运行两项至通过。
- [x] 7.5 运行 `pnpm run src-tauri:format:check`；若需要，运行 `pnpm run src-tauri:format` 后重新检查至通过。
- [x] 7.6 顺序运行 `pnpm run src-tauri:test` 与 `pnpm run src-tauri:check`，修复本 change 引入的所有 error/warning并重新运行至通过。
- [x] 7.7 运行 `openspec validate add-frame-aware-webview-navigation-policy --type change`、`openspec validate add-isolated-plugin-runtime-origin --type change` 与 `openspec validate add-isolated-plugin-iframe-runtime --type change`，直接统计三份 tasks checkbox，并复核 artifacts、source/tests、英中文档与 macOS evidence 一致；任何 isolated-origin/module/storage/lease/Tauri 假设未验证都阻止完成声明。
- [x] 7.8 只有 7.1–7.7 全部通过且 Task 4.2 completion standard 有真实证据后，才在 `plugin-roadmap.md` 标记 Task 4.2 完成；随后重新运行 `pnpm run check` 与当前 change validate，确认 roadmap/docs/change 仍有效。
