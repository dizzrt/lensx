## MODIFIED Requirements

### Requirement: Shortcut bindings MUST have explicit targets and supported trigger kinds

系统 MUST 支持用于打开 lensX 和执行稳定 Action ID 的全局 chord 或单修饰键双击；Launcher MUST 仅保留一个已选择触发器，默认 `Ctrl+Shift+Space`，切换类型 MUST 停用旧入口且不保留隐藏 fallback。每个 Action MUST 至多拥有一个可清除绑定。配置 v3 MUST 另含 Host 应用内 `detach`，值为一个 chord 或 `null`，默认 `Cmd+D`；它 MUST NOT 成为全局注册、Action 目标或插件公开能力。

#### Scenario: First launch and existing-user migration
- **WHEN** no shortcut configuration exists
- **THEN** 配置 v3 MUST 包含 Launcher chord `Ctrl+Shift+Space`、空 Action 绑定，以及应用内 `detach` chord `Cmd+D`
- **THEN** theme, locale, plugin configuration, and existing collections remain unchanged

#### Scenario: Configure a supported double tap
- **WHEN** the user chooses a modifier double tap
- **THEN** the choices are `Cmd`, `Ctrl`, `Option`, and `Shift`, without separate left/right bindings
- **THEN** triple taps, character or chord double taps, single modifier presses, and macros are rejected

#### Scenario: Remove or replace a binding
- **WHEN** the user clears an Action binding or replaces the selected Launcher trigger
- **THEN** a cleared Action binding becomes inactive; a Launcher replacement leaves only the newly confirmed selected trigger configured
- **THEN** clearing the sole Launcher trigger is rejected, and replacing either kind requires complete save validation

#### Scenario: Validate a chord
- **WHEN** a chord configuration is submitted
- **THEN** it contains one supported primary key and at least one of `Cmd`, `Ctrl`, or `Option`, with optional `Shift`
- **THEN** bare characters, Shift-only character combinations, missing or multiple primary keys, unknown keys, and extra fields are rejected

#### Scenario: Change or clear the detach shortcut
- **WHEN** 用户在设置中为分离命令保存一个受支持 chord 或清除绑定
- **THEN** 系统 MUST 在完整校验和确认持久化后仅启用新 chord，或将 `detach` 保存为 `null` 并停用快捷键入口
- **THEN** 清除分离快捷键 MUST 禁用快捷键分离，保留 Launcher 恢复入口和既有 Action 绑定
- **THEN** 分离目标 MUST NOT 接受 modifier double tap、bare character、宏、多个主键或额外字段

### Requirement: Canonical shortcut identity MUST be unique across all configured targets

系统 MUST 在同一 canonical 冲突空间中对 Launcher、所有 Action 绑定和非 `null` 的应用内 `detach` 去重，即使执行作用域不同。修饰键顺序、大小写和支持的别名 MUST NOT 绕过去重。保留的 unavailable Action 绑定 MUST 继续占用触发器和 Action ID，直到用户清除；迁移中的分离默认值冲突 MUST 保留原全局绑定，并把 `detach` 保持为 `null`，不得生成两个已配置的同键目标。

#### Scenario: Equivalent spellings identify one chord
- **WHEN** two targets submit equivalent `Cmd+Shift+K` and `Shift+Command+k` combinations
- **THEN** the later change is rejected and identifies the target already using that chord
- **THEN** existing configuration and effective bindings remain unchanged

#### Scenario: Launcher and Action request the same double tap
- **WHEN** the launcher is bound to double Cmd and an Action requests double Cmd
- **THEN** the duplicate is rejected; left and right Cmd do not bypass uniqueness

#### Scenario: Edit an existing binding
- **WHEN** 用户在没有待解决迁移的当前 v3 配置中，为同一目标保存相同 canonical 绑定
- **THEN** the system treats it as unchanged, without a self-conflict or repeated registration

#### Scenario: Conflicts between detach and global bindings in either direction
- **WHEN** 用户将分离键保存为已被 Launcher 或任一保留 Action 占用的 canonical chord，或将全局绑定保存为当前分离键
- **THEN** 保存 MUST 被拒绝，并以双语可读反馈标明已占用的目标
- **THEN** 既有配置和有效绑定 MUST 保持不变，系统 MUST NOT 按作用域、当前插件是否可用或窗口是否显示来绕过去重

