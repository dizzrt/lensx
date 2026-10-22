# Spec Delta

## Purpose

定义 lensX 独立翻译插件的文本输入、自动翻译、语言选择、插件内服务设置、本机凭据保存及火山引擎调用契约，使用户能够在当前插件页面完成短文本翻译，并能区分当前译文、待处理状态与可恢复错误。

## ADDED Requirements

### Requirement: Translation MUST be a standalone foreground plugin

系统 MUST 提供插件 ID 为 `dev.lensx.translation`、包名为 `@lensx/official-translation` 的独立插件，贡献一个 `main` Page 和一个指向该 Page 的 `open` Action，英文名称为 `Translation`、简体中文名称为 `翻译`。Page MUST 声明 `800×600` 的逻辑初始尺寸并允许调整大小，实际呈现 MUST 服从既有 Host 工作区约束。插件 MUST 遵循现有 Manifest、隔离 Web Runtime、公共 Host API 和安装生命周期契约；官方身份 MUST NOT 提供私有 Host、Tauri、文件系统、进程、Node Runtime 或后台执行权限。翻译插件 MUST 要求 Host API `>=0.3.0 <0.4.0` 并仅在当前 Context 宣告 `http.request` 后调用公共 HTTP 能力。

#### Scenario: User opens Translation
- **WHEN** 用户执行当前可用的 `dev.lensx.translation.open` Action
- **THEN** Host 打开该插件的 `main` Page，并在当前界面语言显示 `Translation` 或 `翻译`
- **THEN** 插件使用与其他插件相同的隔离、上下文和生命周期边界

#### Scenario: Official plugin attempts a private capability
- **WHEN** 插件实现或包产物依赖未公开的 Host、Tauri、原生代理、Node Runtime 或常驻后台执行能力
- **THEN** 该产物不满足本能力的交付契约
- **THEN** 官方来源不得成为绕过公共插件边界的理由

### Requirement: Translation workspace MUST use vertically arranged multiline text areas

插件 MUST 在上半部分提供可编辑的多行原文文本框，在下半部分提供只读的多行译文文本框，并提供明确、可访问且已本地化的标签。译文 MUST 作为普通文本显示，MUST NOT 解释为 HTML 或可执行内容。译文文本框 MUST 允许选择文本与浏览器原生复制操作，MUST NOT 为复制新增或调用 Host 剪贴板接口。初始原文和译文 MUST 为空，原文、译文和请求状态 MUST 仅保存在当前页面内存中。

#### Scenario: User enters and selects multiline text
- **WHEN** 用户输入包含换行的原文并取得成功翻译
- **THEN** 上方文本框保留原文，下方只读文本框显示对应译文
- **THEN** 用户可以选择译文并使用原生复制操作，不能直接编辑译文

#### Scenario: Service returns markup-shaped text
- **WHEN** 成功译文包含标签、脚本样式字符串或其他标记文本
- **THEN** 译文按文本原样显示，不创建元素、不执行脚本、不自动导航

#### Scenario: Page starts with no text
- **WHEN** 用户新打开翻译页面
- **THEN** 原文和译文为空，页面不恢复上一次页面的文本或翻译历史
- **THEN** 页面显示空状态且不发起翻译请求

### Requirement: Plugin settings MUST remain inside the current document

插件 MUST 在同一页面文档内提供设置面板，包含服务选择、对应凭据及明确的保存和取消操作。第一版服务选项 MUST 仅包含火山引擎；设置 MUST NOT 扩展 Host 主设置或创建额外 Host 页面。打开、编辑、保存和取消面板 MUST 保留当前原文和语言选择，取消 MUST 丢弃未保存的配置草稿。

设置面板打开时 MUST 暂停自动翻译调度并取消待执行或进行中的请求。面板关闭后 MUST 根据当前原文、语言和已确认配置恢复调度；若已成功译文对应的请求条件未变，MUST 保留该译文且 MUST NOT 仅因打开或关闭面板重复请求。已取消但尚无成功结果的当前输入 MUST 能在关闭面板后重新调度。

#### Scenario: User edits settings then cancels
- **WHEN** 用户打开设置、修改服务凭据后选择取消
- **THEN** 原文和语言选择保留，未保存草稿不生效
- **THEN** 插件恢复使用原有已确认配置，并保留条件未变的成功译文

