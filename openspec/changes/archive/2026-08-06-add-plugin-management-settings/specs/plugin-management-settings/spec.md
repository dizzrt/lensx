## ADDED Requirements

### Requirement: Host 设置 MUST 展示 current 的插件列表与详情

系统 MUST 在 `lensx.core/settings` 的 Plugins 区展示由 current Registration snapshot 产生的真实列表，并允许用户选择条目读取相同 revision 的 detail。健康条目 MUST 展示名称、版本、Host source、enabled intent、lensX/Host API compatibility 和 Runtime 摘要；健康详情 MUST 分开展示 Manifest requested permissions、Host grant/effective permission state 与 bounded safe diagnostics。隔离条目 MUST 只展示 Host 可证明的 identity 与安全诊断，不得猜测 Manifest、来源、权限或兼容性。

#### Scenario: 查看健康插件
- **WHEN** current snapshot 包含一个健康 Registration，且相同 revision 的 detail 读取成功
- **THEN** Plugins 区展示该插件的真实摘要和详情，并保持 requested、supported、granted 与 effective permission facts 分离
- **THEN** 页面不把 Publisher 文本、Host source 或 enabled intent 表示为签名、信任或授权

#### Scenario: 查看隔离条目
- **WHEN** current snapshot 包含一个 quarantined entry
- **THEN** 列表与详情只展示可证明的 identity 和 bounded safe diagnostic
- **THEN** 页面不伪造名称、版本、权限、兼容性或 Runtime 状态

### Requirement: 管理页 MUST 对空、加载、降级与过期状态 fail closed

管理页 MUST 从完整 snapshot 初始化，并订阅 Registration invalidation 后执行完整重读。空 Manager MUST 呈现真实 empty state 和本地安装入口；Manager degraded、snapshot/detail 读取失败或 detail revision 不匹配 MUST 呈现可重试状态，不得混合旧 list 与新 detail，也不得以空列表掩盖降级。选择 MUST 以 opaque `entry_id` 绑定 current snapshot，并在条目消失时确定性恢复。

#### Scenario: 没有已安装插件
- **WHEN** current available snapshot 的 entries 为空
- **THEN** 页面显示本地化 empty state 和可访问的“从本地文件安装”操作
- **THEN** 页面不显示 fabricated plugin、错误或 marketplace 内容

#### Scenario: Manager 降级
- **WHEN** Registration snapshot 报告 degraded availability
- **THEN** 页面展示安全、可操作的降级反馈和重试入口
- **THEN** 所有写操作保持不可用，且 degraded 不被渲染为普通空列表

#### Scenario: 详情与列表 revision 不一致
- **WHEN** detail response 的 revision 不等于用于选择该条目的 current snapshot revision
- **THEN** 页面丢弃该 detail 并通过共享 adapter 重新读取完整状态
- **THEN** 页面不显示跨 revision 拼接的详情或允许基于旧确认提交写操作

### Requirement: 生命周期与本地替换 MUST 只通过 typed Host services 执行

管理页 MUST 通过 root-private typed services 执行本地安装、启用、禁用、替换与卸载，并且每个 entry mutation MUST 绑定 current opaque entry ID 和 expected Registration revision。同一管理页同一时刻 MUST 至多有一个 mutation；pending 状态 MUST 防止重复提交。成功后 service MUST 等待返回 revision 收敛到 shared snapshot；冲突 MUST 刷新状态并要求用户重新确认，不得自动重放 destructive action。

#### Scenario: 禁用一个 current 插件
- **WHEN** 用户确认禁用 current、可管理的健康插件
- **THEN** 页面通过现有 lifecycle service quiesce surfaces、提交 revision-bound disable 并等待 snapshot 收敛
- **THEN** React 不直接调用 Plugin Manager 或自行模拟 disabled 状态

#### Scenario: 本地替换需要确认
- **WHEN** replacement prepare 返回 `upgrade`、`downgrade` 或 `reinstall` 以及 permission diff
- **THEN** 页面在 commit 前展示 from/to version、classification 和 added/removed permission IDs 并要求显式确认
- **THEN** added permissions 保持未授权，页面不调用 grant mutation

#### Scenario: 写入发生 revision conflict
- **WHEN** 用户确认后目标 Registration revision 已变化
- **THEN** service 拒绝旧请求，页面关闭过期确认、刷新完整 snapshot 并显示本地化冲突反馈
- **THEN** 页面不把旧动作自动应用到刷新后的插件状态

### Requirement: 卸载 MUST 明确数据策略并区分 logical success 与 cleanup

卸载确认 MUST 明确提供 `retain_data` 与 `delete_data`，默认 MUST 为 `retain_data`；两种选择都 MUST 清楚说明 Registration、program payload、grants、diagnostics 与 private data 的不同结果。管理页 MUST 使用 lifecycle service 的真实结果，并在 `cleanup_pending=true` 时说明插件已逻辑卸载但 Host 仍将恢复清理，不得把 pending cleanup 表示为未卸载或完全清理成功。

#### Scenario: 默认保留数据卸载
- **WHEN** 用户打开卸载确认但未显式选择删除数据
- **THEN** 确认采用 `retain_data` 并说明同 identity 重新安装后数据可能再次可见
- **THEN** 提交仍需要用户显式确认，且不会静默升级为 `delete_data`

