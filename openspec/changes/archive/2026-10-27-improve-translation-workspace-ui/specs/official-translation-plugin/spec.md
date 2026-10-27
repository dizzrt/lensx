# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Translation workspace MUST use vertically arranged multiline text areas`
- TO: `### Requirement: Translation workspace MUST use responsive source and translation cards`

## MODIFIED Requirements

### Requirement: Translation MUST be a standalone foreground plugin

翻译 MUST 保持独立前台插件及既有身份、公共 Host API 兼容性、隔离和安装边界，使用可调整的 `800×480` 初始页面尺寸并服从 Host 实际工作区约束。

#### Scenario: User opens Translation
- **WHEN** 用户执行当前可用的 `dev.lensx.translation.open` Action
- **THEN** Host 打开插件的 `main` Page，并按当前界面语言显示 Translation 或翻译
- **THEN** 插件沿用其他插件相同的隔离、Context 与生命周期边界

#### Scenario: Official plugin attempts a private capability
- **WHEN** 插件实现或产物依赖非公共 Host、Tauri、原生代理、Node Runtime 或持久后台执行能力
- **THEN** 产物不满足此能力的交付契约
- **THEN** 官方来源不能成为绕过公共插件边界的依据

#### Scenario: Register and open the Translation package
- **WHEN** Translation 包被检查、注册、打开，或在前台 Runtime 内调用公共 HTTP
- **THEN** 系统提供 ID 为 `dev.lensx.translation`、包名为 `@lensx/official-translation` 的独立插件，贡献一个 `main` Page 和指向该页面的 `open` Action，英文名为 Translation、简体中文名为翻译
- **THEN** 页面声明可调整的 `800×480` 初始逻辑尺寸，实际呈现服从 Host 工作区约束
- **THEN** 插件遵守现有 Manifest、隔离 Web Runtime、公共 Host API 和安装生命周期契约；官方身份不授予私有 Host、Tauri、文件系统、进程、Node Runtime 或后台执行权限
- **THEN** 插件要求 Host API `>=0.3.0 <0.4.0`，只在当前 Context 声明 `http.request` 后调用公共 HTTP 能力

### Requirement: Translation workspace MUST use responsive source and translation cards

工作区 MUST 提供可访问的响应式原文与只读译文卡片。实际 Host 约束视口变化时，MUST 保留纯文本输出、原生选择与复制、页面内存边界，以及编辑与请求连续性。

#### Scenario: User enters and selects multiline text
- **WHEN** 用户输入包含换行的原文并获得成功译文
- **THEN** 原文区保留完整原文，译文区显示与当前条件对应的只读译文
- **THEN** 用户可以选中并原生复制译文，但不能直接编辑译文

#### Scenario: Service returns markup-shaped text
- **WHEN** 成功译文包含标签、脚本形状字符串或其他标记文本
- **THEN** 译文按字面纯文本展示，不创建元素、不执行脚本、不自动导航

#### Scenario: Page starts with no text
- **WHEN** 用户打开新的翻译页面
- **THEN** 原文和译文为空，页面不恢复前一次页面的文本或翻译历史
- **THEN** 原文和译文保持空白，不显示译文空状态指引且不发送翻译请求

#### Scenario: Initial window has room for two cards
- **WHEN** 页面按 `800×480` 初始尺寸打开且实际可用宽度足以并排阅读
- **THEN** 原文卡片在左、译文卡片在右，语言选择和设置入口位于其上方
- **THEN** 用户可以访问两个文本区及其操作，不需要横向滚动页面

#### Scenario: Host constrains the page to a narrow viewport
- **WHEN** 实际视口变窄，不再能容纳可读双栏
- **THEN** 工作区改为上方原文、下方译文，语言栏与操作按空间换行
- **THEN** 文本标签、语言选择与互换、状态反馈、恢复操作和设置仍可访问

#### Scenario: Long content or a short window needs scrolling
- **WHEN** 原文、译文、语言名称或错误提示较长，或者窗口高度不足
- **THEN** 内容按所属区域换行或滚动，完整文本不会被截断或从页面状态中丢弃
- **THEN** 页面和卡片不会用不可恢复的裁切隐藏操作、焦点或设置内容

