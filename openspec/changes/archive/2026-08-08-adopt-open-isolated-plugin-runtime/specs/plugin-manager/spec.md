## MODIFIED Requirements

### Requirement: Registration facts MUST have explicit persistence lifetimes

Plugin Manager MUST 继续区分 durable installed records、process-local development entries、derived Runtime state、diagnostics 和 resource generations。当前 record format MUST NOT 保存 `granted_permission_ids`、permission decisions、permission reasons 或 permission history。旧 record format 中的 Manifest `0.1.0` 与 grant 数据 MUST NOT 产生新 Host authority；恢复必须稳定地将其置为不兼容/隔离状态，保留 program/data 供显式管理且不得伪造 Manifest `0.2.0`。

#### Scenario: 新格式 record 恢复
- **WHEN** Host 启动并读取有效当前 record
- **THEN** Manager 恢复 installation/source/enabled/diagnostics 与当前 Manifest，且没有 grant 字段
- **THEN** Runtime 仍从 inactive 和新 process-local generation 开始

#### Scenario: 旧权限 record 恢复
- **WHEN** Host 读取旧 Manifest `0.1.0` 或含 `granted_permission_ids` 的旧 record
- **THEN** Manager fail closed 为稳定不兼容/隔离状态且不发布 clipboard 或 permission authority
- **THEN** 重复启动结果幂等，program/data 不被自动删除，日志不泄漏 grants 或路径

#### Scenario: 旧 Host 读取新 record
- **WHEN** 回滚后的旧 Host 遇到当前 record format
- **THEN** 旧 Host 因未知 format fail closed
- **THEN** 不猜测字段、不恢复旧 grants、不覆盖新 record

### Requirement: The Host MUST own one layered Plugin Manager state
Manager MUST 分离 author Manifest 与 Host registration facts，current state MUST 不含 author-controlled granted permissions 或 revision-bound grant mutation。

#### Scenario: current record created
- **WHEN** trusted Host 注册 Manifest `0.2.0`
- **THEN** Manager 保存 current facts 且无 grant field

### Requirement: Development entries MUST share Manager identity and revision authority without becoming Store records
Development register/reload/enable/remove MUST 共享 identity/revision/generation semantics 但不接受、保存或竞争 grant mutation。

#### Scenario: development race
- **WHEN** stale reload/enable/remove 提交
- **THEN** conflict 不恢复旧 snapshot 或 Runtime authority

### Requirement: Plugin Manager authority MUST remain Host-private
Manager/Store/recovery/lifecycle mutation MUST 只对 trusted Host services 开放，current capability 不公开 permission workflow 或 grant mutation。

#### Scenario: public consumer
- **WHEN** plugin/public package 尝试访问 Manager
- **THEN** 无 raw state、authority mutation 或 Tauri boundary 可达

### Requirement: Plugin Manager must remove healthy and quarantine records atomically
Remove MUST 删除 current record、enabled intent 与 diagnostics，不再删除或报告 grants，program/data cleanup 仍由 owner coordinator 处理。

#### Scenario: healthy record removed
- **WHEN** Store deletion/flush 成功
- **THEN** current snapshot 不再包含 entry 且无 legacy grant recovery

### Requirement: Plugin Manager enabled and removal transitions must preserve no-op and revision semantics
Enabled transition MUST 只改变 enabled intent/revision，MUST 不联动 compatibility、quarantine、Runtime 或不存在的 grant state。

#### Scenario: enabled changes
- **WHEN** current boolean intent 改变且持久化成功
- **THEN** exactly one revision commit，其他 facts 不自动变化

## REMOVED Requirements

### Requirement: Grant snapshot mutations MUST be revision-bound, declaration-limited, and atomic
**Reason**: Manager 不再保存或修改 permission grants。
**Migration**: 删除 grant field、mutation API 与相关 revision events；安装、替换、reload 和 lifecycle 只处理各自现有 Host facts。
