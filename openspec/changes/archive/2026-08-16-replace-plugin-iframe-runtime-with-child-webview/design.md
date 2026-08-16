## Context

当前 lensX 在可信 Host WebView 的 React Page 区域中创建 `<iframe>`，通过 Host 派生的独立 origin 加载插件入口，再由父窗口向 iframe 转移一个 `MessagePort` 建立 Runtime Session。这个模型已经把 iframe 具体形态写入 Manifest、SDK、Session、导航策略、资源服务、生命周期、模板、ConfigLens 和真实 WKWebView 证据。

新的平台方向是让当前外部插件 Page 成为同一 Launcher native window 中的 Child WebView。Host WebView 继续渲染搜索、Page chrome、标题、返回/关闭、Settings 和失败反馈；Rust/Tauri 创建一个只占据插件内容矩形的原生子 WebView。两者是 native sibling，不存在 DOM parent/child、`window.parent` 或可转移 `MessagePort` 关系。

目标平台仍是 macOS WKWebView。Tauri `unstable-multiwebview` 可以作为 Host-private 实现依赖，后续 API 变更由单一 adapter 吸收；它不能进入 Manifest、SDK 或 Host API 公共契约。WKWebView 是否为 Child WebView 分配独立 WebContent process 属于平台实现细节，不作为安全或性能正确性前提。

## Goals / Non-Goals

**Goals:**

- 用一个当前 Child WebView 完全替代插件 iframe，并删除旧运行路径。
- 让普通插件在顶层 Web browsing context 中运行，同时封闭 Host/Tauri/native authority。
- 用实际 WebView identity、generation 和 attempt 建立 Host-private Session/bridge，而不是信任插件自报身份。
- 让 Host React 与 Rust native surface ownership 清晰分层，并保持单窗口、单当前插件 Page。
- 保留语义等价 hide/restore 连续性、精确 teardown、bounded deadlines/breaker、双语/主题/可访问反馈和真实 WKWebView 证据。
- 让 Manifest、SDK、CLI、模板、ConfigLens、安装/替换和 official release 在同一变更内切换到新协议。

**Non-Goals:**

- 不增加新的 Host API 方法或插件原生权限。
- 不交付多个并发插件 WebView、后台 Page、预加载池、标签页或隐藏保活。
- 不承诺独立 OS process、Windows/Linux Runtime 或稳定 Tauri multiwebview API。
- 不允许插件控制 native bounds、窗口、WebView 配置、ACL、导航策略或 data store。
- 不保留 iframe Manifest/SDK/Runtime compatibility adapter。
- 不以容器迁移替代 ConfigLens 内部 Worker 与 bundle 性能优化。

## Decisions

### 1. Host WebView 与单 Child WebView 组成 native sibling surface

Launcher native window 始终包含一个可信 Host WebView；只有当前 external Plugin Page 需要运行时才创建一个 Child WebView。React 渲染 Host chrome 和一个不可交互的 `PluginRuntimeSlot` placeholder，观察其物理像素 bounds 和可见状态并提交给 Host-private presentation adapter。Rust 校验 revision、window、surface mode、bounds、scale factor 和 current attempt 后创建或更新 Child WebView。

Child WebView 只能位于 Host 分配的内容矩形内。插件不能发送 resize、move、z-order 或 window 请求。Host-owned modal、Settings、Home/Search 或失败覆盖层出现前，controller 必须先隐藏或销毁 Child WebView，避免 native subview 覆盖可信 DOM。ready 后再原子地从 Host loading feedback 切换为 Child WebView 可见；失败时先移除 Child WebView，再显示 Host error UI。

选择该方案而不是继续 iframe，是因为插件获得顶层 Web 语义和独立 Page 生命周期；选择同窗 Child WebView 而不是独立 native window，是为了保留 lensX 单窗口交互、Host chrome 和统一焦点路径。

### 2. Rust 拥有 Child WebView registry，React 只拥有 presentation intent

