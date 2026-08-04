## 1. Native callback spike 与门禁收敛

- [x] 1.1 建立项目正式维护的正常/恶意 navigation/bootstrap documents 与确定性生成器，覆盖 Host main target/bootstrap、精确 plugin entry、最早 descendant Tauri surface probe、代表性 invoke attempt、不同 fragment、Host/external/cross-plugin/stale/dangerous-scheme self-navigation、popup、targeted browsing context 和 download；fixtures 不进入 production composition，也不依赖临时目录或 public plugin package 私有导入。
- [x] 1.2 建立最小真实 WebView spike harness 与去敏 evidence schema，固定记录 OS、WebView engine/version、Tauri/Wry revision、bundle shape、frame class、decision、pre-commit outcome、Host bootstrap availability、descendant bootstrap absence 与 bounded handler hit count，并由测试拒绝 raw URL、scope、identity、invoke key/raw payload/bootstrap、本机路径或未知字段。
- [x] 1.3 在当前锁定依赖上核实 macOS WKWebView 的 main/descendant callback、`WKNavigationAction` frame facts、cancel timing、native custom protocol、new-window/download，以及 Tauri `for_main_frame_only` 对 Host bootstrap 保留和 descendant bootstrap/invoke absence 的真实行为；源码检查只能辅助，不能替代真实 WKWebView 运行结果，Windows/Linux 不属于本门禁。
- [x] 1.4 根据 1.3 结果收敛 `design.md` Open Questions，选择只满足 macOS capability 的最小 frame-aware callback payload 与 Wry/Tauri patch surface；只有 WKWebView 能在 commit 前可靠分类/拒绝、在 author script 前隔离 bootstrap且 descendant invoke handler 零命中时才继续，禁止以 DOM cleanup、作者脚本、删除 negative case、扩大 allowlist 或全局删除 Host bootstrap 绕过门禁。

## 2. Host-private policy core

- [x] 2.1 在 Rust Host-private 模块中建立 `main | descendant` attempt、normalized target、有限 decision、bounded diagnostic 与 framework-neutral policy interface；类型不得进入 Tauri command payload、事件、Manifest、public plugin package 或 TypeScript public contract。
- [x] 2.2 实现 App target 与 plugin resource target 的结构化 normalization，精确处理 native/translated URL、fragment 和 dev/production App facts，并拒绝 query、userinfo、port、backslash、percent/double encoding ambiguity、Host/external/cross-plugin/stale target 与危险 scheme。
- [x] 2.3 实现 main/descendant disjoint allowlist：main 只允许精确 App document；idle 时 descendant 全拒绝；active 时 descendant 只允许 current exact entry document 与 Host-derived fragment，普通 subresource 不获得 document authorization。
- [x] 2.4 实现单 active target 的原子 epoch lease、replacement 和 compare-current disposal，证明旧 resolve/旧 Page/late cleanup 不能撤销新 target，进程重启不会恢复授权。
- [x] 2.5 为 normalization、allow/deny matrix、idle/activate/replace/dispose、并发 late disposal、unknown frame、invalid URL、callback failure 和 diagnostic 去敏增加完整 Rust 单元测试与属性/矩阵 fixtures。

## 3. Tauri/Wry 原生接入

- [x] 3.1 按 1.4 决策接入 upstream release 或固定 revision 的最小 macOS Wry/Tauri patch，提交 dependency/license/upstream/退出条件说明和 drift checker；禁止浮动 branch、宽泛 fork、Windows/Linux adapter、第二套 WebView runtime 或未经审查的 transitive dependency 扩张。
- [x] 3.2 在 macOS WKWebView adapter 从 `WKNavigationAction` 的可靠 frame facts 派生 main/descendant，并在 decision handler commit 前应用 policy；保留已验证的 main-only initialization semantics，并增加 initial、redirect、fragment、Host bootstrap、descendant absence 与恶意 descendant focused tests。
- [x] 3.3 在现有 Tauri main WebView production setup 中安装唯一 policy，默认保持无 active plugin target 的 idle 状态；同时安装 Host-owned new-window/download deny hook，保留受信任 Tauri opener、launcher lifecycle、透明窗口和 App main-frame bootstrap 行为。
- [x] 3.4 增加 macOS Rust integration tests，证明 unknown/unavailable frame facts fail closed、任一 deny 优先、重复 setup 不创建第二 policy、main-only script selection 不泄露到 descendant、诊断去敏且没有新增 production invoke command、invoke key 或插件可见 native object。

## 4. 真实 WebView security evidence

- [x] 4.1 将第 1 节 documents 与第 2/3 节真实 macOS policy/initialization path 连接，验证 main App/bootstrap、idle descendant、精确 active target、replacement/disposal、descendant Tauri surface/invoke absence、Host/external/cross-plugin/dangerous-scheme、popup 和 download 的端到端结果；harness 失败必须 fail closed 且输出确定。
- [x] 4.2 在目标 macOS WKWebView 上运行专用门禁并保存可审查 evidence，证明 descendant callback、pre-commit rejection、Host bootstrap、descendant bootstrap/invoke absence、native custom protocol、fragment 和 popup/download 矩阵；DOM 模拟不得替代此结果。
- [x] 4.3 增加 `check:frame-aware-webview-navigation-policy` 根命令，组合 fixture/evidence schema、dependency drift、policy/WKWebView adapter/integration、workspace boundary、Plugin Resource Service、Plugin Page/App shell 回归与 macOS evidence completeness；非交互/CI 输出必须确定且任一缺失/失败即非零退出。

