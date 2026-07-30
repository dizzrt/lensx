## Why

当前 lensX 仅提供普通 Tauri 窗口和展示产品身份的最小 React App Shell，尚不能通过全局快捷键快速唤起，也没有符合桌面启动器预期的显示、隐藏、失焦和关闭生命周期。先建立这一最小原生闭环，可以为后续 launcher action、搜索、历史记录和插件能力提供稳定且可验证的承载面。

## What Changes

- 将主窗口收敛为紧凑、无边框、固定宽度、置顶的 launcher 窗口，并限制其最小和最大高度。
- 在 Rust 中建立统一的 launcher 窗口动作边界，支持显示、隐藏和切换；显示时恢复窗口、请求焦点，隐藏时保持应用进程运行。
- 注册默认全局快捷键 `Ctrl+Shift+Space`，通过统一动作边界切换主窗口，而不是在快捷键回调中直接操作窗口。
- 将窗口关闭请求转换为隐藏，并在主窗口失去焦点后自动隐藏。
- 将当前身份展示页替换为最小 launcher 输入界面；窗口初次显示或再次被唤起后，搜索输入获得焦点并可接受文本。
- 保持应用现有 React Provider、Semi Design、英文默认本地化、简体中文、明暗主题和错误边界。
- 补充原生窗口动作、快捷键路由和前端聚焦行为的自动化测试，以及桌面环境下的验证步骤。
- 本 change 不实现 action 模型、搜索匹配、结果列表、执行、最近使用、固定项、设置页、偏好持久化、插件 registry 或外部插件运行时。

## Capabilities

### New Capabilities

- `launcher-window-lifecycle`: 定义 launcher 主窗口的原生形态、显示/隐藏/切换动作、默认全局快捷键、关闭与失焦行为，以及唤起后的输入聚焦。

### Modified Capabilities

- `frontend-foundation`: 将仅展示产品身份且禁止搜索输入的最小 App Shell，调整为复用既有 Provider 的最小 launcher 输入界面，同时继续禁止未实现的结果、设置和插件入口。

## Impact

- Rust/Tauri：主窗口配置、全局快捷键插件、launcher 窗口动作与窗口事件处理。
- React：根 App Shell、最小搜索输入、原生唤起事件适配和焦点恢复。
- 跨边界契约：Rust 向前端通知窗口已激活的类型化事件载荷；不暴露原生窗口对象。
- 测试：Rust 单元测试、Rstest/Testing Library 组件测试，以及真实桌面环境的快捷键与窗口生命周期验证。
- 文档：更新 canonical English 架构/开发文档及对应的简体中文镜像；不把具体实现设计写入 README 或 Agent 规则文件。
- 依赖：预计复用 Tauri 2、现有 React/Semi Design 栈，并增加 Tauri 官方全局快捷键插件；不引入新的组件库。