新增一个 Host-private `PluginChildWebviewService`，以 opaque Runtime attempt key 管理至多一个 entry：

- 可信 identity：plugin ID、Page ID、entry ID、version、resource generation、origin、route、attempt、WebView label；
- native state：creating/loading/loaded/bridge-ready/visible/hidden/terminal；
- native handle：Child WebView、bounds、navigation/resource/bridge hooks、data-store identity；
- cleanup：deadline、bridge、pending RPC、resource lease、visibility、focus 和 destroy generation。

所有 create/update/show/hide/focus/destroy 操作都使用 compare-current token，晚到响应不能操作新的 WebView。React service/controller 只能消费冻结的安全结果与稳定错误码，不能持有 WebView handle、complete URL、origin token、data-store identifier 或 Tauri object。

### 3. 公共 Manifest 使用 `runtime.kind: "webview"`

Manifest protocol 进行 breaking version 升级。`runtime.kind: "webview"` 表示插件拥有一个普通前台 Web Page Runtime；“Child”与 Tauri multiwebview 是 Host 实现，不写入 author contract。`runtime.entry` 继续是 package-relative HTML。

Host、Contract、CLI 和 Rust 只接受新协议。旧 `runtime.kind: "iframe"`、旧 Manifest version 和旧 SDK package 明确进入 unsupported/incompatible 结果，不被静默重写。`.lxp` canonical TAR/Zstandard profile保持不变，只有其中 Manifest/fixtures 和 compatibility facts 变化。

### 4. 每个 current generation 使用独立 origin、resource authority 和 WebView identity

保留现有“每个 current resource generation 一个不可猜 origin/scope”的安全结论。Resource Service 在创建 Child WebView 前解析入口；请求处理除 URL scope 外，还必须验证发起请求的 Child WebView label/attempt 与当前 registry binding。Host WebView、其他 Child WebView、旧 generation 和 remote document不能消费 package custom protocol。

Child WebView 使用 Host 派生的 data-store identifier/partition；标识只用于隔离，不公开给插件。browser origin storage 的当前 generation 行为保持现有契约，不在本变更中引入跨升级 browser-storage 迁移。Host scoped storage 仍是唯一稳定的受支持持久化 API。

资源服务保持 fail closed；可增加 Host 内部、generation-bound 的已验证 byte cache，但每次命中前必须重验 current WebView/generation binding，destroy/replacement 必须撤销 cache authority。不能用跨 generation browser cache 绕过资源撤销。

### 5. 主 WebView 与插件 Child WebView 使用互斥导航策略

Host 主 WebView 的 native policy 删除 descendant plugin target lease，只允许可信 App document/navigation。Host 不再有插件 iframe、plugin document descendant 或 `frame-src lensx-plugin:` 例外。

Child WebView 在创建时绑定不可变入口、route、origin 和 generation。native navigation hook只允许：

- initial exact package entry commit；
- same-document Host-derived route fragment；
- 当前 origin 下的 package resources；
- open Web baseline允许的 subresource/network requests。

插件发起的 top-level package/remote/data/blob/file/javascript navigation、history escape、popup、new window 和 download不能替换当前插件 document。可支持的外部导航必须以后续 typed Host API 明确加入；本 change 继续 fail closed。策略按实际 WebView label/attempt判断，不读取 Manifest policy。

### 6. 使用 per-WebView private native bridge 取代 parent MessagePort

Child WebView 没有可信 DOM parent，SDK transport 改为 `@lensx/plugin-sdk/webview`。Host 在 document 创建前注入最小、不可重配的 lensX bridge bootstrap；bridge 只允许发送/订阅一个 closed transport frame union，不暴露 Tauri event bus、command name、WebView/window API、identity、origin、路径或 native handle。

