## ADDED Requirements

### Requirement: Development Mode MUST require build capability and explicit per-process opt-in

系统 MUST 仅在 native 与 frontend 构建均明确包含 Plugin Development Mode 能力时提供开发入口。即使构建包含该能力，每个应用进程启动时 Development Mode MUST 默认为关闭，只有 trusted Host settings 中的显式用户操作才能开启。native command MUST 独立检查 build capability 和当前 process-local 开关，frontend 可见性 MUST NOT 成为授权依据。正式构建 MUST 不注册 development Tauri commands、managed state 或 frontend 操作入口。

#### Scenario: 用户在支持该能力的构建中开启开发模式

- **WHEN** 当前构建同时包含 native/frontend development capability，且用户在 Host settings 中显式开启 Development Mode
- **THEN** 当前进程可以显示并调用开发目录 register 操作
- **THEN** 开启动作不注册插件、不读取目录、不授予权限，也不创建 Runtime

#### Scenario: 应用重新启动

- **WHEN** 一个曾经开启 Development Mode 的应用进程退出并重新启动
- **THEN** 新进程中的 Development Mode 为关闭
- **THEN** 先前的开关、目录 capability、开发注册、snapshot、scope 和 Runtime 状态均不恢复

#### Scenario: 正式构建受到检查

- **WHEN** release artifact gate 检查未包含 Plugin Development Mode 的正式构建
- **THEN** frontend bundle 不包含开发 UI 或 development command 调用，native binary 不注册 development commands 或 managed state
- **THEN** 手工构造 frontend 请求也不能启用模式、选择目录、注册、reload 或 remove 开发插件

### Requirement: Development registration MUST accept only one explicitly selected self-contained dist directory

register operation MUST 通过 Host-owned native folder picker 获得一次用户授权的目录，并 MUST 将该目录根视为自包含 `dist/`。Host MUST 只读取普通文件且不跟随 symlink，MUST 检查 portable path、case collision、文件数量、单文件和总大小限制、`manifest.json`、Manifest 语义、当前兼容性以及所有引用资源的完整性。Host MUST NOT 搜索父目录、读取项目 metadata、执行 build script、接受远程 URL 或把 frontend 提交的路径作为 authority。

#### Scenario: 注册有效且兼容的 dist

- **WHEN** 用户显式选择的目录包含有效兼容 Manifest、自包含 Runtime 和资源，且所有 entries 均为限制内的普通可移植文件
- **THEN** Host 可以进入 snapshot preparation，并返回仅含安全候选事实的结果
- **THEN** frontend、events、logs 和 Registration Contract 均不获得绝对源目录路径或文件内容

#### Scenario: 用户取消目录选择

- **WHEN** native folder picker 在未选择目录时关闭
- **THEN** operation 返回普通 cancelled 结果
- **THEN** 系统不创建 staging、snapshot、registration、revision、scope 或 Runtime

#### Scenario: 目录包含不安全或不完整内容

- **WHEN** 目录缺少 `manifest.json`/引用资源，包含 link、special file、绝对或碰撞路径、超限内容、无效 Manifest，或与当前 Host 不兼容
- **THEN** Host 以 stable bounded invalid 或 incompatible diagnostic 拒绝整个请求
- **THEN** 未受信任路径、原始 I/O 错误、文件 bytes 和部分 Manifest 事实不离开 native boundary

#### Scenario: 目录在读取期间变化

- **WHEN** root 或任一文件在授权、metadata 检查、读取或 snapshot copy 期间被替换、改变类型、增长、截断或变为 link
- **THEN** Host 返回可重试的 bounded `source_changed` 或 unsafe result，并且不发布 mixed generation
- **THEN** 现有 development registration 和 Runtime 若存在则保持当前

### Requirement: Host MUST publish only an immutable validated development snapshot

Host MUST 将授权目录复制到唯一 Host-owned staging generation，在 staging bytes 上完成全部内容验证，并在成功后通过同一文件系统上的 atomic rename 发布不可变 snapshot。snapshot identity MUST 使用 domain-separated、按排序 portable path 与 bytes 计算的 SHA-256，并 MUST 与 `.lxp` package digest 明确区分。Plugin Resource service 和 Runtime MUST 只读取当前已发布 snapshot，MUST NOT 直接读取持续变化的作者目录。

#### Scenario: 首次 snapshot 成功提交

- **WHEN** staging copy、完整验证、flush、atomic publish 和 Manager compare-and-commit 全部成功
- **THEN** Host 发布一个 `source=development`、`enabled=true`、Runtime `inactive` 且 grants empty 的 process-local registration
- **THEN** 当前 snapshot identity 和 resource generation 唯一绑定，staging path 不成为可执行 payload

#### Scenario: snapshot 提交前失败

- **WHEN** copy、验证、flush、rename 或 Manager compare-and-commit 在发布前失败
- **THEN** Host 尝试删除该请求的 staging/snapshot，并且不发布 registration、revision、generation 或 changed event
- **THEN** 同 ID 的既有 registration、snapshot、grant 和 Runtime authority 保持不变

