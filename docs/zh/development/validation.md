# 验证

## 原则

维护中的验证是确定性的，仅支持四类工作：

1. Rstest 与 Cargo 单元、状态、策略和边界测试。
2. Biome、TypeScript、Rust 格式与静态检查。
3. Rsbuild、Cargo 与 workspace 生产构建。
4. pack、inspect、tarball、临时纯 CLI consumer 与确定性生成物检查。

仓库不再维护截图、像素、视觉基线、浏览器、真实 WebView、GUI 应用、原生交互或目标环境性能验证，也不存在可选、手动或兼容 Gate。

## 命令模型与稳定接口

完整本地验证使用标准 lifecycle：

```bash
pnpm run test
pnpm run typecheck
pnpm run check
pnpm run build
pnpm run src-tauri:format:check
pnpm run src-tauri:test
pnpm run src-tauri:check
pnpm run src-tauri:build
```

package lifecycle 语义不重叠：`typecheck` 只检查类型，`test` 只运行测试，`check` 只运行格式、lint、生成物漂移和源码策略，`build` 只构建。只有 build 后纯 Node 产物检查可以保留 `test:e2e`。

`gate` 是只读跨层 dispatcher。`generate` 仅用于可由源码重现的确定性产物，且必须提供一个 target 和 `--write`。

```bash
pnpm run gate -- --list
pnpm run generate -- --list
pnpm run generate -- plugin-manifest-types --write
```

不得为 Change、测试子集或 Gate 转发新增根 alias。

## 统一开发启动器验证

```bash
pnpm run gate -- development-launcher
```

`development-launcher` Gate 是只读的。fake server 与 child 覆盖首选/递增端口、mode 隔离、
内存 Tauri config、server-before-child 顺序、spawn/exit/signal 竞态、有界诊断与幂等 cleanup。
Rust 测试覆盖严格动态 App target、navigation/CSP 一致性、Resource Service owned policy，以及
不变的 production `tauri://localhost` profile。该 Gate 不会启动真实 Rsbuild listener、Tauri GUI、
浏览器、WebView、native harness、截图、视觉基线或目标环境性能进程。

## 本机浏览器自动化

浏览器自动化不属于维护中的验证。package lifecycle、Gate、Generate target 与 CI 都不得加入浏览器启动、preview server、截图、像素比较、真实 WebView、原生 harness 或 GUI 应用命令。

## macOS Accessory Launcher 验证

Launcher policy、菜单路由、焦点状态、快捷键、恢复和 Child WebView 协同由确定性 Rust 与前端测试覆盖。不存在打包应用或 Launch Services 验证入口。

## 启动器输入焦点验证

```bash
pnpm run gate -- launcher-input-focus
```

`launcher-input-focus` Gate 通过真实 Semi 组件的 Rstest 验证已提交查询、组合草稿、
输入法按键优先级、失效会话、语言/主题行为和输入可访问性。Cargo 测试覆盖原生
surface 状态、排队更新、回滚和 Host/Child 窗口生命周期。该 Gate 复用
`frame-aware-navigation-dependency-drift` 和
`plugin-child-webview-window-lifecycle`；后者通过 workspace 构建图在 UI consumer
之前构建公共 Contract。缺少的 package 构建输出会被准备，不使用源码 alias，也不重建
根 `node_modules`。

依赖 Gate 使用 `rustc --test` 编译并运行私有 Tao resizable 和文件拖放策略，以两空格
格式检查所有受审 Tao Rust 文件，并在 macOS 上严格编译 Tao。Resizable 测试使用
不与 AppKit 交互的假 responder，验证状态及调用边界，不证明真实输入法候选框行为。
聚焦 Gate 成功仍需辅以完整 lifecycle 和 CI 验证。

该 Gate 只读已审阅的 vendored 完整性基线。来源更新需先审阅，再显式执行 Generate：

```bash
pnpm run generate -- frame-aware-navigation-dependency-drift --write
```

registry validation 会在执行前拒绝 committed-write 和禁止的环境步骤。Gate 准备只写入
被忽略的构建输出，不重新生成已提交基线，也不启动原生交互。

