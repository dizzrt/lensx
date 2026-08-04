## Context

当前 Rust `PluginManager` 已持久化 Host-owned `enabled` intent，并已有原子 `set_enabled` 内部方法；本地安装器会把兼容 `.lxp` 提交到 `app_local_data_dir()/plugins/packages/<plugin-key>/<digest>`，随后注册 enabled 记录并发布 Registration invalidation event。可信 TypeScript Registration Adapter 通过完整 snapshot/detail 恢复，Plugin Surface Projection Coordinator 只投影 enabled、双维兼容、非 quarantine 的插件，并按 Page→Action 发布、Action→Page 撤销；Page Registry 失效会关闭活跃插件页面。Launcher 搜索和 Recent/Pinned 都只消费统一 Action Registry。

缺口不在单个布尔字段，而在跨 Rust 持久化、TypeScript Registry、导航状态和文件系统清理的协调：直接暴露 `set_enabled` 会留下禁用已提交但当前表面尚未撤销的窗口；直接删除 payload 会留下 Manager 指向缺失目录；把所有步骤塞进一个跨语言“原子事务”又不现实。设计因此把“Rust 持久事实”和“当前可信 App 会话收敛”分层，同时让每一层都 fail closed、可重试、可从完整事实恢复。

## Goals / Non-Goals

**Goals:**

- 提供 Host-private、版本化、严格验证的 enabled/uninstall 写入 contract 和可信前端 lifecycle service。
- 明确 enabled intent、effective availability、compatibility、quarantine 和 uninstalled 的关系及幂等结果。
- 禁用/卸载在当前 App 会话先撤销执行入口和页面，持久失败则从当前 Registration snapshot 恢复；启用等待目标 revision 完成 Page→Action 投影。
- 让 Manager 记录移除、程序 payload 清理、可选数据清理、事件发布和重启恢复保持一致。
- 保持程序、插件私有数据、Manager Store、Recent/Pinned 和权限 grants 的所有权边界清楚。
- 对 builtin/external 使用相同 enabled 规则，并只依据 Host 可证明的 managed payload 决定是否能物理卸载。

**Non-Goals:**

- 不实现完整插件管理列表、详情页或最终用户操作 UI；Task 6.1 消费本 change 的 typed service。
- 不实现 iframe Runtime、Runtime session quiesce、资源服务、Host API 或插件代码执行。
- 不实现升级、回滚、重装、签名、Publisher 验证、权限授予/撤销或 quarantine 修复。
- 不删除 Recent/Pinned Action ID，不新增历史清理行为。
- 不建立通用工作流引擎、跨能力事务平台或公开 plugin-facing lifecycle API。
- 不改变 `.lxp` 包协议、canonical payload 内容或现有 digest 路径。

## Decisions

### 1. 使用独立 Host-private Lifecycle Contract

Rust 暴露 `set_plugin_enabled` 与 `uninstall_plugin` 两个 Tauri command；enable/disable 共享前者的 `enabled: boolean`，避免两套漂移的命令。请求包含 opaque `entry_id`、`expected_revision` 和操作参数；卸载还要求显式 `retain_data | delete_data`。响应和错误使用独立 lifecycle contract version，并只返回安全的 operation、outcome、revision、effective availability/cleanup conclusion，不返回 plugin ID 之外的 Manifest、路径、digest、Store key、原始错误或 cleanup record。

Registration Contract 继续只读且版本独立。Lifecycle command 成功后仍发布既有 `plugin-registration://snapshot-changed` invalidation；可信前端也会根据响应 revision 主动完整刷新，所以事件发送失败不会阻止当前调用会话收敛。

替代方案是直接扩展 Registration Contract 添加写方法。拒绝该方案，因为 Registration v0 的职责是可恢复读取和 invalidation，生命周期写入需要不同的请求、错误、幂等和数据清理语义。

### 2. 持久状态保持最小，effective availability 始终派生

不新增公开 `enabling | disabling | uninstalling` 枚举。健康记录继续持久化 enabled intent；effective availability 始终由 `registered && enabled && lensx-compatible && host-api-compatible && !quarantined` 派生。卸载完成表现为健康/quarantine 记录不存在。

