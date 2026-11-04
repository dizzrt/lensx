# Proposal

## Why

当前 lensX 只允许在 Launcher 主窗口中运行一个插件 Page，打开其他页面会终止原实例，用户无法同时保留多个翻译、编辑或工具工作区。需要让用户把正在使用的插件完整分离到独立窗口，再从 Launcher 打开其他插件或同一插件的新实例。

## What Changes

- 增加 Host 控制的插件窗口分离：通过默认 `Cmd+D` 的应用内快捷键分离主窗口中已就绪的插件实例。主窗口页面不显示分离按钮或键位提示。
- 分离迁移原生 WebView 和既有运行实例，完整保留输入、结果、选择、撤销历史、Session、Worker 和进行中的任务；不得以重载、重新执行 Action 或序列化部分业务状态代替迁移。
- 成功后新窗口取得焦点，Launcher 回到 Home 并隐藏；再次召唤 Launcher 可打开任意插件。同一插件可以产生多个独立实例并逐一分离，各窗口互不复用或抢占。
- 原生补偿成功时仍恢复同一原实例至 main；仅补偿本身无法确认时进入用户已批准的 `recovery_required`：保留原 WebView、Session、事务与原始快照，不重载、不重放、不自动销毁、不伪报分离或回滚成功。冻结受影响归属变更与重复分离，保持可信主窗口修复/退出入口可见，并提供明确的重试恢复、关闭实例和退出操作。
- macOS 独立窗口使用原生无可见标题文字的标题栏，仅显示关闭、最小化、全屏三个系统按钮。插件内容填满标题栏下方的内容区。独立窗口失焦不隐藏；`Cmd+W`、窗口关闭和该实例的 `ui.close` 只关闭对应实例；`Cmd+Q` 清理全部实例后退出 lensX。主窗口保留原有可恢复隐藏语义。
- **BREAKING（Host 内部约束）**：将全进程唯一 current Runtime/资源授权改为按实例和所属窗口管理；主窗口仍最多承载一个插件实例，每个独立窗口承载一个实例。插件禁用、卸载、升级或 generation 变化撤销对应插件的全部受影响实例。
- 为分离增加可修改、可清除的应用内 chord 配置，默认 `Cmd+D`，与全局 Launcher/Action 快捷键区分执行路径并进行冲突校验；已有绑定不得被迁移静默覆盖。可分离时 Host 消费一次分离手势，插件不再处理同一 `Cmd+D`；独立窗口和其他不适用场景不触发分离。
- 保持公共 Manifest/SDK/Host API 的封闭边界：插件无需增加窗口权限或多开声明，不获得 instance ID、窗口句柄或迁移 API。临时页面状态按实例隔离，现有 `storage.*` 的插件级持久化命名空间保持共享。
- 扩展确定性测试和现有 Gate，增加稳定能力 Gate `plugin-detached-windows`，同步英文维护文档与简体中文镜像。

**目标**：交付 macOS 上可保持原实例状态的单向分离、同插件多开和相互独立的窗口生命周期，并保持现有插件的公共调用兼容；无法确认原生补偿时，以显式恢复失败态保留原实例及可操作的恢复/终止入口。

**非目标**：合并回 Launcher、独立窗口内再次分离或克隆、跨进程独立应用、退出后恢复窗口/临时状态、隐藏后台 Runtime 池、窗口排列管理器、额外平台能力承诺或插件程序化窗口管理。独立窗口仍属于同一个 lensX 进程。原规划轮仅创建变更文件；当前按用户已授权范围实施，归档、提交与发布仍需后续独立指令。

## Capabilities

### New Capabilities

- `plugin-detached-windows`：用户触发的无损窗口分离、同插件多实例、独立窗口交互、事务失败恢复、显式 `recovery_required` 与确定性验收。

### Modified Capabilities

- `launcher-shortcuts`：新增默认 `Cmd+D` 的 Host 应用内分离目标、配置迁移、冲突处理和精确前台路由；恢复失败态禁止重复分离，同时保留明确终止入口。
- `launcher-window-lifecycle`：区分 Launcher 隐藏与独立窗口关闭，按实际焦点路由 W/Q，分离提交后复位并隐藏主窗口；恢复失败态禁止主窗隐藏并保留修复与退出。
- `plugin-child-webview-runtime`：将唯一 Child WebView 约束限定到窗口，支持实例迁移及每窗口的 slot、圆角、焦点和生命周期。
- `plugin-runtime-security-lifecycle`：允许受 Host 管理的多窗口并发，分离实例终止与插件 generation 失效，保留安全边界和有界故障处理。
- `plugin-runtime-session`：显式定义多实例 Session 身份、分离连续性和实例级失效。
- `plugin-resource-service`：同一 generation 的共享资源支持多个独立来源授权，关闭单个实例不得撤销兄弟实例。
- `isolated-plugin-runtime-origin`：保留 generation 级 origin，同时以实际 native 来源和实例租约授权并发访问，隔离过期及伪造来源。
- `plugin-page-navigation`：按承载窗口管理 active Page 和 activation，Launcher 新开与独立窗口内导航互不干扰。
- `plugin-page-window-presentation`：有效尺寸、可调状态和 slot 约束应用到实例所属窗口，分离保留当次有效尺寸。
- `plugin-host-api-dispatcher`：从可信调用 Session 派生实例与窗口，精确路由关闭、Action 导航、请求取消和事件响应；恢复失败态的 `actions.open` 有界返回 `unavailable`，已成功响应的 `ui.close` 仍仅终止调用实例。

## Impact

- Rust：`src-tauri/src/plugin_child_webview_*`、`plugin_resource_service.rs`、Runtime Session、`plugin_child_webview_host_dispatcher.rs`、`launcher_window.rs`、`launcher_shortcuts/` 及 Host 入口/权限配置。变更会撤销现有全局单例假设。
- 前端：`src/app/navigation/`、`src/app/plugins/runtime/`、`src/app/shortcuts/`、App Shell、Page chrome、快捷键设置和双语文案；增加受限的独立窗口 Host 呈现模式。
- 依赖：沿用已固定的 Tauri/Wry/Tao；审查并修复现有 `reparent` 的事务与失败回滚路径，不引入新依赖或承诺简单调用即可无损迁移。
- 公共协议：保持 Manifest `0.4.0` 和现有公共 Host API payload；Host 私有窗口/实例消息和快捷键持久化需要版本化校验。
- 验证与文档：扩展 `scripts/validation/catalog.ts` 的稳定 Gate 及相关 Rstest/Cargo 测试；更新 `docs/en/architecture/`、插件开发说明、验证说明及 `docs/zh/` 对应路径。真实 macOS 焦点、输入法与 WebKit 调度尚未验证；维护验证继续限定为确定性测试、静态检查、编译和包边界检查。
