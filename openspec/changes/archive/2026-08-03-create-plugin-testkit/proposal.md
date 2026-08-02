## Why

当前 `@lensx/plugin-contract` 与 `@lensx/plugin-sdk` 已经提供可发布的公共边界，但插件作者仍需自行重写 Manifest、Runtime context、transport、取消与异步控制夹具，SDK 自身使用的 fake 也还是私有测试代码。现在需要一个独立、可发布且框架无关的 Testkit，让仓库内外消费者在不启动 lensX 桌面 Host 的情况下，以统一方式验证当前已交付的 Contract 和 SDK 生命周期。

## What Changes

- 新增公开的 `@lensx/plugin-testkit@0.1.0` workspace package，并将其纳入根级构建、类型检查、测试、静态检查和发布边界验证。
- 提供基于 `@lensx/plugin-contract` 公共类型与 API 的 Manifest fixture builder 和显式 mutation helper，分别服务有效输入与有意构造的无效输入，不复制 Manifest Schema 或规范化逻辑。
- 提供可覆盖且相互隔离的 Runtime context fixture、可编排的语义 fake transport、结构化取消控制器和 deferred 异步控制工具。
- 允许消费者观测连接、请求、取消、事件订阅、断开和 dispose 行为，并覆盖初始化成功、无效或不兼容 context、取消、超时、transport failure、Host 断开与幂等清理。
- 通过真实 Contract、SDK 与 Testkit tarball 的隔离外部 consumer 验证公共入口、声明、运行时消费、文件内容和依赖元数据；Task 1.6 再负责把 Testkit 接入正式插件项目模板。
- 更新英文架构与开发文档及其简体中文镜像，说明 Testkit 的用途、公共边界和后续扩展点。
- 修订 `plugin-roadmap.md` 的 Task 1.5 描述，使其与 Testkit core 边界一致，并继续把真实 Host API、权限和页面 Runtime harness 留给后续 Task。
- 明确非目标：本 change 不定义或模拟真实 iframe/message wire protocol、Host API 方法与错误 Schema、权限授权与判定、Plugin Manager、页面 Runtime、UI render harness 或插件执行路径；这些能力随 Milestone 4 和 5 的对应 change 扩展 Testkit。
- 此 change 不改变当前 `PluginSdkClient`，不增加任意字符串 Host 方法调用，也不把 capability ID 解释为 permission grant。

## Capabilities

### New Capabilities

- `plugin-testkit`: 定义公开 Testkit package 的 Manifest fixture、Runtime context fixture、语义 fake transport、取消/异步控制、生命周期场景、边界限制和真实 tarball 外部消费验证。

### Modified Capabilities

无。

## Impact

- 新增 `packages/plugin-testkit` 及其公共 TypeScript API、测试、构建与 pack 验证。
- 根 workspace 生命周期、依赖边界检查与聚合验证需要覆盖 Testkit package。
- Testkit 运行时仅依赖 `@lensx/plugin-contract` 和 `@lensx/plugin-sdk` 的公共入口，不依赖根 Host、React、Semi Design、Tauri、DOM 或测试运行器 API。
- `docs/en/architecture/extension-platform.md`、`docs/en/development/plugin-workspace.md` 及对应 `docs/zh/` 镜像需要从“Testkit 尚未交付”更新为准确的已交付边界说明。
- `plugin-roadmap.md` 的 Task 1.5 范围与完成标准需要消除当前时序冲突；apply 阶段不提前勾选或写入尚不存在的 archive 链接。
- 当前桌面 Host、Launcher、Rust/Tauri 命令、插件安装与运行行为不发生变化。
