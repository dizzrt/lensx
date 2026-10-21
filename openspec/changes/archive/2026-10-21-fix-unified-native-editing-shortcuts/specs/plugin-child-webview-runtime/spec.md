# Spec Delta

## MODIFIED Requirements

### Requirement: Child WebView delivery MUST pass deterministic security and lifecycle validation

交付 MUST 结合 Rust unit／integration tests、TypeScript controller／state tests、React accessibility／localization／theme tests、canonical normal／malicious packages、公共 package 边界检查、构建和确定性产物检查。覆盖 MUST 包含 create intent、navigation policy、bridge／SDK readiness state、bounds、focus intent、hide／restore 复用、close、replacement、disable、uninstall、failure、destroy、迟到事件失效，以及零次 generic Tauri authority 命中。

编辑快捷键验证 MUST 分别覆盖生产原生分派策略、实际构建使用的适配接线及依赖路径、真实控件／编辑器的 DOM 编辑事件处理与内容结果。策略层 MUST 验证原生焦点所有权、目标有效性、原始事件与修饰键、分派顺序、单次处理、Web 已处理／取消默认行为、pending 与合法完成／回流、已确认未处理传播、原生编辑命令结果及 Host 保留命令。一个 superclass fake 的同步返回值或调用次数 MUST NOT 替代最终 Web 处理、菜单／响应链行为与编辑结果验证；少量源码字符串匹配 MUST NOT 替代生产策略行为测试。

确定性 DOM 层 MUST 覆盖 Host 普通输入、外部插件 `input`／`textarea`／`contenteditable`、Monaco 正文及 Find 查询的当前选区、copy／cut 输出、外部文本 paste 输入、内容变更、Undo／Redo、焦点切换、只读／禁用与空状态，以及失败后的恢复。测试可使用明确标注的原生适配 fake、DOM 默认编辑原语模型和内存 ClipboardEvent 数据，但 MUST 区分这些边界与真实控件／编辑器逻辑。插件内部剪贴板 service 的写读往返 MUST NOT 代替跨应用文本剪贴板交付的证据；仅验证没有访问剪贴板 MUST NOT 被描述为用户复制粘贴成功。

`Cmd+A/C/X/V/Z` 与 `Cmd+Shift+Z` MUST 作为验收样本，不能要求生产实现按这些 key-code 建立白名单。验证 MUST 覆盖相同命令在当前合法目标中只执行一次、在旧／隐藏／失焦／无效目标上不执行，以及标准命令与页面自有快捷键互不重复。检查 MUST 验证生产适配器确实使用受测策略及锁定的实际依赖路径；编译证据与行为证据 MUST 分开记录。

上述检查 MUST NOT 启动真实 WebView、GUI、原生交互 harness 或浏览器，MUST NOT 声称证明真实 macOS 按键投递、系统剪贴板往返、真实 teardown 或目标环境性能。确定性样本的模拟事件、fixture 文本与局部状态结果 MUST 明确标注其证据范围，不得用“端到端通过”掩盖尚未验证的原生分派环节。

#### Scenario: Deterministic Child WebView matrix passes

- **WHEN** 维护中的 Rust、TypeScript、React、package 和 malicious-fixture 检查执行
- **THEN** 生命周期、source authority、清理、快捷键焦点策略、单次编辑结果及公私边界通过各自层面的断言
- **THEN** 所有插件共享规定的 Runtime 路径，结果明确限于确定性证据，不声称实际原生按键或剪贴板交付

#### Scenario: Environment-only validation remains

- **WHEN** 维护中的 Gate 或脚本启动真实 Child WebView、驱动原生交互、测量目标时延，或读写环境验收产物
- **THEN** validation governance 失败
- **THEN** 对应入口和资产被删除，不保留 optional、manual 或 compatibility 验证路径

#### Scenario: Keyboard policy is exercised without native interaction

- **WHEN** fake native responders 对生产策略执行 focused、hidden、replaced、absent-target 和 Host 保留命令场景
- **THEN** 决策、分派顺序、调用次数、已处理／未处理结果及回退传播均可验证，编译与接线检查确认生产使用该策略
- **THEN** modeled 结果不被描述为真实 macOS 按键测量，也不因单个 handler 返回成功就宣称目标文本已经编辑

#### Scenario: DOM clipboard events verify actual editing logic

