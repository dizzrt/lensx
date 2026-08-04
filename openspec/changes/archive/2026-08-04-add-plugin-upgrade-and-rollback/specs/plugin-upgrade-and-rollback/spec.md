## ADDED Requirements

### Requirement: Plugin replacement MUST use a private two-stage Host contract

系统 MUST 提供独立版本的 Host-private Plugin Replacement Contract，并通过严格 Tauri commands 只向可信 lensX 根应用暴露 prepare、commit 和 cancel。该 contract 必须与首次安装、Registration read、lifecycle、Manifest、package 和 Manager Store 版本独立。请求、结果和错误必须在 Rust 与 TypeScript 两侧从 `unknown` 完整校验，不得成为 Manifest、公共 plugin package、iframe Runtime 或 SDK 能力。

#### Scenario: Trusted application prepares and commits a replacement

- **WHEN** 根应用以当前健康 `entry_id` 和 `expected_revision` prepare 一份本地 `.lxp`，随后用 Host 返回的 opaque token 提交
- **THEN** Host 通过独立 replacement contract 完成检查、surface 协调和 revision-bound commit
- **THEN** plugin code 和公共 package 无法导入或调用该写入边界

#### Scenario: Replacement payload contains private or unknown fields

- **WHEN** request、result 或 error 缺少 contract version、包含未知字段、错误类型、路径、digest、Store key、包 bytes、函数或 Host object
- **THEN** 对应边界拒绝完整 payload并返回稳定安全错误
- **THEN** Manager、Registry、文件系统、revision 和 changed event 不因非法 payload 改变

### Requirement: Preparation MUST inspect one immutable local package without changing active state

prepare MUST 通过 Rust-owned pathless 文件选择读取一个本地 `.lxp`，取消选择必须返回普通 `cancelled`。Host 必须复用现有受限 source read、package inspection、Manifest、resource、checksum、完整 package SHA-256 和当前 Host compatibility 校验；只有 `compatible` 候选可以进入 installer-owned staging。prepare 必须确认候选 `plugin_id` 与目标健康 registration 相同，并且不得修改 Manager、active payload、grant、Registry、revision、event 或 plugin data。

#### Scenario: User cancels local package selection

- **WHEN** 用户在 prepare 的原生单文件选择器中取消
- **THEN** Host 返回 `cancelled` 而不是错误
- **THEN** 不创建可提交 token、staging、Manager mutation、revision 或 event

#### Scenario: Candidate package is invalid, incompatible, or belongs to another plugin

- **WHEN** 候选包无效、与当前 lensX/Host API 不兼容，或其 normalized `plugin_id` 与目标 registration 不同
- **THEN** prepare 返回稳定的 invalid、incompatible 或 identity mismatch 结论
- **THEN** 当前 record、payload、surface、grant 和 data 保持不变且不发布 token

#### Scenario: Compatible candidate is prepared

- **WHEN** 候选包有效、兼容、identity 匹配且当前 entry/revision 可验证
- **THEN** Host 在受限 staging 中提取并核对候选，返回 opaque token、entry ID、当前/候选版本、replacement 分类和 permission diff
- **THEN** 响应不包含源路径、staging/安装路径、package digest、包 bytes 或原始系统错误

### Requirement: Version ordering MUST classify but not forbid explicit local replacement

系统 MUST 按当前与候选 package identity 将操作分类。相同完整 package digest 必须为 `duplicate`；候选 SemVer 更高必须为 `upgrade`，更低必须为 `downgrade`，SemVer 相同但 digest 不同必须为 `reinstall`。用户显式选择的 valid、compatible、same-plugin 本地 package 必须允许以 upgrade、downgrade 或 reinstall 进入 commit；版本顺序不得成为拒绝条件。异常 identity 或存储证据不得伪装成 reinstall。

#### Scenario: Exact package is selected again

- **WHEN** 当前与候选使用相同 `plugin_id`、version 和完整 package digest
- **THEN** prepare 返回 `duplicate` 并且不创建 commit token
- **THEN** Manager record、revision、event、surface 和文件系统保持不变

#### Scenario: Lower compatible version is selected explicitly

- **WHEN** 用户选择同一 plugin ID、SemVer 低于当前版本且与当前 Host 兼容的本地包
- **THEN** prepare 将其分类为 `downgrade` 并允许进入相同 commit 流程
- **THEN** Host 不把显式本地选择误判为被禁止的静默自动降级

#### Scenario: Same version has different complete bytes

- **WHEN** 当前与候选 plugin ID 和 SemVer 相同但完整 package digest 不同
- **THEN** prepare 将其分类为 `reinstall` 并继续执行全部校验
- **THEN** Host 不原地覆盖当前 payload，也不跳过 permission、identity 或 compatibility 检查

#### Scenario: Package identity evidence conflicts

- **WHEN** record key、Manifest plugin ID、canonical installation path、recorded digest 或候选 facts 互相不一致
- **THEN** Host 返回稳定 identity/unsafe-state 错误并保留异常证据
- **THEN** 该冲突不能作为 upgrade、downgrade、reinstall 或 quarantine repair 提交