#### Scenario: 删除数据卸载存在 pending cleanup
- **WHEN** 用户确认 `delete_data` 且 Host 返回 logical uninstall success 与 `cleanup_pending=true`
- **THEN** 条目按 current snapshot 从列表移除，页面说明卸载已生效且清理将在受控恢复中继续
- **THEN** 页面不声称数据已经全部删除，也不显示内部路径或清理证据

### Requirement: 清除数据 MUST 保持插件安装并要求 disabled current identity

管理页 MUST 为健康、已禁用、current 且 Host 可安全管理的插件提供独立“清除数据”操作。该操作 MUST 只把当前 scoped storage 重置为 canonical empty store，MUST 保留 Registration、Manifest、program payload、source、enabled intent、grants 和 diagnostics。启用中、隔离、过期、Manager/Installer degraded 或 ownership 不安全的目标 MUST fail closed。

#### Scenario: 清除已禁用插件的数据
- **WHEN** 用户在危险确认中确认清除一个 current、健康、已禁用插件的 scoped storage
- **THEN** Host 通过 private typed data-management service 原子重置该 namespace，并返回 `changed=true` 或幂等 `changed=false`
- **THEN** 插件仍保持安装和禁用，Registration revision 与其他 Host facts 不因数据内容改变

#### Scenario: 尝试清除启用中插件的数据
- **WHEN** 用户或过期 UI 对 enabled Registration 请求清除数据
- **THEN** Host 拒绝操作并返回稳定安全错误，页面提示必须先禁用插件
- **THEN** Runtime 不会在清除过程中继续写入或重新创建数据

### Requirement: 权限与诊断展示 MUST 保持只读和最小披露

Task 6.1 的管理页 MUST 只展示 current requested、supported、granted 与 effective permission states，不得提供 grant、revoke、默认全选或权限风险确认控件。页面 MUST 只把闭合 error/diagnostic code 映射为本地化、可操作反馈，不得展示 raw error、stack、绝对路径、digest、Store key、损坏记录、storage key/value、Tauri/Rust 对象或插件 payload。

#### Scenario: 插件请求但未获授权的权限
- **WHEN** Manifest 请求一个 supported permission 但 grant snapshot 不包含它
- **THEN** 详情将其显示为 requested 且 not granted，而不是可用或可信
- **THEN** 页面不提供授权控件，并把授权交互留给后续 permission prompt capability

#### Scenario: Host operation 返回安全错误
- **WHEN** typed service 返回一个已验证的稳定错误码
- **THEN** 页面显示当前 locale 的可操作反馈并允许适当重试或刷新
- **THEN** raw native message、路径、stack 与未验证 payload 不进入 DOM、日志证据或无障碍公告

### Requirement: 管理页 MUST 支持双语、主题、键盘与确定性焦点恢复

所有用户可见 copy MUST 以 English 为 canonical，并提供语义一致的 Simplified Chinese；页面 MUST 复用应用 i18n、Semi Design locale/theme 与固定 Host page surface。列表选择、安装、重试、启用、禁用、替换、卸载、清除数据和确认/取消 MUST 可仅用键盘完成，具有可见焦点与可访问名称。pending、success、error、compatibility 和 enabled state MUST 通过文本与语义表达，不得只依赖颜色。

#### Scenario: 使用键盘完成并取消危险确认
- **WHEN** 键盘用户从选中插件打开卸载或清除数据确认并取消
- **THEN** Modal 具有可访问标题、描述和明确的 destructive/取消动作
- **THEN** 关闭后焦点返回原触发按钮，页面选择和滚动上下文保持

#### Scenario: 当前条目在操作后消失
- **WHEN** 卸载成功使当前选中 entry 从 current snapshot 消失
- **THEN** 页面将焦点和选择移动到确定的相邻 entry；若列表为空则移动到安装入口
- **THEN** 焦点不落到已卸载 DOM、非交互 placeholder 或页面外

#### Scenario: 切换 locale 与主题
- **WHEN** 管理页在 `en-US`/`zh-CN` 与 light/dark 间切换
- **THEN** 列表、详情、状态、确认、错误与无障碍名称同步使用当前 locale 和受支持 theme token
- **THEN** 固定 native viewport 内无关键信息截断、对比度丢失、叠层或依赖硬编码颜色的状态

### Requirement: 插件管理能力 MUST 保持 Host-private 并具备聚焦门禁

管理 contract、adapters、services、view model 与 data-clear 命令 MUST 只存在于 Rust Host、Tauri private boundary 和 trusted root application，不得导出到 `@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-ui`、`@lensx/plugin-testkit`、官方/示例插件或 iframe Runtime。交付 MUST 提供聚焦门禁，覆盖 Rust/TypeScript wire drift、public package/workspace boundaries、service orchestration、UI 状态、i18n、主题、键盘、焦点和固定 native viewport 的视觉验收。

#### Scenario: 插件尝试导入管理能力
- **WHEN** 官方插件、示例插件或外部 tarball consumer 尝试导入 management service、data-clear contract、desktop adapter 或 Tauri command types
- **THEN** workspace/public-package boundary gate 拒绝该依赖
- **THEN** 插件无法列举其他插件、改变生命周期、清除数据或读取诊断

#### Scenario: 运行聚焦交付门禁
- **WHEN** 维护者运行插件管理设置的聚焦验证命令
- **THEN** contract fixtures、Rust 与 TypeScript tests、service/UI tests、boundary checks、双语 light/dark keyboard states 和固定 viewport screenshots/computed styles 全部通过
- **THEN** 聚焦门禁不替代完整 frontend 与 Rust 最终验证
