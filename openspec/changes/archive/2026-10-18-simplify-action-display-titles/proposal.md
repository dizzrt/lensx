# Proposal

## Why

当前设置、ConfigLens 和插件起步模板以“打开 / Open”开头展示页面入口，CLI 也会继续生成这种标题；这些文案重复强调进入动作，降低了工具和目的地名称的辨识度。需要统一 `title` 的展示语义、正式入口和生成默认值，使后续开发自然遵循同一命名规则。

## What Changes

- 保留 `title` 字段，明确它是 Action 面向用户的展示名称；页面或工具入口优先使用目的地名称，执行具体操作时保留必要动词，例如“隐藏启动器”。
- 将 Host 设置入口改为 `Settings` / `设置`，将 ConfigLens 入口的两种语言标题均改为 `ConfigLens`。
- 同步两个 canonical 插件起步模板及其 CLI 打包快照；CLI `create` 使用已验证的项目名称作为入口标题，不再附加 `Open ` 或 `打开 `。
- 不把任何被替换的旧标题加入 `default_keywords`，不合成旧标题搜索别名；保留现有功能关键词，允许旧完整标题因失去匹配文本而不再命中。
- 更新稳定规格中的命名语义、英文开发指南及对应中文镜像，并补充正式入口和 CLI 生成结果的确定性回归验证。
- 局部修正 `launcher-action-core` 设置搜索场景仍称 description 可搜索的旧表述，使其与当前源码及 `launcher-action-search` 的 title/keywords-only 契约一致。

本次目标是入口命名一致性和防止默认生成逻辑复发。非目标包括：将 `title` 改名为 `name`、增加新展示字段、改变 Action ID 或执行目标、修改搜索算法、增加运行时前缀裁剪或通用禁用动词校验、迁移第三方插件、调整页面布局或原生窗口行为。说明文字和开发教程中的正常“打开”指令不属于机械替换范围。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `launcher-action-core`：定义展示名称与操作动词的规则，规定设置入口标题及身份连续性，并校正设置搜索场景。
- `plugin-manifest-contract`：明确 Action `title` 的作者侧展示语义，保持字段、验证和原样投影边界。
- `official-config-lens-plugin`：规定官方 ConfigLens 入口的双语标题及不添加旧标题搜索别名的行为。
- `plugin-project-template`：规定两个维护模板的目的地命名默认值及打包快照的一致性。
- `plugin-developer-cli`：规定 `create` 生成标题时不再附加打开动词，并保留已验证项目名称本身的内容。

## Impact

- 产品数据：`src/app/i18n/messages/en-US.json`、`src/app/i18n/messages/zh-CN.json`、`plugins/config-lens/manifest.json`。
- 模板与生成：`examples/plugins/framework-neutral/`、`examples/plugins/react-semi/`、`packages/plugin-cli/templates/`、`packages/plugin-cli/src/create.ts`；使用现有模板同步与漂移检查机制。
- 验证：Host Action、搜索、集合与页面上下文测试，ConfigLens/模板 Manifest 测试，CLI 创建测试及实际打包消费者验证。复用 `plugin-action-projection`、`plugin-project-template`、`plugin-developer-cli`、`plugin-development-documentation-docs` 等现有 Gate，不增加根目录测试别名。
- 文档：在既有插件开发公共包参考和前端指南中定义/引用命名规则，同步模板、CLI、ConfigLens 说明与中文镜像。
- 不改变 Manifest、Host API、SDK、序列化结构或原生接口；不引入依赖。由于标题参与匹配和相关性计算，匹配集合与分数可随新文案自然变化；本次不承诺旧完整标题的搜索兼容性。

以上均为待实施方案；本次 propose 只创建规划产物。
