# ConfigLens 官方插件

## 产品与边界

`plugins/config-lens` 是官方插件 workspace 的首个真实产品成员。
package 为 `@lensx/official-config-lens`，plugin ID 为
`dev.lensx.config-lens`，本地化产品名始终为 `ConfigLens`。它只贡献一个
`main` Page 和一个 `open` Action，并与外部插件使用相同的公共 Contract、
SDK、UI、Testkit、CLI、本地安装、隔离 Runtime 和 Host API 边界。仓库归属
和 CI 证据不会赋予信任、权限、持久化、剪贴板或原生能力。

Launcher Action 标题在 `en-US` 和 `zh-CN` 中均为 `ConfigLens`，遵循统一的
[Action 命名指南](../plugin-development/public-packages.md#action-display-names)。其身份仍为
`dev.lensx.config-lens.open`，Page 目标仍为 `main`，默认 local Action 仍为 `open`。
已有 Recent/Pinned ID 和打开页面的 Action 上下文解析当前标题。`JSON`、`format`、`格式化`
等既有功能关键词保持不变，不添加 `Open ConfigLens` / `打开 ConfigLens` 或打开前缀兼容关键词。
已安装副本通过普通插件更新或开发重新加载路径读取新 Manifest；Host 不会改写旧标题。

ConfigLens 是支持 JSON、YAML 1.2、TOML 1.0 和 XML 1.0 的临时配置工作台。
Page 只有一个可编辑 Monaco model。Format 直接替换四种语言的正文；只有当前输入
版本通过严格 JSON 校验后才可使用 Compact。每次成功操作都是一次可撤销编辑。
失败或过期结果保留当前内容；识别绝不改写或自动格式化正文。

Host Page chrome 提供可见的 ConfigLens 身份，插件 document 不重复主标题或副标题。
ready document 恰好包含两个顶层区域：一个可伸缩 content 区域和一个 semantic
footer。Monaco 填满 content，不保留 page padding、content/footer gap，也没有
自己的卡片 border 或 radius。Footer 固定在 viewport 底部，通过一条分隔边界连接
Monaco。正常布局高度恰好为 40 logical pixels，仅包含语言选择器、Format 和 Compact。
宽度不超过 520 logical pixels 或高度不超过 260
logical pixels 时，控件在固定 72-logical-pixel Footer 内使用两行；外层 padding
和 content/footer gap 仍为零。编辑内容与验证状态不能推动 Footer。

Footer 没有状态节点、预留状态空间、空输入提示、有效提示、进度摘要、诊断计数或
额外状态区域。按钮保留 loading/disabled 行为，操作组暴露 `aria-busy`。错误通过
Monaco marker 和编辑器区域内可访问的 live diagnostic 消息呈现。没有精确位置的
Worker 失败或输入超限映射到安全起始范围；修正输入后可以恢复。普通未识别文本
不会被当作语法错误。

## 语言选择与高亮

新 document 默认为 Auto，语言未识别，model 使用 plaintext。紧凑选择器在自动模式下
始终显示英文 `Auto` 或简体中文 `自动`，分析前、分析中和分析后均不变化。
手选项仅显示 `JSON`、`YAML`、`TOML` 和 `XML`；支持的语法版本仍为 JSON、
YAML 1.2、TOML 1.0 和 XML 1.0。自动识别继续在内部驱动高亮、校验和操作，不添加
识别语言或未识别后缀。选择器首选宽度为 120 logical pixels，受限布局可收缩至
72 logical pixels，上限 120 pixels，使用 `flex: 0 1 120px`，不扩展填满整行。
Footer 的 40/72-pixel 高度不变。手选会在编辑、粘贴和清空后持续锁定；
再次选择 Auto 才清除手选状态并重新分析当前输入。清空 Auto 会回到未识别 plaintext
并清除诊断；清空手动模式则保留所选语言。空输入不能 Format 或 Compact。

识别在一次 Worker 请求中结合结构候选与已有 parser。明确 XML 结构选择 XML，
严格 JSON 对象和数组优先于 YAML，`port = 8080` 或 `[server]` 等 TOML 赋值／表头
选择 TOML。结构明确但残缺的 JSON 或 XML 保留该语言，并可产生语法诊断。YAML
block/flow collection 仍可识别，但不会把每个标量、普通字符串或注释都当作 YAML。
非空编辑暂时没有可靠新结构时，Auto 沿用最近一次自动识别语言；明确的新结构可以
切换语言。首次歧义保持未识别。用户通过可见的手选表达意图；识别不保证意图或
语法有效。XML 外部构造继续遵循既有拒绝规则。

输入版本、选择版本、操作 generation 和 Runtime locale/theme 上下文共同保护
异步结果。编辑或改变这些上下文会使旧任务失效，并为当前输入安排分析。180ms
防抖期间可以保留旧着色，但 pending 或 unresolved 分析不能执行变换。Format 按钮
与 `Cmd/Ctrl+Enter` 使用同一执行条件；Compact 还要求当前输入和选择版本拥有
有效的严格 JSON 结果。

高亮跟随同一 model 的生效语言，未识别时使用 plaintext。JSON 使用包内
tokenization 模块；YAML 和 XML 使用包内 language definition 与配置。项目维护
轻量 TOML Monarch definition，覆盖表／数组表、裸键／引用键、单行／多行字符串、
转义、注释、布尔、数值和日期时间。这些资源既能为有效文本着色，也能处理残缺
文本。着色独立于诊断，不替代严格 Worker 解析或保真检查，尤其不替代 TOML 1.0
校验。语言及 light/dark theme 更新保留正文和撤销历史。不加载第二套 JSON
校验／格式化 provider、远程 schema resolver、LSP、补全服务或额外 language-service
Worker。

## 原生 Find 与界面语言

`Cmd/Ctrl+F` 通过 `actions.find` 打开原生 Monaco Find widget，空文档或语言未识别时
也可打开。Find 提供前后匹配定位、无结果反馈、
大小写、整词与正则选项。反复打开复用同一 widget。Escape 或关闭控件将焦点还给
编辑器，不关闭插件 Page。查找本身不改正文；若使用原生 widget 的显式 Replace，
它走普通 model 内容变更、撤销及在途分析失效路径。

ConfigLens 局部样式保持原生 Find 按钮垂直对齐，并使 widget 位置与 Monaco 既有顶部
占位一致。打开 Find 或展开 Replace 后，编辑器滚到顶部时首行正文仍不被遮挡；
关闭 widget 释放该原生占位。此行为沿用 Monaco 现有 `find.addExtraSpaceOnTop`
机制，不增加编辑器 padding，也不修改共享 Plugin UI reset。

Monaco 包内的 Codicon TrueType 字体提供原生 Find 图标。产物 CSS URL 必须相对于
其样式表解析到插件包内的字体，产物字体字节必须与锁定依赖一致。Host resource
service 在既有 scope 资源规则下以 `font/ttf` 提供 `.ttf`。无需远程加载、新权限或
CSP 修改。

编辑器内的 `Cmd/Ctrl+A` 和可见 Select All 上下文菜单选择整个 model。Find 输入框
聚焦时，全选只作用于查询。没有 document 全局全选 handler 从语言 Select、Host
输入或另一原生 view 抢焦点。[共享 Child Runtime](../architecture/plugin-child-webview-runtime.md#原生编辑快捷键)
负责 macOS 原生交付；该修复随 Host 发布，独立于插件更新。

首个有效 Runtime Context 固定该 document 的 Monaco 界面语言。包内 NLS 在首次
导入 Monaco API、Find、上下文菜单和诊断 contributions 之前初始化；bootstrap
预加载与编辑器初始化共用同一 loader，支持英文和简体中文。随后切换应用 locale，
ConfigLens 控件和它提供的诊断消息即时更新。Monaco 原生 Find、菜单及诊断交互
框架文案保留打开时的语言，直到真正关闭并重开 ConfigLens。重建 editor 或同一
document 内 SDK retry 不会刷新已求值的模块消息。Theme 即时更新，无需重开。

## 临时状态与清理

正文、语言模式、生效语言、Find 查询／选项、选择范围与撤销历史只留在当前 Page
generation 的内存。只要执行身份仍有效，隐藏／恢复 Launcher 就保留同一 Child
WebView、Runtime Session、model 和 Worker；这不构成关闭或新 document。真正
关闭后重开，以空内容、Auto 未识别模式开始，并使用新打开时的界面 locale。禁用、
替换、development reload、卸载、teardown 或 SDK 失败／retry 会丢弃旧 editor
及临时正文／查询状态。同 document retry 仅保留上节说明的 module/NLS 初始化。

Teardown 释放 model、editor 与 Find widget、内容／布局订阅、markers、语言任务
及 editor Workers；迟到异步任务不能恢复旧表面。Find 全局 clipboard 关闭，
standalone clipboard/storage service 仅使用 document 内存，查询／替换历史不持久化。
包内 service adapter 隔离在固定 Monaco 版本边界内，复审该版本时必须重新验证。
ConfigLens 不新增程序化系统剪贴板访问、Host 剪贴板请求、私有 bridge、浏览器存储、
Host 持久化、网络识别、内容日志、Fetch 或 WebSocket 路径。普通原生 Web 编辑
保留既有剪贴板行为，不需要新的 Host 权限。

## 已审查的 Runtime 依赖

Runtime 依赖固定为准确版本，任何变更都必须重新审查。

| 依赖 | 版本 | 许可证 | 用途与审查结果 |
| --- | --- | --- | --- |
| `monaco-editor` | `0.56.0` | MIT | 浏览器 ESM 编辑器，使用包内 tokenizer、NLS、Find、module Worker 与 chunk。资源不使用 CDN、运行时解析、source map 或 `eval`。 |
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

主线程在派发前执行 2 MiB UTF-8 与 100,000 行输入限制。识别与校验共用一次
可替换 module Worker 请求，总 deadline 为五秒，最多返回 200 条安全诊断。各候选
不会重新获得 timeout，超限输入不派发。Monaco
使用独立包内 editor Worker。所有生成资源都保留在自包含 `dist/` 与
canonical `.lxp` 中。

production 产物检查约束直接引用 JavaScript 不超过 256 KiB、直接引用 CSS
不超过 64 KiB。initial module inventory 不得包含 React、React DOM、Semi
Design、Plugin UI、Monaco 或 language adapter module。其余预算保持为：
完整未压缩 `dist/` 24 MiB、全部 JavaScript 与压缩 `.lxp` 分别 8 MiB、
每个 Monaco/language chunk 4 MiB、每个 Worker entry 2 MiB。

确定性验证覆盖自动／手动语言状态、结构及残缺 fixtures、版本竞态、共享预算、
取消与恢复、真实 tokenizer 输出、原生 Find 注册及受支持 DOM 行为、
ConfigLens 局部 Find 对齐与原生占位生命周期、
包内 Codicon 字体字节和资源相对于样式表的路径解析、首次导入 NLS、
双语／双主题、单 model 编辑／撤销和资源清理。源码与 compiled-CSS contract 覆盖
连续双区域工作台、40/72-pixel Footer、无状态区、按钮忙碌语义和编辑器内可访问诊断。
Rust 与 lifecycle 测试覆盖共享原生快捷键策略、同 attempt hide/restore、close/reopen、
替换、清理与 resource revocation。built-output 模块清单必须证明 Find、NLS 和
四语言 tokenizer 位于延迟图，初始图仍排除重模块和额外语言服务。这些是验证责任，
不能替代实际命令结果。检查不采样目标环境时延，不启动浏览器或真实 WebView，
也不维护渲染输出。

运行：

```bash
pnpm run gate -- ci-plugins
```

Plugins CI 会构建所需公共依赖，恰好运行一次 ConfigLens package lifecycle，
随后执行纯 Node built-output 检查。
