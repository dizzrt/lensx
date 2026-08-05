## Why

Task 4.2 已经能够在当前 Plugin Page 活跃时创建并销毁隔离 iframe，但 iframe 的 `loaded` 只表示浏览器完成加载，Host 仍没有一种不可伪造的方式确认消息来自哪一个当前插件、版本、Page 和 Runtime generation。现在需要先建立 Host 私有的 Runtime Session 身份与来源绑定，才能让后续 SDK iframe transport 和 Host API Dispatcher 在可信身份上工作，而不是相信插件消息自报的 `plugin_id`。

## What Changes

- 新增进程内、Host 私有的 Runtime Session 能力，将当前 iframe 的真实 `contentWindow`、严格 origin、一次性 nonce、专用 `MessagePort` 与 Host 推导的 plugin、version、Page、entry/resource generation、Runtime attempt 和实际 grant snapshot 绑定。
- 定义最小认证握手和 `awaiting_handshake → ready → disconnected/disposed` 状态语义；iframe `loaded`、Session `ready` 与未来 SDK `ready` 保持不同含义。
- 使用一次 window `postMessage` 完成精确 `targetOrigin` 的 bootstrap 和 Port transfer；认证完成后 Session 通信只使用专用 Port，并拒绝错误 window/origin、畸形或重复握手、过期 nonce、旧 attempt、旧 generation、已禁用/不兼容/已移除插件及跨插件消息。
- Session 身份只来自当前 Page、Registration detail 和 Resource/Runtime descriptor；requested permissions 不得变成 grants。相关插件的身份、generation 或 grant snapshot 改变时撤销 Session，无关插件变化不得误伤当前 Session。
- 在当前 iframe 容器生命周期中建立和释放 Session 自身的 window listener、nonce 与 Port；Host reload 后不得恢复或复用旧 Session。通用超时、崩溃循环、自动恢复、完整 CSP 与所有 pending RPC 清理仍留给 Task 4.4/5.2。
- 增加正常、伪造来源、跨插件、重放、同版本 replacement/retry、grant 变化和无关 Registration 变化的自动化 fixtures，并用目标 macOS WKWebView 验证 sandboxed isolated-origin iframe 的 `event.source`、`event.origin`、MessagePort transfer、nonce 和旧 Port 失效边界。
- 更新 canonical English 架构/验证文档及对应 Simplified Chinese 镜像，明确当前已交付与仍属后续 Task 的边界。
- 用户可见行为仅是当前插件页面在后台建立可信 Session；本 change 不新增管理 UI，不把握手失败伪装成已交付的 Host API，也不改变现有 Host Page、Launcher 或 iframe 加载反馈。
- 非目标：不定义或实现公共 SDK iframe transport、JSON-RPC/request ID、Host API method、permission decision/授权 UI、插件私有存储、完整 Runtime CSP、通用 handshake timeout/crash recovery、后台 Runtime、sidecar、Windows/Linux Runtime 或 Registration Contract 的 active Runtime 状态。

## Capabilities

### New Capabilities

- `plugin-runtime-session`: 定义 Host 私有、进程内 Runtime Session 的可信身份、来源认证、一次性 MessagePort 握手、状态/撤销语义、安全失败、平台证据和后续 transport 消费边界。

### Modified Capabilities

- `plugin-iframe-runtime`: 将 iframe descriptor/currentness 从“任何全局 Registration revision 变化都重建”收窄为“刷新并比较当前插件相关 entry、generation、Page 与 origin 事实”；无关插件变化不得重建当前 iframe 或撤销其 Session，相关事实变化仍必须 fail closed。

现有 `plugin-registration-contract`、`plugin-manager` 与 `plugin-sdk-foundation` 的已接受要求保持不变；本 change 通过新的下游 capability 消费其边界。

## Impact

- 主要影响 `src/app/plugins/runtime/` 的 Host 私有 resolver、iframe ref/container、Session service、严格消息 parser 与测试注入边界，以及 App/Plugin surface 的依赖组装。
- 读取现有 Registration snapshot/detail 和 grant facts，但不修改持久化记录，不把浏览器对象传入 Rust，也不扩展插件可导入的公共 Contract/SDK/UI/Testkit API。
- 扩展 macOS WKWebView Runtime harness、focused frontend/security gate、共享正常/恶意 fixtures、workspace/package-boundary 检查以及完整前端/Rust验证。
- 更新 `docs/en/architecture/extension-platform.md`、`docs/en/architecture/overview.md`、`docs/en/development/validation.md` 及其 `docs/zh/` 镜像；实现和验证完成前不勾选 `plugin-roadmap.md` Task 4.3。
- 不引入新的运行时依赖或组件库。
