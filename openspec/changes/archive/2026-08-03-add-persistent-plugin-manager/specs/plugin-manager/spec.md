## ADDED Requirements

### Requirement: Host MUST own one layered Plugin Manager state

系统 MUST 在 Rust Host 中维护一个统一 Plugin Manager，并 MUST 通过 Tauri managed state 使 Host 内部消费者共享同一实例。每个健康插件条目 MUST 将 validated normalized Manifest 与 Host-owned registration facts 分开保存；Manifest 作者 MUST NOT 通过作者输入设置安装位置、包摘要、来源、enabled、compatibility、quarantine、Runtime 或 granted permission 状态。

#### Scenario: Host 接收一条已验证注册记录

- **WHEN** 可信 Host 内部调用方提交 normalized Manifest 和 Host registration facts
- **THEN** Plugin Manager 以 Manifest 中的 `plugin_id` 建立唯一条目
- **THEN** normalized Manifest 保持只有作者可声明数据，Host facts 保持在独立层

#### Scenario: 空 Store 启动

- **WHEN** 应用首次启动且 Plugin Manager Store 不存在
- **THEN** Host 创建并托管一个空 Plugin Manager
- **THEN** 启动不写入虚构插件、权限或 Runtime 状态

#### Scenario: 重复 plugin identity

- **WHEN** Host 尝试以相同 `plugin_id` 建立第二条互相冲突的健康记录
- **THEN** Plugin Manager 以稳定错误拒绝转换
- **THEN** 已存在的内存和持久化记录保持不变

### Requirement: Registration facts MUST have explicit persistence lifetimes

Plugin Manager MUST 持久化 normalized Manifest、安装位置、带算法标签的包摘要、Host-controlled source、enabled intent、granted permission ID snapshot 和最近诊断。记录存在 MUST 表达一条 installed registration，而不是证明真实包安装流程已经交付。Compatibility MUST 根据记录的 Manifest 范围与当前 lensX/Host API 版本派生；Runtime state MUST 为进程内瞬时事实，且恢复后 MUST 从 `inactive` 开始。

#### Scenario: 健康记录跨重启恢复

- **WHEN** 一条健康记录成功持久化且应用使用相同 Host 版本重新启动
- **THEN** Plugin Manager 恢复相同 normalized Manifest、安装 facts、enabled intent、grant snapshot 和有界诊断
- **THEN** Runtime state 为 `inactive`

#### Scenario: Host 版本变化

- **WHEN** 一条记录在旧 Host 中兼容，但恢复时当前 lensX 或 Host API 版本不再落在 Manifest 范围内
- **THEN** Plugin Manager 将当前 compatibility 派生为 incompatible
- **THEN** 旧进程持有的 compatibility 结论不会覆盖新结论

#### Scenario: Manifest 请求权限但没有 Host grant

- **WHEN** normalized Manifest 声明一个或多个 requested permission 且 Host 未提供 grant snapshot
- **THEN** Plugin Manager 持久化空的 granted permission ID snapshot
- **THEN** requested permissions 不会自动变成授权

#### Scenario: 上次进程曾存在 Runtime 活动

- **WHEN** 应用退出或崩溃前某插件具有进程内 Runtime 活动
- **THEN** 下次恢复不把旧 Runtime 活动反序列化为活跃 session
- **THEN** 该插件从 `inactive` 开始

### Requirement: Plugin records MUST persist independently and atomically

Plugin Manager MUST 使用带显式格式版本的独立插件记录，使单条记录可以单独读取、校验和替换。每次转换 MUST 先验证 next record 并完成原子持久化，再发布新的内存状态；持久化失败 MUST 保留最后成功的内存和磁盘状态。

#### Scenario: 成功持久化状态转换

- **WHEN** Host 改变一条健康记录的 enabled intent 且 next record 有效
- **THEN** Store 原子替换该插件记录
- **THEN** 只有写入成功后 Plugin Manager 才向 Host 内部读取者发布新状态

#### Scenario: 写入失败

- **WHEN** 临时文件创建、写入、刷新或原子替换失败
- **THEN** Plugin Manager 返回稳定的持久化诊断
- **THEN** 原内存记录和最后成功的磁盘记录保持不变
- **THEN** 残留临时文件不会被当作健康插件记录恢复

#### Scenario: 一个插件更新不影响另一个插件

- **WHEN** Plugin Manager 持有两个健康插件且其中一个插件的转换成功
- **THEN** 另一个插件的记录内容和状态保持不变

### Requirement: Startup recovery MUST isolate damaged plugin records

