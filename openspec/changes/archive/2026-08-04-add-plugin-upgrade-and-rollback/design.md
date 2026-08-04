## Context

当前 Rust 本地安装器已经把一份兼容 `.lxp` 安全提交到 `app_local_data_dir()/plugins/packages/<plugin-key>/<package-sha256>`，并在 Plugin Manager 中持久化唯一健康 registration。安装、enable/disable、uninstall、cleanup recovery 共用进程内 mutex 与跨进程 `.install.lock`；Plugin Manager 对每个 record 使用临时文件、flush 和原子 replace，Registration Contract 通过 revision 与 invalidation event 驱动可信 TypeScript adapter 和 Action/Page Surface Projection 收敛。

当前边界刻意只支持首次安装：相同 `plugin_id` 的健康或 quarantine identity 均被拒绝。Manager 的 `register` 也拒绝重复 identity，installer recovery 会删除所有未被健康 record 引用且不受 quarantine 保护的 canonical digest sibling。现有 Lifecycle Service 已能在 disable/uninstall 前按 Action→Page 撤销 surface、在失败后恢复，并在成功后按目标 revision 等待 Page→Action 投影。

本 change 将这些基础组合成相同 `plugin_id` 的本地包替换。用户已经确认：显式选择本地包时允许任意 SemVer，包括降级和同版本重装；“回滚”只表示提交点之前失败时旧版本保持可用，不提供成功后的主动回滚。成功替换后旧 payload 必须删除或进入可恢复清理，不保留 previous version。

## Goals / Non-Goals

**Goals:**

- 提供 Host-private、版本化、严格校验的 prepare/commit/cancel 两阶段替换边界。
- 对候选包给出 duplicate、upgrade、downgrade、reinstall 分类，但只以包有效性、当前 Host 兼容性、identity 和 revision 决定是否可提交。
- 在不改变 Manager record v1 形状的情况下原子替换 Manifest、安装路径、package digest 和继承后的 Host facts。
- 将替换与现有安装/lifecycle 写入放在同一个提交锁内，并保证崩溃、并发和故障注入下永远不发布指向 staging 或缺失 payload 的健康 record。
- 在 Rust commit 前撤销目标插件 surface；提交失败恢复旧投影，提交成功按新 revision 收敛。
- 保留 source、enabled intent、独立 data subtree 和仍有效的 grant 交集；新增请求不自动授权。
- 成功后安全清理旧 payload，并通过现有 orphan recovery 完成未立即成功的清理。

**Non-Goals:**

- 不提供显式 rollback command、previous version、版本历史、多版本共存或版本选择器。
- 不提供远程下载、自动更新、Catalog、Marketplace、完整插件管理 UI 或权限授权 UI。
- 不创建 Runtime session、运行候选代码、执行启动健康检查或根据 Runtime 失败回滚。
- 不迁移、转换或回滚 `data/<plugin-key>` 内容，也不建立插件数据 schema。
- 不验证真实签名、Publisher 身份或官方 provenance；这些仍由后续 signing/trust changes 提供。
- 不修复或替换 quarantine identity，不建立通用事务日志或工作流平台。

## Decisions

### 1. 替换使用独立两阶段 Host-private contract

新增独立版本的 Plugin Replacement Contract，而不是改变首次安装 contract 或 Registration read contract。可信根应用调用 pathless `prepare_local_plugin_replacement`：请求携带当前健康 `entry_id` 与 `expected_revision`，Rust 打开单文件 `.lxp` 选择器、读取一次受限不可变 bytes、复用 package inspection，并确认候选 `plugin_id` 与目标相同。取消文件选择返回普通 `cancelled`。

成功 prepare 将候选提取到 installer-owned staging，在 commit 前再次验证输出 facts，并返回不含路径和 digest 的 `prepared` 结果：opaque preparation token、entry ID、当前/候选版本、`upgrade | downgrade | reinstall` 分类和新增/移除 permission ID。完全相同的 package digest 返回 `duplicate`，不创建可提交 token、不改 revision。`cancel_plugin_replacement` 或下一次 preparation 会清理旧 staging；进程退出后的合法 staging 由启动 recovery 删除。

可信 TypeScript service 在得到 `prepared` 后撤销目标 provider surface，再调用 `commit_local_plugin_replacement`，请求只携带 contract version、token、原 entry ID 和原 expected revision。Rust 不信任 prepare 时的可变外部状态；commit 持锁重新读取 Manager/recovery facts、校验 token 绑定、revision、identity、staging 类型与内容，并在任何不一致时失败关闭和撤销 preparation。

每个进程最多保留一个有效 preparation，避免多个最大尺寸 staging 长期占用空间。已有 preparation 时新的 prepare 返回稳定 `busy`；显式 cancel、service destroy 和失败 commit 都尽力清理当前 preparation。拿不到共享提交锁同样返回稳定 `busy`。token 只属于当前 Host 进程，不跨重启恢复，也不是插件可见 capability。