### Requirement: Preparation tokens MUST be bounded, opaque, and revision-bound

每个 Host 进程 MUST 最多持有一个有效 preparation。token 必须由 Host 生成、仅绑定当前进程中的目标 entry、expected revision、候选 staging 和已检查 facts，并且不得跨重启恢复。新的 preparation、显式 cancel、失败 commit 或 service destroy 必须尽力清理原 preparation；崩溃遗留的合法 staging 必须由启动 recovery 删除。commit 必须在共享锁内重新验证 token、当前 revision、identity、staging 类型和内容，不得依赖锁外旧结论。

#### Scenario: Another preparation already exists

- **WHEN** 当前进程已有未取消的 preparation 而调用方开始另一 prepare
- **THEN** Host 返回稳定 `busy`，直到调用方显式 cancel 当前 preparation
- **THEN** 两份候选不能同时提交、覆盖彼此 staging 或造成无界磁盘保留

#### Scenario: Revision changes after preparation

- **WHEN** prepare 后另一 lifecycle 或 replacement operation 改变 Registration revision
- **THEN** commit 拒绝 stale token、清理其 staging并要求调用方从完整最新 snapshot 重新开始
- **THEN** 旧 preparation 不覆盖并发提交的 enabled、grant、Manifest、payload 或 diagnostics

#### Scenario: Process exits before commit

- **WHEN** Host 在 prepare 成功后、commit 前退出或崩溃
- **THEN** token 在新进程中无效且 startup recovery 删除符合约束的 abandoned staging
- **THEN** 旧 active record 和 payload 继续恢复，不产生伪造 revision 或半完成 replacement

### Requirement: Commit MUST atomically replace the single active registration

commit MUST 与 installation、enable/disable、uninstall 和 recovery 共用同一进程及跨进程 serialization boundary。Host 必须先重新验证 preparation，将候选从 staging 原子移动到同一 plugin key 下新的 canonical digest sibling并 flush，再以同一 `plugin_id`、entry 和 expected revision 原子替换完整 Manager record。Manager record 中的 Manifest、installation path 和 package digest 必须是唯一 active pointer；不得新增第二个 active pointer、发布 staging path 或同时发布多个健康版本。

#### Scenario: Replacement commits successfully

- **WHEN** candidate commit、Manager record persistence 和内存 publication 全部成功
- **THEN** snapshot/detail 以一个新 revision 只返回候选 Manifest 和 Host facts，且安装路径只指向已提交候选 payload
- **THEN** Host 发送现有 Registration changed invalidation event，消费者无需重启即可完整刷新

#### Scenario: Candidate commit fails before Manager replacement

- **WHEN** staging revalidation、rename、flush 或 Manager record create/write/flush/atomic replace 失败
- **THEN** Host 不发布新 record、revision 或 event，并删除候选或将其留作可证明的 orphan
- **THEN** 旧 record、旧 active payload、grants、enabled intent、diagnostics 和 plugin data 保持不变

#### Scenario: Another process holds the commit boundary

- **WHEN** installation、lifecycle、recovery 或 replacement 已持有共享提交锁
- **THEN** 并发 commit 按定义的串行顺序等待或返回稳定 `busy`
- **THEN** 它不会清理、替换或注册另一操作的 staging、payload、data 或 Manager state

### Requirement: Replacement MUST preserve and safely narrow Host-owned state

next registration MUST 继承当前健康 record 的 Host source、enabled intent 和 bounded diagnostics，必须保持独立 `data/<plugin-key>` subtree 不变，并必须让 Runtime 为 `inactive`。compatibility 必须从候选 Manifest 与当前 lensX/Host API 版本重新计算。next grants 必须精确等于旧 granted-permission IDs 与候选 requested-permission IDs 的集合交集；新增 permission request 不得自动获得 grant，删除的 request 不得留下 grant。Publisher、版本方向、本地来源或所谓官方声明不得改变这些规则。

#### Scenario: Candidate adds and removes permission requests

- **WHEN** 候选 Manifest 增加一个新 permission request、保留一个已授权 request并删除另一个已授权 request
- **THEN** prepare 报告确定性的 added/removed permission diff，next registration 只保留仍被请求的旧 grant
- **THEN** 新请求保持未授权，被删除请求的 grant 被移除，且 replacement 不执行授权交互

#### Scenario: Enabled plugin is replaced by a compatible candidate

- **WHEN** 当前健康 registration 的 enabled intent 为 true且 replacement 成功
- **THEN** next registration 保持 enabled intent、source 和 data boundary，重新计算 compatibility并以 Runtime `inactive` 发布
- **THEN** 当前版本方向和 Publisher 文本不产生额外 trust、provenance 或 permission

#### Scenario: Disabled plugin is replaced

- **WHEN** 当前健康 registration 的 enabled intent 为 false且 replacement 成功
- **THEN** next registration 继续为 disabled且不投影 Action/Page
- **THEN** replacement 不把选择本地包解释成 enable 操作

