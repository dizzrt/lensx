## Why

Host API `0.1.0` 已经公开定义 `storage.get`、`storage.set`、`storage.delete`、`storage.list` 和 `storage.get_quota`，但当前生产 Dispatcher 对这些方法仍返回 `unavailable`，插件只能依赖与 Runtime generation 绑定的浏览器存储，无法获得稳定、可升级且受 Host 生命周期管理的持久数据。Task 5.4 需要补齐一条由可信 Session 身份派生 namespace、由 Rust 持久化并能隔离故障的真实存储路径，为后续权限管理、RPC 校验和正式插件模板提供可用基础。

## What Changes

- 新增 Host-private 插件存储服务，在既有 `app_local_data_dir()/plugins/data/<plugin-key>` 边界内按插件身份按需建立持久化 key-value namespace。
- 让生产 Dispatcher 将五个现有 `storage.*` 方法路由到真实 provider，并在 provider 可用且 Session 当前有效时将它们加入 Runtime Context capabilities。
- 只接受现有 Contract-valid 的 key、JSON value、分页参数和结果；namespace、真实路径与插件身份始终由 Host 从已认证 Session 推导，不接受插件自报。
- 定义并执行 key、JSON 嵌套、单值、namespace 总容量、分页和 cursor 的具体限制，使用现有稳定 Host API 错误表达超限、冲突、不可用、取消和内部失败。
- 定义跨重启恢复以及升级、禁用、卸载保留、卸载删除和同身份重装行为，并与现有 Plugin Installer 数据子树和 cleanup intent 协调。
- 将单插件损坏、异常文件、符号链接、半写入和持久化失败限制在所属 namespace；Host 启动与其他插件存储不得因此失败。
- 增加 Rust、TypeScript、真实 Dispatcher/transport 集成、生命周期回归和隔离消费者验证，并同步英中文档与路线图状态。

**目标**：交付一套跨重启、跨兼容升级、按可信插件身份隔离且具备确定性限制与诊断的私有存储能力。

**非目标**：不增加新的公共 Host API method 或 permission，不提供任意文件/数据库访问、跨插件共享、云同步、数据迁移框架、管理 UI、权限提示、通用 RPC 资源限制、模板、CLI 或开发模式。

**用户可见影响**：使用公共 SDK 的官方或第三方插件可以通过现有 `storage.*` 方法可靠保存自己的设置与状态；普通 lensX 用户不会在本 change 中获得新的管理界面。

## Capabilities

### New Capabilities

- `plugin-scoped-storage`: 定义可信 namespace、持久化 key-value 操作、具体配额与分页限制、原子写入、损坏隔离、恢复和插件生命周期语义。

### Modified Capabilities

- `plugin-host-api-dispatcher`: 将五个 `storage.*` 方法从稳定 `unavailable` 占位切换为真实 Session-scoped provider，并按当前 provider 可用性暴露 capabilities。

## Impact

- **Rust/Tauri**：新增 Host-private 存储状态、持久化模型、窄 Tauri command、启动恢复与 Installer 数据根协作；继续由 Rust 独占真实路径、文件 I/O 和原子写入。
- **React/TypeScript Host**：新增严格解析的 desktop adapter/provider，扩展 Dispatcher 依赖、错误映射、capability 计算和生产 App 组合；不新增公共 Host-private 导出。
- **公共 Contract/SDK**：复用现有 `0.1.0` method、params、result 和错误结构，不产生 breaking change；仅增加这些 method 的生产可用性。
- **生命周期**：复用既有独立 data subtree、`retain_data` / `delete_data` cleanup intent 和同身份 replacement/reinstall 规则，不改变 Manifest、grant 或 package identity。
- **测试与文档**：新增共享边界夹具、Rust/TypeScript 单元与集成测试、独立消费者门禁，并更新 `docs/en`、`docs/zh` 和 `plugin-roadmap.md`。
- **依赖**：优先使用现有 Rust/TypeScript 依赖和标准库；任何新增运行时依赖必须在设计与实现中单独证明必要性。
