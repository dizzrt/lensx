## ADDED Requirements

### Requirement: Plugin Manager must remove healthy and quarantine records atomically

Plugin Manager MUST 为可信 Host caller 提供按当前 entry identity 移除健康记录或 quarantine Store record 的内部 transition。Manager MUST 在移除前验证目标、完整 Store 状态和调用方 revision；MUST 先持久化并 flush 记录 absence，再从内存 snapshot 移除并提交新 revision。删除或目录同步任一步失败 MUST 保留原磁盘记录、原健康/quarantine 内存 entry 和原 revision。Manager removal MUST NOT 删除安装 payload、插件数据、Launcher collections 或其他 provider 记录。

#### Scenario: 健康记录移除成功

- **WHEN**可信 lifecycle coordinator 移除匹配当前 revision 的健康 entry，且 Store 删除与目录同步成功
- **THEN**后续 snapshot/detail 不再包含该 entry，Manager 提交恰好一个新 revision
- **THEN**该记录内的 enabled intent、grants 和 diagnostics 不再作为健康 registration 存在

#### Scenario: Quarantine Store record 移除成功

- **WHEN**可信 lifecycle coordinator 按 opaque entry identity 选择当前 quarantine record
- **THEN**Manager 移除对应 Store record和 quarantine stub，而不解析或修复损坏内容
- **THEN**其他健康和 quarantine entry 保持不变

#### Scenario: Record removal 持久化失败

- **WHEN**Store record 删除、父目录 flush 或故障注入阶段失败
- **THEN**Manager 返回稳定 persist diagnostic，原 entry 在内存和磁盘中保持可恢复
- **THEN**revision 不增加且 Host 不发布 Registration changed event

### Requirement: Plugin Manager enabled and removal transitions must preserve no-op and revision semantics

`set_enabled` MUST 在目标健康记录已达到 requested intent 时返回 no-op，MUST NOT 写 record、提交 revision 或生成 changed event。真实 enabled transition 与真实 removal transition MUST 各自只在完整持久化并发布内存 snapshot 后提交一个 revision。不存在的健康 identity、对 quarantine 的 enabled transition、stale revision 或 degraded Store MUST 返回稳定拒绝结果而不修改状态。

#### Scenario: Enabled intent 已经达到目标值

- **WHEN**可信 caller 再次设置相同 boolean intent
- **THEN**Manager 返回 no-op且记录字节、内存 snapshot、revision 均不变化

#### Scenario: Enabled intent 真实改变

- **WHEN**健康记录的 requested enabled intent 与当前值不同且原子持久化成功
- **THEN**Manager 发布更新记录并提交恰好一个 revision
- **THEN**兼容性、quarantine、grants、Runtime 和其他插件记录不会因该 boolean transition 自动改变

#### Scenario: Store 整体 degraded

- **WHEN**Manager recovery 无法建立可信 Store 读写边界
- **THEN**enabled 和 removal transition 都被拒绝且不覆盖不可读证据
- **THEN**应用仍可读取 degraded Registration conclusion并继续不依赖插件的 Host 功能