- **WHEN** 确定性 fixture 向真实控件／编辑器事件处理路径提供明确的选区、copy／cut 事件或来自外部的 paste 文本
- **THEN** 断言实际输出文本、目标内容、输入通知、撤销／重做及当前焦点，不只断言事件或 service 被调用
- **THEN** fixture 的内存数据和任何模拟默认行为均被标明，结果不等同于 OS 将真实按键转换为 ClipboardEvent 的证明

#### Scenario: An earlier handling stage must prevent duplicate editing

- **WHEN** Web 目标已处理或取消默认行为，或者原生编辑分支已完成命令，而另一候选路径仍可能观察该事件
- **THEN** 生产分派策略测试证明后续路径不重复执行命令，粘贴／剪切／撤销结果只变化一次
- **THEN** 未处理或无效目标的负例仍证明事件可继续传播且不会错误编辑旧页面

#### Scenario: Asynchronous handling and native redispatch retain one gesture

- **WHEN** 生产策略的确定性用例模拟原生接管后仍 pending、最终 Web 已处理、最终确认未处理回流，以及回流前切换焦点／目标失效／Child 换代
- **THEN** pending 不提前触发菜单，合法回流不被重复计为用户手势，只有确认未处理且目标仍有效才继续适用原生命令
- **THEN** 修复层延迟补偿关联原事件目标，切换焦点或换代后被取消而不改投新目标；用例覆盖编辑次数与目标状态，但不将模拟完成结果描述为真实 WebKit 时序证据

### Requirement: Child WebView MUST deliver editing shortcuts according to native focus

在 macOS 上，拥有原生文本焦点且当前有效、可见的插件 Child WebView MUST 获得普通 Web 编辑快捷键，使页面已有的 Select All、Find、Cut、Copy、Paste、Undo、Redo 与编辑行为按该页面规则工作。标准编辑命令 MUST 遵循 `launcher-window-lifecycle` 的 Host／Child 统一原生交付契约，并产生当前文本目标支持的实际选区、剪贴板或内容结果。Find、格式化等页面业务命令仍由插件定义。官方、外部和 Development Mode 插件 MUST 共享该行为，不能按插件身份、Publisher、仓库位置、Monaco 使用情况、页面索引或插件上报焦点设置例外。

交付 MUST 保留原始原生事件、修饰键和单次处理语义。当前有效目标 MUST 从原生焦点及现有 Window／WebView 归属确定；失焦、隐藏、脱离、已销毁、已替换或无法确认有效的 Child MUST NOT 消费事件、重获焦点、重新显示，或影响 Host 输入与其他原生 view。Web 文档已处理或取消默认行为时 MUST NOT 再补做标准编辑命令；最终确认未处理的事件 MUST 按原生菜单与当前响应链语义继续，可用命令最多执行一次，仍未处理的事件继续传播。统一标准编辑链可以修复 Host 等非 Child 输入的同类行为，但其他非 Child 行为 MUST 保持不变。

原生接管与 Web 最终处理状态 MUST 区分。处理仍 pending 时 MUST 保留原生完成及合法未处理回流，MUST NOT 根据同步接管返回值立即执行额外菜单命令。合法 WebKit 回流 MUST NOT 被视为新的用户手势；修复层 MUST NOT 额外合成或重投该键盘事件。若修复引入延迟补偿，MUST 将其关联到原手势最初的 Window、文本目标与 Child 代次并在执行前重新验证；期间切换焦点、目标失效或代次变化时 MUST 取消该事件自有补偿，不能读取新的 first responder 把旧事件改投新目标。WebKit 自身的合法回流 MUST 保留既有机制。

既有合规外部插件的 `input`／`textarea`／`contenteditable` 和编辑器输入 MUST 无需 Host 源码特判、SDK 更新或新增权限即可使用标准编辑。正文与 Find 查询 MUST 分别按当前焦点处理选区、复制、剪切、粘贴、撤销和重做，不能将一个目标的操作应用到另一个目标。只读、禁用、空选区、空剪贴板及无可撤销／重做记录 MUST 沿用各自控件语义，不强制清空剪贴板或合成内容修改。输入、焦点与有效代次恢复后，正常编辑 MUST 可以继续。

