## 1. 搜索结果标题映射

- [x] 1.1 更新 `searchPluginActions` 的结果映射，使 `title` 使用按应用 locale 解析后的插件展示名，而不是 `action.title`。
- [x] 1.2 保持 action 标题、ID、插件名称和有效别名的搜索匹配与排序逻辑不变，并继续使用 `action_id` 触发现有 action dispatcher。

## 2. 前端基座兼容性

- [x] 2.1 确认启动器结果卡片继续直接渲染结果标题，不新增 Naive UI 组件、应用 i18n message、UnoCSS 或 Less 样式。
- [x] 2.2 在 `zh-CN` 与英文 locale 下手动验证搜索 action 标题均显示本地化插件名称，且 locale 缺失时显示英文回退名称。
- [x] 2.3 在 light 与 dark 主题下验证结果卡片的名称可读，并确认点击结果仍打开 action 的目标插件页面。

## 3. 验证

- [x] 3.1 运行 `pnpm run check`。
- [x] 3.2 运行 `pnpm run build`。
