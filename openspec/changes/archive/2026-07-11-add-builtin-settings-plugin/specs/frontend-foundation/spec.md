## ADDED Requirements

### Requirement: 前端基座必须提供可复用侧边导航布局

前端基座 MUST 提供可复用的侧边导航布局，用于左侧菜单栏、右侧详情页的工作区式页面。该布局 MUST 使用现有应用 Naive UI Provider、主题、i18n 和 Naive UI locale/dateLocale 上下文，MUST NOT 创建独立的全局 Provider 或独立 locale/theme 状态。

#### Scenario: 渲染侧边导航布局

- **WHEN** 页面使用侧边导航布局
- **THEN** 布局渲染左侧导航区域和右侧内容区域
- **THEN** 页面可以向右侧内容区域提供当前详情页内容

#### Scenario: 布局复用应用 Provider

- **WHEN** 侧边导航布局渲染 Naive UI 组件
- **THEN** 这些组件使用现有应用 Naive UI Provider 上下文
- **THEN** 布局不额外创建 `NConfigProvider` 作为主题或 locale 事实源

#### Scenario: 布局兼容 launcher 窗口宽度

- **WHEN** 侧边导航布局在 650px 宽的 launcher 窗口中渲染
- **THEN** 左侧菜单栏宽度保持紧凑
- **THEN** 右侧详情区仍保留可读的内容空间

### Requirement: 侧边导航布局必须遵循前端样式和 i18n 规则

侧边导航布局 MUST 使用应用 i18n message 承载用户可见文案，MUST 兼容 light 和 dark 主题，MUST 使用 UnoCSS 表达静态布局，MUST 使用 Less 表达复杂语义样式、响应式规则和主题变量桥接。

#### Scenario: 布局文案来自应用 i18n

- **WHEN** 侧边导航布局展示标题、说明、菜单项或空状态文案
- **THEN** 文案来自应用 i18n message

#### Scenario: 布局主题兼容

- **WHEN** 应用主题在 light 与 dark 之间切换
- **THEN** 侧边导航布局的背景、文本、菜单选中态和详情区保持可读
- **THEN** 布局不出现只适用于亮色主题的硬编码颜色冲突

#### Scenario: 布局样式分工

- **WHEN** 实现侧边导航布局
- **THEN** 静态布局、间距、尺寸和 flex/grid 使用 UnoCSS 或项目 shortcut
- **THEN** 复杂语义样式、伪类、响应式规则和主题变量桥接使用 Less