#### Scenario: 已撤销 snapshot 的清理失败

- **WHEN** 新 generation 已提交或 development registration 已 remove，但旧 snapshot 不能立即删除
- **THEN** old scope/currentness 仍保持撤销，旧 snapshot bytes 不能重新获得 Resource 或 Runtime authority
- **THEN** Host 记录 bounded cleanup diagnostic 并仅在当前 process 的受限 development cache recovery 中重试

### Requirement: Development identity and source MUST remain Host-owned, process-local, and non-authoritative

development registration MUST 使用 Manifest plugin ID 参与与 builtin、external、quarantine 和其他 development entries 相同的全局唯一性检查。Host MUST 生成 `development` source；Manifest publisher 或其他作者字段 MUST NOT 设置 source，或产生 official、verified、signed、installed、trusted 或额外 permission 结论。development registration、源目录 capability、snapshot 与 grants MUST 只存在于当前进程，MUST NOT 写入 Plugin Manager Store。

#### Scenario: 已存在相同 plugin ID

- **WHEN** 选择的 Manifest plugin ID 已对应 builtin、external、quarantine 或 development identity
- **THEN** register 返回 stable conflict，而不是 shadow、upgrade、repair 或替换既有 entry
- **THEN** 既有 record、payload、snapshot、revision、grant 和 Runtime 保持不变

#### Scenario: 开发 Manifest 声称官方发布者

- **WHEN** 开发 Manifest 的 publisher 文本声称由 lensX 或其他可信组织发布
- **THEN** Registration 与设置页面仍将其标记为 Development、Unpacked 和 Unsigned
- **THEN** 该文本不改变 source、权限、Host API capability、CSP 或 Session 校验

#### Scenario: 进程异常退出

- **WHEN** 包含 development registration 的进程崩溃并由正式或开发构建重新启动
- **THEN** Plugin Manager Store 不恢复该 entry，正式注册记录不受影响
- **THEN** 受限 cache cleanup 可以删除可证明属于旧开发 session 的 residue，但不得猜测或删除其他路径

### Requirement: Manual reload MUST be atomic, revision-bound, and force a fresh Runtime generation

reload MUST 仅接受当前 development entry 的 opaque identity 和 expected Registration revision，并使用 Host 保存的源目录 capability 创建完整新 snapshot。成功 reload MUST 保持 plugin ID，原子替换完整 Manifest/payload facts，强制推进该 plugin 的 Registration revision 与 resource generation，并终止旧 Runtime attempt 后为仍处于当前导航目标的页面创建一个全新 attempt。即使 snapshot bytes 未变化，显式 reload 也 MUST NOT 被作为 no-op 忽略。系统 MUST NOT 自动 watch、自动 reload 或无限 retry。

#### Scenario: 修改后的开发插件成功 reload

- **WHEN** 当前 development entry 的新 `dist/` 通过验证且 expected identity/revision 仍然匹配
- **THEN** Host 原子发布新 snapshot、Manifest、revision 和 resource generation，并撤销旧 scope
- **THEN** 旧 iframe、Session、nonce、Port、listener、timer、pending work 和 handler authority 被清理，新的 Runtime attempt 重新完成 load 与握手

#### Scenario: 内容未变化但用户显式 reload

- **WHEN** 新 snapshot identity 与当前 snapshot 相同且用户显式请求 reload
- **THEN** affected plugin 仍获得新的 resource generation 和 Runtime attempt
- **THEN** 该行为不触发后台持续 retry，也不影响其他插件的 revision-bound authority

#### Scenario: 新内容无效或不兼容

- **WHEN** reload 的新目录内容在 snapshot commit 前变为 invalid、incompatible、unsafe 或 unreadable
- **THEN** Host 返回 bounded failure 并保留旧 Manifest、snapshot、generation、grants 和 Runtime 可用性
- **THEN** 失败的新 staging 不进入 Resource service 或 Registration projection

#### Scenario: reload 丢失 revision race

- **WHEN** reload preparation 期间 entry 被 disable、remove、grant mutation 或另一 reload 改变
- **THEN** compare-and-commit 返回 stable conflict 并删除未提交 snapshot
- **THEN** stale operation 不能覆盖当前 Manifest、payload、enabled、grants、revision 或 Runtime

#### Scenario: reload 改变 plugin ID

- **WHEN** 新 Manifest plugin ID 与当前 development entry identity 不同
- **THEN** reload 被拒绝且不会被解释为 remove 加 register
- **THEN** 当前 entry、snapshot、scope 和 Runtime 保持不变

### Requirement: Development reload MUST preserve only still-declared grants and never auto-grant new permissions

首次 development register MUST 使用空 grant snapshot。reload MAY 保留旧 Manifest 和新 Manifest 都声明的现有 grants，MUST 删除新 Manifest 已不声明的 grants，并 MUST 让新增 permission requests 保持未授权。development source、local directory 和 reload 操作 MUST NOT 绕过现有 permission confirmation、Host API capability 或 dispatcher currentness。

