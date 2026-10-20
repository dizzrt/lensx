# Spec Delta

## ADDED Requirements

### Requirement: Launcher Action tiles must keep a square interaction surface

Recent、Pinned 和 Search 中的 Action tile MUST 将图标和标题包含在同一个宽高相等的交互区域中。整个区域 MUST 可用于主操作，hover、focus、selected 状态 MUST 遵循相同的方形边界和圆角。标题长短及状态变化 MUST NOT 改变卡片尺寸或相邻卡片位置，也 MUST NOT 缩放图标。

首页 MUST 保持每个集合八列、按已确认顺序显示最多八个有效 Action；Search MUST 保持四列、最多八项且最多两行。不同界面的方形边长可以随各自列宽不同，但同一网格内 MUST 一致。卡片 MUST NOT 被剩余行高拉成长方形，且 MUST NOT 根据文本或条目数量改变原生窗口尺寸。静止状态 MUST 保持连续底面，只有既有交互状态使用主题填充。

#### Scenario: Home collections contain their maximum number of Actions

- **WHEN** Recent 和 Pinned 各有八个可显示的 Action，且标题长度不同
- **THEN** 每个集合在原有首页窗口内按既定顺序显示八个方形 Action
- **THEN** 两个集合均保持八列，短标题和长标题的卡片具有相同边长
- **THEN** 点击、hover 和键盘焦点对应包含图标与标题的完整区域

#### Scenario: Search fills two rows

- **WHEN** Search 返回八项并显示两行结果
- **THEN** 结果保持四列，每个 Action 的宽高相等
- **THEN** 选中、pending 或错误反馈不会将卡片拉成长方形，也不会改变原生窗口尺寸
- **THEN** 结果身份、排序、方向键四列偏移和执行行为继续遵循既有搜索契约

#### Scenario: A collection or search result is empty

- **WHEN** 某个首页集合为空，或非空查询没有结果
- **THEN** 界面继续显示对应的本地化空态
- **THEN** 界面不为占据方形位置而生成虚构 Action 或名称提示

### Requirement: Launcher Action titles must adapt within a bounded single-line font size

每个 Action 标题 MUST 保持单行，并以完整的当前本地化标题为适配输入。标题在 `14px` 下能完整容纳时 MUST 使用 `14px`；否则 MUST 根据实际文字与可用宽度在 `12–14px` 的连续区间内选择尽可能大的可容纳字号，允许有限的小数精度误差。系统 MUST NOT 仅按字符数量选择字号，或把输出限制为预定义的整数字号档位。

只有完整标题在 `12px` 下仍超出可用宽度时，系统 MUST 保持 `12px` 并在末尾显示省略号。系统 MUST NOT 自动改写、删词或永久截断标题数据。图标、标题行高和对齐位置 MUST 保持稳定，可访问名称 MUST 始终包含完整的当前标题。

标题、显示语言、字体度量或有效可用宽度变化时，系统 MUST 重新适配，包括从较小字号恢复到 `14px`。暂时无法获得有效尺寸时，界面 MUST 保持可操作的单行回退和完整可访问名称；恢复有效尺寸后 MUST 重新适配，不得保留失效的测量结果。

#### Scenario: The title fits at the maximum size

- **WHEN** 完整标题在 `14px` 下不超出可用宽度，包括恰好容纳的边界
- **THEN** 标题以 `14px` 完整显示且不添加省略号
- **THEN** 不显示用于补全截断名称的提示

#### Scenario: The title fits at an intermediate size

- **WHEN** 完整标题在 `14px` 下超宽，但能在 `12px` 以上的某个中间字号容纳
- **THEN** 标题以区间内尽可能大的可容纳字号完整显示
- **THEN** 适配允许非整数字号，且不会因提前省略而丢失可显示的字符

#### Scenario: The title still overflows at the minimum size

- **WHEN** 中文、英文或混合文字的完整标题在 `12px` 下仍超宽
- **THEN** 标题以 `12px` 单行显示并在末尾省略
- **THEN** 完整标题继续作为可访问名称和全文提示的内容

#### Scenario: Localization or available width changes

- **WHEN** 标题、语言、字体度量或容器宽度变化
- **THEN** 系统针对新的实际文字和尺寸重新计算字号与省略状态
- **THEN** 新标题在 `14px` 下能容纳时恢复最大字号，旧的截断提示不再保留
- **THEN** 缺失中文标题时继续使用既有英文回退，不改变 Action 身份

#### Scenario: Measurement becomes temporarily unavailable

- **WHEN** 标题容器暂时没有有效宽度，或文字度量暂时不可用
- **THEN** 卡片仍可执行主操作，标题保持单行和完整可访问名称，不产生无效字号
- **THEN** 不将无效尺寸永久判定为已截断
- **THEN** 有效尺寸恢复后重新适配，卡片不会因测量重试持续跳动