#### Scenario: Settings opens during translation
- **WHEN** 用户在防抖等待或翻译请求进行中打开设置
- **THEN** 插件取消该工作且不继续自动提交翻译请求
- **THEN** 面板关闭后仅对仍需要结果的当前输入恢复调度，旧请求晚到不得更新译文

#### Scenario: Only the first provider is available
- **WHEN** 用户展开服务选择
- **THEN** 仅火山引擎可被选择，页面不显示尚未实现的服务为可用选项
- **THEN** 该配置操作不进入或修改 Host 主设置

### Requirement: Configuration MUST load before any translation request

插件 MUST 在当前 Runtime 首次上下文就绪后读取已保存配置，并在配置加载成功、有效服务凭据可用且语言状态确定之前禁止翻译请求。配置缺失 MUST 与读取失败或保存内容无效区分；缺失时 MUST 引导用户配置服务，读取失败或无效时 MUST 提供本地化错误与显式恢复入口。插件 MUST NOT 把读取失败当作首次使用，也 MUST NOT 以默认配置静默覆盖已有存储。

已知配置版本且其余字段均合法、仅保存的目标语言已不受支持时，插件 MUST 保留已验证字段并允许用户显式选择有效目标语言，确认保存后恢复翻译；修复 MUST 保留未修改凭据。未知版本或结构损坏 MUST 继续保留原始记录并阻止猜测性写入。

#### Scenario: Text is entered before configuration finishes loading
- **WHEN** 用户在配置加载期间输入原文
- **THEN** 插件保留输入但不发送翻译请求
- **THEN** 配置成功加载并满足请求条件后，插件仅调度当前最新输入

#### Scenario: No saved service configuration exists
- **WHEN** 存储明确返回没有已保存配置
- **THEN** 页面显示需要配置服务的状态，允许打开插件设置
- **THEN** 插件不发送空凭据请求，也不自动写入默认配置

#### Scenario: Configuration read fails or contains invalid data
- **WHEN** 存储不可用、读取失败或保存内容不满足当前配置契约
- **THEN** 页面显示可诊断且可恢复的配置错误，并暂停翻译
- **THEN** 已保存内容不会被默认值覆盖，用户可显式重试读取

### Requirement: Service configuration MUST use confirmed persistence semantics

用户保存服务配置时，插件 MUST 校验服务和必需的 Access Key ID、Secret Access Key，并通过现有插件专属 `storage.*` 边界持久化。只有成功确认持久化的配置才 MUST 成为翻译使用的配置；保存期间 MUST 防止重复提交，失败 MUST 保留最近已确认配置并显示失败反馈。写入已可能提交但响应丢失或结果不明时，插件 MUST 重新读取并核对持久状态后再确定有效配置，MUST NOT 猜测成功、假装回滚或盲目重复写入。

服务配置与目标语言写入 MUST 串行提交，并以最新已确认配置为基础保留未修改字段；写入期间 MUST 阻止冲突配置提交并暂停翻译调度，同时 MUST 允许用户继续编辑原文。任何失效 Runtime 的配置读取或写入回调 MUST NOT 更新新页面、回滚当前 Context 或覆盖更新后的用户选择。

#### Scenario: Configuration saves successfully
- **WHEN** 用户提交有效配置且存储确认成功
- **THEN** 后续翻译使用新配置，并根据当前文本重新确定是否需要请求
- **THEN** 未保存草稿不再作为独立有效配置存在

#### Scenario: Configuration save fails before confirmation
- **WHEN** 保存返回确定失败
- **THEN** 页面显示保存失败，最近已确认配置保持有效
- **THEN** 页面不宣称保存成功，也不使用失败草稿发起请求

#### Scenario: Save outcome is ambiguous
- **WHEN** 保存可能已提交但其成功或失败结果无法确认
- **THEN** 插件暂停依赖该配置的翻译并重新读取存储进行核对
- **THEN** 只有重新确认后的有效配置可用于请求，无法核对时保持可恢复错误状态

