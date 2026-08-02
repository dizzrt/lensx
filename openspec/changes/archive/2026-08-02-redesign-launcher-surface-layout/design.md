## Context

当前 App Shell 通过 `activePage` 和规范化查询派生 `home`、`search`、`page` 三种状态，并通过类型化 Tauri 命令切换 240px、480px、600px 固定高度。`home` 只显示说明占位，`search` 使用带边框的纵向 listbox，`page` 使用独立标题/描述/关闭按钮头部。Action Registry 与 Dispatcher 已经提供真实 Action、确定性搜索和统一执行，但 Action Descriptor 没有图标，Rust 也没有最近使用或固定集合存储。

本变更跨越 React 组合、Action 契约、Rust 持久化和 Native 窗口尺寸。设计必须继续保持：Rust 负责持久化与受约束 Native 边界，React 负责展示与交互；集合只保存稳定 Action ID，不复制 executor 或 Registry 内部状态；插件 Manifest 的图标与 Action 仍不进入运行时 Registry；所有产品文案、主题和控件使用现有 i18n、Semi Design、UnoCSS 与 Less 基础。

## Goals / Non-Goals

**Goals:**

- 用同一个搜索优先顶部骨架组织三种呈现状态，并通过留白、排版和轻量选中填充弱化内部边界。
- 用真实、持久化、可恢复的 Action ID 集合驱动“最近使用”和“已固定”。
- 为首页和搜索结果提供一致的 Action tile 视觉、图标回退和键盘优先执行。
- 保留现有单窗口、固定离散高度、Host Dispatcher、页面错误隔离、主题和本地化边界。

**Non-Goals:**

- 不实现 avatar 交互、账户、通知或身份模型。
- 不实现“全部”入口、固定管理页面或全部 Action 页面。
- 不实现插件 Provider lifecycle、Manifest Action 投影、插件资产解析或第三方页面运行时。
- 不改变搜索评分，不让最近使用或固定状态影响搜索相关性。
- 不重新设计设置正文，也不新增 UI/状态管理/路由依赖。

## Decisions

### 1. 保留单一 App Shell 状态机，统一顶部槽位

继续从 `activePage` 与规范化查询派生 `home`、`search`、`page`，不引入路由器或平行 Shell store。三种状态共享外层 surface、顶部行和右侧 avatar 槽位：

- `home` 与 `search` 在左侧渲染同一个受控搜索输入；
- `page` 在相同几何位置渲染非输入的页面上下文条；
- 三种状态右侧都渲染非交互圆形 avatar 占位；
- 内容区分别渲染双集合首页、单一搜索结果区或活动页面。

avatar 使用普通装饰元素而不是 `button`、链接或可聚焦控件，不提供 hover、pointer cursor、角标或可访问操作名称。页面上下文条视觉上与搜索输入同属顶部容器，但语义上是包含文本与关闭 icon button 的 region，避免把不可编辑页面状态伪装成 input。

备选方案是为三个状态分别维护 header；这会继续制造不一致间距和焦点路径，因此不采用。把 page context 放进只读 Input 也会给辅助技术错误的编辑预期，因此不采用。

### 2. 首页使用两个有上限的真实 Action 集合

新增 `LauncherActionCollections` 快照：

```text
recent_action_ids: ordered unique action IDs, newest first, max 8
pinned_action_ids: ordered unique action IDs, max 8
```

Rust 将该快照保存在独立版本化 JSON 文件中。缺失文件返回两个空集合；读取时拒绝类型错误、重复、超过上限或不合法的 ID；写入采用临时文件、同步和原子替换，避免部分内容。Tauri 提供窄命令：读取快照、记录一次成功使用、设置固定状态。Rust 不复制 TypeScript Registry，也不判断 Action 当前是否注册或启用。

React 读取集合后，通过当前 Registry snapshot 解析每个 ID，保留持久化顺序，只渲染已注册且启用的 Action。无法解析的 ID 暂不显示，但持久化值保留，以允许临时不可用的 Provider 恢复；集合不会用默认 Registry 顺序或虚构卡片补齐。两个集合为空时仍保留本地化分区标题并显示轻量空状态。

最近使用只在 Dispatcher 返回成功后更新。集合持久化失败不得把已经成功的 Action 改写成执行失败；App Shell 保留可继续使用的内存状态并通过安全、本地化 live region 报告集合同步失败。失败、未知或禁用 Action 不进入最近使用。

最近使用 tile 与已固定 tile 都使用同一 Dispatcher 激活。最近使用 tile 提供独立、可聚焦的“固定”icon button，已固定 tile 提供“取消固定”icon button；主 Action button 与次级固定按钮是同级元素，避免嵌套交互控件。“全部”使用本地化普通文本占位，不是链接、button 或可聚焦元素，不带 chevron、hover 和 pointer cursor，并从辅助技术操作流中隐藏。

备选方案是只做静态首页或用 Registry 默认顺序填充；这会违反真实数据边界，因此不采用。允许无限固定但只显示前八项会产生不可访问数据，而“全部”本次又无能力，因此两个集合都限制为八项。

### 3. Action 图标使用可选 Host token 与稳定回退

为 `LauncherActionDescriptor` 增加可选、可序列化的 `icon`：

```text
{ kind: "host", token: <validated token> }
```

token 使用稳定的小写命名规则，由 Host 图标解析器映射到现有图标组件；当前内置 Action 可以声明 Host token。Descriptor 验证、克隆和 snapshot 必须保留该字段，但 executor 仍完全隔离。搜索结果可携带该安全展示元数据，搜索评分、排序和匹配不得读取图标。

缺少 icon 或 token 无法解析时，UI 使用同一个通用 Action 图标，并保持可读 Action 标题；图标作为装饰不取代文本标签。插件 Manifest 的 package-local asset icon 仍不直接进入 Registry，未来 Provider adapter 必须另行定义安全投影。

