# Design

## Context

动机与产品范围见 [proposal.md](proposal.md)。本设计基于本轮只读源码、规格、文档和测试检查，尚未实施。

- Host Action 的标题来自 `src/app/i18n/messages/{en-US,zh-CN}.json`；`createOpenSettingsRegistration` 分别使用标题、关键词和独立 executor，执行身份不依赖标题。
- `plugins/config-lens/manifest.json` 的 Action `open` 当前使用 `Open ConfigLens` / `打开 ConfigLens`，目标为 `main`。插件名称和 Page 标题已经是 `ConfigLens`。
- `examples/plugins/{framework-neutral,react-semi}` 是 canonical 模板；`packages/plugin-cli/templates/` 是打包快照，由 `packages/plugin-cli/scripts/verify-templates.mjs` 检查逐文件一致性。
- `packages/plugin-cli/src/create.ts` 的 `customizeTemplate` 为通过现有校验的项目名称主动添加双语打开前缀。现有 `--name` 输入范围不支持任意中文，本变更不扩大输入范围；生成的两个 locale 仍使用同一个输入名称。
- Action 投影保留作者的 `title`；共享 tile 和页面上下文消费该标题。搜索只匹配各语言的 `title` 与 `default_keywords`，不匹配 description、插件名称或 Page 标题。集合通过稳定 Action ID 关联。
- `launcher-action-core` 的设置搜索场景仍提及 description，与当前搜索实现和专属搜索规格冲突。本变更仅修正这个已触及场景，不更改搜索行为。

## Goals / Non-Goals

**Goals:**

- 在文案来源与生成来源完成命名调整，使搜索结果、最近使用、收藏和已打开页面上下文自然消费同一名称。
- 用可验证的产品默认值和开发指南约束维护内容，保留第三方合法文本的协议兼容性。
- 通过正式元数据和实际 CLI 输出验证新行为及不添加旧标题别名的边界。

**Non-Goals:**

- 不修改 Schema、生成类型、Rust 持久化模型、Host API 或插件 SDK；不增加运行时依赖。
- 不在 React 渲染、Registry、搜索或投影层裁剪字符串，不根据 `target.kind` 或 ID 推断并重写标题。
- 不批量改写第三方已安装插件、历史归档、一般说明文字或用于验证任意合法标题的测试夹具。
- 不改变页面布局、Semi 主题机制、键盘交互、WebView 隔离、输入焦点或原生 responder 行为。

## Decisions

### 1. 保留 title 并在文案来源中表达目的地名称

将 `title` 定义为 Action 的主要展示名称，而非必须含动词的命令句。设置使用 `Settings` / `设置`；ConfigLens 双语均使用 `ConfigLens`。实际操作保留动词，例如现有 `Hide launcher` / `隐藏启动器`。

不采用 `title` 到 `name` 的字段迁移：现有字段已能完整表达需求，改名会扩大公开契约和持久化兼容范围。也不直接用插件 `display.name` 或 Page 标题覆盖所有 Action，因为多入口插件需要各自可区分的名称。

### 2. 修正 canonical 模板及 create 的生成默认值

先修改 canonical 模板的入口标题及其行为断言，再使用现有模板同步脚本更新 CLI 快照，并以其只读模式核验一致性。模板默认值采用以下精确名称：

| 模板 | en-US | zh-CN |
| --- | --- | --- |
| framework-neutral | Framework-neutral starter | 无框架起步模板 |
| react-semi | React and Semi starter | React 与 Semi 起步模板 |

`create` 为两种模板生成的入口 Action `title.en-US` 和 `title.zh-CN` 都直接使用已验证的 `--name`。例如 `My Plugin` 生成 `My Plugin`，`Open Studio` 仍生成 `Open Studio`；不使用去前缀替换。插件/页面名称赋值、包名规范化、ID、默认入口选择、目标、事务写入和失败清理保持现有行为。

仅修改模板不能解决 CLI 再次加前缀的问题；仅修改 CLI 又会留下不一致的 canonical 示例，因此两层必须一起更新。

### 3. 不保留旧标题的搜索兼容层

本次不将被替换标题、`Open` 或 `打开` 补入关键词，也不创建隐藏别名或其他搜索来源。正式入口及模板现有 `default_keywords` 保持不变，不做无关关键词清理。description 仍可说明行为，但不能用作兼容搜索源。

