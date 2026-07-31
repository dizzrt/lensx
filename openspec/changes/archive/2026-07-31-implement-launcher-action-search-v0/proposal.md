## Why

lensX 已经具备 Host-owned Launcher Action Registry、稳定 Action Descriptor 和统一 Dispatcher，但当前 App Shell 仍只保存输入文本，不读取 Registry snapshot、匹配 Action 或展示真实结果。现在需要建立第一个可观察、可验证的统一 Action 搜索闭环，让现有内置 Action 能够通过键盘优先的 Launcher 被发现和执行，并为未来任何注册到同一 Registry 的 Action 保留一致入口。

## Goals

- 提供只面向 Registry snapshot 的统一 Action Search，不按内置或插件来源分叉。
- 对本地化标题、描述和 `default_keywords` 提供确定性、大小写不敏感的匹配、评分与排序。
- 在 App Shell 中展示真实搜索结果，支持键盘与指针选择，并通过现有 Dispatcher 执行所选 Action。
- 保持搜索结果、执行状态、空状态和错误状态可访问、可本地化，并兼容 light/dark theme。

## Non-Goals

- 不实现插件 Action 到 Host Registry 的投影、Provider lifecycle、插件名称匹配或 `default_action_id` 提升。
- 不实现模糊编辑距离、语义搜索、个性化排序、历史、最近使用、固定、持久化或远程搜索。
- 不修改 Action Descriptor 的信任边界，不向 React 暴露 executor，也不新增插件或 Native 执行入口。
- 不根据结果数量自动调整 Native Launcher 窗口高度，不修改全局快捷键或窗口生命周期。

## What Changes

- 新增框架无关的 Launcher Action Search 契约，输入查询、应用 locale、只读 Registry snapshot 和结果上限，输出确定性排序的可序列化 Action 结果。
- 规定查询规范化、分词、字段优先级、全部查询 token 匹配、禁用 Action 过滤、空查询、无结果、结果上限和稳定平分规则。
- 让 React App Shell 创建并消费默认 Launcher Action Service，将当前输入连接到真实 Registry snapshot，渲染有界且可滚动的结果列表。
- 增加键盘导航、可见选中态、Enter/点击执行、Escape 清空和执行结果反馈，并保持输入焦点与无障碍语义。
- 通过现有 Host Dispatcher 执行选中 Action；搜索层和组件不得读取、携带或调用 executor。
- 更新英文架构文档及对应简体中文镜像，明确统一 Action 搜索已实现而插件 Action 投影仍未实现。
- 增加搜索域测试、React 交互测试和边界测试，确认结果仅来自 Registry snapshot，且未来注册的任意合法 Action 无需来源特判即可被同一搜索逻辑处理。

## Capabilities

### New Capabilities

- `launcher-action-search`: 定义基于 Host Action Registry snapshot 的统一查询规范化、匹配、评分、排序、结果模型、键盘选择与 Dispatcher 执行行为。

### Modified Capabilities

- `frontend-foundation`: 将仅保存文本且不产生结果的最小 Launcher 输入更新为可展示并操作真实 Action 搜索结果的产品界面，同时继续禁止模拟结果和未实现的插件入口。

## Impact

- 主要影响 `src/app/launcher/actions/` 的应用/领域服务、React App Shell、应用 i18n 资源、Launcher 样式以及相应前端测试。
- 复用现有 `LauncherActionRegistry`、descriptor snapshot、metadata locale fallback、`LauncherActionDispatcher` 和 `lensx.core.hide_launcher` 内置 Action。
- 不修改现有 Tauri command 或 Rust 窗口生命周期行为；不要求新增运行时依赖或组件库。
- 需要更新 `docs/en/architecture/overview.md`、`docs/en/architecture/extension-platform.md` 及其 `docs/zh/` 镜像。
