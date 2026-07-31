## ADDED Requirements

### Requirement: Action Search 必须统一消费 Host Registry snapshot

系统 MUST 提供框架无关的 Launcher Action Search，输入查询字符串、应用 locale、正整数结果上限和 `LauncherActionRegistry` 的只读 descriptor snapshot，输出确定性排序的可序列化 Action 结果。搜索 MUST 只依赖合法 Action Descriptor 的 `action_id`、`owner_id`、本地化 `title`、可选 `description`、`default_keywords` 和 Host-owned `enabled`，MUST NOT 按内置、插件或其他 provider 来源使用不同搜索路径。每个结果 MUST 保留 `action_id`、`owner_id`、已解析的本地化展示文本和确定性相关性分数，且 MUST NOT 包含 executor、函数、Registry 内部状态、React 状态、Tauri 对象或 Rust 对象。

#### Scenario: 搜索内置 Action

- **WHEN** Registry snapshot 包含一个合法且启用的 Host 内置 Action，查询与其可搜索元数据匹配
- **THEN** 搜索返回该 Action 的可序列化结果
- **THEN** 结果不包含该 Action 的 executor

#### Scenario: 搜索未来注册的其他来源 Action

- **WHEN** 任意 provider 在搜索发生前将合法 Action 注册到同一 Host Registry
- **THEN** 搜索使用与内置 Action 相同的匹配和排序规则处理该 Action
- **THEN** 搜索不读取 provider 私有数据或根据来源类型建立分支

#### Scenario: 调用方修改搜索输入或结果

- **WHEN** 调用方在一次搜索后修改原始查询、原始 snapshot 或返回结果
- **THEN** 搜索过程不修改 Registry snapshot 或 descriptor
- **THEN** 后续 Registry lookup、snapshot 和搜索结果不受该修改影响

### Requirement: 查询必须经过确定性规范化和分词

搜索 MUST 对查询执行 Unicode NFKC 规范化、使用当前应用 locale 的大小写折叠、去除首尾空白并将连续 Unicode 空白折叠为单个空格。规范化后的查询 MUST 按 Unicode 空白拆分为非空 token。空字符串或只包含空白的查询 MUST 返回空结果，MUST NOT 隐式展示任意 Action、最近使用或固定内容。

#### Scenario: 规范化大小写和空白

- **WHEN** 用户输入包含不同大小写、全角兼容字符或重复空白的查询
- **THEN** 搜索在匹配前按当前 locale 产生相同的规范查询和 token
- **THEN** 等价输入产生相同的结果顺序

#### Scenario: 查询为空

- **WHEN** 输入为空或规范化后不包含任何 token
- **THEN** 搜索返回空结果
- **THEN** 搜索不把 Registry 默认顺序当作推荐顺序

### Requirement: 匹配和排序必须可解释且确定

搜索 MUST 使用当前 locale 解析 Action 标题、描述和关键词，并沿用 Action metadata 的 `en-US` fallback。每个查询 token MUST 至少匹配标题、一个关键词或描述，否则该 Action MUST 被排除。支持的匹配关系 MUST 限于 exact、prefix 和 substring，不得在 v0 中执行编辑距离、语义或个性化匹配。相关性 MUST 优先考虑完整查询的标题 exact/prefix，其次按每个 token 的最佳匹配累加分数；单 token 匹配优先级 MUST 为标题 exact、关键词 exact、标题 prefix、关键词 prefix、标题 substring、关键词 substring、描述 substring。分数相同时 MUST 按 `action_id` 升序稳定排序。

#### Scenario: 标题优先于描述

- **WHEN** 一个 Action 的标题精确匹配查询，而另一个 Action 仅在描述中包含查询
- **THEN** 标题精确匹配的 Action 排在描述匹配之前

#### Scenario: 多 token 跨字段匹配

- **WHEN** 查询包含多个 token，且一个 Action 的标题匹配其中一部分、关键词匹配其余部分
- **THEN** 该 Action 满足全部 token 匹配并进入结果
- **THEN** 每个 token 只使用其最佳字段匹配参与评分

#### Scenario: 部分 token 未匹配

- **WHEN** 一个 Action 只匹配多 token 查询中的一部分 token
- **THEN** 搜索排除该 Action

