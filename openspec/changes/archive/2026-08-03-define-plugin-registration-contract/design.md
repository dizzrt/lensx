## Context

Task 2.1 已交付一个由 Tauri managed state 持有的 Rust Plugin Manager。它把 normalized Manifest、持久化 Host registration facts、按当前 Host 版本派生的 compatibility、quarantine stub 与进程内 Runtime state 分层保存，并保证逐插件原子落盘和容错恢复。当前 snapshot 只存在于 Rust 私有内存中；应用没有 Plugin Manager Tauri command、TypeScript registration payload 或变化事件。

Task 2.2 位于该私有事实源和后续 Action/Page 投影、安装生命周期及管理界面之间。这里的消费者是 lensX Host 和应用前端，不是运行在 iframe 中的插件。边界必须允许后续消费者读取同一份 Host 事实，同时不能泄露安装绝对路径、原始损坏记录或私有错误，也不能把未实现的签名、生命周期或 Runtime 能力伪装成已交付状态。

数据流如下：

```text
author input
    │ validate / normalize
    ▼
normalized Manifest ─────┐
                         ├─▶ Rust Plugin Manager ─▶ safe registration read model
Host registration facts ┘          │                         │
                                   │ successful commit       ├─▶ Tauri query commands
                                   └─ revision + change ─────└─▶ changed event
                                                                  │
                                                                  ▼
                                                         TypeScript validator
                                                                  │
                                                                  ▼
                                                     future Host UI/projections
```

## Goals / Non-Goals

**Goals:**

- 建立唯一、版本化、可序列化且 Host-owned 的 Registration Contract，供 Rust、Tauri 与根应用 TypeScript 共享。
- 提供完整列表 snapshot、单条详情、稳定查询错误和 snapshot-changed 通知。
- 让健康注册与 quarantine stub 都可安全观察，并保持 enabled、compatibility、quarantine、permission grant 和 Runtime status 彼此独立。
- 在 Tauri 两端验证 unknown payload，并以共享 fixtures 阻止 Rust/TypeScript contract drift。
- 保证前端在事件丢失、监听建立竞态或重新连接后，可以通过完整 snapshot 恢复，而不依赖事件重放。
- 保持 Plugin Manager 为唯一事实源，并保持“先持久化、后发布内存、最后通知消费者”的可观察顺序。

**Non-Goals:**

- 不把 Registration Contract 加入 `@lensx/plugin-contract`、`@lensx/plugin-sdk` 或任何插件可访问入口。
- 不提供安装、升级、卸载、enable/disable、清除 quarantine 或权限授权 Tauri command。
- 不投影 Action/Page，不新增搜索或导航分支，也不实现插件管理 UI。
- 不定义真实 Runtime session 状态机、iframe、RPC、Host API 或插件执行路径。
- 不定义签名格式、签名验证或 trusted provenance；本阶段 payload 不包含可能被误解为信任结论的 signature 字段。
- 不增加独立通用状态平台、事件日志、patch 协议、跨进程 revision 或历史重放机制。

## Decisions

### 1. Contract 是 Host 私有应用边界，而不是公共插件 package

Registration 类型由 Rust Host 和根应用的私有 TypeScript 模块消费。TypeScript 可以复用 `@lensx/plugin-contract` 已公开的 normalized Manifest 类型，但 registered read model、查询 adapter、事件和错误不得从公共 plugin packages 导出，workspace 插件也不得导入它们。

这样可以避免把安装与 Host 状态误当成插件作者 API，也不会为了一个应用内部 Tauri 边界新增 `plugin-host-contract` package。备选方案是扩展 `@lensx/plugin-contract`；它会扩大公开 tarball 与 SemVer 责任，并让不可信插件看到无权调用的 Host 管理协议，因此拒绝。

### 2. 使用四层类型，registered payload 只接受 Host 组合结果

边界保持以下层次：

