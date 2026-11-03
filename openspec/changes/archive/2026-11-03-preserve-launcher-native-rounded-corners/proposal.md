# Proposal

## Why

进入 ConfigLens、翻译等插件 Page 后，独立原生 Child WebView 的矩形背景覆盖窗口底部，使左右下角失去首页已有的圆角。当前 `.launcher-surface` 的 CSS 裁剪只覆盖 Host 文档，尚未兑现稳定规范要求的所有 Launcher surface 统一外圆角；需要在当前 macOS 原生合成边界补齐这一行为。

## What Changes

- 由 Rust Host 在承载 Host WebView 与插件 Child WebView 的共同原生内容容器上统一执行外轮廓裁剪，保持现有 `18px` 对应的逻辑圆角尺寸和透明角外区域。
- 明确原生插件内容也必须受同一外轮廓约束，覆盖官方、外部和 Development Mode 插件，以及加载、就绪、失败、重试、切换、关闭和隐藏恢复状态。
- 窗口尺寸或显示缩放变化时，裁剪随当前窗口内容边界保持有效；沿用已有 Child slot revision、same-attempt reuse 和 stale-attempt 隔离。
- 将 `plugin-child-webview-runtime` 中外窗口裁剪的 `MAY` 收紧为与 `frontend-foundation` 一致的 `MUST`，并明确裁剪不依赖插件背景、CSS 或主动配合。
- 补充生产原生裁剪策略与接线的确定性验证，同步英文文档及简体中文镜像，明确 DOM 样式、原生裁剪与验证证据各自的边界。

目标是让整个 Launcher 始终呈现相同的四角外轮廓，尤其保证插件铺满窗口底部时两个下角仍然圆滑、角外透明。

非目标：不改变插件内部 UI、Host body inset、Page 尺寸与 resize 权限、Manifest/SDK/Host API、焦点和键盘行为；不添加 CSS 外阴影、装饰遮角、插件专用补丁、跨平台窗口重构或真实 WebView/截图验证入口。本次原生修复面向当前 macOS 路径，其他平台维持既有行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `frontend-foundation`: 明确共享外圆角必须覆盖完整原生内容合成结果，并在插件内容到达底边、尺寸/缩放变化及生命周期转换时持续有效。
- `plugin-child-webview-runtime`: 将 edge-to-edge 插件 slot 的外窗口裁剪规定为强制要求，并明确普通插件无需适配、原生裁剪与 slot 几何/生命周期的协作边界。

## Impact

- 原生实现：主窗口初始化、macOS 原生内容容器适配及必要的 Child 呈现接线；优先通过产品 Rust 层和现有 Objective-C 绑定完成，不修改 vendored Tauri/Wry/Tao 的导航、输入或窗口行为。
- 前端与契约：保留 `.launcher-surface` 的主题、DOM 圆角和 edge-to-edge slot；加入逻辑半径一致性约束，不引入新公开参数、权限或持久化字段。
- 验证：复用 `plugin-runtime-slot`、`plugin-child-webview-runtime`、`plugin-child-webview-window-lifecycle` 和 `launcher-input-focus` Gate，补充现有 Rstest/Cargo 范围内的确定性测试；以 `validation-governance` 检查验证入口边界，不新增根脚本。
- 文档：更新 `docs/en/architecture/plugin-child-webview-runtime.md`、`docs/en/development/frontend-guidelines.md`、相关 validation 说明及 `docs/zh/` 同路径镜像。
- 兼容性：无插件包重建、数据迁移或公开协议版本变化。最终 macOS 像素、阴影及原生交互不由静态检查或模型测试证明，交付记录须保留该证据边界。
