## 1. 搜索模型

- [x] 1.1 在前端 launcher 边界内新增插件 action 搜索模型或 helper，输入为插件 registry 与搜索词，输出为可渲染、可执行的搜索结果。
- [x] 1.2 实现搜索词 normalize 规则，至少支持大小写无关的包含匹配和空白裁剪。
- [x] 1.3 将匹配字段限定为 `action.title`、`action.id`、所属 `plugin.name` 和所属 `plugin.id`。
- [x] 1.4 为搜索结果保留 `action_id`、action 标题、所属插件名称和可展示的辅助信息。
- [x] 1.5 确保搜索 helper 不修改插件 registry，不新增插件 manifest 字段，不引入搜索插件注册逻辑。

## 2. Launcher 接入

- [x] 2.1 将 `App.vue` 搜索状态的数据源从表现层 mock 数据切换为插件 action 搜索结果。
- [x] 2.2 保持搜索输入为空时的默认分区展示逻辑不变。
- [x] 2.3 输入非空且有结果时，仅展示“匹配结果”分区和真实插件 action 搜索结果。
- [x] 2.4 输入非空且无结果时，展示搜索空状态，并且不展示 mock 搜索结果。
- [x] 2.5 插件 registry 加载失败且用户正在搜索时，展示可诊断错误。
- [x] 2.6 点击搜索结果时复用现有 `createPluginActionDispatcher` 打开 action 目标页面。
- [x] 2.7 打开插件页面后保持插件页面独占搜索框下方主体区域的既有行为。

## 3. 文案与样式

- [x] 3.1 为插件搜索结果、搜索空状态、错误状态和操作文案补充应用 i18n message。
- [x] 3.2 确保搜索结果 UI 位于现有 Naive UI Provider、应用主题和 Naive UI locale/dateLocale 同步机制之下。
- [x] 3.3 使用 UnoCSS 处理搜索结果的静态布局和间距。
- [x] 3.4 使用 Less 和现有 launcher 主题变量处理搜索结果 hover、focus、边框、背景和暗色模式兼容。
- [x] 3.5 保持搜索结果视觉简洁，不新增冗余说明性副标题。

## 4. 验证

- [x] 4.1 验证输入设置插件 action 标题或插件名称时能展示对应结果。
- [x] 4.2 验证点击搜索结果能打开对应插件页面，并保持主体区域独占展示。
- [x] 4.3 验证无匹配结果时展示空状态且没有 mock 结果。
- [x] 4.4 验证 light 和 dark 主题下搜索结果、空状态、错误状态可读。
- [x] 4.5 运行 `pnpm run check`。
- [x] 4.6 运行 `pnpm run build`。
