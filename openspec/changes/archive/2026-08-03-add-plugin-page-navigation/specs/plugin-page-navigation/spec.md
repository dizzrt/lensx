## ADDED Requirements

### Requirement: Plugin Pages must project into stable Host-owned descriptors

系统 MUST 从当前、已验证的 Plugin Registration detail 将规范化 Manifest Pages 投影为 Host-private Page descriptors。每个插件 Page 的稳定全局 identity MUST 是 `{ owner_id: manifest.plugin_id, page_id: plugin-local Page ID }`；系统 MUST NOT 创建第二套 author-controlled 或拼接 Page identity。descriptor MUST 保留当前 locale 可解析的 Page title、插件内部 route、同 owner parent target、required permission IDs 和 Host-derived availability，但 route、permission、Publisher、安装路径和 Runtime entry MUST NOT 进入 `ActivePage`、Launcher Action descriptor 或展示 props。

#### Scenario: Project a plugin Page graph

- **WHEN** 一个当前合格插件贡献 `home` Page 和以 `home` 为 parent 的 `settings` Page
- **THEN** 两个 descriptor 的 `owner_id` 都等于该插件 ID，`page_id` 分别保持 `home` 与 `settings`
- **THEN** `settings` 的 parent target 指向同一 owner 的 `home`
- **THEN** 系统不生成另一套全局 Page ID、breadcrumb 或 Router state

#### Scenario: Keep sensitive navigation metadata private

- **WHEN** Host 解析一个已投影 Page 用于导航和展示
- **THEN** `ActivePage` 只包含 owner ID、Page ID 和 opening Action ID
- **THEN** route、permission IDs、安装路径、Runtime entry、executor 和 Host 对象不进入 Launcher snapshot、React 展示 props 或公共错误

### Requirement: Plugin Page Registry must replace provider batches atomically

系统 MUST 提供一个可信 Host-owned Page Registry，以插件 owner 为单位原子替换或注销完整 descriptor batch，并与受保护 Host Pages 共用统一 lookup。Registry MUST 校验 declared owner、每个 target、parent owner、重复 identity、descriptor 字段和 `lensx.core` 隔离；任一输入无效时 MUST 拒绝整批并保留调用前状态。snapshot 与 lookup MUST 返回不可变副本并按 owner ID、Page ID 确定性排序，且 MUST NOT 暴露 provider bookkeeping 或 mutation API 给插件。

#### Scenario: Replace one plugin Page batch

- **WHEN** 可信 projection 提交属于同一插件 owner 的完整有效 Page batch
- **THEN** Registry 在一次 transition 中移除该 owner 的旧 descriptors 并提交完整新 batch
- **THEN** lookup 不会观察到同一 owner 新旧 Page graph 的部分混合
- **THEN** 其他插件和 `lensx.core/settings` 保持不变

#### Scenario: Reject an invalid or cross-owner batch

- **WHEN** 一个 replacement 包含重复 target、跨 owner parent、错误 owner 或尝试替换 `lensx.core` 的 descriptor
- **THEN** Registry 拒绝完整 batch 并返回确定性安全诊断
- **THEN** 完整调用前状态保持不变

#### Scenario: Unregister one plugin provider

- **WHEN** 可信 projection 以空 batch 注销一个插件 owner
- **THEN** Registry 只移除该 owner 的全部 Plugin Page descriptors
- **THEN** 其他 provider 和受保护 Host Pages 保持可用

### Requirement: Page availability must fail closed from current Registration facts

系统 MUST 仅为 snapshot/detail identity 和 revision 一致、Registration 可用、enabled 且 lensX/Host API compatible 的插件保留 Page provider。对每个合格 provider，Page MUST 仅在其全部 `required_permissions` 都存在于当前 Host-owned `granted_permission_ids` snapshot 时 available。该判断 MUST 只是当前事实的集合包含检查，不得授予权限、建立 permission catalog、信任 builtin provenance 或宣称 session 权限已经实现。Action publication MUST 排除目标 Page 当前 unavailable 的 Action。

#### Scenario: A Page requires no permission

- **WHEN** 当前合格插件的 Page 没有 required permission
- **THEN** Page descriptor 被标记为 available
- **THEN** 指向该 Page 的有效 Action 可以进入后续 production publication

#### Scenario: A Page lacks a required grant

- **WHEN** Page 声明的至少一个 required permission 不在当前 Host grant snapshot 中
- **THEN** descriptor 保留在该 provider 的 Page graph 中但被标记为 unavailable
- **THEN** navigation 拒绝该 Page，且目标为该 Page 的 Action 不进入可执行 Registry snapshot
- **THEN** 系统不自动创建 grant 或权限提示

