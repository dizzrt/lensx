## ADDED Requirements

### Requirement: 插件作者 Manifest 必须是严格且版本化的输入

系统 MUST 接受 JSON 对象形式的外部插件作者 Manifest，并要求 `manifest_version` 精确匹配 Host 支持的 `1.0.0-dev` 协议版本。Manifest 顶层 MUST 包含 `plugin_id`、`version`、`display`、`publisher`、`compatibility`、`runtime` 和 `contributes`。Schema 声明范围外的字段以及任意显式 `null` MUST 被拒绝。作者 Manifest MUST NOT 包含 Host-owned 的来源、生命周期、启用状态、安装状态、兼容性结果、运行时状态、权限授予、签名或更新事实。

#### Scenario: 接受完整的首版 Manifest

- **WHEN** 作者输入包含受支持的 Manifest 版本、全部必填结构和通过语义校验的值
- **THEN** 系统将该输入识别为结构和语义有效的 Manifest
- **THEN** 系统不会把作者输入当作已安装或已启用的插件

#### Scenario: 拒绝未知字段

- **WHEN** 作者输入在任意严格对象中包含 Schema 未声明的字段
- **THEN** 系统拒绝该 Manifest
- **THEN** 诊断指向未知字段对应的 JSON Pointer

#### Scenario: 拒绝显式空值

- **WHEN** 作者把必填或可选字段显式设置为 `null`
- **THEN** 系统拒绝该 Manifest
- **THEN** 系统不会把 `null` 当作字段缺失或默认空集合

#### Scenario: 拒绝作者声明 Host 状态

- **WHEN** 作者 Manifest 包含 `source`、`lifecycle`、`enabled`、`granted_permissions` 或其他 Host-owned 状态
- **THEN** 系统将相应字段作为未知字段拒绝
- **THEN** 作者不能通过 Manifest 获得可信状态或权限

### Requirement: 插件身份和版本必须稳定且可验证

`plugin_id` MUST 包含至少两个点分隔的命名空间段。每个段 MUST 以 ASCII 小写字母开头，并且只包含 ASCII 小写字母、数字、下划线或连字符；每段 MUST 不超过 64 个字符，完整 ID MUST 不超过 255 个字符。插件 `version` MUST 是有效 SemVer。已发布的 `plugin_id` MUST NOT 被复用于不同语义的插件，插件版本 MUST NOT 成为 Page 或 Action 稳定身份的一部分。

#### Scenario: 接受稳定插件身份

- **WHEN** Manifest 使用 `com.acme.workspace` 作为 `plugin_id` 并使用有效 SemVer 作为插件版本
- **THEN** 系统接受插件身份与版本
- **THEN** 后续版本可以继续使用相同 `plugin_id`

#### Scenario: 拒绝无效插件命名空间

- **WHEN** `plugin_id` 缺少命名空间段、包含空段、以大写字母开头、包含非法字符或超过长度限制
- **THEN** 系统拒绝该 Manifest
- **THEN** 诊断指向 `/plugin_id`

#### Scenario: 拒绝无效插件版本

- **WHEN** `version` 不是有效 SemVer
- **THEN** 系统拒绝该 Manifest
- **THEN** 诊断指向 `/version`

### Requirement: Publisher 必须完整但不得建立信任

外部插件 Manifest 的 `publisher` MUST 包含非空 `author`、绝对 HTTPS `homepage` 和绝对 HTTPS `repository`。URL MUST NOT 包含用户名或密码。系统 MUST 将 Publisher 视为作者声明的展示元数据，且 MUST NOT 仅凭这些字段判定作者身份、软件包来源、签名状态或权限可信度。

#### Scenario: 接受完整 Publisher

- **WHEN** Publisher 提供非空作者名称、HTTPS 主页和 HTTPS 仓库地址
- **THEN** 系统接受 Publisher 结构
- **THEN** 规范化结果保留三项作者声明

#### Scenario: Publisher 字段缺失