1. `PluginManifestInput`：作者 wire input，只用于校验入口；
2. `NormalizedPluginManifest`：作者数据和确定性默认值；
3. `PluginRegistrationSummary` / `PluginRegistrationDetail`：Host 组合的只读 read model；
4. `PluginRuntimeStatus`：当前只允许 `inactive` 的瞬时 Host 状态。

健康详情包含 normalized Manifest，以及安全投影后的 `source`、`enabled`、逐维 compatibility、排序去重的 granted permission IDs、`inactive` Runtime status 和安全诊断。quarantine 详情是独立的 discriminated variant，只包含 opaque entry identity、可选 plugin ID 和安全隔离诊断；它不尝试解析或回传损坏记录。

当前 `source` 沿用 Plugin Manager 已实现的 `builtin | external`。不增加独立 lifecycle enum、`disableable`/`uninstallable`、active Runtime variant 或 signature 状态；对应生产者和状态转换由后续 change 定义。备选方案是现在预留大量 nullable/unknown 字段，但这会把未实现能力固化为公共事实，予以拒绝。

### 3. 列表 snapshot 与详情分离，并执行最小披露

`PluginRegistrationSnapshot` 包含 contract version、当前进程内 revision、manager availability/degraded 摘要和按 opaque entry identity 确定性排序的 summary 列表。summary 只携带识别、展示和状态判断所需字段；详情通过只读 detail query 获取。

健康详情可以包含完整 normalized Manifest，供后续可信 Host 消费者进行 Action/Page 投影；不得包含安装绝对路径、包摘要、Store 文件名、私有错误对象或栈。quarantine 详情不得包含无法验证的 Manifest 或原始文件内容。所有列表和详情返回值均为新构造的序列化 read model，不直接暴露 Manager 内部对象引用。

让 snapshot 直接包含每个插件的完整详情会简化后续消费，但会让常用列表查询暴露和复制不必要数据。仅提供单条查询则无法原子观察集合成员和状态。因此选择 summary snapshot + detail query；收到变化通知后，消费者必须使 snapshot 和已有 detail cache 一并失效。

### 4. wire contract 独立版本化，revision 使用不透明十进制字符串

查询结果和事件均携带 Registration Contract version `0.1.0`，它独立于 Manifest version、Host API version、应用 version 和 Plugin Manager Store format。Rust 与 TypeScript 必须拒绝不支持的 contract version，不能静默猜测兼容。

revision 是当前进程内、单调递增的不透明十进制字符串。字符串避免 Rust 整数跨 JavaScript safe-integer 边界失真；它只用于判断 snapshot 是否可能过期，不表示时间、持久化序号或跨重启顺序。应用重启后 revision 可以重新开始，新的前端连接必须读取 snapshot，不能拿旧进程 revision 比较。

### 5. 只提供两个查询 command 和一个失效通知

Tauri 边界提供：

- 读取完整 `PluginRegistrationSnapshot`；
- 按 opaque entry identity 读取 `PluginRegistrationDetail`；
- `plugin-registration://snapshot-changed` 变化通知。

detail 查询不存在条目时返回稳定 `not_found` 错误。查询不可用、请求非法或边界内部失败必须映射为 `{ code, operation, message }` 的安全错误，不携带路径、原始异常或栈。Manager degraded recovery 是可观察 snapshot 状态，不因“当前没有健康插件”自动变成 command error。

本 Task 不公开写 command。路线图中的“状态变更 payload”在这里解释为 Host 成功转换后的只读通知，而不是用户生命周期操作。备选方案是提前暴露 set-enabled；它会越过 Task 3.3 的生命周期与失败恢复语义，予以拒绝。

### 6. 事件是失效提示，snapshot 是恢复事实源

每次 Plugin Manager 成功持久化并发布新内存状态后，Host 才递增 revision 并发出 changed event。失败、无效或未改变状态的转换不得递增 revision 或发事件。事件只包含 contract version 和新 revision，不携带增量 entry、Manifest 或 patch。