#### Scenario: Configuration edits would conflict
- **WHEN** 服务配置或目标语言的一次持久化尚未完成，用户尝试提交另一项配置
- **THEN** 插件阻止冲突提交并保留当前原文编辑能力
- **THEN** 后续提交基于最新已确认配置，不会由目标语言更新覆盖已保存凭据

### Requirement: Credentials MUST have explicit local unencrypted storage semantics

AK/SK 与服务配置 MUST 保存到当前插件专属的本机未加密存储，MUST NOT 声称使用操作系统钥匙串或加密保险库。设置界面 MUST 清楚说明保存方式，并对凭据输入采用掩码显示。凭据 MUST NOT 写入日志、诊断、可见错误、包产物或提交内容；错误显示 MUST NOT 直接暴露请求头、签名、原始异常或第三方原始响应。插件 MUST NOT 持久化原文、译文或翻译历史。

#### Scenario: User views credential settings
- **WHEN** 用户查看或编辑 AK/SK
- **THEN** 凭据字段默认以掩码显示，设置说明明确指出本机未加密保存
- **THEN** 页面不将插件命名空间隔离描述为加密保护

#### Scenario: A request or configuration operation fails
- **WHEN** 包含凭据的请求或配置操作产生错误
- **THEN** 用户只看到已本地化的安全错误分类与允许的恢复操作
- **THEN** 日志、诊断和错误内容不包含凭据、签名、原文、译文或原始响应

#### Scenario: Plugin is reopened after a successful save
- **WHEN** 相同插件身份重新打开且其存储可用
- **THEN** 插件恢复已保存服务配置
- **THEN** 原文与译文仍为空，保存凭据不会同时保存翻译内容

### Requirement: Source and target languages MUST have distinct initialization and persistence rules

每次新打开页面时，源语言 MUST 默认为自动识别；用户 MUST 能手动选择支持的源语言，手动源语言 MUST 仅对当前页面有效且不持久化。目标语言 MUST 优先恢复已保存且有效的用户选择。没有已保存目标语言时，目标语言 MUST 按当前 Runtime 首次就绪 Host Context 的界面语言初始化为 `en-US → en`、`zh-CN → zh`；该推导默认值 MUST NOT 自动写入存储。

用户显式选择目标语言 MUST 自动发起持久保存，不要求另按保存按钮；只有保存成功后该选择才 MUST 成为有效目标语言并使旧语向结果失效，后续页面 MUST 优先恢复该选择。保存失败 MUST 保留上一有效选择；上一选择仅为推导默认值时 MUST 保留该默认值，不宣称用户选择已保存。提交结果不明 MUST 遵循配置重读核对契约。

当前页面运行期间 Host 界面语言变化 MUST 仅改变界面文案和相应控件本地化，MUST NOT 改变当前目标语言或触发翻译。下次新打开页面且仍没有已保存目标语言时，MUST 按该次首次就绪 Host Context 重新推导默认值。存储读取晚于后续 Context 事件时，未保存目标语言的推导 MUST 仍使用该页面首次就绪 Context。已保存但当前不受支持的语言 MUST 显示配置问题，MUST NOT 静默替换用户选择。

#### Scenario: First open follows the initial Host language
- **WHEN** 没有已保存目标语言且首次就绪 Host Context 为 `zh-CN`
- **THEN** 源语言为自动识别，目标语言为 `zh`
- **THEN** 插件不因应用该默认值而写入存储；`en-US` 情况对应默认 `en`

#### Scenario: User returns with a saved target language
- **WHEN** 用户此前成功保存了支持的目标语言，并再次打开页面
- **THEN** 插件恢复该目标语言且不受本次 Host 界面语言覆盖
- **THEN** 源语言重新初始化为自动识别

#### Scenario: User selects a new target language
- **WHEN** 用户通过下拉选择新的有效目标语言
- **THEN** 插件自动保存该选择，并在成功后采用新目标语言及重新调度当前文本
- **THEN** 若保存失败，上一有效选择保留且页面提示失败，不使用未确认语向请求

#### Scenario: Host locale changes during a page lifetime
- **WHEN** Host Context 的界面语言在页面打开后变化
- **THEN** 页面文案和语言选项名称更新，源语言与目标语言值保持不变
- **THEN** 插件不为此产生翻译请求或默认目标语言存储写入