- **WHEN** Publisher 缺少作者、主页或仓库中的任意一项
- **THEN** 系统拒绝该 Manifest
- **THEN** 诊断指向缺失字段

#### Scenario: Publisher 使用不安全 URL

- **WHEN** 主页或仓库使用相对 URL、非 HTTPS scheme 或包含凭据
- **THEN** 系统拒绝该 Manifest
- **THEN** Host 不会把该 URL 暴露为可信导航目标

### Requirement: 用户可见元数据必须本地化并使用英文回退

Plugin 展示名称、Page 标题、Action 标题、权限原因以及出现时的描述 MUST 提供去除首尾空白后非空的 `en-US` 值；`zh-CN` MAY 缺失，并在缺失时回退到 `en-US`。首版未知 locale 字段 MUST 被拒绝。Plugin MUST NOT 声明 `aliases` 或 `default_aliases`；Action 搜索同义词 MUST 通过 locale-keyed `default_keywords` 表达。

#### Scenario: 解析当前 locale 文本

- **WHEN** 本地化字段同时提供 `en-US` 和当前 `zh-CN` 文本
- **THEN** 消费方解析到 `zh-CN` 文本

#### Scenario: 当前 locale 缺失

- **WHEN** 本地化字段只提供有效 `en-US` 文本
- **THEN** 消费方对 `zh-CN` 请求回退到 `en-US`

#### Scenario: 英文规范文本缺失

- **WHEN** 必须本地化的字段缺少 `en-US` 或其值去除空白后为空
- **THEN** 系统拒绝该 Manifest
- **THEN** 诊断指向对应的 `/en-US` 路径

#### Scenario: Plugin 声明通用别名

- **WHEN** Plugin 展示对象或顶层对象声明 `aliases` 或 `default_aliases`
- **THEN** 系统将该字段作为未知字段拒绝
- **THEN** 搜索同义词不会扩散到该插件的全部 Action

### Requirement: 资源引用必须保持在插件包边界内

Runtime entry 和图标 asset path MUST 使用正斜杠分隔的包内相对路径，且 MUST NOT 以 `/` 开头、包含反斜杠、空段、`.`、`..`、URL scheme、query 或 fragment。纯 Manifest 校验 MUST 验证路径语法；未来安装或加载边界 MUST 再验证文件存在性、解析后的真实路径和符号链接不会逃逸插件包。

#### Scenario: 接受包内资源路径

- **WHEN** iframe entry 是 `dist/plugin.html` 且图标路径是 `assets/icon.svg`
- **THEN** 系统接受路径语法
- **THEN** 规范化结果保留包内相对路径

#### Scenario: 拒绝父级遍历

- **WHEN** entry 或 asset path 包含 `..` 段
- **THEN** 系统拒绝该 Manifest
- **THEN** 诊断指向对应路径字段

#### Scenario: 拒绝绝对或外部资源

- **WHEN** entry 或 asset path 是绝对路径、外部 URL、反斜杠路径或包含 query/fragment
- **THEN** 系统拒绝该 Manifest
- **THEN** 插件不能通过静态资源字段越过包边界

### Requirement: 外部 Runtime 首版必须是 iframe

外部插件 `runtime.kind` MUST 等于 `iframe`，`runtime.entry` MUST 指向包内相对 HTML 文件。作者 MUST NOT 声明 Host module、前端框架模块、Native library、Tauri Command、Sidecar、后台进程或 iframe sandbox 放宽配置。

#### Scenario: 接受 iframe Runtime

- **WHEN** Runtime kind 为 `iframe` 且 entry 是有效包内 HTML 路径
- **THEN** 系统接受 Runtime 声明
- **THEN** Manifest 校验本身不会创建或执行 iframe

#### Scenario: 拒绝其他 Runtime kind

- **WHEN** 作者声明 `host_module`、`native`、`sidecar`、`background` 或其他 Runtime kind
- **THEN** 系统拒绝该 Manifest
- **THEN** 不受支持的代码不会因解析 Manifest 而执行

