# Tasks

本清单仅规划后续实施，所有任务初始未完成。第 1 组是生产路由修改的阻断前置条件；若不能确认具体断点及可用的完成／回流语义，保持对应任务未勾选并报告精确证据缺口，不进入第 2 组，不用 fake 成功或历史测试通过代替确认。当前提案不授权实现、启动应用、交互排障或系统剪贴板访问。

## 1. 确认原生分派断点与方案边界

- [x] 1.1 核实受影响运行构建、macOS/WebKit、Cargo 锁文件／patch 身份，分别追踪 Host 主 WebView 与普通 Child 的入口、窗口和 first responder；在本文件追加可复核的版本／路径／调用链记录，并区分运行事实、磁盘事实及用户报告，不直接沿用提案快照作为后来运行证据。
- [x] 1.2 按 design 的阶段清单定位事件停止的具体边：原生入口、W/Q monitor、Web 接管／最终处理、合法未处理回流、菜单匹配／验证、responder action 和对应 Web 编辑事件；比较 Host、普通外部控件、Monaco 正文／Find 及右键对照，提交能区分竞争解释的断点报告。只使用允许的现有证据；额外一次性运行排障先核实用户授权和项目规则，不增加 browser／GUI／真实 WebView／native harness 或兼容 Gate，不记录输入／剪贴板内容。证据不足时本项不得完成。
- [x] 1.3 确认适用于目标版本的“接管、仍待完成、最终已处理、最终未处理及回流”语义，列出可支持的共享修复位置和事件／原目标关联方式；用来源明确的接口与调用链证据说明为何同步 BOOL 不能替代最终结果，覆盖 Web preventDefault、正常原生命令、合法回流和等待期间切焦点，不能仅用不同版本上游实现推定目标行为。
- [x] 1.4 根据 1.1–1.3 冻结最小共享修复方案、生产修改路径及可回归的失败条件，重新核对并更新本 Change 的 design／tasks；明确首选正常菜单／responder 配置修正或有证据支持的通用默认分派候选及未采用方案。报告必须证明无需逐 key-code／逐插件适配，且能保留 Web 自定义处理、单次执行与 W/Q；范围或公开接口能力不满足约束时先修订规划，禁止直接试补生产路由。

## 2. 实现共享原生编辑分派及同组回归

- [x] 2.1 在第 1 组确定的共享边界实现标准编辑交付，复用既有菜单 accelerator／action 与真实 native focus；为实际生产策略增加先失败后通过的单元用例，证明标准命令不依赖 A/C/X/V/Z 新白名单、插件 ID、DOM selector、合成 JS 事件或新权限。策略测试必须调用生产代码，不维护平行的期望实现。
- [x] 2.2 将策略接到 Host 主 WebView 和当前 Child 的实际路径，验证 Web 已处理／取消默认行为不再执行默认编辑、pending 不提前菜单、最终未处理继续原生路径、原生命令只执行一次；以生产适配接线检查、真实依赖路径与 Cargo 编译补充策略测试，并分别记录证据边界。
- [x] 2.3 回归前台 W/Q 单次 Hide／Quit、全局唤起、事件修饰键、失焦／隐藏／脱离／旧 Child 和其他前台应用；如引入延迟补偿，测试关联原 Window／焦点目标／Child 代次，变化后取消且不改投新目标，保留 WebKit 自身合法回流。验证没有裸目标长期缓存、强制聚焦、重复监听、原生回流递归或窗口生命周期回归。
- [x] 2.4 同步 `docs/en/architecture/overview.md` 与 `plugin-child-webview-runtime.md` 及对应 `docs/zh/`，说明实际选定的交付边界、W/Q 与标准编辑分工、外部插件无需适配、异步处理与完成证据限制；对照最终代码与 2.1–2.3 测试复核语义、镜像与相对链接，不把未运行的平台行为写成已验收。

## 3. Host、普通外部插件与 Monaco 编辑语义回归

- [x] 3.1 在既有根 Rstest discovery 中增强 Host 搜索框和测试自有普通外部插件的 `input`／`textarea`／`contenteditable` 用例，覆盖标准组合键未被错误阻止、原生适配所选目标与实际控件状态相符；明确标注需要建模的 DOM 默认编辑原语，验证选择、copy／cut 输出、paste 输入和内容结果，禁止以手动 change 或空 handler 冒充系统默认动作。fixture 不进入生产 Host，不增加 SDK／Manifest 适配。
- [x] 3.2 在现有 ConfigLens Monaco 测试中通过实际编辑器的 copy／cut／paste handler 与测试 DataTransfer 验证选区文本、删除／插入、onInput 和 Undo／Redo；paste fixture 必须独立于 localClipboard 内存值。分别覆盖正文和 Find 查询的全选、剪贴板事件及撤销归属，保留 F／Escape／关闭焦点行为，明确合成事件不证明 OS 实际投递。
- [x] 3.3 完成跨目标矩阵：`Cmd+A/C/X/V/Z`、`Cmd+Shift+Z`、页面自定义已处理／未处理、只读／禁用、空选区、空剪贴板、空撤销栈、输入恢复、英文／中文与明／暗主题、组合输入及 Host↔Child／正文↔查询焦点变化。验证内容和编辑次数，而不只断言 keydown 被调用；样本键名不得转为生产分发表，控件各自的合法空状态语义保持。
- [x] 3.4 同步两语言 `development/frontend-guidelines.md` 与 `development/config-lens.md` 中受影响的键盘职责和验证边界，说明 Host 更新与插件业务命令的区别；验证既有外部插件无需改源码／重打包／更新 SDK 即可使用平台修正，不新增剪贴板权限。无需更新的具体段落也须记录检查依据；用 3.1–3.3 的实际结果校对文档而非扩大完成声明。

## 4. 原生依赖审阅与维护验证接入

