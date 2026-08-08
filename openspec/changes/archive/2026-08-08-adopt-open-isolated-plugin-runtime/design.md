## Context

lensX 当前把插件视为既不可信又需要逐能力授权的 iframe 程序：Manifest 声明 permission，Host catalog 判断支持与风险，Manager 持久化 grant，Session 只暴露 grant 对应的 capability，Rust 在每次剪贴板调用前再次授权；同时 Host CSP 以 `default-src 'none'` 阻止网络、Worker、远程资源、`blob:` 与 `data:`。Task 6.2 已经把这条链路扩展到安装、替换和 Settings UI。

这套设计适合成熟的原生能力平台，但当前阶段的首要目标是建立可被普通 Web 开发者快速采用的插件框架。Task 7.2 希望使用 Monaco；如果每个标准 Web API 都先经过 Manifest、Host catalog、grant、Runtime profile 和 UI 建模，平台会成为生态扩展的串行瓶颈。

本 change 将威胁模型调整为：用户安装插件即信任该插件处理主动交给它的数据，插件行为由用户选择、开源审查与社区治理约束；lensX 强制负责的边界是 Host/Tauri、插件身份、跨插件 origin/资源/存储隔离、包和路径安全、导航逃逸、Runtime 生命周期及 Host 可用性。当前没有产品型官方插件，因此现在进行 breaking reset 的兼容成本最低。

## Goals / Non-Goals

**Goals:**

- 为插件提供无需 lensX grant 的开放 Web Runtime 基线，首先覆盖 Dedicated Worker、网络、远程资源、`blob:`、`data:`、WASM 和浏览器 origin storage。
- 删除 Manifest permission、Host permission catalog、持久 grant、permission-backed clipboard API 和所有授权 UI/流程。
- 保持官方、外部、开发插件相同的 Runtime，不按来源赋予额外 authority。
- 保持并自动证明 Host/Tauri 不可达、跨插件/跨 generation 隔离、路径/资源所有权、Session 身份和完整 teardown。
- 为 Task 7.2 提供明确、可测试、可归档的前置契约。

**Non-Goals:**

- 不实现 JSON Tools、Monaco 或其他具体插件。
- 不向插件开放 Tauri invoke、任意 Rust command、文件系统、Shell、进程或其他原生特权。
- 不承诺相机、麦克风、地理位置、系统剪贴板等每个浏览器/OS API 可用；本 change 不建立 lensX 对这些能力的授权 UX。
- 不交付 Marketplace、签名、评分、举报、远程分发或行为审计服务。
- 不一次完成 Task 7.5 的全部配额与滥用防护，只补齐开放 Web 上下文所需的最小生命周期、超时、熔断和 Host 响应性证据。

## Decisions

### 1. 安装是唯一的当前阶段信任决定

安装、开发注册或替换一个插件后，lensX 不再对插件自身的 Web 行为逐项授权。安装确认必须明确说明插件运行在隔离 Web 环境中，但可按自身实现访问网络和处理用户交给它的数据；确认不表示 lensX 审核、担保或持续监控其行为。

拒绝保留一个仅用于 Worker/网络的简化 grant 系统。那仍会要求每种 Web 能力进入 Manifest、catalog、持久化、升级 diff、Runtime policy 和 UI，不能解决平台扩展瓶颈。

### 2. “开放 Web”与“封闭 Host”使用不同强制边界

插件文档可使用目标 WebView 支持的普通内容与 fetch 能力。Host 不再通过自己的 CSP 把 Worker、远程 HTTPS/WSS 资源、网络连接、`blob:`、`data:` 或 WASM 作为 permission-gated 内容类别。插件可以在自身 HTML 中声明更严格的 CSP；浏览器会把它与 Host header 取交集，因此插件只能收窄自己的行为。

Host response 仍必须提供不可由插件覆盖的嵌入与隔离策略，至少绑定精确可信 Host ancestor，并继续提供 `nosniff`、`no-store`、作用域、generation、路径和无 Host CORS authority 等响应事实。Host main document CSP 不因本 change 放宽。