#### Scenario: reload 新增 permission request

- **WHEN** 新 Manifest 声明旧 generation 中不存在的 permission request
- **THEN** 新 registration 显示该 request 但 grant/effective state 为未授权
- **THEN** 插件必须经过现有 Host-owned用户授权流程后才能调用对应 Host API

#### Scenario: reload 删除已授权 permission

- **WHEN** 新 Manifest 不再声明旧 generation 中已授权的 permission ID
- **THEN** commit 从新 grant snapshot 中删除该 ID，并使旧 Session/capability 失效
- **THEN** 后续再次声明该 ID 不会自动恢复旧 grant

### Requirement: Disable and remove MUST quiesce development authority without deleting plugin data

关闭 Development Mode MUST 在返回成功前 remove 当前进程中的全部 development registrations，并通过既有 lifecycle terminal operation 撤销其 Runtime/Resource authority。单 entry remove MUST 使用 revision-bound identity 删除 development registration 和 snapshot。两者 MUST NOT 删除 plugin-scoped data、Launcher recent/pinned collections、正式 package 或其他插件内容。

#### Scenario: 用户 remove 一个开发插件

- **WHEN** 当前 development entry 的 remove 通过 identity/revision 检查并成功提交
- **THEN** Registration、Page/Action projection、Resource scope 和 Runtime attempt 被撤销，snapshot 进入安全清理
- **THEN** plugin data 和 Launcher collections 保留，且操作不被显示为正式 package uninstall

#### Scenario: 用户关闭 Development Mode

- **WHEN** 当前进程存在一个或多个 development entries 且用户关闭会话开关
- **THEN** Host 先按确定顺序 quiesce/remove 所有开发 entries，再报告 Development Mode 已关闭
- **THEN** 任何失败都以 bounded partial/convergence diagnostic 呈现，frontend 不提前声称全部能力已撤销

### Requirement: Development execution MUST use the exact formal Runtime and permission boundaries

development entry MUST 使用现有 Page/Action projection、scoped Resource service、isolated origin、iframe sandbox、Host-owned CSP、Runtime Session、SDK transport、Host API dispatcher、permission core、deadlines、crash breaker 和 single-iframe policy。任何 development source、开关或本地路径事实 MUST NOT 建立例外。public Contract、SDK、UI、Testkit、CLI 和插件代码 MUST NOT 获得 Development coordinator、source path、snapshot、native command 或 Manager internals 的导入/API。

#### Scenario: 开发插件尝试伪造或扩大 authority

- **WHEN** development iframe 自报其他 plugin ID、使用旧 nonce/scope、跨 origin/window 发送消息、调用未授权 Host API 或请求 CSP/Permissions Policy 之外的能力
- **THEN** 正式 Session、Resource、dispatcher、permission 或 browser policy 以相同稳定语义拒绝请求
- **THEN** development source 不改变错误、grant、handler hit 或恢复结果

#### Scenario: 公共 package 边界受到检查

- **WHEN** workspace boundary 和真实 tarball consumer 检查 Contract、SDK、UI、Testkit、CLI、official/example plugins
- **THEN** 它们不导入或打包 Host-private Development Mode source、command、path、snapshot 或 Manager internals
- **THEN** Plugin Developer CLI 仍只声明内容验证能力，不声明 Host 安装、Development Mode、来源或授权成功

### Requirement: Delivery MUST prove safe directory handling, atomic reload, production exclusion, and real Runtime teardown

交付 MUST 组合 Rust directory/snapshot/Manager/Resource tests、TypeScript contract/service tests、React accessibility/i18n/theme tests、共享 directory corpus、workspace/release boundary gates和目标 macOS WebView evidence。验证 MUST 覆盖 valid、invalid、incompatible、cancel、source race、link、limit、collision、reload success/failure/conflict、unchanged reload、permission delta、disable/remove、cleanup failure、process restart、正式 build exclusion，以及旧 generation 零残余 authority。

#### Scenario: focused development-mode gate 完整通过

- **WHEN** `check:plugin-development-mode` 在受支持环境执行全部 focused、boundary、release artifact 和真实 WebView矩阵
- **THEN** CLI/Host 对共同 payload 语义的结论一致，所有开发事务与 UI 要求通过
- **THEN** reload 后旧 scope、iframe、Session、Port、listener、timer、pending RPC 和 privileged handler authority 均不可用，新 generation 使用未放宽的正式策略成功握手

#### Scenario: 任一安全或正式构建不变量无法证明

- **WHEN** 目录 currentness、snapshot 原子性、source distinction、permission non-escalation、terminal cleanup、production exclusion 或跨层 contract drift 任一项无法被要求的证据证明
- **THEN** Task 6.5 保持未完成并修正规范/设计/实现
- **THEN** 验证不得通过直接读取作者目录、放宽 Runtime、隐藏失败、移除负例或仅检查源码文本来替代缺失证据
