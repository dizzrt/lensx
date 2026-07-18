## Context

启动器当前仅在搜索状态消费 plugin registry；搜索为空时，`App.vue` 直接渲染静态的最近使用和已固定 mock 条目，且这些卡片没有打开 action 的行为。插件 action 已使用全局唯一的 `action_id`，现有 dispatcher 可将 action 打开为其目标页面。

应用偏好由 Rust/Tauri 的 `preferences.json` 读写，当前保存主题和插件别名覆盖。前端通过 typed command 获得响应式偏好状态。该边界适合承载本地单用户的使用记录与固定项，不需要新增数据库、前端本地存储或后台服务。

当前 registry 仅返回内建设置插件。外部插件安装、发现和注册不是本变更的范围；本设计仅要求对当前 registry 中可解析的 action 正确工作。

## Goals / Non-Goals

**Goals:**

- 以 `action_id` 为唯一身份，持久化最近使用和固定项。
- 成功打开 action 后记录最近使用，最多保留 10 个去重条目。
- 让用户在搜索、最近使用和已固定卡片中使用独立图钉控件固定或取消固定 action。
- 让默认态只展示由当前 registry 可解析的持久化 action，并为最近使用和已固定分别提供空态。
- 保持 Rust 作为偏好持久化的唯一事实源，Vue 仅负责投影、展示与交互。
- 保持既有 Naive UI Provider、应用主题、应用 i18n 与 Naive UI `locale` / `dateLocale` 同步链路。

**Non-Goals:**

- 不实现外部插件安装、插件 registry 发现或历史同步。
- 不增加拖拽排序、完整历史、时间戳展示、使用频率排名或固定项分组。
- 不将 action 标题改为本地化 contract，也不将 action 标题作为卡片主标题。
- 不改变 action dispatcher、插件页面导航、窗口大小策略、快捷键、托盘或权限边界。

## Decisions

### 决策 1：记录和固定项均以 action ID 持久化

偏好新增：

```text
recent_action_ids: string[]
pinned_action_ids: string[]
```

`recent_action_ids` 按最近成功打开时间倒序，`pinned_action_ids` 按最近固定时间倒序。二者都保存 action ID，而非插件 ID、页面 ID 或展示名称。

一个插件可声明多个 actions，只有 action ID 同时表达可执行目标和稳定的 registry 身份。展示名称、页面和运行时都可由当前 registry 反查，持久化展示文本会在 locale 或 manifest 变更后过期。

替代方案：

- 按 plugin ID 保存：无法区分同一插件的多个入口。
- 保存整个 action/插件快照：会复制 manifest 数据，并在升级或语言切换后产生陈旧内容。

### 决策 2：由 Rust 提供意图明确的偏好变更 command

新增两个 typed command：

```text
record_launcher_action({ action_id }) -> AppPreferencesState
set_launcher_action_pinned({ action_id, pinned }) -> AppPreferencesState
```

`record_launcher_action` 在 action 成功分发后将 ID 移到最近列表首位、去重并截断为 10 项。`set_launcher_action_pinned` 在固定时将 ID 移到固定列表首位，在取消固定时移除它；重复调用保持幂等。

command 在 Rust 侧读取、变更并写回同一份偏好，返回完整新状态供前端更新。Vue 将 launcher 偏好 mutation 放入单一队列串行发送，按返回顺序应用状态，避免异步记录最近使用与紧随其后的固定操作互相覆盖。command 不反查 plugin registry，允许历史记录成为陈旧 ID；这避免偏好层依赖当前 registry 的装载策略，并与现有别名覆盖层保留未知插件 ID 的策略一致。

替代方案：

- 扩展通用 `update_app_preferences` 让前端整体回传数组：前端需要自行处理顺序和去重，连续的打开/固定操作可能基于旧快照覆盖对方的更新。
- 在 Vue 或 localStorage 保存数据：会破坏 Rust 偏好文件的唯一事实源。

### 决策 3：默认态通过 registry 投影已存 action，而不将 registry 作为入口列表

前端新增纯映射层，将已排序的 action ID 列表依序解析为可展示的 Launcher entry：

```text
action_id
  -> registry.actionsById
  -> registry.pluginsById[action.plugin_id]
  -> 当前 locale 的插件展示名
```

