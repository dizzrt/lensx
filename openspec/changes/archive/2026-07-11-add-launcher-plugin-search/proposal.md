## Why

当前启动器搜索栏已经是用户进入 lensX 的默认入口，但搜索状态仍停留在表现层 mock 数据，无法搜索和打开已经注册的插件能力。插件 registry 已经能暴露已安装插件及其 actions，现在需要让 launcher 固有搜索能力接入这份真实数据，使用户可以直接通过顶部搜索栏发现并打开插件。

## What Changes

- 将搜索定义为 launcher 的固有内部能力，而不是新增内建搜索插件。
- 搜索输入非空时，启动器主体展示来自已安装插件 actions 的真实搜索结果。
- 搜索结果至少匹配插件名称、插件 ID、action 标题和 action ID。
- 用户点击插件搜索结果时，复用现有插件 action dispatcher 打开对应插件页面。
- 保持搜索输入为空时的默认状态不变，继续展示最近使用和已固定分区。
- 搜索结果文案、空状态、错误状态和视觉样式接入应用 i18n、Naive UI 主题、UnoCSS 和 Less。
- 本阶段不新增插件 manifest 搜索字段，不实现全文索引、拼音搜索、模糊排序、多数据源搜索或持久化搜索历史。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `launcher-panel`: 将现有搜索状态从表现层 mock 结果升级为可搜索已安装插件 actions 的真实 launcher 搜索能力。

## Impact

- 前端 UI：调整 `src/App.vue` 中搜索状态的数据来源、结果渲染和点击行为，必要时抽取 launcher 搜索模型或 helper。
- 插件宿主：复用 `src/app/plugin-host/registry.ts` 和 `src/app/plugin-host/actions.ts`，不改变插件 contract。
- Rust/Tauri：继续通过现有 `get_plugin_registry` command 获取 registry；本变更不要求新增 Tauri command。
- i18n 与样式：新增或调整 launcher 搜索结果、空状态和插件结果类型相关文案；继续使用 Naive UI、UnoCSS 和 Less。
- OpenSpec：更新 `launcher-panel` 规格，明确搜索栏是 launcher 固有入口，插件 registry 是搜索数据源之一。
