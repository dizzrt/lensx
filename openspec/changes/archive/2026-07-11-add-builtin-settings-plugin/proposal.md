## Why

插件系统已经提供内建插件运行边界，但还没有真实内建插件验证 registry、动态页面加载和主应用 Provider 上下文的完整链路。设置是第一个适合内建化的核心能力，也需要从一开始接入正式偏好持久化，避免主题、快捷键和后续偏好散落在 Vue 临时状态中。

## What Changes

- 新增内建设置插件 `lensx.core.settings`，通过插件 registry 注册设置入口、主页面、样式子页面和快捷键子页面。
- 新增正式偏好设置能力，至少持久化 `theme_mode: light | dark`，应用启动后恢复用户上次选择。
- 设置插件的“样式”页面支持切换 light / dark，并立即同步到现有应用主题状态和 Naive UI theme。
- 设置插件的“快捷键”页面第一阶段展示当前默认快捷键绑定，不提供编辑、录制或重绑定。
- 新增可复用的侧边导航布局，采用左侧菜单栏、右侧详情页结构，供设置插件和后续类似工作区页面复用。
- 设置页面 UI 使用 Naive UI 组件，静态布局优先使用 UnoCSS，复杂语义样式和主题桥接使用 Less。
- 所有新增用户可见文案接入应用 i18n，并继续由应用 locale 单一状态驱动业务文案和 Naive UI locale/dateLocale。
- 不引入新的外部插件运行时能力、不实现快捷键编辑、不实现语言切换 UI、不改变窗口生命周期、托盘或默认全局快捷键行为。

## Capabilities

### New Capabilities

- `settings-plugin`: 定义内建设置插件、设置页面结构、样式页主题切换、快捷键页展示和正式偏好持久化要求。

### Modified Capabilities

- `plugin-system`: 内建插件 registry 需要注册并加载第一个真实内建设置插件，验证内建 Vue module 页面链路。
- `frontend-foundation`: 前端基座需要提供可复用侧边导航布局，并支持设置插件页面复用现有 Provider、主题、i18n 和样式分工。
- `desktop-shortcuts`: 快捷键设置页需要只读展示当前默认快捷键绑定，不能改变现有快捷键注册和动作行为。

## Impact

- 前端 UI：新增设置插件页面、样式页、快捷键页、可复用侧边导航布局和相关 i18n messages。
- 前端状态：现有 `appThemeMode` 需要由持久化偏好初始化，并在设置页修改时同步更新。
- Rust/Tauri：新增薄 Tauri command 或等价边界用于读取、更新和持久化应用偏好；可能新增偏好模型、存储 gateway 和序列化类型。
- 插件 registry：新增内建设置插件 manifest、页面和行为注册。
- 桌面快捷键：只读暴露当前快捷键绑定展示所需数据，不改变默认 `Ctrl+Shift+Space` 注册、冲突检测或动作路由。
- 验证：需要覆盖偏好读写、主题重启恢复、设置插件打开、布局明暗主题兼容、i18n 文案和快捷键只读展示。
