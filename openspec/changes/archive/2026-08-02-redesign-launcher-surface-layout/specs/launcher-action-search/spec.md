## MODIFIED Requirements

### Requirement: Action Search must consume Host Registry snapshots uniformly

系统 MUST 提供 framework-neutral Launcher Action Search，接收 query string、应用 locale、positive integer result limit 与来自 `LauncherActionRegistry` 的只读 descriptor snapshot，并返回确定排序、可序列化的 Action results。Search MUST 只依赖合法 Action Descriptor 的 `action_id`、`owner_id`、本地化 `title`、可选 `description`、`default_keywords` 和 Host-owned `enabled` 状态进行匹配与评分，且 MUST NOT 为 built-in、plugin 或其他 provider source 使用不同搜索路径。可选 icon、最近使用与固定状态 MAY 随安全展示结果传递，但 MUST NOT 影响匹配、评分或排序。

每个 result MUST 保留 `action_id`、`owner_id`、解析后的本地化展示文本、确定相关性 score 与可选安全 icon 元数据。Result MUST NOT 包含 executor、函数、Registry internal state、React state、Tauri object 或 Rust object。

#### Scenario: Search a built-in Action

- **WHEN** Registry snapshot 包含一个合法、启用且 searchable metadata 匹配 query 的 Host built-in Action
- **THEN** search 返回该 Action 的可序列化 result
- **THEN** result 可包含 descriptor 的安全 icon 元数据
- **THEN** result 不包含 Action executor

#### Scenario: Search an Action registered by another future source

- **WHEN** 任意 provider 在 search 运行前把合法 Action 注册到同一 Host Registry
- **THEN** search 使用与 built-in Action 相同的匹配与评分规则处理该 Action
- **THEN** search 不读取 provider-private data，也不按 source type 分支

#### Scenario: Recent or pinned state changes

- **WHEN** 某个匹配 Action 的最近使用或固定状态发生变化但 query 与 Registry snapshot 相同
- **THEN** search 返回相同匹配集合、score 与排序
- **THEN** 集合状态不会提升或降低搜索相关性

#### Scenario: A caller modifies search input or results

- **WHEN** caller 在一次 search 后修改原始 query、原始 snapshot 或返回 result
- **THEN** search process 不修改 Registry snapshot 或 descriptor
- **THEN** 后续 Registry lookup、snapshot 与 search result 不受该修改影响

### Requirement: Queries must be normalized and tokenized deterministically

Search MUST 对 query 应用 Unicode NFKC normalization，按当前应用 locale 进行 case folding，移除首尾 whitespace，并把连续 Unicode whitespace 折叠为一个 ASCII space。规范化 query MUST 按 whitespace 拆分为非空 token。空或仅 whitespace 的 query MUST 返回零个搜索结果，MUST NOT 把 Registry 默认顺序当作 recommendation 顺序。独立的 `home` 呈现状态 MAY 在空查询时展示 accepted Launcher Action collections；Search 本身 MUST NOT 生成、排序或填充最近使用与固定内容。

#### Scenario: Normalize case and whitespace

- **WHEN** 用户输入具有不同大小写、full-width compatibility character 或重复 whitespace 的 query
- **THEN** search 在匹配前为当前 locale 下的等价输入生成相同规范化 query 与 token
- **THEN** 等价输入产生相同结果顺序

#### Scenario: The query is empty

- **WHEN** input 为空或 normalization 后没有 token
- **THEN** search 返回零个结果
- **THEN** search 不把 Registry 默认顺序作为 recommendation 顺序
- **THEN** App Shell 可以独立显示由 Launcher Action collections 提供的 home 内容

### Requirement: The App Shell must present real Action Search state

React App Shell MUST 将受控 launcher input 连接到默认 Host Action Service，并对当前 Registry snapshot 执行统一 search。空查询时，它 MUST 不显示搜索结果 collection 或搜索 empty state，并 MUST 返回独立 home 呈现状态。非空查询有匹配项时，它 MUST 在单一本地化“搜索结果”分区中显示固定四列、最多八项且有界的真实 Action tile grid；MUST NOT 额外显示“匹配结果”、推荐、市场或其他 source 分区。非空查询无匹配项时，它 MUST 显示本地化 empty state。

Result MUST 显示解析后的 Action title 与 icon 或稳定回退图标，MAY 显示 description，但 MUST NOT 把 owner、内部 score 或 executor 作为普通产品文案公开。Interface MUST NOT 根据结果数量自动改变 Native Launcher window height。

#### Scenario: A query matches the built-in Action

- **WHEN** 用户输入匹配 `lensx.core.hide_launcher` title 或 keyword 的非空 query
- **THEN** App Shell 在“搜索结果”grid 中显示该真实本地化 Action result
- **THEN** tile 显示有效 Action icon 或稳定通用回退图标
- **THEN** 页面不显示模拟 Action、plugin entry point 或第二结果分区

#### Scenario: Clear the query

- **WHEN** 用户移除 query 的全部内容
- **THEN** App Shell 移除搜索结果 grid、selection 与搜索 empty state
- **THEN** launcher input 保持 editable 与 focusable
- **THEN** App Shell 显示独立 home Action collections

#### Scenario: A non-empty query has no results

