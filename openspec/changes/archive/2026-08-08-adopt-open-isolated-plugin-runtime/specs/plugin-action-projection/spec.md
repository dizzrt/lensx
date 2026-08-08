## MODIFIED Requirements

### Requirement: Plugin Action projection must consume only current Host registration facts

Action projection MUST 只消费当前 compatible、enabled、healthy Registration 与同 revision detail。当前 Manifest/Registration MUST 不包含 permission request 或 grant authority；legacy permission claims、Publisher、source、remote behavior MUST NOT 绕过 eligibility。

#### Scenario: 当前插件贡献 Action
- **WHEN** 当前 Manifest `0.2.0`、Page graph 与 Registration facts 一致
- **THEN** Action batch 按既有 deterministic projection 发布且无需 lensX grant

#### Scenario: legacy facts 尝试扩权
- **WHEN** legacy payload 或 author text 声称 permission、grant 或 official authority
- **THEN** projection 拒绝或忽略其 authority，且不发布不兼容 Action

### Requirement: Plugin Action execution must remain Host-owned and use the unified Dispatcher

Action execution MUST 继续由 Host-owned unified Dispatcher 和当前 Page preflight 驱动。Page unavailable MUST 仅来自 identity、Registration、Page graph、Runtime/resource prerequisites 等当前事实，不得来自已删除的 required grant。

#### Scenario: Action target 不可用
- **WHEN** Action 指向 unknown、legacy-incompatible 或当前 unavailable Page
- **THEN** Host 在执行前 fail closed，且不创建 permission 或 grant flow

