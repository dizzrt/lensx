## Why

仓库已经提供框架无关的 Plugin SDK 和包含 locale/theme 的只读 Runtime context，但 React 插件开发者仍缺少可发布、可独立消费的 lensX UI 基础，只能自行复制视觉规则或依赖 Host 私有前端实现。现在建立可选的 Plugin UI package，可以让第三方 React 插件复用稳定的页面、反馈、主题与 locale 语义，同时保持非 React 插件和隔离 Runtime 的技术边界。

## What Changes

- 新增公共 package `@lensx/plugin-ui@0.1.0`，提供受限、可独立构建、测试和打包的 React/Semi Design UI 入口。
- 以 `PluginUiProvider` 消费 `@lensx/plugin-sdk` 的 `PluginRuntimeContext`，在插件自己的文档边界内适配 `en-US`、`zh-CN`、light 和 dark；Provider 接受新的 context prop 时更新呈现，但本 change 不定义 context 的 transport 或订阅协议。
- 提供最小的 lensX 语义组件集：页面框架 `PluginPage` 和 loading、empty、error 反馈 `PluginFeedback`；Button、Input、Table 等通用控件继续由插件直接从 Semi Design 消费，不在本 package 重复包装。
- 提供公开、版本化的 lensX 插件语义 CSS token 与显式样式入口；不导出 Host React Context、应用私有组件、`src/app/**`、Host 全局样式或 Tauri adapter。
- 定义插件拥有并打包其浏览器 Runtime 依赖的发布策略：插件内部可以共享自己的单一 React 实例，但不得共享或依赖 Host 的 React、React DOM、Semi Design 实例或全局变量。
- 建立 package API、依赖方向、真实 tarball、隔离浏览器 consumer、主题/locale、可访问性和视觉矩阵验证，并接入根 workspace lifecycle 与 boundary gate。
- 更新 canonical English 插件架构和 workspace 文档及对应 Simplified Chinese 镜像，说明 React 与非 React 两条消费路径和当前尚未交付的 Host Runtime 边界。
- 非目标：不实现 iframe、Host API、Runtime session、插件安装/注册/执行、动态 locale/theme 事件协议、Plugin Testkit、项目模板、完整组件库或 Host UI 的像素级复制。

## Capabilities

### New Capabilities

- `plugin-ui-package`: 定义可选 `@lensx/plugin-ui` 的公共 package、Runtime context 适配、最小语义组件、公开主题 token、依赖/打包边界以及发布与视觉验证要求。

### Modified Capabilities

无。

## Impact

- 新增 `packages/plugin-ui` 公共 workspace member，以及 package-local React、样式、测试、构建和 pack 验证。
- 新增真实 tarball 的隔离 React consumer；现有 framework-neutral SDK consumer 必须继续在不安装 UI package、React 或 Semi Design 的情况下通过。
- `@lensx/plugin-ui` 消费 `@lensx/plugin-sdk` 公共类型并基于 Semi Design；`@lensx/plugin-sdk` 不增加 UI、React 或 Semi Design 依赖。
- 根 `build`、`typecheck`、`test`、`check` 和 workspace boundary/lifecycle 验证覆盖新 package。
- 更新 `docs/en/architecture/extension-platform.md`、`docs/en/development/plugin-workspace.md` 及相同相对路径的中文镜像；不改变当前 Host UI、Rust/Tauri、Manifest、SDK transport 或插件执行行为。
