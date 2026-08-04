## ADDED Requirements

### Requirement: Every document navigation MUST be classified by frame before commit

系统 MUST 在 macOS WKWebView 提交 document navigation 前，将 attempt 分类为 Host main frame 或 descendant frame，并把结构化 target 交给唯一 Host-owned navigation policy。无法取得 frame class、URL 无法解析、callback 失败或 WKWebView adapter 无法保证 pre-commit cancellation 时 MUST fail closed。插件脚本、DOM listener、作者自报身份和 URL 随机性 MUST NOT 作为分类或拒绝依据。本 capability MUST NOT 宣称 Windows 或 Linux 支持。

#### Scenario: Classify a Host main-frame navigation

- **WHEN** lensX WebView 的 main frame 导航到当前构建/运行模式配置的精确 App target
- **THEN** native adapter 将 attempt 标记为 main frame，并且 policy 允许该 Host document
- **THEN** descendant plugin allowlist 不参与 main-frame 授权

#### Scenario: Reject an unclassifiable navigation

- **WHEN** 平台 callback 缺少可靠 frame context、target URL 无效或 decision 不能在 commit 前应用
- **THEN** policy 拒绝 navigation 并返回 bounded Host diagnostic
- **THEN** 系统不把该平台或 attempt 当作已安全处理

### Requirement: Host main frame and descendant frames MUST use disjoint allowlists

Host main frame MUST 只允许当前配置的 lensX App target。descendant frame MUST NOT 继承 App origin、开发服务器 origin、Tauri scheme、Host route 或 main-frame navigation 权限。无 current plugin target 时所有 descendant document navigation MUST 被拒绝；有 current target 时 descendant frame MUST 只匹配该 target 的精确 entry document 与 Host-derived fragment。

#### Scenario: Descendant attempts to load Host content

- **WHEN** descendant frame 尝试导航到 lensX App origin、开发服务器、Tauri scheme 或任意 Host route
- **THEN** native policy 在文档提交前拒绝 navigation
- **THEN** Host 页面不会作为插件内容显示或获得 descendant execution opportunity

#### Scenario: Descendant navigates while policy is idle

- **WHEN** 当前没有 active plugin target，任意 descendant frame 请求 document navigation
- **THEN** policy 拒绝该请求
- **THEN** production placeholder、Home、Search 与 Host Page 不因此创建或保留插件执行上下文

#### Scenario: External target attempts to replace the main document

- **WHEN** main frame 请求导航到未配置的 HTTP(S)、custom scheme、file、data、blob、javascript 或外部应用 target
- **THEN** policy 拒绝 navigation
- **THEN** 插件 target state 或 descendant allowlist 不能扩大 main-frame 权限

### Requirement: Trusted Tauri initialization MUST execute only in the Host main frame

系统 MUST 在 macOS WKWebView 上真实执行 Tauri `for_main_frame_only` initialization semantics。Host App main frame MUST 保留其既有 `isTauri`、`__TAURI_INTERNALS__`、metadata、invoke initialization 与 IPC bootstrap；任何 descendant frame MUST 在最早 author script 执行前保持这些 surface 不存在，并且代表性 descendant invoke MUST NOT 到达 Rust handler。sandbox、opaque origin、作者不导入 API 或仅保存未验证的 main-frame flag MUST NOT 被视为隔离。

#### Scenario: Host main frame retains its bootstrap

- **WHEN** lensX App main frame 在启用 frame-aware policy 的真实 macOS WKWebView 中启动
- **THEN** 既有 Tauri bootstrap、受信任 invoke 与 App lifecycle 继续工作
- **THEN** 实现不能通过全局删除 initialization scripts 获得 descendant negative result

#### Scenario: Descendant cannot observe Tauri internals

- **WHEN** 正常或恶意 descendant document 在最早 author script 阶段检查 Tauri surface
- **THEN** `isTauri`、`__TAURI_INTERNALS__`、metadata、invoke key 和 IPC bootstrap 均不存在或不可用
- **THEN** 检查不依赖 descendant 与父 frame 是否同源，也不依赖插件作者自律

#### Scenario: Descendant invoke is stopped before the Host handler

- **WHEN** descendant document 尝试通过代表性 Tauri API 或伪造消息调用 harness-only invoke command
- **THEN** attempt 在到达 Rust handler 前失败，bounded handler hit count 保持为零
- **THEN** evidence 不记录 invoke key、raw payload、bootstrap script、URL 或底层系统错误

#### Scenario: macOS cannot enforce main-only initialization

- **WHEN** 目标 macOS WKWebView 会向 descendant 注入 Host bootstrap、存在短暂可观察窗口或无法证明 invoke handler 未命中
- **THEN** capability 不得宣称完成，且后续 iframe Runtime 保持阻塞
- **THEN** 团队必须更新 native dependency patch 或平台设计，不得用 DOM cleanup、作者脚本或删除 negative case 绕过门禁

