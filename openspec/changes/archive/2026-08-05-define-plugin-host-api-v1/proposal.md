## Why

lensX 已经能够安装、注册、加载并认证隔离插件页面，但公共 SDK 仍没有一份可供插件、Host 与测试共同消费的 Host API 方法契约。现在需要在实现 iframe transport、Dispatcher、存储和权限系统之前，先冻结一个少量、真实、版本化且可独立验证的 v1 边界，避免各层分别发明 method、payload、权限与错误语义。

## What Changes

- 新增 Host API `0.1.0` 语义契约，定义 method、params、result、event、permission requirement 与安全错误的单一事实源。
- 首版纳入 `runtime.get_context`、`ui.close`、仅限调用者自身已投影 Action 的 `actions.open`、插件私有 `storage.get` / `storage.set` / `storage.delete` / `storage.list` / `storage.get_quota`，以及具备显式权限的 `clipboard.read` / `clipboard.write`。
- 让 `runtime.get_context` 成为 SDK 初始化 Context 的唯一语义来源；Context 只公开当前可调用 capability 快照，不接受插件自报身份、来源、grant 或 Host 生命周期事实。
- 在 `@lensx/plugin-contract` 中提供受限公共 Schema、生成 TypeScript 类型、纯校验 API、permission/method catalog、共享 fixtures 与真实 tarball 验证；保持 JSON Schema 为 wire-shaped author/consumer data 的结构事实源。
- 让 `@lensx/plugin-sdk` 的 Runtime Context 与 Host API 版本兼容检查复用公共 Contract 事实源，但仍不交付真实 iframe transport、Host API 调用方法或 Host 执行路径。
- 明确 v1 不包含打开外链：在没有同一 Milestone 内的具体实现与 dogfood 闭环前，不发布 `system.open_external` 或对应占位 permission。
- 明确本 change 不实现 MessagePort/RPC envelope、请求 ID、Dispatcher、存储持久化、权限授予/撤销、运行时 RPC 资源限制或任何新 UI。

## Capabilities

### New Capabilities

- `plugin-host-api-contract`: 定义 Host API v1 的方法目录、参数与结果、事件、permission requirement、错误、版本兼容、能力发现、废弃规则和独立 drift gate。

### Modified Capabilities

- `plugin-contract-package`: 扩展公共 Contract package，使其承载 Host API Schema、生成类型、纯校验、catalog、fixtures 与隔离 consumer 验证，同时保持受限 exports 和 Host-private 边界。
- `plugin-sdk-foundation`: 让 SDK Runtime Context 与 Host API 兼容检查消费共享 Contract 事实源，消除重复 Context 定义，同时继续禁止 raw method 调用和真实 iframe transport 声明。

## Impact

- 主要影响 `packages/plugin-contract`、`packages/plugin-sdk`、共享 TypeScript/Rust fixtures、package/workspace boundary gates，以及对应的中英文插件架构与开发文档。
- 后续 Task 5.2、5.3、5.4、5.5 和 5.6 将以本 Contract 为输入，分别实现 transport、真实 dispatch、存储、权限决策和 RPC 运行时校验。
- 当前插件用户不会立即获得可调用的 Host 能力；本 change 只交付公共协议与独立验证基础。
- 不新增运行时依赖，不新增 Tauri command，不扩大插件 CSP、网络、文件、Shell、进程或 Host 私有对象访问面。