#### Scenario: A plugin becomes ineligible or Registration degrades

- **WHEN** 插件被禁用、变为不兼容、被隔离、从 snapshot 消失，或 Registration availability 变为 degraded
- **THEN** 系统 fail closed 撤下受影响的 Plugin Actions 与 Pages
- **THEN** 其他合格插件和 Host Pages 保持可用

### Requirement: Page and Action projection must converge from one Registration revision

production 系统 MUST 使用一个串行 coordinator 从同一 complete Registration snapshot 和同 revision detail 生成 Plugin Page 与 Action batches。新增或替换时 MUST 先提交 Page batch，再发布只指向 available Page 的 Action batch；失效或移除时 MUST 先注销 Action batch，再注销 Page batch。stale detail、identity/revision mismatch、mapping failure、Registry failure 或 destroy 后结果 MUST NOT 发布部分 provider 状态；失败 MUST 只令对应 provider fail closed，并产生不含敏感值的有界诊断。

#### Scenario: Publish a current plugin surface

- **WHEN** coordinator 收到一个当前 complete snapshot 并读取到同 revision、identity 一致的合格 detail
- **THEN** 它先原子提交该 provider 的完整 Page batch
- **THEN** 它再原子提交仅指向 available Pages 的完整 Action batch
- **THEN** 任一可执行插件 Action 都能通过 Page Registry 预检其 target

#### Scenario: Remove or invalidate a provider

- **WHEN** 当前 snapshot 表明一个已知 provider 消失或不再合格
- **THEN** coordinator 先撤下该 provider 的完整 Action batch，再撤下完整 Page batch
- **THEN** persisted recent/pinned Action IDs 不被删除，其他 provider 不受影响

#### Scenario: A commit or detail fails

- **WHEN** detail 读取、identity/revision 校验、Page mapping、Page replacement 或 Action replacement 失败
- **THEN** coordinator 撤下该 provider 的 Plugin Actions 与 Pages 并报告安全诊断
- **THEN** 不暴露 route、安装路径、raw error、stack、Tauri object 或 Rust value

#### Scenario: Refresh recovery supersedes stale work

- **WHEN** changed event 丢失、Launcher activation、listener recovery 或更高 revision 的 complete snapshot 触发刷新
- **THEN** coordinator 串行收敛到最新可观察 revision 并丢弃旧 detail 结果
- **THEN** destroy 后的异步结果不能重新提交任何 Page 或 Action

### Requirement: Plugin Page navigation must remain framework-neutral and Host-controlled

系统 MUST 通过统一 framework-neutral application navigation service 接收 `{ owner_id, page_id }` 和 opening Action ID。service MUST 在通知唯一 App Shell handler 前从 Page Registry lookup 当前 available descriptor；未知、unavailable 或已移除 Page MUST 使用稳定安全的 `page_unavailable` 语义拒绝。插件、Manifest、Action descriptor 和 projection payload MUST NOT 获得 React setter、navigation handler、route executor、Registry mutation、Tauri API 或 Page renderer。

#### Scenario: Open an available Plugin Page

- **WHEN** Dispatcher 执行一个 Host 合成的插件 Action executor，且其 target 在 Page Registry 中当前 available
- **THEN** navigation service 向 App Shell 发出包含正确 owner ID、Page ID 和 opening Action ID 的扁平 `ActivePage`
- **THEN** Dispatcher 保持现有 typed success 语义
- **THEN** React result component 和插件均未接收 executor 或 setter

#### Scenario: Reject an unavailable target

- **WHEN** target 未知、unavailable、已移除或 navigation handler 不可用
- **THEN** navigation service 不改变当前 App Shell presentation
- **THEN** 插件 Action 失败继续由统一 Dispatcher 收敛为 `action_execution_failed`
- **THEN** public result 不区分可用于枚举插件状态的内部失败原因

### Requirement: Plugin Page presentation must resolve current localized metadata safely

系统 MUST 在渲染 shared page context 前，根据当前 Page descriptor、当前 locale 和 Launcher Registry snapshot 解析序列化展示信息。插件 Owner name MUST 使用 Registration display name 并按 `zh-CN` 到 `en-US` fallback；opening Action 存在时 MUST 使用其当前 locale title，缺失时 MUST 回退 Page title。插件 Owner icon MUST 在安全资源 resolver 交付前使用 stable generic-provider fallback，且 MUST NOT 使用 opening Action icon、Manifest asset path 或 Publisher identity。