#### Scenario: Layout changes during composition or a request
- **WHEN** 用户正在输入法组合输入、选择文本或等待翻译时调整窗口宽度
- **THEN** 当前文本控件、焦点、选择、输入法会话、语言值和请求状态保持连续
- **THEN** 调整宽度不提交输入法草稿、不重置 400ms 计时、不增加请求或配置写入

#### Scenario: Arrange cards within the actual Host viewport
- **WHEN** Host 为翻译页面提供实际视口
- **THEN** 插件 MUST 提供带清晰、可访问且本地化标签的原文卡片与译文卡片。原文为可编辑多行文本区，译文为可选择但不可编辑的只读多行文本区。在初始 `800×480` 窗口且 Host 提供足够工作区宽度时，两张卡片 MUST 左右并排，原文在左、译文在右；在不能容纳可读双栏的窄视口内 MUST 按原文、译文顺序上下排列。受 Host 工作区限制后的实际视口决定布局，插件 MUST NOT 为维持双栏强制改变 Host 窗口尺寸。

#### Scenario: Read cards with constrained space and either theme
- **WHEN** 工作区在任意受支持主题或视口中呈现卡片
- **THEN** 两张外层卡片 MUST 使用一致中性主题表面；内部原文区采用中性表面，内部译文区采用轻微主色表面，并通过标题和间距区分输入与输出。文本区聚焦时 MUST NOT 显示蓝色大框、标题下划线或替代装饰；MUST 保留原生光标、选区与可访问标签。正文及交互控件 MUST 在明暗主题中可辨认，选择器和操作按钮 MUST 保留可见键盘焦点。长文本、长语言名称、窄视口和较低窗口高度 MUST NOT 导致主要控件被水平裁切或无法访问；长文本 MUST 可换行和滚动，空间不足时页面 MUST 允许访问全部内容与设置。

#### Scenario: Expose translation text for reading and native copy
- **WHEN** 原文或译文初始化、被编辑、保留在页面内存中，或者呈现供阅读与原生复制
- **THEN** 译文 MUST 作为纯文本显示，MUST NOT 被解释为 HTML 或可执行内容。译文区 MUST 支持文本选择和原生复制，MUST NOT 新增或调用 Host 剪贴板接口。原文与译文 MUST 初始为空，文本和请求状态 MUST 只存在于当前页面内存中。

#### Scenario: Rearrange cards without changing translation work
- **WHEN** 当前页面 attempt 内的视口变化使卡片重排
- **THEN** 布局重排 MUST 保留当前文本、语言值、焦点、选择和输入法会话，MUST NOT 取消、重启或重复当前请求，也 MUST NOT 因改变宽度而触发存储写入。400ms 自动翻译和已接受的配置、请求、重试及生命周期行为 MUST 继续生效。

#### Scenario: Compact cards retain access in the shorter initial window
- **WHEN** 页面使用较短的初始窗口或 Host 进一步限制高度
- **THEN** 紧凑间距与较短正文最小高度减少工作区占用，长内容与独立设置视图分别可通过当前视图或文本控件滚动访问
- **THEN** 卡片与文本控件不通过裁切隐藏焦点、错误或可用操作

### Requirement: Response handling MUST distinguish service errors from valid translated text

响应处理 MUST 在接受恰好一个字符串译文前验证 HTTP 状态、服务错误、JSON 结构和有界响应字节。反馈 MUST 使用安全类别与已验证诊断信息，不暴露原始第三方数据。

#### Scenario: Service returns HTTP 200 with an error
- **WHEN** HTTP 200 响应包含 `ResponseMetadata.Error`
- **THEN** 插件展示相应的本地化失败类别
- **THEN** 该响应不会作为成功译文展示

#### Scenario: Service returns a non-success HTTP status with a bounded error
- **WHEN** 非 2xx 响应在大小限制内包含可解析的 `ResponseMetadata.Error`
- **THEN** 插件使用该服务错误进行本地化分类，而不是只展示通用 HTTP 失败
- **THEN** HTTP 失败正文仍受相同的大小、结构和安全展示约束

#### Scenario: Successful response contains one valid translation
- **WHEN** 当前请求收到没有服务错误且满足单输入响应契约的译文
- **THEN** 译文卡片中的只读文本区显示该字符串，并结束当前加载状态，无论卡片处于右侧还是下方
- **THEN** 其他响应字段不混入译文正文

