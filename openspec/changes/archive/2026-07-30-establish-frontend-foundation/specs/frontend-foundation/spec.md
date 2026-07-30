## ADDED Requirements

### Requirement: 应用必须提供产品自有的 React 根界面

前端应用 MUST 渲染产品自有、语义化且可访问的最小 App Shell，并 MUST NOT 继续展示构建工具欢迎
文案、示例交互或表现层 mock 功能。App Shell MUST 只表达 lensX 产品身份与介绍，不得暗示尚未实现的
launcher、设置或插件能力已经可用。

#### Scenario: 启动应用

- **WHEN** React 应用完成根渲染
- **THEN** 页面包含一个可访问的主内容区域
- **THEN** 页面展示 lensX 产品身份和当前语言的产品介绍
- **THEN** 页面不展示 Rsbuild 欢迎文案或示例交互

#### Scenario: 检查未交付功能

- **WHEN** 用户查看最小 App Shell
- **THEN** 页面不展示搜索框、设置入口、模拟 action 或插件入口
- **THEN** 页面不把规划中的能力描述为已经实现

### Requirement: 应用必须提供统一的全局 Provider 基座

前端应用 MUST 在唯一的根层 Provider 组合中提供应用国际化、主题、Semi Design locale 和错误隔离。
后续页面 MUST 复用该组合提供的全局上下文，不得创建并行的应用 locale 或 theme 事实来源。

#### Scenario: 渲染根应用

- **WHEN** 前端入口渲染 App
- **THEN** App 位于统一的应用国际化、主题和 Semi Design locale 上下文中
- **THEN** App 子树位于应用错误边界中

#### Scenario: 后续页面消费全局上下文

- **WHEN** App Shell 的子页面读取应用 locale 或 theme
- **THEN** 页面获得根层 Provider 的当前值
- **THEN** 页面不需要创建独立的全局 Provider

### Requirement: 应用必须支持明亮和黑暗主题

应用 MUST 支持 `light` 和 `dark` 两种主题模式，MUST 默认使用 `light`，并 MUST 通过 Semi Design
支持的全局主题机制使应用内容和浮层使用一致的主题 token。应用自有样式 MUST NOT 写死仅适用于某一
主题的背景、文本或边框颜色。

#### Scenario: 默认主题

- **WHEN** 应用没有接收到显式主题值
- **THEN** 应用以 `light` 模式渲染
- **THEN** 文档 color scheme 与明亮模式一致

#### Scenario: 切换到黑暗主题

- **WHEN** 应用主题更新为 `dark`
- **THEN** App Shell 和 Semi Design 组件使用黑暗主题 token
- **THEN** 挂载到全局浮层容器的 Semi Design 内容也使用黑暗主题
- **THEN** 文档 color scheme 与黑暗模式一致

#### Scenario: 从黑暗主题恢复到明亮主题

- **WHEN** 应用主题从 `dark` 更新为 `light`
- **THEN** App Shell 和 Semi Design 组件恢复使用明亮主题 token
- **THEN** 不再保留使全局内容处于黑暗模式的属性

### Requirement: 应用必须提供英文和简体中文国际化

应用 MUST 提供 `en-US` 与 `zh-CN` 两种 locale，MUST 默认使用 `en-US`。应用 locale MUST 同时驱动
业务 message、Semi Design 内置组件文案和 HTML 文档语言。英文 message MUST 是规范源，简体中文
资源 MUST 具有语义一致的 message key。

#### Scenario: 默认语言

- **WHEN** 应用没有接收到显式 locale
- **THEN** 业务文案使用英文 message
- **THEN** Semi Design 使用英文 locale
- **THEN** HTML 文档语言为 `en-US`

#### Scenario: 切换到简体中文

- **WHEN** 应用 locale 更新为 `zh-CN`
- **THEN** 业务文案使用简体中文 message
- **THEN** Semi Design 使用简体中文 locale
- **THEN** HTML 文档语言为 `zh-CN`

#### Scenario: 切换回英文

- **WHEN** 应用 locale 从 `zh-CN` 更新为 `en-US`
- **THEN** 业务文案、Semi Design 内置文案和 HTML 文档语言全部恢复为英文

### Requirement: 用户可见产品文案必须由应用国际化管理

所有用户可见的产品标题、说明、错误和操作文案 MUST 来自应用 message 资源，MUST NOT 在 React
组件中新增不可翻译的产品文案。Semi Design locale MUST 仅承载组件库内置文案，不得替代业务 message。

#### Scenario: 渲染产品文案

- **WHEN** App Shell 展示标题以外的产品说明或操作文案
- **THEN** 文案来自当前 locale 对应的应用 message

#### Scenario: 渲染 Semi Design 内置文案

- **WHEN** Semi Design 组件需要展示内置文案
- **THEN** 文案来自与应用 locale 对应的 Semi Design locale pack
- **THEN** 业务 message 不通过修改组件库 locale pack 承载

#### Scenario: 校验语言资源

- **WHEN** 项目执行前端测试或静态验证
- **THEN** 英文和简体中文资源具有一致的 message key 集合

### Requirement: 根应用必须隔离渲染错误并提供恢复操作

应用 MUST 捕获 App Shell 子树的渲染错误，MUST 显示当前语言下可访问的错误降级界面和恢复操作，
并 MUST NOT 向用户直接暴露错误堆栈或内部实现细节。

#### Scenario: 子树渲染失败

- **WHEN** App Shell 子树在渲染期间抛出错误
- **THEN** 应用显示当前语言下的错误标题、说明和恢复操作
- **THEN** 降级界面继续使用当前主题
- **THEN** 页面不展示错误堆栈

#### Scenario: 用户执行恢复操作

- **WHEN** 用户激活错误降级界面的恢复操作
- **THEN** 应用请求重新加载当前窗口

### Requirement: 前端样式必须遵循 UnoCSS 与 Less 分工

前端 MUST 使用 UnoCSS 表达简单、局部的布局、间距、尺寸和对齐；MUST 使用 Less 表达全局基础规则、
复杂语义样式、状态组合、主题 token 桥接和可复用样式。Semi Design 全局样式 MUST 只在应用入口
导入一次，应用 MUST NOT 保留与该分工冲突的模板 CSS 入口。

#### Scenario: 实现 App Shell 布局

- **WHEN** App Shell 只需要 flex、尺寸、间距或对齐样式
- **THEN** 实现使用 UnoCSS 工具类或项目 shortcut

#### Scenario: 实现全局或复杂样式

- **WHEN** 样式涉及根元素 reset、主题变量、复杂状态或复用语义
- **THEN** 实现使用项目 Less 入口

#### Scenario: 加载全局组件样式

- **WHEN** 前端入口启动
- **THEN** Semi Design 全局样式和项目全局 Less 各自只加载一次

### Requirement: 仓库必须移除未使用的脚手架行为

仓库 MUST 移除未被 lensX 使用的构建工具欢迎页面、示例测试、示例 Tauri command 和没有配套构建
插件的类型声明，并 MUST 保留当前可用的 React、Tauri、测试和样式工具链。

#### Scenario: 检查前端脚手架

- **WHEN** 开发者搜索当前前端源码和测试
- **THEN** 不存在 Rsbuild 欢迎文案或针对该欢迎文案的模板测试
- **THEN** 不存在仅为未安装 SVG 转换插件服务的 `*.svg?react` 声明

#### Scenario: 检查 Tauri command

- **WHEN** 开发者检查 Rust 入口和已注册 command
- **THEN** 不存在示例 `greet` command 或其 handler 注册
- **THEN** Tauri 应用仍能通过现有运行入口构建和启动
