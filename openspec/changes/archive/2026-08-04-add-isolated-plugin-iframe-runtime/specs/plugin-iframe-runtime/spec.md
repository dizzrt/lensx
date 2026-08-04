## ADDED Requirements

### Requirement: Runtime delivery MUST consume completed navigation and isolated-origin prerequisites

系统 MUST 在创建 production plugin iframe 前确认 `add-frame-aware-webview-navigation-policy` 与 `add-isolated-plugin-runtime-origin` 的 dedicated gates 均已通过。Runtime MUST 只接受由当前 Resource Service 返回、且符合已验证 isolated-origin contract 的 `entry_url`。共享 `lensx-plugin://localhost`、等价共享 translated origin、未知 origin shape、缺失或 drifted evidence MUST fail closed。系统 MUST NOT 通过 wildcard/null CORS、classic-only bundle、删除 negative case 或共享-origin `allow-same-origin` 绕过前置门禁。

#### Scenario: Both prerequisites are current

- **WHEN** frame-aware navigation 与 isolated Runtime origin gates 均通过，且 current Resource Service 返回符合 contract 的独立-origin入口
- **THEN** Runtime resolver 可以继续构造 current descriptor 与 exact navigation lease
- **THEN** prerequisite completion 本身不创建 iframe、执行插件或声明 Task 4.2 完成

#### Scenario: Origin prerequisite is missing or drifted

- **WHEN** dedicated gate 未通过、evidence 与依赖 revision 不一致、entry URL 使用共享 host，或 origin/path scope binding 无法验证
- **THEN** Host 返回 bounded Runtime failure 且不挂载 iframe
- **THEN** 系统不回退到旧 URL、Manifest path、opaque-origin classic bundle 或宽松 CORS

### Requirement: Host MUST derive each iframe Runtime target from current trusted facts

系统 MUST 只在当前可用外部插件 Page 已由统一 Page Registry 解析后，由 Host-private resolver 从 current Registration snapshot 找到相同 owner 的 eligible entry，并以其 `entry_id` 与 snapshot revision 调用 Plugin Resource Service。resolver MUST 验证返回的 entry ID、revision、plugin ID、isolated origin 与 scope/generation binding，并仅从已验证 `entry_url` 和当前 Page internal route 派生 immutable Runtime descriptor。插件、Manifest、Launcher snapshot、`ActivePage`、Page descriptor 和 presentation props MUST NOT 提交或接收安装路径、scope、digest、entry ID、Registration revision、完整 URL、origin token、Tauri object 或 Host executor。

#### Scenario: Resolve an eligible Plugin Page Runtime

- **WHEN** 用户打开当前可用的外部插件 Page，Registration 与 Resource Service facts 收敛且返回 current isolated-origin入口
- **THEN** Host 生成绑定 owner、Page、entry、revision、entry URL 与 retry attempt 的 immutable Runtime descriptor
- **THEN** iframe target 只由该 descriptor 与 Registry 中已验证 route 派生，公共 Page/Action contracts 不增加 Runtime 字段

#### Scenario: Current Host facts do not converge

- **WHEN** snapshot 不可用/degraded、entry 缺失/禁用/不兼容、revision stale、identity 不匹配、Resource Service 拒绝、URL contract 无效或 origin/path scope 不一致
- **THEN** resolution 完整失败且不创建 iframe、不尝试作者路径或旧 URL
- **THEN** bounded error 不泄露 scope、origin token、路径、digest、raw payload 或 Host error

#### Scenario: Plugin supplies Runtime policy input

- **WHEN** Manifest、插件代码或 UI input 提供 URL、origin、scope、sandbox token、allow policy、entry ID、revision 或安装路径
- **THEN** Host 忽略或拒绝该值，只使用 trusted Registration、Page Registry 与 Resource Service facts
- **THEN** 作者输入不能改变 target、origin、安全属性或 Runtime identity

### Requirement: Isolated iframe MUST use the exact Host-fixed capability policy

外部插件 iframe MUST 精确使用 `sandbox="allow-scripts allow-same-origin"`，但 `allow-same-origin` 仅在 current entry 的 browser origin 已由 isolated-origin prerequisite 证明与 Host、其他插件及旧 generation 不同源时生效。Host MUST NOT 添加 forms、popups、downloads、modals、pointer lock、presentation、storage access 或任意 top-navigation token。iframe MUST 使用 `no-referrer`，并以 Host-fixed Permissions Policy 拒绝 camera、microphone、geolocation、fullscreen、clipboard read/write 及支持平台上的其他敏感浏览器能力。Manifest 与插件代码 MUST NOT 覆盖这些属性；Host MUST NOT 注入 Tauri invoke key、`__TAURI_INTERNALS__`、React internals、Resource/Registration adapter 或 native object。

#### Scenario: A valid module plugin runs in its isolated origin

- **WHEN** Host 为 current descriptor 创建 iframe
- **THEN** iframe 使用精确 sandbox、referrer 与 Permissions Policy，并加载 package HTML、CSS、image、classic script 与 ES Module dependency graph
- **THEN** document 只能获得自身 isolated origin 的普通 browser semantics，不能获得 Host、其他插件、旧 generation 或额外 sandbox capability

