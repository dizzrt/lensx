## Purpose

定义 lensX 前端应用的统一 UI 基座，确保 Naive UI Provider、明暗主题、应用级 i18n、Naive UI locale/dateLocale 同步，以及 UnoCSS/Less 样式分工在当前启动器输入界面和后续前端界面中保持一致。

## Requirements

### Requirement: 前端必须提供统一的 Naive UI Provider 基座

前端应用 MUST 在根层通过统一 Provider 组合接入 Naive UI 配置，使应用内 Naive UI 组件共享同一套主题、全局样式、locale 和 dateLocale。

#### Scenario: 根组件使用统一 Provider

- **WHEN** 前端应用启动并渲染根组件
- **THEN** 应用内的 Naive UI 组件位于统一的 Naive UI 配置 Provider 之下

#### Scenario: 全局样式由 Naive UI Provider 管理

- **WHEN** 应用渲染 Naive UI 组件
- **THEN** Naive UI 全局样式与主题 token 可通过 Provider 生效

### Requirement: 前端必须支持 Naive UI 兼容的明暗主题

前端 UI MUST 支持 light 和 dark 两种主题模式，并 MUST 避免在用户界面中写死只适用于亮色主题的背景、文本或边框颜色。

#### Scenario: 默认使用亮色主题

- **WHEN** 应用未收到用户主题偏好或系统主题策略输入
- **THEN** 应用主题状态默认为 `light`

#### Scenario: 切换到暗色主题

- **WHEN** 应用主题状态为 dark
- **THEN** Naive UI 组件使用暗色主题配置，应用自有样式不出现亮色背景硬编码导致的冲突

#### Scenario: 切换到亮色主题

- **WHEN** 应用主题状态为 light
- **THEN** Naive UI 组件使用亮色主题配置，应用自有样式通过主题变量或 token 保持可读

### Requirement: 业务文案必须由应用级 i18n 管理

用户可见的业务文案 MUST 通过应用级 i18n message 管理，包括组件标题、按钮、占位、错误、空状态、菜单和设置文案；组件模板中 MUST NOT 新增不可翻译的业务文案硬编码。

#### Scenario: 渲染业务文案

- **WHEN** 用户界面展示产品自有文案
- **THEN** 文案来自应用 i18n message，而不是直接写死在组件模板中

#### Scenario: 应用语言变化

- **WHEN** 应用 locale 从一种语言切换到另一种语言
- **THEN** 已接入 i18n 的业务文案使用目标语言 message 渲染

### Requirement: Naive UI locale/dateLocale 必须与应用 locale 同步

应用 locale MUST 是唯一语言状态来源，并 MUST 同时驱动业务 i18n message 与 Naive UI `locale` / `dateLocale`。Naive UI `locale` / `dateLocale` MUST 只负责 Naive UI 组件内置文案和日期格式，不能替代业务 i18n。

#### Scenario: 默认使用中文 locale

- **WHEN** 应用未收到用户语言偏好或系统语言策略输入
- **THEN** 应用 locale 默认为 `zh-CN`

#### Scenario: 中文 locale 同步

- **WHEN** 应用 locale 为 `zh-CN`
- **THEN** 业务文案使用中文 message，Naive UI 组件使用对应的中文 locale 和中文 dateLocale

#### Scenario: 英文 locale 同步

- **WHEN** 应用 locale 为 `en-US`
- **THEN** 业务文案使用英文 message，Naive UI 组件使用对应的英文 locale 和英文 dateLocale

#### Scenario: Naive UI 内置文案不承载业务文案

- **WHEN** 组件需要展示产品自有按钮、标题、错误或空状态文案
- **THEN** 该文案通过应用 i18n message 提供，而不是通过 Naive UI locale 覆盖承载

### Requirement: 样式必须遵循 UnoCSS 与 Less 分工

前端样式 MUST 使用 UnoCSS 表达静态布局、间距、尺寸、display、flex/grid 和重复页面骨架；MUST 使用 Less 表达复杂语义样式、伪类、媒体查询、主题绑定和不适合工具类表达的组件样式；普通组件 CSS 文件 MUST NOT 作为新的样式入口引入。

#### Scenario: 新增静态布局样式

- **WHEN** 新增组件需要表达宽高、间距、flex 或 grid 布局
- **THEN** 实现使用 UnoCSS 工具类或项目 shortcut

#### Scenario: 新增复杂语义样式

- **WHEN** 新增组件需要复杂选择器、伪类、媒体查询或主题变量桥接
- **THEN** 实现使用 Less，并保持样式与主题变量兼容

### Requirement: 当前启动器输入界面必须迁移到前端基座

现有启动器输入界面 MUST 在保持当前基础交互和 Tauri 拖拽区域行为不变的前提下，接入统一 Provider、主题、应用 i18n 和 Naive UI locale/dateLocale 同步，并移除未使用样式和亮色硬编码。

#### Scenario: 启动器输入界面保持可用

- **WHEN** 应用完成前端基座迁移后启动
- **THEN** 启动器输入界面仍可渲染 Naive UI 输入组件并保留拖拽区域标记

#### Scenario: 清理临时样式

- **WHEN** 检查当前启动器输入界面的组件和全局样式
- **THEN** 不存在未使用的 scoped 样式块和与明暗主题冲突的亮色硬编码
