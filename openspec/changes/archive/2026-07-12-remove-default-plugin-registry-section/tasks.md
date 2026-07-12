## 1. 默认态 UI 收敛

- [x] 1.1 从 `src/App.vue` 默认态模板中移除插件 registry 分区，确保搜索为空时只渲染 `visibleSections`。
- [x] 1.2 保留 `recentItems` 和 `pinnedItems` 作为表现层 mock 数据，不为“已固定”中的设置项接入真实插件 action。
- [x] 1.3 保留搜索态的插件 action 结果列表和插件打开态的 `PluginPageOutlet` 渲染逻辑。

## 2. 状态和文案清理

- [x] 2.1 移除只服务于默认态插件列表的 `pluginActions` 和 `pluginHostHint` 状态。
- [x] 2.2 更新窗口高度 resize watcher，移除对已删除状态的依赖，并保留默认态、搜索态、插件打开态高度同步。
- [x] 2.3 删除 `src/app/i18n/messages.ts` 中不再引用的 `pluginHost.registry.*` 和 `pluginHost.section.*` 中英文文案。
- [x] 2.4 全仓搜索确认 `pluginHost.registry.*`、`pluginHost.section.*`、`pluginActions`、`pluginHostHint` 不再被引用。

## 3. 验证

- [x] 3.1 运行 `pnpm run build` 验证前端构建。
- [x] 3.2 手动检查默认态只展示“最近使用”和“已固定”，且不展示已注册插件列表。
- [x] 3.3 手动检查输入搜索词后仍可展示插件 action 搜索结果，并可打开插件页面。
- [x] 3.4 手动检查清空搜索词或关闭插件页面后恢复到只包含两个默认分区的主页面。
