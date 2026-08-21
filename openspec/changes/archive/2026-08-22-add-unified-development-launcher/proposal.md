## Why

当前维护的桌面开发启动方式让 Rsbuild 从固定首选端口 `40755` 启动，但 Tauri `devUrl` 与开发态插件 CSP 仍静态绑定该端口。端口被占用时，Rsbuild 可能选择其他端口，而 Tauri、原生导航策略和插件祖先策略仍指向旧地址，导致启动失败或连接到错误的本地服务。

## What Changes

- 增加一个统一的桌面开发启动器：先启动并持有 Rsbuild 实际可用的 loopback 端口，再以运行时配置启动 Tauri，避免“先探测、后释放”带来的端口竞争。
- 让普通桌面开发与 `dev:plugin-development-mode` 复用同一套启动、参数、环境、退出码、信号转发和清理逻辑，同时保留插件开发模式现有的显式能力开关与 `--plugins-root` 语义。
- 将实际开发 App origin 作为单一事实源传入 Tauri；原生主窗口导航策略与插件 Runtime CSP 从同一份已验证的 `devUrl` 获得精确 origin，不再依赖静态 `40755` 常量。
- 保留前端独立开发入口；维护的桌面开发文档改为使用统一启动器，不再把直接运行 `tauri dev` 描述为受支持的完整编排入口。
- 增加稳定的 `development-launcher` Gate，使用 Rstest、Rust 单元测试、静态检查和纯进程模型验证端口传播、模式组合、故障与终端清理；不启动浏览器、真实 WebView、GUI 应用或环境证据流程。
- 保持发布版 `tauri://localhost`、插件独立 origin、公开 Contract/SDK/Host API、安装与 Runtime 权限边界不变。

## Capabilities

### New Capabilities

- `development-launcher`: 定义统一桌面开发启动器的实际端口解析、精确 App origin 传播、普通/插件开发模式组合、进程生命周期、故障恢复和确定性验证要求。

### Modified Capabilities

无。现有 `frame-aware-webview-navigation-policy`、`plugin-runtime-security-lifecycle` 与 `plugin-development-mode` 已要求使用当前运行模式的精确 App target、可信 Host ancestor 和专用插件开发启动命令；本 Change 只提供满足这些既有要求的统一动态编排。

## Impact

- 影响根开发脚本、Rsbuild 配置、Tauri 开发配置、插件开发启动脚本及其类型与 Rstest 覆盖。
- 影响 Rust 开发态 App origin 校验、插件 CSP 构造和 Plugin Resource Service 的 CSP 所有权类型；生产配置与生产 CSP 保持不变。
- 更新 `docs/en/development/getting-started.md`、相关架构/验证文档及其 `docs/zh/` 镜像。
- 在既有 typed Gate registry 中新增稳定 capability ID `development-launcher`；不新增 Change 专用根校验脚本、转发别名、运行时依赖或组件库。
