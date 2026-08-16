## Context

当前根脚本直接执行 `LENSX_PLUGIN_DEVELOPMENT_MODE=1 tauri dev --features plugin-development-mode`。该组合只让前端 development composition 和原生 Tauri commands 进入构建；`PluginDevelopmentModeState` 仍以 `enabled=false` 初始化，唯一的初始注册入口还会打开 Host-owned folder picker。前端启动时并行初始化 Registration surface projection 与 development capability，之后由设置页操作 service。插件 Page 只有在用户执行 Launcher Action 后才进入现有 production Child WebView 路径。

仓库 workspace 当前把产品插件放在 `plugins/official/*`，而示例已经独立位于 `examples/plugins/*`。官方发布发现器、Changeset path planner、CODEOWNERS、GitHub workflows、workspace boundary checker、ConfigLens harness、lockfile、稳定规范和双语文档都把 `plugins/official/<slug>` 当作维护契约。运行时并不因该路径授予插件权限；从官方 GitHub Release 下载的 `.lxp` 仍走普通 external installation。

本变更需要同时修改开发启动的 process-local authority 和仓库路径契约，但不能让前端路径、作者目录、官方来源或启动便利性成为新的 Host 权限来源。

## Goals / Non-Goals

**Goals:**

- 让专用 `pnpm run dev:plugin-development-mode` 成为清晰的当前进程 opt-in，使原生状态和设置 Switch 在首次可见时已经开启。
- 默认从 `plugins/*/dist` 发现已构建插件，并允许用一个可选 `--plugins-root <path>` 覆盖根目录。
- 在任何 Registration 提交前验证候选并预检全局插件 ID；非 ID 候选错误跳过并汇总，ID 冲突阻断整个 bootstrap。
- 复用现有 Host directory inspection、不可变 snapshot、Plugin Manager、Resource、Registration 和 production Child WebView 边界。
- 把官方插件目录扁平化为 `plugins/*`，同时完整迁移 workspace、发布、所有权、CI、文档和验证契约。

**Non-Goals:**

- 不自动打开 Launcher Action、插件 Page 或 Child WebView，也不增加 `--open`。
- 不持久化 development mode、作者目录 capability、snapshot 或 development registration。
- 不自动构建、安装、watch、HMR、自动 reload 或无限重试。
- 不让 development registration 遮蔽、替换或升级同 ID 的 builtin、external、quarantine 或其他 development entry。
- 不改变 Manifest、Registration、Host API、Session、RPC、Resource、CSP、网络、Worker 或 teardown 权限边界。
- 不根据 `plugins/*` 路径、Publisher、release sidecar 或官方命名建立 Host trust、签名或额外 native authority。
- 不改写归档 OpenSpec 工件中的历史路径。

## Decisions

### 1. 使用专用 Node 包装器形成唯一的人类命令入口

`dev:plugin-development-mode` 改为调用仓库脚本。脚本只使用 Node 内置模块解析可选的 `--plugins-root <path>`，默认值为仓库根下的 `plugins/`，将其规范化为绝对路径，并以现有 frontend build flag、Rust feature 和内部 startup-root 环境启动 Tauri。包装器隐藏 Tauri runner/application 的多层 `--` 语法，不引入运行时依赖或新的普通开发命令行为。

内部环境只被 feature-gated Rust bootstrap 读取，不进入 Rsbuild define、前端 bundle、Tauri command payload、Registration event 或插件 Runtime。直接构建 feature 但没有 startup-root 的测试/工具进程仍以关闭状态开始，便于保留独立的手动 opt-in 覆盖。

替代方案包括持久化设置、让前端启动后调用 `setMode`、让前端提交目录路径，以及直接把复杂参数附加到 Tauri CLI。它们分别会错误恢复 authority、产生 UI 初始化竞态、扩大路径边界或暴露不友好的命令语法，因此不采用。

### 2. 原生 bootstrap 在前端装载前一次性启用并注册

Tauri setup 先建立 Plugin Manager、development snapshot store、installer/resource/storage/lifecycle services，再执行一次 feature-gated development bootstrap，最后建立 Launcher lifecycle。bootstrap config 存在即代表本进程的显式 opt-in；`PluginDevelopmentModeState.enabled` 在前端 capability 读取前成为 `true`。

