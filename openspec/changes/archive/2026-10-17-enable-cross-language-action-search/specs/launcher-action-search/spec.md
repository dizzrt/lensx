# Spec Delta

## MODIFIED Requirements

### Requirement: Action Search must consume Host Registry snapshots uniformly

系统 MUST 接受查询、用于展示的应用语言、正整数结果上限及只读 Action 描述符快照，并返回确定性排序的可序列化结果。搜索文本 MUST 仅来自 Action 所有受支持语言中已声明的 `title`、`default_keywords`；`enabled` 用于过滤，`action_id` 用于身份及同分排序，`owner_id` 用于身份。`description`、插件名称、Page 标题及私有元数据 MUST NOT 参与匹配或计分。所有来源 MUST 使用相同规则。图标及 Recent/Pinned 数据可随展示数据携带，但 MUST NOT 影响匹配、计分或排序。结果 MUST 保留身份、本地化展示文本、分数及可选安全图标，且 MUST NOT 包含执行器、函数、Registry 内部状态或特权对象。

#### Scenario: Search a built-in Action

- **WHEN** 当前快照中一个已启用的 Host Action 的标题或关键词匹配查询
- **THEN** 搜索返回该 Action 的可序列化结果及可选安全图标
- **THEN** 结果不包含执行器

#### Scenario: Search an Action registered by another future source

- **WHEN** 其他受信任来源在搜索前将有效 Action 注册到同一个快照
- **THEN** 搜索对它应用与 Host Action 相同的跨语言规则
- **THEN** 搜索不读取来源私有数据，也不按来源选择不同算法

#### Scenario: Recent or pinned state changes

- **WHEN** 同一查询及描述符快照下仅 Recent/Pinned 状态发生变化
- **THEN** 匹配的 Action ID、分数及顺序保持一致
- **THEN** 集合状态不提高或降低相关性

#### Scenario: A caller modifies search input or results

- **WHEN** 调用方在搜索后修改原输入或尝试修改结果
- **THEN** 搜索不修改 Registry 描述符及快照
- **THEN** 后续查询不受影响，结果不泄漏可变内部引用

#### Scenario: Only non-search metadata contains the query

- **WHEN** 查询只出现在 Action 描述、插件名称、插件整体描述、Page 标题、ID 文本或私有元数据中
- **THEN** 该 Action 不因这些字段进入结果
- **THEN** 同一字段中的内容不影响其他已匹配 Action 的分数

### Requirement: Queries must be normalized and tokenized deterministically

查询及每个可搜索文本 MUST 使用相同且不依赖界面语言的规范化：Unicode NFKC、语言无关的小写转换、去除首尾空白及将连续 Unicode 空白折叠为一个 ASCII 空格。查询 MUST 按空白拆成非空词项；各字段 MUST 独立规范化。空查询 MUST 返回空结果，MUST NOT 用默认注册顺序模拟推荐。独立 Home 可展示已有 Action 集合，搜索 MUST NOT 生成或排序这些集合。

#### Scenario: Normalize case and whitespace

- **WHEN** 查询仅在大小写、全角兼容字符或连续空白上存在等价差异
- **THEN** 两种界面语言都得到相同规范化查询及词项
- **THEN** 等价查询的 Action ID、分数及顺序相同

#### Scenario: The query is empty

- **WHEN** 查询为空或规范化后没有词项
- **THEN** 搜索返回空结果，不返回按 Registry 顺序排列的推荐
- **THEN** App Shell 可继续展示独立的 Home 集合

#### Scenario: Field boundaries are not searchable text

- **WHEN** 查询必须把不同语言的标题或多个关键词直接拼接，才能得到一个连续匹配字符串
- **THEN** 搜索不创建该虚假精确、前缀或子串匹配
- **THEN** 只有分开的查询词项可以分别命中不同字段

### Requirement: Matching and ranking must be explainable and deterministic

搜索 MUST 同时匹配所有已支持语言中显式声明的 Action 标题及关键词，MUST NOT 按界面语言筛选文本。每个查询词项 MUST 命中同一 Action 的至少一个标题或关键词，否则排除该 Action。匹配 MUST 仅使用精确、前缀、子串关系，单词项优先级为标题精确、关键词精确、标题前缀、关键词前缀、标题子串、关键词子串。界面语言及描述 MUST NOT 影响分数；同分 MUST 按 `action_id` 升序。搜索 MUST NOT 增加编辑距离、拼音、翻译、语义或个性化匹配。

#### Scenario: A title match outranks a description match

- **WHEN** 一个 Action 的标题精确匹配查询，另一个 Action 仅在任意语言的描述中包含查询
- **THEN** 返回标题匹配的 Action，排除仅描述匹配的 Action
- **THEN** 描述不获得兜底匹配分数

#### Scenario: Multiple tokens match across fields

