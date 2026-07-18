## Why

启动器的插件 action 搜索结果目前把 action 标题作为主标题。例如设置插件会显示英文的 “Open Settings”，而不是用户当前语言下的插件名称“设置”。这会混淆搜索结果所代表的对象，并造成中英文混排。

## What Changes

- 将插件 action 搜索结果卡片的主标题改为所属插件的当前语言展示名；当前语言名称缺失时沿用既有英文名回退规则。
- 搜索匹配、排序和点击后通过 action 打开目标页面的行为保持不变；action 仅作为内部可执行目标，不再作为结果主标题展示。
- 不新增用户可见文案；变更继续使用既有应用 i18n、Naive UI Provider、主题及 UnoCSS/Less 样式边界。

非目标：

- 不修改插件 manifest、action contract 或 action 的搜索匹配范围。
- 不修改搜索结果的执行逻辑、插件页面导航或 Tauri/Rust 行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `launcher-panel`: 调整插件 action 搜索结果的可见主标题，使其展示本地化插件名称而不是 action 标题。

## Impact

- 受影响模块：`src/app/launcher/search.ts` 的搜索结果映射，以及启动器结果展示和相关测试。
- 不涉及 Rust/Tauri API、插件 manifest 格式、依赖项或稳定文档。
