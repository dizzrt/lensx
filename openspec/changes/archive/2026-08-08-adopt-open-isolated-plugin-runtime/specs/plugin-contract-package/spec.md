## MODIFIED Requirements

### Requirement: Public Contract package MUST expose the bounded Host API semantic contract

`@lensx/plugin-contract` root MUST 只公开 Host API `0.2.0` 的 method、event、error、Schema、generated types、validators 与 immutable method catalog。它 MUST NOT 公开 permission union、permission catalog、clipboard method、private wire 或 Host executor。

#### Scenario: 外部 consumer 导入 Contract
- **WHEN** no-DOM consumer 安装真实 tarball 并读取 root 与 declared Schema subpath
- **THEN** 当前 method/event/error Contract 可独立验证且无 permission export

### Requirement: Host API Schema, generated types, catalog and shared fixtures MUST remain one fact chain

Schema、generated input、normalized output、validator、method catalog、TypeScript、SDK、Host 与 Rust shared fixtures MUST 对同一 closed method/event/error set 达成一致；permission/clipboard facts MUST 不再属于该链。

#### Scenario: consumer 增加未建模语义
- **WHEN** 任一 method、event 或 error 只出现在 catalog、fixture 或 consumer branch
- **THEN** generation、exhaustiveness 或 shared-fixture gate 失败