#### Scenario: Response is malformed or oversized
- **WHEN** 响应不是有效 JSON、结构错误、缺少有效译文、条目数量错误或正文超过 1 MiB
- **THEN** 插件拒绝响应并展示可恢复错误
- **THEN** 页面不把原始响应、部分解析值或旧译文显示为当前结果

#### Scenario: Error response includes unsafe diagnostic data
- **WHEN** 服务错误包含原始消息、HTML、类似凭据的内容或不符合安全约束的 RequestId
- **THEN** 插件展示产品自有的本地化错误文案并忽略不安全诊断字段
- **THEN** 页面既不直接渲染也不记录原始第三方错误内容

#### Scenario: Classify HTTP and service results before accepting a translation
- **WHEN** 插件在展示任何译文之前评估服务响应
- **THEN** 插件 MUST 在展示译文前检查 HTTP 结果、响应大小、JSON 结构和 `ResponseMetadata.Error`。非 2xx 响应正文 MUST 在相同大小边界内读取并解析服务错误，MUST NOT 仅因 HTTP 失败而丢弃可解析的供应商错误类别。即使 HTTP 状态为 200，只要 `ResponseMetadata.Error` 包含有效服务错误，MUST 按失败处理。已知 `Code` 或整数 `CodeN` MUST 用于安全分类，包括 `InvalidAccessKey`、`InvalidCredential` 和 `100009`；未知值 MUST 保留服务错误回退类别，不展示原始 Message。成功响应 MUST 具有成功 HTTP 状态、没有服务错误、恰好一个有效 `TranslationList` 项，且其 `Translation` 为字符串；缺失响应、错误结构、错误条目数量或错误译文类型 MUST 转为可恢复响应错误，MUST NOT 展示部分结果、猜测结果或对象字符串。

#### Scenario: Bound response reading and filter diagnostic fields
- **WHEN** 插件读取响应字节或准备可展示的响应诊断信息
- **THEN** 响应正文读取 MUST 限制为 1 MiB；超过限制 MUST 停止处理并展示安全错误。原始第三方错误消息、HTML 和原始响应 MUST NOT 直接进入用户反馈。`RequestId` 仅在包含 1–128 个 ASCII 字符并匹配 `[A-Za-z0-9._:-]+` 时才允许展示；其他服务字段 MUST NOT 直接作为可展示诊断信息透传。

### Requirement: Input changes MUST trigger debounced translation without composition requests

有效输入 MUST 继续使用 400ms debounce，保留完整请求文本，不提交组合草稿或同值重复事件。原生中文组合输入 MUST 保留草稿和最终提交字符，MUST NOT 被旧受控值覆盖。原文 MUST 通过控件属性关闭自动拼写/更正、大写及自动完成提示，不阻断输入法候选与组合会话。普通清空 MUST 取消工作；退休会话的迟到事件 MUST NOT 恢复文本。

#### Scenario: User types continuously
- **WHEN** 用户连续编辑且相邻编辑间隔小于 400ms
- **THEN** 插件不请求中间文本
- **THEN** 最后一次实际编辑满 400ms 后只调度最终文本

#### Scenario: User enters text with an input method
- **WHEN** 输入法组合尚未结束，即使已超过 400ms
- **THEN** 原生组合草稿保持可见，插件不请求草稿翻译
- **THEN** 组合结束后保留完整最终中文，并从最终提交启动新的 400ms 等待

#### Scenario: Input event repeats the same value
- **WHEN** 重复 input 事件不改变当前原文，包括 composition-end 后同值 input
- **THEN** 既有成功结果或当前请求状态保持一致，等待计时不重置
- **THEN** 插件不创建重复请求

#### Scenario: User clears the input
- **WHEN** 用户通过原生编辑清空原文或将其变为纯空白
- **THEN** 清除译文和旧请求反馈，取消等待或进行中的工作
- **THEN** 迟到结果和退休组合会话事件不能恢复已清空内容