bootstrap 只运行一次。用户随后在设置中关闭模式时，现有 quiesce 流程移除所有 development entries 并把状态置为关闭；本进程不会因为环境仍存在而再次开启。下一次执行专用 pnpm 命令会创建新的进程、新的 opt-in 和新的 registrations，但绝不恢复上一个进程的 Manager、snapshot 或 Runtime 状态。

前端继续通过现有 capability contract 初始化 Switch，并通过现有 Registration snapshot 投影 Page/Action。因为 bootstrap 不产生导航意图，App navigation service、Launcher dispatcher 和 Runtime slot 无需新分支。

### 3. Host 只发现根目录的直接插件成员及其 `dist/`

Rust 将 startup root 视为开发者通过专用命令授予的受限发现 capability，只枚举其非隐藏直接子目录，并只把 `<member>/dist` 作为候选。它不递归搜索更深目录，不读取项目 `package.json`，不执行脚本，也不把 project root 当成可运行 payload。缺少 `dist/` 的成员是“尚未构建”，不会形成候选或错误。

候选按可移植的成员标签排序。终端 summary 可以报告成员标签、稳定错误码以及 loaded/skipped 数量，但前端、events、Registration Contract 和插件 Runtime 仍不能接收绝对 root、source directory、snapshot path、文件内容或原生错误。

只在 wrapper 中发现路径会让 wrapper validation 被误当成 authority；递归扫描仓库会扩大读取范围；固定只支持 ConfigLens 则无法扩展到后续官方插件。因此由 Rust 在一个显式 root 下执行一级发现，并继续以 Host validation 为唯一 authority。

### 4. 候选采用 prepare、ID preflight、commit 三阶段

bootstrap 对排序后的候选执行三阶段协调：

1. **Prepare**：使用现有 directory inspection 和 snapshot publication 生成 Host-owned、完整验证的未提交候选。`invalid`、`incompatible`、`source_changed`、不安全文件和单候选读取失败会清理该候选并记录稳定 skipped diagnostic。
2. **ID preflight**：从已验证 Manifest 收集 ID，与同批候选及 Plugin Manager 当前 builtin、external、quarantine、development identities 做全局唯一性检查。任何重复都清理全部未提交候选并以 conflict 终止 Tauri setup；不允许 shadow 或“最后一个获胜”。
3. **Commit**：仅在 preflight 全部通过后按确定顺序调用 development registration。若 Manager/snapshot 基础设施在 commit 期间出现非候选级系统错误，bootstrap 回滚本批已经提交的 development entries、清理本批 snapshots 并让应用启动失败，避免 UI 显示不可用的已开启模式。

“只有 ID 冲突阻断”限定于可归因到单个插件内容的批量策略。Host cache、Plugin Manager 或注册协调器无法初始化不属于候选失败，必须作为真实系统错误处理。root 缺失、不可读、为空或没有有效候选时，应用仍以 mode enabled 启动并输出空/跳过 summary，用户可继续使用现有 native picker。

直接逐个 register 会在后续 ID 冲突前暴露部分 registrations；只读取 Manifest 做预检又不能证明 Manifest 与将执行的 snapshot 相同。三阶段设计让 ID 结论绑定到验证后的 snapshot，并保持 bootstrap 对 UI 原子可见。

### 5. 手动开发操作和 Runtime 语义保持不变

现有 native picker 仍一次选择一个 self-contained `dist/`；register、reload、remove、disable 继续使用 revision-bound contract。bootstrap registrations 保存相同 Host-held source-directory capability，因此后续手动 Reload 仍从原 author `dist/` 创建新 snapshot，并在成功提交后推进 generation、终止旧 Child WebView attempt。

bootstrap 只注册 `Runtime=inactive`。用户必须从 Launcher 执行 Action 才会打开 Page；多个插件不会被同时打开或自动选择。开发来源继续显示 Development、Unpacked、Unsigned，并且不产生 installation、permission、grant 或 official trust。

### 6. `plugins/*` 成为唯一的产品官方插件成员区域

