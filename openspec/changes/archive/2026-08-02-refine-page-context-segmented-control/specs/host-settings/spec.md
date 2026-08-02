## ADDED Requirements

### Requirement: The Host settings context must use lensX owner presentation

当 Host 设置页面处于活动状态时，页面上下文的 Owner 段 MUST 显示当前 locale 下的 lensX Host 名称和受 Host 控制的 lensX Owner 图标，Action 段 MUST 显示打开设置页面的 Action 名称，关闭图标按钮 MUST 紧邻 Action。系统 MUST 将 lensX 作为设置页面的 Host Owner 呈现，而 MUST NOT 将设置标记为插件或依赖插件 Manifest 展示信息。

设置页面上下文 MUST 复用共享分段页面上下文的 Owner 图标 fallback、主题、本地化、文本约束、可访问性与窗口拖动规则。设置齿轮 Action 图标 MUST NOT 替代 lensX Owner 图标。

#### Scenario: Open Host settings from its Action

- **WHEN** `lensx.core.open_settings` Action 成功打开 `lensx.core/settings`
- **THEN** Owner 段显示 lensX Host 名称与 lensX Owner 图标
- **THEN** Action 段显示当前 locale 下的打开设置 Action 名称
- **THEN** 关闭图标按钮紧邻 Action 并具有返回 Home 的本地化可访问名称
- **THEN** 设置页继续在现有主窗口的共享内容区域中显示

#### Scenario: Switch locale while viewing segmented settings context

- **WHEN** 用户在设置页打开期间成功切换英文与简体中文
- **THEN** lensX Owner 名称、打开设置 Action 名称和关闭按钮可访问名称切换到当前 locale
- **THEN** lensX Owner 图标与分段结构保持稳定
- **THEN** 页面上下文不依赖打开页面时复制的旧显示字符串

#### Scenario: Inspect Host ownership of settings context

- **WHEN** 用户或辅助技术检查设置页面的 Owner 段
- **THEN** 设置被呈现为 lensX Host 拥有的页面，而不是插件页面
- **THEN** Owner 段不提供插件导航、管理或菜单交互
- **THEN** 设置齿轮 Action 图标不会被呈现为 lensX Owner 图标