#### Scenario: Schedule effective edits while respecting composition and clearing
- **WHEN** 原文被编辑、组合输入、重复通知、清空，或请求条件变为有效
- **THEN** 配置与语言条件满足且设置关闭时，最后一次有效编辑后 400ms 自动翻译；组合期间不提交，结束后从最终提交文本重新计时
- **THEN** 同值事件不新建请求；空或纯空白原文取消等待和在途工作并清除译文/反馈，不请求服务
- **THEN** 非纯空白请求保留原始空格与换行，不静默 trim

#### Scenario: Native Chinese composition commits through input events
- **WHEN** 原生控件依次收到 compositionstart、组合期间的 input、compositionend 以及可能重复的最终 input
- **THEN** 浏览器草稿不会被上一原文回写覆盖，最终中文字符完整保留，只有当前会话的最终提交可进入调度
- **THEN** 最终提交后 399ms 不请求，满 400ms 仅请求一次完整文本

#### Scenario: A temporary empty IME draft keeps its composition session
- **WHEN** 原生事件依次为 compositionstart、组合标记的 input `n`、组合标记的空 input、组合标记的 input `ni`、compositionend `你`
- **THEN** 临时空草稿保留同一有效组合会话与 token，后续草稿仍可显示，最终中文 `你` 保留并只在提交 400ms 后翻译
- **THEN** 页面依据原生 `isComposing` 或 composition 类型的 `inputType` 区分组合草稿与普通编辑；原生 input 同时缺少这两类元数据时仅以当前有效组合 token 和 composing 状态回退，显式非组合 InputEvent 或普通 change 不使用回退
- **THEN** 只有非组合的普通清空才退休旧会话，迟到旧事件不能恢复文本

#### Scenario: Native input omits composition metadata
- **WHEN** compositionstart 后收到缺少布尔 isComposing 和 inputType 的原生 input，且当前组合 token 与 composing 状态仍有效
- **THEN** 临时空草稿按当前组合会话处理，后续草稿与最终提交保持连续，不在组合期间请求
- **THEN** 显式非组合删除仍按普通清空处理，退休旧会话并拒绝迟到提交

#### Scenario: Source editing opts out of automatic text assistance
- **WHEN** 页面初始化原文控件或用户输入、粘贴与组合文本
- **THEN** 原文控件声明 `spellCheck=false`、`autoCorrect="off"`、`autoCapitalize="off"`、`autoComplete="off"`，请求关闭自动拼写、更正、大写与完成提示
- **THEN** 不修改系统全局偏好、不改写原文、不取消中文输入法候选或组合事件；最终文本仍按现有规则调度

### Requirement: Plugin settings MUST remain inside the current document

设置 MUST 在同一插件文档与 Runtime 中提供独立视图，不创建 Host Page、路由或原生窗口。设置显示时工作区 MUST 完全隐藏且不可交互，但文本控件和控制器保持挂载。返回、取消或成功保存 MUST 恢复工作区状态、滚动和入口焦点；失败保留当前草稿。调度仍遵守已确认配置及设置暂停边界。

#### Scenario: User edits settings then cancels
- **WHEN** 用户打开设置、修改服务凭据并取消
- **THEN** 返回翻译工作区，原文、译文及语言选择保留，未保存草稿不生效
- **THEN** 使用最近确认配置恢复当前有效输入，请求条件未变的成功结果不重复翻译

#### Scenario: Settings opens during translation
- **WHEN** 用户在 debounce 等待或请求进行中进入设置视图
- **THEN** 插件取消该工作并停止自动翻译，工作区隐藏且不可交互
- **THEN** 返回后仅为仍需结果的当前输入恢复调度，旧响应不能覆盖译文

#### Scenario: Only the first provider is available
- **WHEN** 用户展开设置中的服务选择器
- **THEN** 只能选择火山引擎，不将未实现服务显示为可用
- **THEN** 此操作不进入或修改 Host 主设置

#### Scenario: Configure Volcengine within the existing page
- **WHEN** 用户进入、编辑、保存或离开插件设置视图
- **THEN** 设置在同一文档和 Runtime 内独立显示，包含返回翻译、服务选择、凭据、保存和取消，不作为工作区下方的追加表单
- **THEN** 工作区整体隐藏且不参与指针、键盘或辅助技术交互，但原文/译文节点、控制器、文本、结果、语言、选区和编辑历史保持连续
- **THEN** 不创建 Host Page、路由或原生窗口，不扩展 Host 主设置；返回或取消丢弃未保存草稿

