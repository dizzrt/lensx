# Spec Delta

## Purpose

定义用户将当前插件原实例分离到独立窗口、继续使用 Launcher 并多开相同插件的可观察行为，涵盖原状态连续性、窗口归属、独立生命周期、失败恢复和封闭 Host 边界。

## ADDED Requirements

### Requirement: Host MUST detach the existing ready plugin instance without restarting it

Host MUST 允许用户通过默认 `Cmd+D` 的应用内快捷键分离主窗口中已就绪的插件实例。成功分离 MUST 保留同一 document、Session、SDK、输入、结果、选区、撤销历史、Worker、激活序列及进行中的任务；MUST NOT 重载页面、重新执行打开 Action 或以部分状态复制替代迁移。

#### Scenario: Detach a working editor or translation instance
- **WHEN** 主窗口插件已就绪，用户已编辑内容、形成撤销历史或发起尚未完成的任务，并执行分离
- **THEN** 独立窗口继续呈现原实例，任务结果仍交付原实例且只交付一次
- **THEN** 不产生新的 Runtime load、SDK bootstrap、Action activation 或业务任务重放

#### Scenario: The current surface is not detachable
- **WHEN** 当前是 Home、Search、Host Page、加载中、失败中、已终止的插件或已经分离的窗口
- **THEN** 分离快捷键不创建或克隆窗口
- **THEN** 未被 Host 分离命令接纳的原始按键遵循现有页面输入规则

#### Scenario: Trusted overlay or composition prevents detachment
- **WHEN** main 被 Settings、确认对话框或其他可信 modal 覆盖，正在快捷键录制，或当前输入法组合尚未完成
- **THEN** 分离快捷键 MUST 不接纳迁移，不绕过当前交互，也不提交、取消或重建输入法组合
- **THEN** 按键继续由当前覆盖层、录制或输入法规则处理，条件解除后才恢复分离可用性

#### Scenario: Launcher recovery becomes unavailable
- **WHEN** Launcher 恢复入口尚未确认有效，或迁移提交前失去恢复能力
- **THEN** Host MUST 拒绝或回滚会隐藏 main 的分离；若补偿本身无法确认则进入 `recovery_required`，保留原实例和可见修复入口，不留下不可恢复的主窗口
- **THEN** 读取快捷键状态时的锁竞争 MUST NOT 被解释为已确认的唤出入口失效，或录制租约处于活动状态

### Requirement: Successful detachment MUST release the Launcher for independent use

分离成功 MUST 使目标窗口获得焦点，并将主窗口恢复到固定尺寸、不可调整的 Home 后隐藏。再次召唤 Launcher MUST 只恢复主窗口及其当前入口，不移动、隐藏或激活已分离实例。

#### Scenario: Summon Home after detachment
- **WHEN** 插件 A₁ 已分离，用户再次使用 Launcher 入口
- **THEN** 主窗口显示 Home 并可接收搜索输入，A₁ 保持其窗口、状态和任务
- **THEN** 主窗口的恢复不得重新附着 A₁ 或恢复旧插件内容槽

#### Scenario: The main window receives a late layout update
- **WHEN** 分离前发布的主窗口尺寸、可见性或焦点更新在分离提交后完成
- **THEN** 旧归属更新不得调整、隐藏、聚焦或销毁已分离的实例
- **THEN** 主窗口仍遵循 Home 的尺寸与隐藏状态

### Requirement: The same plugin MUST support multiple independent live instances

Host MUST 允许同一插件和同一 Page 同时存在多个独立窗口，并允许 Launcher 再打开新的实例。插件/Page 身份 MUST NOT 成为全进程单实例键；每个实例恰属于一个承载窗口，每个窗口最多承载一个插件实例。

#### Scenario: Open and detach the same plugin repeatedly
- **WHEN** 用户分离 A₁，重新召唤 Launcher 打开同一插件为 A₂，再分离 A₂
- **THEN** A₁ 和 A₂ 同时运行，主窗口仍可再次打开 A₃ 或其他插件
- **THEN** 新开不会跳转到既有独立窗口，也不会复制其临时输入或任务

