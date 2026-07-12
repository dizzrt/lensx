## Context

启动器 `App.vue` 当前有三种主体状态：插件页面打开态、搜索态、默认态。默认态先渲染 `visibleSections` 中的“最近使用”和“已固定”，随后又渲染一个插件 registry 分区，列出当前 registry 中的插件 actions。

现有 `launcher-panel` 规格已经把默认态定义为“最近使用”和“已固定”两个分区；插件 action 搜索和插件页面打开态是独立能力，不需要通过默认态列表暴露。用户确认“已固定”中的设置条目继续保持视觉 mock，不在本变更中接入设置插件 action。

## Goals / Non-Goals

**Goals:**

- 默认态只展示“最近使用”和“已固定”两个分区。
- 搜索态继续通过插件 registry 搜索已安装插件 actions。
- 插件页面打开态继续通过插件页面出口渲染当前插件页面。
- 清理只服务于默认态插件 registry 分区的状态和 i18n 文案。
- 保持现有 Naive UI Provider、主题变量、应用 i18n、Naive UI locale/dateLocale 同步机制和 UnoCSS/Less 样式分工。

**Non-Goals:**

- 不实现真实最近使用记录。
- 不实现真实固定项持久化。
- 不把“已固定”中的设置 mock 接入设置插件。
- 不改变插件 manifest、registry、action dispatcher、搜索匹配规则或别名覆盖逻辑。
- 不改变 Rust/Tauri command contract、窗口生命周期、快捷键、托盘、权限或外部插件 iframe 安全边界。

## Decisions

### 默认态只消费表现层 section 数据

移除默认态模板中插件 registry 分区，让默认态只遍历 `visibleSections`。这样默认页面的内容来源保持单一：`recentItems` 和 `pinnedItems` 作为表现层 mock 数据。

替代方案：保留插件列表但隐藏标题或压缩为入口。拒绝该方案，因为它仍然会把 registry 列表作为默认主页面内容，和“只保留最近使用、已固定”的目标不一致。

### 插件 registry 加载继续保留

保留 `loadPluginRegistry`、`pluginRegistry`、`pluginHostError`、`searchResults` 和 `openPluginAction`。搜索态和插件打开态仍依赖 registry；本变更只移除默认态的直接展示，不移除插件能力。

替代方案：仅在输入搜索词后懒加载 registry。暂不采用，因为这会改变搜索错误时机和交互延迟，超出本次视觉收敛范围。

### 清理无用状态和文案

移除 `pluginActions`、`pluginHostHint` 以及 `pluginHost.registry.*`、`pluginHost.section.*` 这类只供默认态插件列表使用的文案。`pluginHost.action.badge`、插件 outlet、external frame、搜索错误等文案继续保留。

替代方案：保留未使用文案以降低 diff。拒绝该方案，因为未使用文案会误导后续维护者以为默认态插件列表仍是产品表面。

### 窗口高度 resize 依赖随默认态分区收敛

移除 resize watcher 中对 `pluginActions` 的依赖，保留对默认 sections、搜索结果、搜索状态和当前插件页面的监听。默认态内容减少后，现有 ResizeObserver 仍负责最终窗口高度同步。

## Risks / Trade-offs

- [Risk] 删除默认态插件列表后，用户无法不输入搜索词直接打开插件 action。→ Mitigation：这是本变更的预期收敛；插件入口保留在搜索态，已固定设置项仍明确保持视觉 mock。
- [Risk] 清理 i18n key 时误删仍被其他插件宿主组件使用的文案。→ Mitigation：实施时用全仓搜索确认 `pluginHost.registry.*` 和 `pluginHost.section.*` 无其他引用。
- [Risk] 默认态内容减少后窗口高度变化可能暴露 resize 依赖遗漏。→ Mitigation：实施后运行前端构建，并手动检查默认态、搜索态、插件打开态的窗口高度变化。
