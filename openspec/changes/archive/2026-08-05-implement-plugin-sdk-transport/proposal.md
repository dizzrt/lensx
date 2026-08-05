## Why

当前 Host 已能为活跃插件 iframe 建立绑定可信 Session identity 的专用 `MessagePort`，公共 SDK 也已有可注入的语义 transport 与生命周期抽象，但两者之间仍没有可供真实插件使用的 iframe transport。结果是插件页面虽然能够完成 Host 私有握手，却无法只依赖公共 SDK 进行受控请求、响应、事件、取消和断开处理，也无法为后续 Host API Dispatcher 提供稳定入口。

## What Changes

- 在 `@lensx/plugin-sdk` 中提供官方、框架无关的 iframe transport 入口，消费 Host 转移的专用 `MessagePort`，并保持根入口及现有 fake transport 注入边界不依赖 React、Semi Design 或 Tauri。
- 在现有单次 bootstrap/ready acknowledgement 之后建立私有、版本化且严格封闭的 Port wire，覆盖 request ID、并发请求、响应、事件、取消、超时、断开、销毁和晚到消息抑制。
- 在公共 SDK 中增加由 Host API v1 Contract 类型驱动的窄调用入口；插件不能提交任意 method 字符串、传入可信 identity、扩展私有 envelope 或直接访问 `Window`、`MessagePort` 和 Host 对象。
- 在 Host 私有 Runtime 中增加 Port lease transport 适配边界，将已认证 Session identity 与请求一起交给可注入 handler，并将结果、Host API 错误、事件和终止信号安全送回插件。
- 通过真实 SDK、浏览器 iframe transport、Host Port 适配器和测试 handler 证明握手与 transport round-trip；生产 Host 在 Task 5.3 完成前不执行任何真实 Host API 副作用。
- 保留 Host API 错误与 SDK lifecycle/transport 错误的可判别性，不暴露原始异常、堆栈、URL、路径、payload、grant、Tauri/Rust/Host 对象或私有 wire 数据。
- 更新英文 canonical 架构、开发与验证文档及其简体中文镜像，并建立独立 transport focused gate 与真实 tarball/browser consumer 验证。

**非目标：**本 change 不实现 Host API Dispatcher 或真实应用副作用，不实现插件私有存储、权限授予/撤销、完整 RPC Schema 与资源限制、插件管理 UI、项目模板、CLI、开发模式、后台 Runtime、sidecar 或新的依赖框架。

**用户可见影响：**本 change 不新增终端用户界面。插件开发者获得受支持的公共 iframe transport 与类型化调用表面；在后续 Dispatcher 接入前，生产插件仍不能产生真实 Host API 效果。

## Capabilities

### New Capabilities

- `plugin-sdk-iframe-transport`: 定义认证 Port 上的私有 wire、插件侧 iframe transport、Host 私有 lease 适配、并发/取消/事件/断开生命周期、安全边界与独立交付验证。

### Modified Capabilities

- `plugin-sdk-foundation`: 在保持根入口、语义 transport 注入、无任意字符串调用和安全错误边界的前提下，增加官方 iframe transport 公共入口及由 Host API v1 Contract 驱动的类型化 SDK 调用能力。

## Impact

- **公共 package/API**：`packages/plugin-sdk` 的 exports、公共声明、SDK client 表面、browser transport 实现、测试和真实 tarball 内容；可能相应扩展 `packages/plugin-testkit` 的语义一致性覆盖，但不把私有 wire 变成 Testkit 公共 API。
- **Host 私有 Runtime**：`src/app/plugins/runtime/` 下的 Session Port lease 消费、transport handler 边界、终止清理和 Plugin Runtime Frame 集成；不新增插件可调用的 Tauri command。
- **共享契约**：复用 `@lensx/plugin-contract` 已发布的 Host API method、params、result、event 与 error 类型和验证器，不复制当前 Host API 版本或语义 Schema。
- **验证与示例**：增加 focused transport tests、malicious/late/race fixtures、真实 iframe/MessageChannel round-trip、SDK tarball browser consumer 和目标 WebView 证据；根 workspace 验证继续覆盖该能力。
- **文档**：更新 `docs/en/` 的 canonical 插件平台、workspace 和验证说明，并维护 `docs/zh/` 同路径镜像；不在 README 或 agent onboarding 中写具体设计。
- **依赖与兼容性**：预期不引入新的运行时依赖；现有 `createPluginSdk({ transport })` 与 fake transport 用法保持兼容，不构成 breaking change。