#### Scenario: Plugin attempts to reach the parent or Host storage

- **WHEN** 插件尝试读取或修改 `window.parent` DOM、`frameElement`、Host React state、Host storage、Tauri surface 或 native object
- **THEN** browser/origin/bootstrap boundary 在 privileged Host behavior 前稳定拒绝
- **THEN** representative Tauri handler hit count 保持为零，Host state 不变

#### Scenario: Shared origin is presented to the container

- **WHEN** resolver 收到共享 `lensx-plugin://localhost`、等价 translated host 或无法证明独占性的 URL
- **THEN** iframe policy validator 拒绝创建 container
- **THEN** Host 不移除 `allow-same-origin` 后降级运行，也不向响应添加 wildcard/null CORS

### Requirement: Document navigation and package resources MUST remain current-target scoped

Host MUST 在 iframe 挂载前激活绑定 current isolated-origin entry document 与 Host-derived fragment 的 frame-aware epoch lease，并在关闭、retry、invalidation 或 replacement 时 compare-current dispose。descendant document navigation MUST 只允许 exact current target。普通 package subresource MUST 继续由 Plugin Resource Service 验证 current origin/scope/generation、identity、path、MIME 与 lifecycle。Host、外部、其他插件、旧 generation、危险 scheme、popup/new-window/download/form/top navigation 和编码逃逸 MUST fail closed。

#### Scenario: Load resources for the current Page

- **WHEN** current iframe 从其 entry 加载同 origin、同 scope 且满足 path/MIME 规则的模块、CSS、image、font、JSON 或 Wasm
- **THEN** Resource Service 重新验证授权后返回资源，module dependency 保持在 current isolated origin
- **THEN** route fragment 不进入协议请求，也不能读取相邻插件或 Host 文件

#### Scenario: Navigate to another origin or generation

- **WHEN** 插件尝试把自身、父窗口、顶层窗口或新 browsing context 导航到另一个插件、旧 generation、Host、外部或危险 target
- **THEN** native/browser policy 在目标获得执行机会前拒绝
- **THEN** 外部页面不被显示为可信插件内容，当前或 bounded failed state 不泄露 raw target

#### Scenario: Stale cleanup races with replacement

- **WHEN** 新 Runtime epoch 已激活，而旧 resolve、旧 Page 或 late cleanup 随后释放 lease
- **THEN** compare-current disposal 保留新 target，旧 target 仍未授权
- **THEN** 同一时刻只有最新 descriptor 对应的 document 可以通过 policy

### Requirement: Runtime origins and storage MUST be isolated across identities and generations

即使 iframe 使用 `allow-same-origin`，current plugin document MUST 与 Host、其他插件、旧 resource generation 和其他 active scope 使用不同 browser origin。插件 MAY 使用自身 current origin 的普通 storage semantics，但 MUST NOT 读取、覆盖或延续其他 identity/generation 的 storage。disable/re-enable、replacement、uninstall、quarantine、incompatible recovery 与 process restart 后的旧 URL MUST 失效；unrelated plugin change MUST NOT错误撤销 current origin。

#### Scenario: Two plugins use browser storage

- **WHEN** plugin A 与 plugin B 在各自 Runtime 中写入同名 storage key
- **THEN** 两者只观察自身值，且都不能观察 Host storage
- **THEN** origin isolation 不依赖插件作者添加 key prefix

#### Scenario: A plugin generation is replaced

- **WHEN** replacement 或 disable/re-enable 使 plugin 获得新的 resource generation/origin
- **THEN**旧 iframe、URL、lease 与 browser storage partition 不成为新 Runtime 的 current authority
- **THEN**失败或取消的 replacement 若保留原 registration，则不会错误撤销原 current generation

### Requirement: Container lifecycle MUST distinguish loaded presentation from trusted Runtime readiness

Task 4.2 container MUST 使用 `resolving`、`loading`、`loaded`、`failed` 和 `disposed` 状态。`loaded` MUST 只表示 iframe 报告一次 load completion，MUST NOT 表示资源全部成功、JavaScript 健康、SDK 初始化、身份握手、Session 或 Host API ready。系统 MUST 只把 Host 已知 snapshot/resource/origin validation、boundary mismatch、navigation rejection 和 Host container error 映射为 `failed`；timeout、crash loop、Host reload、Session disconnect 与 pending-call cleanup 由后续 capability 定义。

#### Scenario: Browser reports iframe load completion

- **WHEN** iframe 在 `loading` 状态发出 load completion
- **THEN** container 进入 `loaded` 并移除 Host loading feedback
- **THEN** UI、日志、状态与文档不把该 signal 称为 `ready`

#### Scenario: User explicitly retries a failure

- **WHEN** 用户激活 Host-owned retry action
- **THEN** 系统从 current snapshot 重新解析 entry、origin 与 lease，并创建新 attempt/iframe
- **THEN** 旧 promise、URL、origin lease 与 iframe 不被复用，系统不自动循环或创建并发 iframe

### Requirement: Runtime feedback MUST be accessible, localized, and theme-compatible