### Requirement: Shortcut persistence MUST report confirmed state and compensating failures

Rust MUST 串行执行校验、全局注册/注销、应用内分离绑定更新和版本化持久化。成功 MUST 返回已确认配置及每个目标的运行状态。可用全局目标的 chord MUST 完成注册才可报告成功；未授权双击和不可用 Action 可明确保存为 inactive。分离 chord MUST 只更新应用内执行边界，不得请求全局注册或 Input Monitoring 权限。失败 MUST 返回安全错误，补偿失败 MUST 报告降级；旧文件本身 MUST NOT 证明恢复能力。

#### Scenario: Successfully change the recovery chord
- **WHEN** a new chord is valid and registrable, the old chord can be released, and configuration can be written completely
- **THEN** the new chord becomes active, the old one becomes inactive, and restart loads the same configuration
- **THEN** concurrent theme or locale writes do not overwrite shortcuts

#### Scenario: New registration or storage fails
- **WHEN** new chord registration or configuration commit fails
- **THEN** the system compensates uncommitted effects and retains the confirmed recoverable original configuration and bindings
- **THEN** the UI reports failure and does not display an uncommitted candidate as active

#### Scenario: Unregistration or compensation also fails
- **WHEN** release of an old binding or recovery through the selected Launcher trigger cannot be confirmed
- **THEN** the system shows degradation, keeps repair and quit accessible in a visible window, and stops hiding that would make the window unrecoverable
- **THEN** residual native occupation is not falsely displayed as released

#### Scenario: Damaged configuration and concurrent saves
- **WHEN** startup reads an invalid version, duplicate/reserved bindings, or damaged file, or a write carries a stale revision
- **THEN** invalid configuration is neither executed nor silently overwritten; startup uses a registration-confirmed default recovery entry and reports diagnostics
- **THEN** stale writes are rejected and the caller rereads the confirmed snapshot

#### Scenario: A valid custom recovery chord cannot register at startup
- **WHEN** the selected Launcher chord in valid configuration cannot register in the current startup
- **THEN** configuration is retained, repair and quit remain visible, and unrecoverable hiding is disabled
- **THEN** the system does not automatically register or retarget the default chord, even when that chord is validly assigned to an Action

#### Scenario: Application-local detach configuration commit fails
- **WHEN** 分离 chord 的校验、应用内执行边界更新或配置提交失败
- **THEN** 系统 MUST 补偿未提交效果，保留或重新确认原配置，且不得把候选键显示为已生效
- **THEN** 分离入口不可用 MUST NOT 被误报为另一应用占用、Input Monitoring 未授权或 Launcher 恢复入口失效
- **THEN** 当前有效的全局 Launcher/Action 绑定 MUST 保持其既有状态；无法确认的局部分离状态 MUST 明确显示而不静默降级为另一快捷键

### Requirement: Shortcut recording MUST suspend target execution with bounded native ownership

录制 MUST 保留既有全局原生注册，并在当前 Host 录制租约下暂停所有用户可配置目标，包括应用内分离命令。取消、录制所属窗口失焦或隐藏、Host 失效、退出或有界到期 MUST 在原生边界撤销录制，不依赖前端清理。保留的关闭和退出命令 MUST 继续按实际焦点窗口执行主窗 Hide、独立窗口 Close 或全应用 Quit。

#### Scenario: Record an already-bound shortcut
- **WHEN** the user records an already-bound chord
- **THEN** it only supplies a candidate, without launcher/Action execution or losing candidate feedback because the chord is registered
- **THEN** bare Escape cancels recording and modified Escape follows ordinary candidate rules

#### Scenario: The recording page is invalidated or closed
- **WHEN** the user presses Cmd+W/Q, the window blurs or hides, the recording page/Host is invalidated, or the recording session expires
- **THEN** the native boundary revokes recording and clears candidates while reserved commands execute their existing foreground semantics
- **THEN** configured execution resumes after current keys are released, without replaying old candidates or ending events

#### Scenario: Record the current detach chord
- **WHEN** 用户在有效快捷键录制会话中按下当前配置的分离 chord
- **THEN** 该手势 MUST 仅形成候选反馈，不得分离当前实例或触发同键全局目标
- **THEN** 录制取消、结束或失效后 MUST 等待当前按键释放再恢复配置执行，不得重放旧按键或结束事件
- **THEN** 应用内 chord 录制 MUST 不以系统全局监听授权为前提

