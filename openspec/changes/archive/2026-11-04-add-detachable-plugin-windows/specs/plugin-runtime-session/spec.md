# Spec Delta

## MODIFIED Requirements

### Requirement: Host MUST derive every Runtime Session identity from current trusted facts
Host MUST 仅为当前有效、已启用且兼容的插件运行实例建立私有 Session。身份 MUST 由可信 Page、Registration、资源 generation、独立实例、Runtime attempt 与实际原生 WebView 来源共同派生；同一 plugin/Page 的多个实例 MUST 具有独立 Session。实例所属窗口是 Host 管理的可迁移归属，不能由插件选择，也不能仅以 plugin ID、Page ID 或当前焦点替代实例身份。

#### Scenario: Current Child WebView establishes a Session
- **WHEN** current trusted facts and the actual native source converge on one Runtime attempt
- **THEN** Host creates a read-only Session identity without exposing path, digest, scope, label, handle, origin token or native object

#### Scenario: Plugin self-reports another identity
- **WHEN** a bridge frame contains identity, source, Page, generation or authority fields
- **THEN** exact validation rejects it and no Session authority changes

#### Scenario: Legacy permission facts are presented
- **WHEN** a legacy Manifest, Registration payload or plugin message contains permission requests or grant fields
- **THEN** the current Contract or Registration boundary rejects or isolates those facts before Session identity is created
- **THEN** enabled, external, official, development or Publisher text creates no native Host authority

#### Scenario: Two instances of the same plugin Page establish independent Sessions

- **WHEN** 主窗口与一个独立窗口同时打开相同 plugin ID、Page ID 和 resource generation
- **THEN** Host MUST 为两者保留不同的实例、Runtime attempt、Session、原生来源、请求状态与 activation channel
- **THEN** 相同业务身份或请求序号 MUST NOT 使响应、事件、取消或关闭效果投递到另一个实例

#### Scenario: A plugin forges instance or window ownership

- **WHEN** 插件通过公共请求、桥接帧、Manifest 或页面数据提交 instance、window、Session、attempt 或 source 选择字段
- **THEN** 严格边界 MUST 拒绝该输入且不迁移、不认证、不关闭任何实例
- **THEN** 公共 Context、SDK 和 Host API MUST NOT 暴露实例标识、窗口句柄或私有租约

### Requirement: Relevant current-fact changes MUST revoke only the affected Session
Host MUST 按独立实例校验并撤销受影响 Session：关闭、重试、故障或实例内导航只影响对应实例；插件禁用、卸载、不兼容、隔离或 generation 换代 MUST 撤销该插件全部受影响实例。无关 Registration 修订、其他窗口导航和原实例的成功分离 MUST 保留仍有效的 Session；无法证明有效性时 MUST 对受影响实例 fail closed。

#### Scenario: Same-version plugin is replaced

- **WHEN** 插件以相同 plugin ID 和版本替换，但受影响实例的 resource generation、entry 事实或 Runtime attempt 已改变
- **THEN** Host MUST 立即撤销受影响旧 Session 的原生桥接绑定与来源租约；新 Runtime MUST NOT 继承旧来源租约、已消耗的 bridge freshness 或 Session 身份
- **THEN** 相同版本文本 MUST NOT 使旧 Session 或其原生来源继续有效

#### Scenario: Plugin becomes ineligible

- **WHEN** 插件被禁用、不兼容、隔离或移除，或实例的 Page、resource generation 或 Runtime attempt 已改变
- **THEN** Host MUST 撤销全部受影响 Session，并在原生桥接入口拒绝其旧 WebView 来源的迟到消息
- **THEN** 旧 permission 或 grant 字段 MUST NOT 覆盖当前 Host 事实

#### Scenario: Unrelated plugin changes Registration

- **WHEN** 其他插件安装、禁用、替换或 reload 提高了全局 Registration revision，但与当前实例 Session 相关的事实均未改变
- **THEN** Host MUST 保留该实例的原生 Child WebView、来源与导航租约、桥接绑定和 Session，不创建新的 bridge freshness 或重新执行就绪握手
- **THEN** 全局 revision MUST NOT 充当该实例的 generation 或 Session 身份

#### Scenario: Reading current facts races

- **WHEN** summary, detail, Page, and Resource descriptor revisions or related
  identities do not converge while creating or refreshing a Session
- **THEN** the Host does not establish or continue that Session and returns a
  bounded Host-private failure
- **THEN** the system does not fall back to cached detail, an old descriptor,
  author identity, or a relaxed origin

