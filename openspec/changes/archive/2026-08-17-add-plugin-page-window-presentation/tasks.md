## 1. Manifest `0.4.0` 与跨语言 Contract

- [x] 1.1 先为 TypeScript Contract 增加失败测试，覆盖 Manifest `0.4.0`、Page `presentation` 完整/缺省输入、`320×180` hard minimum、`4096×4096` declared maximum、fraction/null/missing/unknown/native field 拒绝、精确 JSON Pointer diagnostics，以及 `0.3.x` incompatible 且无 alias/fallback。
- [x] 1.2 更新 `packages/plugin-contract` JSON Schema、generated input、public/normalized types 和 deterministic normalization，使缺省 Page 固定规范化为 `650×600`、`resizable: false`，显式声明保留独立 Page 值且不产生 position/monitor/constraint/native authority。
- [x] 1.3 为 Rust Manifest mirror 增加与 TypeScript 同 corpus 的失败/成功测试，再实现 `0.4.0` strict deserialization、presentation normalization、hard-bound diagnostics 和旧协议 classification，确保 normalized JSON 与 diagnostic ordering 完全一致。
- [x] 1.4 将 normalized Page presentation 贯穿安装准备、Manager/Registration detail、replace/upgrade/rollback 和跨语言 fixtures；验证 host-owned source/lifecycle/state、有效 work area、user size 与 native error 不进入 author Manifest 或 Registration 持久 wire。
- [x] 1.5 将 canonical/invalid/normalized/compatibility fixtures 与 Contract pack/type tests 全部迁移到 `0.4.0`，加入多 Page 不同 presentation、缺省 presentation、malicious native field 和旧 `0.3.x` package corpus，并确认不保留双协议解析代码或测试。

## 2. Package、CLI、模板与 Development Mode 迁移

- [x] 2.1 更新 TypeScript/Rust `.lxp` validate/pack/inspect/install classification 使用 Manifest `0.4.0` 和 presentation normalization；证明包格式、checksum、canonical TAR/Zstandard profile 与重复 pack byte identity 不变，package facts 不含 monitor、effective clamp 或 user size。
- [x] 2.2 更新 `@lensx/plugin-cli` create/validate/build/pack/inspect、machine output、fixtures 和 isolated-consumer tests：新项目默认省略 presentation 并得到 fixed `650×600`，显式合法声明确定性输出，`0.3.x` 只给 bounded migration guidance 且不自动改写。
- [x] 2.3 迁移 framework-neutral、React/Semi 模板和所有维护 example Manifest 到 `0.4.0`；保留模板默认 fixed Page，并增加一个 public-only opt-in presentation 示例及无 Tauri/native resize API 的 source/bundle gate。
- [x] 2.4 迁移 Plugin Development Mode discovery、snapshot、reload、Registration 和 fixtures 到 `0.4.0`；验证开发 Page 与安装包共享 presentation/work-area/native coordinator，reload 创建 fresh attempt 并重置 initial size，失败 reload 保留当前 transient size。
- [x] 2.5 更新 official release、workspace boundaries、package consumer、documentation drift 和 no-dual-runtime/version scans，拒绝维护源或构建产物中的 current `0.3.x` authoring，同时避免把历史 archive/migration note 当成当前代码路径。

## 3. Page projection 与可信 App Shell presentation

- [x] 3.1 先为 Page Registry/projection 增加失败测试，覆盖 normalized presentation clone、provider/Page identity binding、多个 Page 独立值、缺省值、disabled/incompatible fail-closed，以及 Action/route/Runtime message 不能覆盖 presentation。
- [x] 3.2 扩展 PageDescriptor/PageResolution 与 plugin surface projection，使完整 validated presentation 从 Registration 单向进入 trusted App Shell；Host Page definitions 保持 Host-owned fixed policy，不复用 author presentation 类型作为 native authority。
- [x] 3.3 将 frontend surface model 从 `'home'|'search'|'page'` 改为 typed `home/search/host_page/plugin_page` target，并为 plugin target 绑定 Page identity、initial logical size 与 resizable；更新 serial resize queue 和 adapter validation，禁止裸/任意 width、height 或未知 variant。
- [x] 3.4 更新 App 派生和 surface sequencing tests，覆盖 Home `650×320`、Search `650×480`、Host Page `650×600` 全部不可调，fixed/custom/resizable plugin Page、A→B 不继承、关闭立即 Home、surface failure 不清除 App state，以及等价 activation 不重放 initial size。
- [x] 3.5 增加公共边界负向测试，证明 Plugin Contract 的 presentation 仅为 author metadata，Plugin SDK、Host API catalog、Runtime Context、bridge/RPC、Testkit fake 和 plugin bundle 都没有 `setSize`/`resize`/`setResizable`、position、monitor、constraints、maximize、fullscreen 或 native handle 能力。

