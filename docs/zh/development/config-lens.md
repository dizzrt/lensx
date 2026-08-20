# ConfigLens 官方插件

## 产品与边界

`plugins/config-lens` 是官方插件 workspace 的首个真实产品成员。
package 为 `@lensx/official-config-lens`，plugin ID 为
`dev.lensx.config-lens`，本地化产品名始终为 `ConfigLens`。它只贡献一个
`main` Page 和一个 `open` Action，并与外部插件使用相同的公共 Contract、
SDK、UI、Testkit、CLI、本地安装、隔离 Runtime 和 Host API 边界。仓库归属
和 CI 证据不会赋予信任、权限、持久化、剪贴板或原生能力。

ConfigLens 是支持 JSON、YAML 1.2、TOML 1.0 和 XML 1.0 的临时配置工作台。
输入只保留在当前 Page generation。隐藏和恢复 Launcher 不会关闭该 Page：
activation 会刷新当前插件事实；只要相关执行身份仍然有效，就保留同一 Child WebView、
Runtime Session、model、Worker 和内存输入。这种连续性不使用浏览器或 Host
持久化。只有真正关闭、禁用、替换、重新加载、卸载或以其他方式 teardown Page
时，输入才会丢弃。Page 只包含一个可编辑 Monaco model；四种语言的格式化会直接
替换其中内容，Compact 仅支持 JSON。每次成功操作都是一次可撤销的编辑器 edit，
失败时保持当前内容，语言始终由用户显式选择。Host Page chrome 提供可见的 ConfigLens 身份，因此插件 document
工作区不重复主标题或副标题。可编辑 Monaco 表面位于最前，随后是显式语言选择器以及
Format 和 Compact 控件。插件不执行 fetch、WebSocket、浏览器存储、剪贴板、Host
持久化或内容日志。

## 已审查的 Runtime 依赖

Runtime 依赖固定为准确版本，任何变更都必须重新审查。

| 依赖 | 版本 | 许可证 | 用途与审查结果 |
| --- | --- | --- | --- |
| `monaco-editor` | `0.56.0` | MIT | 持续维护的浏览器 ESM 编辑器，已在 Node 24 工具链和 WKWebView 中验证。只生成包内 module Worker 与 chunk，不使用 CDN、运行时解析、source map 或 `eval`。 |
| `yaml` | `2.9.0` | ISC | 持续维护的浏览器导出与 YAML 1.2 document/CST 支持。不解析远程 tag 或资源，并限制 alias、深度、文档数和诊断数。 |
| `toml-eslint-parser` | `1.0.3` | MIT | 支持显式 TOML 1.0 模式和 Node 24 的 ESM parser。没有运行时 fetch、`eval` 或 WASM 路径，并只在 language Worker 内运行。 |
| `saxes` | `6.0.0` | ISC | 兼容浏览器的严格 XML 1.0 流式 parser。ConfigLens 在解析前拒绝 DOCTYPE、entity、XInclude、SYSTEM 和 PUBLIC，因此不存在外部实体解析路径。 |

审查覆盖 registry 元数据和发布 tarball 的准确版本、许可证、维护时间、
浏览器/ESM 或可打包入口、Node 24 authoring 兼容性、CSP 敏感动态代码、
网络原语、内嵌 WASM 和意外安装脚本。`@taplo/lib@0.5.0` 因约 35 MiB 的
内嵌 WASM/runtime 路径超出产品预算，且带来 fetch、WebAssembly 和动态
代码复杂性而被拒绝。`smol-toml@1.7.1` 因目标是 TOML 1.1，且无法满足
所需的 TOML 1.0 数字、日期与词法保真合同而被拒绝。

## 限制、Chunk 与证据

HTML entry 是最小 bootstrap。它会在加载 React、React DOM、Semi Design、Plugin UI、Monaco 或
language adapter 前创建唯一 public WebView transport 与 SDK client。Runtime Context 未知时，正常启动
保持视觉空白且只暴露 accessible busy semantics；只有启动失败后才显示可聚焦 retry control。Context 到达后，
mount bundle 与 single-flight Monaco loader 并行启动，并把已连接 client 与已校验 Context 注入 mount，
因此不会创建第二个 client、Session 或 bridge。retry 会先 dispose 旧 attempt，再启动 fresh client。

主线程在派发前执行 2 MiB UTF-8 与 100,000 行输入限制。语言处理在可替换
的 module Worker 内执行，deadline 为五秒，最多返回 200 条安全诊断。
Monaco 使用独立的包内 editor Worker。language Worker 动态导入 JSON、
YAML、TOML 和 XML adapter，而所有生成资源都保留在自包含 `dist/` 和
canonical `.lxp` 中。

initial HTML graph 使用更严格预算：直接引用 JavaScript 不超过 256 KiB、直接引用 CSS 不超过
64 KiB，module inventory 不得包含 React、React DOM、Semi Design、Plugin UI、Monaco 或 language
adapter module。其余 drift 预算仍为：完整未压缩 `dist/` 24 MiB、全部 JavaScript 与压缩 `.lxp`
分别 8 MiB、每个 Monaco/language chunk 4 MiB、每个 Worker entry 2 MiB。package gate 记录所有 Monaco/language/CSS/Worker
chunk，并拒绝远程加载、source map、Host 私有 import、未审查依赖版本或
预算漂移。初始 `800×600` 可调整 Page 的 28 场景主视觉矩阵覆盖英文和简体中文、light/dark、empty、
有效格式化内容、invalid、limit、长文案、focus 和 recovery。macOS WKWebView
证据还会验证单编辑器直接替换和一次操作 undo。

额外 hard-minimum 与较大 user-resized 用例验证语义化 `content` + `footer` 布局。Monaco
填满 `content`；language selector、status、Format、仅 JSON 的 Compact 与有界条件 diagnostics
全部位于 `footer`。同 attempt hide/restore 保留当前尺寸、model、Worker、input 和 language；
真实 close/reopen 重置为有效 `800×600`，不持久化用户尺寸。

`first-interactive` 不是 render marker。它要求 current Monaco model、显式 initial layout、包内 editor
Worker handshake，以及能够改变该 model 的 native keyboard input。document-local event 不带 payload，
也不授予 authority；target harness 会独立校验 current source、editor、input 与 terminal cleanup。
release-like macOS evidence 要求 p95 不超过 500 ms；Development snapshot evidence 允许 1000 ms。
debug build 可能更慢，但仍使用相同 Runtime 与 cleanup path。真正 close/reopen 会创建 fresh SDK、model、
editor 与 Worker；只有 same-attempt hide/restore 会保留它们。

从仓库根目录运行插件 CI 入口与聚焦产品证据：

```bash
pnpm run gate -- ci-plugins
pnpm run gate -- official-config-lens-cold-open
pnpm run gate -- official-config-lens-warm-format
```

Plugins CI 会构建所需公共依赖，并运行 package lifecycle、built-output E2E、
隐私/边界检查与 28 场景视觉回归。聚焦 cold-open 与 warm-format gate 保留有界 macOS
WKWebView 和产品证据。证据只保存布尔值和计数；禁止包含输入、URL、origin、path、
nonce、Port、payload 或 raw error。
