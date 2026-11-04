# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Host MUST keep at most one active external Plugin Page Child WebView`
- TO: `### Requirement: Host MUST keep one current Plugin Page instance per owning window`

## MODIFIED Requirements

### Requirement: Every Runtime attempt MUST have one idempotent generation-aware terminal cleanup
每次新实例创建、显式重试或已提交的 development reload MUST 建立新的进程内 attempt；分离 MUST 保留原 attempt。每个实例 MUST 独立执行幂等终止，整插件失效 MUST 对全部匹配实例执行终止，应用退出 MUST 清理全部实例。

#### Scenario: A Runtime attempt reaches terminal cleanup

- **WHEN** a terminal trigger or late callback occurs for a Runtime attempt
- **THEN** 实际关闭、该实例内导航离开、禁用、卸载、替换、reload、disconnect、failure、可信 Host 协调器 reload 或应用退出 MUST 对受影响实例执行一次幂等清理：拒绝新 ingress、取消该实例操作、撤销桥接/Session/资源来源/导航租约并销毁其 WebView、焦点、监听器与计时器；共享 generation 资源遵循独立来源租约和最终持有者释放规则。
- **THEN** 每个迟到回调 MUST 在发布状态前校验所属实例的有效 attempt、实际原生来源和来源租约，不能以全局当前 Page 或另一个有效实例代替。

#### Scenario: User closes a ready plugin Page
- **WHEN** 一个有效 external Page 实例实际关闭
- **THEN** 该实例的 Child WebView 与全部所属 execution/authority 绑定 MUST 恰好终止一次
- **THEN** 该实例 MUST 不残留隐藏 Runtime、Worker、连接或可复用 attempt，其他有效实例 MUST 保持运行

#### Scenario: Lifecycle events race with a new attempt
- **WHEN** close、retry、invalidation、replacement、development reload 或移除与旧异步完成竞争，且该 surface 已有替代 attempt 或其他窗口仍有有效实例
- **THEN** 旧清理和迟到事件 MUST 只影响自身 attempt，不能释放、使失败、加载、认证或复活替代 attempt，也不能作用于其他并行实例
- **THEN** 重复清理 MUST 幂等完成，不重复关闭、不保留已终止实例的资源

#### Scenario: Application process terminates unexpectedly
- **WHEN** the process exits or crashes before JavaScript can finish best-effort cleanup and later restarts
- **THEN** operating-system process teardown removes process resources, and the new process restores no resource scope, Runtime attempt, breaker record, Session, bridge, Child WebView, listener, timer or pending work
- **THEN** persistent installed Registration continues to recover with Runtime `inactive`, while development Registration does not recover

#### Scenario: Development reload commits a new generation
- **WHEN** 开发插件的手动 reload 成功提交新 resource generation
- **THEN** Host MUST 先终止旧 generation 的全部受影响 attempt 并撤销其 authority，再为仍被 Host 保留且获准重新打开的 Page 建立新 attempt、Child WebView、来源租约、bridge freshness 和 Session
- **THEN** 开发来源 MUST NOT 放宽导航、origin、桥接 ACL、deadline、breaker、每窗口单实例、Host API 或 Host authority 边界

#### Scenario: Development reload fails before commit
- **WHEN** 新开发快照无效、不兼容、不安全、不可读，或在 Manager 提交前失去 revision 竞争
- **THEN** Host MUST 保留全部仍有效的旧 generation 实例，不能因未提交输入终止它们或切换 generation
- **THEN** 失败 staging、迟到回调和诊断 MUST 不获得 Resource、Session 或 handler authority

#### Scenario: Main-window presentation returns Home after detachment commits

- **WHEN** 原实例已成功迁移到独立窗口，主窗口恢复 Home 并隐藏，主页面的旧呈现组件被移除
- **THEN** Host MUST 保持原实例、Session、Worker、请求、activation channel 与资源来源租约；主窗口呈现移除 MUST NOT 触发该实例终止
- **THEN** 受信 Host 协调能力 MUST 在主窗口隐藏期间持续服务全部有效实例；不能因主窗口再次打开插件而覆盖独立实例

