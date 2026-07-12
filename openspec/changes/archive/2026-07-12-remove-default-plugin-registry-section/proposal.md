## Why

当前启动器默认主页面在“最近使用”和“已固定”之外额外展示已注册插件列表，和现有默认态只保留两个分区的产品方向不一致。该列表也会把插件 registry 暴露成默认入口，削弱主页面的轻量感。

## What Changes

- 移除启动器搜索为空时默认主体中的插件 registry 分区。
- 默认主体只展示“最近使用”和“已固定”，其中条目继续作为前端表现层 mock 数据。
- 保留搜索栏对已安装插件 actions 的搜索能力。
- 保留点击搜索结果打开插件页面的能力。
- 保留插件 registry 加载作为搜索和插件打开态所需的内部数据来源，但不在默认主页面直接展示。
- 不改变插件系统 contract、插件注册逻辑、别名搜索规则、设置插件行为或真实最近使用/固定项数据接入。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `launcher-panel`: 收紧默认状态展示要求，明确搜索为空时不得展示已注册插件列表或插件 registry 入口分区。

## Impact

- 影响前端启动器主页面 `src/App.vue` 的默认态分支、相关 computed 状态和窗口高度 resize 依赖。
- 影响应用 i18n 文案清理：默认态插件 registry 分区专用文案可移除。
- 不影响 Rust/Tauri 命令、插件 registry 数据结构、Plugin SDK、外部插件 iframe 运行时或持久化偏好。
- 前端 UI 仍位于现有 Naive UI Provider、应用主题、i18n 和 Naive UI locale/dateLocale 同步机制之下；样式继续沿用现有 UnoCSS 与 Less 分工。
