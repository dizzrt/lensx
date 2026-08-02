## Why

当前仓库已经具备可发布的 Plugin Manifest Contract 和公共 workspace 边界，但插件作者仍缺少一个不依赖 Host 私有代码或具体 UI 框架的运行时 SDK 边界。现在建立 SDK foundation，可以先稳定客户端生命周期、transport 抽象、版本兼容和错误语义，再由后续 change 分别接入 Runtime session、真实 iframe transport 与具体 Host API，避免把私有消息协议固化为插件公共 API。

## What Changes

- 新增可独立构建、测试和打包的公共 workspace package `@lensx/plugin-sdk`，其首个 package/SDK 版本为 `0.1.0`。
- 提供实例化的 SDK client foundation，定义初始化、ready、disconnect、dispose 等生命周期以及幂等销毁行为，不引入全局 singleton。
- 定义框架无关的 transport interface 及其请求、事件、取消、超时和断开语义；允许非浏览器测试注入 transport，但不公开真实 iframe 或 `postMessage` envelope。
- 定义稳定、可判别且不泄漏 Host 原始异常的 SDK 错误模型，区分取消、超时、断开、已销毁和 Host API 不兼容。
- 定义只读、版本化的 Runtime context 公共类型，首版覆盖 Host API 版本、locale、theme 和 capability snapshot；这些值只可由受信任 transport 提供，不能由插件覆盖身份或权限事实。
- 让 SDK 复用 `@lensx/plugin-contract` 的 Host API 版本事实源，同时公开独立的 SDK 版本和受支持 Host API 范围，避免重复定义当前 Host API 版本。
- 建立受限 package exports、真实 tarball 外部消费验证、公共声明边界检查以及 workspace 聚合验证。
- 更新 canonical English 插件架构/开发文档及其 Simplified Chinese 镜像，明确已交付 SDK foundation 与尚未实现 Runtime 能力的区别。
- 明确非目标：不实现 iframe、MessagePort/`postMessage` transport、握手与来源验证、Runtime session、具体 Host API method、权限决策、插件注册/执行，也不向插件作者发布 Testkit fake transport。

## Capabilities

### New Capabilities

- `plugin-sdk-foundation`: 定义 `@lensx/plugin-sdk` 的公共客户端生命周期、Runtime context 类型、transport 抽象、请求/事件/取消/超时语义、SDK 错误、版本兼容和发布边界。

### Modified Capabilities

无。

## Impact

- 新增 `packages/plugin-sdk` workspace package，并由现有根 `build`、`typecheck`、`test` 和 `check` 聚合命令覆盖。
- SDK 通过公开 package export 依赖 `@lensx/plugin-contract`，不依赖 private root Host、`src/app/**`、React、Semi Design、Tauri、DOM 或 Node filesystem runtime API。
- 增加 package-local Rstest/typecheck/build/pack 验证、外部 tarball consumer 以及必要的 workspace/package 边界测试。
- 更新 `docs/en/architecture/extension-platform.md`、`docs/en/development/plugin-workspace.md` 及相同相对路径的中文镜像；不改变当前 lensX UI、Rust/Tauri Runtime 或插件可安装/可执行状态。
