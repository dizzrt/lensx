# Proposal

## Why

Launcher 窗口下方圆角出现额外灰色残边。当前共享外层面板同时使用 CSS 投影与 macOS 原生窗口投影，且面板铺满 WebView；本变更拟移除外层 CSS 投影这一可能产生裁切残边的来源，保留圆角与原生悬浮效果。该归因来自截图和源码分析，尚未经过实际窗口对比验证。

## What Changes

- 移除共享 `.launcher-surface` 的 CSS `box-shadow`，使 Home、Search、Host Page 和插件 Page 使用同一外层投影策略。
- 保留现有 `18px` 圆角、内容裁剪、主题背景、透明窗口及 macOS 原生窗口投影；不改变窗口尺寸、页面布局、拖动、焦点或插件缩放契约。
- 在 `frontend-foundation` 中补充共享外层表面的圆角与投影责任要求，并在现有英文前端指南及简体中文镜像中同步说明。
- apply 验证发现既有依赖完整性失败后，用户额外授权清理已跟踪的 Gradle 缓存：保留仓库外可恢复备份，取消跟踪 12 个缓存文件并添加精确忽略规则；不修改依赖源码或完整性基线。
- 非目标：关闭系统投影、添加新的边框或阴影实现、增加透明留白、调整原生圆角或 vendored 依赖、修复其他窗口问题。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `frontend-foundation`：共享 Launcher 外层表面保留圆角和裁剪，不再绘制额外 CSS 投影；macOS 桌面窗口继续使用现有原生投影。

## Impact

- 产品代码预期仅涉及 `src/styles/global.less` 的共享外层面板规则。
- 验证阻塞修复额外涉及根 `.gitignore` 与 `vendor/frame-aware-navigation/tauri/mobile/android/.gradle/` 的缓存跟踪状态；该缓存不属于产品源码或依赖完整性基线。
- 维护文档涉及 `docs/en/development/frontend-guidelines.md` 及 `docs/zh/development/frontend-guidelines.md`；规划阶段不改写已交付行为文档或稳定规格。
- 不增加依赖、产品文案、公开 API、Tauri 命令或持久化数据；`src/App.tsx`、Rust、Tauri 配置与 vendored 依赖保持现有职责。
- 复用现有 Rstest 回归与稳定 `plugin-runtime-slot` Gate，补充完整前端生命周期检查；不新增根脚本、Gate 或 Generate 目标。确定性验证不能证明最终 macOS 像素效果。