#### Scenario: 两个 Action 得分相同

- **WHEN** 两个 Action 对同一查询产生相同相关性分数
- **THEN** 搜索按 `action_id` 升序返回它们
- **THEN** provider 注册顺序不改变结果顺序

#### Scenario: 当前 locale 文本缺失

- **WHEN** 当前应用 locale 为 `zh-CN`，而 Action 的可选简体中文标题、描述或关键词缺失
- **THEN** 搜索使用该字段允许的 `en-US` fallback
- **THEN** fallback 后的文本遵循相同匹配和排序规则

### Requirement: 搜索必须过滤不可用 Action 并限制结果数量

搜索 MUST 排除 `enabled = false` 的 Action。结果上限 MUST 是正整数，搜索 MUST 只返回排序后的前 N 项；App Shell MUST 使用 8 作为 v0 结果上限。没有匹配项时 MUST 返回空集合，而不是模拟结果、禁用结果或未注册 Action。

#### Scenario: 匹配的 Action 已禁用

- **WHEN** 一个 Action 的元数据匹配查询但 descriptor 的 `enabled` 为 `false`
- **THEN** 搜索不返回该 Action

#### Scenario: 匹配项超过上限

- **WHEN** 符合条件的启用 Action 数量超过结果上限
- **THEN** 搜索先完成确定性排序
- **THEN** 搜索只返回排序后的前 N 项

#### Scenario: 没有匹配项

- **WHEN** 非空查询没有匹配任何启用 Action
- **THEN** 搜索返回空集合
- **THEN** 系统不创建模拟 Action 填充结果

### Requirement: App Shell 必须展示真实 Action 搜索状态

React App Shell MUST 将受控 Launcher 输入连接到默认 Host Action Service，并对当前 Registry snapshot 执行统一搜索。空查询时 MUST 不显示结果列表或空状态；非空查询有匹配时 MUST 显示有界、可滚动的真实 Action 结果列表；非空查询无匹配时 MUST 显示本地化空状态。结果 MUST 展示已解析的 Action 标题，并 MAY 展示描述，但 MUST NOT 把 owner、内部 score 或 executor 暴露为普通产品文案。该界面 MUST NOT 根据结果数量自动修改 Native Launcher 窗口高度。

#### Scenario: 输入匹配内置 Action 的查询

- **WHEN** 用户输入与 `lensx.core.hide_launcher` 标题或关键词匹配的非空查询
- **THEN** App Shell 显示该真实 Action 的本地化结果
- **THEN** 页面不显示模拟 Action 或插件入口

#### Scenario: 清空查询

- **WHEN** 用户删除查询中的全部内容
- **THEN** App Shell 移除结果列表、选中态和空状态
- **THEN** Launcher 输入继续保持可编辑和可聚焦

#### Scenario: 非空查询没有结果

- **WHEN** 用户输入不匹配任何启用 Action 的非空查询
- **THEN** App Shell 显示本地化无结果状态
- **THEN** 页面不显示不可用或虚构的 Action

#### Scenario: 结果数量超出可见区域

- **WHEN** 搜索返回的结果无法全部放入当前 Launcher 内容区域
- **THEN** 结果区域在现有 Native 窗口内滚动
- **THEN** 系统不因结果数量改变 Native 窗口高度

### Requirement: 用户必须能通过键盘或指针选择并执行结果

当结果集合非空时，App Shell MUST 默认选中第一项。查询或结果集合变化时，选中项 MUST 重置为新的第一项；没有结果时 MUST 清除选中项。`ArrowDown` 和 `ArrowUp` MUST 在结果边界内移动选中项且不得把焦点移出 Launcher 输入，`Enter` MUST 通过现有 Host Dispatcher 执行所选 `action_id`，指针激活结果 MUST 执行同一 dispatch 路径，`Escape` MUST 清空查询和结果并恢复输入焦点。一次 dispatch 进行中 MUST 防止同一交互产生重复执行。

#### Scenario: 使用方向键选择结果

- **WHEN** 输入保持焦点且结果集合包含多个 Action
- **THEN** `ArrowDown` 将选中项移动到下一项并停在最后一项
- **THEN** `ArrowUp` 将选中项移动到上一项并停在第一项