iframe 继续使用 Host-owned sandbox、referrer policy、独立 origin 和导航租约。插件不能决定 sandbox token、删除父页面 iframe 属性、打开 Host/Tauri origin、替换顶层页面、访问另一个插件 origin 或绕过 Resource Service。开放远程子资源和连接不等于允许远程 document navigation、popup、download、外部协议或嵌套执行上下文逃逸。

第一版明确支持页面生命周期内的 Dedicated Worker，包括 package、remote 与 `blob:` Worker；不承诺 SharedWorker、ServiceWorker 或脱离当前页面生命周期的后台执行。若目标 WebView 对持久 worker 产生可跨页面/generation 复用的 authority，Host 必须阻止或将该平台基线标记为未完成。

### 3. 移除 permission Contract，而不是把 grant 解释为默认允许

Manifest 升级到 `0.2.0`，删除：

- 顶层 `requested_permissions`；
- Page `required_permissions`；
- permission reason 与内部引用一致性规则。

Host API 升级到 `0.2.0`，删除：

- `clipboard.read` 与 `clipboard.write`；
- `HostApiPermission` catalog；
- permission requirement mapping；
- 仅为 permission denial 存在的公共语义。

保留的 `actions.open`、`runtime.get_context`、plugin-scoped storage 和 `ui.close` 都必须继续从当前 Session identity 与 Host facts 派生，不能变成任意 Host executor。`PluginRuntimeContext.capabilities` 继续表示当前 Session 实际提供的非特权 Host API 方法，但不再是 grant projection。

拒绝“保留 permission 字段但忽略”的替代方案。静默忽略会让作者和用户误以为声明仍有保护效果，也会让升级 permission diff 产生虚假安全信息。

### 4. 删除原生 clipboard provider；不把取消权限等同于自动放权

Rust `plugin_permission` command/state、AppKit text clipboard provider、Frontend permission service 和 Dispatcher clipboard provider 全部退出生产组合。没有 lensX permission system 时，Host 不应把敏感原生能力无条件暴露给任意已安装代码。

插件只能使用开放 Web Runtime 实际提供的浏览器 API；相机、麦克风、系统剪贴板等受 WebView、Permissions Policy 或 OS 约束的能力不在本 change 的支持承诺内。Task 7.3 必须重新设计为浏览器能力 dogfood、延后到未来原生 authority 模型之后，或从当前路线图移除；不得继续依赖已删除的 Host clipboard permission contract。

### 5. 持久数据使用 hard-cut migration，不伪造新 Manifest

Plugin Manager record 格式升级。新记录不再保存 `granted_permission_ids`，Registration snapshot/detail 不再投影 grants，安装、替换、开发 reload 和 lifecycle 操作也不再接受或保留 grant。

旧 record 同时包含 Manifest `0.1.0` 和可能存在的 grants。Host 不把旧 author Manifest 静默改写成 `0.2.0`，也不让旧 grant 产生 authority：恢复时以稳定、无敏感信息的“不兼容平台契约”状态隔离旧 registration，保留 program/data 供用户显式移除或安装新包。重复启动必须得到相同结果，不能部分迁移、自动授权、删除用户数据或把 package bytes 与已存 Manifest 伪装成一致。

开发 registration 是进程内状态，升级后的 Host 不恢复旧进程状态；重新注册时必须使用 Manifest `0.2.0`。

回滚到旧 Host 只允许读取其原本理解的旧记录；新 record version 必须由旧 Host fail closed，而不是猜测字段。实施前必须用临时 Store fixture 证明向前迁移和回滚失败边界。

### 6. 权限 UI 与流程整段删除，不保留只读残影

安装/替换准备结果与确认模型升级，删除 permission candidates、added/removed/retained diff、transient selection 和 post-commit grant sequence。安装与替换仍保持 immutable candidate、prepare/confirm/commit、revision、TOCTOU 和恢复边界。

Settings 详情删除 permission section、grant/revoke Modal、mutation adapter、相关 pending/conflict/partial-grant 状态和 i18n copy。空、加载、degraded、quarantine、lifecycle、replacement、data management、development controls、键盘/focus 和主题能力必须保持。

### 7. 开放内容不能削弱可用性与跨插件隔离证据

Runtime harness 必须在真实目标 WKWebView 中证明：