native ingress天然携带实际 WebView label/handle。Host adapter把它与 current registry entry、resource generation、attempt和Session nonce进行 compare-current；只有完全匹配的 source 才能进入 private codec/RPC validator。Host-to-plugin response/event 只投递到同一 current Child WebView。插件能观察并使用 bridge（这是其 SDK authority），但不能选择 source identity 或把 bridge authority转移给另一 WebView。

如果实现采用 Tauri Runtime Authority，必须显式启用 capability allowlist并确保插件 WebView只匹配唯一 bridge permission；所有普通 Tauri core/plugin/app commands和global event authority必须被拒绝。如果 Tauri adapter无法证明这一点，则使用 vendored Wry per-WebView IPC handler。两种实现都必须满足相同 public/private boundary和negative evidence，且实现选择不进入SDK声明。

private transport保留严格递增request ID、32 in-flight、Host deadline、cancel、out-of-order response、event、disconnect、closed error/result semantics和bounded diagnostics。carrier contract进行breaking version升级；不复用MessagePort frame或parent-origin bootstrap。

### 7. Session identity 绑定实际 Child WebView，而不是 `contentWindow`

Session建立顺序为：

1. current Page/Registration/Resource facts解析；
2. Rust registry创建attempt与Child WebView，安装hooks和bridge；
3. exact entry开始导航并启动10秒load deadline；
4. native finished-load只把状态推进为`loaded`；
5. SDK `/webview`通过bridge发送包含当前bootstrap contract/nonce的ready；
6. Host验证实际source WebView、attempt、nonce与generation后标记Session ready；
7. SDK请求`runtime.get_context`成功后才进入SDK ready。

loaded、Session ready、SDK ready保持不同状态。nonce只用于一次attempt freshness，不授予插件额外authority；真正的source authority来自native callback携带的current WebView identity。任何旧WebView、错误label、错误generation、重复ready、malformed frame或晚到response都fail closed。

### 8. 终止以 destroy Child WebView 为核心收敛点

close、换页、disable、uninstall、replacement、upgrade、development reload、retry、Session disconnect、bridge fatal error、breaker、Host reload、App unmount和process exit都进入同一个idempotent terminal coordinator：

1. 标记attempt terminal并拒绝新bridge ingress；
2. abort pending Host handlers和SDK requests；
3.发送至多一个bounded disconnect；
4.撤销Session、bridge与resource/navigation authority；
5.隐藏并destroy Child WebView；
6.移除bounds/focus/listener/timer/cache binding；
7.只在current token匹配时发布Host UI状态。

语义等价Launcher hide/restore只隐藏/显示native window和同一Child WebView，不创建新attempt；无关插件Registration revision只触发revalidation，不销毁current binding。真实Page close绝不保留隐藏WebView、Worker、网络连接或browser execution context。

### 9. 性能结论用分段指标验证，不由容器类型推断

真实macOS evidence记录不含用户内容的阶段耗时：resolve、create WebView、initial navigation、load、bridge ready、SDK ready、first interactive、hide/restore、destroy和Host heartbeat。指标至少区分cold create与same-attempt restore。

Child WebView可能增加cold startup和内存；它不自动修复插件内部Worker冷启动。验收必须证明：

- loading期间Host搜索/动画/关闭保持响应；
- hide/restore不重复加载；
- terminal destroy后WebView/bridge/Worker/connection不可再控制Host；
- ConfigLens小JSON显式format的warm延迟进入独立的毫秒级预算，且Worker timeout/crash仍可恢复。

性能阈值记录在测试常量和维护文档中，避免把环境敏感数字写进公共Manifest或Host API协议。

### 10. 公共与仓库命名一次性迁移

删除或重命名所有iframe-specific生产符号、入口、copy、fixture和gate：`PluginRuntimeFrame`、`policy.ts` iframe sandbox、`@lensx/plugin-sdk/iframe`、`createPluginIframeTransport`、`plugin-sdk-iframe-transport`和`plugin-iframe-runtime`。新命名统一使用`ChildWebview`表示Host native容器、`webview`表示公共author/runtime语义。