#### Scenario: 作者尝试放宽 sandbox

- **WHEN** Runtime 声明 sandbox token、origin 策略或 Host bridge 权限
- **THEN** 系统将相应字段作为未知字段拒绝
- **THEN** iframe 隔离策略保持 Host-owned

### Requirement: Page 贡献必须形成有效的插件内导航图

每个外部插件 MUST 贡献至少一个 Page。每个 Page MUST 包含唯一的本地 `id`、本地化 `title` 和插件内部 `route`，并且 MAY 包含 `parent_page_id`、asset icon 和 `required_permissions`。本地 ID MUST 是一个符合 Launcher Action 本地段字符与长度规则的单段 ID。Route MUST 以单个 `/` 开头，且 MUST NOT 是外部 URL、包含反斜杠、父级遍历、query 或 fragment。父 Page 引用 MUST 指向同一插件内的不同 Page，Page 父子图 MUST 无环。

#### Scenario: 接受多个 Page

- **WHEN** Manifest 声明唯一的 `home` 和 `settings` Page，并让 `settings` 的父 Page 指向 `home`
- **THEN** 系统接受 Page 集合和父子关系
- **THEN** Page 保持独立的插件内本地身份

#### Scenario: 没有 Page

- **WHEN** `contributes.pages` 缺失或为空数组
- **THEN** 系统拒绝首版外部插件 Manifest
- **THEN** 没有可达 UI 表面的插件不会进入后续运行时流程

#### Scenario: Page ID 重复

- **WHEN** 同一插件内两个 Page 使用相同本地 ID
- **THEN** 系统拒绝整个 Manifest
- **THEN** 诊断指向重复 Page ID

#### Scenario: Page 父级不存在或成环

- **WHEN** `parent_page_id` 指向未知 Page、自身，或多个 Page 形成父级环
- **THEN** 系统拒绝整个 Manifest
- **THEN** 诊断能够定位无效父级引用或循环成员

#### Scenario: Page route 不是内部路径

- **WHEN** Page route 不以单个 `/` 开头或包含外部 URL、反斜杠、父级遍历、query 或 fragment
- **THEN** 系统拒绝该 Manifest
- **THEN** Action 不能借由 Page route 打开任意外部目标

### Requirement: 一个插件可以贡献多个 Page-only Action

`contributes.actions` MAY 缺失或为空。每个 Action MUST 包含同一插件内唯一的本地 `id`、本地化 `title` 和一个 `target`。Action MAY 包含本地化 `description`、locale-keyed `default_keywords` 和 asset icon。首版 `target.kind` MUST 仅允许 `page`，且 `target.page_id` MUST 引用同一插件贡献的 Page。Action MUST NOT 包含 executor、函数、route、URL、Command Target 或作者控制的 `enabled`。

#### Scenario: 一个插件贡献多个 Action

- **WHEN** 一个 Manifest 声明多个唯一 Action，并且每个 Action 指向一个已声明 Page
- **THEN** 系统接受全部 Action
- **THEN** 每个 Action 保持独立的标题、描述、关键词和目标

#### Scenario: 插件不贡献 Action

- **WHEN** `contributes.actions` 缺失或为空数组，但 Manifest 至少包含一个有效 Page
- **THEN** 系统仍将 Manifest 识别为有效
- **THEN** 该插件不会仅因存在而自动成为 Launcher Action

#### Scenario: Action 指向 Page

- **WHEN** Action target 为 `{ "kind": "page", "page_id": "home" }` 且 `home` Page 存在
- **THEN** 系统接受该 target
- **THEN** 后续 Host 可以为该 Action 合成受控的打开 Page 执行器

#### Scenario: Action 使用不支持的 Target

- **WHEN** Action target 声明 Command、外部 URL、函数、Native 操作或其他非 Page kind
- **THEN** 系统拒绝该 Manifest
- **THEN** 插件不能通过 Manifest 注入 Action executor

#### Scenario: Action 引用未知 Page

