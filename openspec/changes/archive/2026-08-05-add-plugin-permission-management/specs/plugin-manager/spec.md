## ADDED Requirements

### Requirement: Grant snapshot mutations MUST be revision-bound, declaration-limited, and atomic

Plugin Manager MUST 提供一个 Host-private mutation，在保留 normalized Manifest 与全部无关 Host facts 的同时，修改一个 healthy Registration 的单个 permission grant。每次 mutation MUST 要求当前 opaque entry identity 与精确 Registration revision。授予 MUST 要求当前 normalized Manifest 已请求该 permission，且当前 Host permission catalog 支持它。撤销 MUST 能删除已有 grant，即使该 permission 后来不再被请求或支持。

候选 grant snapshot MUST 保持排序、无重复、有界且归 Host 所有。发生变化的 snapshot MUST 在发布内存状态前通过既有 atomic record replacement 持久化，随后将 Registration revision 精确推进一次。幂等目标状态 MUST 返回 unchanged，且不写入或推进 revision。Source、Publisher 文本、版本方向、enabled intent 与 author-controlled fields MUST NOT 影响此转换。

#### Scenario: 授予当前已请求权限

- **WHEN** 可信 Host caller 使用当前 entry identity 与 revision 授予当前 Manifest request
- **THEN** Manager 原子持久化规范化的下一 grant snapshot，并发布一个新 revision
- **THEN** normalized Manifest 与无关 Host facts 保持不变

#### Scenario: 撤销已有权限

- **WHEN** 可信 Host caller 使用当前 entry identity 与 revision 撤销一个已有 grant
- **THEN** Manager 只原子删除该 grant，并发布一个新 revision
- **THEN** 其他 grants 与无关 plugin records 保持不变

#### Scenario: Grant 未声明或不受支持

- **WHEN** caller 尝试增加当前 Manifest 未请求或 Host catalog 不支持的 permission
- **THEN** Manager 使用稳定 diagnostic 拒绝转换
- **THEN** 内存、磁盘、revision 与先前 grant snapshot 保持不变

#### Scenario: Grant mutation 是幂等的

- **WHEN** caller 再次授予已授予 permission，或撤销当前 grant snapshot 中不存在的 permission
- **THEN** Manager 返回当前 Registration 且不写入 record
- **THEN** revision 与 resource generation 保持不变

#### Scenario: Grant mutation 在 revision 竞争中失败

- **WHEN** 另一个 lifecycle、replacement、installation 或 permission mutation 在当前 mutation 提交前推进 Registration revision
- **THEN** stale mutation 使用稳定 conflict diagnostic 失败
- **THEN** 它不能覆盖新提交的 Manifest、grants、enabled intent、diagnostics 或 payload facts

#### Scenario: Grant 持久化失败

- **WHEN** 变化后的 grant snapshot 在创建临时文件、写入、flush 或原子替换时失败
- **THEN** Manager 返回稳定 persistence diagnostic，且不发布新 revision
- **THEN** 上一次成功的内存与磁盘 record 在重启后仍是权威状态