- [x] 4.1 根据最终断点／修改路径确认是否触及 vendored Tao/Wry；若触及，审阅同版本上游差异，更新 reviewed paths、vendor 所有者说明、生产 policy runner／匹配 rustfmt 覆盖，并用既有策略测试验证实际改动。未触及则记录不适用依据，不改依赖版本或完整性基线；该条件任务不得借机引入新依赖。
- [x] 4.2 仅在 4.1 确认 vendor 源变动且审阅完成后显式执行 `pnpm run generate -- frame-aware-navigation-dependency-drift --write`，再运行只读 `pnpm run gate -- frame-aware-navigation-dependency-drift`，验证实际 Cargo 依赖图、完整性及格式／策略。未变更 vendor 时验证基线保持即可；Generate 与 Gate 分开记录，不让 Gate 写基线。
- [x] 4.3 将必要的跨层检查接入现有 `launcher-input-focus`／Child Runtime／dependency Gate registry，沿用现有 Rstest discovery 与 Cargo tests；运行 `pnpm run gate -- validation-governance` 验证无新根别名、递归 validation 图或环境步骤，并同步两语言 `development/validation.md` 的实际新增覆盖与证据限制。若既有 discovery 已足够，记录不修改 registry 的理由。

## 5. 最终验证与归档就绪

- [x] 5.1 完成完整前端／workspace `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，覆盖新增 Host／外部 fixture／Monaco 用例、格式／静态检查、类型和生产构建；记录实际命令及结果，与聚焦 Gate 证据分开，不复用旧候选测试数证明新修复。
- [x] 5.2 完成 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`；原生层受影响，不豁免 macOS 实际编译。若 vendor 受影响，确认显式 vendor 格式／策略／严格依赖构建也已通过；不将 macOS 结果宣称为其他平台验收。
- [x] 5.3 执行 `pnpm run gate -- launcher-input-focus`、`pnpm run gate -- plugin-child-webview-runtime`、`pnpm run gate -- plugin-child-webview-window-lifecycle`、`pnpm run gate -- frame-aware-webview-navigation-policy`、`pnpm run gate -- validation-governance`、`pnpm run gate -- ci-lensx` 与 `pnpm run gate -- ci-plugins`，连同第 4 组依赖证据记录最终候选结果。全部维持确定性，不启动 browser／GUI／真实 WebView／native harness／Launch Services，不恢复手动兼容 Gate；仅在包边界实际受影响时补跑对应既有 pack／inspect／CLI consumer 检查并注明依据。
- [x] 5.4 修复本 Change 引入的全部 warning、error 和回归，重跑失败命令及完整最终验证集；复核断点报告与最终实现仍对应同一故障机制。分别记录用户实际症状的恢复／未恢复／尚未复核状态，不把确定性通过当作现场已恢复；若仍有同类失败或断点证据不成立，保持修复完成判定未通过并回到第 1 组，不以已归档的前次证据替代。
- [x] 5.5 在 sync／archive 前扫描根 `package.json`、CI、维护文档和 specs，确认没有本 Change 专用根命令、失效 alias、单项 Rstest 文件列表脚本、递归 check 图、临时来源引用或已删除 dispatcher 路径；临时诊断入口不得进入维护产物，根脚本和 Gate／Generate ID 均可解析。
- [x] 5.6 将最终接受的两份 delta 翻译／协调为英文后同步 stable specs，特别核对非 Child 编辑修复、Web 已处理／pending／回流、标准命令与 W/Q 的边界；执行 `openspec validate fix-unified-native-editing-shortcuts --strict` 与 `openspec validate --specs --strict`，保留未修改条款，不在同步中新增未经实现或接受的能力。
- [x] 5.7 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 执行最终变更级治理／文档审计，记录范围、实现／测试／spec／文档／索引／链接／镜像检查对象、项目级审计触发决定及理由、结论、实际更新路径与验证。治理表面或修复触发时补相应项目级审计；无需更新也须给证据，缺失／陈旧／冲突内容阻塞就绪。
- [x] 5.8 复核两语言文档、同步后的 stable specs、导航及最终实际 diff，执行 `openspec validate --all --strict --no-interactive` 与 `git diff --check`；确认前置诊断、共享修复与分层验证均完成且没有未解决的范围内问题后才记录归档就绪。保持 Change active，归档须另获用户请求并先确认同步；不得自动暂存、提交、推送、安装或发布。

## 2026-10-21 Apply 前置调查记录

本次用户已请求 apply，因此开始执行第 1 组调查。以下是本次重新取得的证据，不是沿用提案快照的运行验收。结论为 **前置条件未满足，0/23，尚未进入第 2 组**；1.1 的磁盘身份与静态调用链已核对，但受影响运行构建和现场 first responder 未确认，不能整项勾选。1.2、1.3 缺少同一故障事件的原生轨迹和目标版本完成语义；1.4 尚不能冻结生产修改位置。

### 身份与证据分层

| 对象 | 本次证据 | 适用边界 |
| --- | --- | --- |
| 当前源码 | HEAD `5acdd00a6d7d0107454630138c9b838a436ce5a2`；开始时仅本 Change 目录未跟踪 | 磁盘源码，不是故障二进制的构建来源证明。 |
| 本机系统 | `sw_vers` 为 macOS `27.0.1`、build `26A434`；系统 WebKit framework Info.plist 的 `CFBundleVersion` 为 `22625.1.29.11.28`，short version 为 `22625` | 本机安装事实；尚无受影响进程实际加载 image 的身份。 |
| 实际 Cargo 解析 | `cargo metadata --locked --offline --filter-platform aarch64-apple-darwin --format-version 1 --manifest-path src-tauri/Cargo.toml` 成功；Tauri `2.11.5`、tauri-runtime `2.11.3`、tauri-runtime-wry `2.11.4`、Tao `0.35.3`、Wry `0.55.1` 均解析到 `vendor/frame-aware-navigation/`，muda `0.19.3` 来自 registry；解析包含 Tauri/runtime-wry `unstable` feature | 确认锁定源码路径与 feature；不是 Cargo 编译、运行或原生行为验收。 |
| 运行进程 | 本次只读 `pgrep -ix lensx` 无匹配 | 该时点未找到同名进程；不能识别此前故障使用的是开发版、安装版或其他名称的构建。 |
| 用户报告 | Host `Cmd+A/C/V`、Monaco 正文／Find `Cmd+C/V` 失效，Find 右键可用 | 来自本 Change 已记录的用户反馈；本轮尚未重新复核，普通外部控件也尚未现场复现。 |

本次读到的两个磁盘产物仅作后续身份比对，不认定为已复现构建：

