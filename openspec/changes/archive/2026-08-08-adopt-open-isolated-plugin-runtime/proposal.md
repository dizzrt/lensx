## Why

lensX 当前已经交付逐权限声明、持久化 grant、Host 授权界面和严格插件 CSP，但这套模型让每一种标准 Web 能力都需要平台先建模和放行，阻碍插件框架搭建与生态快速扩展。Task 7.2 的首个官方 JSON 工具需要 Monaco Worker，也暴露出当前平台应先明确新的信任边界：用户安装即表示信任插件处理主动交给它的数据，lensX 聚焦保护 Host 与插件间隔离，而不在现阶段审查插件自身的 Web 行为。

## What Changes

- **BREAKING**：采用“开放 Web、封闭 Host”的安装信任模型。插件在自己的隔离 Runtime 中可使用目标 WebView 支持的 Worker、网络请求、远程资源、`blob:`、`data:`、WASM 与浏览器存储，不再经过 lensX permission catalog、grant 或授权弹窗。
- **BREAKING**：将 Host-owned 插件 CSP 从内容行为白名单收窄为隔离与嵌入保护边界；继续固定可信 Host ancestor、独立插件 origin、无 Tauri/Host DOM/跨插件访问、禁止顶层导航与逃逸，并保持生命周期、超时、熔断和单 iframe 约束。插件可以自行声明更严格的内容策略，但不能削弱 Host 隔离策略。
- **BREAKING**：从 Manifest Contract 移除 `requested_permissions` 与 Page `required_permissions`，并从公共 Host API Contract 移除 `clipboard.read`、`clipboard.write`、Host API permission catalog 及权限专用语义；版本按 breaking change 演进，不提供旧字段的静默忽略或别名。
- **BREAKING**：移除 Host-private permission catalog、持久化 grant authority、逐调用权限复核、原生剪贴板 provider、安装/替换权限选择、Settings grant/revoke UI 与权限导致的 Runtime capability 裁剪。已有 grant 数据必须通过显式、幂等、可恢复的迁移被丢弃，不能继续产生权威或泄漏到 UI/日志。
- 保留并强化真正的平台边界：每个插件与 generation 的独立 origin、资源和存储命名空间、严格 iframe/Session 身份、Host-private Tauri/Rust 边界、路径与包摄入安全、页面退出时完整终止 Worker/Session/Port，以及防止单插件拖垮 Launcher 的资源保护。
- 官方、外部和开发插件使用相同 Runtime。来源不改变能力；官方插件可以通过发布规范选择离线、自包含、可复现等更严格质量标准，但这些不成为 Host Runtime 权限。
- 更新双语开发文档、项目模板、CLI/Contract fixtures、发布 gate 与路线图依赖，使 Task 7.2 可以作为无 Host 权限的 Monaco/JSON 工具消费者；重新描述或推迟依赖 Host 剪贴板权限的 Task 7.3。

### Goals

- 让普通 Web 技术无需新增 lensX 权限模型即可用于插件开发。
- 把强制安全边界集中在 Host、Tauri、插件身份、跨插件隔离、资源所有权和 Runtime 生命周期。
- 删除当前预览阶段尚未形成产品生态的 permission/grant 兼容负担，为 Task 7.2 提供清晰前置契约。
- 让信任、行为透明度和社区治理与 Host 原生 authority 分离。

### Non-goals

- 不在本 change 中实现 Task 7.2 JSON 工具或引入 Monaco。
- 不新增文件系统、Shell、进程、系统通知、相机、麦克风等 Host 原生特权 API；“无 lensX 权限控制”不等于向插件暴露 Tauri 或任意 Rust 命令。
- 不交付 Marketplace、评分、举报、自动代码审查、签名或远程分发；这些可在后续作为非授权型的生态信任能力建设。
- 不完成 Task 7.5 的全部资源限制，但必须覆盖本 change 新开放执行上下文的最小生命周期与稳定性证据。
- 不保证每个 Web API 在所有平台 WebView 上可用；只对实际声明支持并通过目标 WebView 证据的开放 Runtime 基线负责。

### User-visible impact

- 安装、升级和插件设置不再展示逐权限授权、grant/revoke 或权限差异；安装插件本身成为对该插件 Web 行为的信任决定。
- 插件可在自己的隔离页面中正常使用 Worker 和网络等 Web 能力，但仍无法访问 lensX Host、其他插件或未公开的原生能力。
- 已安装旧权限契约插件会按明确的 Contract/Host API 兼容规则进入不兼容或迁移状态，不会被静默赋予原生能力。

## Capabilities

### New Capabilities

- `open-isolated-plugin-runtime`: 定义安装即信任的开放 Web Runtime、Host/跨插件强隔离、插件自主管理内容策略以及无 lensX grant 的能力边界。

### Modified Capabilities