官方、external和development source复用同一Child WebView service与bridge；ConfigLens不获得官方专用Runtime。Host API semantic version只在方法/shape变化时演进，本change只升级Manifest、SDK和private transport维度。

## Risks / Trade-offs

- **[Tauri unstable API变更]** → 所有multiwebview调用封装在一个Rust adapter和一组vendored drift checks中，公共Contract/SDK不出现Tauri类型或feature名。
- **[Child WebView cold start与内存高于iframe]** → 保持最多一个current WebView，禁止preload/pool，加入cold/restore/destroy指标和泄漏gate；不以隐藏保活掩盖问题。
- **[native subview覆盖Host DOM modal或loading UI]** → 使用非重叠slot；Host overlay前先compare-current隐藏Child WebView，ready后再显示，失败先destroy再反馈。
- **[焦点、IME、拖放和scale factor漂移]** → Rust/React共享typed bounds revision，真实window resize/Retina/focus/shortcut/keyboard/IME矩阵验证；插件不能提交bounds。
- **[Tauri IPC默认authority泄漏]** → 显式capability allowlist、随机current label、唯一bridgepermission和全command negative matrix；无法证明时使用Wry per-WebView handler。
- **[WebKit可能复用WebContent process]** → 不声明process isolation；Host安全只依赖origin、data store、source WebView、bridge、resource与terminal lifecycle。
- **[旧插件全部不兼容]** → 安装、upgrade、Settings和CLI给出稳定unsupported diagnostic；先迁移templates与ConfigLens，再删除旧Runtime；不提供双协议执行窗口。
- **[native bridge Host-to-plugin投递使用脚本注入产生编码风险]** → 只投递严格验证的closed frame，使用结构化/安全序列化adapter，禁止字符串拼接payload，并以恶意Unicode/HTML/script corpus验证。
- **[稳定规格与文档存在大量iframe术语]** → change gate枚举源码、测试、spec、docs和public tarball中的禁止术语，只允许archive历史与明确迁移说明。

## Migration Plan

1. 先冻结breaking版本与private bridge contract，加入Tauri/Wry multiwebview adapter spike、ACL negative harness和native slot visual prototype；若无法证明零通用Tauriauthority，则停止后续实现并修订design。
2. 升级Manifest/Contract/CLI/package fixtures，生成新`runtime.kind: "webview"`模板；旧协议只得到unsupported diagnostic，尚不删除现有运行路径。
3. 实现Rust Child WebView registry、resource/source binding、navigation、bounds/focus和terminal coordinator，并通过无真实Host API side effect的harness。
4. 实现Session与`@lensx/plugin-sdk/webview` private bridge/transport，接回现有RPC validator和Host API Dispatcher。
5. 用React `PluginRuntimeSlot`切换产品presentation，迁移Development Mode、templates和ConfigLens；完成hide/restore、close/reopen、disable/replace/upgrade/uninstall矩阵。
6. 在新路径全部通过后删除iframe container、MessagePort bootstrap、descendant plugin navigation lease、SDK `/iframe`和对应fixtures/gates；禁止双Runtime。
7. 更新English canonical docs及同路径Simplified Chinese mirrors、stable-spec delta、roadmap与official release证据，执行完整frontend/Rust/package/consumer/macOS/strict OpenSpec validation。

Rollback只允许在尚未删除iframe路径且新协议未发布前回退整个未发布change。Manifest/SDK breaking版本和正式candidate一旦发布，不允许运行时回退到旧iframe协议；后续问题必须通过新版本Child WebView实现修复，或将新协议插件明确标为不兼容。

## Open Questions

没有需要用户决策的开放产品问题。实现前的技术spike只在“Tauri scoped IPC是否能证明插件WebView仅拥有唯一bridgeauthority”这一点上选择Tauri adapter或vendored Wry handler；无论选择哪种实现，公开契约、隔离结论和验收标准不变。
