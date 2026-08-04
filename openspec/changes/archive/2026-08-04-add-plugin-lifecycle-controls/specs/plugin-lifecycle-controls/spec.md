## ADDED Requirements

### Requirement: Lifecycle writes must use a private versioned Host contract

系统 MUST 提供独立版本化的 Host-private Plugin Lifecycle Contract，并通过严格 Tauri command 只向可信 lensX root application 暴露 `set_plugin_enabled` 与 `uninstall_plugin`。请求、成功结果和错误 MUST 从 `unknown` 进行 Rust/TypeScript 双侧验证，MUST NOT 成为 author Manifest、`@lensx/plugin-contract`、`@lensx/plugin-sdk`、iframe Runtime 或其他插件可导入的公共入口。Registration Contract MUST 保持独立、只读，并继续作为状态读取和 revision invalidation 的唯一事实边界。

#### Scenario: 可信应用修改 enabled intent

- **WHEN** root application 通过 lifecycle adapter 提交合法 `entry_id`、`expected_revision` 和 `enabled` 目标
- **THEN** Host 使用独立 lifecycle contract 验证并执行操作
- **THEN** 插件代码、Manifest 和公共 package 无法导入或直接调用该写入边界

#### Scenario: Lifecycle payload 包含未知或私有字段

- **WHEN** 请求或响应缺少 contract version、字段类型错误、带未知字段，或试图携带路径、digest、Store key、函数或 Host 对象
- **THEN** 对应边界以稳定 safe contract error 拒绝整个值
- **THEN** Manager、Registry、文件系统、revision 和 changed event 保持不变

### Requirement: Lifecycle operations must enforce revision preconditions and idempotent outcomes

每个 lifecycle 请求 MUST 绑定 opaque `entry_id` 和当前进程 `expected_revision`。Host MUST 在任何持久化或删除前验证 revision 与目标 identity；stale 请求 MUST 返回 conflict 并要求完整刷新。达到目标 enabled 值的操作 MUST 返回 `unchanged`，且 MUST NOT 写盘、增加 Registration revision 或发布 changed event。卸载 MUST 使用持久 cleanup identity 识别重试；已经逻辑卸载的同 identity 请求 MUST 返回 `unchanged` 或继续 pending cleanup，MUST NOT 影响后来重新安装的记录。针对同一插件的并发 lifecycle 与 installation 请求 MUST 串行化。

#### Scenario: 重复禁用已经禁用的插件

- **WHEN** 当前健康记录已经 `enabled=false` 且请求 revision 仍然匹配
- **THEN** `set_plugin_enabled(false)` 返回 `unchanged`
- **THEN** Manager record、revision、event、Action/Page 和文件系统没有额外变化

#### Scenario: 调用方使用旧 revision

- **WHEN** lifecycle 请求的 `expected_revision` 不等于当前 Registration revision
- **THEN** Host 返回稳定 conflict，不执行 quiesce 后的持久状态改变或清理
- **THEN**可信应用完整刷新并只基于最新 snapshot/detail 决定是否重试

#### Scenario: 卸载请求被重复提交

- **WHEN**同一 entry 已完成逻辑卸载或仍有匹配的 pending cleanup record
- **THEN** Host 返回 `unchanged` 或恢复同一清理意图，而不是创建第二个卸载事务
- **THEN** 新安装若已清除旧完成记录并建立了不同 revision，旧请求不能删除新记录或新 payload

### Requirement: Enabled intent, effective availability, compatibility, and quarantine must remain distinct

Lifecycle MUST 只持久化健康记录的 enabled intent；effective availability MUST 从 registered、enabled、双维 compatibility 和非 quarantine 事实派生，MUST NOT 作为第二份持久状态。不兼容健康记录 MAY 保存 `enabled=true` intent，但 MUST NOT 投影可执行 Action/Page。Enable/disable MUST 拒绝 quarantine entry，并 MUST NOT 把 quarantine 解释为 disabled、uninstalled 或 repaired。Host source、Publisher 文本和官方声明 MUST NOT 自动改变 enable/disable 规则。

#### Scenario: 用户启用当前不兼容的健康插件

- **WHEN**健康 entry 的 enabled intent 从 false 改为 true，但 lensX 或 Host API compatibility 为 false
- **THEN** Host 持久化 enabled intent 并发布真实 revision
- **THEN** effective availability 仍为 false，且插件 Action/Page 不进入 Registry

#### Scenario: 用户尝试启用 quarantine entry

- **WHEN**目标 entry 是 quarantine 而不是完整健康记录
- **THEN** Host 返回稳定 invalid-state 错误，且不猜测 enabled intent 或 Manifest
- **THEN** quarantine 证据、payload、revision 和 Registry 保持不变

#### Scenario: Publisher 声称插件是官方发布