#### Scenario: One window of the same plugin closes or fails

- **WHEN** A 与 B 属于同 plugin/Page/generation，而只有 A 被实际关闭或进入实例故障终止
- **THEN** Host MUST 只撤销 A 的来源与操作，B 的 Window、Runtime、Worker、Session、HTTP 和 storage 访问 MUST 保持有效
- **THEN** A 的迟到响应、回滚和重复终止 MUST NOT 命中 B 或后续新实例

#### Scenario: Plugin lifecycle invalidation covers every owning window

- **WHEN** 禁用、卸载、替换或开发 reload 已提交并使 generation 或 eligibility 失效
- **THEN** Host MUST 撤销所有匹配旧实例的 authority，再逐一关闭或更新其受信失败呈现；不得只处理当前焦点窗口
- **THEN** 不相关插件实例 MUST 保持运行；失败或取消的提交前操作 MUST 保留旧实例

#### Scenario: Application exit cleans up main and detached windows

- **WHEN** 用户执行 Cmd+Q 或应用进入完整退出
- **THEN** Host MUST 终止全部实例及创建/迁移预留，并清理全部窗口、Session、Worker、请求和来源租约
- **THEN** 重新启动 MUST NOT 恢复独立窗口、旧 attempt 或临时业务状态

#### Scenario: Native compensation failure is not implicit instance termination
- **WHEN** 分离补偿自身无法确认，但原 WebView、Session 和受信实例尚未因真实终止事件失效
- **THEN** Host MUST 进入 `recovery_required` 并保留原 attempt、恢复 token、原始快照及必要窗口，不能把补偿失败当作 Runtime Retry、自动销毁或分离成功
- **THEN** 恢复状态 MUST 冻结受影响 owner 变更并保留可信 main 修复/退出入口，现有来源、Session、generation 和资源租约校验仍独立生效
- **THEN** 明确关闭、插件 disable/uninstall/replace/upgrade/已提交 reload 和 Quit MUST 对相同实例/generation/进程范围执行幂等终止，包括其恢复上下文；无关实例继续运行

### Requirement: Repeated Runtime failures MUST open a bounded process-local circuit breaker without automatic restart

Host MUST 按可信 entry 与当前 resource generation 聚合同一插件所有实例的 qualifying failure，并对每次实例故障只计数一次。三次故障/60,000ms 触发 30,000ms 冷却；冷却只阻止新 Runtime 创建或重试，不销毁仍健康的兄弟实例，也不改变其既有 authority。

#### Scenario: Runtime events are classified for circuit breaking

- **WHEN** a Runtime lifecycle event is evaluated for failure accounting or cooldown
- **THEN** Load timeout, handshake timeout, an unexpected ready-Session/WebView disconnect, or a supported WebView process-failure signal MUST qualify; user close, navigation, relevant Registration invalidation, replacement and graceful Host exit MUST NOT.
- **THEN** rolling 60,000ms 内第三次 qualifying failure MUST 开启 30,000ms 冷却，并在创建任何新 Runtime WebView、资源或来源租约、桥接就绪握手 freshness 或 Session 前拒绝新建。
- **THEN** Cooldown expiry MUST NOT launch automatically.

#### Scenario: Breaker history becomes obsolete

- **WHEN** resource generation changes, readiness remains continuous, or the process exits
- **THEN** 新 resource generation MUST 清除对应历史；同 generation 只有在至少一个实例持续 ready 且该 key 连续 30,000ms 未发生 qualifying failure 时才 MUST 清除历史。其他健康实例的 ready 事件不能清除仍在累积的故障；进程退出 MUST 清除全部 breaker 状态。

#### Scenario: Plugin fails three times quickly

- **WHEN** the same current entry and resource generation has three qualifying failures within 60 seconds
- **THEN** the Host enters cooldown, exposes `runtime_crash_loop`, and refuses to construct another Runtime for 30 seconds
- **THEN** 冷却期间，隐藏或自动 retry MUST NOT 创建资源解析请求、来源租约、Child WebView、bridge freshness、原生桥接绑定或 Session

