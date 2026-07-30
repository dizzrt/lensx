## ADDED Requirements

### Requirement: Launcher action 必须使用可验证且可序列化的 descriptor

系统 MUST 为每个 launcher action 提供 plain-data descriptor，至少包含 `action_id`、`owner_id`、本地化 `title`、可选本地化 `description`、按 locale 组织的 `default_keywords` 和 `enabled`。Descriptor MUST 可序列化且 MUST NOT 包含 executor、函数、React 状态、Tauri window、Rust 内部类型或其他不可序列化值。系统 MUST 在注册前验证未知输入，并返回按 JSON Pointer path 和稳定 code 排序的结构化诊断。

#### Scenario: 接受合法 descriptor

- **WHEN** Host 注册字段类型、ID、owner、本地化文本、关键词和 enabled 状态均合法的 descriptor
- **THEN** validation boundary 返回规范化 plain-data descriptor
- **THEN** descriptor 可以独立于 executor 序列化
- **THEN** validation boundary 不返回诊断

#### Scenario: 拒绝未知或不可序列化字段

- **WHEN** descriptor 包含未知字段、函数、class instance 或其他 contract 未声明的值
- **THEN** 系统拒绝该 descriptor
- **THEN** 系统返回稳定 code 和对应 JSON Pointer path 的诊断
- **THEN** registry 不保存该输入

#### Scenario: 多个 descriptor 错误保持确定顺序

- **WHEN** 同一 descriptor 同时包含多个可安全聚合的错误
- **THEN** 系统返回全部可安全聚合的结构化诊断
- **THEN** 诊断按 path 和 code 使用确定顺序
- **THEN** 调用方不需要依赖 message 文案判断错误类型

### Requirement: Action ID 必须表达稳定 owner 关系

`owner_id` MUST 由至少两个点分隔的 namespaced segment 组成，`action_id` MUST 等于 `owner_id`、一个点和一个本地 action segment。每个 segment MUST 以 ASCII 小写字母开头，并 MUST 仅包含 ASCII 小写字母、数字、下划线或连字符。单个 segment MUST NOT 超过 64 字符，完整 ID MUST NOT 超过 255 字符。已发布的 action ID MUST NOT 被复用于语义不同的 action。

#### Scenario: 接受 Host 内建 action ID

- **WHEN** owner 为 `lensx.core` 且 action ID 为 `lensx.core.hide_launcher`
- **THEN** 系统接受该 owner 与 action ID 关系

#### Scenario: 拒绝不属于 owner 的 action ID

- **WHEN** descriptor 的 `action_id` 不以完整 `owner_id` 和一个点开头
- **THEN** 系统拒绝该 descriptor
- **THEN** 诊断标识 owner 与 action ID 不一致

#### Scenario: 拒绝非法 namespaced ID

- **WHEN** owner 或 action ID 包含空 segment、大写开头、非法字符、过长 segment 或超过完整长度限制
- **THEN** 系统拒绝该 descriptor
- **THEN** 诊断定位到对应 ID 字段

### Requirement: Action metadata 必须支持应用 locale 和英文回退

Action `title` MUST 包含 trim 后非空的 `en-US` 文本，`description` 存在时 MUST 同样包含非空英文文本。`zh-CN` 文本 MAY 缺失；当前 locale 的文本缺失时系统 MUST 回退 `en-US`。每个 default keyword MUST 在 trim 后非空，并 MUST 在同一 locale 下使用 locale-aware lowercase 保持唯一。用户可见的 Host 内建 title 和 description MUST 来自应用 message resources。

#### Scenario: 解析当前 locale 的 action metadata

- **WHEN** action 同时提供 `en-US` 和当前应用 locale 的 title 或 description
- **THEN** 系统返回当前 locale 的文本

#### Scenario: 当前 locale 文本缺失

- **WHEN** action 没有提供当前应用 locale 的 title 或 description
- **THEN** 系统返回对应 `en-US` 文本

#### Scenario: 英文 title 缺失或为空

- **WHEN** descriptor 缺少 `title.en-US` 或该文本 trim 后为空
- **THEN** 系统拒绝该 descriptor
- **THEN** 诊断定位到英文 title

#### Scenario: 关键词为空或重复

- **WHEN** 某 locale 的关键词 trim 后为空，或两个关键词在 locale-aware lowercase 后重复
- **THEN** 系统拒绝该 descriptor
- **THEN** 诊断定位到对应 keyword

### Requirement: Host registry 必须原子注册并提供确定性不可变 snapshot

系统 MUST 由可信 Host application service 拥有唯一运行中 launcher action registry。Registry MUST 支持单个和批量注册、按 `action_id` 查询，以及列出按 `action_id` 升序排列的 descriptor snapshot。批量注册 MUST 是原子的；任一 descriptor 无效、与现有 action 重复或在批内重复时，registry MUST 拒绝整个批次。公开 descriptor 和 snapshot MUST 与 caller input 断开引用，并 MUST NOT 暴露或允许修改内部 executor。

#### Scenario: 注册一批合法 actions

- **WHEN** Host 批量注册一组合法且 ID 唯一的 actions
- **THEN** registry 原子保存全部 actions
- **THEN** 按 ID 查询返回对应 descriptor
- **THEN** snapshot 按 `action_id` 升序排列