#### Scenario: Resolve a Plugin Page context

- **WHEN** 一个插件 Page 由仍在 Launcher Registry 中的 Action 打开
- **THEN** shared context 显示当前 locale 的插件 Owner name 和 opening Action title
- **THEN** Owner icon 使用 generic-provider fallback，Owner 与 Action segments 保持非交互

#### Scenario: Opening Action disappears or locale changes

- **WHEN** Page 保持 active 但 opening Action 被注销，或用户切换应用 locale
- **THEN** context 使用当前 locale 的 Page title 作为缺失 Action fallback
- **THEN** Owner/Page/Action 字符串从当前 descriptors 重新解析而不是读取 `ActivePage` 中的 stale copy

#### Scenario: Presentation metadata cannot be resolved

- **WHEN** active target 已无法从当前 Page Registry 解析
- **THEN** 系统关闭该 active Page 并返回 Home，而不是展示 raw owner ID、route 或 stale author text

### Requirement: Runtime-free Plugin Pages must use the existing single-window surface

在隔离 iframe Runtime 尚未交付时，系统 MUST 在现有 Tauri main window 的 `page` presentation 中为 available Plugin Page 渲染 Host-owned placeholder。placeholder MUST 使用应用 i18n、Semi Design、现有 light/dark theme 和 PageErrorBoundary，MUST 显示可解析 Page title 和非误导性的 Runtime unavailable 说明，并 MUST 保留 shared context close button。它 MUST NOT 加载 Manifest route、Runtime entry、package asset、iframe 或插件代码，也 MUST NOT 提供安装、权限、管理或重试操作。

#### Scenario: Display a Runtime-free Plugin Page

- **WHEN** 一个 available Plugin Page 导航成功且 iframe Runtime 尚未实现
- **THEN** App Shell 进入现有 `page` presentation 并显示 Host-owned localized placeholder
- **THEN** 页面不是 Host Settings，也不执行任何插件资源或代码
- **THEN** 英文、简体中文、light 和 dark composition 使用现有应用 providers

#### Scenario: Close a Plugin Page manually

- **WHEN** 用户通过 shared context 的可访问 close button 关闭插件 Page
- **THEN** App Shell 返回 `home` presentation、清空查询和选择并恢复 Launcher input 焦点
- **THEN** 关闭行为与 Host Settings 保持一致，不创建窗口历史或 Router stack

### Requirement: Active Plugin Pages must close when their descriptor becomes unavailable

系统 MUST 在 Page Registry replacement 后重新验证当前 active Plugin Page。若 target 已移除或其 availability 变为 false，Host-owned navigation invalidation MUST 关闭该 Page、返回 Home 并恢复安全的 Launcher state；插件不得接收或调用 invalidation handler。只改变 title、Owner presentation、parent、route 或保持 available 的 grant snapshot MUST NOT 无故关闭相同 identity 的 active Page。

#### Scenario: An active Page loses availability

- **WHEN** 新 Registration revision 移除 active Page、撤销其所需 grant，或使其 provider 不再合格
- **THEN** Host navigation 边界关闭 active Page 并返回 Home
- **THEN** 已注销插件代码没有执行机会，其他 provider 的 active/registered state 不受影响

#### Scenario: Active Page metadata changes without losing availability

- **WHEN** 相同 `{ owner_id, page_id }` 的 title、parent 或其他 descriptor metadata 更新但 Page 仍 available
- **THEN** active Page identity 保持打开并使用最新可解析 presentation
- **THEN** 系统不创建第二个 page state 或 navigation history entry

### Requirement: Plugin Page navigation delivery must not claim Runtime or lifecycle capabilities

本 capability MUST 只交付 Host-private Page projection/Registry、production Action coordination、framework-neutral navigation、presentation resolution、Host placeholder、invalidation、测试和维护文档。它 MUST NOT 安装、启用、禁用、卸载或执行插件，不得创建安全资源 URL、iframe、Runtime session、Host API transport、permission grant decision 或插件管理 UI。

#### Scenario: Only Task 2.4 is complete

- **WHEN** Plugin Page navigation change 通过全部验证而后续 Runtime 与 lifecycle Tasks 尚未实现
- **THEN** 用户可以通过已发布插件 Action 导航到一个受预检的 Host-owned placeholder 并安全关闭
- **THEN** 没有插件 HTML、JavaScript、资源、RPC 或 privileged capability 因该导航而执行