#### Scenario: Reconcile the current Session after Registration invalidation
- **WHEN** 存在插件 Session 时 Host 收到 Registration invalidation
- **THEN** Host MUST 按实例刷新并比较可信事实；entry 缺失、禁用、隔离、不兼容、身份或 Page 不匹配、resource origin/generation 变化以及 attempt、retry 或替换变化 MUST 撤销全部受影响 Session 的原生桥接绑定与来源租约
- **THEN** 全局 Registration revision 仅作为竞争检测与失效提示；无关插件变化且该实例的 entry、Page、version、origin、generation、attempt 与实际原生来源保持相同，MUST 保留原 Child WebView、桥接绑定和 Session
- **THEN** 合法分离仅更新 Host 管理的窗口归属，MUST NOT 冒充上述身份失效；无法证明相关事实仍有效时，Host MUST 对受影响实例 fail closed

#### Scenario: One window of a plugin closes or retries

- **WHEN** 实例 A 与 B 属于同一插件及 generation，而 A 关闭、失败或显式重试
- **THEN** 只有 A 的旧 Session、请求和 activation channel MUST 终止；B 的输入、Session、资源租约和进行中操作 MUST 保持有效
- **THEN** A 的重试 MUST 建立新 attempt，A 的旧响应或关闭效果 MUST NOT 命中 B 或 A 的新 attempt

#### Scenario: Plugin invalidation affects multiple detached windows

- **WHEN** 同一插件存在主窗口与多个独立窗口实例，且禁用、卸载、不兼容、隔离或新 generation 已提交
- **THEN** Host MUST 立即使该插件全部受影响旧 Session 失效并逐一清理，不能仅撤销当前焦点窗口
- **THEN** 无关插件 Session MUST 保留；失败或取消的变更在提交前 MUST NOT 撤销旧实例

### Requirement: Runtime Session MUST remain Host-private and process-local

Runtime Session 的实现与状态 MUST 保持 Host 私有且仅存于进程内，不持久化或导出给插件包。应用进程恢复 MUST 从 inactive 开始，不能恢复旧 Session；原实例分离不属于进程恢复。

#### Scenario: Application restarts after a ready Session
- **WHEN** 存在 ready Session 时应用退出、崩溃或重新启动
- **THEN** 新进程 MUST 仅恢复持久 Manifest/Registration 事实，并使用既有 Registration Contract 的 `inactive` 状态
- **THEN** 新进程 MUST NOT 反序列化或复用旧 Session 身份、bridge freshness、来源租约、window、Page 或消息状态

#### Scenario: Plugin attempts to import Session internals
- **WHEN** 官方、示例或外部插件通过 workspace 或包 exports 导入私有 Session 类型、wire 常量、window adapter 或来源租约
- **THEN** workspace/包边界 MUST 拒绝该依赖，实际公共 tarball MUST 不含这类入口
- **THEN** 公共 SDK transport MUST 不暴露 freshness、私有身份、origin、Window、MessagePort 或私有 envelope

#### Scenario: Recover process state without exporting Session internals
- **WHEN** 进程运行或恢复期间使用、保存或暴露 Session 契约与状态
- **THEN** Session 契约、parser、native bridge、来源绑定和状态 MUST 保持在可信 Host frontend/Rust 边界内，不能进入 Manifest、Registration payload 或 `@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-ui`、`@lensx/plugin-testkit` 与插件 workspace 的公共 API
- **THEN** Session、freshness、来源租约、window reference 与 call state MUST 不持久化；恢复后 Manager/Registration MUST 从 `inactive` 开始，不能推断或恢复旧进程 Session

### Requirement: Invalid Session input and diagnostics MUST fail closed without becoming an oracle

Session ingress MUST 校验精确、有界、版本化 payload，拒绝错误实际来源，终止当前来源提交非法 Session 输入的绑定，并从反馈与诊断中隐藏秘密和内部值。传输遵循原生 Child bridge 契约，不回退到 iframe 或 transferred MessagePort。

#### Scenario: Cross-plugin forged message
- **WHEN** 插件 B 或旧 WebView 仿造 A 的 ready frame，或猜测 plugin、version、Page 文本
- **THEN** A 的 Session/状态 MUST 不变，发送方不能获得预期 freshness、origin 或身份反馈
- **THEN** Host MUST 不执行 Host API、Registration mutation 或特权 Tauri command

#### Scenario: Current Port receives unknown version or invalid value
- **WHEN** 当前原生来源提交未知 carrier version、额外字段、超长值、非法结构或非法 ready frame
- **THEN** Host MUST 返回稳定、有界的私有失败并终止该 Session
- **THEN** 原异常和不可信内容 MUST 不进入用户反馈或后续 Session