Host-owned resolving/loading/failure/retry UI MUST 使用应用 i18n、Semi Design 与现有 light/dark theme。英文 MUST 为 canonical，简体中文 MUST 语义对齐。loading MUST 暴露 busy/polite status，failure MUST 暴露 error/alert，retry MUST 可键盘操作并有可见焦点。iframe MUST 有由本地化 Page title 派生的非空 accessible title，并填满现有 Page content slot；shared Page context、关闭按钮与焦点恢复 MUST 保持可用。

#### Scenario: Display loading feedback in either locale and theme

- **WHEN** Runtime 正在 resolving/loading 且 locale 或 theme 变化
- **THEN** Host feedback、title 与状态语义使用 current locale/theme
- **THEN** Page context、关闭按钮和键盘焦点保持有效

#### Scenario: Display a retryable failure accessibly

- **WHEN** Runtime 进入 bounded failure
- **THEN** 辅助技术可感知安全错误，retry action 具有稳定 accessible name 与可见焦点
- **THEN**反馈不显示 raw URL、origin、scope、路径、Rust/Tauri error 或作者 HTML

### Requirement: Exactly one active Plugin Page iframe MUST exist only for the current Page lifetime

系统 MUST 继续使用现有单窗口 Page surface，同一时刻最多创建一个 current external Plugin Page iframe。Host Pages MUST 继续作为受信任 React modules 渲染。iframe MUST 只在 `presentationState === "page"`、current target 仍解析为 available plugin Page 且 descriptor current 时存在。手动关闭、Registry invalidation、provider quiesce、disable/uninstall/replacement、entry/revision/origin URL 变化、home/search 或 App unmount MUST 移除旧 iframe。系统 MUST NOT 保留隐藏 iframe、后台 Runtime、第二 Page state、Router/history/tab、iframe pool 或跨 Page reuse。

#### Scenario: Open and close one Plugin Page

- **WHEN** 用户从统一 Launcher Action 打开有效插件 Page
- **THEN**现有 surface 创建且只创建一个 current iframe
- **WHEN**用户使用 shared close button
- **THEN** iframe 被移除，App 返回 Home、清理 query/selection 并恢复 Launcher input focus

#### Scenario: Active plugin facts change

- **WHEN** Page invalidation、provider quiesce、disable/uninstall/replacement 或 entry/revision/origin URL change 发生
- **THEN**旧 iframe 与 lease 被撤销且不保留第二个活跃 Runtime
- **THEN** home、search 与 `lensx.core` Host Page 仍不创建外部插件 iframe

### Requirement: Delivery MUST prove the Runtime boundary on real package and WebView paths

交付 MUST 使用 canonical `.lxp` normal/malicious fixtures 与目标 macOS WKWebView 验证：isolated browser origin、HTML/CSS/image/classic script/ES Module graph、same-origin current storage、Host/other-plugin/old-generation storage isolation、parent/frameElement/Tauri absence、Host-derived route、exact navigation lease、跨 scope/origin navigation、popup/top-navigation/download/form/browser-feature denial，以及 close/invalidation cleanup。模拟 DOM、Rust unit tests 或源码检查 MUST NOT 替代真实 WebView evidence。本 change MUST NOT 声明 Windows/Linux Runtime 支持。

#### Scenario: macOS WKWebView security matrix passes

- **WHEN** dedicated gate 安装并打开 normal 与 malicious `.lxp` fixtures
- **THEN** normal fixture 在 current isolated origin 加载完整 module/resource graph，malicious fixture 的 Host、Tauri、跨插件/generation storage/resource、navigation 与 browser capability 尝试全部稳定失败
- **THEN** evidence 记录 bounded platform/dependency/bundle facts，且不包含 capability URL、origin token、invoke key、raw payload 或本机路径

#### Scenario: Target WebView cannot enforce the design

- **WHEN** isolated origin、ES Module graph、parent/Tauri absence、storage isolation 或 current lease 任一项无法证明
- **THEN** change 不得宣称 Task 4.2 完成或勾选 roadmap checkbox
- **THEN**团队必须更新相应前置或本 change，而不能放宽 origin/sandbox/CORS 或删除 negative case

### Requirement: Task 4.2 MUST leave later Runtime and Host API capabilities unimplemented

本 capability MUST 只交付 Host-private target resolution、isolated-origin iframe container、固定 sandbox/Permissions Policy/navigation boundary、container state、retry、单活跃 Page lifecycle、tests 与维护文档。它 MUST NOT 定义 Runtime Session、message source/identity/nonce/MessagePort、SDK iframe transport、JSON-RPC、Host API、permission dispatch、pending call、完整 CSP、通用 timeout/crash recovery、external opener、background Runtime、sidecar、正式模板或管理 UI。

#### Scenario: Task 4.2 completes before later tasks

- **WHEN**本 change 全部 validation 通过，而 Task 4.3、4.4 与 Milestone 5 尚未交付
- **THEN**用户可以在现有 Page surface 打开、查看、重试和关闭隔离的本地插件 UI
- **THEN**插件仍不能建立可信 Host communication、调用 Host API、获得 permission decision、运行 background work 或声明完整 CSP/lifecycle 已交付
