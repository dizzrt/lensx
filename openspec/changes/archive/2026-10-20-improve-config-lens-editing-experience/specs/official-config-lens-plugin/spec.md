# Spec Delta

## MODIFIED Requirements

### Requirement: ConfigLens MUST provide direct and reversible editor operations

页面 MUST 只有一个可编辑的 Monaco model，不得增加格式化预览 model、Diff Editor、`Apply result`、新旧结果比较或独立应用结果流程。Format 与仅 JSON 可用的 Compact MUST 使用当前生效语言，并仅在原输入、自动／手动选择模式、生效语言、输入版本和当前操作代次仍匹配时，以一次可撤销编辑替换正文。无效、不支持、超限、超时、格式错误或已被取代的结果 MUST 保留现有正文。

输入为空、正在处理当前操作、当前自动识别尚未结算或自动模式没有生效语言时，Format 和 Compact MUST 不执行正文变换。Compact MUST 仅在当前输入已通过严格 JSON 校验且生效语言为 JSON 时可用。禁用条件 MUST 同时约束按钮和快捷键。

#### Scenario: User formats valid content

- **WHEN** 自动识别或手选确定了支持的语言，用户对有效输入执行 Format
- **THEN** 当前代次通过保真检查的结果以一次可撤销编辑直接替换正文
- **THEN** 一次撤销恢复操作前完整内容，不要求额外 Apply 动作

#### Scenario: Input changes while an operation is pending

- **WHEN** Format 或 Compact 尚未完成，用户编辑输入、切换自动／手动模式、改变生效语言或进入新 Runtime 代次
- **THEN** 旧结果不得替换正文，也不得覆盖新模式、语言或诊断
- **THEN** 新的有效操作可以正常执行

#### Scenario: Input is empty

- **WHEN** 输入为空或只有空白
- **THEN** 不启动语言处理，禁用 Format 和 Compact，且不产生错误标记或自动正文替换
- **THEN** Footer 不显示空内容提示；编辑器保留本地化可访问名称

#### Scenario: Automatic language is unresolved

- **WHEN** 非空输入在自动模式下尚未识别出语言，或该输入版本的识别仍在进行
- **THEN** Format 和 Compact 不执行变换，语言选择器保留本地化 `Auto`／`自动`，不带识别状态后缀
- **THEN** 用户可以继续编辑或手选语言，搜索和文本选择仍可使用

### Requirement: Language choice MUST remain explicit across ambiguous configuration syntaxes

新页面 MUST 默认使用“自动”模式。紧凑的可见语言选择器 MUST 将手选项显示为 `JSON`、`YAML`、`TOML`、`XML`，不带版本后缀；支持的语法版本 MUST 仍为 JSON、YAML 1.2、TOML 1.0 和 XML 1.0。自动模式在空、pending、已识别和未识别输入下 MUST 始终显示英文 `Auto` 或简体中文 `自动`，不附加识别结果或未识别后缀。编辑器 MUST 位于选择器和可见操作控件之前。

选择器 MUST 使用有界的紧凑宽度，并允许在受限布局中收缩，不扩展填满整行。此展示 MUST 保留键盘和焦点行为，以及既有 40/72-logical-pixel Footer 高度。

自动识别 MUST 结合配置结构特征与有界语法分析，不能仅因某个解析器接受输入而选择语言。明确 XML、JSON、TOML 结构的输入 MUST 不因语法残缺或错误而退回 YAML 标量；满足严格 JSON 的对象／数组与 YAML 重叠时 MUST 优先 JSON。无结构普通文本、孤立标量或仅普通注释 MUST 不作为首次可靠识别依据。

首次没有可靠候选时 MUST 使用未识别的纯文本状态。自动模式已有生效语言、后续非空编辑暂时不明确时 MUST 保留最后生效语言；出现另一语言的明确结构时 MUST 允许重新识别。自动模式清空内容 MUST 清除识别结果。用户手选后 MUST 锁定该语言，即使输入内容改变或被清空；只有再次明确选择“自动”才恢复自动识别。

识别或选择变化 MUST 同步语法高亮、后续校验和显式操作所用的语言，但 MUST NOT 改写正文、执行自动格式化或改变撤销历史。迟到识别结果 MUST NOT 覆盖较新的输入版本、用户手选或 Runtime 上下文。

#### Scenario: User explicitly selects a language