- **WHEN** `target.page_id` 在同一插件的 Page 集合中不存在
- **THEN** 系统拒绝整个 Manifest
- **THEN** 诊断指向该 Action 的 Page 引用

### Requirement: Action 搜索关键词必须有效且属于 Action

Action 的 `default_keywords` MAY 按 locale 提供字符串数组。每个关键词去除首尾空白后 MUST 非空，并且在同一 locale 内按 locale-aware 小写比较 MUST 唯一。关键词 MUST 保持在所属 Action 上，不得成为 Plugin 或同一插件其他 Action 的共享别名。

#### Scenario: 接受本地化 Action 关键词

- **WHEN** 一个 Action 为英文和简体中文提供非空且互不重复的关键词
- **THEN** 系统保留对应 locale 的关键词
- **THEN** 关键词只与该 Action 关联

#### Scenario: 关键词缺失

- **WHEN** 一个 Action 省略 `default_keywords`
- **THEN** 规范化结果为该 Action 提供空关键词 map
- **THEN** Action 仍可通过标题参与未来搜索

#### Scenario: 关键词为空或重复

- **WHEN** 一个关键词去除空白后为空，或同一 locale 中两个关键词按 locale-aware 小写比较相等
- **THEN** 系统拒绝该 Manifest
- **THEN** 诊断指向具体关键词索引

### Requirement: Launcher 默认 Action 必须引用插件内 Action

`contributes.launcher` MAY 缺失。存在时 MUST 包含 `default_action_id`，且该 ID MUST 引用同一 Manifest 声明的 Action。该字段只提供未来插件名称匹配时的默认候选，不得把 Plugin 本身变成可执行搜索结果，也不定义搜索排序算法。

#### Scenario: 接受默认 Action

- **WHEN** `default_action_id` 指向同一插件中存在的 Action
- **THEN** 系统保留该引用
- **THEN** 后续搜索能力可以把该 Action 作为插件默认入口

#### Scenario: 默认 Action 不存在

- **WHEN** `default_action_id` 指向未知 Action 或 Action 集合为空
- **THEN** 系统拒绝整个 Manifest
- **THEN** 诊断指向默认 Action 引用

#### Scenario: Launcher 配置缺失

- **WHEN** Manifest 不包含 `contributes.launcher`
- **THEN** 系统仍可接受其 Page 和 Action 贡献
- **THEN** 系统不会隐式选择任意 Action 作为默认入口

### Requirement: 权限声明必须保持内部引用一致

`requested_permissions` MAY 缺失或为空。每个请求 MUST 包含插件内唯一且语法有效的 `permission_id` 与本地化 `reason`。每个 Page 的 `required_permissions` MAY 缺失或为空，其中每个 ID MUST 唯一，并且 MUST 引用顶层已请求的权限。Action MUST NOT 重复声明权限，其权限依赖 MUST 从目标 Page 派生。Manifest 契约 MUST NOT 把已请求权限当作已授予权限。

#### Scenario: Page 使用已请求权限

- **WHEN** Page 的每个 required permission 都出现在顶层 requested permissions 中
- **THEN** 系统接受权限引用
- **THEN** 规范化结果仍区分请求与未来 Host 授予状态

#### Scenario: Page 使用未请求权限

- **WHEN** Page 的 required permission 没有出现在顶层请求集合中
- **THEN** 系统拒绝整个 Manifest
- **THEN** 诊断指向无效权限引用

#### Scenario: 权限引用重复

- **WHEN** 请求集合或单个 Page 的 required permissions 包含重复 ID
- **THEN** 系统拒绝该 Manifest
- **THEN** 诊断指向重复项

#### Scenario: 当前 Host 尚未定义权限目录

- **WHEN** Manifest 内部权限引用一致但当前校验阶段没有 Host 权限目录
- **THEN** 静态 Manifest 校验只判断权限 ID 语法和内部引用
- **THEN** Host 支持性与用户授予状态留给后续权限边界判断

### Requirement: 兼容性状态必须与 Manifest 有效性分离

