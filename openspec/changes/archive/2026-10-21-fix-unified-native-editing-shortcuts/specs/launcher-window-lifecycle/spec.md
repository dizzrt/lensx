# Spec Delta

## ADDED Requirements

### Requirement: Accessory Launcher MUST deliver standard editing commands through the current native focus

在 macOS 上，前台 lensX 的 Accessory Launcher MUST 通过 Host 与 Child 共用的原生编辑分派边界，让当前有效文本焦点按照目标控件及原生编辑命令语义处理 Select All、Copy、Cut、Paste、Undo 和 Redo。该行为 MUST 覆盖 Host 搜索框与其他普通输入、外部插件的 `input`／`textarea`／`contenteditable`，以及 Monaco 正文与 Find 输入框。用户主动复制／粘贴 MUST 能与其他应用交换文本，不能仅在插件私有内存中自写自读。插件业务命令仍由所属页面定义。

分派 MUST 保留原始事件、修饰键、当前原生焦点和单次执行语义。Web 文档已经处理事件或按其输入规则取消默认行为时，Host MUST NOT 再执行对应标准编辑命令；最终确认未处理时，MUST 继续原生菜单与当前响应链语义，对可用命令最多执行一次，无法处理的事件继续传播。修复层 MUST NOT 额外合成或重投同一个键盘事件、递归调用编辑链，或无条件补做一次 DOM 编辑；WebKit 合法的完成与未处理回流 MUST 保留，且 MUST NOT 被视为新的用户手势。

异步处理尚未完成时，Host MUST 保留原生完成与回流协议，MUST NOT 将原生接管的同步返回值解释为最终已处理或已确认未处理，也 MUST NOT 在调用 superclass 后立即无条件执行菜单命令。若修复引入延迟补偿，该补偿 MUST 关联原手势最初的 Window、文本目标及适用的 Child 代次，执行前 MUST 重新验证这些身份与原生焦点；期间切换焦点、目标失效或代次变化时 MUST 取消该事件自有补偿，不能读取新的 first responder 把旧事件改投新目标。WebKit 自身的合法回流 MUST 保留既有机制。

目标 MUST 在分派时仍属于当前有效 Window／WebView。隐藏、失焦、已移除、已替换或无法确认的目标 MUST NOT 消费事件、夺取焦点、重新显示或影响另一个输入目标。只读、禁用、空选区、空剪贴板和无可撤销内容 MUST 沿用对应控件与原生命令语义；分派层 MUST NOT 强制改写内容、清空剪贴板或构造虚假的成功编辑。后续焦点及输入恢复有效时，正常编辑 MUST 可以继续。

`Cmd+A/C/X/V/Z` 与 `Cmd+Shift+Z` MUST 作为标准编辑验收样本，而不是生产分派的 key-code 白名单。Host MUST NOT 按插件身份、Publisher、页面索引、DOM 结构／选择器或编辑器类型挑选补丁，也 MUST NOT 要求既有合规插件修改 lensX 源码、升级 SDK 或添加平台适配。修复 MUST NOT 注入脚本、调用 `eval`、产生合成键盘事件，或新增程序化 Host 剪贴板 API、插件权限、通用 Tauri 权限、原生句柄或全局编辑快捷键。

系统 MUST 保留 Accessory 策略、无 Dock tile、无普通可见应用菜单栏、默认全局唤起键及现有 Window 生命周期。`Cmd+W/Q` MUST 继续仅在前台 lensX 内分别单次执行可恢复 Hide 与完整 Quit；当其他应用位于前台时，lensX MUST NOT 拦截该应用的编辑、关闭或退出命令。标准编辑链修复 MUST NOT 改变无关的非编辑行为。

#### Scenario: Edit text in the Host without a visible application menu bar

- **WHEN** lensX 位于前台且 Host 搜索框或其他普通输入拥有有效原生焦点，用户调用标准编辑快捷键
- **THEN** Select All、Copy、Cut、Paste、Undo、Redo 按该输入的既有语义作用于当前选区、文本与撤销记录
- **THEN** 每个手势最多执行一次编辑，焦点保持，应用仍无 Dock tile 或普通可见菜单栏