#### Scenario: Pause and resume around the inline settings panel
- **WHEN** 设置视图打开、保持可见或返回工作区，同时页面已有输入或结果
- **THEN** 设置可见期间暂停自动调度并取消等待或在途工作；返回后按当前文本、语言和已确认配置恢复
- **THEN** 请求条件未变的成功结果保持有效，不因进入或返回设置而重新请求；被取消且尚无成功结果的当前输入可以重新调度

#### Scenario: Enter and return with view-local focus and scrolling
- **WHEN** 用户从工作区进入设置，再通过返回、取消、Escape 或保存成功回到翻译
- **THEN** 进入前记录工作区滚动位置，设置显示后将滚动置顶并聚焦第一个凭据输入
- **THEN** 返回时先使工作区可见，再恢复原滚动位置并聚焦仍存在的设置入口；隐藏工作区不会接收输入或焦点
- **THEN** 输入法正在使用 Escape 时不离开设置，普通 Escape 沿用返回行为

#### Scenario: Return while credential persistence is pending
- **WHEN** 用户在凭据保存或结果核对尚未完成时使用返回或取消
- **THEN** 工作区恢复可见且原文可继续编辑，语言/配置冲突提交与相关翻译仍等待持久化确认或核对完成
- **THEN** 返回不宣称已提交写入被取消或回滚；后续调度使用最新输入和最终已确认配置

#### Scenario: Failed or obsolete saves preserve the current view session
- **WHEN** 当前可见设置会话保存明确失败，或旧保存响应在离开并重新打开设置后返回
- **THEN** 当前会话失败时保留设置视图、草稿和失败反馈；确认成功才返回工作区
- **THEN** 旧会话的迟到响应不能关闭新设置视图、覆盖新草稿或抢夺焦点

### Requirement: Locale theme and keyboard behavior MUST remain consistent

翻译 MUST 跟随 Host 语言和主题，不改变请求身份。键盘操作、设置焦点返回、辅助技术反馈和 IME 优先 MUST 保持有效；文本区保留原生光标/选区，不增加标题下划线或装饰焦点框，其他交互控件保留可见焦点。

#### Scenario: User changes Host locale and theme
- **WHEN** 当前页面收到新的界面语言或主题 Context
- **THEN** 操作文案、可访问名称和主题同时更新
- **THEN** 原文、译文、语向和请求条件不变，不增加服务请求

#### Scenario: Keyboard user configures the service
- **WHEN** 用户只用键盘打开设置、编辑字段并保存或取消
- **THEN** 每项操作可达，设置控件保持可见焦点；返回翻译入口可离开独立设置视图
- **THEN** 返回后先使工作区可见，再恢复其滚动位置与仍存在的设置入口焦点，原文保持不变

#### Scenario: A loading or failure state is presented
- **WHEN** 插件等待、请求中或发生配置、输入、请求失败
- **THEN** 常规状态通过视觉隐藏的文本 live region 和 busy 语义区分；需操作的错误在语言栏附近显示本地化文字与恢复操作
- **THEN** 状态含义不只依靠颜色或图标，译文下方不显示状态或元信息

#### Scenario: Apply a presentation Context update without resubmission
- **WHEN** 页面按当前 Host Context 呈现或收到语言/主题更新
- **THEN** 可见文字、设置说明、状态、错误、语言选项与可访问名称支持英文与简体中文，界面支持明暗主题
- **THEN** Host 的语言或主题更新不改变翻译条件、不重发请求，也不覆盖用户文本和所选语言

#### Scenario: Operate settings and translation controls with the keyboard
- **WHEN** 用户编辑文本、选择语言，或打开、操作、关闭设置及恢复控件
- **THEN** 输入、语言选择、互换、设置、保存、取消和重试都可用键盘操作；原文/译文标题不出现聚焦下划线，文本区不增加装饰焦点框，原生光标与选区保持有效，其他交互控件保留可见焦点
- **THEN** 进入设置视图后滚动置顶并移入凭据输入，返回、取消或保存成功后在工作区可见时恢复滚动与入口焦点；Escape 返回工作区，但输入法正在使用的按键保持默认处理
- **THEN** 常规状态通过辅助技术文本语义表达，需操作的错误提供可见文字；快捷键和面板操作不得误将组合草稿提交翻译

