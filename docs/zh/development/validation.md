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

依赖 Gate 使用 `rustc --test` 编译并运行私有 Tao resizable、文件拖放和命令 responder
策略，以两空格格式检查所有受审 Tao Rust 文件，并在 macOS 上严格编译 Tao。Fake
adapter 不与 AppKit 交互，只验证状态、归属和调用边界，不证明真实输入法候选框行为
或实际编辑交付。
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

三个生产策略模块都在忽略的构建目录中编译、运行，并在成功和失败时清理输出。格式检查
覆盖所有受审 Tao Rust 文件，包括 `resizable.rs`、`file_drop.rs`、`responder.rs` 和
`view.rs` 原生 adapter；仅运行应用 workspace 格式检查无法覆盖此 vendored crate。Gate 永不更新基线；先审阅源码 diff，
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

## Vendored Wry 编辑快捷键验证

同一个 `frame-aware-navigation-dependency-drift` Gate 通过各自私有 runner 编译并运行
生产 Wry `key_equivalent.rs` 与 Tao `responder.rs` 策略。成功、编译或测试失败、启动
失败、信号结束后，均清理唯一的忽略输出目录。Gate 使用两空格 rustfmt 检查受审 Tao
文件以及 Wry class 模块、原生 adapter 和策略。应用 Cargo formatter 不负责 vendor
格式。这些步骤不写完整性基线，不增加根脚本、权限、依赖升级或环境验证入口。

Wry fake adapter 覆盖原事件身份和修饰键、每次原生回调一次 superclass 调用、两类
同步返回值、非 Child 委托，以及 attachment、可见性、key-window 和 first-responder
归属 guard。同步 BOOL 可能表示 Web 处理仍 pending，测试不会将其当作最终消费结果。
Tao fake adapter 调用真实生产策略，验证原 selector 传播、所有焦点 guard、连续焦点
变化，以及 Tao 自身 raw-input 焦点行为保留。Host Cargo 测试覆盖前台 W/Q monitor
和原生生命周期组合。Rstest 检查 Objective-C 接线、公开边界、runner cleanup 和只读
registry metadata；Cargo check/build 编译真实 adapter。

`launcher-input-focus` Gate 在既有 Rstest step 中包含
`tests/launcher-input-focus-ui.test.tsx` 与 `tests/ordinary-plugin-editing-ui.test.ts`，
两者仍属于根 `tests/**/*.test.{ts,tsx}` discovery。外部 fixture 仅包含测试自有的
`input`、`textarea` 和 `contenteditable` 控件，不安装到产品 Host，也不要求 SDK 或
Manifest 改动。可取消的 DOM 事件进入真实 handler 后，显式纯文本默认原语再建模
选择、剪贴板数据、编辑和历史。用例覆盖取消、只读／禁用和空状态、组合输入、焦点变化，
以及英文／中文与明／暗主题，不替代原生焦点或 Child generation 策略测试。

ConfigLens 测试使用真实 Monaco 正文 clipboard handler 和独立预置的 `DataTransfer`
输入，检查选区输出、内容、callback 及 Undo/Redo。Find 仍使用真实查询控件；Happy DOM
缺失的文本默认动作和历史被显式建模，其撤销归属与正文分开检查。这些用例通过既有
plugin/workspace lifecycle 和 `ci-plugins` 运行，不增加根 alias。编辑器特有覆盖见
[ConfigLens 指南](config-lens.md)。

| 证据 | 能证明 | 不能证明 |
| --- | --- | --- |
| 生产 Rust 策略与 Host 组合 | 原生归属 guard、原事件／selector、调用次数、保留命令和 raw-input 行为保留 | 真实 AppKit 回调顺序或 WebKit 完成 |
| 原生接线与 Cargo 检查／构建 | 生产 adapter 与固定依赖路径一起编译 | OS 编辑成功或系统剪贴板交付 |
| Host／外部 Rstest 与 Monaco handler 测试 | 真实 handler 配合已声明 DOM 默认模型，验证剪贴板数据、选区／内容变化、焦点与撤销归属 | 浏览器原生默认行为、真实系统剪贴板访问或全部平台场景 |
| 临时 macOS 调查与用户反馈 | 实际构建中的未处理命令传播、WebKit 回流、既有菜单 action 单次执行，以及移除调试器后用户报告的快捷键恢复 | 完整按键／控件矩阵、全部输入法或其他平台 |

