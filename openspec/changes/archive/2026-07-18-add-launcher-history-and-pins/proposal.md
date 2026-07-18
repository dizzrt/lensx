## Why

启动器主页面的“最近使用”和“已固定”仍展示与插件 registry 无关的表现层 mock 条目，用户无法从真实插件入口获得持续的使用记录或固定项。现在插件 action 已具备可执行的稳定标识，应将默认态转为真实、可持久化的 action 入口。

## What Changes

- 新增 action 级使用记录与固定项能力：成功打开 action 后记录最近使用；用户可通过卡片图钉固定或取消固定 action。
- 将“最近使用”限制为 10 个去重 action，按最近成功打开时间倒序排列；将“已固定”按最近固定时间倒序排列。
- 将使用记录和固定项持久化到 Rust/Tauri 管理的应用偏好中，并保持旧偏好文件兼容。
- 启动器默认态基于当前 plugin registry 解析持久化的 action ID，移除静态 mock 条目；失效 action 不展示。
- 最近使用和已固定分区在无记录时分别展示独立空态；搜索结果、最近使用和已固定卡片均提供图钉操作，卡片主体继续打开对应 action。
- 为新增空态、固定操作和持久化失败提示补充应用级 i18n 文案，并遵循现有 Naive UI、UnoCSS/Less 与明暗主题边界。

非目标：

- 不实现外部插件的安装、发现或注册表加载；本变更只消费当前已注册的 actions。
- 不增加固定项手动排序、完整历史浏览、使用频率统计或跨设备同步。
- 不修改插件 manifest、action dispatcher 的目标页面语义、窗口生命周期、快捷键或权限模型。

## Capabilities

### New Capabilities

- `launcher-action-history`: 管理 action 级最近使用记录、固定项及其持久化和失效条目处理。

### Modified Capabilities

- `launcher-panel`: 默认态从 mock 条目切换为基于真实 action 记录的最近使用、已固定和统一空态，并提供卡片图钉交互。

## Impact

- 前端：启动器默认态、可复用 action 卡片、registry action 到展示模型的映射、应用 i18n。
- Rust/Tauri：应用偏好数据结构、偏好读写兼容性及记录使用/切换固定状态的 typed command。
- OpenSpec：新增 `launcher-action-history` 规格，并更新 `launcher-panel` 规格。
- 不新增依赖，不修改稳定文档或 Python 工具。
