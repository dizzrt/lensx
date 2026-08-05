## ADDED Requirements

### Requirement: Host permission catalog MUST be closed, risk-classified, and Contract-aligned

系统 MUST 提供一个 Host-private、复制并冻结的 permission catalog。首版 catalog MUST 只包含公共 Host API `0.1.0` 已声明的 `clipboard.read` 与 `clipboard.write`；每项 MUST 包含稳定 permission ID、`standard | sensitive` 风险等级、精确 method 集合和当前平台支持状态。两个首版权限 MUST 均标记为 `sensitive`，但风险等级 MUST 只作为后续可信 Host 交互的展示/策略元数据，MUST NOT 自行形成 grant。

method-to-permission 映射 MUST 从公共 `@lensx/plugin-contract` Host API catalog 派生并通过 drift gate 校验。官方来源、Publisher 文本、Manifest reason、builtin 状态、命名约定或未知字符串 MUST NOT 增加 catalog 项、改变风险等级或获得隐藏 method。

#### Scenario: Host enumerates the first permission catalog

- **WHEN** 可信 Host consumer 读取当前 permission catalog
- **THEN** 它只得到按 permission ID 稳定排序的 `clipboard.read` 与 `clipboard.write`
- **THEN** 两项均为 `sensitive`，且各自只映射到同名 Host API method

#### Scenario: Contract and Host catalog drift

- **WHEN** 公共 Host API catalog 的 permission requirement 与 Host-private catalog 不再精确一致
- **THEN** permission drift gate 失败
- **THEN** 未经独立 OpenSpec 变更的 method 或 permission 不会进入生产授权路径

#### Scenario: Official plugin requests an unknown permission

- **WHEN** 官方或外部插件的 Manifest 请求 `files.read`、`network.request` 或其他当前 catalog 外权限
- **THEN** Host 将该请求判定为 unsupported
- **THEN** 来源、Publisher 或命名相似性不会创建 grant 或 capability

### Requirement: Effective permission state MUST keep requests, support, grants, and Sessions separate

系统 MUST 从当前 normalized Manifest request、Host catalog/support、持久化 grant snapshot 与当前 Session identity 分层派生权限结论。Host-private permission view MUST 能区分 `not_requested`、`unsupported`、`not_granted` 与 `granted`；其中只有 `granted` 才表示已请求、当前支持且持久 grant 存在。缺失 grant、拒绝或未来 UI 的“稍后决定”在本 capability 中 MUST 都是 `not_granted`，不得伪造额外授权历史。

Manifest 的本地化 reason MUST 保持 author-controlled 展示事实；`en-US`、`zh-CN`、来源、版本或 reason 内容 MUST NOT 影响有效状态。Session capability snapshot MUST 只是当前可调用 method 的发现结果，MUST NOT 替代持久 grant 或逐调用授权。

#### Scenario: Manifest requests a supported permission without a grant

- **WHEN** Manifest 请求 `clipboard.read`，当前 Host 支持该权限，但 grant snapshot 为空
- **THEN** permission view 返回 `not_granted`
- **THEN** Manifest request 和本地化 reason 不会自动进入 Session capabilities

#### Scenario: Persisted grant is no longer declared or supported

- **WHEN** record 中残留一个当前 Manifest 未请求或当前 Host 不支持的 grant ID
- **THEN** effective permission 不得为 `granted`
- **THEN** 该残留事实不能授权 method、native effect 或新 Session

#### Scenario: Current supported grant becomes a Session capability

- **WHEN** Manifest 请求对应权限、Host/native provider 当前支持、持久 grant 存在且新 Session identity 绑定同一当前 Registration revision
- **THEN** 对应 clipboard method 可以进入该 Session 的 capability snapshot
- **THEN** Context 不暴露 raw grant、Manifest reason、source 或 Registration identity

### Requirement: Grant mutations MUST be trusted, revision-bound, and fail closed

系统 MUST 提供版本化、严格解析、Host-private 的单 permission grant/revoke boundary。每个 mutation MUST 绑定精确 `entry_id` 与 `expected_revision`。授予 MUST 只接受 healthy Registration 当前 Manifest 已请求且当前 Host 支持的 permission；撤销 MUST 能删除当前 grant，即使该 permission 后来变为 undeclared 或 unsupported。插件 iframe、Manifest、SDK request 或 source MUST NOT 直接调用或影响该 authority boundary。

成功变化 MUST 原子持久化完整规范化 grant snapshot、推进 Registration revision 并发布既有 invalidation event。相同目标状态 MUST 返回 `unchanged` 且不推进 revision。错误 MUST 使用稳定安全 code/message，并且不泄漏 grant set、Manifest reason、路径、payload、原始异常或 Host/Rust 对象。

