# Spec Delta

## MODIFIED Requirements

### Requirement: Host MUST present one current plugin as a native Child WebView sibling

当某窗口的当前 Page 属于可执行插件时，Host MUST 在该窗口内呈现一个插件 Child WebView，作为该窗口可信 Host WebView 的原生兄弟视图。主窗口与每个独立窗口分别最多拥有一个当前插件实例；全进程允许多个相同或不同插件实例。

#### Scenario: External Page enters ready presentation
- **WHEN** current Registration, Page, Resource, and Runtime facts converge and the Child WebView completes load and Session readiness
- **THEN** the Host displays that Child WebView inside the assigned plugin content slot and hides loading feedback
- **THEN** 主窗口的 Page chrome 由可信 Host WebView 呈现，macOS 独立窗口的系统标题栏位于内容区外。插件不能覆盖窗口控件或越出所属 slot。

#### Scenario: Host overlay must cover the plugin region
- **WHEN** the Host must present Settings, a confirmation dialog, or terminal failure feedback
- **THEN** the Host compare-current hides or destroys the Child WebView before presenting the trusted overlay
- **THEN** the native subview cannot obscure Host-owned interaction or intercept its focus

#### Scenario: Create the current native plugin view

- **WHEN** the Host creates, presents, updates, or destroys the current plugin Child WebView
- **THEN** React MUST only declare the Host-owned plugin content slot; Rust MUST exclusively own Child WebView creation, label, bounds, visibility, focus, navigation hooks, data store, and destroy authority.
- **THEN** 系统 MUST 按所属窗口保证至多一个当前插件 Child WebView，并以独立 attempt 与可信原生来源区分同插件同 Page 的多个实例；插件 MUST NOT 提交或接收 native handle、window、position、size、z-order 或 WebView configuration。

#### Scenario: Detach one instance while opening another
- **WHEN** 主窗口的实例 A 被分离后，在主窗口打开同插件的新实例 B
- **THEN** A 与 B 各自只占用所属窗口的 slot、Session 和原生来源，Host chrome 分别由可信 Host 呈现
- **THEN** 主窗口 overlay 仅影响 main 的实例；A 自身的失败反馈或关闭只影响 A


### Requirement: Host MUST provide an edge-to-edge content slot below plugin Page chrome

主窗插件 slot MUST 填满可信 Page chrome 下方的区域。macOS 独立窗口的插件 slot MUST 从原生标题栏下方内容区的原点填满整个内容区，系统标题栏与原生外轮廓归宿主所有，插件无需适配圆角或标题栏。

#### Scenario: Ordinary plugin Page enters its content slot

- **WHEN** an external or Development Mode plugin Page becomes current below the trusted Host Page chrome
- **THEN** its Host-owned Runtime slot begins directly after the chrome and extends to the remaining inline and bottom edges without Host body inset, inter-region gap or inner card radius
- **THEN** the plugin remains confined to that slot and cannot cover, replace or measure Host chrome through privileged APIs

#### Scenario: Official ConfigLens uses the ordinary slot

- **WHEN** the official ConfigLens Page and an equivalent external plugin Page resolve through the same provider and Runtime path
- **THEN** the Host selects the same edge-to-edge body layout from provider kind rather than official provenance
- **THEN** ConfigLens receives no special Host import, Runtime branch, native authority or bounds input

#### Scenario: Non-plugin surfaces retain their layouts

- **WHEN** the Launcher presents Home, Search or a Host-owned Page
- **THEN** the plugin edge-to-edge body state is absent and those surfaces retain their maintained padding, gap and resizable behavior
- **THEN** no hidden or stale plugin slot affects their layout or focus

#### Scenario: Plugin Page geometry changes

- **WHEN** Window size, scale, locale, theme or Host Page chrome changes the edge-to-edge content rectangle
- **THEN** the trusted Host advances the current slot revision and converges the same modeled Child WebView attempt on the newest valid physical bounds
- **THEN** the change causes no document reload, Session replacement, plugin-supplied geometry, native setter exposure or stale-attempt mutation