#### Scenario: 按 Enter 执行所选 Action

- **WHEN** 一个结果已选中且用户按下 `Enter`
- **THEN** App Shell 将该结果的 `action_id` 交给 Host Dispatcher
- **THEN** 搜索层或 React 组件不直接读取或调用 executor

#### Scenario: 使用指针执行结果

- **WHEN** 用户使用指针激活一个搜索结果
- **THEN** App Shell 通过与键盘执行相同的 Dispatcher 路径执行该 Action

#### Scenario: 重复触发正在执行的 Action

- **WHEN** 所选 Action 的 dispatch 尚未完成且用户再次按 Enter 或激活同一结果
- **THEN** App Shell 不启动第二次并发 dispatch

#### Scenario: 清除当前搜索

- **WHEN** 结果可见且用户按下 `Escape`
- **THEN** App Shell 清空查询、结果和选中态
- **THEN** Launcher 输入恢复焦点

### Requirement: 执行结果和失败必须安全恢复

成功 dispatch 后，App Shell MUST 清空当前查询、结果和选中态；Action 自身的 Host executor 决定是否隐藏窗口或执行其他受控行为。`action_not_found`、`action_unavailable` 或 `action_execution_failed` MUST 显示本地化、可诊断但不泄露内部异常的错误反馈，并 MUST 保留当前查询和可恢复的选中态。搜索或 dispatch 的异步失败 MUST NOT 破坏 Launcher 输入的后续使用。

#### Scenario: 成功执行 Hide Launcher

- **WHEN** 用户执行 `lensx.core.hide_launcher` 且 Dispatcher 返回成功
- **THEN** App Shell 清空搜索状态
- **THEN** Host-owned executor 通过现有受控路径隐藏 Launcher

#### Scenario: 搜索后 Action 变为不可用

- **WHEN** 结果展示后 Action 在执行前消失或变为不可用
- **THEN** Dispatcher 返回对应 typed failure
- **THEN** App Shell 显示本地化错误并保留查询，允许用户恢复

#### Scenario: Executor 执行失败

- **WHEN** Dispatcher 返回 `action_execution_failed`
- **THEN** App Shell 显示安全的本地化错误反馈
- **THEN** 产品界面不显示异常堆栈、Native 对象或 executor 细节

### Requirement: 搜索交互必须可访问、本地化并适配主题

Launcher 输入和结果集合 MUST 遵循可访问 combobox/listbox 交互语义，输入 MUST 公开展开状态、结果容器关系和当前 active descendant；每个结果 MUST 具有稳定 option 身份、选中状态和可见焦点/高亮状态。结果数量、无结果、执行中、成功或失败状态 MUST 通过适当的 live region 提供，不得只依赖颜色表达。所有用户可见文案 MUST 使用应用 i18n，默认 `en-US` 并提供语义一致的 `zh-CN`；结果和状态 MUST 使用 Semi Design 支持的 light/dark theme token。简单布局 MUST 使用 UnoCSS，复杂的选中、滚动、主题和交互状态 MUST 使用 Less。

#### Scenario: 屏幕阅读器浏览结果

- **WHEN** 非空查询产生 Action 结果
- **THEN** 输入公开 listbox 关系和当前选中 option
- **THEN** 屏幕阅读器可以获知结果数量和选中项

#### Scenario: 使用简体中文

- **WHEN** 应用 locale 为 `zh-CN`
- **THEN** 输入辅助文本、无结果和执行反馈使用简体中文
- **THEN** Action 展示文本遵循现有 `zh-CN` 到 `en-US` fallback

#### Scenario: 切换主题

- **WHEN** 应用在结果可见时切换 light 或 dark theme
- **THEN** 结果、选中态、滚动区域和反馈使用对应 Semi Design theme token
- **THEN** 文本和选中状态保持可辨识

#### Scenario: 仅使用键盘完成搜索

- **WHEN** 用户不使用指针输入查询、选择结果并执行 Action
- **THEN** 所有操作均可由 Launcher 输入上的键盘交互完成
- **THEN** 焦点不会被不可交互的展示元素捕获
