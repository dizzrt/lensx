## 1. Rust 偏好设置底座

- [x] 1.1 新增 Rust 偏好模块，定义 `AppPreferences`、`ThemeMode`、默认值和 `UpdateAppPreferencesRequest`，跨前后端字段使用 `snake_case`。
- [x] 1.2 实现偏好文件 gateway，使用应用自有数据或配置目录读写最小 JSON 偏好文件。
- [x] 1.3 实现偏好读取逻辑：缺失文件返回默认偏好；偏好文件损坏时回退默认偏好，并返回可诊断的损坏状态供设置页提示用户重置配置。
- [x] 1.4 实现偏好更新逻辑：校验 `theme_mode`，写入持久化文件，并返回更新后的完整偏好。
- [x] 1.5 新增薄 Tauri command：读取应用偏好和更新应用偏好，并注册到 invoke handler。
- [x] 1.6 为偏好默认值、读写、非法主题值和损坏配置处理补充 focused Rust 测试或等价验证。

## 2. 前端偏好同步

- [x] 2.1 新增前端偏好 API 封装，调用 typed Tauri command 读取和更新应用偏好。
- [x] 2.2 调整应用启动主题初始化流程，从持久化偏好读取 `theme_mode` 并同步到 `appThemeMode`。
- [x] 2.3 处理偏好文件损坏状态，保证应用可使用默认主题，并在设置页面提示用户配置已损坏且需要重置配置。
- [x] 2.4 确保主题更新成功后同步 `appThemeMode`，更新失败时不展示“已保存”状态。

## 3. 内建设置插件注册

- [x] 3.1 在 Rust 默认插件 registry 中新增 `lensx.core.settings` 内建插件 manifest。
- [x] 3.2 声明设置插件页面：`lensx.core.settings_page_main`、`lensx.core.settings_page_style`、`lensx.core.settings_page_shortcuts`。
- [x] 3.3 声明设置插件 action：`lensx.core.settings_action_open` 指向设置主页面。
- [x] 3.4 确认设置插件 ID、页面层级和 action 引用通过现有三段式 ID 与引用校验。
- [x] 3.5 在前端内建插件 loader registry 中注册设置插件主页面动态 import。

## 4. 可复用侧边导航布局

- [x] 4.1 新增 `src/app/layouts/` 布局出口和侧边导航布局组件。
- [x] 4.2 使用 Naive UI `NLayout`、`NLayoutSider`、`NMenu`、`NLayoutContent` 实现左侧菜单栏和右侧内容插槽。
- [x] 4.3 布局组件只消费现有 `AppProviders` 上下文，不新增独立 `NConfigProvider`、theme 或 locale 状态。
- [x] 4.4 控制侧栏宽度以适配 650px launcher 窗口，确保右侧详情区保持可读。
- [x] 4.5 使用 UnoCSS 表达静态布局，使用 Less 表达复杂语义样式、响应式规则和主题变量桥接。

## 5. 设置插件 UI

- [x] 5.1 新增设置插件目录和主页面组件，使用侧边导航布局承载“样式”和“快捷键”菜单。
- [x] 5.2 实现本地 `activeSection` 切换逻辑，默认选中“样式”，切换菜单时更新右侧详情页。
- [x] 5.3 实现样式设置详情页，展示 light / dark 主题选项并调用偏好更新 API。
- [x] 5.4 样式页切换成功后立即更新应用主题状态和 Naive UI theme，失败时展示可诊断错误。
- [x] 5.5 实现快捷键设置详情页，根据 Rust 模块可见性选择复用默认绑定模型或新增只读 Tauri command，只读展示默认启动器快捷键 `Ctrl+Shift+Space` 及其用途。
- [x] 5.6 确认快捷键页面不提供录制、编辑、保存、恢复默认或重新注册快捷键的操作。
- [x] 5.7 确认插件页面打开后独占搜索框下方的 launcher 主体区域，不与启动器结果列表或插件入口列表并列展示。

## 6. i18n 与主题样式

- [x] 6.1 为设置插件标题、菜单、表单标签、说明、加载状态和错误状态新增中英文 i18n messages。
- [x] 6.2 为侧边导航布局的标题、说明、菜单或空状态文案接入应用 i18n message。
- [x] 6.3 检查设置插件和通用布局中的 Naive UI 组件继续由应用 locale 驱动 locale/dateLocale。
- [x] 6.4 检查 light/dark 两种主题下设置主页面、样式页、快捷键页和侧边导航布局均可读。
- [x] 6.5 移除或避免新增只适用于亮色主题的硬编码背景、文本、边框或链接颜色。

## 7. 验证

- [x] 7.1 运行 `pnpm run check` 或 `pnpm run format`，处理格式和 lint 问题。
- [x] 7.2 运行 `pnpm run build`，验证前端和 SDK 类型引用可构建。
- [x] 7.3 运行 Rust/Tauri 相关检查，验证偏好模块、Tauri command 和插件 registry 编译通过。
- [x] 7.4 手动验证启动后插件区出现设置插件入口，点击后打开设置页面。
- [x] 7.5 手动验证样式页切换 light / dark 后立即影响应用主题，并在重启后恢复保存的主题。
- [x] 7.6 手动验证快捷键页只读展示当前默认快捷键，且默认全局快捷键行为未改变。
- [x] 7.7 运行 `openspec status --change add-builtin-settings-plugin`，确认 change 处于可实施状态。
