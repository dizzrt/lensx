## Why

当前 lensX 已有可唤起的 launcher 窗口和可输入文本的 React 界面，但没有 action 的稳定身份、元数据、注册、查询或执行语义。若直接实现搜索结果、历史、设置或插件 action，这些能力会各自发明 action 模型并形成多个事实源，因此需要先建立独立于 React、Tauri 和插件格式的 Host-owned action 核心。

## What Changes

- 定义框架无关、可序列化的 launcher action descriptor，包含稳定全局 `action_id`、Host 可信所有者、本地化展示元数据、默认搜索关键词和可用状态。
- 定义严格的 action ID 规则和结构化诊断，拒绝非法字段、空文本、重复 ID 和不一致的所有者引用。
- 建立 Host-owned action registry，支持注册、按 ID 查询、列出确定性快照，并保证已注册 descriptor 不被调用方直接修改。
- 建立 action dispatcher，按 `action_id` 解析和执行 action，返回类型化成功结果或稳定、可诊断的未知、不可用和执行失败错误。
- 将 action metadata 与 executor 分离：descriptor 可以跨边界序列化，执行器保持 Host 内部实现；React 组件和未来插件不得携带可执行函数。
- 提供一个真实内建 action `lensx.core.hide_launcher`，通过 typed desktop adapter 复用现有 Rust launcher `hide` 动作，验证 registry → dispatcher → native action 的完整路径，不使用 mock action。
- 为 action descriptor、registry、dispatcher、内建 action 和跨边界 payload 增加前端与 Rust 测试。
- 更新英中文档，明确 action core 是 application/domain 层能力，以及未来搜索和插件只能作为它的消费者或 action provider adapter。
- 本 change 不实现查询匹配、排序、结果列表、键盘选择、最近使用、固定项、设置页、偏好持久化、插件 Manifest、插件安装或外部运行时。

## Capabilities

### New Capabilities

- `launcher-action-core`: 定义 launcher action descriptor、ID 与所有权约束、Host registry、dispatcher、结构化结果/错误，以及首个真实内建 action。

### Modified Capabilities

无。本 change 复用现有 `launcher-window-lifecycle` 的统一 `hide` 动作，不修改其既有窗口行为要求，也不改变当前 `frontend-foundation` 的可见界面要求。

## Impact

- TypeScript application/domain：新增 action contract、验证、registry、dispatcher、内建 action source 和 typed executor adapter；不得依赖 React 组件。
- Rust/Tauri：为可信前端暴露最小 launcher action command，将 `hide_launcher` 路由到现有统一窗口动作边界，并返回稳定可序列化结果或错误。
- React：当前 App Shell 不增加结果列表或 action 入口；只为未来消费者提供 application service 组合根，不改变现有输入行为。
- 跨边界契约：字段使用 `snake_case`，输入在 Rust 边界重新校验；不传输函数、React 状态、Tauri window 或 Rust 内部类型。
- 测试：TypeScript 领域测试、typed adapter 测试、Rust command/路由测试，以及不经搜索 UI 的真实内建 action 集成验证。
- 文档：更新 canonical English 架构文档和相同路径的简体中文镜像；不修改 README 或 Agent 规则文件。
- 依赖：预计只使用现有 TypeScript、React、Tauri、Serde 和测试工具，不新增运行时依赖或组件库。