把 `plugins/official/config-lens` 通过版本控制 rename 为 `plugins/config-lens`，把 workspace pattern 改为 `plugins/*`。官方发布 contract 从 `plugins/` 的非隐藏直接子目录发现 release units；CODEOWNERS 使用 `/plugins/<slug>/`；workflow path filters、Changeset path planner、candidate/dry-run、workspace lifecycle、boundary fixtures、ConfigLens WKWebView harness 和 lockfile importer key 同步迁移。

`plugins/` 不再容纳非官方、fixture 或示例成员：示例继续位于 `examples/plugins/*`，发布 fixture 继续位于临时测试根且不得成为产品成员。boundary checker 把所有 `plugins/*` 直接成员分类为 `official-plugin`，禁止它们导入 Host、Tauri、workspace deep path 或另一个插件源码，也禁止 Host 直接导入这些成员。

“official”仍是发布维护分类，而非 Runtime authority。发布资产通过普通 installer 后仍得到 external installation source；本 change 不新增内置官方注册或 privileged official Runtime。

### 7. 文档和 UI 只描述真实的启动生命周期

canonical English 与对应 Simplified Chinese 文档将说明：专用命令每次启动形成新的 process-local opt-in，Switch 初始为开启，普通/生产启动不启用，手动关闭只影响当前进程，bootstrap 不自动打开 Page。设置卡片中“重启后再次关闭”的绝对表述改为能区分专用开发启动与其他启动方式的双语文案，并继续使用现有 Semi Design、主题和可访问 Switch 结构。

路径文档、索引说明、release commands 和 ConfigLens 文档全部迁移到 `plugins/<slug>`。归档 change 保持不可变，只更新稳定规范、当前文档、源码、测试和生成/锁定文件。

## Risks / Trade-offs

- [跳过无效候选可能被忽略] → 终端输出确定性的逐成员稳定错误码及 loaded/skipped 汇总；Settings 仍提供手动注册和详细反馈。
- [默认 root 中存在同 ID 的已安装插件会阻断启动] → 保留明确 conflict，不自动卸载、遮蔽或替换；开发者先处理现有 identity。
- [prepare 后 author 目录继续变化] → 执行的是已发布 snapshot；后续变化只有显式 Reload 才进入新 generation。
- [批量 commit 中发生系统错误] → 跟踪本批 entry/snapshot 并回滚后终止 setup，不向前端暴露部分 bootstrap。
- [扁平化路径会触及发布与 CI 大量规则] → 以 `git mv` 保留历史，集中更新 typed path helpers 和 fixtures，运行 workspace、official release、ConfigLens 与完整根验证。
- [`plugins/` 未来需要容纳非官方插件] → 当前契约明确所有直接成员均为官方产品插件；若分类需求变化，另起 change 引入显式 metadata，而不是恢复隐含多层路径。
- [环境 transport 被意外打包到前端] → Rsbuild 只 define 现有布尔 build capability；新增 root 环境不得加入 source define 或可序列化前端配置，并由 boundary tests 检查。

## Migration Plan

1. 先迁移 ConfigLens 目录、workspace pattern、lockfile key、typed lifecycle/boundary classification、harness 路径和对应 fixtures，使根 workspace 在新布局下可安装和验证。
2. 迁移 official release discovery、CODEOWNERS、workflow filters、Changeset planner、candidate/dry-run、documentation gate 与稳定路径断言，证明 `plugins/<slug>` 的独立 release 行为未改变。
3. 增加开发启动 wrapper、feature-gated startup config 和原生 prepare/preflight/commit bootstrap，并保持现有手动命令 contract。
4. 更新 development service/UI 测试、双语设置文案、开发模式文档、workspace/release/ConfigLens 文档及其镜像。
5. 运行 focused、边界、production exclusion、真实 Child WebView、完整 frontend/Rust 和严格 OpenSpec 验证；仅在所有证据通过后同步 stable specs 和归档。

回滚时先恢复旧开发启动脚本和默认关闭语义，再将 ConfigLens 与 workspace/release path helpers 统一迁回 `plugins/official/config-lens`，重新生成 lockfile 并运行相同 focused gates。不能只回滚目录而保留新发布发现规则，也不能只回滚规则而留下新目录。

## Open Questions

无。默认 root、参数范围、无自动打开、候选跳过策略、ID 冲突行为和官方目录扁平化均已由本 change 固定。
