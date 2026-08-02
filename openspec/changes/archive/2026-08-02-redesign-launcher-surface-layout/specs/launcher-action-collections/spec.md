## ADDED Requirements

### Requirement: Launcher Action collections must use bounded ordered Action identities

系统 MUST 提供 Host-owned 的 `recent_action_ids` 与 `pinned_action_ids` 集合。每个集合 MUST 只包含唯一、合法且有序的 `action_id`，并 MUST 最多保存八项；最近使用 MUST 按最后一次成功使用从新到旧排序，已固定 MUST 保持用户固定顺序。集合 MUST NOT 保存 executor、React 状态、Registry 内部对象、Action 标题、图标或其他派生展示数据。

App Shell MUST 使用当前 Action Registry snapshot 解析集合 ID，只展示仍已注册且启用的真实 Action，并保持集合顺序。缺失、禁用或无法解析的 ID MUST NOT 被显示，也 MUST NOT 由 Registry 默认顺序、模拟 Action 或推荐项补齐。

#### Scenario: 读取有效集合

- **WHEN** 持久化快照包含唯一且合法的最近使用与已固定 Action ID
- **THEN** 系统按持久化顺序返回两个只读集合
- **THEN** 每个集合最多包含八项
- **THEN** 快照不包含 executor 或派生展示数据

#### Scenario: 集合包含暂时不可用的 Action

- **WHEN** 集合中的 Action ID 在当前 Registry snapshot 中缺失或对应 Action 已禁用
- **THEN** App Shell 不显示该 Action tile
- **THEN** App Shell 不使用其他 Action 填充该位置
- **THEN** 持久化集合仍保留该 ID，以允许临时不可用的 Action 后续恢复

#### Scenario: 两个集合均为空

- **WHEN** 最近使用和已固定集合没有任何 ID
- **THEN** App Shell 显示本地化的“最近使用”和“已固定”分区及各自空状态
- **THEN** App Shell 不显示虚构 Action、推荐内容或 Registry 默认排序

### Requirement: Launcher Action collections must persist through a typed Rust boundary

Rust MUST 拥有可序列化、版本化的 Launcher Action collections 快照，并 MUST 通过类型化 Tauri 命令提供读取、记录成功使用和设置固定状态。文件缺失 MUST 返回空集合。读取和变更 MUST 验证字段、版本、Action ID、唯一性、顺序和八项上限；持久化 MUST 使用不会留下部分文件的原子写入流程。错误 MUST 返回稳定 code、operation 与安全 message，且 MUST NOT 暴露文件内容、绝对路径或内部异常。

#### Scenario: 首次启动时集合文件不存在

- **WHEN** Rust 找不到 Launcher Action collections 文件
- **THEN** 读取命令返回空的最近使用与已固定集合
- **THEN** App Shell 可以继续进入 home 状态

#### Scenario: 读取无效集合文件

- **WHEN** 集合文件格式错误、版本不受支持、包含重复 ID、非法 ID 或超过上限
- **THEN** Rust 返回可序列化的稳定读取错误
- **THEN** 前端使用安全空集合继续运行并显示本地化失败反馈
- **THEN** 错误不包含文件内容、绝对路径或内部异常

#### Scenario: 原子写入成功

- **WHEN** Rust 接收一个有效的记录使用或设置固定状态请求
- **THEN** Rust 原子保存完整的新快照
- **THEN** 命令返回已确认保存的完整集合快照
- **THEN** 后续读取返回相同顺序与内容

#### Scenario: 集合写入失败

- **WHEN** Rust 无法验证或原子保存变更后的集合
- **THEN** Rust 返回稳定、安全的写入错误
- **THEN** 已确认的持久化快照不被部分覆盖
- **THEN** 前端仍允许后续 Action 搜索与执行

### Requirement: Successful Action execution must update recent use without changing dispatch semantics

App Shell MUST 只在 Host Dispatcher 返回成功后请求记录该 `action_id`。记录时，已有 ID MUST 移到首位，新 ID MUST 插入首位，超过八项时 MUST 删除最旧项。未知、禁用、执行失败或抛出异常的 Action MUST NOT 进入最近使用。记录最近使用失败 MUST NOT 把已经成功的 Dispatcher 结果改写为 Action 执行失败。

#### Scenario: 首次成功执行 Action

