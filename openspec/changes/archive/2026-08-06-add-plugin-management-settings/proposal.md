## Why

当前 Host 的 Plugins 设置区只提供本地安装入口与一次性结果反馈，用户无法查看已安装插件、理解兼容性与诊断，也无法在不使用开发命令的情况下完成启用、禁用、升级或卸载。Task 3.3、Task 3.4、Task 5.4 和 Task 5.5 已建立相应的 Host-private 生命周期、替换、私有存储与权限事实，本 change 需要把这些能力收敛为可信、可访问且可恢复的图形化管理入口，完成路线图 Task 6.1。

## What Changes

- 将现有 Plugins 设置区扩展为安装列表与选中插件详情，展示名称、版本、Host 来源、启用状态、兼容性、只读权限状态、Runtime 摘要和安全诊断；Manager 降级、空列表、隔离记录和详情读取失败均有明确状态。
- 保留“从本地文件安装”，并在安装成功后刷新列表、选择新插件；通过已有 Host-private lifecycle 与 replacement service 提供启用、禁用、本地升级/降级/重装和卸载操作。
- 为已禁用的健康插件新增独立“清除数据”能力：插件保持安装，Host 通过 revision-bound、typed、私有边界清空其完整私有存储；启用中、隔离、过期或不可安全证明的数据目标必须拒绝，且不得暴露路径、key、value 或原始错误。
- 对卸载明确区分“保留数据”和“删除数据”，默认保留数据；清除数据、删除数据和卸载使用明确的危险操作确认，不把本地包选择或 Publisher 文本当作信任与授权。
- 页面只消费 root application 的 typed services；React 不直接调用 Plugin Manager、不复制 revision、权限、替换、清理或恢复规则，也不向插件或公共包导出管理能力。
- 所有新增文案接入 canonical English 与简体中文 i18n，并覆盖 light/dark、键盘操作、焦点恢复、异步状态公告与不依赖颜色的状态表达。
- 更新 canonical English 架构/验证文档及对应简体中文镜像，并增加覆盖服务协调、严格边界、UI 状态、失败恢复和视觉验收的门禁。
- 非目标：权限授予/撤销与安装/升级权限提示（Task 6.2）、远程下载或 Marketplace、自动更新、签名/Publisher 验证、版本历史或用户触发回滚、隔离修复、通用插件数据浏览器。

## Capabilities

### New Capabilities

- `plugin-management-settings`: 定义 Host-owned 插件管理设置页的列表、详情、生命周期与本地替换操作、只读权限/诊断展示、数据操作、恢复、i18n、主题、键盘和焦点行为。

### Modified Capabilities

- `host-settings`: 将 Plugins 区从初始空占位/最小入口演进为可信的完整本地插件管理区域，同时保持单窗口 Host 页面所有权。
- `local-plugin-installation`: 安装成功后由管理页刷新并选择真实 Registration；最小安装入口不再禁止 Task 6.1 已交付的列表、详情和生命周期控件。
- `plugin-scoped-storage`: 新增只供可信 Host 管理端使用的整命名空间清除操作，并规定禁用前置条件、并发、原子性、失败恢复和最小披露边界。

## Impact

- 前端：`SettingsPage` 的 Plugins 区、管理页组件与状态模型、现有 installation/registration/lifecycle/replacement/permission/storage typed services 的组合、应用级 service 注入、Semi Design/UnoCSS/Less 样式、英文与简体中文 locale、组件与集成测试。
- Rust/Tauri：为独立清除数据新增 Host-private versioned contract、命令与 `PluginScopedStorage`/Installer 协调；复用当前 Plugin Manager identity、revision、数据所有权和安全诊断规则。
- 规格与文档：新增 `plugin-management-settings` 稳定能力的 delta，并修改 `host-settings`、`local-plugin-installation` 和 `plugin-scoped-storage`；同步更新 `docs/en` 与 `docs/zh` 的插件架构、前端指导和验证说明。
- 验证：新增聚焦管理设置门禁，并回归 local installation、registration、lifecycle、replacement、permission、scoped storage、Host settings、完整 frontend 与 Rust 验证。
- 依赖：预期不新增运行时依赖或组件库；继续使用 React、Semi Design、现有 i18n/theme/provider 与 Host-private adapters/services。
