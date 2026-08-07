## MODIFIED Requirements

### Requirement: Registration facts MUST have explicit persistence lifetimes

Plugin Manager MUST 为 installed registration 持久化 normalized Manifest、installation location、algorithm-tagged package digest、Host-controlled source、enabled intent、granted-permission ID snapshot 和 recent diagnostics。Manager MAY 在同一 current snapshot 中维护仅 process-local 的 development registration；development entry MUST 使用独立的 development snapshot payload variant、`source=development`、process-local grants/diagnostics，并 MUST NOT 写入、删除或伪装成 Plugin Manager Store record。record 的存在 MUST 代表 installed registration；process-local development entry 的存在只代表当前进程中已提交的开发 snapshot。

两种 lifetime 的 compatibility MUST 从各自当前 Manifest range 与当前 lensX/Host API version 推导。Runtime state MUST 保持 process-local；installed record recovery MUST 以 `inactive` 开始，development entry、source directory capability、snapshot、grant、diagnostic 和 Runtime state MUST NOT 在新进程中恢复。

#### Scenario: A healthy record is recovered after restart

- **WHEN** 一个 installed healthy record 已成功持久化，且应用以相同 Host versions 重新启动
- **THEN** Plugin Manager 恢复相同 normalized Manifest、installation facts、enabled intent、grant snapshot 和 bounded diagnostics
- **THEN** Runtime state 为 `inactive`

#### Scenario: The Host version changes

- **WHEN** 一个 record 在较早 Host 中兼容，但恢复时当前 lensX 或 Host API version 不再处于 Manifest range
- **THEN** Plugin Manager 将当前 compatibility 推导为 incompatible
- **THEN** 旧进程持有的 compatibility 结论不能覆盖新结果

#### Scenario: A Manifest requests permissions without a Host grant

- **WHEN** installed 或 development normalized Manifest 声明一个或多个 requested permissions，且 Host 未提供 grant snapshot
- **THEN** Plugin Manager 为该 entry 使用空 granted-permission ID snapshot
- **THEN** requested permissions 不会自动变成 grants

#### Scenario: The previous process had Runtime activity

- **WHEN** 一个 installed plugin 在应用退出或崩溃前存在 process-local Runtime activity
- **THEN** 下一次 recovery 不会把该 activity 反序列化为 live session
- **THEN** plugin 以 `inactive` 开始

#### Scenario: A development registration existed in the previous process

- **WHEN** 旧进程包含 development registration、source directory capability、snapshot 或 grants 后退出或崩溃
- **THEN** 新进程的 Plugin Manager 不恢复任何这些 development facts
- **THEN** installed records、quarantine evidence 和 Store revision 保持其既有恢复语义

## ADDED Requirements

### Requirement: Development entries MUST share Manager identity and revision authority without becoming Store records

Plugin Manager MUST 在一个 atomic read projection 中组合 installed 和 process-local development entries，并 MUST 对 builtin、external、development 和 quarantine identity 执行相同的 plugin ID 唯一性。成功的 development register、reload、enabled/grant mutation 或 remove MUST 使用相同的 compare-current revision、affected-plugin resource generation 和 changed-event语义；它们 MUST NOT 调用 Store write/delete。development payload facts MUST 是 Host-owned strict variant，并 MUST NOT 允许 Manifest author 提交 source、snapshot path/identity、enabled、grants 或 Runtime state。

#### Scenario: Development entry joins the current snapshot

- **WHEN** trusted Development coordinator 提交完整有效的 development Manifest、snapshot payload facts、enabled intent 和 empty grants
- **THEN** Manager 以唯一 `plugin_id` 发布 process-local healthy entry、推进 revision/resource generation 并产生普通 changed event
- **THEN** 同一次变化不会创建 Plugin Store file 或 installed package record

#### Scenario: Development mutation loses a race

- **WHEN** development reload、grant、enabled 或 remove mutation 的 expected revision/entry identity 已过期
- **THEN** Manager 返回 stable conflict 且不修改 installed/development entries、Store、revision 或 resource generation
- **THEN** stale mutation 不能恢复旧 snapshot、grant 或 Runtime authority

#### Scenario: Development entry is removed

- **WHEN** trusted coordinator 成功 remove 当前 development entry
- **THEN** Manager 从 process-local healthy set 删除它并推进受影响 plugin 的 revision/resource generation
- **THEN** Manager 不删除 plugin data、installed payload、Launcher collections 或任何 Store record
