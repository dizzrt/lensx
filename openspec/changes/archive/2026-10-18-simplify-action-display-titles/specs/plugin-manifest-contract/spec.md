# Spec Delta

## MODIFIED Requirements

### Requirement: A plugin can contribute multiple Page-only Actions

`contributes.actions` 可以缺省或为空。每个 Action MUST 包含插件内唯一的 local `id`、本地化 `title` 和 `target`，可以包含本地化 `description`、按 locale 分组的 `default_keywords` 和资源图标。首版 `target.kind` MUST 仅允许 `page`，`target.page_id` MUST 引用同一插件贡献的 Page。Action MUST NOT 包含 executor、函数、route、URL、Command Target 或作者控制的 `enabled` 状态。

`title` MUST 表示作者指定的用户展示名称，而非强制动词句式。页面入口的编写规则 MUST 优先使用可区分的目的地名称；该文案约定 MUST NOT 成为按“打开 / Open”前缀拒绝或改写合法本地化字符串的协议规则。字段名、现有本地化校验和版本兼容边界 MUST 保持不变。

#### Scenario: A plugin contributes multiple Actions

- **WHEN** Manifest 声明多个唯一 Action，且每个 Action 都指向已声明 Page
- **THEN** 系统接受每个 Action
- **THEN** 每个 Action 保留各自的标题、说明、关键词和目标，不被统一替换为插件名称

#### Scenario: A plugin contributes no Action

- **WHEN** `contributes.actions` 缺省或为空，但 Manifest 至少包含一个有效 Page
- **THEN** 系统仍认定 Manifest 有效
- **THEN** 插件不会仅因存在就自动成为 Launcher Action

#### Scenario: An Action targets a Page

- **WHEN** Action target 为 `{ "kind": "page", "page_id": "home" }` 且 `home` Page 存在
- **THEN** 系统接受目标
- **THEN** Host 可以为该 Action 构造受控的打开页面 executor

#### Scenario: An Action uses an unsupported Target

- **WHEN** Action target 声明 Command、外部 URL、函数、原生操作或其他非 Page kind
- **THEN** 系统拒绝 Manifest
- **THEN** 插件不能通过 Manifest 注入 Action executor

#### Scenario: An Action references an unknown Page

- **WHEN** `target.page_id` 不存在于同一插件的 Page 集合中
- **THEN** 系统拒绝整个 Manifest
- **THEN** 诊断指向 Action 的 Page 引用

#### Scenario: A valid authored title contains an opening word

- **WHEN** 原本有效的 Manifest 在 Action 标题中声明 `Open Studio` 或其他包含“打开 / Open”的合法文本
- **THEN** 校验不会仅因该词语而拒绝 Manifest，也不产生新的前缀命名诊断
- **THEN** 规范化结果保留作者标题的词语内容，不自动删除前缀、改名为 `name` 或推导替代标题

#### Scenario: Localized title requirements still apply

- **WHEN** Action 的英文标题缺省或去除首尾空白后为空
- **THEN** 系统继续按既有本地化文本契约拒绝该输入
- **THEN** 简化命名不会绕过英文必填、字段类型或既有未知字段检查
