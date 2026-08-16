## Why

ConfigLens 在当前 Plugin Development Mode 中从 Launcher 打开时会让 Host 的“正在加载插件界面”持续数秒，但现有 cold-open gate 仍可通过，因为它只校验已提交的汇总 JSON，不能从当前 product Runtime 重新采样。lensX 需要把真实、可复现的分段性能证据纳入完成标准，并缩短 Host Child WebView、资源交付和 ConfigLens bootstrap 的关键路径，使简单插件的打开体验稳定处于亚秒级。

## What Changes

- 让 target macOS evidence 通过当前 production Child WebView、Resource Service、bridge、SDK 和 ConfigLens candidate 自动产生 cold-open 与 same-attempt restore 样本，而不是仅校验手工或历史汇总；证据继续保持 content-free 和 Host-private-data-free。
- 为打开链路定义可执行预算：release-like cold open 的 Host loading-to-bridge-ready p95 不超过 250 ms、ConfigLens first-interactive p95 不超过 500 ms，same-attempt hide/restore p95 不超过 100 ms；Plugin Development Mode 同样记录分段数据并以 first-interactive p95 不超过 1000 ms 作为回归门槛。
- 优化 Host 的资源交付和 readiness 协调：允许 generation-bound、容量受限且在命中时仍进行 current source/attempt/generation 校验的 Host 内存 byte cache，并以单次可取消的 readiness 等待取代固定 25 ms 轮询。
- 将 ConfigLens 的 bridge/SDK bootstrap 与 React、Semi Design、完整 UI 和 Monaco 加载解耦；最小 bootstrap 尽早等待既有 native finished-load 边界并建立 Session，随后并行加载 UI 与 Monaco，且以真实编辑器可交互作为 first-interactive 完成点。
- 保持 current Child WebView 的 hide/restore 为同一 attempt，不重新 resolve、读取 bundle、bootstrap SDK 或重建 Monaco；真实 close/reopen 仍创建新 Runtime attempt。
- 修正受影响的 stable ConfigLens lifecycle/UI/performance requirements 中残留的 `iframe` 术语，只保留 Manifest `0.3.0` Child WebView Runtime。
- 更新英文架构/开发文档及其简体中文镜像，明确 cold、reopen、same-attempt restore、bridge-ready 与 first-interactive 的区别、预算和排障方法。

### Goals

- 把用户实际看到的数秒 Host loading 变成可复现、可归因、会阻止完成声明的失败。
- 在不放宽 Host/native authority、source binding、generation revocation 或 teardown 的前提下，让 ConfigLens 的 release-like cold open 稳定进入 500 ms p95 以内。
- 让性能证据由当前可执行路径生成，并能明确区分 Host、资源、bundle、SDK、editor 和 Worker 阶段。

### Non-goals

- 不引入隐藏 Runtime、预热池、后台 Page、第二个 current Child WebView，或在 close 后保留 Monaco/Worker/用户输入。
- 不通过浏览器持久缓存、放松 `no-store`、跳过路径/文件身份验证、复用 revoked generation，或降低 source/currentness 校验来换取性能。
- 不改变 ConfigLens 的单编辑器、显式语言选择、Format、JSON-only Compact、临时内容或 Worker 安全语义。
- 不为 ConfigLens 增加官方插件特权、私有 Host import、Tauri/native API 或替代 Runtime。
- 不承诺真正 cold create 在所有硬件上低于 100 ms；若未来需要这种体验，应作为保留/预热 Runtime 的独立架构 change 讨论。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `plugin-child-webview-runtime`: 收紧 cold open 与 same-attempt restore 预算，并要求 target macOS 从当前 product path 自动生成、分段且可复现的性能证据。
- `plugin-resource-service`: 允许并约束 generation-bound Host byte cache，使缓存命中保持 current source/attempt/generation 校验、容量限制和同步撤销语义。
- `official-config-lens-plugin`: 要求最小早期 SDK bootstrap、延迟加载完整 UI/Monaco、真实 first-interactive 测量和新的 release/development latency budgets，并清理遗留 iframe 术语。

## Impact

- **Host frontend**: Plugin Runtime slot/presentation readiness controller、stage clock、错误与诊断测试。
- **Rust/Tauri**: Child WebView presentation/service、Resource Service byte cache、currentness/revocation、target macOS evidence harness。
- **Public plugin packages**: 继续使用现有 `@lensx/plugin-sdk/webview` 语义；可能调整内部打包和 Testkit evidence hooks，但不新增 Host/native authority。
- **ConfigLens**: HTML/entry graph、SDK bootstrap、React/Semi UI 动态入口、Monaco/Worker readiness marker、bundle budgets 和 E2E/visual tests。
- **Validation and evidence**: 替换不可重放的 cold-open fixture 流程，增加 release-like 与 Plugin Development Mode 样本、privacy/schema/drift gates。
- **Documentation/specs**: 更新 Child WebView Runtime、ConfigLens 和 Resource Service requirements，以及 path-matched English/简体中文文档。
