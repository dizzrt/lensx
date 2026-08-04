## ADDED Requirements

### Requirement: Installer-owned program, data, and cleanup roots must remain separated

Host-owned `app_local_data_dir()/plugins` MUST 保持程序 payload、插件私有数据和 lifecycle cleanup evidence 分离。程序路径 MUST 继续使用 `packages/<plugin-key>/<package-sha256>`；数据边界 MUST 使用 `data/<plugin-key>`；cleanup record MUST 位于独立受限 root 并按安全 plugin identity 唯一。第一安装 MUST NOT 因建立数据边界而提前创建空 data 目录。任何 author Manifest、React caller、公共插件 package 或 Runtime MUST NOT 提供或接收真实 root、plugin key、digest path 或 cleanup path。

#### Scenario: 首次安装没有既有插件数据

- **WHEN**兼容 `.lxp` 完成普通首次安装
- **THEN**payload 仍提交到现有 digest path，Manager installation path 仍是唯一 active payload pointer
- **THEN**installer 不创建空 `data/<plugin-key>` 或向前端暴露任何真实路径

#### Scenario: 生命周期后保留数据

- **WHEN**相同 plugin identity 已逻辑卸载但 `retain_data` 保留了 canonical data subtree
- **THEN**program payload、data subtree 和 cleanup evidence 保持独立所有权
- **THEN**orphan package recovery 不得把 retained data 当成 package orphan 删除

### Requirement: Installation and lifecycle commits must share one serialization boundary

Plugin installation、enabled/uninstall commit、cleanup recovery 和同 identity reinstall MUST 共享现有进程内 mutex 与跨进程 installer lock，或共享等价的单一串行边界。持锁代码 MUST 在变更前重新读取 Manager、cleanup 和 canonical filesystem facts，MUST NOT 依赖锁外 stale preflight。并发请求 MUST 等待定义的有界顺序或返回稳定 busy/conflict，MUST NOT 清理或覆盖另一请求的 staging、payload、data 或 cleanup record。

#### Scenario: Installation 与卸载并发

- **WHEN**一个进程正在提交同 plugin identity 的卸载，另一个进程请求安装
- **THEN**两者不能同时修改 Manager、package subtree 或 cleanup record
- **THEN**后取得锁的请求基于前一个已提交结果重新验证，而不从锁外结论继续

#### Scenario: 不同插件并发请求

- **WHEN**多个插件 lifecycle/installation 请求竞争共享 commit 边界
- **THEN**请求按安全 serial order 完成或收到稳定 busy 结果
- **THEN**一个插件的 cleanup 不会读取、删除或阻塞为另一个插件拥有的 canonical subtree之外的内容

### Requirement: Startup recovery must reconcile lifecycle cleanup before accepting new writes

在 Plugin Manager recovery 后、接受新的 installation 或 lifecycle 写入前，Host MUST 在共享锁内读取并严格验证版本化 cleanup records。Manager 已无目标 entry 时，恢复 MAY 只删除 cleanup record 可证明拥有的 canonical package subtree，并且仅在策略为 `delete_data` 时删除 canonical data subtree。Manager 仍包含目标健康/quarantine entry 时，恢复 MUST 保留其 active evidence并不得让 cleanup 产生缺失 payload。损坏 record、symlink、异常命名、root 逃逸或所有权不明确 MUST 被保留并产生 bounded degraded diagnostic。

#### Scenario: 重启恢复 pending program cleanup

- **WHEN**上次卸载已经移除 Manager entry，但进程在删除 canonical package subtree 前退出
- **THEN**startup recovery 在锁内完成 package cleanup并更新完成结论
- **THEN**不会重建 registration、增加伪造 revision或触碰 retained data

#### Scenario: 重启恢复 delete-data intent

- **WHEN**cleanup record 明确保存 `delete_data` 且 Manager 已无目标 entry
- **THEN**恢复删除仅该 canonical data subtree，直到结论完成
- **THEN**恢复不能把策略降级为 retain，也不能删除其他 plugin key 的数据

#### Scenario: Pending cleanup 与健康记录冲突

- **WHEN**cleanup record 指向的 identity 当前仍存在健康或 quarantine Manager entry
- **THEN**recovery 不删除 active/quarantine package 或 data evidence并标记安全冲突
- **THEN**Host 拒绝可能覆盖证据的新写入，直到 trusted recovery 解决冲突

### Requirement: Reinstallation after lifecycle removal must preserve data policy and reset Host grants

同 identity 的后续成功安装 MUST 只在没有 pending cleanup 冲突且 package commit/Manager registration 完成后清除旧 completed cleanup record。`retain_data` 留下的 data subtree MUST 保持不变；之前 Manager record 中的 grants、diagnostics 和 enabled intent MUST NOT 从 cleanup record 或 retained data 恢复，新 installation MUST 继续使用当前首次安装规则：`enabled=true`、空 grants、`inactive` Runtime。旧 uninstall 请求的 revision/operation identity MUST NOT 删除新 payload。

#### Scenario: 保留数据后重新安装

- **WHEN**同 plugin identity 的旧卸载已完成、data 被保留且新兼容 package 成功安装
- **THEN**新 Manager record 指向新 canonical payload，使用空 grants 和 enabled intent true
- **THEN**retained data 保持原位，completed cleanup record在新 registration 成功后清除

#### Scenario: Cleanup 仍 pending 时尝试重新安装

- **WHEN**旧 identity 仍有未完成或冲突的 cleanup evidence
- **THEN**installer 返回稳定 cleanup-pending/busy 结果且不创建 staging 或新 Manager record
- **THEN**旧意图先完成或被 trusted recovery 解决，避免旧重试删除新安装
