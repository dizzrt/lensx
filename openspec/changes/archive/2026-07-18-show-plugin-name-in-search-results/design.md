## Context

启动器当前从插件 registry 遍历 action，使用 action 标题计算匹配优先级，并在搜索结果映射中将 action 标题写入 `title`。启动器卡片将该字段作为粗体主标题显示，因此当前语言为中文时仍可能出现未本地化的英文 action 标题。

插件 manifest 已提供 `display_names`，且前端已有 `resolvePluginDisplayName`，能够按应用 locale 读取插件名称并在缺失时回退英文名。搜索结果映射也已解析该名称用于其他结果信息。

本变更仅涉及 Vue/TypeScript 前端的数据映射与呈现。它不改变 Tauri 命令、窗口生命周期、插件 registry、action dispatcher 或插件 manifest。

## Goals / Non-Goals

**Goals:**

- 搜索结果主标题稳定展示所属插件的本地化名称。
- 保持 action 标题、ID、插件名称和有效别名的现有搜索匹配范围与排序规则。
- 保持点击结果后由对应 action 打开目标插件页面的既有行为。
- 复用应用 locale 作为插件名称解析的唯一语言来源，不新增产品文案或独立 i18n 状态。

**Non-Goals:**

- 不修改 action contract、action 标题、manifest 结构或 Rust/Tauri API。
- 不重新设计搜索结果的描述、徽标、图标或多 action 插件的呈现模型。
- 不改变 action ID 在内部结果标识和 dispatcher 调用中的作用。

## Decisions

### 在搜索结果映射层将主标题设为插件名称

`searchPluginActions` 已拥有 plugin、action 与 locale，并已通过 `resolvePluginDisplayName` 取得本地化插件名称。该层将继续产出相同的结果结构，但使 `title` 等于解析后的插件名称，而非 `action.title`。

这样 `App.vue` 继续只负责渲染 `result.title`，无需理解 manifest 本地化规则，也不需要改动 UI 布局或新增组件。

备选方案：

- 在 `App.vue` 内根据 action ID 反查插件名称：会让展示层承担 registry 查询和本地化职责，增加耦合。
- 修改 action 标题为本地化的“打开设置”：改变插件 contract，并且仍会将 action 而非插件作为主对象展示。

### 保留 action 作为搜索与执行的内部语义

action 标题仍参与匹配和排序，`action_id` 仍用于点击后分发至目标页面。仅可见主标题从 action 标题切换为插件名称。现有描述和元信息不将 action 标题作为用户可见名称。

这使用户看到的实体与插件 manifest 的本地化展示名一致，同时不影响一个插件暴露多个 action 的技术执行路径。

### 复用既有前端基座

本变更不引入新的可翻译字符串。插件名称通过应用 locale 解析，并继续在现有 Naive UI Provider、`locale`/`dateLocale` 同步与明暗主题容器内显示。结果卡片的静态布局和 Less 语义样式保持不变。

## Risks / Trade-offs

- [一个插件存在多个 action 时，主标题可能重复] → 保留现有描述和 action ID 作为区分信息；多 action 的信息架构不属于本变更范围。
- [误将 action 标题从匹配逻辑中移除] → 为映射和匹配规则分别补充测试，验证显示变化不影响搜索与执行。
- [locale 缺失导致名称为空] → 继续使用既有 `resolvePluginDisplayName` 的英文回退行为。
