## 1. 插件 Contract 与 Registry

- [x] 1.1 更新 Rust 插件 manifest 类型，将单一 `name` 迁移为 `display_names`，并新增 `default_aliases`。
- [x] 1.2 更新 Rust manifest 校验，要求英文展示名必填，校验默认别名非空、去除首尾空白后有效，并按大小写不敏感规则拒绝重复默认别名。
- [x] 1.3 更新内建设置插件 manifest，提供英文名、当前中文名和默认别名。
- [x] 1.4 更新默认 registry 和 manifest 相关 Rust 单元测试，覆盖本地化名称、默认别名去重和设置插件注册。
- [x] 1.5 更新 `@lensx/plugin-sdk` contract 类型，导出本地化插件名称和默认别名字段。
- [x] 1.6 更新前端插件 manifest 校验逻辑，保持与 Rust 侧 contract 一致。
- [x] 1.7 全局替换前端对 `plugin.name` 的读取，改为通过统一 helper 获取当前 locale 下的插件显示名。

## 2. 应用偏好与别名覆盖层

- [x] 2.1 扩展 Rust `AppPreferences`，新增 `plugin_alias_overrides`，默认值为空 map。
- [x] 2.2 扩展 Rust `UpdateAppPreferencesRequest`，支持更新插件别名覆盖层并保持 `snake_case` payload。
- [x] 2.3 确保读取旧偏好文件时缺失 `plugin_alias_overrides` 不会被视为损坏，并回退为空覆盖层。
- [x] 2.4 更新 Rust 偏好测试，覆盖旧偏好兼容、别名覆盖层写入和损坏文件回退。
- [x] 2.5 更新前端偏好 API 类型和默认状态，暴露插件别名覆盖层读写能力。

## 3. 别名解析 Helper

- [x] 3.1 新增共享前端 helper，实现 `normalizePluginAlias`、`resolvePluginAliases`、添加别名和删除别名的覆盖层计算。
- [x] 3.2 在 helper 中实现默认别名删除写入 `disabled_default_aliases`、自定义别名删除移除 `added_aliases` 的规则。
- [x] 3.3 在 helper 中实现重新添加已禁用默认别名时恢复默认别名而不是新增自定义别名。
- [x] 3.4 补充 focused 测试或等价验证，覆盖大小写不敏感去重、首尾空白归一化、默认别名恢复和重复别名拒绝。

## 4. Launcher 搜索与插件标题

- [x] 4.1 更新插件显示名 helper，使其根据应用 locale 获取插件当前语言名，并在缺失时回退英文名。
- [x] 4.2 更新插件打开态顶部标题，展示当前 locale 下的插件名称而不是 manifest 原始字段。
- [x] 4.3 更新 launcher 搜索 helper，匹配 action 标题、action ID、插件 ID、插件英文名、当前语言插件名和有效别名。
- [x] 4.4 保持搜索结果仍映射到可执行插件 action，并继续复用现有 action dispatcher。
- [x] 4.5 补充搜索验证，覆盖英文名命中、当前语言名命中、有效别名命中、已禁用默认别名不命中、重新启用默认别名命中。

## 5. 设置插件 UI

- [x] 5.1 在设置插件侧边导航中新增“插件别名”页面入口，并保持现有样式页和快捷键页可用。
- [x] 5.2 新增插件别名管理面板，列出当前 registry 插件和每个插件的有效别名。
- [x] 5.3 实现添加别名交互，处理空值、重复别名、恢复已禁用默认别名和持久化失败状态。
- [x] 5.4 实现删除别名交互，让默认别名和自定义别名在 UI 中使用一致删除体验。
- [x] 5.5 为别名管理页面补充应用 i18n 文案，覆盖中文和英文 message。
- [x] 5.6 使用 Naive UI 组件实现表单、列表、标签、按钮、空状态和错误状态。
- [x] 5.7 使用 UnoCSS 表达静态布局，使用 Less 处理组件语义样式，并确认 light/dark 主题下可读。
- [x] 5.8 确认设置插件不创建独立 Naive UI Provider、locale 或 dateLocale 状态。

## 6. 验证

- [x] 6.1 运行 Rust/Tauri 相关检查和测试，验证 manifest、registry、偏好持久化和 Tauri command 编译通过。
- [x] 6.2 运行 `pnpm run check`，修复格式和 lint 问题。
- [x] 6.3 运行 `pnpm run build`，验证前端和 SDK 类型编译通过。
- [x] 6.4 手动验证设置页别名添加、删除、恢复默认别名，以及搜索结果随偏好变化更新。
- [x] 6.5 手动验证插件打开态顶部标题在中文和英文 locale 下显示正确，且名称过长时关闭按钮仍可见。

## 7. OpenSpec 收尾

- [x] 7.1 核对 `plugin-system`、`settings-plugin` 和 `launcher-panel` delta specs 与实际实现一致。
- [x] 7.2 运行 `openspec status --change "add-plugin-i18n-alias-search"`，确认任务和 artifact 状态可归档。
