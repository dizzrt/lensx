## Context

当前 `App.vue` 顶部始终渲染搜索输入框，插件页面是否打开只影响搜索框下方的主体区域。此前已实现插件页面独占主体区域，但顶部搜索框仍可见，造成状态语义不一致：用户进入插件后，顶部仍像全局搜索入口。

现有插件 registry 已提供 `PluginManifest.name`、`PluginPage.plugin_id` 和页面索引，因此插件打开态顶部可以从当前页面反查插件名称，不需要扩展 manifest contract，也不需要新增 Rust/Tauri 命令。

## Goals / Non-Goals

**Goals:**

- 在 Launcher Shell 内建立顶部状态区域：搜索态展示搜索输入框，插件打开态展示插件名称和关闭按钮。
- 插件打开态只展示插件名称，不展示当前页面名称。
- 关闭按钮紧跟插件名称后方展示，并在点击后回到工具主页搜索态。
- 保持现有 Naive UI Provider、应用 i18n、明暗主题、UnoCSS/Less 样式分工、窗口拖拽和高度自适应行为。

**Non-Goals:**

- 不扩展插件 manifest icon、标题、多语言字段或页面导航协议。
- 不改变插件 action dispatcher 的目标页面解析规则。
- 不改变外部插件 iframe、JSON-RPC Host API 或权限模型。
- 不调整 Rust/Tauri 窗口生命周期、托盘、快捷键或失焦隐藏策略。

## Decisions

### 1. 顶部区域由 Shell 状态推导，不交给插件控制

插件打开态由 `pluginNavigation.currentPageId !== null` 推导。当前页面存在时，Shell 根据 `pagesById[currentPageId].plugin_id` 找到插件 manifest，并使用 `plugin.name` 作为顶部标题。

替代方案是让插件页面自己渲染标题栏，但这会让内建插件和外部插件各自实现退出入口，破坏 Launcher Shell 对全局导航状态的所有权。顶部状态属于 Shell 级导航，应由 Shell 统一渲染。

### 2. 插件标题只使用插件名称

顶部标题只展示 `plugin.name`，不拼接 `page.title`。插件内部子页面切换时，顶部仍保持同一个插件名称。

替代方案是展示“插件名称 / 页面名称”，但这会增加顶部信息密度，也会让设置插件这类内部已有侧边导航的页面出现重复层级提示。当前产品方向更偏向极简状态表达。

### 3. 关闭按钮跟随插件名称，而不是右对齐

插件标题区使用紧凑的行内布局：插件名称在前，关闭按钮在后。关闭按钮不使用 `justify-between` 或右侧占位布局；长名称需要省略，关闭按钮保持可见。

替代方案是将关闭按钮放在最右侧，但这会把一个局部退出动作做成窗口级操作的视觉位置，且与用户指定的参考形态不一致。

### 4. 关闭插件时清空搜索词

关闭按钮执行 Shell 级退出插件动作：将 `currentPageId` 置空，并清空 `query`。这样返回后直接进入工具主页，而不是恢复打开插件前的旧搜索结果。

替代方案是保留 query，但用户从插件返回后看到旧搜索结果会造成状态残留，不符合“回到工具主页，并且搜索框回到搜索状态”的预期。

## Risks / Trade-offs

- [Risk] 当前插件名称来自 manifest 原始 `name`，暂不接入插件自身多语言标题。 → Mitigation: 本变更不扩展 manifest，多语言插件标题可作为后续插件 contract 设计处理。
- [Risk] 插件名称过长时可能挤压关闭按钮。 → Mitigation: 标题文本使用单行省略，关闭按钮使用固定收缩策略保持可见。
- [Risk] 顶部搜索输入切换为标题区后，拖拽区域和按钮点击可能互相影响。 → Mitigation: 关闭按钮继续归入 `launcher-no-drag` / button 排除区域，标题区空白处仍可用于窗口拖拽。
- [Risk] 顶部区域高度变化可能影响 Tauri 窗口自动高度。 → Mitigation: 复用现有 ResizeObserver 和 `nextTick(scheduleWindowResize)` 机制，在插件导航状态变化时触发重新测量。