LensX 与 Host API 兼容范围 MUST 分别包含有效 SemVer `min_version` 和 `max_version_exclusive`，并满足最小版本严格小于排他最大版本。当前版本满足 `min_version <= current_version < max_version_exclusive` 时对应维度兼容。结构和语义有效但任一当前版本超出范围的 Manifest MUST 返回 `incompatible` 状态而不是 `invalid`。

#### Scenario: 当前版本位于两个范围内

- **WHEN** 当前 LensX 和 Host API 版本分别位于声明的半开区间内
- **THEN** 系统把有效 Manifest 判定为 `compatible`

#### Scenario: 当前版本等于排他上界

- **WHEN** 当前 LensX 或 Host API 版本等于对应 `max_version_exclusive`
- **THEN** 系统把有效 Manifest 判定为 `incompatible`
- **THEN** 系统不会把该 Manifest 误报为结构损坏

#### Scenario: 兼容范围为空或倒置

- **WHEN** 任一范围满足 `min_version >= max_version_exclusive`
- **THEN** 系统把 Manifest 判定为 `invalid`
- **THEN** 诊断指向无效兼容范围

### Requirement: 规范化和诊断必须确定且跨语言一致

系统 MUST 将缺失的 `requested_permissions`、`contributes.actions`、Action `default_keywords` 和 Page `required_permissions` 规范化为空集合，并保留必填 `contributes.pages` 的非空约束。公开诊断 MUST 使用稳定 `{code, path, message}` 结构，`path` MUST 是 JSON Pointer；可安全聚合的诊断 MUST 一次返回，并按 `path` 后按 `code` 排序。Schema、TypeScript 和 Rust MUST 对共享的有效、无效、规范化和不兼容样例保持分类、规范化值及诊断 code/path 一致。

#### Scenario: 规范化缺失集合

- **WHEN** 有效 Manifest 省略允许缺失的集合
- **THEN** TypeScript 与 Rust 返回包含相同空集合的规范化 Manifest
- **THEN** 原始作者输入不会被就地修改

#### Scenario: 一个 Manifest 包含多个错误

- **WHEN** 输入包含多个可以安全聚合的结构或语义错误
- **THEN** 校验返回全部可安全聚合的诊断
- **THEN** 诊断按 JSON Pointer path 和稳定 code 确定排序

#### Scenario: TypeScript 与 Rust 校验相同样例

- **WHEN** 两端读取同一共享样例及相同当前 LensX/Host API 版本
- **THEN** 两端返回相同的 valid/invalid 与 compatible/incompatible 分类
- **THEN** 规范化结果以及诊断 code/path 相同

### Requirement: 作者 Manifest、规范化 Manifest 和 Host 注册状态必须分层

系统 MUST 将原始作者输入、校验后的规范化 Manifest 和未来 Host 注册状态建模为不同边界。规范化 Manifest MUST 只包含作者可声明的契约数据及确定性默认值。Host-owned 的来源、生命周期、启用状态、安装信息、兼容性结果、Runtime 状态、已授予权限、签名和更新信息 MUST 由可信 Host 另行组合，且 MUST NOT 被写回或伪装成作者声明。

#### Scenario: 读取规范化 Manifest

- **WHEN** 调用方读取通过校验的规范化 Manifest
- **THEN** 结果只包含作者契约数据和规范化默认值
- **THEN** 结果不包含已安装、已启用或已授权的暗示

#### Scenario: Host 以后注册插件

- **WHEN** 后续能力把规范化 Manifest 注册到 Host
- **THEN** Host 从可信安装和运行环境注入来源、生命周期、兼容性与权限状态
- **THEN** 作者输入不能覆盖这些字段

#### Scenario: 仅完成本 change

- **WHEN** Manifest 契约、校验器和共享样例完成
- **THEN** 当前 App Shell 不自动发现、加载、显示或执行任何外部插件
- **THEN** 当前 Launcher Action Registry 不自动包含插件 Action