#### Scenario: Cooldown expires

- **WHEN** 30 seconds pass after the breaker opens
- **THEN** Host MUST 等待用户明确重试或新开后重新读取当前事实并创建新 attempt，不能自动重启失败实例；仍健康的既有实例继续运行
- **THEN** a stale retry event from before cooldown cannot create a Runtime

#### Scenario: Current generation changes or remains healthy

- **WHEN** 替换建立新 generation，或当前 generation 至少一个实例持续 Session-ready 且该 key 连续 30 秒无 qualifying failure
- **THEN** the corresponding failure history is cleared without mutating Plugin Manager, quarantine, source, or enabled intent
- **THEN** unrelated plugin failures do not open or reset this entry's breaker

#### Scenario: Failures across multiple instances trigger a shared cooldown

- **WHEN** 相同 entry/generation 的多个实例在 60 秒内合计出现第三次 qualifying failure，而其他兄弟实例仍健康
- **THEN** Host MUST 对该 key 开启 30 秒冷却并拒绝新 Runtime 创建或显式重试，不能通过切换窗口或更换实例标识绕过
- **THEN** 健康兄弟实例 MUST 保持当前窗口、Session、输入与进行中操作，故障实例按自身终止路径清理

#### Scenario: A healthy instance does not conceal continuing failures

- **WHEN** B 一直 ready，但同 generation 的 A 在期间继续产生 qualifying failure
- **THEN** B 的 ready 状态 MUST NOT 单独清零该 key 的 rolling failure 记录或提前结束冷却
- **THEN** 清零 MUST 等待规定的连续无故障且存在 ready 实例的 30 秒条件，或真正的 generation 变化

#### Scenario: Detach an existing healthy instance during cooldown

- **WHEN** 用户分离已就绪且仍有效的健康实例，而该 generation 正在阻止新建 Runtime 的冷却期
- **THEN** 不创建新 Runtime 的原实例迁移 MAY 完成，但 MUST 保留同一 attempt、既有冷却记录和剩余冷却时间
- **THEN** 分离后的主窗口再打开该插件 MUST 仍受同一新建限制；失败迁移不能触发隐式重建或自动重试

### Requirement: Open execution contexts MUST terminate completely with the Runtime attempt
每个 Dedicated Worker、连接、Blob URL 和其他受支持页面上下文 MUST 属于一个独立 Runtime attempt 与 generation。原实例分离 MUST 保留这些上下文；实际终止 MUST 使该实例上下文结束或不可控且无 Host authority。共享 generation scope 不等于共享执行上下文，SharedWorker、ServiceWorker 及可超出 Page 生命周期的后台上下文仍不支持。

#### Scenario: Page closes while Worker and connection are active
- **WHEN** the Host destroys a Child WebView whose plugin Page still has a Dedicated Worker and active network work
- **THEN** teardown terminates its page-owned execution contexts or leaves them uncontrollable and without Host authority
- **THEN** 新 Page MUST NOT 复用旧 Worker、连接、Blob URL、Session、桥接或已撤销来源租约；同 generation 的有效 scope 仅可依照独立来源租约规则共享

#### Scenario: Persistent worker is requested
- **WHEN** a plugin attempts to register a SharedWorker, ServiceWorker or background context that could outlive the current Page or generation
- **THEN** the current supported baseline rejects or does not claim support for that capability
- **THEN** the context retains no plugin authority after Page close, replacement or Host restart

#### Scenario: Detached-window blur remains within the valid Page lifecycle

- **WHEN** 一个有效独立窗口失去焦点，而其 Page 未关闭、未失效且应用未退出
- **THEN** 该实例的 Worker、连接和进行中操作 MUST 保持原 Page 生命周期，不因失焦被当作隐藏 Runtime 池清理
- **THEN** 其后台存续不能越过实际关闭、generation 失效或应用退出边界，也不能影响其他窗口的输入焦点

