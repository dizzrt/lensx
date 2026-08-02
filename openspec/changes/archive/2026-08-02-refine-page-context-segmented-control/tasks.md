## 1. 页面上下文展示模型

- [x] 1.1 为 `PageContext` 增加只读、可序列化的 Owner 图标展示类型，并让解析层为 `lensx.core` 返回 lensX Owner token，同时保持当前 locale 下的 Owner 名称、打开 Action 名称和页面标题 fallback 行为。
- [x] 1.2 增加页面上下文解析单元测试，覆盖 lensX Host 展示信息、Action 名称本地化、缺失 Action fallback，以及输出对象不携带 ReactNode、函数或插件包内资源。
- [x] 1.3 实现独立的页面上下文 Owner 图标解析组件，支持 lensX Owner token 与未知或缺失 token 的通用提供方 fallback，并用聚焦测试证明不会复用设置 Action 的齿轮图标语义。

## 2. 分段页面上下文组件

- [x] 2.1 抽取无业务分支的页面上下文视图组件，按顺序组合非交互 Owner 段、非交互 Action 段和 Semi Design borderless 关闭按钮，并保留区域可访问名称、关闭按钮本地化名称与拖动排除标记。
- [x] 2.2 将 App Shell 的 `page` 顶部结构迁移到新组件，保留完整宽度的透明拖动槽位和右侧非交互头像，同时保持现有 `closeActivePage`、Home 状态恢复、固定高度切换、输入焦点恢复与页面错误隔离行为。
- [x] 2.3 在 `global.less` 中实现按内容收缩的连续胶囊、Owner/Action 主题层级填充、装饰性斜切分隔、文本约束、关闭按钮紧邻布局以及 hover、active、`:focus-visible` 状态；简单布局继续使用 UnoCSS，所有颜色使用 Semi token。

## 3. 自动化与视觉验收

- [x] 3.1 增加页面上下文组件测试，验证 Owner/Action/关闭按钮顺序、无可见 `/` 分隔文本、Owner 图标 token 与 fallback、长文本约束容器、唯一可聚焦操作和关闭回调。
- [x] 3.2 更新 App Shell 导航、Host 设置与窗口拖动测试，验证 lensX Owner 展示、打开设置 Action 名称、英文与简体中文可访问名称、明暗主题、关闭按钮拖动排除，以及关闭后返回 Home 并恢复输入焦点。
- [x] 3.3 在固定 `650×600px` Page 视口完成英文浅色、简体中文浅色和至少一种深色主题的截图验收，并记录计算样式证据，确认胶囊按内容收缩、斜切分隔清晰、关闭按钮紧邻 Action、右侧头像保留、焦点状态可辨识且长文本不会遮挡关闭按钮。

## 4. 文档同步

- [x] 4.1 更新 `docs/en/development/frontend-guidelines.md`，记录共享页面上下文的 Owner/Action/关闭组合、Owner 图标解析边界、Semi/UnoCSS/Less 分工和视觉验收要求。
- [x] 4.2 同步更新 `docs/zh/development/frontend-guidelines.md`，确保与英文文档语义一致且两个文档索引无需结构调整。

## 5. 最终验证

- [x] 5.1 运行 `pnpm run format` 和 `pnpm run src-tauri:format`，确认前端与 Rust 格式化结果只包含本 change 的预期修改。
- [x] 5.2 运行完整前端测试 `pnpm run test`，修复本 change 引入的所有失败与警告。
- [x] 5.3 运行前端静态检查、类型检查和构建：`pnpm run check`、`pnpm run typecheck`、`pnpm run build`。
- [x] 5.4 运行 Rust 格式检查、测试和静态检查：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`；虽然本 change 不修改原生协议，仍以完整桌面验证确认前端集成未破坏工作区。
- [x] 5.5 运行 `openspec validate refine-page-context-segmented-control --type change`，修复所有 OpenSpec、测试、格式、静态分析、类型、构建和 Rust 验证问题，然后重新运行失败命令及第 5 节的完整验证集。
