## 1. 原生窗口配置与依赖

- [x] 1.1 将 Tauri `main` 窗口配置为 650px 固定宽度、180px 初始与最小高度、800px 最大高度、无边框、不可调整大小、非全屏、透明且置顶，并保持稳定窗口标签；确认本次不加入 DOM 内容驱动的自动高度。
- [x] 1.2 添加与当前 Tauri 2 版本对齐的官方 global-shortcut Rust 插件并更新锁文件；检查 capability 配置，只有在运行时确实需要时才增加最小权限，不引入新的组件库或其他运行时依赖。

## 2. Rust launcher 窗口生命周期

- [x] 2.1 建立 Rust launcher window action 模块，定义 `show`、`hide`、`toggle`、激活原因和带动作/操作阶段的可诊断错误，并通过可测试 adapter 隔离动作决策与具体 Tauri window 调用。
- [x] 2.2 实现主窗口解析和动作执行：`show` 按恢复、显示、聚焦、发送类型化 `launcher://activated` 事件的顺序执行，`hide` 仅隐藏窗口，`toggle` 根据可见性复用前两条路径。
- [x] 2.3 建立默认快捷键绑定与管理入口，注册唯一的 `Ctrl+Shift+Space → toggle` 映射，只处理按下事件，并确保快捷键 handler 不直接调用原生窗口操作。
- [x] 2.4 按“动作状态 → 快捷键注册 → lifecycle listener”的顺序接入 Tauri setup；快捷键成功后将关闭请求和失焦事件路由为 `hide`，注册失败时保留可见、可普通关闭且不会永久隐藏的降级窗口，并输出可诊断信息。
- [x] 2.5 为动作路由、可见/不可见 toggle 分支、原生操作顺序、错误传播、快捷键按下/释放过滤、单一绑定和注册失败降级添加 Rust 单元测试。

## 3. React 最小 launcher 输入与激活适配

- [x] 3.1 建立类型化桌面激活事件 adapter/hook，解析 `launcher://activated` 载荷、支持测试注入，并在 React 组件卸载或订阅替换时可靠释放 listener。
- [x] 3.2 将当前产品身份页迁移为复用 `AppProviders` 的语义化最小 launcher 界面，使用 Semi Design 输入组件和 React 本地状态支持文本编辑，不渲染搜索结果、模拟 action、设置或插件入口。
- [x] 3.3 实现输入首次挂载主动聚焦和每次激活事件后的焦点恢复，确保重复隐藏/显示不会累积 listener，且事件监听失败能够被诊断而不破坏首次输入。
- [x] 3.4 为输入 accessible label、placeholder、产品身份及必要说明补充 canonical English 和语义对齐的 Simplified Chinese 消息，更新共享 message schema，并使用 UnoCSS 处理简单布局、Less 处理 launcher 复杂视觉和主题 token 桥接。
- [x] 3.5 更新 Rstest/Testing Library 测试，覆盖英文和中文界面、受控输入、无模拟结果、首次聚焦、激活后再次聚焦、重复激活和卸载清理，并保持既有 Provider、主题和 error boundary 测试通过。

## 4. 架构文档与镜像

- [x] 4.1 在实现和测试完成后更新 `docs/en/architecture/overview.md`，准确描述已实现的 launcher 原生窗口生命周期、Rust/React 边界、默认快捷键、激活事件和仍未实现的 action/search 能力。
- [x] 4.2 同步更新 `docs/zh/architecture/overview.md`，保持与英文 canonical 文档路径、结构和语义一致；检查两个文档索引仍然有效且正式文档不引用临时材料。

## 5. 最终验证

- [x] 5.1 运行 `pnpm run test`，验证全部前端单元和组件测试；修复本 change 引入的失败与 warning。
- [x] 5.2 运行 `pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`，修复本 change 引入的类型、格式、静态检查、warning 和生产构建问题。
- [x] 5.3 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，修复本 change 引入的 Rust 格式、测试、静态检查、warning 和编译问题。
- [x] 5.4 在真实桌面开发环境 smoke test：确认窗口尺寸/边框/置顶，`Ctrl+Shift+Space` 双向切换，关闭转隐藏，失焦隐藏，应用进程保留，以及首次与再次显示后的输入焦点；记录无法在当前平台验证的跨平台表现。
- [x] 5.5 验证 English/简体中文文档镜像、相对链接、OpenSpec artifacts 一致性和无临时材料引用，并运行 `openspec validate implement-launcher-window-lifecycle --type change --strict --no-interactive`。
- [x] 5.6 若任一验证失败，先修复失败及本 change 引入的全部 warning/error，重新运行对应失败命令，再完整重跑 5.1–5.5 的最终验证集合并记录仍存在的限制。
