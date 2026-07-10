## ADDED Requirements

### Requirement: 前端基座必须承载插件宿主 UI

前端应用 MUST 提供插件宿主 UI 基础设施，用于渲染内建插件动态模块页面和外部插件 iframe 页面。插件宿主 UI MUST 位于现有 Naive UI Provider、应用主题、应用 i18n、Naive UI locale/dateLocale 同步机制之下，并 MUST 遵循 UnoCSS 与 Less 的样式分工。

#### Scenario: 渲染内建插件页面

- **WHEN** 用户打开内建插件页面
- **THEN** 页面通过主 Vue 动态模块渲染
- **THEN** 页面可使用应用级 Naive UI Provider、主题 token、i18n message 和 Naive UI locale/dateLocale

#### Scenario: 渲染外部插件 iframe 容器

- **WHEN** 用户打开外部插件页面
- **THEN** 前端基座渲染外部插件 iframe 容器
- **THEN** iframe 容器外围 UI 的标题、错误、空状态和操作文案来自应用 i18n message
- **THEN** iframe 容器外围 UI 兼容 light 和 dark 主题

#### Scenario: 插件宿主样式遵循项目分工

- **WHEN** 新增插件页面出口、iframe 容器或插件错误状态 UI
- **THEN** 静态布局、间距、尺寸和 flex/grid 使用 UnoCSS 表达
- **THEN** 复杂语义样式、伪类、主题变量桥接和组件级样式使用 Less 表达

### Requirement: 前端基座必须向外部插件同步运行时上下文

前端应用 MUST 能够向外部插件 iframe 同步必要运行时上下文，包括 plugin_id、Host 版本、应用 locale、主题模式和可用权限状态。运行时上下文 MUST 通过受控 Plugin Bridge 或 SDK 协议传递，MUST NOT 暴露主 Vue 内部对象。

#### Scenario: 同步主题和语言上下文

- **WHEN** 外部插件 iframe 初始化
- **THEN** 前端基座通过 Plugin Bridge 向插件提供当前 locale 和主题模式
- **THEN** 插件无需访问主 Vue 状态即可读取这些上下文

#### Scenario: 应用语言变化时通知插件

- **WHEN** 应用 locale 发生变化
- **THEN** 前端基座通过插件事件通知已打开的外部插件 iframe
- **THEN** Naive UI locale/dateLocale 仍由应用 locale 单一状态驱动

#### Scenario: 应用主题变化时通知插件

- **WHEN** 应用主题在 light 与 dark 之间切换
- **THEN** 前端基座通过插件事件通知已打开的外部插件 iframe
- **THEN** 插件宿主外围 UI 与应用主题保持一致