#### Scenario: 批量注册中存在非法 action

- **WHEN** 一个批次包含至少一个非法 descriptor
- **THEN** registry 拒绝整个批次
- **THEN** registry 不保存该批次中的任何 action

#### Scenario: 注册重复 action ID

- **WHEN** 新注册 action 的 ID 与现有 action 或同批另一个 action 重复
- **THEN** registry 拒绝该注册或整个批次
- **THEN** registry 保持注册前状态
- **THEN** 诊断标识重复 `action_id`

#### Scenario: 调用方尝试修改 descriptor

- **WHEN** 调用方在注册后修改原始输入、查询结果或 snapshot
- **THEN** registry 内部 descriptor 保持不变
- **THEN** 后续查询和 snapshot 不暴露 executor 或可变内部引用

#### Scenario: 查询未知 action

- **WHEN** 调用方查询未注册的 `action_id`
- **THEN** registry 返回无值
- **THEN** registry 状态保持不变

### Requirement: Dispatcher 必须统一执行 action 并返回类型化结果

系统 MUST 通过统一 dispatcher 按 `action_id` 解析和执行 action。Dispatcher MUST 在每次执行时检查 action 是否存在且 enabled，并 MUST 至多调用对应 Host executor 一次。Dispatcher MUST 返回包含 `ok` 和 `action_id` 的类型化结果；失败结果 MUST 使用稳定 code 区分 `action_not_found`、`action_unavailable` 和 `action_execution_failed`。Executor 抛出或拒绝时，dispatcher MUST 捕获内部错误，并 MUST NOT 向调用方暴露 stack、Tauri window 或 Rust 内部类型。

#### Scenario: 执行可用 action

- **WHEN** dispatcher 收到已注册且 enabled 的 action ID
- **THEN** dispatcher 调用该 action 的 Host executor 一次
- **THEN** dispatcher 返回 `ok = true` 和对应 `action_id`

#### Scenario: 执行未知 action

- **WHEN** dispatcher 收到未注册的 action ID
- **THEN** dispatcher 不调用任何 executor
- **THEN** dispatcher 返回 `ok = false` 和 `action_not_found`

#### Scenario: 执行不可用 action

- **WHEN** dispatcher 收到已注册但 `enabled = false` 的 action ID
- **THEN** dispatcher 不调用该 action executor
- **THEN** dispatcher 返回 `ok = false` 和 `action_unavailable`

#### Scenario: Executor 执行失败

- **WHEN** action executor 抛出、拒绝或返回无效结果
- **THEN** dispatcher 返回 `ok = false` 和 `action_execution_failed`
- **THEN** 公开结果不包含内部异常 stack 或特权对象

### Requirement: Descriptor 与 executor 必须保持 Host trust boundary

公开 registry snapshot MUST 只包含 descriptor metadata，executor MUST 只存在于可信 Host registry 内部。React 组件和未来 provider 输入 MUST NOT 注册或接收可执行函数。需要特权能力的 executor MUST 通过显式 typed desktop adapter 调用 Rust，Rust MUST 在 command boundary 重新约束允许的原生操作。

#### Scenario: 消费 registry snapshot

- **WHEN** UI、搜索服务或 provider adapter 读取 registry snapshot
- **THEN** snapshot 只包含可序列化 descriptor
- **THEN** 消费者无法从 snapshot 取得或替换 executor

#### Scenario: 执行特权 action

- **WHEN** Host executor 需要原生窗口能力
- **THEN** executor 通过 typed desktop adapter 调用明确允许的 Rust command
- **THEN** executor 不直接访问 Tauri window 或 Rust 内部对象

#### Scenario: 注册 action 不改变当前界面

- **WHEN** 默认 action service 注册内建 actions
- **THEN** 当前最小 App Shell 不自动显示 action 或结果列表
- **THEN** action presentation 仍等待后续独立搜索能力

### Requirement: 默认 registry 必须包含真实的隐藏 launcher action

默认 action service MUST 注册 enabled 的 `lensx.core.hide_launcher`，其 owner MUST 为 `lensx.core`，其英文和简体中文 title/description MUST 来自应用 message resources。Dispatcher 执行该 action 时 MUST 通过 typed desktop adapter 调用 Rust `hide_launcher` command。Rust command MUST 复用既有统一 launcher window `hide` 动作，MUST NOT 直接复制原生 window hide 操作。

#### Scenario: 创建默认 action service

- **WHEN** Host 创建默认 launcher action service
- **THEN** registry 包含 `lensx.core.hide_launcher`
- **THEN** descriptor 为 enabled 且通过全部 ID、owner、本地化和关键词验证

#### Scenario: 执行隐藏 launcher action

- **WHEN** dispatcher 执行 `lensx.core.hide_launcher`
- **THEN** 对应 executor 调用 typed desktop adapter
- **THEN** Rust command 通过现有统一 launcher window action boundary 执行 `hide`
- **THEN** 成功时 dispatcher 返回类型化成功结果

#### Scenario: Rust 隐藏窗口失败

- **WHEN** Rust 解析主窗口或执行统一 `hide` 动作失败
- **THEN** Rust command 返回包含稳定 code、action、operation 和 message 的可序列化错误
- **THEN** TypeScript adapter 将失败映射为 executor failure
- **THEN** dispatcher 返回 `action_execution_failed`
