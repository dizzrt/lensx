## ADDED Requirements

### Requirement: The system MUST provide an optional constrained public Plugin UI package
系统 MUST 提供可独立构建、测试和打包的公共 `@lensx/plugin-ui@0.1.0` workspace package。package MUST 只公开一个 JavaScript 根入口和一个 `@lensx/plugin-ui/styles.css` 样式入口；未声明的 deep import MUST 被 package resolution 拒绝。公共 JavaScript 入口 MUST 只提供 `PluginUiProvider`、`PluginPage`、`PluginFeedback` 及其公共类型，MUST NOT 重导出完整 Semi Design API、Host React Context、Host 私有组件、`src/app/**`、Tauri adapter 或 Host 私有样式。

#### Scenario: React 插件从真实 tarball 消费公共入口
- **WHEN** workspace 外的 React consumer 安装真实 Plugin Contract、SDK 与 UI tarball，并只导入声明的 JavaScript 和样式入口
- **THEN** consumer 的 TypeScript typecheck、浏览器 build 和 Runtime smoke test 成功
- **THEN** consumer 无需访问 lensX private root、Host React Context、Tauri 或 Host 私有样式

#### Scenario: Consumer 尝试 deep import
- **WHEN** consumer 导入未声明的 UI package 源码、测试、fixture、脚本、内部组件或内部样式路径
- **THEN** package resolution 拒绝该导入

#### Scenario: 非 React 插件忽略 UI package
- **WHEN** framework-neutral consumer 只安装和使用 Plugin Contract 与 Plugin SDK
- **THEN** consumer 无需安装 React、React DOM、Semi Design 或 Plugin UI package 即可继续 typecheck 和运行
- **THEN** Plugin SDK 的发布依赖和公共声明不包含 Plugin UI、React 或 Semi Design

### Requirement: PluginUiProvider MUST adapt the validated Runtime context within the plugin document
`PluginUiProvider` MUST 接受只读 `PluginRuntimeContext` 并使用其 `locale` 与 `theme` 驱动插件自己的 React 子树和 document。Provider MUST 将 `en-US` 与 `zh-CN` 映射到对应的官方 Semi Design locale pack，MUST 同步 document language、CSS `color-scheme` 和 Semi Design 支持的 light/dark body theme 属性，并 MUST 在 unmount 时恢复 mount 前的 document 值。Provider MUST NOT 读取 Host AppProviders、Host preferences、Tauri 或 transport，也 MUST NOT 声称提供 Runtime context 更新协议。

#### Scenario: Provider 使用英文浅色 context 初始化
- **WHEN** Provider 接收 locale 为 `en-US`、theme 为 `light` 的已验证 Runtime context
- **THEN** children 在英文 Semi locale 下渲染，document language 为 `en-US`，color scheme 为 light，且 dark body theme 属性不存在

#### Scenario: Provider 使用中文深色 context 初始化
- **WHEN** Provider 接收 locale 为 `zh-CN`、theme 为 `dark` 的已验证 Runtime context
- **THEN** children 在中文 Semi locale 下渲染，document language 为 `zh-CN`，color scheme 为 dark，且 body 使用 Semi Design 支持的 dark theme 属性

#### Scenario: 调用方提供新的 context snapshot
- **WHEN** mounted Provider 的 context prop 从一个受支持的 locale/theme snapshot 变为另一个受支持的 snapshot
- **THEN** locale、document language、color scheme、body theme 和 package 内置反馈文案一致更新
- **THEN** Provider 不自行订阅 SDK transport、轮询 Host 或发明 context event

#### Scenario: Provider 卸载
- **WHEN** Provider 从其独占的插件 document 环境卸载
- **THEN** mount 前的 document language、color scheme 和 body theme 属性被恢复
- **THEN** 不留下 package listener 或全局状态

### Requirement: The package MUST expose a small versioned semantic theme contract
系统 MUST 通过公开样式入口提供 lensX 插件语义样式，并 MUST 将以下 CSS custom properties 作为 `0.1.0` 公共契约：`--lensx-plugin-color-background`、`--lensx-plugin-color-surface`、`--lensx-plugin-color-text`、`--lensx-plugin-color-text-secondary`、`--lensx-plugin-color-border`、`--lensx-plugin-color-accent`、`--lensx-plugin-color-danger`、`--lensx-plugin-color-focus`、`--lensx-plugin-radius-page` 和 `--lensx-plugin-space-page`。颜色 token MUST 基于 package 支持的 Semi Design token 和主题机制，发布样式 MUST NOT import Host `src/styles/**`、依赖 Host UnoCSS 扫描或暴露 Launcher 专用选择器。

