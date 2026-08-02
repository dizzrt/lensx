## 1. 原生拖窗边界与最小权限

- [x] 1.1 在 launcher 前端模块中增加类型化 `LauncherWindowDragController`，提供 desktop 与 inert 实现；desktop 实现只封装当前 Tauri 窗口的 `startDragging()`，不暴露窗口对象、坐标、尺寸或其他原生操作。
- [x] 1.2 将 desktop controller 接入生产 App Shell，并保留可注入依赖供 Rstest 使用；拒绝的拖动 Promise 只产生开发期诊断，不清除查询、选择、页面或焦点状态。
- [x] 1.3 在仅适用于 `main` 窗口的 capability 中增加 `core:window:allow-start-dragging`，不加入位置设置、缩放、最大化或其他无关窗口权限。
- [x] 1.4 增加原生配置/边界测试，验证拖动权限限定到 `main`、固定窗口形状仍为 `650px` 宽和 `320/480/600px` 离散高度，并验证 controller 正确调用和传播 Tauri 拒绝结果。

## 2. 统一顶部拖动交互

- [x] 2.1 将窗口顶部内边距、统一顶部槽及其下方间距组织为横跨窗口宽度的显式拖动容器，同时保持现有连续表面、圆角、间距以及 `home`、`search`、`page` 三种状态的布局不变。
- [x] 2.2 在统一顶部容器实现事件委托：仅主鼠标单击序列可以请求拖动，顶部空白、搜索输入、页面上下文非操作区域和头像均路由到 `LauncherWindowDragController`，非主按键与键盘事件不触发拖动。
- [x] 2.3 为页面上下文关闭按钮及未来顶部操作控件增加可复用的显式拖动排除标记，并确保按钮本身及其图标子节点都不会把事件路由到拖窗边界。
- [x] 2.4 保留搜索输入的默认单击行为，不在输入目标上调用会阻止聚焦或光标定位的默认事件取消；回归受控查询、键盘导航、键盘文本选择和输入法组合，并保持鼠标拖动时查询不变。
- [x] 2.5 保持头像的 `aria-hidden`、不可聚焦、无按钮/链接/菜单语义，保持页面上下文和关闭按钮现有的可访问名称与焦点恢复行为；不得新增用户可见文案或仅为拖动提示使用的持久填充。

## 3. 自动化交互覆盖

- [x] 3.1 使用 fake drag controller 增加 App Shell 测试，分别验证从顶部空白、搜索输入、页面上下文非操作区域和头像发起主鼠标拖动，并覆盖 `home`、`search`、`page` 三种展示状态。
- [x] 3.2 增加排除与失败测试：关闭按钮及其图标、辅助按键、右键和键盘事件不请求拖动；controller 拒绝后查询、Action 选择、活动页面和焦点状态保持可用。
- [x] 3.3 增加搜索输入回归测试，验证无移动单击仍聚焦、查询编辑和现有键盘导航不变、输入法组合不触发拖动，并明确主鼠标拖窗手势不承担文本范围选择。
- [x] 3.4 回归英语/简体中文、浅色/深色主题以及头像和关闭按钮的可访问语义，验证顶部结构调整没有引入持久卡片填充或新的产品文案。

## 4. 文档与原生验收

- [x] 4.1 更新 `docs/en/development/frontend-guidelines.md`，记录 launcher 顶部拖动容器、交互控件排除、输入手势仲裁、最小 Tauri 权限和原生验收要求，并同步更新 `docs/zh/development/frontend-guidelines.md` 简体中文镜像及两种语言索引（如索引描述受影响）。
- [x] 4.2 在 macOS 原生 `650px` 宽 launcher 中分别从顶部空白、搜索输入、页面上下文非操作区域和头像拖动窗口，确认窗口实际移动且 `home/search/page` 仍保持 `320/480/600px` 高度。
- [x] 4.3 在原生窗口验证搜索输入单击光标定位、英文和中文输入法、键盘选择、页面关闭按钮、失焦隐藏与快捷键恢复；任何拖动不得意外执行 Action、关闭页面、改变查询或触发最大化。
- [x] 4.4 在固定原生 viewport 下保存 `home`、`search`、`page` 的验收截图并检查关键计算样式，确认连续表面、圆角、透明背景、头像和顶部间距没有视觉回退。

## 5. 最终验证

- [x] 5.1 运行受影响的 launcher frontend 测试和原生配置/边界测试；修复本 change 引入的全部失败和警告后重跑这些聚焦测试。
- [x] 5.2 运行 `pnpm run format`、`pnpm run check`、`pnpm run test`、`pnpm run typecheck` 和 `pnpm run build`，修复全部失败和警告后重跑完整前端验证集。
- [x] 5.3 运行 `pnpm run src-tauri:format`、`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，修复全部失败和警告后重跑完整 Rust 验证集。
- [x] 5.4 运行 `openspec validate enable-launcher-top-region-drag --type change` 和 `git diff --check`，确认所有实现任务、delta specs、双语文档、自动化验证与 macOS 原生验收证据一致后再声明完成。