## Vendored Tao 诊断维护

```bash
pnpm run gate -- frame-aware-navigation-dependency-drift
```

该 Gate 将固定版本、受审补丁路径和所有 vendored 文件哈希与已提交的完整性基线比较。
它还比较应用依赖图与单独选中的 Tao 包所解析出的路径、版本和 feature 集合，再运行
以下仅适用于 Darwin 的严格编译：

```bash
cargo rustc --locked --manifest-path src-tauri/Cargo.toml -p tao --lib -- -D warnings
```

只有选中的 Tao 目标接收 `-D warnings`。依赖图数据缺失或路径、版本、feature 不一致时
Gate 失败。普通 Cargo check/build 仍覆盖完整应用依赖图。非 macOS 宿主无法完成其必需
的 Darwin 步骤；可移植策略测试和 vendor 格式检查不证明 Windows、Linux 或 BSD 编译。

两个生产策略模块都在忽略的构建目录中编译、运行，并在成功和失败时清理输出。格式检查
覆盖所有受审 Tao Rust 文件，包括已有 resizable 策略和文件拖放 helper；仅运行应用
workspace 格式检查无法覆盖此 vendored crate。Gate 永不更新基线；先审阅源码 diff，
再显式执行上文的 Generate 命令，无需新增根脚本。

Tao 保持固定为 `0.35.3`。诊断维护删除未使用的 macOS 实现残留和旧别名，同时保留
公共 badge 扩展、Windows/Linux/BSD 的 `hit_test` 消费者及 resizable responder 策略。
`PlatformIcon` 仍验证并存储 RGBA 载荷，保留 Debug/Clone 派生行为。由于 macOS
不读取像素，其保留字段附有一处说明理由的 `allow(dead_code)`。这是唯一新增的 lint
例外，无关的上游既有例外继续保留。不得增加宽泛的警告屏蔽或全局 Cargo lint 参数。

macOS 文件拖放注册文件 URL，并以仅允许文件 URL 的选项读取 NSURL 对象。Enter、
Prepare 和 Drop 分别读取当前 payload，通过受检查的对象转换及 `to_file_path`，
将有序可选路径交给同一个私有 `file_drop.rs` 策略。失败候选被跳过；零有效文件时
拒绝操作且不发文件事件。有效文件逐个按顺序发出 Hover/Drop，Prepare 不发事件，
每次 Exit 发出一个 Cancel。`draggingEntered:` 返回 NSDragOperation，
Prepare/Perform 保留 BOOL。

纯 Rust 策略测试覆盖过滤、顺序、拒绝、阶段事件，以及已解析中文/空格/百分号路径的
保留。这些测试不执行 NSURL 解码、Finder 格式匹配或 AppKit 回调派发。源级接线检查和
macOS 编译补充策略测试；仓库不维护原生交互验证入口。

## 前端验证

使用 `pnpm run test`、`pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`。根 Rstest discovery 负责仓库内断言；lifecycle aggregator 按依赖顺序恰好覆盖一次根应用与每个直接 workspace member。

## Plugin Contract 验证

```bash
pnpm run gate -- plugin-contract
```

该 Gate 检查 Schema、生成物漂移、类型、测试、打包和 workspace 边界。

## Plugin Package Format 验证

```bash
pnpm run gate -- plugin-package-format
```

该 Gate 使用确定性的 TypeScript 与 Rust 格式检查，以及 package fixtures。

## Plugin Developer CLI 验证

```bash
pnpm run gate -- plugin-developer-cli
```

CLI consumer 与兼容 fixture 覆盖维护中的 6.5 和 8.1 行为，不启动产品环境。

## 持续集成验证

仓库恰好维护两个只读 macOS workflow：

- LensX CI 调用 `ci-lensx-frontend` 与 `ci-lensx-rust` Gate；完整本地入口为
  `pnpm run gate -- ci-lensx`。
- Plugins CI 调用 `pnpm run gate -- ci-plugins`。

本地使用相同命令复现。workflow 不发布、上传、签名、公证或更新生成物。