Host 保留的应用命令 `Cmd+W/Q` MUST 继续遵循 `launcher-window-lifecycle`：仅前台 lensX 分别单次执行可恢复 Hide 和完整 Quit。它们 MUST NOT 成为全局快捷键或被插件覆盖。编辑交付 MUST NOT 新增 Host API、SDK method、插件权限、generic Tauri capability、可控原生句柄、注入脚本、DOM／页面索引定位、`eval` 或合成键盘通道，也 MUST NOT 按逐插件或逐 key-code 的生产白名单完成标准编辑。`Cmd+A/C/X/V/Z` 与 `Cmd+Shift+Z` 是验收样本，不改变这些边界。

#### Scenario: Current focused plugin receives editing shortcuts

- **WHEN** 当前可见 Child 内的文本输入拥有有效原生焦点，用户调用编辑快捷键
- **THEN** 原始事件及修饰键按页面和原生标准编辑语义处理一次，当前文本目标得到对应的选区、剪贴板或内容结果
- **THEN** 外部、开发和官方插件共享同一规则，没有插件专属 Host 快捷键映射或 SDK 适配要求

#### Scenario: Host or another native input owns focus

- **WHEN** Host 搜索、另一原生 view 或 Window 外目标拥有焦点
- **THEN** 失焦 Child 不消费、不重发该事件，也不抢回焦点
- **THEN** Host 普通输入由统一原生编辑链处理其标准命令，其他目标保留所属输入行为，无关的非 Child 行为不变

#### Scenario: Hidden or replaced plugin cannot consume late input

- **WHEN** Child 隐藏、脱离、销毁、被替换，或无法确认它仍为原生焦点所有者
- **THEN** 迟到事件不能执行旧 Page 的编辑命令、恢复旧焦点或显示旧 Child
- **THEN** 新 Page 或 Host 输入状态不受影响，后续命令只作用于仍有效的当前目标

#### Scenario: Native handled result is preserved

- **WHEN** 有效目标的原生处理路径最终确认已处理或未处理
- **THEN** 已处理结果终止对应编辑的后续候选路径，修复层不为 Page 或菜单额外合成／重投相同事件，也不重复执行命令
- **THEN** 确认未处理的结果保留合法回流并继续原生菜单与当前响应链传播；适用标准命令最多执行一次，没有可用处理者时继续保持未处理语义

#### Scenario: Native handling remains pending before the Web result

- **WHEN** Child 原生处理已接管事件但 Web 尚未完成，之后产生合法的完成或未处理回流
- **THEN** 同步接管不触发提前菜单或默认编辑，最终已处理／取消默认行为不触发第二次命令
- **THEN** 仅最终确认未处理才继续适用的原生编辑链；修复层延迟补偿只关联原 Window／文本目标／Child 代次，切换焦点或换代后取消，不改投新的 first responder
- **THEN** WebKit 自身合法回流保持既有机制且仍属于原手势，旧 Child 失效后不能重新获得编辑权或焦点

#### Scenario: Application close and quit keep their reserved meaning

- **WHEN** lensX 位于前台、用户正在当前插件中编辑，并按下 `Cmd+W` 或 `Cmd+Q`
- **THEN** 现有 Hide 或 Quit 分别只执行一次，并完成相应 Child 生命周期处理
- **THEN** 当其他应用位于前台时 lensX 不消费这些组合键

#### Scenario: Ordinary external controls use the same standard editing contract

- **WHEN** 合规外部插件的 `input`、`textarea` 或 `contenteditable` 依次成为当前原生文本焦点
- **THEN** 标准选择、复制、剪切、粘贴、撤销和重做按各控件的能力与状态执行，无需插件专属平台代码
- **THEN** 只读、禁用、空状态和输入恢复保持控件原有语义，插件不获得后台剪贴板访问、Host DOM 或原生权限

#### Scenario: Monaco body and Find query keep separate editing targets

- **WHEN** 当前焦点在 Monaco 正文与 Find 查询之间切换，并调用标准编辑命令
- **THEN** 选区与编辑仅作用于当前文本目标，正文与查询不互相全选、粘贴或撤销
- **THEN** Find 开关、页面业务命令、原有 model／undo 生命周期及 Host 输入保持各自归属

#### Scenario: Page-specific handling does not trigger a second standard command

- **WHEN** 当前插件按自身输入规则处理事件或取消其默认行为
- **THEN** Host 不强制执行同一手势对应的标准编辑命令，也不重复修改内容或剪贴板
- **THEN** 其他未处理事件仍可进入统一原生编辑链，插件不需要逐键向 Host 注册处理结果