- **WHEN** 用户从自动模式手选 XML，随后粘贴其他语言内容或清空再输入
- **THEN** 选择器和生效语言保持 XML，正文不被改写
- **THEN** 校验和格式化按 XML 执行，直到用户再次选择“自动”

#### Scenario: Selector labels remain compact as detection changes

- **WHEN** 用户在任一界面语言下打开语言选择器
- **THEN** 手选项显示 `JSON`、`YAML`、`TOML`、`XML`，不带语法版本后缀
- **WHEN** 自动模式输入从空变为 pending、已识别或未识别
- **THEN** 选择标签保持本地化 `Auto`／`自动`，生效语言继续驱动高亮、校验和符合条件的操作

#### Scenario: Syntax is valid in more than one language

- **WHEN** 自动模式输入 `{"a":1}`、`port = 8080` 或 `<xml></xml>`，且 YAML 也能接受这些文本
- **THEN** 分别依据明确结构选择 JSON、TOML、XML，不把 YAML 解析成功作为兜底识别
- **THEN** 手动模式下仍使用用户选定语言，不自动纠正选择

#### Scenario: Incomplete configuration retains its intended language

- **WHEN** 自动模式输入 `<xml>` 或 `{"a": 1,}` 等具有明确结构但尚未通过语法校验的内容
- **THEN** 分别按 XML 或 JSON 提供高亮和语法诊断
- **THEN** 不因 YAML 能接受它们而切换语言，也不自动修改正文

#### Scenario: Fresh ambiguous input stays unresolved

- **WHEN** 新页面在自动模式下输入 `hello`、`true`、`123` 或无结构的普通注释
- **THEN** 选择器保留本地化 `Auto`／`自动`，编辑器保持纯文本，Format 和 Compact 不执行变换
- **THEN** 手选支持的语言后可以按该语言校验和执行符合条件的操作

#### Scenario: Automatic and manual clear have different semantics

- **WHEN** 用户清空自动模式中已识别的内容
- **THEN** 自动模式保留，识别结果清除，编辑器回到纯文本
- **WHEN** 用户清空手选模式中的内容
- **THEN** 手选语言仍锁定，不恢复自动模式

#### Scenario: Manual choice supersedes pending detection

- **WHEN** 旧输入的自动识别尚未完成，用户手选 TOML，之后旧 XML 识别响应到达
- **THEN** TOML 选择、高亮和诊断不被旧响应覆盖
- **THEN** 用户再次选择“自动”后，仅当前输入的新识别结果可生效

### Requirement: Language operations MUST use bounded Worker execution and safe diagnostics

自动识别、校验、格式化和压缩 MUST 通过包内、页面生命周期内的 Dedicated Worker 和类型化语言边界执行。输入超过 2 MiB UTF-8 或 100,000 行时 MUST 在发送前拒绝。一次完整识别及关联校验 MUST 共享不超过五秒的截止时间，不能给每个候选重新计算五秒；显式操作同样 MUST 有五秒截止时间。返回的诊断 MUST 不超过 200 条。

响应 MUST 绑定请求代次、输入版本和自动／手动选择版本，并在接收时验证形状、支持的语言、结果状态及诊断边界；迟到或格式错误的结果 MUST 失效。诊断 MUST 仅包含稳定代码、严重度、有界位置、本地化消息键和受限参数，不得包含完整输入、绝对路径、原始异常、堆栈、秘密或依赖内部对象。

语言识别与输入有效性 MUST 分开表达：识别为 XML 并不意味着 XML 输入有效。语法错误、限制、不支持、超时或 Worker 故障 MUST 经编辑器内标记及可访问诊断反馈呈现；没有精确位置的操作错误 MUST 使用稳定的编辑器内位置。Footer 不得恢复诊断摘要、状态文本或错误区。处理状态 MUST 通过操作控件的忙碌／禁用和可访问语义表达。

#### Scenario: Valid operation completes within bounds

- **WHEN** 当前输入和处理在资源边界内完成
- **THEN** 当前代次接受经验证的语言及结果，诊断映射到编辑器标记和可访问诊断反馈
- **THEN** 解析和格式化不阻塞页面主交互线程，不要求独立诊断摘要

#### Scenario: Input exceeds a resource limit

