## ADDED Requirements

### Requirement: Registration Contract MUST remain a Host-owned application boundary

系统 MUST 将 Plugin Registration Contract 作为 Rust Host、Tauri command/event 与 lensX 根应用 TypeScript 之间的私有边界。它 MUST NOT 成为 author Manifest 输入、插件 iframe API、`@lensx/plugin-contract`、`@lensx/plugin-sdk` 或其他插件可导入的公共入口。所有 registered plugin payload MUST 由 Host 从已验证的 normalized Manifest 和 Host-owned facts 组合，MUST NOT 接受作者提供的 source、enabled、compatibility、quarantine、Runtime、granted permission、lifecycle、signature 或 provenance 事实。

#### Scenario: Host 组合一条健康注册详情

- **WHEN** Plugin Manager 中存在一条 normalized Manifest 和对应的 Host registration facts
- **THEN** Registration Contract 返回由 Host 组合的 registered plugin read model
- **THEN** normalized Manifest 保持为独立嵌套作者数据，Host facts 不会被写回或伪装成 Manifest 字段

#### Scenario: Publisher 声称来自官方组织

- **WHEN** normalized Manifest 的 publisher 文本声称插件由 lensX 或可信组织发布
- **THEN** read model 仍将该文本视为未验证作者声明
- **THEN** publisher 不会改变 Host source、enabled、permission grant、compatibility 或任何信任结论

#### Scenario: Workspace 插件尝试导入 Registration Contract

- **WHEN** 官方或示例插件源码尝试导入 Host 私有 registration 类型、Tauri adapter 或事件入口
- **THEN** workspace boundary gate 拒绝该依赖
- **THEN** 公共 plugin package 的 exports 和真实 tarball 不包含 Registration Contract

### Requirement: Registration wire payloads MUST use an independent explicit version

每个 registration snapshot、detail response 和 changed event payload MUST 携带值为 `0.1.0` 的 Registration Contract version。该版本 MUST 独立于 Manifest protocol、Host API、lensX 应用版本和 Plugin Manager Store format。Rust 与 TypeScript 边界 MUST 拒绝缺失或不受支持的 Registration Contract version，MUST NOT 静默按其他版本解释 payload。

#### Scenario: 双端读取当前版本 payload

- **WHEN** Rust serializer 和 TypeScript parser 读取 Registration Contract version `0.1.0` 的有效共享 fixture
- **THEN** 两端接受 payload 并得到相同的可观察字段和值

#### Scenario: 前端收到未知版本

- **WHEN** Tauri command 或 event 返回未知、缺失或类型错误的 Registration Contract version
- **THEN** TypeScript adapter 拒绝该 payload 并映射为稳定边界错误
- **THEN** adapter 不发布部分解析的 snapshot、detail 或 revision

### Requirement: Host MUST expose deterministic complete registration snapshots

Host MUST 提供只读 `read_plugin_registration_snapshot` Tauri command。成功响应 MUST 包含 Registration Contract version、当前进程内 revision、Manager availability/recovery 摘要，以及当前全部健康注册和 quarantine stubs 的 summary。entries MUST 使用 Host 生成的 opaque entry identity 确定性排序；健康和 quarantine summary MUST 是严格可辨识的 variants。空 Manager MUST 返回有效空 snapshot，而不是错误或占位插件。

健康 summary MUST 至少包含 opaque entry identity、plugin ID、插件版本、normalized localized display data、Host-controlled `builtin | external` source、enabled intent、逐维 compatibility 和当前 `inactive` Runtime status。quarantine summary MUST 至少包含 opaque entry identity、可选 plugin ID 和安全 quarantine diagnostic，且 MUST NOT 猜测缺失的 Manifest 展示数据。

#### Scenario: 读取空 Plugin Manager

- **WHEN** Plugin Manager 没有健康记录或 quarantine stub
- **THEN** snapshot 返回空 entries、当前 contract version、有效 revision 和非伪造的 Manager availability
- **THEN** Host 不创建示例、占位或默认插件

#### Scenario: 同时存在健康和 quarantine 记录

- **WHEN** Manager snapshot 包含一条健康注册和一条损坏记录的 quarantine stub
- **THEN** command 在同一 snapshot 中返回两个不同 variant
- **THEN** entries 按 opaque entry identity 确定性排序，健康项和 quarantine 项的字段不会混合

#### Scenario: Store 整体恢复为 degraded

- **WHEN** Plugin Manager 因 Store 目录整体不可读而以 degraded recovery report 启动
- **THEN** snapshot 明确返回 degraded availability 和安全 Manager recovery diagnostic
- **THEN** degraded 空集合不会被误报为普通健康空集合，也不会暴露底层路径或错误对象

### Requirement: Host MUST expose safe revision-bound registration details

Host MUST 提供只读 `read_plugin_registration_detail` Tauri command，输入 MUST 仅接受合法 opaque entry identity。成功响应 MUST 携带生成该详情时的当前 revision，并返回健康 registered detail 或 quarantine detail 的严格 variant。

