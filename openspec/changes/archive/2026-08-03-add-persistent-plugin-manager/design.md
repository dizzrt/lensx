## Context

当前 Host 已有显式 Rust Manifest 模型和 `validate_plugin_manifest`，可以返回 normalized Manifest、兼容性结论与稳定诊断；Tauri 入口尚未持有插件注册状态。现有应用偏好和 Launcher Action collections 已采用应用配置目录中的 JSON、临时文件、`sync_all` 与原子替换模式，但它们都是单文档存储；Plugin Manager 还必须满足“单个插件记录损坏不影响其他插件恢复”，不能直接照搬单文档故障域。

本 change 位于静态 Manifest Contract 与后续 Registration Contract 之间。它建立 Host 私有 Rust 核心和持久化事实源，但不向 React 或插件作者公开序列化 payload。后续安装器、Registration Contract、Action/Page 投影、Runtime 与权限管理必须复用该核心，而不是建立第二份注册状态。

## Goals / Non-Goals

**Goals:**

- 建立一个线程安全、由 Tauri managed state 持有的 Rust Plugin Manager。
- 明确 normalized Manifest、持久化 Host facts、派生 compatibility 与瞬时 Runtime state 的所有权和生命周期。
- 对每个插件独立、版本化、原子地持久化注册记录。
- 启动时尽可能恢复所有健康记录，把单条损坏记录隔离为可诊断 quarantine stub。
- 让写入失败不会先改变内存状态，保持内存与最后成功落盘状态一致。
- 通过纯 Rust API 和可注入目录测试状态转换、恢复和故障路径。

**Non-Goals:**

- 不提供公共 Tauri command、TypeScript 类型、前端查询、事件或管理 UI。
- 不实现插件发现、包格式、安装、卸载、升级或真实目录变更。
- 不注册 Action/Page，不创建 iframe，不执行插件代码，也不定义 Runtime Session 状态机。
- 不定义 permission catalog、授权决策、风险等级或 Host API 调用检查。
- 不计算包摘要、不验证安装目录内容，也不建立签名或 provenance 信任链。

## Decisions

### 1. Plugin Manager 组合四类状态，而不是把所有字段写回 Manifest

Manager 内部以插件为键组合：

```text
Normalized Manifest           持久化 Host registration facts
作者数据与确定性默认值         安装位置、包摘要、来源、enabled、grant IDs
              \               /
               \             /
                Plugin Manager
                 ├─ compatibility：按当前 Host 版本派生
                 ├─ quarantine：由恢复与一致性检查派生/保留
                 └─ runtime：本 change 中仅为瞬时 inactive
```

持久化记录 MUST NOT 把 `source`、`enabled`、授权或 Runtime 状态写入 normalized Manifest。记录存在即表达 Manager 已知的一条 installed registration；本 change 不提供创建真实安装的生产流程，后续安装器通过 Host 私有 API提交经过验证的记录。

选择这一方案是为了维持当前 Manifest Contract 的作者/Host 分层。备选方案是扩展 normalized Manifest 加入 Host 字段，但这会让作者输入与可信事实混淆，予以拒绝。

### 2. 明确持久、派生和瞬时边界

持久化内容包括：

- format version；
- normalized Manifest；
- Host 提供的安装位置；
- 带算法标签的包摘要事实；
- Host-controlled source；
- enabled intent；
- 默认为空、排序且去重的 granted permission ID snapshot；
- 有上限的最近诊断；
- 可识别记录的一致性元数据。

compatibility 不作为永久结论恢复。Manager 每次启动都使用 normalized Manifest 中的范围和当前 lensX/Host API 版本重新计算，应用升级后可以自动得到新结论。

Runtime 状态不持久化。本 change 中每条健康记录启动后均为 `inactive`；后续 Runtime change 可以扩充瞬时状态，但不得从上次进程伪造仍然活跃的 session。

授权快照只是 Host-owned 存储槽：默认为空，不能从 `requested_permissions` 自动生成，也不提供授权决策入口。权限目录、用户确认和调用时检查仍属于 Task 5.5。

备选方案是原样持久化 compatibility 和 Runtime 状态，但它们会分别因 Host 版本和进程生命周期失效，予以拒绝。

### 3. 使用逐插件版本化记录，缩小损坏故障域

Store 位于 Tauri `app_config_dir` 下的 Plugin Manager 专用目录。每个插件使用确定性、安全编码的 record key 对应一个独立 JSON 文件；文件内部包含 `format_version: 1` 和 normalized plugin identity，恢复时两者必须一致。