## ADDED Requirements

### Requirement: Translation workspace MUST enforce input limits without count controls

工作区 MUST NOT 显示原文字符计数或清空按钮。控制器 MUST 继续按 Unicode code points 验证 5000 上限，不截断、拆分或改写原文；非纯空白超限 MUST 提供可访问限额反馈并阻止请求。纯空白 MUST 优先保持空状态，即使超过上限。原生编辑删除和纠正输入 MUST 保持可用。

#### Scenario: Unicode input is checked without a visible counter
- **WHEN** 用户输入换行、补充平面字符或组合字符
- **THEN** 校验将代理对表示的单个码点计为一个字符，将组合字符序列按各码点分别计数
- **THEN** 页面不显示计数或清空按钮，校验不改写原文或改变有效请求内容与时间

#### Scenario: Input exceeds the limit and is corrected
- **WHEN** 非纯空白原文超过 5000 code points，随后被编辑回允许范围
- **THEN** 超限时完整原文仍可编辑，限额反馈可读且不发送请求
- **THEN** 回到范围内后，当前输入按原有条件重新进入 400ms 自动翻译流程

#### Scenario: Oversized whitespace remains empty input
- **WHEN** 原文仅含空白字符，即使字符数量超过 5000
- **THEN** 页面保持空状态并清除译文和请求反馈
- **THEN** 页面不显示限额阻塞错误或译文空指引，也不发送请求

### Requirement: Translation workspace MUST present contextual controls and feedback

工作区 MUST 居中呈现源语言、可辨认的互换图标与目标语言，设置在右侧。源/目标分别使用实心/描边胶囊，标签视觉隐藏但保留可访问名称。语言与操作控件 MUST 支持英中双语、主题与键盘焦点。工作区 MUST 移除服务发送行、译文空指引与译文下方的常规状态/元信息；服务告知保留在设置内。

#### Scenario: User accesses localized language controls
- **WHEN** 工作区在任意受支持视口宽度下显示
- **THEN** 源/目标与互换组成紧凑居中组，窄视口可换行，所有可用控件仍可键盘操作
- **THEN** 完整本地化源/目标标签虽不视觉显示，仍可被辅助技术识别；标签隐藏不移除键盘行为或可见焦点
- **THEN** 全部操作、禁用原因与辅助技术状态支持英文和简体中文，不仅依赖颜色或图标
- **THEN** 互换 SVG 具有明确宽高与 viewBox，在启用和禁用状态下均可辨认，图标不代替按钮的本地化可访问名称

#### Scenario: User reads service disclosure in settings
- **WHEN** 用户打开插件设置
- **THEN** 设置明确说明原文发送到火山引擎，并保留本机未加密凭据存储说明
- **THEN** 工作区卡片下方不再显示服务发送行

#### Scenario: User changes presentation while retaining translation state
- **WHEN** Host 语言或明暗主题改变，或者用户调整工作区宽度
- **THEN** 卡片、语言栏、辅助技术状态和设置采用当前本地化文案与主题；文本保留原生光标/选区而不加装饰，其他交互控件保留可见键盘焦点
- **THEN** 这些呈现变化不改写文本或语言值，不增加服务或存储调用

#### Scenario: User continues automatic translation without a submit action
- **WHEN** 用户输入有效文本且配置就绪、设置关闭、输入法组合已结束
- **THEN** 最后一次实际编辑后 400ms 自动调度翻译，无需点击翻译按钮
- **THEN** 页面只提供语言选择与互换、文本编辑、配置及已有恢复操作，不提供手动或立即翻译、一键复制、朗读或未实现的文档/图片/语音入口

### Requirement: Translation workspace MUST keep translation and configuration recovery contextual

译文下方 MUST NOT 显示状态、RequestId 或检测语言。等待、翻译中、成功、暂停等常规状态 MUST 保留视觉隐藏的 live region，空状态不播报。需操作的输入/HTTP/请求错误与重试 MUST 放在语言栏附近，不使用 Toast 或重复播报；配置重载、有效目标修复与请求重试保持区分，凭据错误仍在设置中。

