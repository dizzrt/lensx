## Why

lensX 已经能够严格检查 `.lxp`、持久化 Host-owned 插件注册事实并投影 Action/Page 元数据，但用户仍无法把一个本地包变成真实、可恢复的安装。Task 3.2 需要补上这段受信任生命周期：从本地选择、验证并解包，到原子提交、注册和失败清理，同时不提前引入升级、卸载或 Runtime。

## What Changes

- 新增 Host-private 从本地文件安装插件的服务和受限 Tauri 命令，让受信任的 lensX 设置界面通过原生文件选择器选择一个 `.lxp`；“本地”描述安装来源而不是插件类别，前端不接收、读取或持有任意文件系统路径。
- 复用现有 Rust package inspection 与 Manifest Contract，从同一份受限、不可变包字节完成检查和受控提取，不使用通用宽松解包路径。
- 在 `app_local_data_dir()/plugins` 下建立 Host-owned 安装根：`.staging/<random-id>` 只承载未提交内容，正式 payload 位于 `packages/<plugin-key>/<package-sha256>`；不增加 `versions` 或持久化 `transactions` 目录。
- 每个 `plugin_id` 只允许一个已安装 registration。首次安装兼容包时注入 `source=external`、`enabled=true`、空 grant snapshot 和 `inactive` Runtime；重复、无效或不兼容输入稳定失败，不转化为升级、降级或重装。
- 先完整验证 staging，再把 payload 原子移动到 digest 目录，最后持久化 Plugin Manager record 并发送既有 registration invalidation event；任何失败不得发布部分 registration。
- 启动恢复时清理未完成 staging 和能够确定未被任何健康或 quarantine 身份拥有的 installer-owned orphan payload；对不可读取、被 quarantine 身份占有或无法安全归属的内容保守保留并报告安全诊断，不越界删除。
- 将设置页现有插件空占位替换为最小本地安装入口，提供 pending、取消、成功和失败反馈，并保持英文、简体中文、键盘操作、焦点和 light/dark 主题支持；插件列表、详情和完整管理界面仍留给 Task 6.1。
- 更新插件平台与包格式的英文架构文档及简体中文镜像，明确已交付安装边界、目录所有权和恢复语义。
- 明确非目标：远程下载、开发目录安装、升级/降级/重装、启用/禁用/卸载、插件数据目录、权限授予、签名/官方 provenance、资源服务、iframe Runtime、Host API、完整插件管理 UI，以及用户直接删除 `lensx.app` 时对 Application Support 数据的系统级清理保证。

## Capabilities

### New Capabilities

- `local-plugin-installation`: 定义本地 `.lxp` 的选择、受限检查与提取、Host-owned 目录布局、单安装身份、原子提交、Plugin Manager 注册、恢复清理、安全诊断和最小设置页入口。

### Modified Capabilities

无。现有 `plugin-package-format`、`plugin-manager` 与 `plugin-registration-contract` 的原能力边界保持不变；新安装能力作为受信任消费者组合它们，而不把安装语义写回这些基础能力。

## Impact

- Rust/Tauri：新增 installer 模块、安装错误/结果契约、启动恢复、安装命令和原生 `.lxp` 文件选择；组合现有 package inspector、Plugin Manager 与 registration event emitter。
- Frontend：新增 Host-private typed installation adapter，并在设置页插件区增加一个最小安装入口及可访问反馈；更新 i18n 资源、Schema 和测试。
- 存储：新增 `app_local_data_dir()/plugins/.staging` 与 `app_local_data_dir()/plugins/packages/<plugin-key>/<package-sha256>`；Plugin Manager record 仍是当前唯一有效安装的事实源。
- 依赖与权限：增加官方 Tauri dialog Rust 插件以提供原生文件选择，但不向插件 SDK、iframe 或公共 package 暴露文件系统或安装能力；不引入前端文件系统插件。
- 文档与验证：更新 `docs/en`/`docs/zh` 插件架构文档，新增 Rust installer/恢复测试、Tauri contract 测试、前端 adapter/UI/i18n 测试，并运行完整前端与 Rust 验证。
