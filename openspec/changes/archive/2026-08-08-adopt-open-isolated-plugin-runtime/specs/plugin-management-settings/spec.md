## MODIFIED Requirements

### Requirement: Host settings MUST display the current plugin list and details

Host Settings MUST 从当前 Registration snapshot/detail 显示插件 identity、localized metadata、Publisher/source、version、enabled/effective availability、compatibility、quarantine/runtime diagnostics、lifecycle/replacement/data/development controls。详情 MUST 不显示 requested permission、grant、risk、permission methods 或 grant/revoke controls。安装来源与未来社区/审查信息 MAY 展示，但 MUST 明确为选择信息而非 Host authority。

#### Scenario: Healthy current plugin is selected
- **WHEN** 用户选择当前 healthy 插件
- **THEN** detail 显示 current management facts 与可用独立操作
- **THEN** 不出现 permission section、grant state 或 clipboard capability

#### Scenario: Legacy incompatible plugin is selected
- **WHEN** recovery 将旧 permission-contract record 标记为 incompatible/quarantined
- **THEN** detail 显示 bounded compatibility/recovery guidance 和可用 removal/data policy
- **THEN** UI 不显示旧 grants、Manifest reason、path 或 raw record

### Requirement: Plugin management MUST remain Host-private and have a focused delivery gate

plugin management composition、installation/replacement/lifecycle/data/development mutations 与 interaction state MUST 保持 root-private、typed、revision-bound。public packages、plugin iframe 与 plugin message MUST 不能调用可信管理操作或打开 Host Modal。focused gate MUST 证明 permission service/UI 已不存在，同时验证剩余 list/detail、操作、双语、主题、键盘、focus、StrictMode lifecycle 与边界无回归。

#### Scenario: Plugin attempts to open management authority
- **WHEN** plugin import、iframe message、remote code 或 SDK request 尝试调用 install、replace、lifecycle、data 或 legacy grant mutation
- **THEN** public/workspace/transport boundary 拒绝该路径
- **THEN** 开放 Web 不等于可信 Host management authority

#### Scenario: Focused management gate runs
- **WHEN** management focused suite 执行 healthy、empty、loading、degraded、legacy incompatible 与 mutation scenarios
- **THEN** 剩余功能通过且无 permission UI/service/copy/command 可达
- **THEN** English/Chinese、light/dark、keyboard/focus evidence 保持完整

### Requirement: Lifecycle, installation, and local replacement MUST execute only through typed Host services
Management MUST 通过 root-private typed services 执行 installation/lifecycle/replacement/uninstall/data clear；prepare/confirm MUST 只展示 identity/version/classification/Publisher/trust disclosure，不收集 permission selection、diff、grant 或 post-commit authority。

#### Scenario: install or replacement confirms
- **WHEN** user 确认 current prepared token
- **THEN** durable operation 收敛 current revision 且无 grant sequence

### Requirement: Uninstall MUST make data policy explicit and distinguish logical success from cleanup
Uninstall copy/result MUST 只解释 Registration、program、diagnostics 与 data policy，不再描述 grants。

#### Scenario: retain data
- **WHEN** user 选择 retain_data
- **THEN** logical removal 与 pending cleanup 清晰，legacy grant facts 不显示或恢复

### Requirement: Clearing data MUST preserve installation and require a disabled current identity
Clear MUST 保持 Registration、Manifest、program、source、enabled intent 与 diagnostics，不再保存 grant state。

#### Scenario: clear disabled data
- **WHEN** current disabled identity clear 成功
- **THEN** namespace empty 且 management facts 保持 current

### Requirement: The management page MUST support both locales, themes, keyboard use, and deterministic focus recovery
双语/主题/键盘/focus MUST 覆盖 remaining installation、replacement、lifecycle、uninstall、data 与 development controls；permission row、grant Modal、risk/reason/partial-grant state MUST 不存在。

#### Scenario: stale confirmation
- **WHEN** install/replacement token 或 revision stale
- **THEN** Modal 关闭、safe retry announced、focus 返回 current control

### Requirement: Plugin settings MUST gate and explain Development Mode explicitly
Development disclosure MUST 说明 Unpacked/Unsigned/process-local 且无 official/trust/native-authority exception，不得提 grant exception。

#### Scenario: production build
- **WHEN** build 不含 Development Mode
- **THEN** development controls absent 且 remaining management UI unaffected

### Requirement: Development registrations MUST be visually and semantically distinct
Development detail MUST 分离 author Publisher、Host source 与 effective capabilities，不显示 requested permissions/grants。

#### Scenario: author claims official publisher
- **WHEN** development Manifest 声称 official
- **THEN** UI 仍显示 Development/Unsigned 且 capability 不因 source 扩张

### Requirement: Development register, reload, and remove MUST use typed current operations
Current operations/races MUST 只收敛 identity/revision/snapshot/generation/Runtime；permission/grant state 不参与 view model 或 stale-result protection。

#### Scenario: stale reload result
- **WHEN** selection 或 revision 已变化
- **THEN** stale result 不覆盖 current selection 或 operation availability

## REMOVED Requirements

### Requirement: Permission controls and diagnostic presentation MUST remain trusted and minimally disclosing
**Reason**: Settings permission presentation、grant/revoke 与 permission diagnostics 被删除。
**Migration**: 详情只保留 compatibility、quarantine、runtime、lifecycle 与 safe general diagnostics；旧 grant 数据不得显示或产生 authority。