健康详情 MUST 包含完整 normalized Manifest 和安全 Host facts：source、enabled intent、逐维 compatibility、排序去重的 granted permission IDs、当前 `inactive` Runtime status 及有界安全 diagnostics。quarantine 详情 MUST 只包含 opaque entry identity、可选 plugin ID 和当前安全 quarantine diagnostic。任何详情 MUST NOT 包含安装绝对路径、package digest、Store 文件名、原始损坏记录、插件文件内容、原始错误、错误栈、函数、React/Tauri 对象或 Host executor。

#### Scenario: 读取健康注册详情

- **WHEN** 调用方使用 snapshot 中健康项的 opaque entry identity 查询详情
- **THEN** Host 返回同一注册的 normalized Manifest、独立 Host facts 和当前 revision
- **THEN** requested permissions 仍属于 Manifest，granted permission IDs 仍属于 Host facts，二者不会自动互相转换

#### Scenario: 读取 quarantine 详情

- **WHEN** 调用方使用 quarantine summary 的 opaque entry identity 查询详情
- **THEN** Host 返回 quarantine variant 和安全隔离诊断
- **THEN** Host 不解析、回传或猜测损坏记录中的 Manifest、enabled、permission 或 Runtime 数据

#### Scenario: 条目在 snapshot 后消失

- **WHEN** 调用方查询的 opaque entry identity 已不在当前 Manager snapshot 中
- **THEN** command 返回稳定 `not_found` 错误
- **THEN** command 不返回陈旧缓存或其他插件的详情

#### Scenario: 检查敏感字段边界

- **WHEN** Rust 和 TypeScript 对详情 payload 执行共享 fixture 与 unknown-field 检查
- **THEN** 包含安装路径、package digest、Store key、原始异常或私有对象字段的 payload 被拒绝
- **THEN** 安全 normalized Manifest 内容不会被错误地当作 Host 信任事实

### Requirement: Query errors MUST be stable, safe, and operation-specific

Registration query command 失败 MUST 映射为可序列化 `{ code, operation, message }` payload。`code` MUST 限于稳定集合 `invalid_request`、`not_found`、`unavailable` 和 `internal`；`operation` MUST 区分 `read_snapshot` 与 `read_detail`；`message` MUST 是安全、稳定且不依赖底层错误文本的英文消息。错误 MUST NOT 包含路径、原始异常、栈、插件内容或不可预测的系统文本。

#### Scenario: detail 请求包含非法 identity

- **WHEN** `read_plugin_registration_detail` 收到空值、未知字段、类型错误或不满足 identity 约束的参数
- **THEN** command 返回 `invalid_request` 和 `read_detail`
- **THEN** Plugin Manager 状态与 revision 保持不变

#### Scenario: 底层查询产生私有错误

- **WHEN** Host 查询边界遇到包含原始路径、异常或栈的内部失败
- **THEN** 调用方只收到稳定 `internal` 或 `unavailable` 错误 payload
- **THEN** 私有错误内容不进入序列化结果、事件、日志 fixture 或前端状态

### Requirement: Runtime, lifecycle, signature, and permission decision facts MUST remain narrowly scoped

Registration Contract v0 MUST 只表达当前已经存在的瞬时 Runtime status `inactive`，并 MUST 在应用恢复后从 `inactive` 开始。它 MUST NOT 声明 active session、session identity、iframe、RPC 或 Runtime transition 已实现。它 MUST NOT 增加 lifecycle enum、disableable/uninstallable policy、用户 enable/disable/uninstall 操作、signature status、trusted provenance 或 permission decision。Host source、enabled intent、compatibility、quarantine、requested permissions 和 granted permission ID snapshot MUST 保持为相互独立的事实。

#### Scenario: 恢复曾在旧进程活动的记录

- **WHEN** 应用启动并恢复一条持久化注册记录
- **THEN** registration summary 和 detail 的 Runtime status 均为 `inactive`
- **THEN** payload 不恢复或猜测旧进程的 session identity、页面或调用状态

#### Scenario: 外部插件被标记 enabled

- **WHEN** 一条 external 注册记录具有 enabled intent 且 Manifest 请求了权限
- **THEN** payload 分别表达 external source、enabled intent、requested permissions 和实际 grant snapshot
- **THEN** external、enabled 或 requested 中任一事实都不会生成 signature、trusted、authorized、disableable 或 uninstallable 结论

### Requirement: Successful Manager transitions MUST publish revisions and invalidation events after commit

Plugin Manager MUST 为当前进程维护单调递增 revision，并 MUST 以不透明十进制字符串序列化。只有状态转换成功持久化并发布新内存 snapshot 后，Host 才 MUST 更新 revision 并发送 `plugin-registration://snapshot-changed`。event payload MUST 只包含当前 Registration Contract version 和新 revision；MUST NOT 包含 entry patch、Manifest、详情或敏感字段。失败、被拒绝或无实际变化的转换 MUST NOT 更新 revision 或发送事件。

#### Scenario: 注册状态成功转换

- **WHEN** Host 内部调用完成一次成功持久化并发布新的 Plugin Manager 状态
- **THEN** 随后读取的 snapshot 和 detail 返回新的 revision
- **THEN** Host 在新状态可查询之后发送一次只含 contract version 和 revision 的 changed event

