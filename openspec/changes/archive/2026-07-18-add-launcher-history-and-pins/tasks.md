## 1. Rust 偏好持久化与 command

- [x] 1.1 扩展 `AppPreferences` 和更新请求的 Rust 数据契约，新增带 serde 默认值的 `recent_action_ids` 与 `pinned_action_ids`，保持旧偏好文件可读。
- [x] 1.2 在偏好存储层实现最近使用的去重、置顶和 10 项截断规则，以及固定/取消固定的去重、置顶和移除规则。
- [x] 1.3 新增 `record_launcher_action` 与 `set_launcher_action_pinned` typed Tauri command，并在应用 invoke handler 中注册。
- [x] 1.4 为缺少新字段的旧偏好、最近使用去重和上限、固定排序、取消固定及写回恢复添加 Rust 单元测试。

## 2. 前端数据投影与交互组件

- [x] 2.1 扩展 `src/app/preferences/api.ts` 的偏好类型与 API，封装记录 action、切换固定状态及串行化 launcher 偏好 mutation 的调用。
- [x] 2.2 在 launcher 层实现 action ID 到可展示 entry 的纯映射，按当前 registry 和 locale 解析插件名称并过滤未知 action 或插件。
- [x] 2.3 创建或抽取可复用的 launcher action 卡片：分离打开主按钮与 Naive UI 图钉按钮，提供可访问名称、提示和可见焦点，不嵌套交互元素。

## 3. 启动器默认态与本地化

- [x] 3.1 用真实的最近使用和已固定 entry 替换 `App.vue` 中的 mock 数据；始终渲染两个分区，并在各自为空时显示不含图标的纯文本独立空态。
- [x] 3.2 将搜索、最近使用和已固定统一接入 action 卡片；卡片主交互成功分发后记录最近使用，图钉只切换固定状态且不打开页面。
- [x] 3.3 在记录或固定持久化失败时保留正确的页面/固定状态，并展示可诊断错误。
- [x] 3.4 补充中英文应用 i18n 文案，移除不再引用的 mock 专用文案；确保新增 Naive UI 组件继续由现有 locale/dateLocale 同步驱动。
- [x] 3.5 使用 UnoCSS 组织布局、scoped Less 和现有主题 token 完成卡片、图钉、空态与错误状态，验证 light/dark 下的文本、背景、边框、hover 和 focus 可读性。

## 4. 验证

- [x] 4.1 运行 `cargo test`（在 `src-tauri/`）验证偏好持久化与 registry 相关 Rust 测试。
- [x] 4.2 运行 `pnpm run check` 和 `pnpm run build`，修复由格式、类型或生产构建发现的问题。
- [x] 4.3 通过 Tauri 开发环境手动验证：最近使用和已固定各自空态、搜索卡片固定、固定后重启恢复、成功打开后最近使用更新、取消固定、10 项上限、陈旧 action 隐藏、持久化失败不关闭已打开页面，以及中英文和明暗主题下的可读性与键盘操作。
