## 1. macOS Accessory 应用身份

- [x] 1.1 添加打包应用的 `LSUIElement=true` 元数据，并为 `tauri.conf.json` 的 `main` Window 启用 `visibleOnAllWorkspaces`；增加策略检查，证明保留 `alwaysOnTop`、非全屏和既有尺寸约束，且没有使用 macOS 不支持的 `skipTaskbar`。
- [x] 1.2 在 Rust Host 中实现 macOS-only Accessory application setup，使用 `ActivationPolicy::Accessory`、安全 setup stage 和 fail-fast 结果；增加确定性测试覆盖 Accessory、禁止 Regular/Prohibited 降级、失败诊断和非 macOS 不变。
- [x] 1.3 调整应用 setup 顺序，使 bundle/runtime 应用策略在首个可见 Host Window 之前建立，并证明策略失败时 Launcher、全局快捷键和插件服务不会被宣告为就绪。

## 2. 跨 Space 与全屏 Window 策略

- [x] 2.1 实现 macOS-only 原生 `main` Window collection setup，在主线程保留现有 flags 并合并 `FullScreenAuxiliary`，验证 `CanJoinAllSpaces`、完整 Window identity 和既有 `alwaysOnTop`，不新增前端、Tauri command 或插件 setter。
- [x] 2.2 为 collection setup 增加可注入的确定性测试边界，覆盖 Window 缺失、非主线程、setter/确认失败、保留既有 flags、幂等重复 setup 和安全 operation diagnostics。
- [x] 2.3 将应用激活作为统一 show action 的 macOS operation stage，保持“activate accessory app → restore → show → focus → Host activation event → current Child presentation restore”的顺序，并增加普通 show、toggle、失败短路、重复激活和 Child WebView 原子性测试。

## 3. Accessory 本地关闭与退出

- [x] 3.1 在无可见应用菜单栏的 Accessory 模式下保留恰好一个 application-local `Cmd+W` 和一个 `Cmd+Q` command route；证明 `Cmd+W` 复用 Hide action、`Cmd+Q` 进入现有 teardown/exit，且两者没有注册到 global-shortcut plugin。
- [x] 3.2 增加确定性测试，覆盖 lensX 前台时的恰好一次 `Cmd+W`/`Cmd+Q`、其他前台应用不受影响、默认恢复快捷键失败时不启用 hide 路径，以及菜单安装或本地 command routing 的安全失败诊断。
- [x] 3.3 在目标 macOS 验证隐藏 menu command graph 的 key equivalents；若当前 Tauri/AppKit 运行时不分发其中任一命令，则实现并测试幂等、可释放、仅 lensX 前台生效的 AppKit local event monitor 回退，禁止系统级 `Cmd+W`/`Cmd+Q` 注册。

## 4. 目标 macOS 产品证据

- [x] 4.1 建立 focused macOS evidence harness 和独立牺牲全屏测试应用，使用隔离的临时状态与有界超时，记录 macOS、Tauri/Tao/Wry revision、bundle/runtime policy、Window collection behavior、level、occlusion、focus 和进程状态。
- [x] 4.2 增加打包 `.app` 的无 Dock gate，验证 Launch Services 启动从可观察生命周期开始没有 lensX Dock tile、运行时为 Accessory、无普通应用菜单栏，并覆盖隐藏后进程/默认快捷键仍存活及 setup failure。
- [x] 4.3 增加普通 Space 与其他应用全屏 Space 矩阵，验证生产 shortcut action 路径的重复 hide/restore、当前 Space 上层可见、键盘输入、不切换旧 Space、不改变牺牲应用全屏状态，以及无重复 listener/Window。
- [x] 4.4 在同一真实矩阵中覆盖 current plugin Child WebView 同尝试隐藏/恢复、Host chrome 与插件内容共同可见、`Cmd+W`、恢复、`Cmd+Q` teardown 和其他前台应用本地快捷键不受影响；失败时保留证据并进行优雅清理。
- [x] 4.5 为 evidence schema、policy checker 和 gate graph 增加 TypeScript/Rstest 测试及一个聚合 focused check 命令，确保静态或模拟结果不能替代当前打包产品证据。

## 5. 规范与双语文档

- [x] 5.1 更新 `docs/en/architecture/overview.md` 的 canonical Launcher 生命周期说明，并同步语义一致的 `docs/zh/architecture/overview.md`，覆盖 Accessory、无 Dock、Space/fullscreen、activation 顺序、本地 `Cmd+W/Cmd+Q`、失败策略和多显示器非目标。
- [x] 5.2 更新英中文 macOS 验证文档，记录 focused gate、打包 `.app` 前提、牺牲全屏应用、证据字段、失败分类、无用户默认浏览器/应用会话依赖和清理步骤。
- [x] 5.3 对照实现和证据复核 proposal、design、delta spec 与任务勾选，保持 active artifacts 一致；在未来同步或归档前将进入 stable spec 的内容重写为 canonical English。

## 6. 最终验证

- [x] 6.1 运行 focused Accessory/Space policy、Rust lifecycle、Child presentation、evidence schema、文档镜像和目标 macOS 打包产品 gates；修复全部失败和新增 warning 后重跑失败项及完整 focused 集合。
- [x] 6.2 运行前端完整验证 `pnpm run test`、`pnpm run check`、`pnpm run typecheck` 和 `pnpm run build`；本变更没有 UI 改动，但这些命令必须证明 React/插件公共边界与 workspace 生命周期没有回归。
- [x] 6.3 运行 Rust 完整验证 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，修复全部错误和 warning 后重跑失败项及完整集合。
- [x] 6.4 运行 `openspec validate support-macos-accessory-launcher-across-fullscreen-spaces --strict --no-interactive` 和 `openspec validate --all --strict --no-interactive`，确认所有任务证据、双语文档和完整变更保持一致；不在此任务中归档 change。
