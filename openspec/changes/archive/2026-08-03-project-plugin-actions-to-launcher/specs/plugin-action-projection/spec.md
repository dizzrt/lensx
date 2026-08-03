## ADDED Requirements

### Requirement: Plugin Action projection MUST consume only current Host registration facts

系统 MUST 以 Plugin Registration Adapter 发布的完整 snapshot 和对应 detail 作为 Plugin Action 投影的唯一注册事实来源。只有 `kind = registered`、`enabled = true`、`compatibility.lensx = true`、`compatibility.host_api = true` 且来自同一当前 revision 的 entry 才能贡献 Launcher Action。`source`、publisher 声明、requested permission 或已有 grant MUST NOT 绕过这些资格条件。

#### Scenario: 健康且合格的插件进入候选投影

- **WHEN** 当前 snapshot 包含一个 enabled、双维度 compatible 的 registered entry，且对应 detail 在同一 revision 返回匹配的 plugin identity 和规范化 Manifest
- **THEN** 系统将该 Manifest 的 Action 集合作为该插件的完整候选批次
- **THEN** source 为 builtin 或 external 不改变映射、校验或执行边界

#### Scenario: 插件不可投影

- **WHEN** entry disabled、任一兼容维度为 false、处于 quarantine、已从 snapshot 消失，或 Manager availability 为 degraded
- **THEN** 系统不从该 entry 发布可执行 Launcher Action
- **THEN** 系统注销此前属于该插件的完整 Action 批次

#### Scenario: 注册集合为空

- **WHEN** 当前健康 snapshot 不包含任何可投影插件
- **THEN** Plugin Action 投影结果为空
- **THEN** 现有 Host built-in Action 保持注册且行为不变

### Requirement: Plugin Actions MUST map deterministically into the existing Launcher descriptor contract

系统 MUST 将每个规范化 Manifest Action 映射为现有 Launcher Action descriptor，其中 `owner_id` 等于 `plugin_id`，全局 `action_id` 等于 `<plugin_id>.<local_action_id>`，本地化 `title`、可选 `description` 和 locale-keyed `default_keywords` 保持其规范化值，且 `enabled` 等于 `true`。生成的 descriptor MUST 再经过现有 Launcher descriptor validation。Manifest 的 Page target、route、executor、函数或其他 provider-private 数据 MUST NOT 出现在 descriptor、Registry snapshot 或搜索结果中。

#### Scenario: 投影一个有效 Action

- **WHEN** `com.acme.notes` 插件贡献本地 Action `open_notes`，并指向该插件的 `home` Page
- **THEN** descriptor 使用 `owner_id = com.acme.notes` 和 `action_id = com.acme.notes.open_notes`
- **THEN** descriptor 保留该 Action 自有的本地化 metadata 和关键词并设置 `enabled = true`
- **THEN** 公开 descriptor 不包含 `home` Page target 或 executor

#### Scenario: 插件没有贡献 Action

- **WHEN** 一个合格插件的规范化 Manifest 包含空的 `contributes.actions`
- **THEN** 系统以空批次表示该 provider 当前没有 Launcher Action
- **THEN** 系统不根据插件存在、Page 集合或 `default_action_id` 创建隐式 Action

#### Scenario: default Action 不改变统一搜索

- **WHEN** Manifest 的 `contributes.launcher.default_action_id` 引用一个已投影 Action
- **THEN** 该字段不增加或删除 Registry Action，不改变 enabled 状态、匹配、评分、排序、recent 或 pinned
- **THEN** 搜索层不读取该 Manifest 字段或增加插件专用分支

### Requirement: Package-local plugin icons MUST fail safely to the existing generic Action icon

系统 MUST NOT 把 Manifest package-local asset path 作为 Host icon token、普通文件路径、任意 URL 或 React 对象投影到 Launcher descriptor。在安全插件资源服务和对应 Launcher icon contract 交付前，Plugin Action descriptor MUST 省略 Manifest asset icon，并由现有展示层使用稳定 generic Action fallback。Action title MUST 继续作为可访问名称。

#### Scenario: Manifest Action 声明 asset icon

- **WHEN** 一个有效 Manifest Action 声明 `{ kind: "asset", path: "assets/action.svg" }`
- **THEN** 投影 descriptor 不包含该 asset path 或伪造的 Host icon token
- **THEN** Launcher 使用现有 generic Action fallback 且 Action 的可访问名称不变

#### Scenario: Manifest Action 没有 icon

- **WHEN** 一个有效 Manifest Action 省略 icon
- **THEN** 投影 descriptor 同样省略 icon
- **THEN** 其搜索、排序、执行和 fallback 展示与声明未投影 asset icon 的 Action 一致

### Requirement: Plugin Action provider lifecycle MUST be revision-aware, atomic per plugin, and fail closed