#### Scenario: A later page has no persisted target
- **WHEN** 上一次页面只使用推导默认值、未保存用户选择，而新页面首次就绪 Context 的语言不同
- **THEN** 新页面按新的 Context 推导目标语言
- **THEN** 先前页面的推导默认值不作为持久用户选择恢复

#### Scenario: A saved language is unsupported
- **WHEN** 已保存的目标语言不在当前受支持集合中
- **THEN** 页面提示用户重新选择目标语言，并阻止无效语向请求
- **THEN** 插件不静默改为中文、英文或其他默认语言

#### Scenario: User repairs only an unsupported saved target
- **WHEN** 配置版本已知、其余字段合法且用户显式选择有效目标语言修复旧目标
- **THEN** 插件保留已验证服务与凭据，持久化修复记录并在确认后恢复翻译
- **THEN** 保存失败仍保留旧记录和受阻状态，不静默覆盖凭据或假装修复成功

### Requirement: Language choices MUST respect the provider language and direction contract

插件发布版本内置的语言集合 MUST 与该版本核对的火山引擎官方文本翻译支持表一致，维护文档 MUST 记录快照来源、日期和校核结果。源语言选择 MUST 包含自动识别；目标语言 MUST 不包含自动识别。`sk` MUST 仅作为目标语言；`bo`、`nan`、`wuu`、`yue`、`cmn`、`ug` MUST 仅作为源语言且仅允许翻译到 `zh`。显式无效语向 MUST 在请求前提示用户，MUST NOT 静默改写所选语言。

自动识别时无法预先确定的受限语向 MUST 由服务结果判定；收到 `-415` 时 MUST 显示不支持当前语向的本地化提示并允许用户修改语言，MUST NOT 自动换语言、再次计费调用或把失败当作成功译文。

#### Scenario: User chooses a directionally restricted source
- **WHEN** 用户选择 `bo`、`nan`、`wuu`、`yue`、`cmn` 或 `ug` 为源语言而目标语言不是 `zh`
- **THEN** 插件提示当前语向不受支持并阻止请求
- **THEN** 已选择的目标语言不被静默改为 `zh`

#### Scenario: User inspects source and target choices
- **WHEN** 用户展开源语言或目标语言选择
- **THEN** `sk` 仅出现在目标语言中，自动识别仅出现在源语言中
- **THEN** 只支持作为源语言的六种语言不出现在目标语言中

#### Scenario: Automatic detection returns an unsupported direction
- **WHEN** 自动识别请求收到服务错误 `-415`
- **THEN** 插件显示语向不支持错误，并允许用户调整源语言或目标语言后重新翻译
- **THEN** 插件不自动尝试其他语向或显示上一次译文为本次结果

### Requirement: Input changes MUST trigger debounced translation without composition requests

满足配置与语言条件且设置面板关闭时，原文变化 MUST 在最后一次有效编辑停止 400ms 后调度翻译。输入法组合输入进行期间 MUST NOT 提交翻译；组合输入结束后 MUST 基于最终提交文本重新计时。值未发生变化的重复输入事件 MUST NOT 创建新请求。空字符串或仅包含空白的原文 MUST 清空译文和请求相关反馈，取消等待与进行中工作，并且 MUST NOT 发起请求；非空白原文 MUST 保留其空格与换行，不得为请求静默修剪。

#### Scenario: User types continuously
- **WHEN** 用户在每次编辑间隔小于 400ms 的情况下连续输入
- **THEN** 插件不为中间文本发送请求
- **THEN** 最后一次有效编辑后满 400ms 时仅调度最终文本

#### Scenario: User enters text with an input method
- **WHEN** 输入法组合输入尚未结束，即使等待超过 400ms
- **THEN** 插件不请求组合输入草稿
- **THEN** 组合输入结束后按最终文本重新等待 400ms

#### Scenario: Input event repeats the same value
- **WHEN** 重复输入事件没有改变当前原文
- **THEN** 现有成功结果或当前请求状态保持一致
- **THEN** 插件不创建重复请求