新标题参与现有跨语言、全 token 匹配与评分；因此结果及分数可以自然变化。验收区分两点：元数据中没有新增旧标题别名；在只包含目标 Action 且现有关键词不包含旧前缀的受控快照中，旧完整标题不再匹配该 Action。不能推导为整个 Registry 对所有旧查询必定返回空列表。

### 4. 将命名约定与协议验证分开

稳定规格和维护指南规定作者如何命名；现有 localized string 校验继续决定 Manifest 是否有效。不加入 `Open` / `打开` 正则禁令或新诊断。合法名称本身包含动词、品牌含 `Open`、尚未更新的第三方标题均保持可接受，Host 按作者提供的规范化标题展示。

具体指南放在 `docs/en/plugin-development/public-packages.md` 的 Action 元数据部分，Host 规则在 `docs/en/development/frontend-guidelines.md` 引用或简要说明；同步 `docs/zh/`。模板、CLI、ConfigLens 文档链接或解释相应默认值，教程只在具体示例受影响时更新。无需将具体文案规则复制进根 `AGENTS.md`、README 或 `openspec/config.yaml`。

### 5. 保留身份与界面消费路径

`lensx.core.open_settings`、`dev.lensx.config-lens.open`、模板 local Action ID 和现有 Page target 均保持稳定。已有 Recent/Pinned 记录通过同一 ID 解析新标题，执行仍经 Dispatcher 与现有受控目标。无需迁移集合数据或增设展示映射。

已有本地化 fallback、主题 token、accessible name 和键盘执行路径继续适用。更新测试中的正式文案期望，保留失败、恢复和键盘交互断言；不全局替换合法的合成 `Open notes` 等夹具。

### 6. 使用既有确定性验证面

扩展现有 Host Action/service、搜索/主页/导航、ConfigLens Manifest、模板 Manifest 和 CLI create 测试，重点覆盖从源元数据到可观察标题、同 ID 执行以及真实生成文件的行为。可在现有投影测试中验证含动词的合法第三方标题仍原样保留。

复用 `plugin-action-projection`、`plugin-project-template`、`plugin-developer-cli`、`plugin-development-documentation-docs` Gate。模板和 CLI Gate 的系统临时消费者需要实际 public tarball，安装命令只在消费者目录执行。最终 workspace/Rust 生命周期串行执行，避免共享产物竞争；不新增根脚本、Gate、Generate 目标或环境验证入口。

## Risks / Trade-offs

| 风险或取舍 | 应对 |
| --- | --- |
| 原来的完整“打开 xxx”查询失去匹配，相关性得分变化 | 按用户明确决定接受；验证新名称和既有功能词可搜，不添加兼容关键词或修改评分 |
| 标题改名误影响收藏、最近使用或打开页面上下文 | 保留所有身份与目标，以已有 ID 记录和普通执行路径验证新标题 |
| 把规则实现成全局裁剪，破坏品牌或真正的操作名称 | 仅改维护文案与生成默认值，验证 `Open Studio` 和 `Hide launcher` 保留 |
| canonical 模板、打包快照和实际 create 结果漂移 | 验证三层，保留逐文件快照校验及 tarball 消费者检查 |
| 文档示例仍诱导动词前缀 | 更新既有命名指南和受影响例子，中英文同任务同步；不将正常操作说明判为过期文案 |
| 已安装 ConfigLens 仍保留旧 Manifest | 通过现有插件更新或开发重新加载路径交付新元数据，不由 Host 静默修补 |

## Migration Plan

实施时依次更新正式文案、canonical 模板及快照、CLI 生成规则和测试，然后同步分类文档与中文镜像。现有安装按正常插件更新路径读取新 Manifest；不修改 Manifest/API 版本或批量迁移第三方包。回滚只需恢复对应元数据、模板和 CLI 默认值，稳定 ID 和持久化结构无需回滚迁移。

归档前将中文增量规格同步为英文稳定规格，完成变更范围的文档/治理审计及适用验证。是否触发项目级审计取决于最终是否修改索引、治理入口或其他治理表面；普通分类文档的文案更新本身不触发。规划完成、实施验证和归档就绪分别记录。