#### Scenario: Consumer 导入公开样式
- **WHEN** consumer 仅导入 `@lensx/plugin-ui/styles.css`
- **THEN** Plugin UI 组件和 consumer 直接使用的受支持 Semi 组件获得所需基础样式
- **THEN** 十个 `--lensx-plugin-*` token 均存在且无需 Host 全局样式

#### Scenario: 主题在 light 与 dark 之间切换
- **WHEN** Provider context theme 在 light 与 dark 之间变化
- **THEN** page、feedback、text、border、accent、danger 和 focus 呈现使用对应主题的 token 值
- **THEN** 组件不使用只适合单一主题的硬编码颜色表达状态

#### Scenario: 插件使用公开 token 扩展自己的 UI
- **WHEN** 插件 CSS 使用声明的 `--lensx-plugin-*` token 构建自定义区域
- **THEN** 自定义区域可以与 package 组件共享稳定的明暗主题语义
- **THEN** 未列入该公共清单的 Semi token 不被描述为 lensX 的长期兼容承诺

### Requirement: PluginPage MUST provide an accessible lensX page frame without Host behavior
`PluginPage` MUST 提供单一语义 main/page 区域、可访问的页面 heading、可选 description、可选 actions 和内容区域，并 MUST 使用公开 lensX token 提供稳定的页面间距、排版、surface 和 focus 语义。组件 MUST 接受插件自己的本地化 React 内容，MUST NOT 包含 Host router、Launcher page context、window drag、close behavior、Action Dispatcher、Tauri 调用或 Host navigation state。

#### Scenario: 插件渲染正常页面内容
- **WHEN** 插件向 `PluginPage` 提供 title、description、actions 和 children
- **THEN** 页面使用 main、heading 和内容结构渲染，actions 可通过键盘到达并保留可见 focus
- **THEN** 页面布局在 `en-US` 与 `zh-CN`、light 与 dark 下保持可读

#### Scenario: 插件只提供必要内容
- **WHEN** 插件仅提供 title 与 children
- **THEN** 页面仍具有完整 heading 与内容结构
- **THEN** 缺少可选 description 或 actions 不产生空的可交互元素

#### Scenario: 插件尝试使用 Host 页面能力
- **WHEN** consumer 检查 `PluginPage` 的公共 props 和声明
- **THEN** API 不包含 Host navigation service、React setter、Tauri window、Launcher Action executor 或 private page context

### Requirement: PluginFeedback MUST provide localized and accessible page states
`PluginFeedback` MUST 提供 `loading`、`empty` 和 `error` 三种可判别状态，MUST 为 `en-US` 与 `zh-CN` 提供 package-owned 默认 title/description/retry 文案，并 MUST 允许插件用自己的本地化 React 内容覆盖这些文案。loading MUST 暴露 busy 与 polite status 语义，empty MUST 使用非错误 status 语义，error MUST 使用可被辅助技术及时感知的 error 语义；可选 recovery action MUST 可通过键盘操作且 MUST NOT 自动调用 Host API。

#### Scenario: Loading 状态
- **WHEN** 插件渲染未覆盖文案的 loading feedback
- **THEN** 当前 Provider locale 对应的默认 loading 文案可见
- **THEN** feedback 暴露 busy 和 polite live status，且不窃取键盘焦点

#### Scenario: Empty 状态
- **WHEN** 插件渲染 empty feedback
- **THEN** 当前 locale 对应的默认或插件覆盖的 empty 文案可见
- **THEN** 状态不只依赖颜色表达且不会被标记为错误 alert

#### Scenario: Error 与恢复操作
- **WHEN** 插件渲染 error feedback 并提供 recovery action
- **THEN** 当前 locale 对应的默认或覆盖 error 文案通过错误语义呈现
- **THEN** 用户可以用键盘触发 recovery action，且 package 只调用插件提供的 handler

