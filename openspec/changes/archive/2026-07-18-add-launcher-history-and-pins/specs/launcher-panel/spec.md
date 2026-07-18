## MODIFIED Requirements

### Requirement: 默认状态必须展示最近使用和已固定

搜索输入为空时，启动器内容主体 MUST 基于持久化的 action 记录和当前 plugin registry 展示“最近使用”和“已固定”两个分区。系统 MUST 仅展示可解析的 action，且 MUST 保持最近使用和已固定各自在持久化记录中的顺序。任一分区没有可解析条目时，系统 MUST 在该分区内展示不含图标的纯文本独立空态。搜索输入为空时，启动器内容主体 MUST NOT 展示表现层 mock 条目、已注册插件列表、插件 registry 入口分区或未经记录筛选的 plugin action 直出列表。

#### Scenario: 搜索为空且存在最近使用记录

- **WHEN** 用户打开启动器且搜索输入为空
- **AND** 至少一个最近使用的 `action_id` 能够由当前 plugin registry 解析
- **THEN** 内容主体展示“最近使用”分区
- **THEN** 分区条目按最近使用记录的持久化顺序展示
- **THEN** 内容主体不展示表现层 mock 条目

#### Scenario: 搜索为空且存在固定项

- **WHEN** 用户打开启动器且搜索输入为空
- **AND** 至少一个固定的 `action_id` 能够由当前 plugin registry 解析
- **THEN** 内容主体展示“已固定”分区
- **THEN** 分区条目按固定项记录的持久化顺序展示
- **THEN** 内容主体不展示未经记录筛选的 plugin action 列表

#### Scenario: 只有一个分区存在可解析条目

- **WHEN** 用户打开启动器且搜索输入为空
- **AND** “最近使用”和“已固定”中只有一个分区存在可解析条目
- **THEN** 内容主体展示最近使用和已固定两个分区
- **THEN** 包含可解析条目的分区展示 action 卡片，另一个分区展示独立空态

#### Scenario: 两个分区均为空

- **WHEN** 用户打开启动器且搜索输入为空
- **AND** 最近使用和已固定均不存在可解析条目
- **THEN** 内容主体展示“最近使用”和“已固定”两个分区
- **THEN** 两个分区分别展示不含图标的纯文本独立空态

#### Scenario: 分区空态只展示对应文本

- **WHEN** 最近使用或已固定分区不存在可解析条目
- **THEN** 对应分区展示其独立空态文本
- **THEN** 对应分区不展示空态图标

#### Scenario: 插件 registry 不作为默认态入口展示

- **WHEN** 应用已加载 plugin registry
- **AND** 用户打开启动器且搜索输入为空
- **AND** 最近使用和已固定均不存在可解析条目
- **THEN** 内容主体不因 registry 中存在 plugin actions 而展示默认入口列表
- **THEN** 最近使用和已固定分别保持独立空态

## ADDED Requirements

### Requirement: Launcher action 卡片必须提供独立的图钉交互

搜索结果、最近使用和已固定中展示的每个 launcher action 卡片 MUST 提供打开 action 的主交互与独立的图钉图标控件。卡片主交互 MUST 通过既有 action dispatcher 打开目标页面；图钉控件 MUST 只切换固定状态，MUST NOT 打开 action 或改变当前插件页面。图钉控件 MUST 根据当前固定状态提供“固定”或“取消固定”的应用级 i18n 可访问名称和提示文本。

#### Scenario: 从搜索结果固定 action

- **WHEN** 用户在搜索结果卡片上点击未固定 action 的图钉控件
- **THEN** 系统固定该 action
- **THEN** 搜索输入和当前插件页面保持不变
- **THEN** 系统不因该图钉操作打开 action

#### Scenario: 从默认态取消固定 action

- **WHEN** 用户在“已固定”卡片上点击图钉控件
- **THEN** 系统取消固定该 action
- **THEN** 系统不因该图钉操作打开 action
- **THEN** 该 action 不再出现在“已固定”分区

#### Scenario: 点击卡片主交互打开 action

- **WHEN** 用户点击搜索结果、最近使用或已固定卡片的主交互区域
- **THEN** 系统通过既有 action dispatcher 打开该 action 的目标页面
- **THEN** 图钉控件不抢占主交互的键盘焦点或点击语义

### Requirement: Launcher 历史与固定项界面必须接入前端基座

最近使用、已固定、两个分区的独立空态、图钉操作和持久化错误的用户可见文案 MUST 来自应用级 i18n message。相关 UI MUST 位于现有 Naive UI Provider、应用主题以及由应用 locale 驱动的 Naive UI `locale` / `dateLocale` 同步机制之下。图钉、卡片、空态和错误状态 MUST 在 light 与 dark 主题下保持可读，并使用 UnoCSS 组织静态布局、Less 组织语义与状态样式。

#### Scenario: 切换应用语言

- **WHEN** 应用 locale 切换
- **THEN** 最近使用和已固定的独立空态、图钉可访问名称、提示文本和持久化错误使用当前语言的应用级 i18n 文案
- **THEN** Naive UI 内置文案和日期格式继续由同一应用 locale 驱动

#### Scenario: 切换明暗主题

- **WHEN** 应用主题在 light 与 dark 之间切换
- **THEN** action 卡片、图钉、空态和错误状态的文本、背景、边框、hover 与 focus 状态保持可读
- **THEN** 页面不出现亮色硬编码导致的主题冲突