### Requirement: Versioned Launcher migration MUST preserve unresolved user choice

配置 v3 MUST 保留一个 `launcher` 触发器、原 Action 绑定和独立可空的 `detach` chord。读取 v1/v2 MUST NOT 重写旧文件或改变既有全局绑定。v1 单 chord 可无损投影；v1 双 Launcher 入口 MUST 保留两个选择和原文件、要求显式选择并保持主窗可见。新增分离默认值 MUST 经过冲突校验，任何迁移或其他配置写入 MUST NOT 静默选择、覆盖或丢弃原绑定。

#### Scenario: Read and save a chord-only v1 file
- **WHEN** the existing v1 file contains a chord and no Launcher double tap
- **THEN** Host MUST 在 v3 投影中保留同一 chord 和 Action 绑定，并按分离默认值迁移规则填充 `detach`，读取时不重写文件
- **THEN** 后续显式成功保存 MUST 提交 v3，即使原有全局绑定语义未变

#### Scenario: Resolve a v1 file with two Launcher entries
- **WHEN** a valid v1 file contains both a chord and a Launcher double tap
- **THEN** the snapshot exposes `launcher_migration` with both validated choices and the Launcher as degraded, with no active Launcher trigger or automatic fallback
- **THEN** the window remains visible and settings require a type selection and explicit save before allowing other configuration writes
- **THEN** 只有已选择入口 MUST 被提交为 v3 Launcher 并按实际可用性激活；另一个入口 MUST NOT 保留为隐藏快捷键

#### Scenario: A migration commit fails or has an uncertain result
- **WHEN** an explicit migration save fails
- **THEN** 原文件和未解决选择 MUST 保留，除非重新读取存储已确认 v3 候选配置提交完成
- **THEN** 已确认 v3 提交 MUST 清除已解决的迁移事实，即使操作仍需报告 I/O 失败；未确认存储 MUST 保留相应未解决状态，且未解决 Launcher 选择仍保持 degraded recovery

#### Scenario: Restore defaults during unresolved migration
- **WHEN** the user explicitly confirms restoring shortcut defaults
- **THEN** the same full transaction may resolve migration with the default Launcher chord while preserving all existing Action bindings
- **THEN** an Action occupying the default chord causes a conflict instead of being removed or reassigned
- **THEN** failure retains confirmed state and never claims completion

#### Scenario: Migrate v2 when the default detach chord is unoccupied
- **WHEN** 有效 v2 配置中没有 Launcher 或保留 Action 使用 canonical `Cmd+D`
- **THEN** v3 投影 MUST 完整保留旧 revision、Launcher 和 Action 绑定，并将 `detach` 设为应用内 `Cmd+D`
- **THEN** 系统 MUST 不重写读取到的旧文件，后续显式成功保存才提交 v3

#### Scenario: The default detach chord conflicts with an existing global binding
- **WHEN** 有效 v1/v2 配置中的 Launcher、保留 Action，或尚未解决的合法 Launcher 选择已占用 canonical `Cmd+D`
- **THEN** 系统 MUST 保留旧绑定和原本可确认的有效状态，将 `detach` 投影为 `null`，并显示分离默认值与具体目标冲突的可操作反馈
- **THEN** 系统 MUST 不删除、重分配或暂停原全局绑定，不启用替代分离键，不把有效旧配置当作损坏配置回退
- **THEN** 用户 MUST 可以显式改用未占用的分离 chord，或确认保持分离键关闭；未处理反馈 MUST 不因无关保存静默消失
- **THEN** 仅分离默认值冲突 MUST NOT 使仍有效的 Launcher 恢复入口降级；原有未解决 v1 双入口规则继续适用

#### Scenario: Restore the detach default
- **WHEN** 用户显式恢复分离快捷键为 `Cmd+D`
- **THEN** 系统 MUST 通过同一完整事务重新校验冲突，冲突时保留所有已确认绑定并标明占用目标
- **THEN** 既有仅恢复 Launcher 系统快捷键的操作 MUST 不重置分离键或删除 Action 绑定

## ADDED Requirements

### Requirement: The application-local detach shortcut MUST execute only in a trusted eligible main window