映射仅保留 action 和所属插件都存在的条目，并保持原始持久化顺序。未知或已移除 action 被隐藏，不在读取时自动写回清理偏好。卡片主标题使用现有本地化插件名称解析，动作仍以 action ID 作为执行标识和次级区分信息。

默认态始终渲染最近使用和已固定两个分区。某个投影列表为空时，该分区显示不含图标的纯文本空态；无记录时不得把 registry 中全部 actions 或过去的 mock 条目作为替代内容。

替代方案：

- 启动时主动删除未知 ID：读取产生隐式写入，且未来 registry 暂时不可用时会错误丢失用户数据。
- 没有记录时展示 registry 全量 actions：会重新引入已被明确移除的默认插件入口分区。

### 决策 4：复用一个 action 卡片，拆分打开与图钉两个交互目标

搜索结果、最近使用和已固定展示相同的 action 卡片。卡片主体是打开 action 的主按钮；图钉是相邻的独立 Naive UI 图标按钮，不嵌套在主按钮内。图钉点击必须阻止打开动作，并随固定状态切换其可访问名称与提示文本。

复用组件或等价的共享模板可以避免三个入口对 action ID、主标题、固定状态和焦点样式产生不同语义。图钉图标使用无依赖的内联 SVG，并通过 i18n 提供 `aria-label`、提示和错误文案。布局骨架继续使用 UnoCSS，卡片状态、主题变量、hover/focus 与图钉样式使用 scoped Less 和现有 Naive UI token。

替代方案：

- 在现有整张 `<button>` 内嵌图钉按钮：会产生无效的嵌套交互元素，并破坏键盘和辅助技术行为。
- 仅在设置插件管理固定项：增加路径长度，不符合启动器主页面的直接操作目标。

### 决策 5：持久化失败不阻止已成功的 action 打开

dispatcher 先验证并打开目标页面；仅在成功后异步请求记录最近使用。若该写入失败，已打开的页面保持不变，前端显示可诊断的、可翻译的持久化错误。固定/取消固定写入失败时保留服务端返回前的 UI 状态并显示同类错误。

这将“执行 action”与“更新使用统计”分离，避免本地偏好文件异常阻塞插件打开，同时不静默丢失用户可见的持久化失败。

## Risks / Trade-offs

- [持久化历史可能含已移除 action] → 渲染时按当前 registry 过滤，且不在读取阶段删除。
- [当前 registry 只有一个内建 action，首次启动默认态为空] → 最近使用和已固定各自显示独立空态；真实使用或固定后立即显示条目。
- [action 标题目前可能未本地化] → 卡片主标题继续使用本地化插件名称，次级信息使用稳定 action ID；动作标题本地化不在本变更范围。
- [连续的打开和固定操作会产生异步请求] → Vue 将 launcher 偏好 command 串行化，并按返回顺序应用完整状态。
- [新增图钉使卡片交互复杂] → 采用独立按钮、可访问名称、可见焦点和点击传播隔离，不嵌套互动元素。
- [偏好文件损坏会重置记录] → 延续现有保守可用策略：回退默认偏好并在下次成功写入时恢复可用文件。

## Migration Plan

1. 为 Rust 和 TypeScript 偏好类型增加带默认值的两个 action ID 列表，使旧文件缺少字段时读取为空列表。
2. 实现 Rust mutation command 与 focused 单元测试，确保去重、截断、排序、取消固定和旧文件兼容。
3. 在 Vue 偏好 API 中接入 command，在 registry 映射层生成展示条目，并以共享 action 卡片替换 mock 卡片。
4. 补充中英文 i18n 文案，验证 light/dark 主题、空态、搜索、最近使用和已固定交互。
5. 运行 Rust 测试、Biome 检查和前端生产构建。

回滚时可停止调用新 command，并让旧版本忽略新增 JSON 字段；新增字段带 serde 默认值，因此不会破坏旧偏好文件。若需要恢复 mock UI，应通过新的 OpenSpec 变更处理，不在本变更中保留双数据源。

## Open Questions

无。已确定卡片图钉交互、最近使用上限为 10、固定项按最近固定排序，以及两个分区分别展示独立空态。