- **WHEN** 用户输入不匹配任何 enabled Action 的非空 query
- **THEN** App Shell 在“搜索结果”分区显示本地化 no-results state
- **THEN** 页面不显示不可用或虚构 Action

#### Scenario: Results reach the visible limit

- **WHEN** search 返回八个 Action results
- **THEN** App Shell 以固定四列、最多两行的 grid 显示全部八项
- **THEN** 系统不因结果数量改变 Native window height

#### Scenario: Ordinary result status changes

- **WHEN** result count、selection 或执行 pending 状态变化
- **THEN** App Shell 通过适当 live region 提供必要状态
- **THEN** 普通 count 或 success 消息不形成“搜索结果”之外的额外视觉分区

### Requirement: Users must be able to select and execute results with keyboard or pointer

当 result set 非空时，App Shell MUST 默认选择第一项。当 query 或 result set 变化时，selection MUST 重置为新的第一项；无 result 时 selection MUST 清除。Input MUST 在导航期间保持焦点。`ArrowLeft` 与 `ArrowRight` MUST 在相邻 result 之间移动且不循环；`ArrowUp` 与 `ArrowDown` MUST 按固定四列偏移跨行移动，目标不存在时 MUST 保持当前 selection。`Enter` MUST 通过现有 Host Dispatcher 执行所选 `action_id`，pointer activation MUST 使用同一 dispatch path。`Escape` MUST 清空 query、results 与 selection，并恢复 input focus。一个 dispatch pending 时，相同交互 MUST NOT 启动重复执行。

#### Scenario: Select results horizontally

- **WHEN** input 保持焦点且 result set 包含同一行中的多个 Actions
- **THEN** `ArrowRight` 选择下一项并在最后一项停止
- **THEN** `ArrowLeft` 选择前一项并在第一项停止

#### Scenario: Select results vertically

- **WHEN** input 保持焦点且四列 grid 包含多行 Actions
- **THEN** `ArrowDown` 选择当前索引加四的 result（若存在）
- **THEN** `ArrowUp` 选择当前索引减四的 result（若存在）
- **THEN** 目标 result 不存在时 selection 保持不变

#### Scenario: Execute the selected Action with Enter

- **WHEN** 一个 result 已选择且用户按下 `Enter`
- **THEN** App Shell 将该 result 的 `action_id` 传给 Host Dispatcher
- **THEN** search layer 与 React component 均不读取或调用 executor

#### Scenario: Execute a result with a pointer

- **WHEN** 用户通过 pointer 激活一个 result tile
- **THEN** App Shell 使用与 keyboard execution 相同的 Dispatcher path 执行 Action

#### Scenario: Trigger an Action again while it is executing

- **WHEN** 所选 Action dispatch pending 且用户再次按 `Enter` 或激活同一 result
- **THEN** App Shell 不启动第二个并发 dispatch

#### Scenario: Clear the current search

- **WHEN** results 可见且用户按下 `Escape`
- **THEN** App Shell 清空 query、results 与 selection
- **THEN** launcher input 恢复焦点

### Requirement: Search interaction must be accessible, localized, and theme-aware

Launcher input 与 result collection MUST 遵循 accessible combobox 与 listbox interaction semantics。Input MUST 暴露 expanded state、result container relationship 与当前 active descendant。每个网格 tile MUST 具有稳定 option identity、selected state 和可见 highlight；CSS 四列布局 MUST NOT 改变 listbox/option 语义。Result count、no-results、executing、success 与 failure state MUST 通过适当 live region 提供，且 MUST NOT 只依赖颜色。

所有可见 copy MUST 使用应用 i18n，默认 `en-US` 并提供语义一致的 `zh-CN` resource。“搜索结果”MUST 是唯一可见结果分区标题。Results、icon fallback、selection、hover、pending、focus 与反馈 MUST 使用 Semi Design 支持的 light/dark theme token。简单 grid/spacing MUST 使用 UnoCSS，复杂 selection、scrolling、theme 与 interaction state MUST 使用 Less；result container 与 result 之间 MUST NOT 依赖明显 border 或逐项 divider 建立层级。

#### Scenario: A screen reader navigates results

- **WHEN** 非空 query 产生 Action results
- **THEN** input 暴露 listbox relationship 与当前 selected option
- **THEN** screen reader 可以确定 result count 与 selection
- **THEN** 四列视觉布局不引入错误的额外交互角色

#### Scenario: Use Simplified Chinese

- **WHEN** application locale 为 `zh-CN`
- **THEN** “搜索结果”、input assistance、no-results 与 execution feedback 使用简体中文
- **THEN** Action display text 继续遵循现有 `zh-CN` 到 `en-US` fallback

#### Scenario: Switch the theme

- **WHEN** application 在 results 可见时切换 light/dark theme
- **THEN** result tile、icon fallback、selection、focus 与 feedback 使用对应 theme token
- **THEN** text、selection 与 focus 保持可辨识

#### Scenario: Complete search with the keyboard only

- **WHEN** 用户不使用 pointer 完成 query 输入、二维选择与 Action 执行
- **THEN** 所有操作可通过 launcher input keyboard interaction 完成
- **THEN** focus 不被非交互 avatar 或“全部”占位捕获