#### Scenario: Work in two instances of the same Page
- **WHEN** 两个实例编辑不同文本、执行不同任务或使用相同请求序号
- **THEN** 输入、结果、撤销历史、请求响应和激活流分别归属于原实例
- **THEN** 关闭、失败或重试其中一个实例不会替换或终止另一个

#### Scenario: Native allocation fails while opening another instance
- **WHEN** Host 无法为新实例或目标窗口分配原生资源
- **THEN** 新操作返回有界失败结果，在 Host 私有诊断中记录阶段，已有实例保持可用
- **THEN** Host 不通过驱逐其他窗口、克隆旧 Session 或复用旧身份伪装成功

### Requirement: Detached windows MUST have independent foreground window lifecycles

独立窗口 MUST 在失焦时保持显示；当前独立窗口的 `Cmd+W`、关闭控件、原生关闭请求及其成功 `ui.close` MUST 仅终止该窗口实例。前台 lensX 的 `Cmd+Q` MUST 清理全部实例并退出进程。主窗口 MUST 保留原有可恢复隐藏语义。

#### Scenario: Focus moves between plugin windows and other applications
- **WHEN** 用户将焦点从独立窗口移至主窗口、另一独立窗口或其他应用
- **THEN** 原独立窗口不因失焦而隐藏、停止或抢回焦点
- **THEN** 键盘与编辑操作只交给当前有效焦点目标

#### Scenario: Close one detached instance
- **WHEN** A₁、A₂ 和主窗口同时存在，用户关闭当前 A₂
- **THEN** A₂ 的请求、Session、视图和窗口完成一次清理，A₁ 与主窗口保持原状
- **THEN** 不留下隐藏的 A₂ Runtime，不把 A₂ 合并回主窗口

#### Scenario: Quit the application from any lensX window
- **WHEN** lensX 前台用户执行 `Cmd+Q`
- **THEN** 所有插件实例及待提交的分离操作进入终止处理，然后应用退出
- **THEN** 其他应用在前台时 lensX 不截获其 W/Q/D 按键

### Requirement: Detachment MUST commit once or preserve the original instance

分离 MUST 是受 Host 控制的一次归属转移；成功前不得释放原实例或对外报告成功。前向阶段失败且补偿成功时 MUST 恢复同一原实例及主窗口安全状态，再清理确认不承载原实例的未提交目标。仅补偿操作本身无法确认时 MUST 进入显式 `recovery_required`，保留原实例及恢复上下文而不伪报分离或回滚成功。两种失败路径均 MUST NOT 重载、重放 Action、自动重开、自动销毁原实例或丢弃临时状态。并发的明确关闭、插件失效或退出仍可终止原实例，但失败补偿 MUST NOT 将其复活。

#### Scenario: Target creation or transfer fails
- **WHEN** 目标创建、迁移、窗口归属、内容槽、呈现或主窗口复位阶段失败，补偿能够确认成功，且原实例未被明确终止
- **THEN** 原实例保留在主窗口并恢复可操作状态，未提交的目标窗口被清理
- **THEN** 重试操作使用仍有效的原实例，失败反馈不包含 native handle、内部路径或原始异常
- **THEN** Host 私有开发诊断 MUST 保留失败步骤和可用的细分原因。普通窗口操作失败 MUST NOT 在插件 Page 显示通用 Action 错误、窗口错误横幅或检查状态按钮；需要明确恢复原实例时仍提供恢复、关闭与退出入口。

#### Scenario: Hidden shell subscribes without a revision change
- **WHEN** 隐藏的可信 shell 成功建立订阅，返回的窗口 revision 与启动快照相同
- **THEN** shell MUST 在当前布局提交后主动上报首次就绪几何，不依赖额外的 resize 或 revision 变化；已卸载或过期的订阅 MUST NOT 修改当前窗口状态

#### Scenario: The detach gesture repeats during transfer
- **WHEN** 同一实例的分离尚未结束时收到重复触发或按键自动重复
- **THEN** Host 不启动第二次迁移，也不产生第二个实例或窗口
- **THEN** 已接纳操作只有一个终态；被接纳手势不再作为插件业务快捷键执行

