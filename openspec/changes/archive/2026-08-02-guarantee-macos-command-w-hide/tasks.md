## 1. Rust 菜单与生命周期路由

- [x] 1.1 在 Rust launcher 生命周期模块中定义稳定的 macOS Close Window 菜单 ID 与可独立测试的菜单事件路由，使已知 ID 只返回统一 `Hide` action、未知 ID 不产生 launcher action。
- [x] 1.2 使用现有 Tauri menu API 构建应用所有的 macOS 菜单：保留默认编辑、窗口和退出语义，移除冲突的 predefined Close Window accelerator，并确保恰好一个应用内菜单项持有 `Cmd+W`；不得新增运行时依赖。
- [x] 1.3 将菜单安装、启用和事件监听接入现有 launcher 初始化顺序，仅在 `Ctrl+Shift+Space` 恢复路径成功注册后允许 `Cmd+W` 隐藏，并将菜单安装或 hide action 失败记录为包含 action/operation 阶段的可诊断错误且不终止进程。
- [x] 1.4 增加 Rust 单元测试，覆盖已知/未知菜单 ID、唯一 `Cmd+W` 路由、统一 hide action 复用、恢复快捷键失败时不启用隐藏入口、菜单安装降级和隐藏失败诊断，同时确认既有原生 `CloseRequested` 与焦点丢失路由不回归。

## 2. 文档与规格一致性

- [x] 2.1 更新 `docs/en/architecture/overview.md`，说明无边框窗口为何不能依赖原生 `performClose:`、应用内 `Cmd+W` 如何进入统一 Rust action boundary，以及恢复路径未就绪时的降级行为。
- [x] 2.2 同步更新 `docs/zh/architecture/overview.md`，保持与英文规范文档语义一致、相对路径镜像不变。
- [x] 2.3 对照 proposal、design、delta spec、实现和测试，确认 `Cmd+W`、`Cmd+Q`、无边框视觉、全局恢复快捷键及 Windows/Linux 非目标边界一致，并更新已验证任务复选框。

## 3. macOS 行为验收

- [x] 3.1 在真实 macOS launcher 上验证：窗口处于前台时按 `Cmd+W` 后窗口隐藏但进程继续运行，且控制台不再只有无关的 TSM 键盘状态日志而没有 Host 路由结果。
- [x] 3.2 验证隐藏后按 `Ctrl+Shift+Space` 可恢复窗口并重新聚焦 launcher 输入，同时确认点击窗口外隐藏、原生关闭事件路径和重复显示/隐藏不会形成 action loop。
- [x] 3.3 验证 `Cmd+Q` 仍退出应用、其他应用的 `Cmd+W` 不受 lensX 影响、launcher 仍保持透明无边框外观和既有固定尺寸。

## 4. 最终验证

- [x] 4.1 运行前端完整验证：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`；虽然没有计划修改前端代码，仍验证 Rust/Tauri 集成未破坏共享构建与类型边界。
- [x] 4.2 运行 Rust 完整验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，确认所有测试通过且没有新增 warning 或 error。
- [x] 4.3 运行 `openspec validate guarantee-macos-command-w-hide --type change --strict`，修复本 change 引入的每个 warning 和 error；任何命令失败后先重跑失败命令，再重跑第 4 节全部验证命令与第 3 节 macOS smoke test。