### Requirement: Active plugin target MUST be exact, Host-private, and lifecycle-bound

系统 MUST 最多保存一个 process-local immutable active plugin navigation target，并通过单调 epoch lease 原子 activate、replace 与 dispose。target MUST 由后续可信 Host facts构造，MUST NOT 来自 Manifest、插件消息或作者 URL。公共 Page/Action descriptor、Launcher snapshot、public plugin package、事件和诊断 MUST NOT 暴露 target URL、scope、entry ID、revision、digest、安装路径或 Host object。

#### Scenario: Activate the first trusted target

- **WHEN** Host 为一个已验证 Runtime document 激活精确 target
- **THEN** policy 原子保存 target 并返回新的 opaque current lease
- **THEN** 只有完全匹配该 target 的 descendant document navigation 可以被允许

#### Scenario: Replace the current target

- **WHEN** Host 使用新 Page、entry、revision、resource URL 或 retry attempt 替换 active target
- **THEN** policy 原子使旧 lease 和旧 target 失效并激活新 target
- **THEN** 旧 URL 在 replacement 后不能再次获得 navigation authorization

#### Scenario: Ignore a late disposal

- **WHEN** 旧 Page 或旧 attempt 在 replacement 之后提交 dispose
- **THEN** compare-current lease 检查保留新 target
- **THEN** late cleanup 不能清除或修改当前 navigation authorization

#### Scenario: Dispose the current target

- **WHEN** current lease 被显式 dispose
- **THEN** policy 清空 active plugin target 并回到 descendant-deny idle 状态
- **THEN** target 不持久化，进程重启后也不会恢复旧 authorization

### Requirement: Descendant navigation MUST match one canonical document target exactly

policy MUST 对 native custom-protocol URL 与项目支持的平台 translated URL 进行结构化规范化，然后精确比较 scheme class、host、path 与 Host-derived fragment。它 MUST 拒绝 query、userinfo、port、不同或额外 fragment、root-relative/absolute escape、backslash、percent/double encoding ambiguity、不同 scope/plugin/version、Host/external origin，以及 `file:`、`javascript:`、`data:`、`blob:` 或外部应用 scheme。规范化 MUST NOT 把被拒绝输入重写成可允许 target。

若 WKWebView 对 `file:`、no-op `javascript:` 或同 document `blob:` 在进入 `WKNavigationDelegate` 前即阻止其形成 document navigation，真实 evidence MAY 记录有限的 `blocked_by_webview`，但 MUST 同时证明原 document 保留、没有 new-window/download/external handoff 且 navigation callback count 未伪造增加。该结果 MUST NOT 记录为 policy `deny`；policy normalization 仍 MUST 在平台未来上报这些 target 时拒绝它们。

#### Scenario: Allow the exact active plugin document

- **WHEN** descendant frame 请求 active lease 中的精确 current entry document 与精确 Host-derived fragment
- **THEN** policy 允许 document navigation
- **THEN** decision 不授予其他 document、origin、scope、fragment 或浏览器能力

#### Scenario: Reject a cross-plugin or stale target

- **WHEN** descendant frame 请求另一个插件、另一个 scope/version、旧 lease 或 replacement 前的 entry document
- **THEN** policy 在 commit 前拒绝 navigation
- **THEN** Resource Service URL 即使仍存在或曾经有效也不能成为当前 Page document

#### Scenario: Reject an encoded navigation bypass

- **WHEN** target 使用 query、userinfo、默认/显式 port、backslash、percent/double encoding、大小写碰撞、额外 fragment 或危险 scheme 伪装成 current entry
- **THEN** normalization 返回 deny，而不是解码、修复或拼接为允许 target
- **THEN** bounded diagnostic 不回显 raw target

#### Scenario: Load package subresources through the existing service

- **WHEN** 已允许的 plugin document 请求同一 scope 内的 CSS、JavaScript、image、font、JSON 或 Wasm 普通资源
- **THEN** navigation policy 不把 subresource request 视为新的 document authorization
- **THEN** Plugin Resource Service 继续独立验证 scope、generation、path、MIME、payload ownership 与 lifecycle，且本 capability 不放宽其 contract

### Requirement: New windows, popups, and downloads MUST fail closed independently

Host WebView MUST 安装独立于 document navigation callback 的 new-window/popup 与 download deny policy。`window.open`、targeted browsing context、外部 window request 和 WebView download MUST 在创建上下文、启动下载或转交外部应用前被拒绝。本 capability MUST NOT 将拒绝的请求自动路由到 Tauri opener。

#### Scenario: Descendant requests a popup

