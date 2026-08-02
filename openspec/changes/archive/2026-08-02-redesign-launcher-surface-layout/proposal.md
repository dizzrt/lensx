## Why

当前 Launcher 已具备真实 Action 搜索、执行和 Host 设置页面，但 App Shell 仍保留脚手架式标题、介绍、边框列表与空白主页，三个呈现状态缺少一致的视觉骨架。用户需要一个搜索优先、弱分割、图标化的 Launcher，同时让首页的“最近使用”和“已固定”只展示真实 Action 数据，而不是模拟卡片或 Registry 默认顺序。

## Goals

- 统一 `home`、`search`、`page` 三种状态的顶部区域和内容节奏，移除当前产品标题与介绍文本。
- 让首页以“最近使用”和“已固定”两行展示真实 Action 集合，并提供确定、可持久化的集合语义。
- 将搜索结果改为仅包含“搜索结果”的图标化网格，同时保留键盘优先、Dispatcher 执行和无障碍反馈。
- 让设置页面顶部以“所属方名称 / Action 名称 / 关闭按钮”表达页面上下文，设置正文保持现有能力范围。
- 保持英文默认、简体中文镜像、light/dark theme 和单窗口固定离散高度边界。

## Non-Goals

- 不实现 avatar 的账户、菜单、点击、通知或身份能力；它只作为非交互视觉占位。
- 不为“全部”提供导航、列表或管理能力；它只作为“已固定”标题右侧的非交互视觉占位。
- 不实现插件运行时、插件 Action 投影、插件管理、远程搜索、市场推荐或个性化推荐。
- 不重新设计设置页中的主题、语言和插件空状态内容。
- 不根据 DOM 测量、卡片数量或结果数量连续调整 Native 窗口尺寸。

## What Changes

- 移除 Launcher 顶部的 `lensX` 标题与介绍文本，使用统一顶部区域承载搜索输入或页面上下文，并在最右侧保留无交互 avatar 占位。
- 将空查询主页替换为两条真实 Action 集合：第一行“最近使用”，第二行“已固定”；“全部”跟随“已固定”标题显示，但不具备交互语义。
- 新增最近使用与固定 Action 的 Host-owned 集合契约和 Rust/Tauri 持久化边界：集合只保存有序 `action_id`，渲染时通过当前 Registry 解析，缺失或禁用项不得伪造成可用卡片。
- 成功执行 Action 后更新最近使用顺序；失败执行不得进入最近使用。提供最小的固定/取消固定操作，但不把“全部”占位扩展为管理入口。
- 扩展可序列化 Action 展示元数据以支持可选图标，并规定缺少或无法解析图标时使用稳定的通用 Action 回退图标。
- 将非空查询结果改为固定列数、最多八项的 Action tile 网格；可见内容只保留“搜索结果”分区、真实结果、无结果状态和必要错误反馈。
- 扩展网格键盘模型：左右键在同一行前后移动，上下键跨行移动，Enter 继续通过 Dispatcher 执行，Escape 清空查询并恢复输入焦点。
- 将活动设置页面的顶部输入区域替换为同形的页面上下文条，显示当前所属方和打开页面的 Action 名称以及关闭 icon 按钮；关闭后返回主页并恢复搜索输入焦点。
- 调整 `home` 的固定呈现高度以容纳搜索栏和两条 Action 集合；`search` 与 `page` 继续使用固定离散高度。
- 更新英文架构与前端指南及其简体中文镜像，并增加集合持久化、网格交互、页面上下文、主题、本地化和占位非交互行为的测试。

## Capabilities

### New Capabilities

- `launcher-action-collections`: 定义最近使用与已固定 Action 的有序集合、成功执行更新、固定/取消固定、Rust/Tauri 持久化、Registry 解析、空状态与失败恢复行为。

### Modified Capabilities

- `frontend-foundation`: 将脚手架式标题、介绍和空白主页更新为统一顶部区域、最近使用/已固定首页和非交互 avatar/“全部”占位。
- `launcher-action-core`: 为 Action Descriptor 增加可选且可验证的展示图标元数据与稳定回退规则，同时保持 executor 隔离。
- `launcher-action-search`: 将纵向结果列表更新为单一“搜索结果”网格，补充二维键盘导航，并允许空查询时由独立首页集合能力提供内容。
- `host-settings`: 将现有页面上下文头部更新为同形上下文条，显示所属方、打开页面的 Action 名称与关闭 icon 按钮，不改变设置正文能力。
- `launcher-window-lifecycle`: 调整 `home` 的 Host-controlled 固定高度以容纳新首页布局，继续禁止内容测量和任意尺寸提交。

## Impact

- 前端主要影响 `src/App.tsx`、Launcher Action 类型/验证/搜索/执行组合、页面上下文解析、首页和结果组件、i18n 资源、UnoCSS/LESS 样式与相关 Rstest/Testing Library 测试。
- Rust/Tauri 层新增 Launcher Action 集合的类型化读写命令和持久化实现，并调整受约束的 `home` 呈现高度；现有窗口 show/hide/toggle 边界保持不变。
- 稳定 Action Descriptor 将增加可选图标字段；搜索评分仍只依赖既有标题、关键词和描述，不根据图标、最近使用或固定状态改变相关性。
- 不引入新的组件库、状态管理框架、路由器或运行时依赖。
- 需要更新 `docs/en/architecture/overview.md`、相关前端/扩展平台文档及对应 `docs/zh/` 镜像。
