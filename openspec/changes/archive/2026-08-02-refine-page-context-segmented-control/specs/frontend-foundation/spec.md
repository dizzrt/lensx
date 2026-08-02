## ADDED Requirements

### Requirement: The shared page context must use a compact segmented control

当 App Shell 显示活动页面时，系统 MUST 将页面上下文呈现为按内容收缩且受可用宽度约束的连续分段胶囊。胶囊 MUST 按视觉顺序包含 Owner 段、打开页面的 Action 段以及紧邻 Action 的关闭图标按钮；Owner 段与 Action 段之间 MUST 使用装饰性的斜切分隔和主题感知的层级填充，而 MUST NOT 使用可见的 `/` 文本代替分段结构。

Owner 段 MUST 显示当前 locale 下解析后的 Owner 名称和 Owner 图标。Owner 图标缺失或无法解析时，系统 MUST 显示稳定的通用提供方 fallback，且视图组件 MUST NOT 通过 Owner ID 硬编码图标分支。Action 段 MUST 显示打开当前页面的 Action 名称；系统 MUST NOT 将 Action 图标当作 Owner 图标。

Owner 与 Action 段 MUST 保持非交互、不可聚焦，并 MUST NOT 获得按钮、链接、菜单或面包屑导航语义。关闭图标按钮 MUST 始终保持可见、可通过指针和键盘操作、具有当前 locale 下的可访问名称，并继续排除原生窗口拖动。胶囊之外的完整页面上下文槽位 MUST 继续支持窗口拖动。

分段胶囊 MUST 使用应用主题 token，在英文、简体中文、浅色主题和深色主题中保持清晰的文本、图标、层级填充、悬停与键盘焦点状态。Owner 或 Action 文本超出可用宽度时，系统 MUST 约束并省略文本，同时 MUST 保留完整关闭按钮和右侧非交互头像占位符。

#### Scenario: Display a page context

- **WHEN** App Shell 进入具有已解析 Owner 和打开 Action 的 `page` 展示状态
- **THEN** 顶部槽位显示按内容收缩的 Owner、Action 与关闭按钮连续分段胶囊
- **THEN** 关闭按钮紧邻 Action，而不是被推到页面上下文槽位的远端
- **THEN** Owner 与 Action 之间显示装饰性斜切分隔，不显示 `/` 文本

#### Scenario: Resolve a missing owner icon

- **WHEN** 页面上下文没有 Owner 图标或提供了无法解析的 Owner 图标 token
- **THEN** Owner 段显示稳定的通用提供方 fallback
- **THEN** Action 图标不会被误用为 Owner 图标
- **THEN** 页面仍然可以通过关闭按钮返回 Home

#### Scenario: Constrain long localized context

- **WHEN** Owner 名称或 Action 名称在当前 locale 下超出页面上下文可用宽度
- **THEN** 对应文本在其分段内收缩并省略
- **THEN** 关闭按钮保持完整可见且可操作
- **THEN** 右侧非交互头像占位符保持可见

#### Scenario: Inspect page context interaction semantics

- **WHEN** 用户或辅助技术检查分段页面上下文
- **THEN** Owner 与 Action 段不具有按钮、链接、菜单或键盘焦点语义
- **THEN** 关闭按钮是页面上下文中唯一可聚焦的操作
- **THEN** 从非交互分段或周围槽位开始的主鼠标拖动仍请求移动原生窗口
- **THEN** 从关闭按钮开始的指针或键盘操作不请求移动窗口

#### Scenario: Render supported themes and locales

- **WHEN** App Shell 在英文或简体中文以及浅色或深色主题中显示分段页面上下文
- **THEN** Owner 和 Action 分段使用当前主题的语义填充与文本 token
- **THEN** 关闭按钮在默认、悬停和键盘焦点状态中保持可辨识
- **THEN** 分段胶囊之外的顶部拖动表面不获得持久填充