修正只恢复 Tao 命令传播，不增加菜单派发、`keyDown` 回退、pending 状态、队列、
保留目标或 WebKit 完成 hook。最终 Web 取消行为和合法回流仍由 WebKit 所有。
运行观察与确定性结果须分别记录；临时调查不是维护中的命令、Gate、GUI harness 或 CI 步骤。

使用既有 `plugin-child-webview-runtime`、`plugin-child-webview-window-lifecycle`、
`launcher-input-focus` 和 `frame-aware-webview-navigation-policy` Gate 执行生命周期
与路由回归。显式生成基线前，应对照固定的同版本 release（`tao 0.35.3`、`wry 0.55.1`）
审阅实际变动的 vendor 源码。Host 原生交付和插件业务命令各自承担发布责任；既有合规
外部插件无需重打包或增加剪贴板权限即可获得 Host 修正。

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

## 受控 Host HTTP 验证

`pnpm run gate -- plugin-host-http` 覆盖公共 Contract/SDK、原生 source-bound
接纳、假 DNS/transport 策略、取消、期限、限制与 Translation 集成。检查覆盖成功与 HTTP
错误结果，不访问真实服务，也不启动浏览器、WebView、GUI 或原生交互 harness。
详见 [Host API 参考](../plugin-development/host-api.md#httprequest)。

## 翻译官方插件验证

翻译使用相同的插件/工作区 lifecycle 和 `ci-plugins` Gate。受控 SDK 存储、clock、
HTTP 响应、固定签名向量和真实 Semi 控件覆盖配置确认、文本/IME 调度、旧结果、错误、
语言/主题、焦点及销毁。纯 Node 构建后检查通过公共 CLI 校验、两次打包并检查自包含产物。
私有模块清单留在插件包之外。这些检查不调用真实翻译服务，也不证明 WebView 网络可用性、
原生 IME 行为或 OS 剪贴板投递。命令与证据边界见[翻译维护者指南](translation.md)。

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

## 可配置快捷键验证

运行 `pnpm run gate -- launcher-shortcuts`。此稳定 Gate 组合快捷键策略/typed adapter、真实
Semi 设置测试、Rust 事务/注册、录制与手势测试，并复用 `launcher-input-focus`、
`plugin-action-projection`、`plugin-child-webview-session`、`plugin-child-webview-continuity`、
`plugin-sdk-transport` 和 `plugin-host-api-contract` Gates。共享策略 fixtures 覆盖规范化别名、
保留键与去重（含不可用目标）。虚拟时间与 fake 原生/存储 adapter 覆盖完整双击、多击取消、部分
失败、不确定提交、补偿、恢复降级和 lease 到期。Session/SDK 测试覆盖 32 项初始准入、64 项初始化
合并、重试/终止边界和可选回调异常隔离。

这些确定性检查验证配置与生效状态的区别、独立偏好持久化、原生适配器接线和有界语义交付；不证明
macOS 授权对话框、OS 键盘交付、真实系统安全输入切换，或与所有外部快捷键工具的冲突情况。
双击是被动且非独占的。仅通过 Generate 的 `plugin-host-api-types --write` 更新当前 Schema
派生文件，保留历史 WebView corpus。定向 Gate 不替代完整 workspace 与 Rust 验证。

快捷键矩阵同时覆盖 v2 单入口类型切换、v1 单组合键无损读取、旧双入口待选择迁移与明确保存、唯一
双击权限失效后的窗口显示，以及不存在隐藏组合键回退。真实 Semi 行式测试覆盖新增草稿、Action
原子改绑、已保存/草稿删除、行内编辑、Escape、焦点与迟到响应，并覆盖两种语言和主题。上述仍为
确定性测试，不代表原生输入验收。