## 5. 边界与回归保护

- [x] 5.1 回归 Plugin Resource Service 的 scope/generation、path/MIME、no-store、platform URL、disable/re-enable、replacement/uninstall 与跨插件 oracle tests，证明 navigation policy 不复制、不缓存且不放宽 resource authorization。
- [x] 5.2 增加 App shell/Plugin Page 回归，证明 production policy 保持 idle、`PluginPagePlaceholder` 仍渲染、`App.tsx` 不创建 iframe，Home/Search/Host Page、shared close、locale/theme、query/selection 与 focus restoration 行为不变。
- [x] 5.3 扩展 workspace boundary gate，证明 Contract、SDK、UI、Testkit、官方/示例/外部插件不能 import policy、lease、platform adapter、dependency patch 或 WebView harness internals，且本 change 不新增 public Runtime/session/API export。
- [x] 5.4 增加 dependency/license/drift 回归，固定 Tauri/Wry revision、允许的 macOS 补丁文件、callback contract 与 main-only initialization contract；上游升级、patch diff 或 macOS platform feature 变化必须显式失败并要求重新运行 WKWebView 门禁。

## 6. 文档与下游 change 对齐

- [x] 6.1 按 `docs/AGENTS.md` 更新 canonical English `docs/en/architecture/extension-platform.md`、`overview.md` 及相关 development/validation 文档，并同步相同路径的 `docs/zh` 镜像；说明 macOS frame-aware policy 与 main-only initialization 回归已交付、production 仍 idle、WKWebView 真实矩阵、依赖维护/回滚和 Resource Service 分工。
- [x] 6.2 更新文档中的当前能力清单与 `pnpm run check:frame-aware-webview-navigation-policy`，明确本 change 为 macOS-only、不宣称 Windows/Linux 支持，且未创建 iframe、未执行插件、未交付 Session/Host API/permissions/完整 CSP；README、AGENTS、Manifest schema 与 public package declarations 不承载具体设计。
- [x] 6.3 使用独立的 OpenSpec artifact update 将 `add-isolated-plugin-iframe-runtime` 的 proposal/design/spec/tasks 与 `plugin-roadmap.md` Task 4.2 依赖对齐到本 prerequisite，移除重复或已失效的 native navigation 假设但保留 `.lxp`、opaque-origin、ES Module、Tauri rejection 与 Runtime completion gate；不得勾选 Task 4.2 或宣称 iframe Runtime 已交付。

## 7. 最终验证

- [x] 7.1 运行 `pnpm run check:frame-aware-webview-navigation-policy`，修复所有 fixture/evidence、dependency drift、policy/WKWebView adapter、workspace boundary、Resource/Page 回归与 macOS gate warning/error，并重新运行至通过。
- [x] 7.2 顺序运行完整前端测试 `pnpm run test`，修复本 change 引入的所有失败与 warning，然后重新运行至通过。
- [x] 7.3 运行前端格式与静态检查 `pnpm run check`，修复所有 Biome、workspace boundary 和 member check 问题，然后重新运行至通过。
- [x] 7.4 运行前端类型检查 `pnpm run typecheck` 与生产构建 `pnpm run build`；即使产品 UI 未变化，也必须证明 dependency/harness/script 与 workspace 生命周期不破坏前端，并将两项重新运行至通过。
- [x] 7.5 运行 Rust 格式检查 `pnpm run src-tauri:format:check`；若需要格式化，运行 `pnpm run src-tauri:format` 后重新执行格式检查至通过。
- [x] 7.6 顺序运行完整 Rust 测试 `pnpm run src-tauri:test` 与静态检查 `pnpm run src-tauri:check`，修复 policy、platform adapter、依赖 patch 与既有 native boundary 的所有 error/warning，并重新运行两项至通过。
- [x] 7.7 运行 `openspec validate add-frame-aware-webview-navigation-policy --type change` 与 `openspec validate add-isolated-plugin-iframe-runtime --type change`，直接统计两份 `tasks.md` checkbox，并复核 proposal/design/spec/tasks、source/tests、英中文档、dependency revision 和 macOS WKWebView 真实 evidence 一致；缺失 macOS evidence、遗留 Windows/Linux 完成要求或未解决 Open Question 必须阻止完成声明。
- [x] 7.8 确认 `plugin-roadmap.md` Task 4.2 仍未勾选且明确依赖本 capability；随后重新运行 `pnpm run check`、focused gate 和两项 OpenSpec validate，确认 prerequisite apply-ready/完成状态与下游 blocked 状态没有被误报。