- **WHEN** descendant plugin document 使用 `window.open`、链接 target 或其他 new-window mechanism
- **THEN** Host-owned native hook 拒绝创建 browsing context
- **THEN** target 不会在 Host WebView、独立窗口或外部应用中打开

#### Scenario: Descendant requests a download

- **WHEN** descendant plugin document 或 navigation response 触发 WebView download
- **THEN** Host-owned download hook 在写入文件前拒绝请求
- **THEN** 系统不选择目标路径、不保留 partial file，也不把请求转交给插件或 Tauri opener

### Requirement: Navigation decisions and diagnostics MUST remain Host-private and bounded

decision、active lease、platform callback、target normalization 与 diagnostic MUST 保持在 Rust/Tauri Host-private boundary。诊断 MUST 使用固定有限 code 和 operation，不得包含 raw URL、scope、plugin identity、entry ID、revision、digest、安装/系统路径、原生错误、stack、文件内容或 capability token。本 capability MUST NOT 新增插件可调用 command、public TypeScript/package export、Manifest 字段、Runtime Session、SDK transport、Host API 或权限语义。

#### Scenario: A navigation is denied safely

- **WHEN** policy 因 external target、cross-plugin target、invalid URL、missing active lease 或平台 callback failure 拒绝 navigation
- **THEN** Host 只记录 bounded code、frame class 与 operation
- **THEN** 插件和公共应用 contract 不接收 target、Host state 或底层平台错误

#### Scenario: Public package boundary is checked

- **WHEN** workspace boundary gate 检查 Contract、SDK、UI、Testkit、官方、示例与外部插件成员
- **THEN** 它们不能 import frame-aware policy、native adapter、active lease、Tauri/Wry patch 或 test harness internals
- **THEN** 本 capability 不新增 public Runtime/session/API export

### Requirement: Delivery MUST prove pre-commit enforcement on every supported desktop WebView

交付 MUST 在真实 macOS WKWebView 应用环境中验证 main/descendant classification、精确 current target、idle/replace/dispose、Host/external/cross-plugin policy rejection、dangerous-scheme policy rejection 或明确的 WKWebView preflight block、popup、download、native custom protocol、Host bootstrap 保留与 descendant bootstrap/invoke absence。证据 MUST 记录 macOS、WKWebView engine/version、Tauri/Wry revision、bundle shape 与 bounded 结果，但 MUST NOT 记录 capability URL、invoke key、raw bootstrap/payload、本机路径或敏感 identity。DOM 模拟、Rust 单元测试和依赖源码检查 MUST NOT 替代真实 WKWebView 结果。Windows 与 Linux 不属于本 capability 的交付范围。

#### Scenario: Target macOS WKWebView passes the matrix

- **WHEN** 专用 gate 在目标 macOS WKWebView 运行正常和恶意 navigation fixtures
- **THEN** main App 和精确 active plugin document 被允许，Host bootstrap 保持可用，所有 descendant Tauri surface/invoke 与其余 descendant/main escape、popup、download 在 script/commit/creation/write 前稳定失败
- **THEN** 结构化证据与固定 dependency revision 一起通过 drift gate

#### Scenario: macOS cannot enforce the policy

- **WHEN** 目标 macOS WKWebView 不能可靠分类实际进入 callback 的 descendant document navigation、不能在 commit 前 cancel、会向 descendant 注入 Tauri bootstrap、不能证明 invoke handler 零命中，或既无 policy rejection 也无符合上述约束的 preflight block
- **THEN** capability 不得宣称完成，且后续 iframe Runtime 保持阻塞
- **THEN** 团队先更新设计、平台支持边界或 native dependency patch，不得以 DOM hook、删除 negative case 或扩大 allowlist 绕过门禁

### Requirement: The prerequisite MUST leave plugin Runtime and product presentation unchanged

本 capability MUST 只交付 frame-aware native policy、main-only initialization enforcement、Host-private target lease、URL normalization、new-window/download denial、dependency integration、测试和维护文档。production policy MUST 以无 active plugin target 的 idle 状态安装。它 MUST NOT 创建 iframe、执行插件代码、修改 `App.tsx` plugin Page composition、替换 Runtime-unavailable placeholder、改变 Page close/focus/locale/theme 行为，或交付 Session、Host API、permissions、完整 CSP 与 child WebView。

#### Scenario: Prerequisite completes before iframe Runtime

- **WHEN** 本 capability 通过全部验证而 `add-isolated-plugin-iframe-runtime` 尚未恢复实施
- **THEN** 用户仍看到现有 bilingual、theme-compatible Host-owned plugin Page placeholder
- **THEN** Home、Search、Host Pages、Page context、shared close、focus restoration 与产品 UI 不变，且没有插件 HTML 或 JavaScript 执行
