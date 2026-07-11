## Why

当前插件 manifest 只有单一 `name` 字段，无法同时满足英文必填、当前语言展示和搜索匹配的要求；插件搜索也无法覆盖用户习惯用语。为让启动器搜索更符合本地化和个人化使用习惯，需要把插件名称 i18n、插件别名和别名偏好覆盖层纳入正式 contract。

## What Changes

- **BREAKING** 调整插件 manifest 名称 contract：插件必须提供可本地化展示名，英文名必填；当前语言名称缺失时回退英文名。
- 为插件 manifest 增加不可变默认别名列表，别名作为搜索词处理，允许中英文混写数组，不要求按语言分组。
- 为应用偏好增加插件别名覆盖层，支持用户在设置中为任意插件添加、删除和重新启用别名。
- 默认别名仍归 manifest 所有且不可变；用户删除默认别名时写入禁用列表并在 UI 中隐藏，重新添加相同别名时恢复默认别名而不是新增重复自定义别名。
- 单个插件的有效别名集合必须大小写不敏感去重，归一化规则为 `trim + locale lowercase`。
- 启动器搜索范围扩展为插件英文名、当前应用语言名称和所有有效别名，并继续将命中结果映射到可执行插件 action。
- 设置页新增插件别名管理入口，使用 Naive UI 组件、应用 i18n 文案、现有明暗主题和 UnoCSS/Less 样式分工。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `plugin-system`: 修改插件 manifest contract，增加本地化展示名和默认别名，并约束名称回退、别名校验和不可变边界。
- `settings-plugin`: 新增任意插件别名管理能力，定义用户偏好覆盖层、默认别名隐藏/恢复和别名去重规则。
- `launcher-panel`: 扩展插件 action 搜索范围，使搜索同时匹配插件英文名、当前语言名和有效别名。

## Impact

- Rust/Tauri：需要更新插件 manifest 类型、校验逻辑、默认内建设置插件 manifest、registry snapshot 序列化，以及应用偏好持久化结构。
- Frontend：需要更新 `@lensx/plugin-sdk` 类型、前端 manifest 校验、插件 registry 索引、搜索 helper、插件打开态标题显示、设置插件 UI 和应用 i18n 文案。
- 数据迁移：现有偏好文件需要兼容缺失别名覆盖层的情况，并以默认空覆盖层读取。
- OpenSpec：新增本 change 的 delta specs、设计和任务。
- 不涉及新增依赖、Python helper、Tauri 窗口行为或文档镜像变更。