## 4. Rust native Window surface coordinator

- [x] 4.1 先扩展 Rust fake Window/monitor 测试，覆盖 logical hard bounds、current work-area fit、default/fixed/resizable targets、safe setter order、user-resized snapshot、Home/Search/Host restore、A→B、unknown/unbound payload、每个 setter failure、rollback failure 和 safe serialized stages。
- [x] 4.2 重构 `launcher_surface` 为单一 Host-owned coordinator：解析完整 native `Window("main")`，维护仅内存的最后成功 presentation snapshot，临时禁用 resize、放宽 constraints、设置 size、安装目标 work-area constraints、最后应用目标 resizable，并在失败时恢复或 fail safe。
- [x] 4.3 调整 Tauri `main` Window 初始/全局配置，使应用仍以 `650×320`、`resizable: false` 启动，同时允许 coordinator 在 `320×180..4096×4096` hard envelope 内设置 logical size；保持 transparent、undecorated、always-on-top、non-fullscreen 和完整 native Window identity。
- [x] 4.4 实现 current monitor work-area resolution、initial-size fit 和 monitor/scale change reconstraint；验证尺寸适配不回写 Manifest、不暴露 absolute coordinates，并始终保留可达 Header/close 和 hard minimum。
- [x] 4.5 将 launcher show/hide/toggle、focus loss、`Cmd+W`、global shortcut、native dialog guard 和 Page close 与 coordinator 合成：same-attempt hide/restore 不重放 initial size，真实 close/disable/replacement/retry 立即恢复目标 fixed/non-resizable surface且不等待 Child destroy。
- [x] 4.6 扩展 source-contract 与 Rust integration tests，阻止 React 直接使用 native setters、post-creation 路径回退到单-WebviewWindow lookup、插件输入进入 monitor/constraints，以及任何 persistent size key、filesystem/preferences/browser/plugin-storage 写入。

## 5. Child WebView resize、竞态与真实 Runtime

- [x] 5.1 先扩展 PluginRuntimeSlot/slot-controller tests，覆盖 ResizeObserver 与 `window.resize` burst、latest-wins revision、scale factor、Page chrome/locale/theme、zero/invalid bounds、queued failure、unmount cleanup 和 replacement 后 stale update inertness。
- [x] 5.2 调整 slot update queue 以在不丢失最终 revision 的前提下安全合并中间 resize burst，并保持 physical-bounds floor/ceil、current attempt compare、failure teardown、listener/observer cleanup 和零 Runtime reload。
- [x] 5.3 扩展 Rust Child WebView presentation tests，证明 user resize、work-area clamp 和 scale change 只更新 current native sibling bounds，wrong window/attempt/out-of-window/stale revision fail closed，且插件消息永不成为 bounds 输入。
- [x] 5.4 增加 canonical fixed、resizable 和 multi-plugin Runtime E2E，覆盖初始 size、连续 resize、A→B、hide/restore same attempt/current size、actual close/reopen initial size、disable/replace/reload teardown 和零残留 authority。
- [x] 5.5 扩展真实 macOS multi-webview evidence，使用受控窗口边缘 resize 验证 logical/native/slot 几何、Retina 与至少一次 work-area/scale 变化、`Cmd+W`/focus-loss restore、异步 close 后 `650×320` non-resizable Home、reopen initial size；evidence 只记录 bounded size/boolean/count/revision/stage。

## 6. ConfigLens `800×600` dogfood 与两区布局

- [x] 6.1 将 ConfigLens Manifest、package fixtures、Contract/installation/release assertions 迁移到 `0.4.0`，为唯一 Page 声明 `800×600`、`resizable: true`，并证明它没有 official-only mapping、Host import、SDK/native resize method 或额外 authority。
- [x] 6.2 先更新 ConfigLens component/accessibility tests，要求 ready document 只有 Host 外部 Header 加插件内部 `content`/semantic `footer` 两区，单 Monaco 在 content 前并占满，language/status/Format/Compact 与 conditional bounded diagnostics 全在 footer，且无重复标题、Diff/Apply/preview。
- [x] 6.3 重构 `ConfigLensPage` 和 Less：使用 flex/min-height 两区布局、Monaco `100%` content、紧凑 footer 单行和 diagnostics 条件第二行；保留 Semi controls、英文/中文、light/dark、focus、live region、JSON-only Compact、single undo edit 和 Worker 生命周期。
- [x] 6.4 更新 Monaco layout/ResizeObserver tests，覆盖初始 `800×600`、Host hard-min、较大 user-resized、连续 resize、长中英文 footer、diagnostic overflow、theme/locale replacement，以及 resize 不重建 model/editor/Worker 或改变当前 input/language。
- [x] 6.5 更新 ConfigLens 视觉 harness/baselines：完整 28-state 主要矩阵迁移到 `800×600`，再增加 hard-min 与较大 viewport 的代表性 responsive cases；检查 computed geometry、content/footer order、无 overflow/clipping、Header 所有权和 light/dark/locale/focus 状态。
- [x] 6.6 更新 ConfigLens WKWebView/product evidence，证明 open `800×600` resizable、用户 resize 后编辑/format 正常、hide/restore 保留 attempt/model/Worker/current size、close 恢复 Home、reopen 回到 effective `800×600`，且无用户尺寸持久化或内容泄漏。

