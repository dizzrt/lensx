## Why

Task 5.5 已经交付可持久化、逐调用强制执行且撤销立即失效的 Host-private 权限内核，Task 6.1 也能在插件设置中只读展示权限状态，但普通用户仍无法在安装、替换或设置流程中理解并控制授权。Task 6.2 需要把现有可信 grant 边界接入明确、默认拒绝且可访问的用户交互，同时保持 Manifest 请求、Publisher 文本和插件 Runtime 都不能自行形成授权。

## What Changes

- 新增 Host-private 权限提示与决策交互：展示权限用途、Host 风险等级、当前支持状态和 Manifest 提供的本地化原因，并明确 Publisher 文本未经验证且不代表签名、来源或授权。
- **BREAKING（仅 Host-private）**：将首次本地安装 contract 从选包后直接提交升级为 prepare → confirm → commit；Host 先完成严格包检查并返回最小安全候选投影，用户可在提交前查看权限，安装允许在零授权状态继续，所有敏感权限默认关闭且必须逐项明确确认。
- 在本地 upgrade、downgrade 和 reinstall 确认中继续展示权限差异；保留旧版本仍请求的既有 grant，移除不再请求的 grant，新增权限默认未授权，只有替换成功后才可通过既有逐项 grant 边界应用用户明确选择。
- 将插件管理设置中的权限区域从只读状态升级为逐项 grant/revoke 控制；每次写入绑定当前 `entry_id` 与 Registration revision，冲突时完整刷新并要求用户重新决定，React 不直接调用 Tauri 或复制 Manager 逻辑。
- 明确交互结果：授予、拒绝和稍后决定均以真实 Host grant state 为准；拒绝与稍后决定不新增持久决策历史且都保持 `not_granted`，撤销成功后立即终止受影响的旧 Runtime authority，并提供可理解的 Host 反馈。
- 运行时不会因插件 iframe 自报“用户手势”或收到 `permission_denied` 而自动弹出授权框；插件仍通过 capability/稳定错误进入受限体验，用户只能从 Host 拥有的安装、替换或设置交互授予权限。
- 使用现有 Semi Design、应用 i18n、主题和焦点管理完成英中双语、light/dark、键盘、屏幕阅读器及固定原生视口的视觉验证。
- 不新增权限 ID、Host API method、公共 SDK permission-request API、文件/网络/Shell/进程能力、批量授权后门、第二套授权数据库、签名信任、Marketplace 或通用通知/路由平台。

用户可见影响：用户在安装或替换插件前能看到权限及风险，在设置中可逐项授予或撤销；不作选择时插件仍可安装但相应能力不可用，新增权限不会随升级静默启用，撤销后相关能力立即停止。

## Capabilities

### New Capabilities

- `plugin-permission-prompts`: 定义 Host-owned 权限展示模型、敏感权限逐项确认、安装/替换/设置决策流程、拒绝与稍后决定语义、撤销反馈，以及安全、可访问和双语视觉要求。

### Modified Capabilities

- `local-plugin-installation`: 将首次安装从选包后直接提交扩展为严格、进程内且可取消的 prepare/confirm/commit 流程，并向可信 Host UI 暴露最小安全候选与权限展示事实。
- `plugin-management-settings`: 让现有只读权限详情通过 typed permission service 提供 revision-bound 的逐项 grant/revoke 控制，并将安装与替换权限确认纳入统一串行交互和焦点恢复。

## Impact

- Rust/Tauri：扩展 Host-private local installation contract 与 installer state，支持有界首次安装 preparation、commit/cancel、过期与清理；继续复用现有 Plugin Manager、permission coordinator 和 `set_plugin_permission_grant`，不增加新的授权真相。
- React/TypeScript Host：扩展 installation adapter/service、`PluginManagementService` view model 与 mutation orchestration，新增 Host-owned permission prompt presentation；所有 native 调用继续位于严格 adapter 后。
- 插件 Runtime 与公共 packages：Contract、SDK、UI 和 Testkit 不新增 permission-request API、grant 类型或 Host-private export；官方与外部插件使用相同权限和提示规则。
- 生命周期：首次安装和替换的 durable commit 与后续逐项 grant 是安全的串行步骤；grant 失败不回滚已成功安装/替换，而是保留实际较窄权限状态并提供恢复入口。
- 文档与验证：更新 canonical English 架构/开发文档及 `docs/zh` 镜像，新增 Rust/TypeScript contract、service、UI、i18n、主题、键盘、焦点、截图与真实生命周期集成测试，并纳入 focused gate 和完整前后端验证。
- 依赖：不新增 runtime dependency、组件库或 Tauri plugin。