#### Scenario: User clears the input
- **WHEN** 用户将原文清空或改为仅空白
- **THEN** 译文及旧请求反馈清空，等待或进行中工作取消
- **THEN** 晚到结果不能恢复已清空的译文

### Requirement: Each request MUST enforce a bounded unsplit text input

输入 MUST 先按空白契约判断；纯空白文本即使超过 5000 个字符也 MUST 进入空状态且不请求。单次翻译的非空白原文 MUST 不超过 5000 个 Unicode code points。超过限制时，插件 MUST 保留完整可编辑原文并显示本地化超限反馈，MUST NOT 发起请求、静默截断或自动拆分。回到限制以内且满足其他条件后 MUST 恢复正常调度。计数 MUST NOT 将一个 Unicode code point 的 UTF-16 代理对算作两个字符；组合字符序列中的各 code point MUST 分别计数。

#### Scenario: Input reaches the exact limit
- **WHEN** 非空原文恰好包含 5000 个 Unicode code points 且其他条件有效
- **THEN** 原文可以作为单条文本提交
- **THEN** 代理对字符不会被重复计数或拆开

#### Scenario: Input exceeds the limit
- **WHEN** 非空白原文包含 5001 个或更多 Unicode code points
- **THEN** 插件保留完整原文并显示超限提示，不发送请求
- **THEN** 插件不截断、拆分或保留旧译文为当前结果

#### Scenario: User reduces an oversized input
- **WHEN** 用户将超限原文编辑回 5000 个 Unicode code points 以内
- **THEN** 超限阻塞解除，并按正常 400ms 防抖条件调度当前文本

### Requirement: Results MUST match the latest request conditions and Runtime attempt

只有与当前原文、源语言、目标语言、服务、已确认配置修订和 Runtime attempt 全部一致的最新请求结果，才 MUST 更新译文或请求错误状态。上述任一条件变化时，插件 MUST 立即使旧工作失效并清空不再匹配的旧译文；取消不可阻止晚到响应时，仍 MUST 丢弃该响应。过期请求的成功、失败、超时或结束回调 MUST NOT 覆盖当前结果、错误或加载状态。

请求配置修订 MUST 只随影响请求的配置内容实际变化而改变。保存未改变的配置或将当前推导目标保存为同一语言时，MUST NOT 仅因持久化确认而使成功译文失效或再次请求。

#### Scenario: Earlier request finishes after a newer request
- **WHEN** 原文 A 的请求晚于原文 B 的最新请求完成
- **THEN** 页面仅显示当前原文 B 对应结果
- **THEN** A 的结果或错误不会改变 B 的译文或加载状态

#### Scenario: Language or confirmed service configuration changes
- **WHEN** 用户更改有效语言或保存成功的服务配置实际改变了请求条件
- **THEN** 旧译文立即失效且旧请求不能再更新页面
- **THEN** 后续请求与显示结果均绑定新的当前条件

#### Scenario: User saves unchanged request conditions
- **WHEN** 配置保存成功但有效请求条件未变，或用户将当前推导目标保存为同一语言
- **THEN** 当前成功译文保持有效，不因该次持久化确认重新翻译
- **THEN** 新的持久状态仍可供下次页面恢复

#### Scenario: Cancellation cannot stop remote processing
- **WHEN** 取消后的请求仍返回成功或失败
- **THEN** 插件丢弃该结果
- **THEN** 页面不将本地取消描述为已经撤回第三方处理或费用

### Requirement: Volcengine requests MUST follow the documented translation contract

第一版 MUST 通过 HTTPS 向 `https://translate.volcengineapi.com/` 以 `POST` 调用 `Action=TranslateText`、`Version=2020-06-01`，签名区域为 `cn-north-1`、服务为 `translate`。请求 MUST 使用当前已确认 AK/SK 生成符合官方签名契约的鉴权，并保持签名内容与实际发送的路径、查询、请求头和 JSON 正文一致。请求 MUST 通过公共 SDK `http.request` 委托受控 Rust Host 传输，不共享 Cookie 或系统凭据、不重定向、不自动重试，服务地址 MUST 固定；插件 MUST NOT 提供自定义 endpoint 或加载远程脚本。翻译业务、AK/SK 配置、签名和服务响应校验 MUST 留在插件内；Host MUST 只执行通用 HTTP，不包含火山特例、签名或翻译规则。插件 MUST NOT 调用私有 Tauri 通道或 Node Runtime，也 MUST NOT 回退 WebView fetch。页面 MUST 以简明说明告知用户原文会发送至所选服务，MUST NOT 为普通网络请求新增 Host 权限弹窗。