- `plugin-runtime-security-lifecycle`: 将插件内容 CSP 从 Web 行为白名单改为隔离型 Host 策略，并覆盖 Worker/网络等开放上下文的终止与真实 WebView 证据。
- `plugin-iframe-runtime`: 保留固定 sandbox、独立 origin 和单 iframe 所有权，但不再用 iframe capability policy 表达 lensX 逐权限授权。
- `plugin-manifest-contract`: 移除 permission request 与 Page permission gate 字段并演进 Manifest 版本。
- `plugin-host-api-contract`: 移除剪贴板方法、权限 catalog 和权限专用公共语义并演进 Host API 版本。
- `plugin-contract-package`: 从公共 Contract package 导出与生成链删除 permission union、permission catalog 和权限专用 fixture 语义。
- `plugin-sdk-foundation`: 让 SDK client、Runtime Context 与 error boundary 只消费 Host API `0.2.0` 的非权限语义，不再把 permission denial 当作当前 Contract error。
- `plugin-sdk-iframe-transport`: 从 private wire、Port lease authority 与 transport delivery 边界删除 grant/permission facts，同时保持 identity/currentness/cancellation 隔离。
- `plugin-rpc-validation`: 从 recoverable error 与 protocol validation 语义删除 permission-aware Dispatcher 和 `permission_denied`，保持 budget、correlation 与 terminal isolation。
- `plugin-developer-cli`: 让 inspect/create/build/validate/pack 的结果只表达内容与兼容性，不再生成或描述 permission authorization。
- `plugin-project-template`: 将两个模板升级为 Manifest `0.2.0` 的开放 Web、无 grant 示例，并删除空 permission 声明与授权教程语义。
- `plugin-host-api-dispatcher`: 移除 grant 派生、permission-backed clipboard provider 和相关 capability 分支，保留身份绑定的非特权方法。
- `plugin-permission-management`: 删除 Host permission catalog、持久 grant、逐调用授权和原生剪贴板 permission capability。
- `plugin-permission-prompts`: 删除安装、替换和 Settings 的权限展示、确认、grant 与 revoke capability。
- `plugin-manager`: 删除持久化 grant snapshot 与 grant mutation authority，并定义旧记录迁移。
- `plugin-registration-contract`: 从 Registration detail 与 invalidation 语义中移除 permission/grant authority。
- `plugin-runtime-session`: 从 Session identity 与 current-fact invalidation 删除 grant snapshot，保留 entry/Page/generation/attempt/origin 的 Host 派生身份。
- `local-plugin-installation`: 安装提交不再创建或应用 grant，不再包含权限选择流程。
- `plugin-lifecycle-controls`: 卸载和生命周期收敛不再读取、删除或恢复 grant authority，并保持 program/data policy 分离。
- `plugin-upgrade-and-rollback`: 替换流程不再计算 permission diff 或保留 grant 交集。
- `plugin-management-settings`: 移除 permission 状态、grant/revoke 控件和对应交互状态。
- `plugin-development-mode`: reload 不再保留 grant 或复用 permission boundary，仍与正式 Runtime 使用相同隔离策略。
- `plugin-page-navigation`: Page 可用性不再由 `required_permissions` 裁剪。
- `plugin-action-projection`: Action eligibility 与 Page-target execution 不再读取 Manifest permission request 或 Registration grant facts。
- `plugin-scoped-storage`: storage namespace、clear 与重装数据所有权边界不再投影或保留 grant state。
- `plugin-package-format`: `.lxp` 继续拒绝旧 permission fields，并把 package validation 与已删除的 permission result 完全解耦。
- `plugin-resource-service`: 让 scoped resource eligibility、CSP response 与 lifecycle currentness 只依赖当前 Host facts，不再读取 permission/grant state。
- `plugin-development-documentation`: 将权限指导改写为安装信任、开放 Web、封闭 Host 和社区治理边界。
- `official-plugin-release-pipeline`: 发布 gate 不再依赖已删除的 permission capability，并保持官方来源不产生 Host authority。

## Impact

- 公共契约与包：Manifest Schema/生成类型/fixtures、Host API Schema/catalog/SDK/Testkit/CLI 模板及其 SemVer 兼容范围。
- Rust Host：Plugin Manager Store/恢复迁移、Registration projection、安装与替换、permission/clipboard commands/provider、Resource response CSP 和真实 WKWebView harness。
- React Host：root composition、Runtime context、安装/替换确认、插件管理详情、权限服务与双语/可访问交互删除。
- Runtime：iframe sandbox、Permissions Policy、CSP headers、Worker/网络/远程资源行为、Session/Port teardown 和跨插件负面测试。
- 自动化：Contract/Rust fixture drift、consumer tarballs、package/CLI、official release、development mode、Runtime security、安装/替换、管理 UI 及完整 frontend/Rust gates。
- 文档与路线图：English canonical 与 Simplified Chinese mirrors、Task 7.2 前置关系、Task 7.3 定位以及当前能力状态说明。