## 7. Canonical 文档与规格治理

- [x] 7.1 更新 `docs/en/architecture/overview.md`、Child WebView/extension architecture 和相关 developer references，说明 Manifest `0.4.0` Page presentation、logical/hard/work-area bounds、Host coordinator、user-only resize、surface state machine、same-attempt retention、actual-close reset 和无 native Runtime authority。
- [x] 7.2 更新 `docs/en/development/frontend-guidelines.md`、validation、plugin workspace/CLI/templates/Development Mode 与 ConfigLens 文档，给出 fixed/default/opt-in 示例、responsive/footer guidelines、错误/恢复顺序和第一版不持久化说明；不向 README 或 agent onboarding 写具体实现设计。
- [x] 7.3 对 `docs/zh` 相同相对路径应用语义一致的简体中文镜像，保持 English canonical、`ConfigLens` 品牌、代码/字段/协议名和 cross-links 对齐，并更新双语 index 仅在链接结构变化时修改。
- [x] 7.4 更新 documentation/roadmap/version drift gates，清除 stable specs 与 canonical docs 中把 `0.2.0`/`0.3.0` 描述为当前 Manifest 或把所有 Page 描述为固定 `650×600` 的陈旧表述；历史 archive/migration 记录继续保留为历史而不被当成当前能力。
- [x] 7.5 在同步/归档前把本 Change 的所有 delta requirement 重写为 canonical English，核对新 `plugin-page-window-presentation` stable capability 与九个 modified capability 的完整 requirement replacement，避免部分 MODIFIED block 丢失旧场景。

## 8. Final validation

- [x] 8.1 运行 `source ~/.zshrc; openspec validate add-plugin-page-window-presentation --type change --strict --no-interactive`，修复 proposal/design/specs/tasks 的全部错误，并确认 planning scope、non-goals、delta operations 与实现一致。
- [x] 8.2 运行 Contract、package、CLI、template、Development Mode、installation/Registration、no-dual-version、Page projection、Launcher surface、Child WebView slot/window lifecycle 和 ConfigLens focused gates；修复每个失败后重跑对应 gate 与完整 focused set。
- [x] 8.3 运行所有直接或间接启动 macOS browser 的 visual gates（ConfigLens、templates、Plugin UI/management 中受版本影响者）时，首次即使用获准的 headless/windowless 环境和全新临时 profile，绝不使用默认/现有浏览器 session；优雅关闭并清理 profile，只有 bounded timeout fallback 才强制终止，sandbox-only failure 按环境失败原命令重跑且不弱化/跳过证据。
- [x] 8.4 运行真实 macOS `main` Window/Child WebView resize、hide/restore、multi-plugin、close/reopen、work-area/scale 和 ConfigLens lifecycle evidence，审查 privacy/bounded fields，并仅通过维护的显式 update path 更新通过后的 committed evidence。
- [x] 8.5 运行前端/shared 完整测试 `pnpm run test`；修复全部失败并重跑完整命令。
- [x] 8.6 运行前端格式化与静态分析 `pnpm run check`；修复本 Change 引入的每个 warning/error 并重跑完整命令。
- [x] 8.7 运行前端类型检查与生产构建 `pnpm run typecheck` 和 `pnpm run build`；修复全部失败并重跑两个完整命令。
- [x] 8.8 运行 Rust 格式检查 `pnpm run src-tauri:format:check`；若失败，运行 `pnpm run src-tauri:format`、审查 diff 并重跑 format check。
- [x] 8.9 运行 Rust 完整测试与静态检查 `pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`；修复全部 warning/error 并重跑两个完整命令。
- [x] 8.10 在最后一次修复后重跑完整 focused、browser、真实 macOS、frontend/shared、Rust 和 strict OpenSpec validation set；运行 `git diff --check`，确认所有 task 均有证据、无用户尺寸持久化、无 `0.3.x` 当前协议/双路径、无 plugin native resize authority，再标记完成。