备选方案是一个命令完成选择、检查和替换。该方案在 Rust 识别目标 plugin ID 前无法让 TypeScript 安全撤销对应 Action/Page，也无法在提交前展示版本和权限差异，因此拒绝。另一个方案是把路径或包 bytes 返回前端再提交，会扩大敏感路径和 IPC 边界，同样拒绝。

### 2. SemVer 顺序只分类，不授权或阻止显式本地替换

当前与候选完整 package digest 相同为 `duplicate`；候选 SemVer 更高为 `upgrade`，更低为 `downgrade`，版本相同但 digest 不同为 `reinstall`。所有非 duplicate 分类都允许通过同一 commit，只要候选 package 有效、与当前 lensX/Host API 兼容、plugin ID 相同且当前 revision 未变化。

“允许任意版本”不允许无效或不兼容包，也不允许跨 plugin ID replacement。Manager record、canonical installation path、record key、package digest 或候选 facts 互相不一致时返回 identity/unsafe-state 错误，不把异常证据解释成 reinstall。quarantine 仍只能由未来显式恢复能力处理。

这里的用户显式本地选择不属于静默降级。未来远程自动更新仍必须独立定义是否允许自动降级，不能从本 change 推导许可。

备选方案是默认拒绝较低版本或要求一个 `allow_downgrade` Host flag。用户已经选择让本地显式替换支持任意版本；额外 flag 只会制造第二套政策，因此不采用。

### 3. Manager record 是唯一 active pointer，并新增 revision-bound 原子 replacement

目录继续保持：

```text
plugins/
├── .install.lock
├── .staging/<preparation-id>/
├── packages/<plugin-key>/<package-sha256>/
└── data/<plugin-key>/
```

不新增 `active-version` 文件、`versions` 目录或持久 upgrade journal。Plugin Manager record 已经原子保存完整 Manifest、`installation_path` 和 `package_digest`，它继续是唯一 active pointer；任一时刻只存在一个健康 registration。新增内部 `replace_entry` 必须绑定健康 entry ID 和 `expected_revision`，要求新 Manifest 使用相同 `plugin_id`，验证完整 next registration，先原子写同一个 record，再发布内存 snapshot 和唯一新 revision。`register` 的重复 identity 拒绝语义保持不变。

commit 顺序固定为：重新验证 preparation → 将 staging 原子 rename 为新的 canonical digest sibling并 flush 父目录 → 原子替换 Manager record → 发布内存 snapshot/revision → 删除旧 canonical payload → 发送现有 changed invalidation event。新 record 保证从不指向 staging 或缺失目录。

Manager replace 之前任何失败都删除候选或把它留作可证明的 orphan，旧 record、旧 payload 和 revision 不变。Manager replace 成功就是 durable commit point；之后 event、旧 payload 删除或前端 convergence 失败都不把 record 切回旧版本，以免瞬时通知/UI 故障改写已经持久化的用户选择。

备选方案是另建 active pointer 文件并让 Manager 间接引用。它会产生两个 active 权威并需要新的跨文件一致性协议，因此拒绝。持久 journal 也不需要：commit 前只有旧 record 是 owner，commit 后只有新 record 是 owner，现有 canonical orphan recovery 可以从单一事实恢复。

### 4. 成功后不保留旧版本，清理失败是 post-commit pending cleanup

Manager replacement 成功后，旧 payload 已成为同 plugin key 下的 canonical non-active sibling。Host 立即尝试 no-follow 删除；删除失败不改变成功结论，commit result 返回 `cleanup_pending`，并记录有界安全诊断。后续受信任 installer 操作可重试 non-active orphan cleanup，启动 recovery 也必须删除所有能够证明未被当前 record 引用的 canonical sibling。

旧 payload 不进入 rollback catalog，不生成 previous pointer，也不保留供用户选择。若清理证据包含 symlink、异常名称、root escape 或与健康/quarantine facts 冲突，Host 必须保留证据、进入 degraded/unsafe 状态并拒绝可能覆盖它的写入。

备选方案是保留 current + previous。用户已明确拒绝成功后的显式回滚和多版本文件堆积，因此不采用。

### 5. Host facts 按明确规则继承，permission diff 只收缩 grants

replacement next registration 从当前健康 record 继承 Host-owned `source`、`enabled` intent 和 bounded diagnostics；独立 `data/<plugin-key>` 不创建、不删除、不修改。compatibility 从候选 Manifest 和当前 Host versions 重新计算，Runtime 保持或恢复为当前唯一支持的 `inactive`。

新 grant snapshot 定义为旧 `granted_permission_ids` 与候选 `requested_permissions.permission_id` 的集合交集，并保持排序唯一。候选新增权限仅进入 prepare result 的 `added_permission_ids`，绝不自动成为 grant；候选删除的请求同时从 next grant snapshot 移除并进入 `removed_permission_ids`。Publisher、source、版本升降或同版本重装均不改变这条规则。