系统 MUST 订阅现有 Registration Adapter 的完整 snapshot 恢复流，并以单个 `plugin_id` 的完整 Action 批次作为投影提交和故障隔离单位。detail response MUST 与候选 snapshot 的 revision、entry identity 和 plugin identity 一致；在异步处理期间已观察到更新 revision 时，旧结果 MUST NOT 提交。插件投影、detail 读取或 Registry replacement 失败时，系统 MUST 注销该插件旧批次并产生不泄露路径、栈、原始异常或 Host 对象的安全诊断。一个插件失败 MUST NOT 注销或阻止其他插件及 Host built-in Action。

#### Scenario: 同一插件的 Action 集合发生变化

- **WHEN** 新 revision 中一个合格插件删除旧 Action、修改已有 Action metadata 并增加新 Action
- **THEN** 系统以一个原子 replacement 提交该插件的新完整批次
- **THEN** Registry snapshot 不可观察到该插件半新半旧的 Action 集合

#### Scenario: detail 在刷新期间变成过期结果

- **WHEN** service 正在读取 revision `7` 的 detail 时观察到 revision `8` snapshot
- **THEN** revision `7` 的 detail 不得覆盖 Registry
- **THEN** service 从 revision `8` 的完整 snapshot/detail 重新收敛

#### Scenario: 一个插件的 detail 读取或投影失败

- **WHEN** 当前候选插件的 detail 查询失败、identity 不匹配或生成批次无法通过 Registry validation
- **THEN** 系统注销该插件此前的完整 Action 批次并报告安全诊断
- **THEN** 其他插件和 `lensx.core` Action 保持可用

#### Scenario: listener 恢复或 Launcher activation 触发完整刷新

- **WHEN** Registration Adapter 在 listener 恢复或 Launcher activation 后发布新的完整 snapshot
- **THEN** projection service 使用该 snapshot 重新核对每个已知 provider
- **THEN** 丢失的 event 不会使已注销或已变化的插件 Action 永久残留

### Requirement: Plugin Action execution MUST remain Host-owned and use the unified Dispatcher

系统 MUST 为每个 Page-only Manifest target 合成 Host-owned executor。executor MUST 只把冻结的 `{ owner_id: plugin_id, page_id: local_page_id }` 和全局 opening `action_id` 交给窄的 Host Page opener。投影 Action MUST 通过现有 Registry lookup 和 Dispatcher 执行，且成功、not found、unavailable 和 execution failure MUST 保持现有 typed dispatch 语义。插件 MUST NOT 提交、读取或直接调用 executor。

#### Scenario: Dispatcher 执行投影 Action

- **WHEN** Dispatcher 收到一个当前已注册 Plugin Action 的全局 `action_id`
- **THEN** Dispatcher 至多一次调用 Host 合成的 executor
- **THEN** Page opener 收到正确 plugin owner、插件本地 Page ID 和 opening Action ID

#### Scenario: Page opener 拒绝 target

- **WHEN** 注入的 Host Page opener 因 target 不可用而抛出或拒绝
- **THEN** 现有 Dispatcher 返回 `action_execution_failed`
- **THEN** 结果不暴露 Page route、异常栈、Tauri 对象或 Rust 内部值

#### Scenario: Task 2.4 尚未交付生产 Page 导航

- **WHEN** 生产环境尚无能够预检 Plugin Page 的 Page Registry/navigation 实现
- **THEN** 默认生产组合不启动 Plugin Action publication
- **THEN** 用户不会看到一个已知必然因缺少 Page Registry 而失败的 Plugin Action

### Requirement: Projected Actions MUST reuse search and collections without provider-specific behavior

投影成功的 Plugin Action MUST 仅通过唯一 Launcher Registry snapshot 进入现有 search、Dispatcher 和 Action collections resolution。搜索 MUST 对 Host 与 Plugin Action 使用相同的 locale fallback、匹配、评分、排序、enabled filter 和 result limit，且 MUST NOT 创建插件分区、source boost、推荐或 Marketplace 结果。recent/pinned MUST 继续只持久化稳定全局 Action ID；provider 暂时注销时 MUST 隐藏而不删除该 ID。

#### Scenario: 同一查询匹配 Host 和 Plugin Action

- **WHEN** Registry snapshot 中一个 Host Action 和一个 Plugin Action 都匹配当前查询
- **THEN** 搜索使用相同评分规则和 `action_id` tie-breaker 返回统一结果集合
- **THEN** 结果不暴露 provider-private Manifest、executor 或 registration detail

#### Scenario: 已固定的 Plugin Action 暂时注销后恢复

- **WHEN** 一个 pinned Plugin Action 因 provider 暂时不可用而从 Registry 注销，随后以相同全局 Action ID 重新投影
- **THEN** 不可用期间 home collections 隐藏该 Action 但保留 persisted ID
- **THEN** 重新投影后该真实 Action 可按现有 collections 解析规则恢复显示