- **WHEN** 输入超过字节或行数上限
- **THEN** 不向语言 Worker 发送输入，不生成部分输出，编辑器内显示本地化限制诊断
- **THEN** 正文保持可编辑，缩减输入后可以重新识别或处理

#### Scenario: Worker times out, crashes or returns malformed data

- **WHEN** Worker 超时、终止或响应未通过边界校验
- **THEN** 终止该 Worker 并使其代次失效，保留正文和手选模式，显示有界的本地化编辑器内错误
- **THEN** 修改输入、重新选择语言或执行已启用的显式操作可创建新 Worker；首次识别失败且无生效语言时可通过前两种方式恢复，旧响应不能影响新状态

#### Scenario: Detection and validation share the operation budget

- **WHEN** 自动模式需检查多个可能的语言
- **THEN** 候选分析和关联校验共享同一个请求截止时间和诊断上限
- **THEN** 取消、手选、上下文变化和页面关闭均使整次请求失效

### Requirement: ConfigLens MUST keep user content ephemeral and release all Runtime resources

ConfigLens MUST 仅在当前页面内存中保留正文、搜索查询、匹配状态、自动／手动语言模式和识别结果；不得通过网络上传、浏览器存储、日志、Host 持久化或 Host 剪贴板 API 传递这些内容。用户通过普通编辑快捷键进行的原生文本操作不新增插件程序化剪贴板权限。

仅隐藏／恢复 Launcher 不等于关闭页面。在 entry、Page、version、origin、resource generation 和 Runtime attempt 不变时 MUST 保留同一个 Child WebView、Session、Monaco model、Workers、正文、撤销历史、语言模式及当前搜索状态。全局 Registration revision 仍只是重验证提示，其他插件变化不得撤销当前页面。

关闭、导航、禁用、替换、升级、卸载、开发重载、SDK 重试、React 卸载或 document teardown MUST 幂等释放 SDK、编辑器实例和 model、诊断所有权、观察器、订阅、定时器、搜索资源和全部 Workers。实际关闭后重新打开 MUST 使用全新 Child WebView attempt、model、Worker 和 Session，以默认自动、未识别、空查询状态开始；不可从 Host 的不可变包字节缓存恢复用户状态。

#### Scenario: Hidden Launcher restores the current ConfigLens Page

- **WHEN** 带有正文、手选锁定或自动识别结果、搜索查询的页面隐藏后恢复，且执行身份仍有效
- **THEN** 保留同一 Runtime、model、Worker、内容、撤销历史、语言模式和查询，不出现新的插件加载周期
- **THEN** 不向浏览器或 Host 持久化上述状态

#### Scenario: Current Page closes or plugin is disabled

- **WHEN** 正在识别、格式化或搜索的页面关闭或插件被禁用
- **THEN** Child WebView、Worker、SDK Session、model、搜索和订阅资源全部失效
- **THEN** 迟到回调不能更新 Host、其他插件或后续页面代次

#### Scenario: Plugin is upgraded or uninstalled

- **WHEN** 普通升级提交新包或普通卸载移除 ConfigLens
- **THEN** 新代次不得恢复旧输入、手选模式或搜索查询
- **THEN** 升级使用新包公开 Runtime 资源，卸载无需浏览器存储迁移

### Requirement: ConfigLens UI MUST be bilingual, theme-aware, keyboard-operable and automatically verifiable

除 `ConfigLens` 品牌外，所有产品文案 MUST 提供英语默认、语义一致的简体中文本地化，包括自动模式标签、操作入口、编辑器搜索控件及可访问名称。ConfigLens 自有控件、诊断消息及其可访问名称 MUST 即时采用当前 locale；Monaco 原生编辑器 UI 文案（搜索、配套菜单及诊断交互框架）MUST 使用当前 document 首次有效 Runtime Context 的 locale，在用户实际关闭并重开 ConfigLens 后采用新 locale。不得为更新原生文案自动重载页面或丢弃正文。页面 MUST 不重复 Host 已有主标题或副标题，并保留可访问工作区名称。就绪布局 MUST 恰好由弹性 `content` 和其后的语义 `footer` 组成；单编辑器填满内容区，不增加外边距、内容／Footer 间隙、卡片边框或圆角。