#### Scenario: 持久化失败

- **WHEN** Plugin Manager 状态转换在写入、flush 或原子替换阶段失败
- **THEN** 旧内存 snapshot 和 revision 保持不变
- **THEN** Host 不发送 snapshot-changed event，前端不能观察到未落盘 next state

#### Scenario: 应用重启

- **WHEN** 新应用进程恢复 Plugin Manager 并重新建立 Registration Contract
- **THEN** revision 可以从该进程的初始值重新开始
- **THEN** 任何消费者必须读取新 snapshot，不能将旧进程 revision 当作可比较的持久化序号

### Requirement: Frontend adapter MUST recover from event races and loss through snapshots

TypeScript desktop adapter MUST 将所有 `invoke` 响应和 Tauri event payload 作为 `unknown` 校验，并 MUST 在发布给可信应用消费者前构造只读 Registration Contract 值。初始化 MUST 先建立 changed-event 监听，再读取 snapshot；若首次读取期间观察到不同 revision 的事件，adapter MUST 继续串行刷新，直到已发布 snapshot 与最近观察到的 revision 一致。并发事件 MUST 合并刷新，adapter 重建、监听恢复或 Launcher 重新激活时 MUST 重新读取完整 snapshot。收到任意有效 changed event MUST 同时使已缓存 snapshot 与 detail 失效。

#### Scenario: 首次读取期间发生状态变化

- **WHEN** adapter 已订阅 changed event、首次 snapshot 查询尚未完成且 Host 发布了新 revision
- **THEN** adapter 不把旧 snapshot 作为最终当前状态发布
- **THEN** adapter 再次读取，直到 snapshot revision 与最近事件 revision 一致

#### Scenario: 多个通知快速到达

- **WHEN** adapter 在一次 snapshot 查询期间收到多个 changed events
- **THEN** adapter 合并通知并串行完成必要刷新，不并行发布互相覆盖的 snapshot
- **THEN** 最终发布值对应最近可观察 revision

#### Scenario: 事件丢失后重新激活

- **WHEN** 前端未收到某次 changed event，但之后发生 adapter 重建、监听恢复或 Launcher 激活
- **THEN** adapter 读取完整 snapshot 并替换旧 snapshot 与 detail cache
- **THEN** 恢复不依赖事件重放、增量 patch、历史日志或跨进程 revision

#### Scenario: event payload 无效

- **WHEN** adapter 收到未知字段、错误 variant、错误 version 或非法 revision 的 event payload
- **THEN** adapter 报告稳定边界错误且不发布部分值
- **THEN** adapter 通过完整 snapshot 查询恢复，而不是应用无效事件内容

### Requirement: Rust and TypeScript MUST share a complete Registration Contract drift gate

项目 MUST 维护同一组 Registration Contract 正反 fixtures，由 Rust serializer/deserializer 测试和 TypeScript runtime parser 测试共同消费。fixtures MUST 至少覆盖空 snapshot、健康、disabled、incompatible、quarantine、degraded、detail、稳定错误、changed event、未知字段、错误版本、错误 variant、未排序或重复 grant，以及敏感字段泄漏。根级专用检查 MUST 组合两端测试，并 MUST 在 wire shape、枚举、版本、排序、错误或安全边界 drift 时失败。

#### Scenario: 两端读取有效 fixtures

- **WHEN** Rust 与 TypeScript 读取全部有效共享 fixtures
- **THEN** 两端接受相同 case，并对 contract version、variant、revision、identity、排序和字段值达成一致

#### Scenario: 任一边界发生 drift

- **WHEN** Rust wire struct、TypeScript parser、fixture 或 contract version 出现不一致
- **THEN** 专用 Registration Contract gate 失败并定位到具体 case 和边界
- **THEN** 标准 frontend、workspace 与 Rust validation 会执行或组合该 gate

### Requirement: Registration Contract delivery MUST NOT claim downstream plugin capabilities

本 capability MUST 只交付 Host-owned read model、只读 Tauri queries、changed-event 恢复语义、TypeScript adapter、共享 fixtures、测试和维护文档。它 MUST NOT 安装、升级、卸载或执行插件，MUST NOT 提供用户生命周期写操作、Action/Page 投影、插件管理 UI、iframe Runtime、Host API、权限授权或签名验证，并 MUST NOT 改变现有 Launcher 搜索、Dispatcher、导航或窗口展示行为。

#### Scenario: 只有 Task 2.2 完成

- **WHEN** Registration Contract 已通过全部验证而后续 Tasks 尚未实施
- **THEN** 根应用具备可查询的 Host registration snapshot/detail 和变化通知，但没有新的插件管理页面
- **THEN** 插件 Action 不会自动进入 Launcher，Page 不会打开，插件代码不会执行，权限不会被授予

#### Scenario: 检查现有 Launcher 行为

- **WHEN** 应用在没有后续 Action/Page projection 的情况下启动并使用 Launcher
- **THEN** 现有 Host Actions、搜索、Dispatcher、集合和页面导航行为保持不变
- **THEN** Registration Contract 不建立插件专用搜索或执行分支