### Requirement: Truncated Action names must remain available to pointer and keyboard users

标题在最小字号下实际被省略时，系统 MUST 提供显示完整当前标题的名称提示。首页 MUST 在指针悬停于 Action 或该 Action 的主按钮获得键盘焦点时提供提示；Search MUST 在指针悬停于结果，或者输入框保持焦点且该结果被选中时提供提示，包括默认选中的首项。完整显示的标题 MUST NOT 仅因字号缩小而触发补全提示。

同一 Home 或 Search 界面 MUST 最多显示一个名称提示；Home 的 Recent 与 Pinned MUST 共同遵循此限制。指针悬停项 MUST 优先于键盘焦点或选中项；离开后 MUST 恢复仍有效的键盘提示候选。提示 MUST 始终对应当前触发的卡片实例，即使同一 Action 同时出现在 Recent 和 Pinned 中。

提示 MUST NOT 新增 Tab 停靠点、抢占焦点、修改查询、改变 Action 选择或触发执行。Search 的输入焦点、active descendant、状态区关联、方向键、Enter、Escape 清空及 IME 优先级 MUST 保持既有语义。首页用户 MUST 能通过 Escape 关闭提示而不执行 Action，关闭后在触发条件重新建立前 MUST NOT 自动重开。

提示 MUST 完整显示文字，允许长名称在提示中换行，并在当前窗口范围内避免被卡片裁切。提示 MUST 使用现有语言解析和明暗主题；浮层自身 MUST NOT 引入操作按钮或新的产品文案。触发对象失效、查询清空、界面切换或标题不再省略时 MUST 关闭旧提示；键盘失焦后 MUST 清除键盘提示候选。指针从卡片移入其提示时 MUST 保持可读，直到离开两者或被显式关闭。

#### Scenario: Read a truncated Home title with the pointer

- **WHEN** 用户将指针悬停在被省略标题对应的 Action 上
- **THEN** 提示显示完整当前标题，包含连续长词时也可换行
- **THEN** 卡片不改变尺寸、字号或位置，且无需点击来显示名称
- **THEN** 指针进入提示后仍可阅读，离开后按当前有效焦点候选更新提示

#### Scenario: Read a truncated Home title with the keyboard

- **WHEN** 用户通过键盘使被省略标题的主按钮获得焦点
- **THEN** 显示完整名称提示，主按钮继续保留焦点和完整可访问名称
- **THEN** Enter 和 Space 继续执行既有主操作，提示本身不进入 Tab 顺序
- **THEN** Escape 仅关闭该名称提示；在重新进入触发条件前不立即重开

#### Scenario: Read a selected Search title without moving input focus

- **WHEN** 搜索输入框保持焦点，默认首项或方向键选中的结果标题被省略
- **THEN** 提示显示该结果完整标题而不把焦点移到结果或提示
- **THEN** 输入框的状态区关联和 active descendant 保持正确
- **THEN** 方向键改变选中项后提示随新的截断状态更新，旧提示消失

#### Scenario: Pointer and keyboard candidates coexist

- **WHEN** 键盘焦点或搜索选择对应一个截断标题，而指针进入另一个 Action
- **THEN** 只有指针所在 Action 有资格显示提示，其标题未被省略时不显示提示
- **THEN** 指针离开该 Action 及其提示后，恢复仍有效的键盘候选
- **THEN** 同一 Action 同时出现在 Recent 和 Pinned 时，也不会出现两个浮层或重复的提示标识

#### Scenario: Search keyboard handling remains authoritative

- **WHEN** 名称提示可见且用户在搜索框按下 Escape、Enter 或方向键
- **THEN** 处于 IME 组合或确认阶段时，继续由既有 IME 处理优先级决定行为
- **THEN** 不在 IME 阶段时，Escape 仍在一次按键中清空搜索并关闭提示，Enter 仍执行选中 Action，方向键仍按既有规则移动
- **THEN** 提示不消费按键来要求额外一次搜索退出操作，也不破坏 pending 去重

#### Scenario: A tooltip candidate becomes stale

- **WHEN** Action 被移除、查询清空、界面切换、标题更新为不再省略，或对应卡片卸载
- **THEN** 旧名称提示关闭且不继续显示旧标题
- **THEN** 输入框或首页主按钮失焦时清除对应的键盘候选；独立有效的指针候选仍按规则处理

#### Scenario: Localization and theme change while reading a name

- **WHEN** 用户在 `en-US` 或 `zh-CN`、light 或 dark 模式下查看名称提示，或在提示可见时切换语言或主题
- **THEN** 提示显示当前解析出的完整标题并使用当前主题
- **THEN** 标题重新适配后的省略状态决定提示是否继续显示
- **THEN** 可访问名称、焦点和执行语义保持可用
