## Why

当前页面上下文栏已经具备关闭活动页面、返回 Home、恢复启动器输入焦点以及排除窗口拖动的完整行为，但 Owner、打开页面的 Action 与关闭按钮仍以普通文本行呈现，关闭控件被弹性布局推到远离 Action 的位置，无法形成清晰、紧凑的上下文关系。需要将这一区域收敛为一个连续的分段胶囊，使用户能立即识别“谁提供页面、由哪个 Action 打开、从哪里关闭”。

## What Changes

- 将共享页面上下文栏改为按内容收缩的连续分段胶囊，由 Owner 段、Action 段和紧邻 Action 的关闭图标按钮组成。
- 在 Owner 段显示 Host/插件提供方的展示名称以及可选图标；缺少或无法解析图标时使用稳定的通用 fallback，不在视图组件中按 Owner ID 硬编码分支。
- 使用主题感知的层级填充、斜切分隔、文本颜色、悬停状态和键盘焦点状态，同时支持英文、简体中文、浅色主题和深色主题。
- 保持 Owner 与 Action 文本为非交互上下文，保持顶部区域的窗口拖动能力；关闭按钮仍是唯一的上下文操作，并继续排除窗口拖动。
- 保持现有关闭行为：清除活动页面、返回固定高度的 Home 展示状态并将键盘焦点恢复到启动器输入框。
- 在固定 `650×600px` Page 视口下增加截图与计算样式验收，并补充结构、图标 fallback、可访问名称、拖动排除和返回 Home 行为测试。

目标是改善现有共享页面上下文的视觉层级与操作可发现性，并建立可复用的 Owner 展示模型。非目标包括实现插件运行时、插件页面投影、Owner/Action 点击导航、修改 Action 或页面导航协议、修改窗口尺寸，以及重新设计设置页内容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `frontend-foundation`: 共享页面上下文栏新增连续分段胶囊结构、Owner 可选图标与 fallback、主题和本地化视觉要求，同时保留现有关闭、焦点和拖动语义。
- `host-settings`: Host 设置页的页面上下文以 lensX Owner 展示信息和打开设置 Action 名称呈现，并将关闭按钮紧邻 Action 放置。

## Impact

- 前端页面上下文数据模型与解析逻辑：`src/app/navigation/`。
- App Shell 页面状态头部组合：`src/App.tsx`，并可能抽取可复用的页面上下文组件。
- Host 图标解析或 Owner 展示元数据，以及 `src/styles/global.less` 中的语义样式。
- App Shell 导航、窗口拖动、Host 设置 UI、消息键集和视觉验收测试。
- 不新增第三方依赖，不改变 Rust/Tauri 命令、窗口展示状态协议、Action Dispatcher 或插件 Manifest 合同。