#### Scenario: Assign the ordinary plugin content rectangle

- **WHEN** the trusted Host lays out a current plugin Page
- **THEN** The plugin Page body MUST add no Host-owned inline padding, bottom padding, inter-region gap, or inner card radius around the Runtime slot.
- **THEN** macOS 主窗 MUST 按 `frontend-foundation` 的共享外轮廓裁剪完整内容。独立窗由系统绘制外轮廓，插件限制在矩形内容区内，标题栏接缝不添加内圆角。
- **THEN** This layout MUST be selected from the trusted Page provider kind and MUST apply identically to official, external, and Development Mode plugins; plugin identity, Publisher, repository location, release metadata, or Runtime content MUST NOT select a special layout path.

#### Scenario: Measure and publish slot changes

- **WHEN** Window, scale, locale, theme, or Page chrome changes the Host-owned slot
- **THEN** React MUST continue to declare and measure only the Host-owned slot.
- **THEN** Slot changes caused by Window resize, scale, locale, theme, or Page chrome MUST continue through the current revisioned physical-bounds path and Rust validation without a plugin-supplied bounds input, Runtime reload, Session replacement, new native setter, or public contract change.

#### Scenario: Render a non-plugin Host surface

- **WHEN** the Host presents Home, Search, or a Host-owned Page
- **THEN** Home, Search and Host Pages MUST retain their own Host layouts.

#### Scenario: Present any plugin without a rounding adaptation

- **WHEN** an official, external, or Development Mode plugin presents opaque or transparent content in the current macOS slot without providing window-rounding styles
- **THEN** the Host MUST apply the same outer-outline clipping to every plugin, without requiring an SDK upgrade, Manifest change, package rebuild, or additional message registration
- **THEN** the plugin MUST observe only its existing rectangular Web viewport and MUST NOT gain window-rounding configuration, native objects, or new geometry-setting authority

#### Scenario: Reveal or restore a clipped Child

- **WHEN** the macOS Host first reveals a ready Child or restores the semantically equivalent current Child
- **THEN** the revealed Child MUST already be clipped to the current window's outer outline, and existing load, bridge, and SDK readiness conditions MUST continue to hold
- **THEN** same-attempt restoration MUST preserve the existing document, Session, Worker, model, user size, and focus-restoration semantics; clipping MUST NOT trigger another creation or load

#### Scenario: Clipping cannot be established for presentation

- **WHEN** the macOS Host cannot confirm that content to be presented is clipped to the current window's outer outline
- **THEN** the Host MUST NOT reveal an unclipped Child or report the reveal as successful
- **THEN** existing valid clipping and safe presentation MUST be retained when possible; otherwise the affected content MUST be hidden and handled through the existing initialization-error or Runtime-failure path
- **THEN** plugin data and product error copy MUST NOT expose native pointers, object labels, platform exceptions, or internal diagnostics; existing navigation, retry, and close behavior MUST remain operable while the Host can still be safely presented
- **THEN** failure to establish initial clipping MUST keep the window unpresented and follow the existing initialization-error path

#### Scenario: Old attempts cannot undo the current outline

- **WHEN** plugin A is closed, invalidated, or replaced by B and A's slot updates, ready events, hide, or destroy operations complete later
- **THEN** A's late operations MUST NOT clear the common window outline, change B's clipping, or make A visible again
- **THEN** the current Child slot MUST retain the existing revision and compare-current rules, and the outer outline MUST follow the current complete window bounds

#### Scenario: Detached chrome and slot have one current owner
- **WHEN** 已就绪实例成功迁移到独立窗口，或者该独立窗口调整尺寸
- **THEN** 独立窗口的原生标题栏占用内容区外的空间，slot 从内容坐标 `(0, 0)` 填满窗口内容；可信 shell 不渲染重复的页面栏、关闭按钮或顶部留白
- **THEN** 旧主窗口的 slot/圆角/焦点回调不能修改新 owner，不因移交重载 document 或 Session


### Requirement: Child WebView lifecycle MUST preserve only semantic-equivalent activation