### Requirement: Host MUST keep one current Plugin Page instance per owning window
主 Launcher 窗口 MUST 最多承载一个当前插件实例，每个独立窗口 MUST 恰好归属一个独立实例，同插件 MAY 同时存在多个实例。单个实例 MUST 最多属于一个窗口，迁移不得形成可操作副本。窗口内切换 Page MUST 只终止该窗口原 attempt；预加载池及无所属 Page 的隐藏后台 Runtime MUST 继续不存在。

#### Scenario: User switches plugin Pages
- **WHEN** 某个承载窗口内的导航选择另一个 external Page
- **THEN** 该窗口旧 Child WebView 的终止 MUST 在新实例创建前完成，其他窗口实例 MUST 不受影响

#### Scenario: Main reopens the same plugin after detachment

- **WHEN** A 已处于独立窗口，用户从 Launcher 再次打开相同 plugin/Page
- **THEN** Host MUST 在主窗口创建新的实例 B，而不能聚焦、复用、移动或关闭 A
- **THEN** B 再分离后 MUST 可与 A 并行，两个窗口保留各自业务状态和来源租约

#### Scenario: Main continues opening other plugins

- **WHEN** 一个或多个独立插件窗口仍打开，而用户从 Launcher 打开其他插件
- **THEN** 主窗口新实例 MUST 与全部有效独立实例并行，各自只占用所属窗口
- **THEN** 主窗口 Home、Search 和 Host Page MUST 仍使用受信 Host 呈现，不得到独立实例的 Runtime authority

### Requirement: Delivery MUST deterministically prove CSP and terminal lifecycle

Delivery MUST combine Rust response tests, deterministic TypeScript state/race tests, React accessibility/i18n/theme tests, canonical normal and malicious packages, package-boundary checks, and production configuration drift tests.

#### Scenario: Security lifecycle validation evaluates delivery evidence

- **WHEN** the deterministic CSP and terminal-lifecycle suite runs
- **THEN** 确定性验证 MUST 覆盖内容类别、Host/Tauri 拒绝、load/bridge deadline、聚合 circuit breaker、每窗口单实例及多窗口并发、分离连续性、实例级终止、插件级失效、清理、迟到事件无效和零未授权 handler 命中。
- **THEN** It MUST NOT require browser, real WebView, GUI, native harness, or environment evidence.

#### Scenario: Complete deterministic security lifecycle gate passes

- **WHEN** maintained normal, malicious, slow, never-ready, repeated-failure, reload, and replacement matrices run with prerequisite deterministic Gates
- **THEN** CSP, deadline, breaker, instance, cleanup, and boundary assertions pass
- **THEN** public package checks confirm policy, controller, scheduler, breaker, Session, and native response internals remain Host-private

#### Scenario: A security or cleanup invariant cannot be established

- **WHEN** 必需 CSP 类别、deadline、终止触发、迟到事件隔离、窗口归属或实例隔离、清理调用、零未授权 handler 断言失败
- **THEN** the capability remains incomplete and design or implementation is corrected
- **THEN** validation does not relax CSP, remove negative cases, hide Runtime state, or restore real WebView evidence as an optional path

#### Scenario: Same-plugin multi-window security and lifecycle matrix

- **WHEN** 受控测试并行建立同 plugin/Page 的多个实例并交错执行分离、关闭、失败、retry、禁用、换代和退出
- **THEN** 验证 MUST 断言每个 source/attempt 的实际状态、清理次数、请求取消、事件目标、共享 scope 存续和最终释放，而不能仅检查函数被调用
- **THEN** 矩阵 MUST 覆盖前向失败且补偿成功的回滚、补偿再次失败进入 `recovery_required`、原始上下文保留与明确恢复/关闭/Quit、主窗口呈现卸载不终止分离实例、关闭 A 不影响 B、失效 fanout、聚合冷却和无旧来源复活
- **THEN** 测试 MUST 保持确定性，不启动真实 WebView、GUI、原生交互 harness 或目标环境性能采样