请求正文的 `TextList` MUST 恰好包含一条完整原文，`TargetLanguage` MUST 为当前目标语言。源语言为自动识别时 MUST 省略 `SourceLanguage`；手动选择时 MUST 提交对应语言代码。请求 MUST NOT 自动追加术语库、模型、其他翻译服务或未由当前界面配置的业务选项。

#### Scenario: Automatic source detection request
- **WHEN** 当前源语言为自动识别并提交有效文本
- **THEN** 请求包含单条完整 `TextList` 和当前 `TargetLanguage`，省略 `SourceLanguage`
- **THEN** 原文的有效前后空格和换行保持不变

#### Scenario: Explicit source language request
- **WHEN** 用户选择支持的显式源语言并提交文本
- **THEN** 请求携带该 `SourceLanguage` 与当前目标语言
- **THEN** 请求使用规定 endpoint、Action、Version、区域和服务签名

#### Scenario: Signed request cannot be formed
- **WHEN** 当前凭据无效或无法生成符合契约的签名请求
- **THEN** 插件显示安全错误并停止该次请求
- **THEN** 插件不发送未签名替代请求、不降级为明文 HTTP，也不调用私有 Host 通道

#### Scenario: Host HTTP capability is absent
- **WHEN** 当前 Host 版本或 Context 不提供 `http.request`
- **THEN** 插件显示需要升级 Host 或 HTTP 能力不可用的本地化提示，保留原文
- **THEN** 插件不发起直接 fetch、私有 native 请求或备用服务调用

#### Scenario: Browser CORS headers are absent from a service response
- **WHEN** 受控 Host HTTP 返回合法有界 HTTP 响应但该响应没有跨域允许头
- **THEN** 插件仍按真实状态与正文执行既有服务错误和译文校验
- **THEN** 不关闭 WebView 安全策略，不修改当前页面 Origin

### Requirement: Response handling MUST distinguish service errors from valid translated text

插件 MUST 在呈现译文之前检查 HTTP 结果、响应大小、JSON 结构和 `ResponseMetadata.Error`。非 2xx 响应也 MUST 在同一大小边界内读取并尝试解析服务错误，MUST NOT 仅因 HTTP 失败提前丢弃可解析的厂商错误分类。即使 HTTP 状态为 200，只要 `ResponseMetadata.Error` 存在有效服务错误，MUST 按失败处理。已知 `Code` 或整数 `CodeN` MUST 用于安全分类，包含 `InvalidAccessKey`、`InvalidCredential` 和 `100009`；无法识别时保持服务错误兜底，不显示原始 Message。成功响应 MUST 同时满足成功 HTTP 状态、没有服务错误、`TranslationList` 恰有一个有效条目且该条目的 `Translation` 为字符串；响应缺失、形状错误、条目数不符或译文类型错误 MUST 成为可恢复响应错误，MUST NOT 显示部分、猜测或字符串化对象结果。

读取的响应正文 MUST 限制在 1 MiB 以内；超过上限 MUST 终止处理并显示安全错误。第三方原始错误消息、HTML 和原始响应 MUST NOT 直接进入用户反馈。`RequestId` 只有在长度为 1–128 个 ASCII 字符且匹配 `[A-Za-z0-9._:-]+` 时才 MUST 允许展示，其他服务字段 MUST NOT 被当作可显示诊断直接透传。

#### Scenario: Service returns HTTP 200 with an error
- **WHEN** HTTP 200 响应包含 `ResponseMetadata.Error`
- **THEN** 插件显示相应本地化失败分类
- **THEN** 响应不作为成功译文呈现

#### Scenario: Service returns a non-success HTTP status with a bounded error
- **WHEN** 非 2xx 响应含大小限制内且可解析的 `ResponseMetadata.Error`
- **THEN** 插件使用该服务错误进行本地化分类而不只显示通用 HTTP 失败
- **THEN** HTTP 失败正文仍受相同大小、结构和安全显示限制

