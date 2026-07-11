## Context

启动器顶部搜索栏已经是 lensX 的默认入口，`App.vue` 根据输入是否为空切换默认分区和搜索分区。但当前搜索分区仍使用表现层 mock 数据，不会读取已经安装的插件。与此同时，插件系统已经提供统一 registry，前端可以通过 `get_plugin_registry` 获得插件 manifests、pages 和 actions，并通过现有 action dispatcher 打开目标插件页面。

本设计将搜索定义为 launcher shell 的固有内部能力。插件不是搜索功能的拥有者，而是搜索数据源之一；第一阶段只接入已安装插件 actions，避免过早引入通用索引、插件自定义搜索 schema 或额外运行时。

## Goals / Non-Goals

**Goals:**

- 让顶部搜索栏在输入非空时搜索已安装插件暴露的 actions。
- 搜索结果点击后打开 action 对应的插件页面。
- 保持搜索输入为空时的默认 launcher 状态不变。
- 保持现有插件 contract、Tauri command 和插件页面加载机制稳定。
- 为后续接入更多搜索数据源预留清晰的前端搜索模型边界。
- 搜索结果 UI 继续接入应用 i18n、Naive UI Provider、主题变量、UnoCSS 和 Less。

**Non-Goals:**

- 不新增 `lensx.core.search` 或其他内建搜索插件。
- 不修改插件 manifest contract，不新增 keywords、icon、ranking 等字段。
- 不实现全文索引、拼音搜索、模糊匹配、跨数据源排序或搜索历史。
- 不新增 Rust/Tauri 搜索 command；第一阶段直接使用前端已有 registry snapshot。
- 不改变窗口快捷键、窗口尺寸策略、插件 iframe 安全边界或 Host API 权限模型。

## Decisions

### Decision 1: 搜索属于 launcher，不属于插件

搜索栏是 launcher shell 的固定 UI，用户不需要先进入某个插件才能使用它。因此搜索能力应由 launcher 负责，插件 registry 只提供可搜索的 action 数据。

替代方案是新增内建搜索插件。该方案会让“搜索插件用于搜索插件”形成概念倒置，并且搜索入口仍在 launcher 顶部，实际依旧需要 launcher 协调输入、结果和页面打开，收益不明显。

### Decision 2: 第一阶段搜索插件 actions，而不是插件页面或 manifest 全量字段

可执行结果应该直接映射到用户动作。现有 `PluginAction` 已经包含 `title` 和 `target_page_id`，点击后可通过 action dispatcher 打开页面，语义明确。页面是插件内部结构，不一定代表可从 launcher 直接触发的入口；permission 和生命周期也已经由 action contract 间接表达。

匹配字段使用：

- `action.title`
- `action.id`
- 所属 `plugin.name`
- 所属 `plugin.id`

结果项保留 `action_id` 作为执行入口，并显示 action 标题和所属插件名称。若后续需要别名、图标或权重，应通过单独 change 扩展 contract。

### Decision 3: 搜索模型放在前端 launcher 边界内

第一阶段 registry 已在前端加载，数据量很小，搜索可作为纯函数在前端完成。推荐抽取轻量 helper，例如 `src/app/launcher/search.ts`，将 query normalize、匹配、结果建模从 `App.vue` 模板中分离出来。

数据流：

```text
NInput query
  │
  ▼
normalize(query)
  │
  ▼
searchPluginActions(registry, query)
  │
  ▼
LauncherSearchResult[]
  │
  ▼
openPluginAction(result.action_id)
```

这样可以让 `App.vue` 保持负责状态组合和渲染，搜索匹配规则可单独测试。

### Decision 4: 保持现有 plugin action dispatcher 作为唯一打开路径

搜索结果不直接设置页面 ID，也不绕过 `createPluginActionDispatcher`。点击结果时仍调用 action dispatcher，由 dispatcher 校验 action 是否存在、target page 是否存在，并更新当前插件页面导航状态。

这样可以复用已有错误处理，保持 action 是 launcher 触发插件页面的稳定边界。

### Decision 5: UI 保持极简，避免新增解释性噪音

搜索结果继续沿用当前 launcher item 视觉结构。搜索有结果时展示“匹配结果”；无结果时展示简洁空状态。用户可见文案必须进入应用 i18n。样式继续使用 UnoCSS 处理静态布局，Less 处理主题变量、hover/focus 和组件语义样式。

## Risks / Trade-offs

- [Risk] 只匹配 action 和插件基础字段，用户可能搜不到自然语言别名。→ Mitigation: 第一阶段保持 contract 简单；后续可通过新增 manifest 搜索元数据扩展。
- [Risk] 前端搜索逻辑如果留在 `App.vue` 会让组件继续膨胀。→ Mitigation: 抽取纯搜索 helper，并为匹配规则添加单元级测试或构造性验证。
- [Risk] registry 加载失败时搜索状态无法展示真实插件结果。→ Mitigation: 复用现有 registry 错误提示，并在搜索状态下显示可诊断错误而不是回退到假数据。
- [Risk] 搜索结果和插件入口列表同时存在会造成重复入口。→ Mitigation: 输入非空时只展示搜索结果；输入为空时保留默认分区和插件入口展示策略。
- [Risk] 结果排序过于简单。→ Mitigation: 第一阶段采用确定性排序，优先名称或标题包含 query 的结果，再保持 registry/action 原始顺序；复杂排序留到后续 change。
