## MODIFIED Requirements

### Requirement: First installation must use explicit Host registration facts

首次注册兼容 package 时，Host MUST 使用 inspector 返回的 normalized Manifest 与 package digest，注入 committed installation path、`source=external`、`enabled=true`，并保持 Runtime `inactive`。当前 registration MUST 不创建 grant snapshot、permission state、signature 或 trust。Manifest Publisher、remote behavior 或安装确认 MUST NOT 改变 source、enabled、provenance 或 Host authority。

#### Scenario: 安装开放 Web 插件
- **WHEN** compatible Manifest `0.2.0` 插件声明普通 Page/Action 并完成首次安装
- **THEN** Manager record 保存显式安装事实且 Runtime 为 `inactive`
- **THEN** 安装不执行插件代码、不创建 grant，也不审查其未来 Worker 或网络行为

#### Scenario: Publisher claims an official identity
- **WHEN** local package 的 Publisher 文本声称 official lensX 身份
- **THEN** Host 仍记录 `source=external`
- **THEN** 安装不创建 verified、signed、official 或额外 Host authority

### Requirement: First installation must reject an existing healthy or quarantined identity

系统 MUST 将相同 `plugin_id` 的 healthy registration 或对应 quarantined/incompatible record key 视为 existing identity，并返回稳定 `already_installed` 或 `identity_quarantined`。首次安装 MUST NOT 推断 upgrade、downgrade、reinstall 或修复，也 MUST NOT 覆盖当前 record、payload、data 或 diagnostic evidence。

#### Scenario: 同一 package 被再次选择
- **WHEN** 用户再次选择当前已安装插件的同一 `.lxp`
- **THEN** 安装确定性拒绝 duplicate identity
- **THEN** 当前 payload、record、revision、data 与 event 保持不变

#### Scenario: 同一 ID 有不同版本
- **WHEN** 候选具有相同 plugin ID 但不同 version 或 digest
- **THEN** 首次安装拒绝并指引使用 replacement flow
- **THEN** 不发生 permission/grant 迁移或隐式信任变化

### Requirement: The installation command contract must be strict, private, and minimally disclosing

local installation boundary MUST 使用独立 Host-private strict contract `0.3.0`，包含 separate `prepare`、`commit`、`cancel` operations。`prepared` MUST 只包含 opaque token 与可信确认 UI 所需的 bounded candidate identity、Manifest version、localized display name 和 Publisher display facts；MUST NOT 包含 permission candidates/reasons、grant、path、digest、package bytes、staging fact、complete Manifest、source authority、raw error 或 Host object。`commit` MUST 只接受当前 token 并返回 installed identity/version/revision。

#### Scenario: Frontend receives a prepared candidate
- **WHEN** Rust 完成有效兼容候选的 inspection 与 staging
- **THEN** adapter 严格验证 `0.3.0` prepared payload 和 bounded display facts
- **THEN** payload 不包含 permission selection、grant、path、digest、bytes 或 private object

#### Scenario: Commit succeeds
- **WHEN** trusted management service 提交当前 token 且 durable installation 成功
- **THEN** Host 创建无 grant 字段的当前 Registration 并使 token single-use
- **THEN** 后续只通过完整 Registration convergence 选择插件

#### Scenario: Legacy permission candidate appears
- **WHEN** boundary payload 包含 requested permission、reason、selection 或 post-commit grant intent
- **THEN** Rust/TypeScript strict parser 拒绝整个 payload
- **THEN** 不创建 Registration、revision 或 permission authority

### Requirement: The settings installation entry point must be accessible, localized, and theme-compatible

Plugins Settings MUST 使用现有 i18n 与 Semi Design theme 提供安装说明、可访问入口、prepared-candidate confirmation 和异步反馈。确认 MUST 说明安装表示信任插件在隔离 Web Runtime 中处理用户交给它的数据，而 lensX 不对 Worker、网络或远程资源逐项授权或背书。UI MUST 不显示 permission checklist、grant state、partial-grant feedback 或 post-commit permission work。

prepare、confirm、commit、cancel 与 Registration convergence pending 时 MUST 防止不兼容 reentry。所有 copy MUST 具有 canonical English 与语义一致中文，并在 light/dark、固定 viewport、键盘与 focus recovery 下可用。

#### Scenario: Keyboard user confirms installation
- **WHEN** 键盘用户选择有效 package 并打开 confirmation
- **THEN** 对话框展示 bounded identity/version/Publisher 和安装信任说明且可完整键盘操作
- **THEN** explicit install confirmation 前不创建 durable Registration

#### Scenario: User cancels preparation
- **WHEN** 用户在 commit 前取消或关闭 confirmation
- **THEN** Host 取消 opaque preparation、清理 owned staging 并恢复确定 focus
- **THEN** 不留下 Registration、grant、permission decision 或错误提示

#### Scenario: Locale and theme change
- **WHEN** 安装入口在 `en-US|zh-CN` 与 light/dark 中渲染
- **THEN** trust guidance、pending、cancel、success 与 failure copy 跟随 locale/theme
- **THEN** 不出现旧 permission guidance、selection 或 partial-grant 文案

### Requirement: Local installation must not deliver later plugin capabilities early

该 capability MUST 只交付 local compatible `.lxp` 的 prepare/first installation、入口、Registration notification 和 recovery cleanup。它 MUST NOT 下载 remote package、执行插件、创建 Runtime、开放 Tauri/native capability、替换、卸载或实现 Marketplace。可信管理页 MAY 组合独立 lifecycle、replacement 与 data services，但 MUST NOT 组合 permission service、把 grant 传入 commit 或把安装成功解释为 Host 原生 authority。

#### Scenario: Plugin finishes installation
- **WHEN** local `.lxp` 成功写入并注册
- **THEN** management service 从当前 Registration 收敛并可由用户显式打开插件
- **THEN** installer 不读取 Runtime entry、不执行代码、不创建 permission/grant 或原生 provider

#### Scenario: User wants another management operation
- **WHEN** 用户选择 replacement、lifecycle 或 data control
- **THEN** 对应独立 typed service 拥有该操作
- **THEN** local installation command 不获得 update、uninstall、permission 或 data authority

## REMOVED Requirements

### Requirement: Reinstallation after lifecycle removal must preserve data policy and reset Host grants
**Reason**: 新 registration 不再含 Host grants，因此 reinstall 只需保持 data policy 与新 identity/record 边界。
**Migration**: 由新增的无 grant reinstall requirement 替代；旧 cleanup record 不能恢复任何旧 permission facts。

## ADDED Requirements

### Requirement: Reinstallation after lifecycle removal must preserve data policy without restoring removed authority

同一 identity 的后续成功安装 MUST 仅在不存在 pending cleanup conflict 且 package commit 与 Manager registration 成功后清理旧 completed cleanup record。`retain_data` 留下的 data MUST 保持；旧 record、cleanup 或 retained data 中的 grants、diagnostics、enabled intent 或 permission facts MUST NOT 恢复。新安装 MUST 使用当前 Manifest `0.2.0`、`enabled=true` 与 `inactive` Runtime。

#### Scenario: Retained-data identity is reinstalled
- **WHEN** 旧 uninstall 已完成并保留 data，新的兼容 `0.2.0` package 安装成功
- **THEN** 新 record 指向新 canonical payload 且 retained data 保持
- **THEN** 旧 permission/grant facts 不进入新 record 或 Runtime