- **WHEN** Manifest Publisher 文本或展示信息声称 lensX 官方身份
- **THEN** set enabled 使用与其他健康记录相同的 Host-owned规则
- **THEN**该声明不创建生命周期豁免、权限 grant、签名或可信 provenance

### Requirement: Disable and uninstall must quiesce current plugin surfaces before durable transition

可信 `PluginLifecycleService` MUST 在 disable 或 uninstall command 前，基于同一当前 snapshot/revision 按 Action batch 后 Page batch 的顺序撤销目标 provider。Page 撤销 MUST 通过现有 Host navigation invalidation 关闭活跃插件页面、返回 Home 并恢复安全 Launcher state。若任一 Registry 撤销失败，service MUST NOT 调用 Rust lifecycle command。若 Rust 持久化、revision precondition 或 Manager removal 失败，service MUST 完整刷新当前 Registration 并从最后确认事实重投影，MUST NOT 永久留下仍启用但表面缺失的插件。

#### Scenario: 禁用当前打开页面的插件

- **WHEN**用户禁用一个拥有活跃 Plugin Page 的健康插件
- **THEN**可信 service 先注销该 provider 的完整 Action batch，再注销完整 Page batch
- **THEN**导航边界关闭页面并返回 Home，随后 Host 才提交 `enabled=false`

#### Scenario: Registry quiesce 失败

- **WHEN** Action 或 Page provider batch 无法被完整撤销
- **THEN** service 返回 bounded surface failure 且不调用 lifecycle command
- **THEN**其他 provider 不受影响，目标 Manager record 和 revision 不变

#### Scenario: Quiesce 后 Manager 持久化失败

- **WHEN**表面已安全撤销但 Rust 无法持久化 disable 或 remove transition
- **THEN**原 Manager record、enabled intent 和 revision 保持不变且不发 event
- **THEN** service 完整刷新并按原有当前事实恢复 Page 后 Action 投影

### Requirement: Enable must commit intent before converging Page and Action projection

Enable MUST 先原子持久化 `enabled=true` 并发布可读取的目标 Registration revision，再由可信 service 主动刷新并等待现有 Surface Projection 对该 revision 收敛。合格 provider MUST 按 Page batch 后 Action batch 的顺序发布。用户可见的 enable 操作 MUST 等待当前 App 会话观察目标 revision 且 projection idle；Projection 失败 MUST 保留 enabled intent、保持表面 fail closed 并报告 bounded diagnostic，而 MUST NOT 用前端临时故障回滚持久用户选择。

#### Scenario: 启用兼容插件成功

- **WHEN** disabled 健康插件兼容、detail 与目标 revision 匹配且 Registry replacement 成功
- **THEN** Manager 先发布 `enabled=true` revision，Page batch 随后先于 Action batch 注册
- **THEN** lifecycle service 只在目标 revision 完成收敛后返回用户可见成功

#### Scenario: Enabled intent 成功但投影失败

- **WHEN**Manager 已成功提交 enabled intent，但 detail 读取、映射或 Registry replacement 失败
- **THEN**Registration 继续显示 `enabled=true`，但 effective availability 和可执行表面 fail closed
- **THEN**service 返回安全 convergence diagnostic，并允许完整刷新或 Launcher activation 后恢复

### Requirement: Uninstall must separate logical removal, program cleanup, and data policy

`uninstall_plugin` MUST 要求显式 `retain_data | delete_data`，产品默认选择 MUST 为 `retain_data`。Uninstall MUST 总是移除目标健康/quarantine Registration 以及健康记录内的 grants 与 Manager diagnostics；MUST 总是最终删除可证明属于目标的 managed program payload。`retain_data` MUST 保留独立 data subtree，`delete_data` MUST 持久记录并最终删除该 subtree。Manager record removal MUST 在任何可能让健康记录指向缺失 payload 的破坏性程序清理之前完成。不能证明 managed payload ownership 的 Host registration MUST 返回 `operation_not_supported`，且判断 MUST NOT 单独依据 builtin/external source 或 Publisher。

#### Scenario: 卸载并保留插件数据

- **WHEN**调用方对 managed 健康插件选择 `retain_data`
- **THEN**Host 移除 Registration、grants、diagnostics 和程序 payload，但不创建、修改或删除 `data/<plugin-key>`
- **THEN**结果明确报告 logically uninstalled，后续重新安装从空 grants 开始但可看到原保留数据边界

#### Scenario: 卸载并删除插件数据

- **WHEN**调用方选择 `delete_data`
- **THEN**Host 在移除 Manager record 前持久保存该数据清理意图
- **THEN**程序和 canonical data subtree 最终被删除，重启或重试不能静默把策略改为 retain

#### Scenario: 卸载 quarantine entry