- **WHEN** 查询的部分词项匹配某 Action 的英文标题，其余词项匹配同一 Action 的中文关键词
- **THEN** 该 Action 满足所有词项均命中的条件
- **THEN** 使用中文或英文界面均得到相同匹配和分数

#### Scenario: Only some tokens match

- **WHEN** 至少一个词项在该 Action 的所有标题及关键词中都未命中，即使该词出现在描述中
- **THEN** 搜索排除该 Action

#### Scenario: Two Actions have the same score

- **WHEN** 两个 Action 对同一查询得到相同分数
- **THEN** 两种界面语言均按 `action_id` 升序返回
- **THEN** 注册顺序及元数据语言键的顺序不改变结果顺序

#### Scenario: Text for the current locale is absent

- **WHEN** 当前界面为中文，而 Action 只声明英文标题及英文关键词
- **THEN** 这些英文文本仍可用于匹配，结果标题继续使用英文展示回退
- **THEN** 没有中文文本不会增加或减少该 Action 的分数

#### Scenario: Empty current-language keywords do not mask another language

- **WHEN** 中文关键词为一个空数组，英文关键词中声明了 `format`
- **THEN** 在中英文界面输入 `format` 都可匹配该 Action
- **THEN** 未声明任何关键词的 Action 仍可通过已声明标题参与搜索

#### Scenario: Changing only descriptions does not affect search

- **WHEN** 在标题、关键词、身份和可用状态不变时新增、修改或删除任意语言的描述
- **THEN** 对同一查询的匹配集合、相关性分数及顺序完全不变
- **THEN** 描述仍可作为独立展示元数据保留

## ADDED Requirements

### Requirement: Cross-language duplicate matches MUST contribute relevance only once

每个 Action 的分数 MUST 等于完整查询对所有单独标题的最佳精确或前缀奖励，加上每个查询词项在所有标题及关键词中的最佳匹配分数之和。同一个词项 MUST NOT 按命中字段数或语言数累计分数；完整查询奖励 MUST 仅计一次。相同或规范化后相同文本的副本 MUST NOT 增加分数或产生重复结果；其他语言的新文本若提供更高优先级的匹配，MUST 按最佳匹配计分。

#### Scenario: The same keyword appears in both languages

- **WHEN** `JSON` 同时存在于两种语言的关键词中
- **THEN** 与只保留其中一份等价声明相比，查询 `JSON` 的分数及结果条数不变
- **THEN** 大小写或 NFKC 等价的跨语言副本同样不额外加分

#### Scenario: The best match can come from any language or field

- **WHEN** 一个词项同时命中某语言的标题子串及另一语言的关键词精确值
- **THEN** 仅采用关键词精确匹配的较高分数
- **THEN** 不累加标题子串分数，也不给当前界面语言加权

#### Scenario: Complete-query title bonuses are not accumulated

- **WHEN** 完整查询同时精确匹配两个语言中的等价标题，或精确匹配一个标题并前缀匹配另一个标题
- **THEN** 仅取最高的完整查询标题奖励一次
- **THEN** 每个查询词项仍仅取一次最佳匹配分数

#### Scenario: Another language provides a stronger match

- **WHEN** 原标题 `Format JSON` 对查询 `JSON` 只能提供子串命中，新增的另一语言标题 `JSON 格式化` 提供前缀命中
- **THEN** 搜索采用新的较高优先级命中及其适用的完整查询标题奖励
- **THEN** 不额外累加原标题的较弱命中分数，两种界面语言得到相同新分数

### Requirement: Interface locale MUST affect result presentation only

同一查询、只读 Action 快照和结果上限下，切换界面语言 MUST 保持结果 Action ID、分数及顺序一致。结果标题、保留的可选描述及界面反馈 MUST 使用当前语言，缺失时按既有规则回退英文。匹配语言 MUST NOT 强制替换结果的展示语言。既有主题、可访问性及错误恢复契约 MUST 继续适用。

#### Scenario: Switch locale after a cross-language match

- **WHEN** 查询 `format` 命中一个只有英文关键词包含该词、但具备中英文标题的 Action，并切换界面语言
- **THEN** 该 Action 的身份、分数、顺序保持一致
- **THEN** 展示标题随界面语言切换，且一个 Action 只出现一次

#### Scenario: Mixed-language query has no complete match

- **WHEN** 混合语言查询至少有一个词项未命中任何可搜索字段
- **THEN** 两种界面语言都不返回该 Action
- **THEN** 空结果反馈使用当前语言且输入保持可用

#### Scenario: Existing theme and failure recovery remain available

- **WHEN** 在任一界面语言及明暗主题下使用跨语言结果进行键盘导航，或执行后收到既有类型化失败
- **THEN** 保留 combobox/listbox、焦点、主题及本地化错误反馈
- **THEN** 失败后用户仍可编辑或重新提交查询，描述不会变成搜索回退来源