#### Scenario: Detachment races with terminal invalidation
- **WHEN** 分离与关闭、禁用、卸载、升级、开发 reload 或退出交错
- **THEN** Host 按可信实例和 generation 判定最终归属及终止范围，清理至多一次
- **THEN** 过期完成或回滚不得恢复已失效实例，或操作新建替代实例

### Requirement: Native compensation failure MUST retain the original instance and provide constrained recovery operations

仅当恢复原状态的补偿操作无法确认时，Host MUST 进入 `recovery_required`，保留同一 WebView、Session、attempt、事务 token 与原始恢复快照。该状态 MUST 冻结受影响实例和 source/target surface 的归属变更、普通导航替换与重复分离；MUST NOT 被显示为分离或回滚成功，也不得通过重载、Action 重放或自动销毁消除。Host MUST 保持可信主窗口修复和退出入口可见，并提供本地化的明确重试恢复、关闭实例与退出操作。

#### Scenario: Compensation itself cannot be confirmed
- **WHEN** 前向分离失败后，恢复 parent、frame、responder、registry、导航或可见性的补偿操作无法确认，且原实例未被明确终止
- **THEN** Host MUST 保留原对象、原始快照和仍需要的窗口，进入 `recovery_required` 并阻止普通 owner 敏感更新与重复 D
- **THEN** 在读回确认真实 native 归属前 MUST NOT 销毁可能仍承载原 WebView 的目标窗口；保留的窗口和上下文 MUST 有明确恢复或终止所有者，不成为无人管理的泄漏
- **THEN** main 的 close-to-hide、blur、Toggle 与局部 `Cmd+W` Hide MUST 不得隐藏可信修复和退出入口

#### Scenario: The user explicitly retries recovery of the original instance
- **WHEN** 用户在恢复失败态选择重试恢复
- **THEN** Host MUST 在有界期限内继续同一 attempt/token 和原始快照的补偿，成功确认原 main 归属、展示与焦点后才解除冻结并清理安全目标
- **THEN** 再次补偿失败 MUST 保留 `recovery_required` 及恢复上下文，不自动循环、不创建新 Runtime、不重放输入或 Action、不报告成功
- **THEN** 该操作 MUST 与创建新 attempt 的普通 Runtime Retry 区分，恢复成功只表示原实例恢复，不能被报告为分离成功

#### Scenario: Recovery-required state receives explicit termination
- **WHEN** 用户明确关闭该实例、该实例的合法 `ui.close` 已成功响应、插件失效或应用 Quit 与恢复操作交错
- **THEN** Host MUST 按原 attempt 和当前可信来源/租约执行对应实例、generation 或全应用终止范围，并释放其恢复快照、事务、请求与窗口资源
- **THEN** 迟到恢复 MUST NOT 复活已终止实例、重新授权旧来源或操作兄弟/替代实例；公共 Manifest、SDK 与 Host API 不增加窗口权限

### Requirement: Public plugin contracts MUST remain instance-bound without native window authority

分离与多开 MUST 对符合现有公共协议的插件透明，不要求新增 Manifest 权限或声明。`ui.close` 与 `actions.open` MUST 从调用 Session 派生所属实例和承载窗口，插件 MUST NOT 指定窗口或实例。全局 Launcher/Action 入口 MUST 继续指向主窗口，不广播给同插件的全部实例。

#### Scenario: A detached plugin navigates through its own Action
- **WHEN** 独立窗口 A₁ 调用合法的本插件 `actions.open`
- **THEN** 目标在 A₁ 所属窗口内解析；相同 Page 复用该实例，不同 Page 仅替换该窗口实例
- **THEN** 主窗口与 A₂ 不受影响；跨插件、核心或不可用 Action 仍被拒绝

#### Scenario: A global Action shortcut opens the same plugin
- **WHEN** A₁ 已分离且用户执行该插件的全局 Action 快捷键
- **THEN** Host 显示主窗口并在那里打开或复用当前 Page，只有主窗口目标接收本次 activation
- **THEN** A₁ 的输入、任务与激活序列不变

#### Scenario: Plugin code tries to manage windows
- **WHEN** 插件提交 window/instance 字段、原生命令或自行弹窗请求
- **THEN** 现有精确参数和原生边界拒绝该请求，Host 分离能力不授予通用窗口或 Tauri 权限