分离 chord MUST 仅在 lensX 为前台应用、实际 key Window 为 Launcher 主窗口且其当前插件实例已就绪并可分离时生效。可信 modal 覆盖、快捷键录制、未完成的输入法组合、无法确认 Launcher 恢复或实例处于 `recovery_required` 时 MUST 不接纳分离。Host MUST 从可信原生窗口和当前实例推导目标，不得接受插件、DOM 或快捷键 payload 自报窗口。适用时 Host MUST 在插件处理前接管这一手势；其他应用和不适用窗口 MUST 保留原生事件。

#### Scenario: Detach while the Child WebView has focus
- **WHEN** 当前主窗口插件已就绪且满足全部分离条件，无可信 modal、录制或未完成的输入法组合，Host chrome 或该实例 Child WebView 持有当前有效焦点，用户按下已配置分离 chord
- **THEN** Host MUST 提交一次当前实例的分离操作并消费一次原始按键，插件不得再处理同一手势
- **THEN** 默认 `Cmd+D` MUST 按用户选定的 Host 分离语义优先于 Monaco 或其他插件的同键功能
- **THEN** 操作 MUST 不依赖 React DOM 收到 Child 的键盘事件，不需要插件更新 SDK 或额外授权

#### Scenario: Pass through events in ineligible states
- **WHEN** 一个尚未被 Host 接管的新物理按键手势到达时，另一应用前台，或实际焦点位于 Home、Search、Host Page、独立插件窗口、失效/未就绪实例，或当前没有有效 `detach` 绑定
- **THEN** 分离命令 MUST 不执行、不激活或聚焦任何窗口，并保留原始事件的正常传播
- **THEN** 独立插件窗口中的 `Cmd+D` MUST 可继续遵守插件自己的业务键盘语义，不克隆实例或再分离

#### Scenario: Repeated events and reentrant detachment
- **WHEN** 一次物理按键产生自动重复、重复投递，或同一实例的分离事务尚未终结时再次收到分离请求
- **THEN** 系统 MUST 至多接纳一个分离事务，不创建第二窗口、不重复迁移、不重放 Action
- **THEN** 已被 Host 接管手势的重复事件 MUST 不泄漏为插件的第二次同键操作；无已接管手势的不可用事件 MUST 不被当作成功分离消费
- **THEN** 事务结果与错误 MUST 绑定接纳时的实例和窗口，目标失效后不得改为分离替代实例

#### Scenario: Overlays recording and input-method composition prevent detachment
- **WHEN** 主窗口存在 Settings/确认 modal、快捷键录制或尚未完成的输入法组合，用户按分离 chord
- **THEN** Host MUST 不迁移窗口、不打断组合、不绕过覆盖层，按键继续由原有 modal、录制或输入法边界处理
- **THEN** 条件解除且来源仍有效后才可重新接纳新的分离手势，不重放被拒绝的旧事件

#### Scenario: Recovery-required state blocks repeated detachment while retaining terminal controls
- **WHEN** 当前实例保留 `recovery_required` 上下文，用户再次按分离 chord 或执行局部关闭/退出命令
- **THEN** Host MUST 不接纳重复分离、不生成新 token/窗口、不重放 Action，已接管手势的重复事件仍不得成为插件第二次同键操作
- **THEN** 主窗口局部 `Cmd+W` MUST 不得隐藏恢复入口；明确关闭实例和前台 `Cmd+Q` MUST 仍能通过原 attempt/token 的终止边界执行，不能被恢复等待或重复 D 阻塞

### Requirement: Detach shortcut settings MUST clearly distinguish application-local and global scopes

设置 MUST 提供固定的应用内分离命令行，支持 chord 录制、修改、清除及恢复默认值，并显示已确认绑定、作用域、不可用原因和冲突目标。所有新增文案 MUST 使用 English 默认与简体中文应用 i18n，保持明暗主题、键盘操作、可访问名称与保存后的焦点恢复。

#### Scenario: Edit the detach binding
- **WHEN** 用户进入快捷键设置并编辑分离命令
- **THEN** 该行 MUST 明示仅当前 Launcher 插件页面可分离，不展示可替换 Action 目标或 modifier double-tap 选项
- **THEN** 保存前后的反馈 MUST 区分候选值、已确认配置和实际执行可用性，冲突或失败时不得展示未提交候选为 active
- **THEN** 键盘和辅助技术用户 MUST 能在设置中清除、修改或恢复分离键。主窗口插件页面不显示分离按钮或快捷键提示
