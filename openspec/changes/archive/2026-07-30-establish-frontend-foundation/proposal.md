## Why

当前仓库虽然已经具备 React、Tauri、Semi Design、UnoCSS、Less 和测试工具链，但运行界面与 Rust
command 仍保留脚手架占位内容，前端也尚未建立统一的组件、主题和国际化上下文。现在先收敛全局基座，
可以避免后续功能各自创建 Provider、主题状态、locale 状态或临时样式入口。

## What Changes

- 移除 Rsbuild 欢迎界面、示例样式、示例测试和未被产品使用的 Tauri `greet` command。
- 建立最小的 lensX React App Shell，作为后续页面和功能的统一挂载边界，但不在本 change 中实现
  launcher、设置或插件等产品功能。
- 在应用根层接入 Semi Design 的全局样式、组件 locale、明亮/黑暗主题机制和必要的全局 Provider。
- 建立应用级国际化边界，提供英文和简体中文消息，英文为默认语言，并让 Semi Design locale 与应用
  locale 使用同一事实来源。
- 建立单一主题事实来源，支持 `light` 与 `dark`，并确保全局背景、文本和浏览器 color scheme
  不依赖脚手架硬编码。
- 明确简单样式使用 UnoCSS、复杂或复用样式使用 Less，并清理无效或误导性的模板配置。
- 为 App Shell、Provider、locale、主题和根渲染行为增加测试，并同步更新英文实现文档及其简体中文镜像。

## Goals / Non-Goals

**Goals**

- 让仓库从“可运行的模板”转变为“可承载后续功能的 lensX 前端基线”。
- 为 Semi Design、主题、业务国际化和根层错误隔离提供唯一、可测试的集成入口。
- 使当前前端测试、类型检查、格式检查和生产构建保持全绿。

**Non-Goals**

- 不实现启动器搜索、窗口行为、全局快捷键、偏好持久化、设置页面或插件系统。
- 不在本 change 中持久化主题或语言选择，也不跟随操作系统偏好。
- 不新增路由、全局业务状态库或其他组件库。
- 不重新设计 Tauri 桌面窗口和系统集成能力。

## Capabilities

### New Capabilities

- `frontend-foundation`: 定义 lensX React 根应用、Semi Design 全局集成、明暗主题、英中双语国际化、
  根层错误隔离、样式分工和脚手架清理后的最小可观察行为。

### Modified Capabilities

无。

## Impact

- 前端入口、App Shell、全局样式、主题与国际化模块会被新增或调整。
- 需要增加承载业务文案的国际化依赖；不会增加新的 UI 组件库。
- Tauri Rust 入口会移除未使用的示例 command，但不会新增产品 command 或改变桌面能力。
- 现有模板测试将替换为前端基座的行为测试。
- `docs/en/` 与 `docs/zh/` 中的前端实现指南和架构状态会同步更新。
