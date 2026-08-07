## Why

lensX 已经交付公共 Plugin Developer CLI 和正式隔离 Runtime，但开发者每次修改插件后仍需生成 `.lxp`、执行安装或替换并重新打开页面，反馈周期过长。现在需要补齐一条显式启用、可快速手动 reload、但不削弱正式来源、资源、Session 和权限边界的本地开发路径，完成路线图 Task 6.5。

## What Changes

- 新增 Host-private Plugin Development Mode；仅在构建明确包含该能力且用户在当前应用会话中显式启用后，才允许选择一个自包含的插件 `dist/` 目录。
- Host 对开发目录执行与 CLI `validate` 对齐的 Manifest、兼容性、普通文件、可移植路径、资源完整性和硬限制检查，然后原子创建只读的 Host-owned generation snapshot；Runtime 不直接读取持续变化的作者目录。
- 将开发注册标记为 Host-owned `development` source，并在插件管理界面清楚显示 Development、Unpacked 和 Unsigned；Manifest publisher 文本不得形成 official、verified 或 signed 结论。
- 提供显式的 register、reload 和 remove 开发操作。成功 reload 重新验证完整目录、原子发布新的 Manifest/resource generation，并通过现有终止语义销毁旧 iframe、Session、Port、监听器、计时器和 pending work 后创建全新 Runtime attempt；失败保留当前可运行 generation。
- 开发注册和目录路径仅存在于进程内，应用退出后不恢复；Development Mode 每次启动默认为关闭。正式构建可从前端、Tauri command 和 native managed state 三层完全排除开发入口。
- 开发来源不授予权限、不绕过 Host API 鉴权、Session 来源校验、iframe sandbox、CSP、兼容性或资源限制；Manifest 新增权限只能进入现有请求/授权流程，不能因 reload 自动获得 grant。
- 更新 English canonical 架构与开发文档及对应简体中文镜像，并增加 Rust、TypeScript、React、边界和真实 Runtime reload 验证。
- 不包含自动文件监听、HMR、源码项目执行、任意目录直读、开发 CLI daemon、签名/provenance、Marketplace、远程分发或持久化开发注册。

## Capabilities

### New Capabilities

- `plugin-development-mode`: 定义显式能力门控、`dist/` 目录注册与验证、Host-owned generation snapshot、手动 reload/remove、开发来源安全语义、失败原子性和正式构建排除要求。

### Modified Capabilities

- `plugin-manager`: 增加 Host-owned `development` source 和仅进程内的开发注册生命周期，同时保持已安装记录的现有持久化、恢复与隔离语义。
- `plugin-registration-contract`: 将健康注册的来源读模型扩展为 `builtin | external | development`，并以新的 contract version 在 Rust/TypeScript 边界严格解析。
- `plugin-resource-service`: 允许资源服务读取当前 Host-owned 开发 snapshot，同时继续拒绝作者目录直读、过期 generation、跨插件访问和路径泄露。
- `plugin-runtime-security-lifecycle`: 将成功的手动开发 reload 定义为终止旧 attempt 并创建全新 generation-aware attempt 的显式生命周期触发器，不增加开发专用安全例外。
- `plugin-management-settings`: 在受构建能力和会话开关共同约束的插件设置中增加开发目录 register/reload/remove 入口、来源状态和安全诊断。

## Impact

- Rust/Tauri：新增 Host-private development coordinator、目录检查与 snapshot 事务、进程内开发状态、严格 command/result contract、Plugin Manager/Registration/Resource/Runtime 集成和构建能力门控。
- React/TypeScript：扩展 Registration Contract parser、typed development service、Plugins 设置中的显式会话开关与开发操作、i18n、可访问性、light/dark 状态和 reload 反馈。
- 现有正式 `.lxp` local installation、replacement、rollback、权限、Host API 和 Runtime 路径继续作为来源与安全语义基线；Development Mode 不修改公共 Manifest、SDK、UI、Testkit 或 CLI package API。
- 需要共享目录 corpus 证明 CLI `validate` 与 Rust development inspector 对相同 `dist/` 的 compatible/invalid/incompatible 结论一致，并扩展 focused gate、workspace boundary、完整前端/Rust构建和目标 macOS WebView reload 证据。
- 更新 `docs/en` 与 `docs/zh` 的插件架构、CLI/Development Mode 使用说明、索引和验证文档；完成并验证后再更新路线图 Task 6.5 状态。