#### Scenario: Trusted Host grants a requested permission

- **WHEN** 可信 Host caller 使用当前 entry/revision 授予 Manifest 已请求且 Host 支持的 `clipboard.read`
- **THEN** Manager 原子持久化包含该 ID 的排序去重 grant snapshot，并返回新 revision
- **THEN** mutation 发布 Registration invalidation，但不直接热授权旧 Session

#### Scenario: Trusted Host revokes a permission

- **WHEN** 可信 Host caller 使用当前 entry/revision 撤销已持久化 permission
- **THEN** Manager 原子删除该 grant、推进 revision 并发布 invalidation
- **THEN** revoke 返回后任何后续调用都不能继续依赖旧 grant

#### Scenario: Caller grants an undeclared or unsupported permission

- **WHEN** caller 尝试授予 Manifest 未请求、Host 不支持或 catalog 未声明的 permission
- **THEN** mutation 以稳定错误失败
- **THEN** 内存、磁盘、revision、event 和其他 grants 保持不变

#### Scenario: Mutation is stale or persistence fails

- **WHEN** `expected_revision` 已过期，或临时文件创建、写入、flush、原子替换失败
- **THEN** mutation 以稳定 conflict 或 persistence error 失败
- **THEN** 上一次成功的内存与磁盘 grant snapshot 保持一致，且不发布新 revision

#### Scenario: Mutation repeats the current state

- **WHEN** caller 再次授予已授予 permission，或撤销当前不存在的 permission
- **THEN** boundary 返回 `unchanged`
- **THEN** 不重写 record、不推进 revision、不重启 Session

### Requirement: Every permission-backed call MUST reauthorize against current Host facts

每次 `clipboard.read` 或 `clipboard.write` 在 native effect 前 MUST 重新验证 Contract method requirement、当前 Registration revision/identity、Manifest request、Host support、真实持久 grant、provider availability 与 Session currentness。插件提供的 identity、grant、source、capability 或 permission 字段 MUST 被拒绝或忽略；冻结 Session grant snapshot 和先前 Context MUST NOT 成为持久 credential。

grant mutation 与 clipboard native effect MUST 共享一个 Host-owned 线性化协调边界。若 effect 先取得边界，则后到 revoke 在线性化顺序上发生于 effect 之后；一旦 revoke 返回，后续 effect MUST 观察新状态。Dispatcher MUST 在异步边界前后继续检查 cancellation/currentness，旧 Port 的 late result MUST 被丢弃。

#### Scenario: Authorized current Session calls clipboard

- **WHEN** 当前 Session 调用与其 Manifest request、Host support 和持久 grant 一致的 clipboard method
- **THEN** Rust 在 native effect 前重新确认当前 Registration 和 grant
- **THEN** 只执行一次对应纯文本 operation

#### Scenario: Context is stale after revoke

- **WHEN** 插件先发现 clipboard capability，随后 grant 被撤销，再使用旧 Context 或旧 Session 发起调用
- **THEN** 调用在 native effect 前以 `permission_denied`、`unavailable` 或 terminal disconnect 失败
- **THEN** Host 不读取、不写入也不返回 clipboard text

#### Scenario: Official source attempts to bypass authorization

- **WHEN** official、builtin 或 Publisher-claimed plugin 缺少 Manifest request 或真实 grant
- **THEN** 它与外部插件得到相同 `permission_denied` 结论
- **THEN** source 不跳过 catalog、Registration、grant 或 Session 检查

#### Scenario: Revoke races with a clipboard effect

- **WHEN** clipboard effect 与 revoke 并发到达 Host coordinator
- **THEN** 两者形成单一可观测线性顺序
- **THEN** revoke 返回后不会再有使用旧 grant 新开始的 native effect

### Requirement: Clipboard provider MUST expose only bounded plain text through a narrow native boundary

macOS 生产 Host MUST 通过窄 Rust/AppKit provider 实现系统通用 pasteboard 的纯文本 read/write，并 MUST NOT 注册通用 clipboard plugin、放开 iframe 浏览器 Clipboard API 或暴露原生对象。读取 MUST 只返回 Contract-valid、有界 string；空或非文本 clipboard MUST 返回空 string。写入 MUST 接受 Contract-valid、有界 string，且空 string MUST 能替换/清除纯文本。`clipboard.read` 与 `clipboard.write` MUST 使用各自独立 permission，任一 grant MUST NOT 隐含另一个。