#### Scenario: Successful response contains one valid translation
- **WHEN** 当前请求收到无服务错误且符合单条输入响应契约的译文
- **THEN** 下方文本框显示该字符串译文，并结束当前加载状态
- **THEN** 响应中的其他字段不混入译文

#### Scenario: Response is malformed or oversized
- **WHEN** 响应不是有效 JSON、结构不符、缺少有效译文、条目数不符或正文超过 1 MiB
- **THEN** 插件拒绝该响应并显示可恢复错误
- **THEN** 页面不显示响应原文、部分解析值或旧译文为当前结果

#### Scenario: Error response includes unsafe diagnostic data
- **WHEN** 服务错误包含原始消息、HTML、凭据样式内容或不满足安全约束的 RequestId
- **THEN** 插件显示产品拥有的本地化错误文案并忽略不安全诊断字段
- **THEN** 页面不直接渲染或记录第三方原始错误内容

### Requirement: Failures MUST have bounded deadlines and explicit retry

每次实际翻译请求 MUST 使用 15 秒总截止时间，覆盖插件签名、SDK 往返、原生网络请求与响应读取处理；HTTP timeout MUST 使用剩余期限，取消 MUST 传到 Host provider；截止后 MUST 终止本地等待并显示超时反馈。插件 MUST 为网络不可用、超时、鉴权或签名失败、服务未开通或账户状态、限流或配额、参数或语向不支持、响应无效及未知服务错误提供安全的本地化分类或兜底。Host 传输失败时 MUST 根据安全错误显示网络、超时、限制或不可用反馈，MUST NOT 把原生网络失败描述为浏览器 CORS。

任何请求失败 MUST NOT 自动重试、自动换服务或自动换语言。用户 MUST 能对仍有效的当前输入显式重试；重复激活重试 MUST NOT 创建并行重复请求。等待、进行中、成功、配置阻塞、输入阻塞和失败状态 MUST 可区分，且失败 MUST 保留原文供编辑。

#### Scenario: Request deadline expires
- **WHEN** 当前翻译请求在 15 秒内未完成有效响应处理
- **THEN** 插件结束等待并显示超时和显式重试入口
- **THEN** 截止后的成功或失败不能再覆盖页面

#### Scenario: Service rate-limits the request
- **WHEN** 服务返回限流或配额相关错误
- **THEN** 插件显示对应本地化反馈并保留原文
- **THEN** 插件不进行自动重试或替代服务调用

#### Scenario: User retries a failed current input
- **WHEN** 用户显式重试且原文、配置和语向仍然有效
- **THEN** 插件为当前条件创建一次新的请求
- **THEN** 重试进行中重复激活入口不产生并行重复调用

#### Scenario: User corrects a blocking error
- **WHEN** 用户修正无效配置、语向或原文并满足翻译条件
- **THEN** 插件可以按正常输入调度规则处理新的当前条件
- **THEN** 旧失败不作为新请求结果继续展示

### Requirement: Locale theme and keyboard behavior MUST remain consistent

所有可见文案、设置说明、状态、错误、语言选项名称和可访问名称 MUST 支持英文与简体中文，并跟随当前 Host Context；界面 MUST 支持明暗主题。Host locale 或 theme 更新 MUST NOT 改动翻译条件、重新发送翻译请求或覆盖用户文本与已选语言。

输入、语言选择、设置、保存、取消和重试 MUST 可仅通过键盘操作，且提供可见焦点。打开设置 MUST 将焦点置于面板内合理的可操作位置，关闭或取消 MUST 返回仍存在的触发控件。设置面板中的 Escape MUST 优先关闭面板，输入法正在使用的按键 MUST 保留其默认处理。加载与错误 MUST 通过文本和可访问语义表达，MUST NOT 只依赖颜色或图标；输入法组合操作 MUST 不被快捷键或面板交互误提交为翻译。

#### Scenario: User changes Host locale and theme
- **WHEN** 当前页面收到新的界面语言或主题 Context
- **THEN** 控件文案、可访问名称和主题同步更新
- **THEN** 当前原文、译文、语言值和请求条件保持不变，不产生额外服务调用

