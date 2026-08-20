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
失败时保持当前内容，语言始终由用户显式选择。Host Page chrome 提供可见的 ConfigLens
身份，因此插件 document 工作区不重复主标题或副标题。ready document 只包含两个
顶层区域：一个可伸缩 content 区域和一个 semantic footer。Monaco 表面会填满完整
content 区域，不保留 page padding、content/footer gap，也没有自己的
卡片 border 或 radius。Footer 会固定在插件 viewport 最底部，并通过一条分隔边界直接
连接 Monaco；正常布局下它始终为 40 logical pixels 高，并让显式语言选择器、非诊断
状态、Format 与 Compact 控件垂直居中。验证诊断只保留为 Monaco marker；Footer 不显示
诊断数量、摘要、列表或额外行。当宽度不超过 520 logical pixels 或高度不超过 260
logical pixels 时，控件可以在固定 72-logical-pixel Footer 内使用两行，但外层 padding
与 content/footer gap 仍保持为零。编辑内容和验证状态都不能把 Footer 从 viewport
底部顶起。插件不执行 fetch、WebSocket、浏览器存储、剪贴板、Host 持久化或内容日志。

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

## 限制、Chunk 与确定性检查

HTML entry 是最小 bootstrap。它会在加载 React、React DOM、Semi Design、
Plugin UI、Monaco 或 language adapter 前创建唯一 public WebView transport
与 SDK client。Runtime Context 未知时，正常启动只暴露 accessible busy
semantics；只有失败后才显示可聚焦 retry control。Context 到达后，mount
bundle 与 single-flight Monaco loader 并行启动。retry 会先 dispose 旧
attempt，再启动 fresh client。

主线程在派发前执行 2 MiB UTF-8 与 100,000 行输入限制。语言处理在可替换
module Worker 内执行，deadline 为五秒，最多返回 200 条安全诊断。Monaco
使用独立包内 editor Worker。所有生成资源都保留在自包含 `dist/` 与
canonical `.lxp` 中。

production 产物检查约束直接引用 JavaScript 不超过 256 KiB、直接引用 CSS
不超过 64 KiB。initial module inventory 不得包含 React、React DOM、Semi
Design、Plugin UI、Monaco 或 language adapter module。其余预算保持为：
完整未压缩 `dist/` 24 MiB、全部 JavaScript 与压缩 `.lxp` 分别 8 MiB、
每个 Monaco/language chunk 4 MiB、每个 Worker entry 2 MiB。

Rstest 覆盖双语、light/dark semantic token、empty、valid、invalid、limit、
长文案、keyboard、focus、recovery、single-editor replacement、单次操作
undo 与 content-plus-footer 状态。source 与 compiled-CSS contract 覆盖连续
workbench、固定底部的 40-pixel Footer、Footer 诊断 UI 缺失、Monaco 诊断 marker，
以及固定 72-pixel constrained fallback。Rust 与
lifecycle 测试覆盖 same-attempt
hide/restore、close/reopen、replacement、cleanup 与 resource revocation。
这些确定性检查不采样目标环境时延，不启动浏览器或真实 WebView，也不维护渲染输出。

运行：

```bash
pnpm run gate -- ci-plugins
```

Plugins CI 会构建所需公共依赖，恰好运行一次 ConfigLens package lifecycle，
随后执行纯 Node built-output 检查。