- `src-tauri/target/debug/lensx`：55,643,912 bytes；mtime 为北京时间 `2026-10-20 21:01:00`；Mach-O UUID `084B0158-4B8F-3648-84EC-2E1A70F29C2D`；SHA-256 `6984490bad2de7bfc9145c3cc28850a07241fcc8c149a55101917bafd8fc3da0`。
- `src-tauri/target/release/lensx`：16,938,896 bytes；mtime 为北京时间 `2026-08-22 00:10:34`；Mach-O UUID `4CEC0332-3F5E-3665-92CC-19D51437CC61`；SHA-256 `d2ee8652f91db9107ba66e140d6fabf4f68639ad922f3775573b5c4a43aa5b47`。

### 共享创建路径与候选缺口

以下行号对应上述 HEAD，仅说明当前源码接线。

1. `src-tauri/Cargo.toml:25` 启用 `unstable`，由 `vendor/frame-aware-navigation/tauri/Cargo.toml:130` 传播。`tauri-runtime-wry/src/lib.rs:4686–4691` 在此 feature 下把窗口初始 Host WebView 也作为 `WindowChild`；后加插件 Child 在同文件 `:3081` 选择相同类型，`:5264` 调用 `build_as_child`。因此 Host 主文档身份不意味着 Wry 的 `is_child=false`。
2. `vendor/frame-aware-navigation/wry/src/wkwebview/mod.rs:180` 的 `new_as_child` 传入 `is_child=true`，`:303` 写入 ivar，`:668–689` 直接添加到传入原生视图；只有非 Child 分支安装 `WryWebViewParent`。`class/wry_web_view_parent.rs:29–37` 的 `keyDown:` 会调用主菜单 `performKeyEquivalent`，当前两类 WebView 的 Child 创建分支都没有这个父视图。
3. `vendor/frame-aware-navigation/tao/src/platform_impl/macos/view.rs:668–726` 的父视图 `keyDown:` 调用 `interpretKeyEvents` 并排入 `KeyboardInput`；`:557–595` 的 `doCommandBySelector:` 没有动作实现。这是共享的菜单回退候选缺口，**尚未证明失败事件实际到达这里，或 AppKit 更早没有匹配／执行菜单**。
4. 原生入口 `vendor/frame-aware-navigation/tao/src/platform_impl/macos/app.rs:31` 对 Command KeyUp 特殊处理，KeyDown 交 `NSApplication` superclass；`window.rs:434` 在鼠标拖动分支之外也交 superclass。不能仅从这些委托推导目标系统的完整回调顺序。
5. `src-tauri/src/launcher_window.rs:737–745` 的 local monitor 仅消费纯 Command 的 W/Q，`:756–775` 对其余事件返回原对象；`:1094` 创建六类编辑项，`:1133` 安装菜单。Tauri `src/app.rs:983,2487` 经 muda `init_for_nsapp` 设置 mainMenu；muda `0.19.3` 的 `src/platform_impl/macos/mod.rs:855–876,981–986` 为编辑项设置原生 selector，未将编辑项改绑为 Host 自定义 callback。菜单的创建路径完整，不等于现场 item validation/action 成功。
6. Wry `class/wry_web_view.rs:144` 现场检查窗口、可见性和 first-responder 子树，`class/key_equivalent.rs:25` 合格后调用一次 superclass。这些源码和既有 fake 测试没有记录 Web 最终处理、菜单参与或完成回流。

首选调查对象仍是上述共享正常回退路径。尚未选择在 Tao、Wry 或 Host 增加回退，也没有将 local monitor 扩展成编辑键白名单。

### 逐阶段断点状态与竞争解释

| 阶段 | 已证实 | 尚缺的故障观察／不能排除的解释 |
| --- | --- | --- |
| 应用入口与 W/Q monitor | 当前源码只保留 W/Q，其他事件透传 | 同一受影响进程是否收到该事件、monitor 是否实际透传。 |
| Window 与 native focus | Child 生产资格检查读取真实 native 状态 | 故障时窗口是否 key、first responder 属于哪个 view、是否被资格检查拒绝；右键可用不能证明键盘时焦点相同。 |
| Web 接管与最终结果 | superclass BOOL 被保留 | Web 是否收到、是否 preventDefault、是否仍 pending 或已经最终未处理；同步 YES 不能区分这些状态。 |
| 合法回流与父视图 | 两类 WebView 都绕过 WryParent 菜单回退 | 原事件是否回流、是否到达 TaoView，以及菜单是否已在更早阶段参与。 |
| 菜单匹配／验证／action | 存在标准 accelerator 与 selector 创建链 | 现场 mainMenu 是否安装、item 是否通过验证、action 是否投递到正确 responder；不能排除“菜单参与但不可执行”。 |
| Web 编辑事件与结果 | 见下方实际 handler 源码 | 原生 action 是否转换为 copy/cut/paste 等 DOM 事件、目标结果是否变化一次；不能排除后段失败。 |

