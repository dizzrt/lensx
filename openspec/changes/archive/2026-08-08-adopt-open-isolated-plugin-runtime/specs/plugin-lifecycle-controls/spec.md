## MODIFIED Requirements

### Requirement: Uninstall must separate logical removal, program cleanup, and data policy

Uninstall MUST 删除 current Registration、safe diagnostics 与 owned program payload，并按 `retain_data|delete_data` 处理独立 data subtree。它 MUST NOT 读取、删除或恢复当前不存在的 grant authority；legacy grant fields 只能作为不兼容数据 fail closed。

#### Scenario: retain data uninstall
- **WHEN** caller 对 managed healthy plugin 选择 `retain_data`
- **THEN** Registration 与 program payload 被移除，data subtree 保留，后续重装从 permissionless current facts 开始

### Requirement: Task 3.3 must not claim later runtime, permission, upgrade, or management UI capabilities

该 capability MUST 保持 Host-private lifecycle 范围且 MUST NOT 交付 Runtime、Host API/native authority、完整 management UI、upgrade/rollback 或 public lifecycle API。

#### Scenario: lifecycle capability 独立完成
- **WHEN** lifecycle validation 通过
- **THEN** enable/disable/uninstall 可安全收敛但不创建 permission/grant flow