Footer MUST 仅包含语言选择器、Format 和 Compact，MUST NOT 包含 Search 按钮，不再渲染空内容、有效、处理中状态文本或其专用占位区域。语言、操作在正常视口下 MUST 垂直居中，Footer 固定于底部且高 40 logical pixels；宽度不大于 520 或高度不大于 260 logical pixels 时可采用固定 72 logical pixels 的两行排列。状态、长文案、诊断和搜索 MUST 不改变这些高度或移动 Footer。

校验诊断 MUST 保留在编辑器内，不得增加 Footer 诊断数量、摘要、列表、额外行、第三顶层区域或外部诊断浮层。编辑器自身的搜索 widget 不属于被禁止的诊断浮层，但 MUST 限于内容区域。删除状态文本不得删除按钮忙碌／禁用、诊断恢复或可访问语义。

页面 MUST 响应完整浅色／深色和 locale 替换，遵守上述原生文案更新时间例外，并保持正文、语言模式、当前 model、撤销历史、搜索状态、Runtime attempt、用户尺寸及双区域布局。主题 MUST 对原生搜索面板即时生效。编辑器可见全选菜单 MUST 提供全选快捷键的可访问替代方式，二者 MUST 指向当前文本焦点。Runtime Context 未就绪时正常启动 MUST 仍视觉空白但有可访问 busy 语义；启动失败可显示可聚焦恢复入口。

确定性组件、状态、样式契约和产物检查 MUST 覆盖无重复标题、双区域相邻、固定 Footer、无状态／诊断区、两语言两主题、长文案、受限尺寸、键盘焦点、空／有效／无效／未识别／超限／恢复以及搜索和高亮。不得以截图、像素比较、浏览器或原生视觉验收替代。

#### Scenario: Ready ConfigLens fills the available Page body

- **WHEN** 页面在初始或较大建模视口下就绪
- **THEN** 编辑器填满 Footer 上方空间，无额外留白、第二编辑器、重复标题或 document reload
- **THEN** 40px Footer 垂直居中显示语言和操作入口，不渲染原状态区及占位节点

#### Scenario: Invalid input does not expand the Footer

- **WHEN** 输入无效或发生处理错误
- **THEN** 编辑器更新标记，Footer 无状态、诊断数量、摘要或额外行
- **THEN** Footer 高度不变，用户仍可编辑并恢复

#### Scenario: Constrained viewport remains operable

- **WHEN** 建模视口宽度不大于 520 或高度不大于 260 logical pixels
- **THEN** 固定 72px 两行 Footer 可完整访问语言、Format 和 Compact，不显示 Search 按钮
- **THEN** 长文案、自动识别、错误和搜索不额外扩高或恢复页面外边距

#### Scenario: Locale and theme are replaced while editing

- **WHEN** 英文浅色页面收到简体中文深色完整上下文
- **THEN** ConfigLens 自有选择器、操作、诊断消息和可访问名称即时更新，语法颜色与原生搜索面板适应深色主题；Monaco 原生 UI 文案保留本次打开时的英文
- **THEN** 正文、model、撤销历史、模式、查询、尺寸和 Runtime attempt 保持，不因换语言清空内容

#### Scenario: Reopen adopts the new native editor locale

- **WHEN** 用户将应用界面改为简体中文，实际关闭并重新打开 ConfigLens
- **THEN** 新 document 的 Monaco 原生搜索面板、菜单和诊断交互框架采用简体中文
- **THEN** 页面按既有关闭语义以空正文、默认自动和空查询开始，不声称恢复已关闭页面的内容

#### Scenario: Bootstrap waits for Runtime Context

- **WHEN** Child document 已加载而 Runtime Context 尚未到达
- **THEN** 正常启动视觉空白，仅暴露可访问 busy 语义，不提前显示错误语言或主题
- **THEN** Context 到达后采用完整本地化和双区域布局

#### Scenario: Keyboard user formats and recovers from an error

- **WHEN** 用户通过 Format 或 `Ctrl/Cmd+Enter` 执行操作，遇到诊断并修正输入
- **THEN** 焦点可见且可预测，错误在编辑器内读取，Footer 不增加提示
- **THEN** 满足操作条件后可再次成功执行，快捷键与按钮使用相同禁用规则

## ADDED Requirements

### Requirement: ConfigLens MUST provide editor-local search and focus-correct selection