`ci-lensx-frontend` 负责 clean-checkout workspace preparation：它推导公共 package 的
传递构建闭包，在 consumer 前按拓扑顺序构建依赖，并对 frontend 阶段间完全相同的 step
去重；其中 Contract 必须早于 CLI 构建。验证不得依赖残留 `dist`、workflow-only
preparation、源码 alias 或递归 package build；阶段专用环境语义会让其他方面相似的 step
保持独立。

## 插件开发模式验证

```bash
pnpm run gate -- plugin-development-mode
pnpm run gate -- plugin-development-smoke-reload
```

确定性 Rust、TypeScript、React、package 和源码策略测试覆盖目录安全、不可变快照、原子 reload、production exclusion、generation revocation、UI 状态与清理。

## Plugin Resource Service 验证

```bash
pnpm run gate -- plugin-resource-service
```

## 隔离 Plugin Runtime Origin 验证

```bash
pnpm run gate -- isolated-plugin-runtime-origin
```

## macOS Frame-Aware WebView Navigation 验证

```bash
pnpm run gate -- frame-aware-webview-navigation-policy
```

该 Gate 通过确定性测试验证分类、allowlist、pre-commit policy、popup/download 拒绝、依赖固定和 Host bootstrap 隔离。

## 隔离 Plugin Child WebView Runtime 验证

```bash
pnpm run gate -- plugin-child-webview-runtime
```

这是确定性的 contract 与 lifecycle 验证，不能描述为原生隔离或真实 WebView 行为证明。

## Plugin Child WebView Session 验证

```bash
pnpm run gate -- plugin-child-webview-session
```

## Plugin SDK Transport 验证

```bash
pnpm run gate -- plugin-sdk-transport
```

该 Gate 在不启动浏览器的前提下检查 public exports、private codec、adapter 行为、lifecycle、tarball consumer 与 deep-import 拒绝。

## Plugin RPC 验证

```bash
pnpm run gate -- plugin-rpc-validation
```

## Plugin Host API Dispatcher 验证

```bash
pnpm run gate -- plugin-host-api-dispatcher
```

## Open Isolated Plugin Runtime 验证

```bash
pnpm run gate -- open-isolated-plugin-runtime
```

## ConfigLens 官方插件验证

运行 ConfigLens 的标准 package lifecycle。其 build 后纯 Node 检查约束初始 256 KiB JavaScript、64 KiB CSS、bootstrap 顺序、单一 SDK client、Monaco single-flight、Worker 闭包、package 边界和自包含输出。

## Plugin Scoped Storage 验证

```bash
pnpm run gate -- plugin-scoped-storage
```

## Plugin Management Settings 验证

```bash
pnpm run gate -- plugin-management-settings
```

组件和 service 测试覆盖 locale、theme、keyboard、focus recovery、loading/error 状态、破坏性确认、revision 竞态与 Host 私有组合。

## Open-Web Trust Confirmation 验证

使用 `pnpm run gate -- open-isolated-plugin-runtime`。确定性检查建立公共 capability 与 Host 边界不变量，不证明真实环境执行。

## Rust 验证

```bash
pnpm run src-tauri:format:check
pnpm run src-tauri:test
pnpm run src-tauri:check
pnpm run src-tauri:build
```

## 文档验证

`docs/en` 下英文文档是 canonical；保持相同路径的 `docs/zh` 语义一致，并保证 Gate 与 Generate identifier 可解析。

## 范围规则

- 确定性仓库断言使用 Rstest。
- 跨层确定性编排使用稳定 capability Gate。
- Generate 只处理可重现的源码派生产物，并要求显式写授权。
- 不得通过其他脚本、workflow、隐藏 flag 或手动 Gate 恢复已删除的环境验证。

## 最终检查清单

1. 在 clean-checkout 等价 workspace 运行两个 CI Gate。
2. 运行前端与 workspace 的 test、typecheck、check 和 build。
3. 运行 Rust format check、test、check 和 build。
4. 运行保留的 pack、inspect、tarball 与 CLI consumer Gate。
5. 严格验证 active OpenSpec Change 与全部 stable specs。
6. 运行 active-source stale scan 与 `git diff --check`。