### Requirement: Shared plugin persistence MUST remain distinct from per-instance working state

同一插件的 `storage.*` MUST 继续使用原有插件级持久化命名空间与原子提交规则；多实例 MUST NOT 改成多个配置副本。各实例的文档、Worker 和页面内存 MUST 独立。分离 MUST NOT 将临时状态或窗口布局持久化，应用重启 MUST NOT 自动恢复旧实例。

#### Scenario: Two instances read and update plugin settings
- **WHEN** 同插件多个实例通过 `storage.*` 读写同一配置键
- **THEN** 原有串行提交和配额语义继续生效，之后的读取可见已提交结果
- **THEN** Host 不额外承诺未发起读取的插件页面自动刷新，也不同步其临时输入与结果

#### Scenario: Restart after several detached windows existed
- **WHEN** lensX 退出后重新启动
- **THEN** 持久化插件配置按既有规则保留，旧窗口、Session、任务和临时编辑状态不被恢复

### Requirement: Detached presentation MUST preserve trusted accessible Host controls

macOS 独立窗口 MUST 使用原生标题栏，隐藏可见标题文字，仅显示系统关闭、最小化、全屏按钮。插件内容占据标题栏下方完整内容区，不可覆盖系统控件。可信窗口元数据与无障碍名称保留。locale/theme 更新 MUST 不重载插件。

#### Scenario: Configure detachment in Shortcut Settings and keep the main Page chrome clear
- **WHEN** 用户打开主窗口插件 Page 或在快捷键设置中查看应用内快捷键
- **THEN** 主窗口插件 chrome MUST 不展示分离按钮、快捷键提示或为其预留位置，设置中仍能通过键盘查看和修改当前绑定
- **THEN** 独立窗口不提供再次分离或隐式克隆入口

#### Scenario: Detached window uses standard macOS window controls
- **WHEN** 分离后的插件窗口显示或由用户调整大小
- **THEN** 标题栏只显示原生关闭、最小化和全屏按钮，不显示窗口标题文字、插件上下文胶囊或第二个关闭按钮
- **THEN** 最小化保留原实例，关闭只终止该实例。插件的内容尺寸和边界按标题栏下方的内容区计算。

#### Scenario: Toggle native full screen on the detached window
- **WHEN** 用户单击独立窗口的绿色按钮
- **THEN** 该窗口进入 macOS 原生全屏，插件实例保持有效
- **THEN** 再次单击绿色按钮退出全屏，同一窗口恢复原尺寸

#### Scenario: Change global locale or theme with multiple windows open
- **WHEN** 用户在主窗口设置中更改语言或主题
- **THEN** 各可信窗口界面和有效 Session 收到相应当前上下文更新，未完成业务任务继续运行
- **THEN** 失效或已关闭实例不接收后续更新，插件不能由此获得其他窗口信息

### Requirement: Detachment delivery MUST have deterministic cross-layer validation

能力交付 MUST 覆盖迁移连续性、多实例隔离、精确快捷键路由、成功补偿、`recovery_required` 上下文保留及明确恢复/终止、终止竞态和原生边界。维护验证 MUST 使用确定性状态、策略、组件、包边界、静态检查及构建，不启动真实浏览器、WebView、GUI 或原生交互 harness，不将模型结果描述为实际 macOS 行为测量。

#### Scenario: Verify identity and task continuity
- **WHEN** 验证在任务未完成、模型有撤销历史、多个实例及并发关闭条件下执行分离
- **THEN** 断言迁移保持身份、状态和一次响应交付，不增加加载、初始化或销毁调用，且关闭兄弟实例不取消存活实例任务

#### Scenario: Verify every failure stage and stale completion
- **WHEN** 故障注入覆盖目标创建、移动、归属提交、slot、呈现和主窗口复位，以及终止竞态
- **THEN** 前向失败且补偿成功时回到原实例；补偿本身失败时保留受管理的恢复状态、原对象和必要窗口；明确终止不被复活，不遗留无所有者的目标，其他实例无副作用
- **THEN** 若原实例保留、成功补偿、恢复失败态安全边界或明确恢复/终止的不变量无法建立，交付保持未完成，不以重载或伪报成功替代