#### Scenario: Validate a window or transferred-Port Session payload
- **WHEN** 解析、记录或呈现 Session ingress、诊断或测试证据
- **THEN** Host MUST 从 `unknown` 校验原生 bridge 输入的精确版本、字段类型、长度与允许值；错误实际来源不改变其他 Session，当前来源的非法或未知版本输入终止其 Session
- **THEN** UI、插件响应、日志 fixtures 与测试证据 MUST 不暴露 freshness、消息内容、预期 origin token、完整 capability URL、entry ID、grants、原 plugin payload、私有异常、stack、Tauri 或 Rust 对象

### Requirement: Delivery MUST deterministically validate Runtime Session source binding

Runtime Session 交付 MUST 使用确定性的来源绑定、parser、生命周期、fixture、bridge 与生产 composition 检查；不能把模型结果描述为观察到了真实 WebView 来源或 MessagePort transfer。

#### Scenario: Deterministic Session security matrix passes
- **WHEN** 正常与恶意 fixtures 执行 Session parser、状态机、生命周期 controller 和 bridge adapter
- **THEN** 只有模型中的当前 isolated-origin 原生来源与当前 attempt 的单次 freshness 能建立 ready Session
- **THEN** 错误来源、origin、跨插件、replay 与旧 bridge 绑定 MUST 以有界诊断失败

#### Scenario: Environment evidence is requested
- **WHEN** 完成要求依赖目标 WebView、native harness 或提交的 Session 环境证据
- **THEN** validation governance MUST 拒绝该路径
- **THEN** 系统不能弱化来源绑定或保留环境兼容 Gate

#### Scenario: Run deterministic Session binding and lifecycle acceptance
- **WHEN** 规划、执行或报告确定性 Session 来源绑定验收
- **THEN** Cargo/TypeScript 状态与 parser、React 生命周期、规范正常/恶意 `.lxp` fixtures、bridge adapter 与生产 composition MUST 覆盖实际来源/origin 校验、不可预测单次 freshness、native bridge 绑定、ready/disconnect/dispose、跨插件伪造、replay、retry/replacement、旧来源撤销、current-fact 失效、无关 Registration 稳定与零特权 Tauri 命中
- **THEN** 验证 MUST 不声称观察到了真实 WebView 来源或 Port transfer

## ADDED Requirements

### Requirement: Detaching the original instance MUST preserve Session continuity

成功分离 MUST 迁移原实例而不是建立替代实例。Host MUST 保持该实例的 Runtime attempt、document、Session、桥接握手状态、SDK 状态、请求序列及 activation channel，并原子更新可信窗口归属。分离和主窗口返回 Home MUST NOT 被解释为该实例的导航离开、关闭或 Host 协调器卸载。

#### Scenario: Detach a ready instance with ongoing operations

- **WHEN** 已就绪实例在存在输入、选区、撤销历史、Worker、待完成请求和 activation 订阅时成功分离
- **THEN** 原 document、Session、Worker、业务内存与请求 MUST 连续存在，不进行资源重解析、文档重载、SDK 初始化、Action 重放或 Session 重建
- **THEN** 后续响应和事件 MUST 仅交付给迁移后的同一实例，不能因主窗口回 Home 被取消

#### Scenario: Detachment migration fails

- **WHEN** 窗口建立、原生归属迁移或提交前校验失败，且补偿能够确认恢复原实例
- **THEN** Host MUST 保留或恢复原主窗口归属及原 Session，不创建替代 Session，也不保留第二个可操作副本
- **THEN** 晚到的迁移结果 MUST NOT 改写已恢复或已终止实例的身份

#### Scenario: Termination or generation invalidation arrives during detachment

- **WHEN** 分离与实例关闭、插件 generation 失效或应用退出竞争
- **THEN** 唯一有效的终止结果 MUST 使该实例不可复活，迁移回调不能重新授权旧 Session
- **THEN** 对其他仍有效实例的 Session、请求和窗口归属 MUST 不产生附带影响

#### Scenario: Compensation failure retains the original Session without relaxing source validation
- **WHEN** 原实例因补偿操作无法确认而进入 `recovery_required`
- **THEN** Host MUST 保留同一 document、Session、attempt、请求空间、activation channel、事务 token 与原始快照，不建立替代 Session，也不因该恢复状态自动销毁原实例
- **THEN** 仍有效的调用和数据结果 MUST 继续通过实际 native source、Session、generation 与独立来源租约校验；恢复快照、相同 plugin/Page 或推测窗口位置 MUST NOT 成为新权限或绕过失效
- **THEN** 归属敏感导航 MUST 冻结，明确恢复只重试原补偿；明确关闭、真实来源/插件失效或退出仍撤销受影响 Session 并清理，迟到恢复不得重新授权