#### Scenario: Provider locale 在反馈显示时改变
- **WHEN** 使用 package 默认文案的 mounted feedback 从 `en-US` context 更新为 `zh-CN` context
- **THEN** title、description 和 retry 文案一起更新为语义等价的中文
- **THEN** 插件提供的覆盖内容保持由插件控制

### Requirement: Plugin Runtime dependencies MUST remain plugin-owned and Host-independent
`@lensx/plugin-ui` MUST 将 React、React DOM 和 Plugin SDK 声明为兼容的 peer dependencies，并 MUST 将它实际 import 的 Semi Design package 声明为直接 Runtime dependency。UI library 发布物 MUST NOT 内联第二份 React；最终 React 插件浏览器产物 MUST 由插件项目包含自己的 React、React DOM、Semi Design、Plugin UI JavaScript 和样式，且 MUST NOT 依赖 Host external、import map、window global 或共享 Host React/Semi 实例。

#### Scenario: React consumer 安装并构建自己的 Runtime
- **WHEN** 外部 React consumer 直接安装 UI package 的 peer dependencies 并构建浏览器产物
- **THEN** consumer 和 Plugin UI 组件使用 consumer 自己的一份 React 实例
- **THEN** 最终产物不存在未解析的 React、React DOM、Semi Design 或 Host-private bare external

#### Scenario: Host 未提供 UI Runtime globals
- **WHEN** consumer 在没有 Host React、Semi Design、Host CSS、Tauri 和 lensX private globals 的独立浏览器 document 中启动
- **THEN** Provider、Page 和 Feedback 仍可通过公开依赖和样式正常渲染

#### Scenario: Package metadata 被检查
- **WHEN** 发布门禁检查真实 UI tarball 的 dependency、peer dependency、exports、sideEffects 和文件列表
- **THEN** metadata 明确保留样式副作用并将每个 Runtime import 归属到声明的 dependency 或 peer dependency
- **THEN** tarball 不包含测试、fixture、构建脚本、Host 源码或 workspace 版本范围

### Requirement: The package MUST participate in complete automated, visual, release, and documentation validation
UI package MUST 声明有意义的 `build`、`typecheck`、`test`、`check` 和 `test:pack` scripts，且根 workspace 聚合命令 MUST 覆盖这些脚本。验证 MUST 覆盖公共类型/exports、真实 tarball、独立浏览器 consumer、依赖方向、React 单实例、正常/empty/error/recovery、键盘与 focus、双语、明暗主题和固定 `650×600` 视觉 fixture。Canonical English 架构与开发文档及其 Simplified Chinese 镜像 MUST 说明 UI package 公共边界、消费方式、样式入口、依赖所有权和 Runtime 非目标。

#### Scenario: 根 workspace 验证新 package
- **WHEN** 开发者运行根 `build`、`typecheck`、`test` 或 `check`
- **THEN** 对应 UI package lifecycle script 按 workspace 依赖顺序运行，且失败向根命令传播
- **THEN** workspace boundary gate 拒绝 SDK 对 UI 的反向依赖、UI 对 Host 私有路径的依赖和 plugin 对 Host Runtime 的依赖

#### Scenario: 自动化行为矩阵执行
- **WHEN** package 测试运行 Provider、Page 和 Feedback 的行为矩阵
- **THEN** `en-US`/`zh-CN`、light/dark、正常内容、loading、empty、error、recovery、document cleanup、keyboard 和 focus 断言全部通过

#### Scenario: 固定视口视觉验收执行
- **WHEN** visual fixture 在 `650×600` 下分别渲染 `en-US`/`zh-CN` × light/dark 的页面与反馈状态
- **THEN** 关键 computed styles、theme attribute、token、长中文布局和 focus indicator 自动检查通过
- **THEN** 四组截图经过人工检查，确认页面保持可读、无裁切且视觉语言一致

#### Scenario: 开发者阅读双语文档
- **WHEN** 开发者阅读 English 或 Simplified Chinese 插件架构与 workspace 文档
- **THEN** 两种语言以等价语义描述 React 与非 React 消费路径、公共组件/token、样式导入和插件自有依赖
- **THEN** 文档不把 UI package 描述为已经实现的 iframe Runtime、Host API、安装器、Testkit 或插件执行能力