不兼容健康记录可以保存 `enabled=true` intent，但不得投影 Action/Page。enable/disable 只接受健康记录；quarantine 不能被伪装成 disabled 或被 enable 修复。卸载可以接受健康或 quarantine entry，quarantine 清理只能使用 Host-owned record key/installer root 证明的目标。

替代方案是把 transient operation state 放进 Registration payload。拒绝该方案，因为当前没有 Runtime session，且崩溃后仍必须从 Manager 记录、cleanup intent 和文件系统事实恢复，持久 transient enum 不会替代恢复证据。

### 3. revision 预条件和幂等以目标 entry 为单位

所有操作检查 `expected_revision` 与当前进程 Registration revision。revision 不匹配返回 conflict 并要求调用方完整刷新，防止基于旧详情操作已经变化、卸载或重新安装的 entry。

`set_plugin_enabled` 达到目标值时返回 `unchanged`，不写盘、不增加 revision、不发事件。卸载使用以安全 plugin key/entry identity 为键的 Host-private cleanup record；记录保留最近完成结论，直到同 identity 的下一次成功安装清除它，因此同一卸载请求可返回 `unchanged` 或继续 pending cleanup，而不会删除新安装。所有真实状态变化只产生一个 Manager revision；cleanup 进度不伪造 Registration revision。

### 4. 可信前端 service 负责当前会话 quiesce 与收敛

生产代码不直接从 UI 调用 Tauri lifecycle command，而通过 Host-private `PluginLifecycleService`：

- Disable/Uninstall：先校验当前 snapshot/revision；原子替换该 provider Action batch 为空，再替换 Page batch 为空。Page Registry 通知现有 navigation service 关闭活跃页面并返回 Home。任一步失败都不调用 Rust。
- Rust transition 失败或 conflict：service 完整刷新 Registration 并从最后确认事实重投影，恢复原来仍有效的 Page/Action。
- Rust transition 成功：service 使用返回 revision 主动刷新 Adapter，等待 Surface Projection `whenIdle()`；只有当前 App 会话达到目标 revision 后才完成用户可见操作。
- Enable：无需预先撤销，先提交 enabled intent，再等待同 revision Page→Action 投影。若投影失败，enabled intent 不回滚，表面保持 fail closed 并报告 bounded diagnostic。

这个顺序利用现有单窗口、单生产 Projection Coordinator。未来 Runtime change 必须在同一 quiesce 阶段增加 session stop，但本 change 不创建空 Runtime hook 平台。

替代方案是 Rust commit 后完全依赖异步 event。拒绝该方案，因为 event 可能丢失，且 commit 与当前 Registry 撤销之间存在可见窗口。另一个方案是让 Rust直接操作前端 Registry；这违反 Tauri/React 边界且无法跨进程持久化。

### 5. Manager 移除先建立持久“记录不存在”，payload 清理随后收敛

Plugin Manager 增加按 entry 移除健康或 quarantine Store record 的内部原子操作。删除/目录 flush 失败时，原内存记录、revision 和磁盘记录保持不变；成功持久化 absence 后才从内存 snapshot 移除并提交一个 revision。Lifecycle coordinator 随后发送 existing Registration changed event。

卸载与安装共享同一个进程 mutex 和 `.install.lock`。在锁内先验证目标记录、canonical managed payload/data 路径和 cleanup record，再持久化 cleanup intent；Manager removal 成功后删除程序 payload，并按策略保留或删除 data。这样绝不会发布一个仍健康但路径已经缺失的 registration。Manager 已移除后的物理删除失败返回“已卸载、清理待恢复”的成功结论，而不是暗示插件仍已安装。

替代方案是先删除 payload 再删 Manager record。拒绝该方案，因为 Manager 持久化失败会留下健康记录指向缺失内容。把所有目录复制到新事务区也被拒绝，因为当前单版本 digest 布局和本 change 不需要通用事务目录。

### 6. cleanup record 是受限恢复证据，不是通用事务日志

在 installer-owned root 下建立受限、版本化、每 plugin key 一个的 cleanup record。它只保存 Host 派生的安全 key、operation identity、程序清理是否完成、`retain_data | delete_data` 策略和数据清理是否完成；不接受 author 值，不跨出 installer root，也不通过 Tauri 暴露真实路径。