Plugin Manager MUST 在启动时独立检查每条候选记录。无法解析、格式版本不受支持、record identity 与 normalized Manifest 不一致或违反 registration 不变量的单条记录 MUST 成为带稳定诊断的 quarantine stub，并 MUST NOT 阻止其他健康记录或应用恢复。恢复过程 MUST NOT 静默删除或覆盖损坏的原记录。

#### Scenario: 一条记录损坏而另一条健康

- **WHEN** Store 同时包含一条有效记录和一条无法解析的插件记录
- **THEN** Plugin Manager 恢复有效记录
- **THEN** 损坏记录以 quarantine stub 表示并带有恢复诊断
- **THEN** 应用继续启动

#### Scenario: 记录格式版本未知

- **WHEN** 一条语法有效的记录声明不受支持的格式版本
- **THEN** Plugin Manager 不猜测、降级或静默迁移该记录
- **THEN** 该记录进入 quarantine，其他支持版本的记录继续恢复

#### Scenario: 记录 identity 不一致

- **WHEN** 持久化 record key 与记录内 normalized Manifest 的 `plugin_id` 不一致
- **THEN** Plugin Manager 隔离该记录并报告稳定 identity mismatch 诊断
- **THEN** 该记录不能覆盖另一插件的健康状态

#### Scenario: Store 目录整体不可读

- **WHEN** Host 无法列出或读取 Plugin Manager Store 目录
- **THEN** Plugin Manager 以空健康集合和 manager-level 恢复诊断进入 degraded 状态
- **THEN** 应用启动不 panic，且 Host 不覆盖不可读的原数据

### Requirement: Quarantine and enabled state MUST remain distinct Host facts

Plugin Manager MUST 独立表达 enabled intent、当前 compatibility 与 quarantine。进入 quarantine MUST 使该条目不可作为健康注册记录消费，但 MUST NOT 把 quarantine 自动解释为用户禁用、卸载或删除；清除 quarantine MUST 要求可信 Host 用完整有效记录原子替换损坏记录。

#### Scenario: 已启用记录在恢复时损坏

- **WHEN** 一条此前 enabled 的记录在启动恢复时无法通过检查
- **THEN** 该条目进入 quarantine 且不能作为健康 enabled registration 使用
- **THEN** Host 不把该事件记录为用户主动 disable 或 uninstall

#### Scenario: 用健康记录恢复 quarantine

- **WHEN** 可信 Host 提供相同 record identity 的完整有效 replacement
- **THEN** Plugin Manager 原子持久化 replacement 后清除 quarantine stub
- **THEN** replacement 的 enabled intent 由可信 Host 明确提供，而不是从损坏内容猜测

### Requirement: Plugin Manager diagnostics MUST be stable, safe, and bounded

Plugin Manager 诊断 MUST 至少包含稳定 machine-readable code、操作阶段和安全 message，MUST NOT 保留原始异常对象、栈、插件内容或不必要的敏感路径。每条健康记录 MUST 最多保留最近 32 条诊断，并 MUST 在超过上限时先淘汰最旧诊断；quarantine stub MUST 保留当前隔离原因。

#### Scenario: 诊断超过保留上限

- **WHEN** 一条健康记录产生第 33 条可保留诊断
- **THEN** Plugin Manager 淘汰最旧诊断并保留最近 32 条
- **THEN** 诊断顺序仍能表达产生先后

#### Scenario: 底层 I/O 返回敏感错误

- **WHEN** Store 操作收到包含原始路径、异常对象或栈的底层错误
- **THEN** Plugin Manager 将其映射为稳定 code、阶段和安全 message
- **THEN** 持久化诊断不包含原始错误对象、栈或不必要的敏感路径

### Requirement: The first Plugin Manager capability MUST remain Host-private

本 capability MUST 只交付 Rust Host 私有 Manager、Store、恢复报告和 Tauri managed state，不得宣称已经交付公共 Registration Contract、Tauri command、前端查询/管理 UI、Action/Page 投影、插件安装/卸载、iframe Runtime、Host API 或权限决策。

#### Scenario: 前端检查本 change 的公共边界

- **WHEN** 本 change 完成但 Task 2.2 尚未实施
- **THEN** 前端没有新的 Plugin Manager Tauri command、共享 registration payload 或管理界面
- **THEN** 现有 Launcher 行为保持不变

#### Scenario: Host 恢复一条 registration record

- **WHEN** Plugin Manager 在启动时恢复一条健康记录
- **THEN** 恢复本身不读取插件 UI、不创建 iframe、不投影 Action/Page，也不执行插件代码