#### Scenario: Keyboard user configures the service
- **WHEN** 用户仅使用键盘打开设置、编辑字段并保存或取消
- **THEN** 每项操作均可到达且焦点可见
- **THEN** 面板关闭后焦点返回仍存在的设置触发控件，原文保持不变

#### Scenario: A loading or failure state is presented
- **WHEN** 插件处于等待、请求中、配置错误、输入错误或请求失败状态
- **THEN** 用户和辅助技术能够从标签、文本和状态语义区分状态
- **THEN** 状态含义不依赖仅有的颜色或图标

### Requirement: Runtime lifecycle MUST bound all translation work and page memory

临时隐藏 Launcher 后恢复同一当前 Runtime 时，插件 MUST 保留当前文本、语言、设置草稿及请求状态，并遵循既有 Host 连续性行为；隐藏本身 MUST NOT 被当作关闭或再次打开，不得为恢复显示重复请求。

页面关闭、导航离开、禁用、卸载、替换、开发重载、Runtime 终止或 SDK 重建时，插件 MUST 取消防抖、请求、截止计时及订阅，并使全部旧回调失效。新的 Runtime attempt MUST 使用新上下文重新加载持久配置，以空原文与空译文开始，MUST NOT 恢复上一个 attempt 的内容、错误或请求。页面离开后 MUST NOT 继续后台翻译。

#### Scenario: Launcher is hidden and restored
- **WHEN** Launcher 临时隐藏后恢复，Host 确认仍为同一当前 Runtime
- **THEN** 当前原文、译文、语言及设置状态保留
- **THEN** 恢复显示不会单独触发重复翻译

#### Scenario: Page closes while a request is pending
- **WHEN** 页面关闭或 Runtime 终止时存在防抖等待或请求
- **THEN** 插件取消本地工作并使回调失效
- **THEN** 离开后不继续后台调度，晚到结果不进入任何新页面

#### Scenario: Plugin is replaced or SDK is recreated
- **WHEN** 插件替换、重载或 SDK 重建形成新的 Runtime attempt
- **THEN** 新 attempt 重新获取上下文和持久配置，并从空原文、空译文开始
- **THEN** 旧 attempt 的请求结果、错误与内存内容不可恢复为当前状态

### Requirement: Delivery MUST use deterministic validation and self-contained plugin artifacts

插件交付 MUST 包含确定性证据，覆盖文本与语言行为、配置与凭据保存语义、请求签名、服务成功与失败、取消与晚到、时间边界、双语主题、键盘焦点及 Runtime 结束。服务与存储错误路径 MUST 能在不使用真实凭据或真实翻译请求的情况下验证；签名正确性 MUST 使用可复现的固定输入与期望结果验证。

构建产物 MUST 自包含且满足当前公共插件包契约，MUST 可通过纯 CLI 验证、打包和检查，并进入现有直接插件生命周期与 CI。维护验收 MUST NOT 启动浏览器、真实 WebView、GUI 或原生交互 harness，MUST NOT 把截图、像素基线、真实付费服务或目标环境性能结果作为 Gate。确定性验证通过 MUST NOT 被描述为已验证真实账户翻译、实际 WebView 网络或操作系统复制行为。

#### Scenario: Deterministic behavior validation runs
- **WHEN** 插件验证使用受控时间、服务与存储响应覆盖成功、失败和生命周期条件
- **THEN** 可验证当前结果一致性、凭据边界与用户可观察行为而不调用真实翻译服务
- **THEN** 签名结果与固定期望值一致

#### Scenario: Plugin package is built and checked
- **WHEN** 直接插件 CI 执行插件生命周期及纯 CLI 产物检查
- **THEN** 插件产物满足自包含、公共接口、包结构和可重复打包要求
- **THEN** 验证不依赖 Host 私有导入、Node 浏览器垫片、真实 GUI 或第三方密钥

#### Scenario: Delivery evidence is reported
- **WHEN** 确定性测试、静态检查、构建和包检查全部通过
- **THEN** 报告明确限定已验证范围
- **THEN** 未执行的真实账户、真实 WebView 与原生复制验证不被宣称为通过
