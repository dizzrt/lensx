# Proposal

## Why

当前 Launcher 先按界面语言解析 Action 元数据，再搜索标题、关键词和描述，导致相同查询在中英文界面下可能得到不同结果，且描述中的一般说明也会触发匹配。本变更将搜索收敛为全部已支持语言的 Action 标题和关键词，使搜索匹配与排序独立于界面语言。

## What Changes

- 同时搜索每个 Action 已声明的全部受支持语言的 `title` 和 `default_keywords`；当前受支持语言仍为 `en-US`、`zh-CN`。
- 界面语言只决定结果标题、可选描述及反馈文案的展示，缺失当前语言文本时继续回退英文；它不改变匹配集合、相关性分数或排序。
- 允许查询中的多个词分别命中同一 Action 的不同语言、不同可搜索字段；保留每个查询词都必须命中的规则。
- 每个查询词只采用所有语言和字段中的最佳匹配分数，完整查询的标题匹配奖励也只采用最佳值；跨语言重复文本不重复加分，一个 Action 只返回一次。
- **BREAKING（搜索行为）**：`description` 退出匹配与计分。仅描述包含查询的 Action 将不再返回，作者需要把希望被搜索的术语放入标题或关键词；描述字段及其展示契约继续保留。
- 保留精确、前缀、子串匹配、同分按 Action ID 升序、禁用过滤、最多八项结果和既有键盘、IME、主题及错误恢复行为。

### Goals

- 同一查询与同一 Registry 快照在中英文界面下得到相同的 Action ID 集合、顺序和分数。
- 区分搜索数据与展示数据，避免使用展示语言回退结果构建搜索范围。
- Host 内建 Action 与插件投影 Action 使用同一套规则。

### Non-goals

- 不新增受支持语言、Manifest 字段、插件包版本或 Host API。
- 不把插件名称、插件整体描述、Page 标题、ID 或私有元数据自动加入搜索。
- 不增加拼音、自动翻译、中文分词、拼写纠错、语义匹配或个性化排序。
- 不调整插件运行时、权限、发布初始化、收藏管理或原生窗口行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `launcher-action-search`：搜索字段限定为全部受支持语言的标题和关键词；统一与界面语言无关的规范化、去重计分与排序，保留本地化展示。
- `plugin-action-projection`：明确投影后的插件 Action 与 Host Action 统一采用跨语言搜索，语言回退仅用于展示，描述及插件私有字段不参与匹配。

## Impact

- 预期实现范围集中在 `src/app/launcher/actions/search.ts` 及其调用边界；`validation.ts` 中现有本地化解析继续承担展示职责，Registry 与插件映射保留完整多语言元数据。
- 更新现有搜索单测、边界测试、插件投影集成测试和搜索 UI 测试，覆盖语言切换不变性、混合语言查询、重复命中与描述排除。
- 更新 `docs/en/architecture/overview.md`、`docs/en/architecture/extension-platform.md`、插件作者公共包说明及对应 `docs/zh/` 镜像，说明关键词的用途和兼容性影响。
- 复用稳定 Gate `plugin-action-projection` 验证领域与插件统一搜索，复用 `launcher-input-focus` 验证输入和 IME 回归；完整工作区与 Rust 验证独立执行，不新增根脚本或环境验证路径。
- Rust/Tauri 边界、持久化格式、Manifest Schema、SDK 与公共协议预计无需修改，也无需用户数据迁移。只依赖描述的旧查询会发生预期行为变化。
- 搜索、测试和双语文档在 apply 阶段实施；稳定规格同步及归档单独进行。