- package 和 remote module/resource 可按开放基线加载；
- Dedicated Worker 可启动、通信并在页面 teardown 后终止；
- `fetch`/WebSocket 等连接遵循浏览器标准且不能取得 Host credentials、Tauri IPC 或其他插件 origin；
- `blob:`/`data:` 内容只存在于当前插件执行空间，不能导航 Host、打开新的未隔离上下文或跨 generation 恢复；
- official、external、development source 得到相同结果；
- disable、uninstall、replacement、reload、close、crash 与 Host exit 后没有可控 Worker、Port、iframe、lease 或旧 origin authority；
- 恶意并发、消息与失败不会使 Launcher 失去响应。

Task 7.5 仍拥有完整 CPU、内存、频率和恢复配额。本 change 只交付足以安全启用第一批开放上下文的基线证据，不能把浏览器正常加载等同于 Host 稳定性证明。

### 8. 社区治理提供透明度，不进入 Runtime authority

Publisher、repository、release digest、source 和未来扫描/评分信息可以帮助用户选择插件，但不能改变 sandbox、origin、Session、Host API 或 Runtime 结果。官方插件可在 release gate 中要求自包含、离线或可复现，但外部插件不因缺少这些标签被 Host permission system 拦截。

## Risks / Trade-offs

- **[插件可上传用户主动输入的数据]** → 安装说明和双语开发文档明确“安装即信任”；Host 保证隔离但不宣称审查插件行为，用户通过禁用/卸载和社区来源选择管理风险。
- **[远程代码让 `.lxp` digest 不再覆盖完整运行时行为]** → digest 继续只证明 package bytes；官方 release 可建立更严格自包含政策，但 Runtime 不把该政策提升为 authority。
- **[Worker 或网络滥用影响 Host 响应性]** → 保留单 iframe、deadline、breaker、完整 teardown，并加入真实 WebView 压力基线；完整资源配额仍由 Task 7.5 完成。
- **[删除公共 Contract 破坏现有预览插件]** → 在首个产品官方插件之前执行显式版本升级，旧 registration fail closed 且保留数据，不提供静默兼容。
- **[移除 clipboard 让已有示例失去能力]** → 同步更新模板、fixtures、文档与路线图；不以无授权原生访问维持表面兼容。
- **[开放 Web 与不同平台 WebView 行为不一致]** → 只声明通过自动化与真实 harness 证明的平台基线；unsupported API 由浏览器失败，不由 lensX 伪造成功。
- **[Host CSP 放宽误伤主文档]** → Host main CSP 与插件 response profile 使用独立常量和 drift gate，变更路径必须证明主文档字节级保持原策略。

## Migration Plan

1. 先升级 Manifest/Host API Schema、生成类型、fixtures 与公共 package 版本，使消费者在编译期看到 breaking boundary。
2. 升级 Manager record、Registration、installation、replacement 和 development contracts；加入旧 record/旧 package 的稳定隔离与恢复测试。
3. 删除 permission/clipboard Rust 与 React 生产组合、grant storage/projection 和授权 UI，确保不存在可调用的遗留 authority。
4. 更新 plugin response CSP、iframe policy 和真实 WKWebView harness，证明开放 Web 与 Host/跨插件隔离同时成立。
5. 更新模板、CLI、Testkit、official release gates、英文文档及中文镜像；保持 Task 7.2 未完成，只记录此前置 change，重新定位 Task 7.3。
6. 对所有受 breaking reset 影响的稳定 capability 做语义扫描，补齐 Contract package、SDK、transport、Runtime Session、Action、lifecycle、storage 与 package format 的 delta 覆盖；不得在未列入 delta 的旧 requirement 中残留正向 grant/clipboard authority。
7. 完成 focused 与完整验证后再同步英文稳定 specs；archive 遵循先 sync 后 archive。

回滚只能在没有写入新 Manager record 的开发环境直接使用旧代码。只要新 record 已写入，旧 Host 必须 fail closed；恢复旧行为需要显式数据/Contract 回退 change，不能通过重新启用旧 permission UI 或把新插件自动映射到旧 grants 完成。

## Open Questions

- 无阻塞问题。Task 7.2 是否把官方插件自包含/离线作为产品 release gate，由其独立 change 决定，不影响本 change 的公共 Runtime 边界。