### Requirement: Trusted application MUST quiesce and converge plugin surfaces around commit

对于 prepared replacement，可信 TypeScript service MUST 在调用 Rust commit 前从当前 snapshot 验证目标 entry/revision，并通过现有 Surface Projection 按 Action→Page 撤销 provider；Page 撤销必须关闭当前活跃插件页面。quiesce 失败不得调用 commit。commit 失败后 service 必须从原 revision 完整恢复 Page→Action；commit 成功后必须主动刷新并等待 committed revision 的 Page→Action 收敛。

#### Scenario: Enabled plugin replacement succeeds

- **WHEN** 当前插件有已投影 Action/Page 且 quiesce、Rust commit 和新 revision projection 均成功
- **THEN** 旧 Action/Page 在 durable replacement 前撤销，活跃 Page 返回安全 Host 页面
- **THEN** 新 Manifest 的 Page batch 先于 Action batch 发布，旧 descriptors 不再可 dispatch

#### Scenario: Surface quiescence fails

- **WHEN** Action 或 Page provider batch 无法完整撤销
- **THEN** service cancel preparation、恢复原 revision projection并且不调用 Rust commit
- **THEN** Manager、active payload、revision 和 event 保持不变

#### Scenario: Rust commit fails after quiescence

- **WHEN** surface 已撤销但 candidate 或 Manager commit 失败
- **THEN** 旧 durable registration 保持 active，service 以原 revision 恢复 Page→Action projection
- **THEN** 失败结果不声称新版本已安装

#### Scenario: Projection fails after durable commit

- **WHEN** Manager replacement 已成功但 refresh、detail mapping 或 Registry replacement 失败
- **THEN** new registration 保持 durable active，service 返回包含 committed revision 的安全 convergence 诊断且 surface fail closed
- **THEN** 完整 refresh、listener recovery 或 Launcher activation 可以收敛；Host 不因前端故障切回已删除目标的旧版本

### Requirement: Successful replacement MUST remove the old payload without retaining rollback history

Manager replacement 成功后，Host MUST 尝试删除旧 canonical payload，并且不得创建 previous pointer、rollback catalog、版本历史或多 active-version 状态。立即删除失败必须返回 committed success 与 `cleanup_pending`，而不是把 durable replacement 报告为失败。后续受信任 installer 操作和 startup recovery 必须仅删除能够证明未被当前健康 record 或 quarantine identity 拥有的 canonical non-active sibling；异常或不安全证据必须保留并使相关写入失败关闭。

#### Scenario: Old payload cleanup succeeds

- **WHEN** Manager record 已指向候选 payload且旧 canonical payload 可安全删除
- **THEN** replacement 返回 committed success 与 complete cleanup
- **THEN** plugin key 下不保留供主动 rollback 或版本选择使用的旧 payload

#### Scenario: Old payload cleanup is interrupted

- **WHEN** Manager replacement 已成功但进程在删除旧 payload 前退出，或删除暂时失败
- **THEN** new record 和 new payload 保持 active，结果或恢复诊断表示 cleanup pending
- **THEN** 下一次安全 recovery 删除未被 active record 引用的旧 canonical sibling而不触碰 current payload或 plugin data

#### Scenario: Cleanup evidence is unsafe

- **WHEN** non-active entry 是 symlink、异常名称、root escape，或与健康/quarantine ownership facts 冲突
- **THEN** Host 不跟随、不删除也不猜测其归属，并记录有界安全诊断
- **THEN** 可能覆盖该证据的 replacement/install/lifecycle write 失败关闭

### Requirement: Task 3.4 MUST not deliver later update, trust, Runtime, permission UI, or rollback capabilities

本能力 MUST 只交付本地 package prepare/commit/cancel、任意版本分类、单 active record replacement、提交前失败恢复、Host fact 继承、surface 收敛和成功后旧 payload 清理。它不得下载远程包、自动检查更新、提供主动 rollback、多版本历史、运行候选代码、根据 Runtime 健康回滚、迁移 plugin data、授予新增权限、显示完整管理/授权 UI、验证真实签名或修复 quarantine。当前 unsigned local policy 必须继续把 source、Publisher、package digest 和 permission request 视为相互独立的 facts。

#### Scenario: Local replacement completes before later milestones

- **WHEN** 本 change 在 Runtime、Permission Management、management UI 和 signing changes 之前完成
- **THEN** 可信 Host infrastructure 可以安全替换同 identity 的本地兼容 package，且失败不会破坏旧 active version
- **THEN** plugin code 仍不执行，新增 permissions 仍未授权，也不存在 remote update、signature trust 或用户主动 rollback

#### Scenario: Publisher claims a trusted or official source

- **WHEN** 候选 Manifest Publisher 文本声称官方或已验证身份
- **THEN** replacement 仍沿用当前 Host-owned local external source policy 并执行相同 package、identity、permission 和 cleanup 校验
- **THEN** 该声明不创建 signature status、trusted provenance、grant 或 lifecycle 例外