- **WHEN** Dispatcher 成功执行一个尚未出现在最近使用集合中的 Action
- **THEN** 系统将该 Action ID 插入最近使用首位
- **THEN** 最近使用集合仍保持唯一且不超过八项

#### Scenario: 再次成功执行已有 Action

- **WHEN** Dispatcher 成功执行一个已在最近使用集合中的 Action
- **THEN** 系统将该 Action ID 移到首位
- **THEN** 集合中不产生重复 ID

#### Scenario: Action 执行失败

- **WHEN** Dispatcher 返回 `action_not_found`、`action_unavailable` 或 `action_execution_failed`
- **THEN** 最近使用集合保持不变

#### Scenario: Action 成功但最近使用写入失败

- **WHEN** Dispatcher 已返回成功但 Rust 无法保存最近使用更新
- **THEN** App Shell 保留 Action 成功结果
- **THEN** App Shell 通过本地化安全反馈报告集合同步失败
- **THEN** 用户仍可继续搜索和执行 Action

### Requirement: Users must be able to pin and unpin visible home Actions

最近使用 Action tile MUST 提供与主 Action 激活分离的可访问固定操作；已固定 Action tile MUST 提供与主 Action 激活分离的可访问取消固定操作。固定一个未固定 ID MUST 将其追加到已固定集合；取消固定 MUST 删除对应 ID并保持其他项顺序。已固定集合已达到八项时，系统 MUST 拒绝新增固定并提供本地化反馈，而不是静默删除已有固定项。

“全部”MUST 只作为“已固定”标题右侧的本地化视觉占位。它 MUST NOT 是 button、链接、菜单触发器或可聚焦元素，MUST NOT 显示 chevron、hover、pointer cursor 或可访问操作名称。

#### Scenario: 从最近使用固定 Action

- **WHEN** 用户激活某个最近使用 tile 的固定 icon button 且已固定集合少于八项
- **THEN** 系统将该 Action ID 追加到已固定集合
- **THEN** 主 Action 不被执行
- **THEN** 已固定分区显示该真实 Action

#### Scenario: 取消固定 Action

- **WHEN** 用户激活已固定 tile 的取消固定 icon button
- **THEN** 系统从已固定集合删除该 Action ID
- **THEN** 其他已固定 ID 的相对顺序保持不变
- **THEN** 主 Action 不被执行

#### Scenario: 固定集合已满

- **WHEN** 已固定集合已有八项且用户尝试固定另一个 Action
- **THEN** 系统拒绝新增固定
- **THEN** 现有八项保持不变
- **THEN** App Shell 显示本地化且可恢复的容量反馈

#### Scenario: 检查“全部”占位

- **WHEN** 用户或辅助技术检查“已固定”分区标题
- **THEN** 视觉界面在标题右侧显示本地化“全部”文本
- **THEN** 页面不存在名称为“全部”的 button、链接或菜单触发器
- **THEN** 该占位不进入键盘焦点顺序

### Requirement: Home Action collections must remain accessible, localized, and theme-aware

最近使用与已固定分区、空状态、Action 标题、固定/取消固定 accessible name、容量和持久化反馈 MUST 使用应用 i18n，默认 `en-US` 并提供语义一致的 `zh-CN`。Action tile 的主操作与固定操作 MUST 分别可通过键盘和指针完成，且 MUST 有可见 focus 状态。light/dark theme 下 tile、选中、hover、focus、空状态和反馈 MUST 使用 Semi Design 支持的 theme token，不得只依赖颜色传达状态。

#### Scenario: 仅使用键盘操作首页 Action

- **WHEN** 用户通过键盘导航最近使用或已固定 tile
- **THEN** 用户可以分别聚焦并执行主 Action 或固定/取消固定操作
- **THEN** focus 顺序不包含 avatar 或“全部”占位

#### Scenario: 使用简体中文

- **WHEN** 应用 locale 为 `zh-CN`
- **THEN** 分区标题、空状态、固定操作和集合反馈使用简体中文
- **THEN** Action 标题继续使用现有 `zh-CN` 到 `en-US` fallback

#### Scenario: 切换主题

- **WHEN** 用户在首页可见时切换 light/dark theme
- **THEN** 两个集合、tile、操作和反馈使用对应 theme token
- **THEN** 文本、focus 和交互状态保持可辨识