当前编辑器具有文本焦点时，`Cmd/Ctrl+A` MUST 全选当前 model 正文；搜索输入具有焦点时，同一快捷键 MUST 仅全选搜索文本。`Cmd/Ctrl+F` MUST 打开编辑器内搜索 widget，不跳到 Host 搜索或浏览器页面查找。搜索 MUST 支持输入查询、前后定位匹配和本地化无结果反馈；打开、定位和关闭不得修改正文或撤销历史。

原生 Find 图标 MUST 使用包内字体，其字节与锁定编辑器依赖一致。产物 CSS 资源引用 MUST 相对于其样式表解析到插件包内。上述资源 MUST NOT 依赖远程加载、额外 Host 权限或放宽 CSP。

ConfigLens 内的原生 Find 按钮 MUST 保持垂直对齐。打开 Find 或展开 Replace 后，编辑器滚到顶部时 widget MUST NOT 遮挡首行正文；关闭 widget MUST 释放原生占位。此布局修复 MUST 限定在 ConfigLens，保留共享 Plugin UI reset、原生 editor padding 与 Monaco 既有占位行为。

搜索关闭按钮和 widget 内的 Escape MUST 关闭搜索并把焦点恢复到原编辑器，不关闭 Page。编辑器外的语言选择、按钮或 Host 输入 MUST 不被编辑器全选强行夺取焦点。搜索状态 MUST 属于当前页面内存，遵守已有清理和语言／主题契约。

#### Scenario: Find and navigate inside the editor

- **WHEN** 用户按 `Cmd/Ctrl+F`，输入存在的查询并依次定位
- **THEN** 同一个 widget 显示并定位当前 model 的匹配，正文不变
- **THEN** 无匹配时提供本地化反馈，修改查询后可恢复

#### Scenario: Find and Replace preserve the first content line

- **WHEN** 用户在 ConfigLens 中打开 Find 或展开 Replace，并将编辑器滚到顶部
- **THEN** 原生按钮保持垂直对齐，widget 不遮挡首行正文
- **WHEN** 用户关闭 widget
- **THEN** Monaco 释放原生顶部占位，不遗留额外 editor padding，也不改变正文

#### Scenario: Select all respects the focused input

- **WHEN** 正文聚焦时按 `Cmd/Ctrl+A`
- **THEN** 选择完整正文，可继续编辑
- **WHEN** 搜索输入聚焦时按同一快捷键
- **THEN** 只选择查询，不选择正文或 Host 页面

#### Scenario: Closing search restores editor focus

- **WHEN** 用户通过搜索关闭控件或 widget 内 Escape 关闭搜索
- **THEN** 搜索隐藏且焦点回到原编辑器，Page、正文和撤销历史保持
- **THEN** 再次打开不会创建第二个 widget 或叠加快捷键监听

### Requirement: ConfigLens MUST highlight all supported configuration languages

生效语言为 JSON、YAML 1.2、TOML 1.0 或 XML 1.0 时，编辑器 MUST 按语言区分主要词法类别，包括适用的键、字符串、数值、布尔值、注释、标签、属性和 TOML 表／日期。自动识别、手选与主题变化 MUST 更新当前 model 的着色，不改正文和撤销历史。未识别的自动模式 MUST 使用纯文本呈现。

高亮 MUST 能处理编辑中的不完整内容，且不作为输入有效性的判定；严格校验、格式化和保真要求仍分别适用。语言资源 MUST 随插件包交付，不依赖 CDN、远端服务或新增 Host 权限，并遵守既有资源预算。

#### Scenario: Four-language content has meaningful token categories

- **WHEN** 用户自动识别或手选任一支持语言，输入包含该语言主要词法类别的示例
- **THEN** 编辑器产生相应类别的语法着色，在浅色和深色主题下均采用适配的颜色
- **THEN** 严格校验结论不由是否有颜色决定

#### Scenario: Incomplete XML remains highlighted

- **WHEN** 生效语言为 XML 且正文只有未闭合的 `<xml>`
- **THEN** 标签仍获得 XML 着色，并独立呈现 XML 语法诊断
- **THEN** 不等待有效全文才着色，不切换为 YAML，也不替换输入

#### Scenario: Language and theme switch preserve the model

- **WHEN** 手选从 JSON 切为 TOML，或自动识别确定另一语言，随后切换主题
- **THEN** 同一 model 获得新语言及主题的着色，内容与撤销历史不变
- **THEN** 旧语言异步加载完成不得覆盖当前选择