备选方案是在 React 中按 `action_id` 硬编码图标；这会把 Provider 特判带入展示层，无法复用，因此不采用。直接在 Descriptor 保存 ReactNode、路径或任意 URL 会破坏可序列化和资源边界，也不采用。

### 4. 搜索结果使用固定四列网格，但保留 combobox/listbox 模型

Native 宽度固定为 650px，因此搜索结果使用四列、最多八项、最多两行的 CSS grid。可见分区只有本地化“搜索结果”标题、真实 tile、必要无结果/错误状态；结果数量与执行状态继续通过 live region 提供，普通成功/计数消息不形成额外视觉分区。

输入继续持有焦点，并通过 `aria-activedescendant` 指向 listbox option。键盘移动不循环：

- `ArrowLeft` / `ArrowRight` 移动到相邻结果并在集合边界停止；
- `ArrowUp` / `ArrowDown` 按四列偏移移动，目标不存在时保持当前选择；
- `Enter` 与 pointer 使用同一 Dispatcher；
- `Escape` 清空查询、结果和选择并恢复输入焦点。

选择、hover、pending 和 focus-visible 使用 Semi theme token 与 Less，不使用结果间边框或颜色作为唯一状态信号。四列是固定 Native surface 的产品约束，不依赖 DOM 测量。

备选方案是保留纵向列表，仅改变颜色；它不能形成目标中的图标化布局。动态响应式列数会让 `aria-activedescendant` 的二维键盘规则依赖布局测量，因此当前固定宽度下不采用。

### 5. 页面上下文通过 ID 解析，不把显示文本复制进 ActivePage

`ActivePage` 继续只携带 `owner_id`、`page_id`、`opened_by_action_id`。App Shell 通过窄 `PageContextResolver` 解析页面上下文：当前 `lensx.core` 所属方显示为本地化产品名称，Action 名称从 Registry 中按 `opened_by_action_id` 解析并应用 locale fallback；若打开后 Action 临时不可用，则使用页面定义的本地化标题回退。

上下文条按“所属方名称 / Action 名称”展示，并提供单独的关闭 icon button。关闭沿用现有返回 `home`、清空页面态和恢复搜索输入焦点的路径。设置正文与 PageErrorBoundary 保持不变。

备选方案是把显示字符串写入 `ActivePage`；这会复制 locale 派生状态并在切换语言时变旧，因此不采用。插件所属方名称解析留给未来 Provider catalog，不在本次伪造插件上下文。

### 6. 只调整 home 固定高度并保持 Native 离散边界

将 Tauri 初始高度与 `home` 固定高度从 240px 调整为 320px，以容纳顶部行、两条紧凑集合和状态区域。`search` 保持 480px，`page` 保持 600px，宽度、最小/最大高度、不可手动缩放、透明和 always-on-top 配置不变。

React 仍只提交 `home`、`search`、`page` mode，Rust 选择固定尺寸。不得根据 tile 数量、空状态或 DOM 测量提交尺寸。

### 7. 样式与文案沿用现有基础

Semi Design 提供 Input、icon button、Typography、Tooltip/反馈等组件；UnoCSS 负责行列、间距和尺寸，Less 负责 surface、tile、grid、选中、pending、theme 和弱分割状态。移除当前产品标题/介绍、首页虚线容器、结果外框与逐项分割线；外层使用背景、圆角和阴影形成窗口边界，不增加强描边。

所有可见文本进入 JSON i18n 资源和 schema，包括“最近使用”“已固定”“全部”“搜索结果”、空状态、固定/取消固定和集合失败反馈。英语仍为 canonical/default，简体中文 key 集完整一致。avatar 和“全部”不产生可访问操作语义。

## Risks / Trade-offs

- [集合写入发生在 Action 成功之后，持久化可能失败] → 将 Action 结果与集合同步结果分开；不回滚已完成 Action，使用安全反馈并允许后续重试。
- [持久化中残留失效 Action ID] → 渲染时通过 Registry 过滤；保留 ID 允许临时 Provider 恢复，固定数量上限防止无界增长。
- [固定最多八项限制未来扩展] → 当前“全部”没有能力，显式上限保证每个固定项可访问；未来实现管理页时通过新 change 扩展。
- [四列网格在非 Native 测试宽度下显得拥挤] → 产品 Native 宽度固定 650px；测试验证语义和选择，不依赖像素测量，并为极窄开发视口保留最小布局保护。
- [Host icon token 不能直接表达插件资产] → 当前只支持 Host token 与通用回退；插件资产投影在 Provider lifecycle change 中单独设计。
- [非交互“全部”看起来可能可点击] → 不显示 chevron，不使用链接色、hover、cursor 或焦点样式，并通过测试确认没有 button/link 语义。

## Migration Plan

1. 先扩展 Action Descriptor、图标解析和测试，保持 icon 可选以兼容现有注册输入。
2. 增加 Rust 集合模型、原子存储、Tauri 命令和错误映射；旧安装因文件缺失自动得到空集合。
3. 接入前端集合服务、成功执行记录和固定/取消固定，再替换首页与搜索结果组件。
4. 最后统一顶部区域、页面上下文和固定高度，更新双语文档与完整验证。

回滚前端后，新集合文件会被旧版本忽略；Descriptor 的 icon 是可选字段，移除内置 icon 不影响 Action 身份或执行。若回滚 Rust home 高度，旧前端恢复 240px 占位布局；不得只回滚尺寸而保留新双集合首页。

## Open Questions

无。avatar 与“全部”的非交互范围、固定数量上限和当前 Host 页面上下文均已在本设计中确定；未来为这些占位增加能力必须通过新的 OpenSpec change。
