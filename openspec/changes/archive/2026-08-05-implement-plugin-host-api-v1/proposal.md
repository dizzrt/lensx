## Why

公共 Host API Contract、认证后的 Runtime Session Port 和官方 iframe transport 已经交付，但生产 Host 仍为每个插件请求返回稳定的 `unavailable`，因此插件 SDK 无法获得真实 Runtime Context，也无法调用任何 lensX 行为。现在需要补上 Host 私有 Dispatcher，在不扩大公共 API、权限或 Runtime 信任边界的前提下，把首批无权限方法接到现有应用服务。

## What Changes

- 新增一个 Host 私有、封闭且可注入测试依赖的 Host API Dispatcher；它只接受 Runtime Session lease 派生的可信 identity、Contract-valid request 和 Host-owned cancellation signal。
- 在生产 Runtime 组合中用真实 Dispatcher 替换固定的 `unavailable` handler，同时保留 transport 的来源/currentness、取消、终止和结果校验边界。
- 实现 `runtime.get_context`，从 Host 当前版本、locale、theme、方法实现可用性和有效授权事实生成完整、排序且不泄露 identity/grant 的 capability snapshot，并在适用状态变化时发布完整 `runtime.context_changed` replacement。
- 实现 `ui.close`，仅允许当前 Session 请求关闭自己的当前 Plugin Page；成功结果必须先完成 transport handoff，再由 Host 执行带 currentness 检查的终止导航。
- 实现 `actions.open`，只接受调用插件的局部 Action ID，由可信 plugin identity 推导全局 Action ID，并复用现有 Launcher Action Registry 与 Dispatcher；拒绝 core、其他插件、未知或不可用 Action。
- 对未声明方法、已声明但本 Task 尚未实现的方法、失效 Session、无效目标、取消和内部失败返回封闭、稳定且不包含私有值的 Host API 错误。
- 增加聚焦测试、真实 transport/Runtime 集成证据以及英文架构和开发文档及其中文镜像。
- 非目标：本 change 不实现 `storage.*` 持久化、`clipboard.*` 原生执行、完整 permission catalog/授权/撤销、通用 RPC 大小/频率/并发限制、插件管理 UI、模板、CLI 或新的公共 Host API method。

## Capabilities

### New Capabilities

- `plugin-host-api-dispatcher`: 定义生产 Host 如何基于可信 Runtime Session 身份统一路由 Host API v1 请求、生成 Runtime Context、执行当前 Page 关闭和本插件 Action，并对尚未实现或不安全的调用失败关闭。

### Modified Capabilities

无。

## Impact

- 前端 Host 私有 Runtime transport 组合将从固定 unavailable handler 改为注入 Dispatcher，但公共 iframe wire、SDK transport interface 和 Host API Contract 保持兼容。
- 复用并收窄现有 App Navigation Service、Launcher Action Registry/Dispatcher、locale/theme 状态和 Runtime lifecycle 的调用边界；可能需要 Host 私有的“响应交付后副作用”与“仅关闭匹配当前 Session Page”接口。
- `@lensx/plugin-contract` 与 `@lensx/plugin-sdk` 不增加公共方法、identity 字段或 trust configuration；storage 和 clipboard 方法继续不出现在当前 capability snapshot，并返回稳定不可用结果。
- 本 change 预计不新增 Rust command 或依赖；后续 Task 5.4、5.5 才分别接入插件私有存储和需要显式权限的原生能力。
- 受影响验证包括 Dispatcher 单元测试、Runtime/transport 集成测试、Action/Navigation 回归、SDK tarball/browser consumer、macOS WKWebView 证据、前端全量门禁、Rust无回归门禁和双语文档一致性。