启动时，在 Plugin Manager recovery 之后、接受新安装/生命周期操作之前、持有共享锁的情况下恢复 cleanup：

- Manager 仍有健康/quarantine entry 时，不删除其 active payload；未提交的卸载 intent 回滚/失效并保留证据。
- Manager 已无 entry 时，只删除 canonical package subtree；`delete_data` 才删除 canonical data subtree，`retain_data` 永不删除数据。
- 异常文件、symlink、root 外路径或无法证明所有权的内容全部保留并让 lifecycle availability degraded，而不是猜测清理。
- 完成记录保留幂等结论；同 identity 的后续成功安装在新 Manager record 发布后清除旧完成记录，但保留 `retain_data` 数据且 grants 从空开始。

### 7. 程序、数据和其他 Host 状态相互独立

程序继续位于 `packages/<plugin-key>/<package-sha256>`。新增按需 `data/<plugin-key>` 边界；本 change 不提前创建空目录，也不向插件或前端暴露路径。disable 不删除 payload、data、grants、Manager diagnostics 或 collections。

Uninstall 总是删除 Manager record，所以 grants 与 Manager diagnostics 一并消失；`retain_data` 是产品默认选择，但 command 请求必须携带显式枚举；`delete_data` 由 cleanup recovery 保证最终意图。Recent/Pinned 属于 Host Launcher preference，不属于插件数据，缺失 Action ID 继续隐藏但持久保留。

### 8. lifecycle policy 不从 provenance 推导

任何健康 registration 都可 set enabled，source 与 Publisher 不参与判断。物理 uninstall 需要 Host 能把 Manager record/quarantine key 映射到 installer-owned canonical payload；不能证明 managed ownership 的 Host module 返回 `operation_not_supported`，原因是没有可安全删除的 owned payload，而不是 builtin/official 身份。官方打包插件只要进入同一 managed layout，就与第三方插件使用相同生命周期规则。

## Risks / Trade-offs

- [前端 quiesce 后 Rust 持久化失败，表面暂时缺失] → command 失败路径强制完整 Registration refresh 和同 revision 重投影；App 重启也从持久 enabled intent 自愈。
- [Manager 已移除但文件删除失败] → cleanup record 保留明确意图，返回 cleanup pending 结论，并在每次启动/后续同目标操作下持锁重试。
- [cleanup record 损坏或路径证据异常] → 不删除任何不确定内容，标记 lifecycle/installer degraded，继续允许不受影响插件读取但拒绝可能覆盖证据的新写入。
- [完成 tombstone 无限增长] → 每 plugin key 最多一个小型版本化记录；同 identity 成功安装清除已完成记录，异常记录受 bounded diagnostics 管理。
- [启用 intent 成功但 Projection 失败] → 保持 intent 与 effective availability 分离，表面 fail closed并暴露安全诊断，不用前端临时失败改写持久用户选择。
- [未来 Runtime 需要更多停机步骤] → Task 3.3 的 quiesce 顺序被定义为可扩展安全阶段，但不提前实现 Runtime 抽象；Runtime change 必须在 Action/Page 撤销前增加会话停止并更新规格。

## Migration Plan

1. 先扩展 Manager removal 与 installer root recovery，使现有安装记录和 package layout 无迁移即可读取。
2. 增加 lifecycle contract/coordinator、cleanup record 和故障注入测试，再接入 Tauri setup/invoke。
3. 增加 TypeScript adapter/service 与 Projection quiesce/recovery 协调；生产仍无完整管理 UI。
4. 更新英文架构文档及中文镜像，运行 cross-boundary drift gate 和完整前端/Rust验证。
5. 回滚代码时，现有 Manager v1 record 和 package payload 仍可读取；新版本写出的 data/cleanup 根必须由旧版本保守忽略，不能把它们当 orphan 删除。若存在 pending cleanup，应先用新版本完成或由人工保留证据，不以旧版本猜测清理。

## Open Questions

无。Task 3.3 的实现决策已在本 change 中关闭；未来 Runtime stop、完整管理 UI、权限撤销、升级/回滚和显式 Launcher 历史清理分别由后续 Task 定义。