逐插件文件使 Manager 可以独立读取、校验和恢复记录。无法解析、未知格式版本、identity 不一致或违反注册不变量的文件不会阻止其他记录恢复；Manager 保留原文件，并在内存中建立 quarantine stub 与稳定恢复诊断。若目录整体不可读，Manager 以空的健康集合和 manager-level 诊断进入 degraded 状态，但应用启动不 panic。

备选方案是一份包含所有插件的 Registry JSON。它实现更简单，但一次顶层语法损坏会破坏全部记录，无法满足单插件隔离目标，因此拒绝。SQLite 可以提供事务和行级隔离，但本 change 的数据量和查询需求很小，且会引入新 Runtime 依赖，也不采用。

### 4. 每条记录使用“先落盘、后发布内存”的原子转换

每次状态转换先基于当前快照构造并验证 next record，再在同目录创建唯一临时文件，写入完整 JSON、刷新文件并原子替换目标文件。只有落盘成功后，Manager 才发布新的内存快照；失败时清理临时文件并保留原内存/磁盘状态。

Manager 通过内部同步边界串行化同一进程中的转换，避免两个写入互相覆盖。具体锁类型属于实现选择，但不得在一次失败写入后暴露未持久化状态。

备选方案是先更新内存再异步落盘，但崩溃或写入失败会使调用方观察到无法恢复的状态，予以拒绝。

### 5. 诊断稳定、安全且有界

Plugin Manager 诊断使用 Host 私有结构，至少包含稳定 machine-readable code、阶段和安全 message；不得保存原始异常对象、栈、插件内容或不必要的敏感路径。健康记录最多保留最近 32 条，按产生顺序淘汰最旧项。恢复期 quarantine stub 至少保存导致隔离的当前诊断。

Task 2.2 可以在此基础上选择哪些诊断字段进入公共 payload，但不得直接暴露私有错误对象。

### 6. Tauri setup 只初始化并托管核心，不新增前端边界

应用 setup 解析配置目录、恢复 Store、构造线程安全 Manager 并通过 `app.manage(...)` 注册。Manager 恢复报告保留在 Host 内部供测试和后续诊断边界消费。本 change 不增加 `invoke_handler` command，因此前端行为不变。

### 7. 不增加新 Runtime 依赖

实现复用 Rust 标准库、现有 `serde`/`serde_json`、Tauri path API 和当前 Manifest 兼容性逻辑。文件名编码、临时文件生成和测试目录辅助使用项目内实现；若实施过程中确需新依赖，必须先更新本 design 并说明其必要性。

## Risks / Trade-offs

- **[逐插件文件无法提供跨插件事务]** → 本 change 的转换以单插件为原子边界；未来批量安装或升级若需要跨记录事务，应在对应生命周期 change 中设计 journal，而不是在此预建。
- **[保留损坏文件会重复产生恢复诊断]** → quarantine stub 对同一 record key 聚合当前启动诊断，健康记录的历史列表保持 32 条上限。
- **[format version 1 未来需要迁移]** → 文件从第一版携带显式版本；本 change 不猜测迁移。未来 change 增加先读取、验证、原子替换的显式迁移器。
- **[配置目录整体不可读时插件状态暂不可用]** → Host 进入 degraded 空集合并保留 manager-level 诊断，不阻止应用启动，也不覆盖不可读数据。
- **[当前只提供 inactive Runtime 状态]** → 文档和类型明确它不是 Runtime 交付；真正 session 状态与转换由 Milestone 4 扩展。
- **[权限 ID 快照尚无完整语义]** → 默认空且无授权入口，避免 Manifest 请求自动变成 grant；Task 5.5 再建立可变更规则。

## Migration Plan

1. 新增 Plugin Manager 类型、Store 和纯 Rust 测试，不读取现有偏好或 Launcher collection 文件。
2. 在 Tauri setup 中恢复并 manage 新核心；首次运行没有 Plugin Manager 目录时返回空状态且不写文件。
3. 更新双语架构文档，明确 shipped 与 unimplemented 边界。
4. 当前不存在旧 Plugin Manager 数据，因此不迁移任何用户文件。

回滚时可移除 Tauri managed state 和对应 Rust 模块；由于本 change 没有生产安装入口，版本 1 目录应为空或仅包含测试/开发注入产生的数据。回滚不得自动删除用户目录；重新应用后仍可读取支持的版本 1 记录。

## Open Questions

- 无。公共 registration payload、source 的跨语言枚举、真实包摘要算法、Runtime 状态机和权限变更 API 均由各自后续 change 决定，不是本 change 的阻塞问题。
