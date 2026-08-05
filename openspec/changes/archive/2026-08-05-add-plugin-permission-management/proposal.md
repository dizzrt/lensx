## Why

当前 Host API Contract、Runtime Session、Dispatcher 和 Plugin Manager 已经分别具备权限需求映射、可信 grant snapshot 与持久化字段，但尚未形成一条由 Host 强制执行的完整授权链：Manifest 请求仍不能被正式授予或撤销，`clipboard.*` 也因缺少权限与 native provider 而始终不可用。Task 5.5 需要把这些既有边界收敛为最小权限管理能力，让授权决定可持久化、可逐调用复核，并在变更后立即终止旧 Session。

## What Changes

- 新增 Host-private permission catalog，仅覆盖 Host API `0.1.0` 已声明的 `clipboard.read` 与 `clipboard.write`，定义稳定权限 ID、风险等级、对应方法和当前 Host 支持状态。
- 新增可信的权限状态读取与 grant/revoke 写边界；只有当前 Registration 的 Manifest 已请求且 Host 当前支持的权限才可被授予，Manifest 请求、官方来源、Publisher 文本或插件输入均不得自行形成授权。
- 让 Plugin Manager 原子持久化规范化 grant snapshot，并在授权变化时推进 Registration revision、发布既有 invalidation，使活跃 Runtime Session 立即失效；升级仍只保留“旧 grant 与新请求”的交集。
- 在 Host API Dispatcher 的每次显式权限调用前，依据当前 Registration、Manifest 请求、Host 支持、真实 grant 和 Session currentness 重新授权；拒绝使用稳定 `permission_denied`，provider 缺失或 Host 不支持使用稳定 `unavailable`。
- 为纯文本 `clipboard.read`/`clipboard.write` 接入受限 Host service 与窄 Rust/Tauri native boundary，并保持读写权限彼此独立、输入输出有界且不暴露原生对象。
- 更新英文架构文档及其简体中文镜像，明确权限请求、持久化 grant、Session 有效权限、capability snapshot 和逐调用授权的区别。
- 不包含 Task 6.2 的安装/升级授权弹窗、设置页或其他权限 UI；不包含 Task 5.6 的通用 RPC 大小、并发、频率和超时限制；不新增文件、网络、Shell、进程、外链或任意 Tauri 权限。

用户可见影响：具备有效 `clipboard.read` 或 `clipboard.write` grant 的插件可通过现有公共 SDK 调用对应能力；未声明、未支持、未授权、已撤销或旧 Session 的调用会被稳定拒绝。此 change 不提供普通用户自行授予权限的界面，授权交互仍由后续 Task 6.2 交付。

## Capabilities

### New Capabilities

- `plugin-permission-management`: 定义 Host-private permission catalog、可信 grant/revoke 状态转换、逐调用授权、立即撤销语义，以及纯文本剪贴板权限 provider 的安全边界。

### Modified Capabilities

- `plugin-manager`: 增加 revision-bound、原子且声明受限的 grant snapshot 更新能力，并保持恢复、升级和失败回滚语义。
- `plugin-host-api-dispatcher`: 将具备当前授权与 native provider 的 `clipboard.read`/`clipboard.write` 纳入真实 dispatch 和 capability discovery，并在每次调用前重新授权。

## Impact

- Rust/Tauri：Plugin Manager grant mutation、窄文本剪贴板 command/service、序列化请求/响应、应用 setup 与测试。
- React/TypeScript Host：permission catalog/service/desktop adapter、Dispatcher clipboard provider、Registration invalidation 与 Runtime currentness 集成；不新增产品 UI。
- 公共 Contract/SDK：不新增方法、权限或公开类型；继续使用 Host API `0.1.0` 的既有 clipboard Schema、错误和 capability 语义。
- 持久化：沿用现有 Plugin Manager record 的 `granted_permission_ids`，不引入第二套授权数据库或自动迁移授权。
- 文档与验证：更新 `docs/en` 和 `docs/zh` 对应文档，新增前端与 Rust 授权/剪贴板测试，并纳入完整 workspace 与桌面验证。
- 依赖：不新增前端依赖、组件库或通用 clipboard plugin；macOS Rust target 将把锁文件中已有的 `objc2-app-kit` 与 `objc2-foundation` 声明为直接依赖，以实现不公开额外 IPC surface 的窄原生文本剪贴板边界。