TypeScript adapter 使用“先订阅、再读取”的初始化顺序。如果订阅建立后、首次读取完成前收到事件，或者事件 revision 与刚读取的 snapshot revision 不同，adapter 必须再次读取；并发通知合并为串行刷新，直到 snapshot revision 与最近观察到的 event revision 一致。窗口重新激活、adapter 重建或监听失败恢复后也读取完整 snapshot。

这种模型允许 Tauri event 丢失而不永久漂移，也避免维护 patch 顺序、删除 tombstone 和重放日志。代价是每次变化会重新读取小型插件列表；首阶段插件数量和变更频率很低，可以接受。

### 7. Rust wire structs 是发送边界，TypeScript 从 unknown 显式校验

Rust 使用专用可序列化 read-model structs，不直接给内部 `PluginRegistration` 添加跨边界职责。根应用 TypeScript 维护对应 readonly 类型和无副作用的 runtime parser；所有 `invoke` 返回值和 Tauri event payload 都先以 `unknown` 接收，再检查精确字段、枚举、排序/唯一性、contract version 和 variant 不变量。

跨语言共享 fixtures 覆盖空、健康、incompatible、disabled、quarantined、degraded、未知字段、错误版本、错误 variant、未排序 grant 和敏感字段泄漏。Rust 序列化测试与 TypeScript parser 读取相同 fixtures，根级专用检查组合两端测试。沿用现有依赖和显式校验模式，不新增 Runtime dependency，也不把私有 schema 放进公共 plugin tarball。

### 8. 后续消费者只能复用 read model，不建立第二份注册状态

Task 2.3/2.4 和未来管理 UI 可以订阅同一个 adapter 并读取 snapshot/detail，但不能把前端 cache、Launcher Registry 或 UI 状态变成新的注册事实源。Action/Page 投影、用户生命周期操作、权限决策和 Runtime session 扩展必须在各自 change 中增加明确的 contract version 与场景，而不是偷偷复用 author Manifest 字段。

## Risks / Trade-offs

- **[summary 与 detail 可能短暂来自不同 revision]** → detail 响应携带当前 revision；adapter 发现与已缓存 snapshot 不同就使两者失效并重新读取。
- **[Tauri event 可能丢失或乱序]** → 事件只用于失效，初始化、重连和窗口重新激活均读取 snapshot；revision 不匹配触发再次读取。
- **[未来新增 Runtime/lifecycle/signature variant 会改变契约]** → 使用独立 contract version，并在对应生产能力存在时显式升级，不预留含义不明字段。
- **[手写 Rust/TypeScript 模型可能 drift]** → 共享正反 fixtures、严格 unknown-field 校验和专用根级 gate 同时约束两端。
- **[详情包含 normalized Manifest 仍可能比当前 UI 所需更多]** → 详情仅供可信根应用消费者按需读取，列表保持最小；workspace boundary 继续禁止插件导入 Host 私有模块。
- **[全量刷新比增量 patch 成本高]** → 首阶段数据量和变化频率低；保持协议简单、一致和可恢复优先，只有测量证明需要时再单独设计增量协议。

## Migration Plan

1. 在不改变现有 Store format 的前提下，为 Plugin Manager 增加 read-model snapshot/revision 与成功转换通知能力。
2. 增加 Rust Tauri 查询命令和 changed event，并以 Host 内部转换测试验证发布顺序。
3. 增加私有 TypeScript 类型、parser 和 desktop adapter；当前前端不渲染新的插件 UI。
4. 增加共享 fixtures、专用 drift gate与中英文架构文档，再执行完整前后端验证。

该能力尚无旧前端 API 或持久化 wire payload，因此不需要数据迁移。若上线验证失败，可移除新 command、listener 和 TypeScript adapter；现有 Plugin Manager Store 与 Launcher 行为保持不变，不需要回滚用户记录。

## Open Questions

无。签名、完整生命周期、真实 Runtime variants、权限决策和写 command 已明确推迟到各自后续 change，不作为本 Task 的待定实现选择。