native failure、超限内容或不可用平台 MUST fail closed，并分别映射到稳定 `internal_error`、`limit_exceeded` 或 `unavailable`。clipboard text、格式列表、文件、图片、路径、原始 native error 和 stack MUST NOT 进入诊断或日志。非 macOS Host MUST 不发布 clipboard capability，并稳定返回 `unavailable`。

#### Scenario: Authorized plugin reads empty or text clipboard

- **WHEN** 已授权当前 Session 在 macOS 调用 `clipboard.read`，系统 clipboard 为空、非文本或包含有界纯文本
- **THEN** Host 分别返回空 string 或完整 Contract-valid text
- **THEN** 结果不包含 native type、格式列表、文件或图片

#### Scenario: Write grant does not authorize read

- **WHEN** Session 只有有效 `clipboard.write` grant，却调用 `clipboard.read`
- **THEN** Host 返回 `permission_denied`
- **THEN** native provider 不读取 clipboard

#### Scenario: Native clipboard text exceeds the public bound

- **WHEN** 系统 clipboard 的纯文本超过 Host API Contract 的 `BoundedText` 上限
- **THEN** read 返回稳定 `limit_exceeded`
- **THEN** Host 不截断、不返回部分文本，也不记录原始内容

#### Scenario: Clipboard is unavailable on the platform

- **WHEN** Host 运行在未交付 native provider 的平台
- **THEN** Context 不包含两个 clipboard capabilities
- **THEN** 防御性调用返回稳定 `unavailable` 且不存在 browser/native fallback

### Requirement: Grant changes MUST invalidate only affected Runtime authority

成功 grant/revoke MUST 通过既有 Registration revision 与 invalidation 流程使受影响插件的旧 Runtime descriptor、Session、Port、Dispatcher binding 和 pending calls 失效。grant MUST NOT 通过 `runtime.context_changed` 热注入旧 identity；只有基于新 Registration detail 创建的新 Session 才能得到新 capability。撤销 event 即使延迟或发送失败，每次调用的 Rust current-revision 检查仍 MUST 阻止旧 authority。

与目标插件无关的 Registration 变化 MUST NOT 因 permission coordinator 而撤销其他插件的当前 Session、grant 或 clipboard operation。

#### Scenario: Grant changes while plugin Page is active

- **WHEN** 当前插件 Page 活跃时 grant/revoke 成功提交
- **THEN** 旧 Session 不能获得热更新 authority，并通过既有 lifecycle 收敛到终止
- **THEN** 新 Session 只从新 revision 和实际 grant snapshot 计算 capabilities

#### Scenario: Registration event delivery fails

- **WHEN** grant mutation 已持久化并推进 revision，但 invalidation event 发送失败或监听恢复尚未完成
- **THEN** mutation 仍报告真实 committed revision
- **THEN** 旧 Session 的下一次 permission-backed call 因 Rust currentness 检查而 fail closed，后续完整 refresh 可收敛 lifecycle

#### Scenario: Another plugin changes

- **WHEN** 其他插件安装、禁用、替换或修改 grants，而当前插件 identity、revision 与 grant snapshot 保持不变
- **THEN** 当前插件不会被 permission service 错误授权、撤销或执行 native effect
- **THEN** compare-current 逻辑保持其 Session 生命周期不变

### Requirement: Task 5.5 MUST not deliver permission UI or broader privileged APIs

本 capability MUST 只交付 Host-private catalog、grant/revoke authority、逐调用授权、Session invalidation 集成、窄纯文本 clipboard provider、测试和双语维护文档。它 MUST NOT 交付安装/升级 prompt、设置页、用户决策历史、管理 UI、文件/网络/Shell/进程/外链权限、通用 Tauri executor、Task 5.6 RPC resource limits、模板、CLI、签名或 Marketplace。

本 change 不新增产品 UI，因此 MUST 不新增未经 i18n 的用户文案，也不存在新的键盘、焦点、主题或 accessibility surface。后续 Task 6.2 MUST 通过本 capability 的可信 Host boundary 控制 grant，而不能复制 Manager 逻辑或让 UI state 成为 Runtime authority。

#### Scenario: Permission core is complete before permission prompts

- **WHEN** Task 5.5 的聚焦与完整验证通过，而 Task 6.2 尚未交付
- **THEN** Host 已能安全持久化并强制执行 grant，测试/可信 Host 可驱动状态转换
- **THEN** 普通用户仍没有新的权限 prompt 或设置 UI，插件也不能自行授予权限

#### Scenario: Caller requests a broader native capability

- **WHEN** plugin 或 Host caller 尝试通过 permission service 访问文件、网络、Shell、进程、外链、图片 clipboard 或任意 Tauri command
- **THEN** 当前 catalog/contract 拒绝该请求
- **THEN** 不会调用 fallback、命名约定或官方来源旁路