#### Scenario: Empty translation has no instruction copy
- **WHEN** 新页面尚无原文，或原文被清空/变为纯空白
- **THEN** 译文控件保持空白，页面不显示译文空状态指引
- **THEN** 页面不发送请求，后续非空常规状态仍通过视觉隐藏文本、live-region 和忙状态语义提供给辅助技术

#### Scenario: Translation fails and the user retries
- **WHEN** 当前请求失败且仍满足重试条件
- **THEN** 语言栏附近显示安全错误和可用重试，原文不变，且不自动重试；译文下方没有状态或诊断元信息
- **THEN** 显式重试仅产生一次当前请求，进行中的重复激活不并发创建请求

#### Scenario: Configuration prevents translation
- **WHEN** 配置缺失、读取失败、内容无效或已保存目标不再受支持
- **THEN** 页面保留原文，分别提供设置、配置重载或有效目标选择的恢复路径
- **THEN** 配置恢复不伪装成请求重试，不显示不可用的成功译文

#### Scenario: Routine translation feedback remains nonvisual
- **WHEN** 当前输入处于等待、翻译中、成功或暂停状态
- **THEN** 状态文本只存在于视觉隐藏的 live region，请求中保留 busy 语义，不占用译文下方空间
- **THEN** 不渲染 RequestId 或检测语言文字；检测语言仅在内存中用于当前结果的 Auto 互换判断，响应安全过滤保持不变

#### Scenario: Input or transport conditions need user action
- **WHEN** 原文超限、语向不支持或 Host HTTP 不可用
- **THEN** 语言栏附近显示对应本地化反馈并关联相关控件，不把非请求问题伪装成请求重试
- **THEN** 恢复后沿用当前请求条件和既有调度，原文与只读译文正文不混入反馈

### Requirement: Language swap MUST confirm a reversible pair without changing source text

互换 MUST 只反转有效语言方向，不交换或改写文本。手动源或当前有效结果的检测源 MUST 能作为目标，当前目标 MUST 能作为源，且反向语对受支持。Auto 无可用检测结果或语对不可逆时 MUST 禁用互换并提供本地化原因。目标持久化确认前 MUST 保留原语对并禁止冲突语言操作；确认后反向源/目标共同生效，明确失败保留原语对；结果不明沿用权威存储重读核对，不发送中间语对请求。

#### Scenario: User swaps a supported manual language pair
- **WHEN** 当前源/目标可以形成受支持的反向语对，用户激活互换
- **THEN** 插件保存反向目标，确认后共同采用反向源和目标；原文保持逐字不变，译文不回填原文
- **THEN** 当前有效原文在确认后按既有 400ms 自动翻译规则重新调度

#### Scenario: Auto uses only current confirmed detected language
- **WHEN** 源语言为 Auto 且当前请求条件存在有效成功结果的 detectedLanguage
- **THEN** 只有该检测语言可作为反向目标，且它与当前目标必须分别满足反向目标/源角色及语向限制
- **THEN** 未检测、结果已失效、检测码不可作为目标或语对不可逆时，互换禁用并显示可访问的双语原因，不猜测语言或发起额外检测请求

#### Scenario: Swap persistence is pending or fails
- **WHEN** 互换目标保存尚未确认、明确失败或结果不明
- **THEN** 等待期间保留原语对，禁用源/目标编辑和重复互换，暂停相关调度，且不改变原文
- **THEN** 明确失败保留旧源/目标并提供语言上下文错误；结果不明先按既有规则重读核对，确认前不使用未确认配置或半反转语对

#### Scenario: An obsolete swap completes after the Runtime changes
- **WHEN** 旧互换保存或核对在 Runtime 结束或替换后返回
- **THEN** 旧回调不能改变新页面的语言、文本、配置或请求状态
- **THEN** 互换不新增持久化源语言、配置字段或自动重试

## REMOVED Requirements

### Requirement: Translation workspace MUST display a non-destructive Unicode input count

**Reason**: 用户明确要求移除工作区中的可见字符计数与清空按钮，原有可见计数场景不再属于接受的界面行为。

**Migration**: 以 `Translation workspace MUST enforce input limits without count controls` 保留完整 Unicode 计数算法、5000 上限、纯空白优先和恢复调度语义；用户通过原生编辑删除文本，无需配置或数据迁移。