- **WHEN**目标是 quarantine entry，且 Host 能从安全 record key 与 installer root 证明其 package/data subtree
- **THEN**Host 可移除 quarantine Store record并按请求策略清理仅该安全 subtree
- **THEN**Host 不解析损坏 Manifest、不猜测缺失路径，也不删除无法证明属于目标的内容

#### Scenario: Host module 没有 managed payload

- **WHEN**健康 registration 不指向 installer-owned canonical package payload
- **THEN**enable/disable 仍使用普通健康记录规则，但 uninstall 返回 `operation_not_supported`
- **THEN**错误原因是 Host 无法安全拥有物理卸载目标，而不是其 source、Publisher 或官方身份

### Requirement: Pending cleanup must recover conservatively across failures and restarts

Lifecycle MUST 在 installer-owned root 中使用受限、版本化、每 plugin identity 一个的 Host-private cleanup record，记录 program cleanup、data policy 和 data cleanup 的可恢复结论。Installation 与 lifecycle MUST 共享进程内 mutex 和跨进程 lock。Manager 已逻辑移除但文件清理失败 MUST 返回成功的 cleanup-pending 结论；启动恢复和同目标重试 MUST 在锁内继续。异常 cleanup record、symlink、root 外路径、未知 entry 或所有权不确定 MUST 保留原证据并使相关写入 degraded，MUST NOT 通过猜测完成删除。

#### Scenario: Manager 已移除但 program deletion 失败

- **WHEN**record absence 已持久化并发布，但 canonical payload 无法立即删除
- **THEN**插件保持 logically uninstalled，结果报告 cleanup pending而不是恢复健康 registration
- **THEN**后续启动或同目标操作在共享锁下继续删除该 orphan

#### Scenario: Changed event 发送失败

- **WHEN**Manager transition 和 revision 已提交，但 Registration changed event 无法发送
- **THEN**已提交 lifecycle 操作不回滚
- **THEN**当前 service 使用响应 revision 主动完整刷新，其他消费者通过 listener recovery 或 Launcher activation 收敛

#### Scenario: Cleanup 证据异常

- **WHEN**cleanup record 损坏、目标含 symlink、目标逃逸 Host root 或 ownership 无法证明
- **THEN**恢复不删除目标、不覆盖证据并发布 bounded safe diagnostic
- **THEN**不受影响插件仍可读取，可能污染证据的新 installation/lifecycle 写入被拒绝

### Requirement: Disabled or uninstalled Actions must disappear without erasing Launcher preferences

Disable 或 uninstall 完成收敛后，目标插件的 Action MUST 不在统一 Launcher Registry，因此 MUST 不出现在 Action Search、Recent 或 Pinned 展示中；系统 MUST NOT 创建 plugin-specific search 分支或 disabled placeholder。Recent/Pinned 持久层 MUST 继续只保存稳定 Action ID，MUST NOT 因 disable 或 uninstall 自动删除目标 ID。重新启用或重新安装相同 global Action ID 后，现有统一解析 MAY 再次显示真实 Action。

#### Scenario: 搜索禁用插件的 Action

- **WHEN**插件已完成 disable 收敛，查询匹配其原 Action 元数据
- **THEN**统一搜索返回不到该 Action
- **THEN**Registration 管理读取仍能看到该插件及 `enabled=false`

#### Scenario: 禁用插件拥有 Recent 或 Pinned Action

- **WHEN**其 Action batch 从 Registry 撤销
- **THEN**Home 不显示对应 tile，也不以其他 Action 补位
- **THEN**持久 Action ID 保留，重新启用并恢复相同 ID 后可再次解析

#### Scenario: 已显示结果在禁用竞态中被执行

- **WHEN**旧搜索结果显示后 Action 在 dispatch 前被撤销
- **THEN**统一 Dispatcher 返回现有 typed unavailable/not-found failure且不执行 executor
- **THEN**App 保留可恢复查询并显示本地化安全反馈

### Requirement: Task 3.3 must not claim later runtime, permission, upgrade, or management UI capabilities

本 capability MUST 只交付 Host-private lifecycle persistence/cleanup contract、可信 App 协调、恢复、测试和维护文档。它 MUST NOT 创建完整插件管理列表/详情 UI、iframe Runtime/session、资源服务、Host API、permission grant/revoke、签名或 Publisher trust、upgrade/rollback/reinstall、公开插件 lifecycle API、Recent/Pinned 清理或通用事务平台。

#### Scenario: Task 3.3 单独完成

- **WHEN**本 change 通过全部验证而后续 Task 尚未实现
- **THEN**可信应用基础设施可以安全 enable、disable 和 uninstall managed 插件并恢复失败
- **THEN**插件代码仍不会执行，最终用户完整管理界面、Runtime、权限和升级能力仍明确未交付