Task 5.5/6.2 以后可以消费相同 permission diff 提供授权决策与 UI，但不得改变本 change 已提交 replacement 自动 grant 新权限。当前没有 Runtime session，因此此 change 不声明 session revoke 行为。

备选方案是保留全部旧 grants，可能让新 Manifest 获得已不再声明的能力；清空全部 grants 又会让无关替换不必要地撤销用户选择，因此都拒绝。

### 6. TypeScript service 复用现有 surface quiesce 和 revision convergence

prepare 不改变 Registry、Manager 或 revision。对于 `prepared`，可信 service 使用现有 current snapshot 验证 entry/revision，随后调用 Surface Projection 的 `quiesceProvider(plugin_id)`，按 Action→Page 撤销并关闭活跃 Page。quiesce 失败时 cancel preparation，不调用 commit，并从原 revision 恢复旧投影。

commit 失败时旧 Manager revision 不变，service cancel/丢弃 token 并从原 revision 恢复 Page→Action。commit 成功后 service 主动 refresh 并等待新 revision 的 Page→Action 投影。若 post-commit convergence 失败，new registration 仍是 durable active 版本；service 返回明确的 committed-but-not-converged 安全诊断和 committed revision，投影保持 fail closed，可通过完整 refresh 或 Launcher activation 恢复。

disabled 或不兼容的当前 registration 仍走相同 revision-safe replacement；quiesce 得到空 surface，next record 保留 enabled intent，候选因 prepare 已要求当前兼容而可按 next facts 决定 effective availability。opaque healthy entry identity 继续按 plugin ID 稳定，但 expected revision 防止旧请求覆盖并发变化。

本 change 只提供 typed adapter/service 和测试入口，不扩展设置页为完整管理 UI。Task 6.1 将负责选择目标、展示 from/to version、分类、权限差异、pending/success/error、双语文案、Semi theme、键盘和焦点体验。

### 7. 当前只验证 package identity 和完整性，不伪造签名状态

prepare 完整复用 package-format checksum、完整 `.lxp` SHA-256、Manifest、资源和兼容性检查。当前本地安装来源继续是 Host-owned `external`，没有 signature fact，也不因 Publisher 文本形成官方或可信 provenance。

Task 8.1 引入真实 signature/provenance 后，replacement prepare/commit 必须复验其 Host-owned facts；本 change 不增加占位 signature 字段、假 verified 结论或总是成功的签名检查。

## Risks / Trade-offs

- [两阶段 preparation 在磁盘短暂保留最大规格 payload] → 每进程只允许一个 preparation，复用硬上限，cancel/替换/失败时清理，崩溃后由 staging recovery 删除。
- [prepare 与 commit 之间发生并发 lifecycle 或另一替换] → commit 在共享锁内重新校验 entry、global expected revision、identity 和 staging，冲突使 token 失效且不触碰旧 record。
- [Manager 已切换但旧 payload 删除失败] → 返回 committed + `cleanup_pending`，以后续操作和启动 orphan recovery 重试；绝不为了清理失败切回旧 record。
- [Manager 已切换但前端投影失败] → 返回带 committed revision 的 convergence 诊断，surface fail closed，并通过完整刷新恢复；不把 UI 故障解释成 durable replacement 失败。
- [同版本不同 digest 可能隐藏不可预期的重构] → 明确分类为 reinstall 并展示 from/to version；仍完整校验 package、compatibility、permissions 和 identity。
- [允许较低版本可能读取较新的 plugin data] → 本 change 不运行代码或迁移 data；未来 Runtime/插件数据兼容政策必须单独定义，当前仅保留 data subtree 不变。
- [没有签名验证会被误解为可信更新] → contract/documentation 明确仅支持 unsigned local policy；来源、Publisher 和 digest 不产生 authenticity 结论。

## Migration Plan

1. 增加独立 replacement contract、共享 fixtures 和 Rust/TypeScript parser，不改变现有 installation、lifecycle 或 Registration wire contract。
2. 扩展 Plugin Manager revision-bound atomic replacement，并通过 write/flush/replace 故障注入证明旧 record 保持不变。
3. 增加 bounded preparation、staging revalidation、commit 和 non-active payload cleanup，再扩展启动/同进程 recovery 测试。
4. 接入 Tauri commands、TypeScript adapter/service 和现有 Surface Projection，验证 quiesce、失败恢复、post-commit convergence 与 event loss。
5. 更新英文架构文档及中文镜像、Roadmap 当前基线和 Task 状态，运行专用 gate 与完整验证。

现有 Manager record v1 和已安装 payload 无需迁移；它们直接成为 replacement 的 current registration。若回滚应用代码，已经完成 replacement 的 record 仍是合法 v1，旧版本已被清理且不要求恢复；残留合法 staging/non-active digest 由支持本 change 的版本清理，旧代码也只会按既有 orphan 规则保守处理。

## Open Questions

无。任意版本替换、失败恢复边界、成功后旧版本删除、permission grant 交集、两阶段 contract 和签名后置均已确认。