固定 [WebKit 源码](https://github.com/WebKit/WebKit/blob/c2c1343a292141aa20c260463e8cbb95042c544a/Source/WebKit/UIProcess/mac/WebViewImpl.mm) 的 `performKeyEquivalent`（源码行 5882 起）会先提交 Web 处理并返回 YES；`doneWithKeyEvent`（5188 起）根据后续结果将未处理事件送回 `NSApp sendEvent:`，并以事件回流状态避免再次进入 Web 自定义处理。这只提供寻找观测点的机制参考；本次未建立该提交与安装的 `22625.1.29.11.28` 的对应，不能完成 1.3，也不能据此把同名私有符号当成目标版本可用接口。

### Web 层与历史测试的证据边界

- `src/App.tsx:534–579,658–659`：实际绑定的 paste handler 只清理 IME 状态；keydown 仅对 Escape／方向键／Enter 调用 `preventDefault`。当前 Host 自有 handler 显式吞掉 A/C/X/V/Z 的解释与源码不符，但不证明运行构建已收到事件或整个依赖链没有其他处理者。
- `plugins/config-lens/src/ConfigLensPage.tsx:198` 只处理 Cmd/Ctrl+Enter；`src/editor/MonacoSurface.tsx:87–100` 创建真实 editor 并转发 model change。`src/editor/localClipboard.ts:8` 与 `monaco.ts:73` 的内存 service 不等于正常 DOM clipboard 路径。
- 锁定 Monaco `0.56.0` 的 `esm/vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.js:246–299` 注册实际 copy/cut/paste handler；`editContext/clipboardUtils.js:116–149` 通过事件的 `clipboardData` 输出选区并读取粘贴文本，内存仅参与 metadata。另一个 `editor/contrib/clipboard/browser/clipboard.js` 存在 service workaround/fallback，不能无运行证据就判定当前故障走了该路径，或先删除 service 试错。
- `tests/launcher-input-focus-ui.test.tsx:191–192,354–355` 在 paste 后手动 change；ConfigLens `tests/monaco-en.test.tsx:127–154,175–248` 覆盖选择模型、查找及直接 model undo，尚无真实 clipboard handler 与独立 DataTransfer 的闭环；`monaco-zh.test.tsx:12` 的 clipboard spies 不证明系统剪贴板交付。未找到普通外部三类控件的相应 clipboard 结果矩阵。
- `openspec/changes/archive/2026-10-20-improve-config-lens-editing-experience/tasks.md:3,59–79` 明确限定为 fake policy、DOM 模型、接线与编译证据，不是本次原生事件轨迹。历史通过数不能解除第 1 组门槛。

### 后续所需的最小一次性观测（尚未执行）

先明确故障对应的开发版／安装版，或确认使用当前源码构建进行一次新复现；记录该次进程 executable UUID／hash、实际加载 WebKit image 和依赖身份。本机已确认 Xcode LLDB 可用，但未启动应用、未附加调试器。

建议先由用户在 Host 搜索框和 Monaco Find 人工触发 Cmd+A，并与人工选择对照；随后按需要覆盖普通 Child、正文和用明确合成内容进行的剪贴板／右键对照。只观测已有路径：应用入口、monitor、Child 资格、super 同步返回、目标 WebKit 可核实的最终完成及回流、WryParent／TaoView keyDown、菜单验证与 action 次数。调试器不调用菜单／action 补发、不改返回值、不合成按键。

记录限于会话内 ordinal、阶段命中次数、同事件／同窗口／同 responder 布尔、目标类别与处理状态；不输出事件 description／characters、正文、剪贴板、原始指针或绝对用户文件路径。结果仅记录选中／插入／撤销是否成功、目标是否正确和是否重复。仅 action 成功仍不证明 DOM 事件发生；若需要额外被动 Web 事件观测，先界定最小范围。若目标 WebKit 完成符号不可核实，继续保留 1.3 缺口。整个排障不成为维护脚本、Gate、CI 或兼容 harness。

### 本轮检查及状态

- 已读取本 Change 全部 contextFiles、`govern-spec.yaml`、相关稳定规格，以及文档索引指向的 architecture overview／Child Runtime、frontend guidelines／ConfigLens、validation 和 project workflow；据此保留前置诊断门槛与两语言维护边界。
- 不带目标过滤的 offline Cargo metadata 因未缓存的 Android 依赖失败；改为本次相关的 `aarch64-apple-darwin` 后成功，不联网安装依赖、不更改锁文件。首次受限进程查询不可用，随后获准只读查询成功但无匹配。
- `openspec validate fix-unified-native-editing-shortcuts --strict` 通过；`git diff --check` 通过，并单独检查未跟踪的本任务文件无行尾空白。重新读取 apply instructions 为 CLI `ready`、完成数 `0/23`；CLI 的规划就绪状态不意味着第 1 组诊断前置条件已通过。
- 仅追加本任务文件的调查证据；生产代码、测试、维护文档、stable specs、依赖和完整性基线均未修改。未运行后续实现验证集，未同步／归档、暂存／提交、安装或发布。用户症状状态仍为“尚未复核”，归档未就绪。

### 同日获准的一次性运行诊断（进行中）

用户随后明确授权按当前源码构建、启动 lensX 并进行一次临时 LLDB 诊断，人工复现时通知；定位断点后继续完成 Change。此授权覆盖本次运行排障，不把诊断入口加入维护验证。

- `pnpm run build` 成功，随后使用现有 `pnpm run dev:plugin-development-mode` 启动；Cargo `dev` profile 为 unoptimized + debuginfo，当前 ConfigLens 构建已通过既有开发入口加载。实际运行 binary 的 UUID／SHA-256 与上方 debug 产物一致，Cargo 对当前源码复用相同产物。
- LLDB 成功附加本任务启动的实例；实际加载 WebKit UUID 为 `70BEE322-37EE-3B22-8012-4F76BA105C29`，AppKit UUID 为 `2688AFBC-5C39-3132-BCF5-8D00D32D7615`。已找到并反汇编目标 image 的 `WebViewImpl::performKeyEquivalent`、`doneWithKeyEvent`、`keyDown`；完成入口保存独立 handled 参数，未处理分支设置事件回流字段、调用应用事件路径并清理字段；key-equivalent 路径检查同一回流字段。由此获得目标二进制机制证据，不再仅凭不同提交推定机制；仍需与失败手势关联。
- 用户第一轮在 Host 输入合成样本后报告 Cmd+A 未全选；第二轮确认切换 ABC 英文输入法、关闭 Caps Lock 并点击输入后仍未全选。故当前源码 Host 症状已复现；其他目标尚未现场复核。
- 第一轮宽范围探针看到一次 Web key-equivalent 接管及后续 handled=true，没有 Tao keyDown 命中；但普通事件地址复用、未按特定组合键过滤，不能将全部 ordinal 视为同一手势，也不能据此判定根因。共享 Tao 回退候选尚未通过，禁止直接实施。
- 第二轮 getter 因 LLDB 表达式环境找不到 Objective-C SDK header 而没有采到有效事件轨迹，不能当作新行为证据。临时探针已改为显式运行时 getter，并在当前暂停进程验证事件过滤、focus 布尔和 menu 元数据读取成功；修复了 LLDB 与通用局部变量名 `count` 的符号冲突。
- 暂停状态的菜单快照确认 mainMenu 有 6 个顶层项，唯一 Select All 项的 key／Command modifier 正确、item 和父项 enabled、target 为 nil、两者未隐藏。该快照不是按键时的 validation/action 结果。
- 第三轮已改为仅采集指定合成 Cmd+A 的 KeyDown，内部以事件地址和 timestamp 联合关联，输出只有会话内 ordinal、处理结果和归属布尔；不输出输入、正文、剪贴板、地址或 timestamp。应用已恢复运行，等待用户完成该轮手动操作。未修改生产路由，1.1–1.4 仍未整体完成。

### 前置诊断结论与方案冻结

后续已完成单键过滤后的 Host 和 ConfigLens 对照；下述结果取代上一节“等待第三轮”的进行中状态。实际断点为 **Tao 父视图空 `doCommandBySelector` 截断了 WebKit 的未处理命令传播**，不是 Host React 取消默认行为、错误 native focus、缺少菜单定义或输入法消费。尚未执行修复，不能宣称现场已恢复。

| 比较对象／阶段 | 实际结果 | 结论边界 |
| --- | --- | --- |
| Host Cmd+A 的原始事件 | 同一事件地址与 timestamp 匹配；原生 Command 与物理样本匹配；Window visible/key、事件同窗、first responder 为该 Wry view 且可见 | 有效当前目标收到该原生手势，排除本轮焦点资格失败。 |
| Host 页面事件 | 一次 trusted keydown；目标及 activeElement 都为输入控件；key 与样本匹配；composing=false、defaultPrevented=false；select/beforeinput/input 均 0，选区为空且内容非空 | 用临时被动监听和布尔查询核实，未读取或输出正文／剪贴板。页面没有取消默认行为，真实选择没有发生。 |
| 命令解释与完成 | 目标 WebKit `doCommandBySelector` 收集 `noop:`；`NativeWebKeyboardEvent` 的 input-method handled=false；`executeSavedCommandBySelector` 调用 Tao `do_command_by_selector`（同为 noop），随后返回 true，最终 `doneWithKeyEvent` handled=true | 直接证明空父响应者使未处理检测失真；该 true 不代表 DOM 编辑成功。 |
| 菜单／action | 被调用菜单既非 Host mainMenu，也非其顶层子菜单；返回 false。Host mainMenu 的唯一 Select All 项 key/modifier、enabled、target=nil 与可见属性正确；Select All action 0 次 | 当前失败早于合法回流。尚不能凭这一结果直接实现 keyDown 菜单补偿；修好传播后再观察正常回退。 |
| ConfigLens 正文／Find Cmd+C | 用户完成两类目标的操作；采到 3 个匹配的 C KeyDown（含额外一次，不以请求次数代替实际次数）。每个事件均为 Host Wry 拒绝失焦资格、当前 Child Wry 接管、input-method handled=false、noop 进入 Tao 空处理、saved-command true、最终 handled=true | 确认当前普通 Runtime Child 存在相同失败机制；未据此声称复制成功或精确区分额外一次属于哪个控件。 |
| 普通外部 input／textarea／contenteditable | 现有创建／焦点／响应链接线没有官方身份或控件种类分支，和本轮 ConfigLens 共享 `WindowChild`、Wry 与 Tao 所有者 | 此项为源码与实际依赖路径比较；没有假定这些外部控件已现场复现。其 DOM 结果由 3.1–3.3 的测试自有普通 fixture 验证。 |
| 右键对照 | 本轮 Host 右键菜单没有 Select All 项；原提案的 Find 右键复制粘贴可用仍属于既有用户反馈 | 不把不存在的 Host 菜单项记成对照成功，也不把旧反馈改写为本轮剪贴板验收。 |

目标 WebKit 的 `executeSavedCommandBySelector` 反汇编确认：接入 `WKResponderChainSink`、调用 superclass 命令路径、读取未处理标志并取反作为 BOOL；实际调用栈命中 `vendor/frame-aware-navigation/tao/src/platform_impl/macos/view.rs:557` 的空实现。`performKeyEquivalent` 与 `doneWithKeyEvent` 的目标版本反汇编另证实异步接管、完成和回流字段；因此不能采用“super true 就已编辑”或“super 后立即跑菜单”的方案。

1.3 的证据分层保持明确：当前手势的 final=true、原生焦点及 Host defaultPrevented=false 是运行观察；final=false 时设置原事件回流字段并重入应用的分支是目标加载二进制反汇编。Web preventDefault=true、正常命令完成及等待中切焦点尚未全部现场实测，继续由 2.2／2.3 的生产策略、原生接线和必要补充观测验证；不把机制核对写成完整交互验收。

已将实施顺序冻结到 design 的同日补充：先只修有效 native 后代焦点下的 selector 正常传播，Tao 自身 raw-input 保持；再按恢复后的实际回流决定是否需要现有菜单的同步 keyDown 回退。生产代码不使用诊断中的私有 WebKit 符号，不引入新按键／selector 白名单、插件特判、DOM 补丁或权限。原目标限制由现有原生协议与分派时的有效性检查承担，不新增延迟补偿或裸目标缓存。

临时被动 Web 监听已移除并收到移除完成回执；本轮 LLDB 断点已清除、调试器已脱离，诊断开发进程已主动停止。后续构建／回归仍使用维护中的确定性入口；必要的补充现场观测属于本次已授权排障，不新增维护 Gate。

## 2.1 实施证据（首步进行中，尚不勾选）

- 首步修改 `vendor/frame-aware-navigation/tao/src/platform_impl/macos/{mod,view,responder}.rs`：实际 `doCommandBySelector` 接入生产 `CommandResponder` 策略，仅在原生可见／key／同窗后代焦点有效时将原 selector 交给 superclass；TaoView 自身 raw-input 维持原行为。未加入 selector／按键分发表、菜单抢先执行或新异步状态。
- 先把旧空处理行为放入生产 helper 并执行回归：4 项中 3 项失败、1 项通过；实现后 4/4 通过，覆盖原 selector identity、单次传播、32 组资格组合、自身焦点及失效后恢复。此为生产策略／fake native adapter 证据，不代替真实响应链。
- 维护接线已同步 runner、reviewed paths、格式范围和 vendor 所有者说明。实际通过：Tao 纯策略 runner 21 项；`tao-policy-tests`／`wry-key-equivalent`／`validation-registry` 聚焦 Rstest 39 项；相应 Biome／两空格 rustfmt；`cargo check --locked --manifest-path src-tauri/Cargo.toml -p tao --lib`；`cargo rustc --locked --manifest-path src-tauri/Cargo.toml -p tao --lib -- -D warnings`。尚未执行最终完整性 Generate，不能将基线检查记为通过。
- 补充诊断构建从当前源码成功重编译。新 binary UUID 为 `C270C843-54D4-3099-8B4E-E7443249D3C0`、SHA-256 为 `bdf342788e2a1097e5c3560743f8a322d83221d4736d5e1e76482949d41b2ea0`；实际加载 WebKit／AppKit UUID 与前轮相同。断点已按新目标重新解析，等待验证 saved-command=false 的合法回流及菜单交付；2.1–2.3 尚未完成。

## 2.1–2.4 与 3.1 验收记录

- 上述新构建已取得有效修后轨迹：对每个匹配的原事件，WebKit 同步接管后 saved-command=false、final=false，随后同事件回流；回流中的 Wry／WebKit 返回 false，既有 Host mainMenu 执行 Select All action 一次并返回 true。未到达 Tao keyDown，也不需要第二处 fallback。最终只保留 selector 传播修正；design 已同步收敛。
- 用户在密集 LLDB 探针期间报告明显卡顿且未看到全选。立即移除全部探针并脱离 LLDB后，用户确认“快捷键恢复，卡顿消失”。此反馈作为该构建的恢复事实，不扩大为所有键／控件、系统剪贴板往返、输入法或平台的逐项验收。调试器采样干扰与产品确定性检查分开记录；诊断实例已主动停止。
- `src-tauri/src/launcher_window.rs` 通过 test-only 引用调用同一 Tao 生产策略，补充 W/Q 消费后的迟到 selector、其他前台应用、焦点丢失与恢复，以及 Wry 同步接管和后续 native command callback 的独立边界。pending 模型不触发 command，只有显式后续原生 callback 传播；测试不实现一份平行 WebKit 完成协议，也不声称 fake 模拟了真实回调时序。原有 global shortcut、Hide/Quit、rollback、Child restore／stale teardown 测试保留。
- 实际通过 `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` 与 `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib launcher_window::tests`（29/29）。前述真实 macOS dev 构建验证生产适配；纯 Tao 策略及接线测试验证原 selector、资格与传播次数。未新增延迟补偿，因此不引入事件／Window／Child 代次缓存；现有 Wry 资格和 WebKit 自身合法回流保持各自所有权。
- `docs/en/architecture/overview.md`、`plugin-child-webview-runtime.md` 及同路径中文镜像已按最终实现同步：Host main 同样使用 WindowChild、同步返回非最终处理、有效后代的 superclass 传播、标准编辑与 W/Q／页面业务命令分工、外部插件无需适配、无新回调／队列／菜单补发和分层证据。两语言对应结构、相对链接及索引入口检查通过；没有新增或移动文档。
- Host／普通外部控件测试由 `tests/launcher-input-focus-ui.test.tsx` 与 `tests/ordinary-plugin-editing-ui.test.ts` 承载，helper／fixture 仅在 `tests/` 内。实际 Semi Input handler 接收 cancelable 事件后才执行明确标注的 Happy DOM plain-text 默认原语，使用 DataTransfer、selection、input 和独立 undo 状态验证结果；删除两处 paste 后手动 change 的旧写法。三类外部控件不进入生产 Host，不增加 SDK、Manifest 或权限。实际聚焦 Rstest 61/61、`pnpm exec tsc -p tests/tsconfig.json --noEmit`、作用域 Biome 与 diff 空白检查通过；这些结果不是实际 AppKit 或真实插件 Window 的交付证明。

## 3.2–3.4 编辑结果与文档验收

- ConfigLens 只新增／修改 tests 内的 fixture、共享 cases 与既有 en／zh 用例。正文 copy／cut／paste 使用真实 Monaco handler 和独立 DataTransfer，paste 文本与 localClipboard sentinel 不同，断言选区输出、删除／插入、caret、onInput 次数及真实键盘 Undo／Redo；不以 service 写读作为系统剪贴板证明。Find 的选择／clipboard 默认动作与 undo stack 明确由测试模型补建，真实 Monaco 负责目标选择、Find、F／Escape 和正文 model；查询撤销不消费正文历史。
- 矩阵覆盖正文／Find、Host／普通外部三类控件的 A/C/X/V/Z/Shift+Z、取消与未取消、只读／禁用、空选区／剪贴板／历史、组合输入与恢复、切焦点、两语言和明暗主题。保留 Monaco 空选区整行复制／剪切的实际行为；普通控件的空选区模型不强制清空输出。原生策略／接线与 DOM 结果分层，不维护 TypeScript 平行原生路由。
- 审查修正了测试平台模型的两处缺口，并先跑出失败：Find readonly cut／空选区输出及 beforeinput 后目标变化负例 10 个失败，修后通过；clipboard delivery 的 keydown 后移焦／移除／禁用负例 6 个失败，修后通过。最终 Monaco 聚焦 Rstest 34/34、插件 typecheck／check、diff 空白检查均通过。旧目标不收到 ClipboardEvent，也不会将操作改投新焦点；这些是明确测试模型的边界，不是产品新增的 JS 输入补丁。
- 两语言 `development/frontend-guidelines.md`、`development/config-lens.md` 已同步键盘职责、Host 发布与插件业务命令的区别、零 SDK／Manifest／权限适配、Monaco 实际 handler 与普通输入默认模型的限制。composition 规则、Find 布局／NLS、临时状态、权限和依赖预算实现未变，相关既有段落保留。四文档相对链接／锚点和英中标题结构检查通过，无文档移动，索引无需新增条目。

## 4.1–4.3 依赖审阅与维护验证

- 触及 Tao `0.35.3` 的 `macos/mod.rs`、`macos/view.rs` 与新 `macos/responder.rs`；Wry 源码、Cargo manifests／lockfile、依赖版本均未变。修改前 `view.rs` 与本机同版本 registry crate 字节一致，SHA-256 为 `16f2970ee510b863eb7521b7ae6964efb902a99453399560b8e610fae15993db`。最终对上游差异仅为 import、guarded superclass 命令传播与私有策略；原 keyDown 整体不变。`mod.rs` 保留既有 file_drop，新增 responder。已审查没有私有 WebKit callback、pending、menu/sendEvent、按键／selector 分支、强制焦点或跨 callback 裸目标。
- `scripts/frame-aware-navigation-dependency-drift.ts`、Tao policy runner、validation catalog、对应 runner／registry／接线／drift tests 及 vendor README 已覆盖新路径、所有者和两空格 rustfmt。原生 selector 传播与真实编辑结果的证据边界明确；不通过更新完整性基线掩盖未审阅源变化。
- 审阅完成后显式执行 `pnpm run generate -- frame-aware-navigation-dependency-drift --write`，记录 378 个 vendored 文件。随后独立运行只读 `pnpm run gate -- frame-aware-navigation-dependency-drift`；首次仅因测试的 exact reviewed-path 预期漏两条失败，修正预期后完整重跑通过：实际 Cargo path/version/features、严格 Tao 编译、21 项 Tao 与 3 项 Wry 策略、reviewed rustfmt、77/77 Rstest 均通过。测试预期修正没有 vendor 源变化，无需重复 Generate；Gate 没有写基线。
- `launcher-input-focus` 既有 Rstest step 加入普通外部控件文件；root discovery、Monaco plugin lifecycle 与现有 Child／dependency Gate 继续承载其余检查。未新增根 alias、Gate ID、递归 validation 图或环境步骤。`pnpm run gate -- validation-governance` 已通过；两语言 validation 文档已同步实际三类 Tao 策略、接线／编译、DOM 模型、Monaco handler 与临时诊断的各自边界，最终 Gate 集仍将在第 5 组重跑。

## 5. 最终候选验证记录

- `pnpm run test`：完整 workspace 通过，10 份 Rstest report 合计 1,152 项、0 失败、0 skipped/todo；其中根测试 710 项、ConfigLens 164 项。采用本次最终候选结果，不复用旧修复的测试数。
- `pnpm run typecheck`、`pnpm run check`、`pnpm run build`：完整 workspace 均退出 0；实际重建 Host、公共包、模板／示例及 ConfigLens。构建与静态检查无新增 warning/error。聚焦 Gate 的证据另列，不替代本组全量命令。
- `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`：本机 macOS 全部通过；Rust 241 项通过，binary/doc tests 无失败。vendor 显式两空格格式、生产策略及严格 Tao 依赖编译另由依赖 Gate 通过，不把应用 workspace formatter 当作 vendor 检查。
- 若 pnpm 的机器缓存受执行沙箱限制，使用相同命令获准访问其既有全局缓存；没有改变 PATH、pnpm store、依赖、代理或全局配置。上述构建和测试没有启动 GUI、浏览器或真实 WebView；用户授权的临时交互排障已单独结束。
- 最终能力检查使用既有 dispatcher 一次请求七个 ID，以其正式依赖拓扑对共享步骤去重：`pnpm run gate -- launcher-input-focus plugin-child-webview-runtime plugin-child-webview-window-lifecycle frame-aware-webview-navigation-policy validation-governance ci-lensx ci-plugins`，整体退出 0。全部请求 Gate 及其依赖完成；与前述全量 workspace／Rust 验证分别记录。`ci-plugins` 实际重建 4 个公共依赖包并验证 1 个直接插件，ConfigLens built-output 检查覆盖 45 个自包含文件。
- 本次没有改变 public package／SDK／Manifest／Host API／插件运行产物源码边界，因此不新增额外 pack／inspect／consumer 入口；既有 CI Gate 自身要求的 package／CLI 检查仍照常执行。没有浏览器、真实 WebView、GUI、Launch Services 或原生 harness 被加入维护流程。
- 已修复本次引入的测试模型与 reviewed-path 预期问题，并重跑各失败聚焦命令、只读依赖 Gate，以及完整最终 workspace／Rust／能力 Gate 集。日志检查未发现引入的 warning/error；剩余观察限制是确定性验证本身不证明全部 OS 键／控件／平台，非未修复故障。故障机制仍与原断点一致，用户已确认无调试器时恢复。

### 5.5 同步前治理扫描

检查 root `package.json`、CI、维护文档、stable specs 和验证 registry：root 25 个 scripts 与 CI 相对 HEAD 未变，未新增 Change 专用 root alias、单项文件脚本或递归 validation 图；87 条迁移／退役 alias 没有活调用。registry 的 83 个 Gate／179 个去重步骤均可解析且 readOnly，5 个 Generate target 有效；97 个受检文件的 41 个具体 dispatcher 引用全部可解析。

四个项目临时目录均被忽略且无 tracked 文件；维护产物没有本次 LLDB 临时文件或临时来源引用。扫描命中仅为既有 OS 临时测试值及治理禁令，不作为维护组件依赖。没有新增或保留退役 browser／native harness／Evidence dispatcher 入口。实际执行 validation-governance、OpenSpec all strict（同步前 43/43）和 diff 空白检查均通过；同步后仍须再次复核规格和链接。

### 5.6 Stable specs 同步

复用本次成功获取的 `openspec status` 和 `openspec instructions specs --change fix-unified-native-editing-shortcuts --json` 规则快照，只对列出的两份 delta 做英文语义合并。`launcher-window-lifecycle` 新增 1 个 requirement／10 个 scenario，原 12 个 requirement／71 个 scenario 保留；`plugin-child-webview-runtime` 仅修改批准的 2 个 requirement、增加 7 个 scenario，其余 6 个 requirement 逐字节不变，原 24 个 scenario 名称与顺序保留。Purpose、标题、无关内容均保持，中文 delta 未改。

已核对 Host 非 Child 标准编辑修复、Web 已处理／pending／合法回流、条件性延迟补偿约束和 W/Q 的边界；stable 内容全部为英文，无 delta 操作 header、临时来源或新增内部实现步骤。`openspec validate --specs --strict`（42/42）、`openspec validate fix-unified-native-editing-shortcuts --strict` 和 diff 空白检查通过。已同步 ADDED 条目存在的 INFO 属预期同步状态；后续获准归档时需先复核同步结果，避免再次应用同一 ADDED 条目。本次不执行归档。

### 5.7 最终变更级治理／文档审计

| 审计项 | 最终证据与结论 |
| --- | --- |
| 范围 | 本 Change 的 proposal／design／两份 delta／tasks；最终 Tao 原生适配与生产策略、Host Cargo 组合测试、Host／普通外部控件／Monaco 行为测试、依赖维护接线、两份同步 stable specs 及五对维护文档。未扩展插件业务功能或其他平台实现。 |
| 检查对象 | 当前 source／tests／Cargo 与 pnpm 锁定配置；`govern-spec.yaml`、根及 docs AGENTS、README 两语言、docs 两索引、OpenSpec config、临时目录规则、root scripts／CI／registry；两份能力规格与所有受影响架构／frontend／ConfigLens／validation 文档。按 precedence 校对实现、接受契约、维护文档与历史诊断证据。 |
| 项目级触发决定 | 不触发。治理配置、agent instructions、README、文档索引、语言集合、目录与镜像关系、driver 配置、ignore 规则和生成集成相对 HEAD 均未变；现有分类文档仅同步内容，registry 只扩充已有能力覆盖，没有改变根命令政策。修复过程未引入新的治理表面变化。 |
| 文档／导航／镜像 | 23 对语言文档路径一致；10 份变更文档语义、层级、示例和证据限制对应。18 份相关 Markdown 的 77 个相对链接／锚点均有效，两索引入口保持。原有 composition、Find 布局／NLS、状态权限与依赖预算段落因实现和合同未变而保留，依据已在 3.4 记录。 |
| 规格 | 两份英文 main spec 与 delta 的 requirement／scenario 标识对应；旧场景名称及顺序保留，无无关删除或能力扩张。诊断中的私有符号和临时观测工具没有进入产品或稳定规范。 |
| 结果与理由 | 变更级审计通过；先前调查／实施期审计已针对最终单一 Tao 修复及同步后的 stable specs 重新确认。无缺失、陈旧或冲突的范围内文档／治理问题，无需额外治理表面修复。 |
| 实际更新路径 | `vendor/frame-aware-navigation/tao/src/platform_impl/macos/{mod,view,responder}.rs`、vendor README／integrity；`src-tauri/src/launcher_window.rs` 的测试模块；`scripts/{frame-aware-navigation-dependency-drift,tao-policy-tests}.ts`、`scripts/validation/catalog.ts`；对应 drift／runner／registry／Wry 接线测试；Host／普通外部控件测试及 test-only helper／fixture；ConfigLens 的 en／zh／fixture／editing-cases tests；两份 main spec；`docs/{en,zh}/architecture/{overview,plugin-child-webview-runtime}.md`、`docs/{en,zh}/development/{frontend-guidelines,config-lens,validation}.md`；本 Change 的 design／tasks。 |
| 实际验证 | 完整 workspace 1,152 测试、类型／静态／构建；macOS Rust 241 测试、格式／静态／构建；独立 Generate 与通过的 dependency Gate；七个最终能力／CI Gate。同步后再次执行 validation-governance、OpenSpec all strict（43/43）、diff 检查及未跟踪文本空白检查，均通过。所有 dispatcher 引用可解析。 |

### 5.8 最终就绪结论

前置断点调查、最小共享修复、分层回归、双语文档、stable specs 同步和最终审计均完成。用户确认无调试器时快捷键恢复、卡顿消失；确定性通过与这项现场反馈继续分开记录，不宣称未执行的全 OS 矩阵、其他平台或目标性能验收。所有本次新增 warning/error 与已发现回归均已修复并重跑，未遗留范围内阻塞。

Change 保持 active，已具备归档就绪条件；归档须由用户另行请求并复核已同步规格。没有暂存、提交、推送、安装、发布或新增维护中的环境验证入口。

## 2026-10-21 归档复核

用户已明确请求归档本 Change。本次遵循先同步、再审计、最后移动的顺序；以下记录更新此前 apply 阶段的 active 状态，历史诊断和测试记录保持原样。

| 复核项 | 当前结论与依据 |
| --- | --- |
| 完成状态 | `openspec status --change fix-unified-native-editing-shortcuts --json` 的 proposal／specs／design／tasks 均为 done，schema 为 spec-driven；`openspec list --json` 唯一匹配本 Change，任务 23/23 完成，无未完成项。 |
| 归档前同步 | 获取当前 specs-rule snapshot，对 status 指定的两份 delta 内联执行语义协调与幂等同步。launcher 的 1 个新增 requirement／10 个 scenario、Child 的 2 个修改 requirement／15 个 scenario 均已完整存在于英文 main specs，无待应用差异，因此没有重复写入。标题／Purpose／单一 Requirements 结构、原场景顺序和未涉及条款均保持。两份 main spec 的归档前后预期字节一致。 |
| 实现与证据 | 重新核对 Tao 当前后代焦点 guard／原 selector superclass 传播、Host 组合测试、vendor reviewed paths 与既有实际验证记录；仍是同一故障机制和最终单一修复，没有新增菜单回退、私有回调或事件队列。当前完整性检查验证 378 个 vendor 文件。归档仅涉及记录和目录生命周期，不改实现，因此不重复运行已完成的整套构建／产品测试或临时 GUI 诊断。 |
| 文档与范围 | 复核五对受影响架构／开发文档、两索引、治理入口、相关稳定规格和本 Change artifacts。23 对语言文档路径一致；21 份相关 Markdown 的 79 个相对链接／锚点有效。后续 `fix-config-lens-word-selection` 的插件装配与默认 undo 分组在共享文档中清楚分离，不改变本原生修复结论。 |
| 项目级审计触发 | 不触发。治理配置、Agent 规则、README、索引、语言集合、文档结构／镜像关系、driver 配置、ignore 与生成集成未改变；此次按既有生命周期归档不改变治理政策。复核后没有需要新增的治理修复。 |
| 命令与临时材料 | 97 个受检文件的 41 个具体 dispatcher 引用可解析；83 个 Gate／179 个去重步骤维持 readOnly，5 个 Generate target 有效。无新增 root alias、环境入口或临时来源引用。 |
| 本次实际验证 | Change strict 有效；stable specs strict 42/42；all strict 44/44；`pnpm run gate -- validation-governance`、vendor 完整性与 `git diff --check` 通过。已同步 ADDED 条目的 INFO 是重复应用提示；本次在已验证同步后执行目录归档，不再次应用同一增量。 |
| 更新与保留 | 本次仅追加该审计记录并移动选中的完整 Change 目录（含 `.openspec.yaml`）。stable specs 无文本更新；词选择 Change 和其他工作区修改保留。不存在依赖旧活动路径的入站链接，design 的 proposal／tasks 相对链接在新位置仍有效。 |
| 结论 | 变更级审计已针对当前最终状态重新确认，无缺失、陈旧或冲突的范围内问题，允许执行本次已授权归档。归档目标为 `2026-10-21-fix-unified-native-editing-shortcuts`；移动后再次核对目录、metadata、链接、活动清单和严格校验。 |

归档后核验完成：完整 6 个文件已移动并核对内容，`.openspec.yaml` 保留，任务仍为 23/23，两条本地相对链接有效。两份 native main spec 和词选择 Change 的内容哈希保持不变；活动清单仅保留 `fix-config-lens-word-selection`（6/6）。移动后 all strict 43/43 与 diff 检查通过。本条仅追加最终归档结果，没有 Git 提交或其他变更归档。