#### Scenario: The same command follows the focused Child input

- **WHEN** 当前可见插件的 `input`、`textarea`、`contenteditable`、Monaco 正文或 Find 输入框获得原生焦点并接收标准编辑快捷键
- **THEN** 命令仅作用于当前文本目标；Find 查询编辑不选择或改写 Monaco 正文，Child 编辑不影响 Host 搜索框
- **THEN** 官方、外部和开发插件使用同一分派语义，无需插件专属 Host 映射或 SDK 变更

#### Scenario: Copy and paste exchange text with another application

- **WHEN** 用户从当前有效文本目标主动复制可复制选区并在另一应用粘贴，或从另一应用复制文本后回到 lensX 的有效可编辑目标粘贴
- **THEN** 操作按原生文本剪贴板语义交付用户选择的文本，每次粘贴只插入一次
- **THEN** 该行为不以插件内部缓存往返替代，也不授予插件后台读取剪贴板的能力

#### Scenario: Web content already handled or cancelled the event

- **WHEN** 当前 Web 文档已处理该键盘事件或按其编辑规则取消默认行为
- **THEN** Host 尊重该处理结果，不额外调用对应编辑命令、重复复制／粘贴或再次修改撤销记录
- **THEN** 页面原有业务快捷键、输入及组合输入语义保持有效

#### Scenario: An unhandled event continues through native editing semantics

- **WHEN** 已确认当前目标未处理事件，且原生菜单与当前响应链提供适用的标准编辑命令
- **THEN** 该命令最多执行一次并保留实际处理结果，修复层不额外合成或重投同一键盘事件
- **THEN** 没有可用处理者或命令无法处理时，事件继续原生传播，不被标记为成功编辑

#### Scenario: Pending native handling completes without duplicate editing

- **WHEN** 原生 WebView 先接管事件，Web 处理仍待完成，随后通过合法完成或未处理回流给出结果
- **THEN** 同步接管返回值不会触发提前菜单执行，合法回流不被当作新的用户手势
- **THEN** 最终已处理／取消默认行为不会再次编辑；仅最终确认未处理才继续原生菜单与响应链
- **THEN** 修复层的延迟补偿关联原 Window／目标／Child 代次；期间切换焦点或代次时取消该补偿，不编辑旧目标、恢复旧焦点或把旧操作转给新目标

#### Scenario: Read-only disabled or empty editing state retains native semantics

- **WHEN** 目标只读或禁用、选区为空、剪贴板为空，或没有可撤销／重做内容
- **THEN** 可执行操作及其结果由当前控件与原生命令决定，分派不强制改写文本或清空剪贴板
- **THEN** 用户恢复有效选区、可编辑内容或可用撤销记录后，可以继续正常编辑

#### Scenario: Focus changes or the previous target becomes invalid

- **WHEN** 焦点从 Host 切换到 Child、从正文切换到查询，或先前目标隐藏、移除、替换或离开当前 Window
- **THEN** 后续命令只使用仍有效的当前原生目标，不保留旧目标或将焦点强行切回
- **THEN** 无有效目标时不执行编辑、不显示隐藏窗口，也不恢复失效页面

#### Scenario: Reserved and background application commands retain their ownership

- **WHEN** lensX 位于前台时用户按 `Cmd+W/Q`，或在另一前台应用中使用编辑、关闭与退出快捷键
- **THEN** 前者沿用单次 Hide／Quit 及对应清理；后者不被 lensX 消费
- **THEN** 默认全局唤起键、恢复入口和其他非编辑 Window 行为保持既有契约

#### Scenario: Standard command coverage does not become a per-key or per-plugin patch

- **WHEN** 验收对不同原生文本目标使用 `Cmd+A/C/X/V/Z` 与 `Cmd+Shift+Z` 样本
- **THEN** 命令遵循统一的原生编辑语义，而不通过生产 key-code 白名单、插件身份、页面索引或 DOM 分支补发
- **THEN** 合规外部插件通过普通控件和公开 Runtime 获得该行为，无新增权限、Host API 或脚本注入
