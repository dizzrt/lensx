## MODIFIED Requirements

### Requirement: Settings must be provided as a Host-owned capability

Application MUST 将 settings 实现为 owner `lensx.core`、page ID `settings` 的 Host page。Settings MUST 在现有 Tauri main window 的 shared content region 中渲染，MUST NOT 创建独立 Tauri settings window，也 MUST NOT 把 settings 注册、标记或执行为 plugin。

当 settings 活动时，App Shell MUST 在统一顶部槽位中用 non-searchable page-context bar 替换 launcher input。Context bar MUST 在当前 locale 中显示 Host 所属方名称与打开页面的 Action 名称，并 MUST 提供 accessible close icon button；它 MUST NOT 显示旧的独立设置标题、打开来源描述或文本“关闭”按钮。右侧 avatar 占位 MUST 保持可见和非交互。Settings 正文的 preferences/plugins 能力与 PageErrorBoundary MUST 保持在 shared content region 中。

#### Scenario: Open the settings page

- **WHEN** `lensx.core.open_settings` Action 成功打开 settings
- **THEN** 现有 main window 的 shared content region 显示 Host settings page
- **THEN** active page identity 的 `owner_id` 等于 `lensx.core`
- **THEN** active page identity 的 `page_id` 等于 `settings`
- **THEN** 顶部 context bar 显示本地化 Host 所属方名称与打开设置的 Action 名称
- **THEN** context bar 显示 accessible close icon button，右侧 avatar 仍为非交互占位
- **THEN** main window 使用固定 `page` 呈现高度，使 context bar 与 settings content region 同时可见
- **THEN** application 未创建第二个 Tauri window

#### Scenario: Switch locale while settings is open

- **WHEN** settings page 活动且用户成功切换 application locale
- **THEN** context bar 中的所属方名称和 Action 名称更新为新 locale
- **THEN** context 不依赖打开页面时复制的旧显示字符串

#### Scenario: Close settings

- **WHEN** 用户激活 context bar 的 close icon button
- **THEN** App Shell 关闭 settings 并返回 home 呈现状态
- **THEN** keyboard focus 返回 launcher input
- **THEN** avatar 占位不接收焦点或触发任何动作

#### Scenario: Inspect settings runtime ownership

- **WHEN** Host 注册 settings Action 与 settings page
- **THEN** settings 不依赖 plugin manifest、plugin lifecycle 或 plugin runtime
- **THEN** settings page provider 与 execution entry point 保持在 trusted Host boundary 内