Launcher 的同实例 hide/restore、所属窗口内 same-Page 激活、Host 窗口分离及无关 Registration 更新 MUST 保留同一 Child WebView 与 Session。只改变可信窗口归属 MUST NOT 改变 identity、entry、route、origin、resource generation、attempt、Worker 或待处理任务。

#### Scenario: Launcher hides and restores current plugin

- **WHEN** the Launcher is temporarily hidden and restored while current plugin facts remain semantically equivalent
- **THEN** the Host reuses and focuses the same modeled Child WebView attempt and preserves its Page, Worker, and Session identity
- **THEN** restore performs no resolve, create, navigation, resource read, SDK bootstrap, model creation, or Worker creation

#### Scenario: Current plugin is replaced

- **WHEN** replacement commits a new resource generation
- **THEN** the Host first revokes the old bridge, Session, resource authority and cache eligibility and destroys the old Child WebView, then creates a new attempt
- **THEN** the old WebView, Worker, cached lookup, network callback, and late native event cannot affect the new generation

#### Scenario: Restore or terminate a Child attempt

- **WHEN** the Launcher restores the same valid Page or a lifecycle event terminates its attempt
- **THEN** Same-attempt restore MUST NOT resolve, create, navigate, read document resources, bootstrap the SDK, recreate a model or Worker, or show a fresh plugin-page loading cycle.
- **THEN** 真实关闭、所属窗口内 Page replacement、retry、Session disconnect 或 bridge fatal failure MUST 终止该实例；disable、uninstall、replacement、upgrade 和已提交 development reload MUST 终止受影响 generation 的全部实例；应用级 Host reload、App teardown 和进程退出 MUST 清理全部实例。分离导致 main 返回 Home 或呈现组件 unmount MUST NOT 终止已移交实例。breaker 只阻止新建，不销毁健康兄弟实例；不得留下无窗口所属的隐藏 Runtime、pool 或后台执行。

#### Scenario: Validate Child activation and terminal cleanup

- **WHEN** deterministic tests evaluate same-attempt activation and terminal lifecycle behavior
- **THEN** Deterministic controller, state, call-count, and cleanup tests MUST cover these invariants without target macOS latency sampling.

#### Scenario: Main returns Home after transfer
- **WHEN** Host 已提交 A 的独立窗口归属并卸载 main 的旧插件呈现
- **THEN** A 的 document、Worker、Session、请求及 activation 保持，main 的 teardown 仅释放旧呈现绑定
- **THEN** A 后续真实关闭仍使用同一实例的幂等终止路径


## ADDED Requirements

### Requirement: Presentation updates MUST validate instance ownership across transfer

每次窗口呈现更新 MUST 同时验证实例、实际来源和当前所属窗口。窗口分离后，旧归属的 slot revision、可见性和焦点操作 MUST 失效，即使它们晚于新窗口操作完成；更新 MUST NOT 按相同 plugin/Page 文本重定向到其他实例。

#### Scenario: Late source-window update reaches a detached instance
- **WHEN** 原主窗口的异步 resize、hide、focus 或 destroy completion 在 A 已分离后到达
- **THEN** 更新因归属过期而无副作用，A 仅接受其新窗口的有效呈现更新
- **THEN** main 新实例 B 不接受 A 的旧更新

#### Scenario: Recovery-required state retains objects and blocks ordinary presentation changes
- **WHEN** 同一 Child WebView 的分离补偿无法确认且进入 `recovery_required`
- **THEN** Host MUST 保留该原生对象、Session、事务和原始恢复快照，冻结受影响 owner 的普通 slot/visibility/focus 更新；恢复失败反馈 MUST 使用可信 Host 呈现，不得自动销毁插件来换取可见错误页
- **THEN** 只有同一 attempt/token 的明确恢复可继续补偿；清理可能承载原 Child 的目标前 MUST 确认真实 native 归属，并保持主窗口修复和退出入口可见
- **THEN** 明确终止和 generation 失效仍按既有当前来源与租约边界清理，迟到呈现或恢复不能命中其他实例或复活旧对象
