# Tasks

本清单记录实施及后续用户追加范围，66 项任务均已完成。当前接受范围以 [proposal.md](proposal.md)、[design.md](design.md) 和对应 delta specs 为准；下方按日期保留的规划与实施记录描述各自阶段，最终状态以末尾归档复核为准。

## 1. 公共激活契约与版本基础

- [x] 1.1 在 Contract 定义独立 Activation、`actions.get_activation`、`actions.subscribe_activations`、`actions.activated` 的精确 Schema、catalog 与只读输出，验证局部 Action ID、正安全整数 invocationId、normal/shortcut、空参数及额外字段拒绝的共享 TS/Rust fixtures。
- [x] 1.2 将 Contract/Host API 更新为 0.4.0，准备 SDK 0.5.0 与 `>=0.4.0 <0.5.0` 范围；同步 Manifest normalizer 和生产 Dispatcher 的当前版本/目录断言，保持 Manifest 0.4.0、carrier 0.2.0、应用及包格式不变，通过版本维度、valid/incompatible/invalid 分类与排他上界测试验证。
- [x] 1.3 执行 `pnpm run generate -- plugin-host-api-types --write` 更新 Schema 派生类型和校验器，通过 Contract generated-drift、纯校验测试及 `plugin-host-api-contract` Gate 验证，保留历史 WebView corpus。
- [x] 1.4 更新 `docs/en/plugin-development/host-api.md`、`public-packages.md`、`compatibility-and-errors.md` 及对应 `docs/zh` 文件，说明 11 个方法、独立 Activation、旧 SDK 升级重包及 Context 四字段不变；核对机器可读目录、版本和中英语义一致。

## 2. 快捷键配置、组合键和补偿事务

- [x] 2.1 新建 Rust 独立版本化快捷键存储与 typed Host 读写边界，实现 revision 校验、默认值和逐项运行状态；通过缺文件、损坏、未知版本、旧 revision 和主题/语言并发写入测试验证不覆盖 AppPreferences。
- [x] 2.2 实现 trigger 规范化、主键支持范围、完整保留组合表和全配置唯一性；用共享边界 fixtures 验证别名/修饰顺序、同目标 no-op、暂不可用目标占用、左右双击等价、保留键及未知输入拒绝。
- [x] 2.3 将固定组合键注册替换为配置驱动服务，实现每次物理按压单次触发和注册代次隔离；通过 fake 原生适配器验证 Pressed/Released、长按重复、旧事件、普通 Toggle 与 Action Show 路由。
- [x] 2.4 实现预注册、旧绑定注销、文件提交、映射发布及失败补偿；通过每一步故障注入覆盖注册/注销/rename 不确定结果、回滚失败、残留占用、确认快照和 degraded 状态，禁止将部分成功报告为保存完成。
- [x] 2.5 接入启动和运行中恢复保护：有效自定义恢复键失败时保持可见且不默认回退，无效快照不执行、默认恢复尝试失败也保持可见；通过 Rust 状态测试验证失焦/关闭隐藏禁用、设置与退出可用及默认键已绑定 Action 的情形。
- [x] 2.6 订阅当前 Action 可用性，释放不可用目标的原生注册但保留用户配置，再启用时重新校验注册；通过禁用/卸载/不兼容/重装/注册失败测试验证不执行陈旧闭包。
- [x] 2.7 同步英中 `architecture/overview.md` 与 `development/validation.md` 中配置所有权、保存与生效状态、恢复降级和外部冲突检测边界，核对文档与上述测试可观察结果一致。

## 3. 修饰键双击与录制生命周期

- [x] 3.1 实现无平台依赖的双击状态机：同物理 Cmd/Ctrl/Option/Shift、200ms 按住、第一次松开至第二次按下 300ms、第二次松开后 300ms 确认；用虚拟时间覆盖截止同刻输入优先、长按、左右混合/重叠、三/五击取消且不重新配对。
- [x] 3.2 实现 macOS listen-only 输入 adapter、授权检查与用户主动授权入口，仅提供状态机所需事件事实；通过适配器边界测试及 Cargo 编译验证不吞键、不模拟输入、不保存字符，不向插件授予监听权限。
- [x] 3.3 接入权限撤销、tap 中断、睡眠/唤醒、不可观察状态、配置更改和禁用双击的清理；通过 fake 状态转换验证旧候选清空、恢复不补发、普通恢复组合键保持独立，不绕过 Secure Input。
- [x] 3.4 实现原生拥有的录制 lease、可见性续期与 30 秒失效，保留注册但暂停配置目标；通过状态测试覆盖已绑定键候选反馈、裸 Escape、Cmd+W/Q、失焦/隐藏/Host 失效、过期及释放后的尾事件不触发。
- [x] 3.5 验证双击候选在标准组合键、其它修饰键、鼠标按键和滚轮时取消，普通鼠标移动不取消；把所有保留键样本及系统连续多击样本加入确定性测试，不启动原生交互 harness。
- [x] 3.6 同步英中原生架构与前端指南，说明双击时限、确认延迟、授权、录制释放、系统多击及外部工具边界；核对描述不把被动监听写成独占注册或真实系统验收。

## 4. 统一 Action 调用与页面连续性

- [x] 4.1 扩展 Host-private executor 和 invocation coordinator，使 UI、原生专属绑定、插件 actions.open 共用准入与当前 Registry 检查；通过 Action service 测试验证来源不可伪造、调用 ID 去重、普通入口始终 normal 和既有 typed dispatch 结果不变。
- [x] 4.2 实现 native-to-Host 就绪交付、最多 32 个等待调用、10 秒等待失败及绑定代次检查；用受控事件与时钟验证冷启动、监听恢复、重复事件、超载、失效及明确失败反馈，不静默丢弃已接纳调用。
- [x] 4.3 扩展投影 executor 与导航独立 invocation 通道，保持 ActivePage 三字段身份；通过 projection/navigation 测试验证当前 Page preflight、同页不同 Action、普通后 shortcut、shortcut 后 normal、失效/切换后的旧调用不重播。
- [x] 4.4 调整 App 调用入口的 pending、recent 与焦点处理，确保 Action Show 不 Toggle、同页不 remount、输入和 Runtime 保留；通过 App/页面/continuity 测试验证每次成功调用只计一次 recent、执行隐藏 Action 仍保留其既有语义。
- [x] 4.5 更新英中架构文档和 Child WebView 文档的来源、焦点和生命周期描述，核对独立 invocation 不被写入 React key、Runtime identity 或插件可伪造参数。

## 5. Host 激活通道和 SDK 可选回调

- [x] 5.1 实现 Session-owned activation 当前快照、最多 32 项初始批次、原子订阅和后续事件；通过 Host dispatcher/RPC 测试验证实际来源绑定、跨插件/跨页拒绝、重复订阅返回同一缓存批次且不重复开流、缓存不占后续准入容量。
- [x] 5.2 实现当前 SDK 的内部事件接收与初始化合并：先 listener 后订阅、最多 64 个暂存调用、ID 排序和有界去重；通过公共 SDK/Testkit 测试验证先到事件、重复批次、正常调用快照更新、空 capability/缺能力正常 ready。
- [x] 5.3 实现工厂可选 `onShortcutActivated` 和只读 activation；测试首次及后续 shortcut 各触发一次、normal 不回调、无回调超过 32 次仍正常、回调在 ready 后可 request、同步异常/异步拒绝隔离及不自动重试。
- [x] 5.4 实现激活开流尝试后整体初始化失败的 terminal 分支与 Host attempt 撤销；通过超时/取消/无效响应/过载/断连测试验证新 attempt 显式重试、旧调用不重播，开流前可恢复失败仍 idle 重试，同次初始化重复订阅保留 listener/buffer。
- [x] 5.5 将 disposal、页面关闭、卸载、替换与 Session 终止连接到内部通道清理；通过迟到响应、重复清理和已启动 Promise 拒绝测试验证不再发起回调、不泄露资源、不宣称撤销外部副作用。
- [x] 5.6 同步英中 public-packages、host-api、compatibility-and-errors 和两类 tutorial；提供工厂回调示例、无回调示例、activation 读取、业务并发责任与 terminal 重试说明，检查示例可由公共包消费者编译。

## 6. 设置快捷键界面

- [x] 6.1 在现有 Settings 增加 Shortcuts 导航与 typed 服务注入，展示必需恢复组合键、可选双击及 Action 列表/空态/不可用项；通过真实 Semi 组件测试验证默认 Preferences、同一窗口、固定布局与长列表滚动。
- [x] 6.2 实现组合键/双击录制、候选编辑、取消、清除 Action 和可选双击、冲突目标反馈，接入原生录制 lease；测试键盘全流程、裸 Escape 与修饰 Escape、IME、已绑定全局键、失焦和结束后的焦点恢复。
- [x] 6.3 实现保存中、revision 冲突、保留键、注册失败、已保存未授权、目标不可用及 degraded 状态；通过失败注入测试验证候选不冒充生效、可继续修正、无原始路径/错误/输入泄漏。
- [x] 6.4 实现明确确认后的整个快捷键恢复默认，并保持单独修改恢复键的普通去重；测试默认键被 Action 占用、整体清空可选绑定、事务失败及主题/语言/集合不变。
- [x] 6.5 补齐英文默认与中文文案、light/dark token、可访问名称/live feedback、录制和确认操作的焦点；以四种 locale/theme 组合测试成功、空、错误、未授权、长内容和键盘行为。
- [x] 6.6 同步英中 frontend-guidelines 与现有设置架构说明，核对配置/生效含义、恢复默认影响及授权入口，不把原生实现细节放入产品操作文案。

## 7. 当前消费者迁移与能力 Gate

- [x] 7.1 更新官方 Translation、ConfigLens、维护示例及两类模板的公共依赖、lockfile 与 Host API 范围，保持 Manifest 0.4.0；以 Contract/package inspection 与版本测试验证当前包可用、旧范围明确 incompatible 且未被改写。
- [x] 7.2 同步 canonical templates 与 CLI 内嵌快照，修正模板最小资源规范中的历史 Manifest 0.3.0 漂移，提供可选回调演示；通过 `plugin-project-template`、`plugin-developer-cli` 的纯 CLI consumer 验证一致性、打包和公开依赖边界。
- [x] 7.3 更新 Testkit 的当前类型/fixture 消费与包依赖；以 `plugin-testkit`、`plugin-sdk-transport` 和 `plugin-host-api-contract` 的实际 tarball consumer 验证 no-DOM root、公开导出、深层导入拒绝和协议边界，不覆盖旧 WebView corpus。
- [x] 7.4 增加官方插件无回调回归：专属快捷键重复进入保留输入、设置、请求和结果状态，不额外触发翻译/格式化；通过插件 package tests 和生产组合的确定性 continuity 测试验证。
- [x] 7.5 同步英中 plugin-project-template、translation、公共包版本表及迁移说明；核对所有维护消费者与范围一致，不将“回调可选”写成“旧 SDK 自动兼容”。若其它公共包依赖元数据需发布版本，按独立版本规则同步并验证实际 tarball 解析，不执行发布。
- [x] 7.6 在 typed validation registry 注册新稳定 `launcher-shortcuts` Gate，组合新能力 Rstest/Cargo 测试与既有 `launcher-input-focus`、`plugin-action-projection`、`plugin-child-webview-session`、`plugin-child-webview-continuity`、`plugin-sdk-transport`、`plugin-host-api-contract`；用 Gate list/plan 与 `validation-governance` 验证无写入、无重复编排、无 Change 专用 root alias。
- [x] 7.7 同步英中 validation 文档的实际 Gate/Generate ID 与证据边界；验证链接可解析，根 package/CI 无浏览器、真实 WebView、GUI/原生交互、截图或性能路径，也无 manual/optional 兼容入口。

## 8. 最终验证与归档准备

- [x] 8.1 运行 `pnpm run gate -- launcher-shortcuts`，并按最终受影响范围完成 `plugin-host-api-dispatcher`、`plugin-management-settings`、`plugin-testkit`、`plugin-project-template`、`plugin-developer-cli`、`validation-governance`；记录实际命令、结果与未覆盖边界，focused Gate 不替代完整验证。
- [x] 8.2 运行完整前端与 workspace 的 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，记录测试、格式/静态检查、类型与构建结果。
- [x] 8.3 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`，记录受影响 macOS adapter 与所有 Rust 层的检查及构建结果，不把编译当作实际系统交付证据。
- [x] 8.4 在干净检出等价条件运行 `pnpm run gate -- ci-lensx` 与 `pnpm run gate -- ci-plugins`，验证 package build closure、当前消费者和历史失败 fixtures，不使用仓库本地 pnpm store 或重建 root node_modules 的 consumer workaround。
- [x] 8.5 修复所有本 Change 引入的 warning/error，并重跑失败命令及完整最终验证集合；若最终范围确有未受影响项，在此记录具体理由，不静默跳过。
- [x] 8.6 在独立的归档准备阶段，将最终接受的 delta 转换为英文并同步至 stable specs，完成英中文档与链接核对，运行 Change 与全部 stable specs 的严格校验；只有实际完成后才勾选，本次提案创建不执行同步。
- [x] 8.7 按 [项目审计流程](../../../../docs/en/development/project-workflow.md#governance-and-archive-readiness) 审核最终 scope、实现/测试、stable specs、相关 docs、索引、语言、链接及治理约束；在本文件记录范围、检查路径、触发判断、结论理由、修改路径与真实验证证据。即使无文档更新也须记录覆盖理由。
- [x] 8.8 评估并在修复后复核 project-level audit 触发条件；若修改索引、治理入口、语言/目录结构或生成集成则执行相应审计，否则记录不触发理由。当前计划以既有分类文档为主，不把这个预判当作已完成审计。
- [x] 8.9 扫描 root manifest、CI、维护文档和 specs 的旧版本断言、移除别名、Change 专用命令、直接测试文件脚本、递归检查图和旧 dispatcher 引用，运行 `git diff --check`，确认不存在未解决的范围内文档/治理问题后记录归档就绪；不在本任务中执行 archive、Git 提交或发布。

规划阶段说明（历史）：当时只验证规划产物的结构、跨文件一致性与规范完整性，尚未执行实现及最终验证，不能据规划通过宣称功能已完成。后续实施及实际验证见下方记录。

规划产物校验记录（2026-10-27）：`openspec validate add-configurable-shortcuts --strict` 通过；13 个声明 capability 均有 delta，31 项 MODIFIED requirements 保留全部 191 个原场景；50 项实施/验证任务均未勾选。规划文件本地链接、行尾空白及 `git diff --check` 检查通过。当前变更仅位于本 Change 目录，未修改实现或 stable specs；这不是实施完成或归档就绪审计结论。

## 实施与归档准备审计（2026-10-27）

本节记录实际实施结果；上面的规划阶段记录保留为历史，不代表当前实施状态。

### 最终范围与实现证据

- 已实施 13 份 accepted delta：`launcher-shortcuts` 新能力及 Host 设置、窗口生命周期、Action core、投影、导航、Host API、Dispatcher、Manifest、Contract、SDK、模板与 Translation 的相关契约。
- 原生实现位于 `src-tauri/src/launcher_shortcuts/`，并接入 `launcher_window.rs` 与 `lib.rs`。独立 `shortcuts.json` 不扩展 `AppPreferences`；共享策略为 `src/app/shortcuts/policy.json`，共享 TS/Rust 边界 fixtures 为 `tests/fixtures/launcher-shortcuts/triggers.json`。覆盖规范化、完整保留表、不可用目标占用、版本/revision、配置事务、失败补偿、注册代次、启动恢复、布局变化、权限状态、录制 lease 与有界原生交付。
- 事务审查补齐了注册/注销不确定结果、rename 实际已提交后的重读、回滚失败与残留占用，以及 `storage_uncertain` 在自动布局/目标对账期间持续保持 degraded 的边界。显式保存事务确认存储前不会自动恢复执行或隐藏能力。
- 手势审查覆盖原始事件时间戳、单调时钟、队列处理后确认、deadline 同刻输入优先、物理左右键、Fn 与独立鼠标按钮持有状态、三/五击不滑动配对、恢复时采样仍按住的键、权限/Secure Input/睡眠/配置/录制切换清理。原生监听不吞键、不合成事件、不读取输入字符；布局标签来自键盘布局元数据。
- Host 调用链位于 `src/app/launcher/actions/`、`src/app/navigation/` 与 `src/app/plugins/runtime/`。UI、原生和插件入口共享准入；原生 claim 后执行前再次确认绑定 revision/可用性，插件入口重查 Session。独立 activation 通道保留同页 Runtime，旧原生 attempt 不得占用替代 Session。失败在 Home、Host Page、Plugin Page 与 Search 均有安全可见反馈。
- `ShortcutSettings.tsx`、`SettingsPage.tsx`、`src/app/shortcuts/`、应用语言资源/schema 与语义 Less 覆盖真实 Semi 组件交互。保存只展示确认快照；过期响应不会覆盖新 revision 或同 revision 的较新事件状态。录制请求返回前的失焦/撤销、取消后立即重试、迟到租约释放、IME、保留命令、恢复默认确认和清除绑定后的焦点均有回归。
- Contract/Host API 为 `0.4.0`，SDK 为 `0.5.0` 且范围为 `>=0.4.0 <0.5.0`。Context 仍为四字段；目录为 11 个方法与 2 个事件。Manifest `0.4.0`、carrier `0.2.0`、应用 `0.1.0` 与包格式未改变。UI、Testkit、CLI 因公共依赖元数据更新准备独立 patch `0.2.1`，没有发布。
- SDK 与公共 Testkit 覆盖 32 项初始批次、64 项初始化合并、有界水位去重、可选回调、同步异常/Promise rejection、ready 后请求、开流后 terminal、disposal 与迟到结果。官方 Translation/ConfigLens 的无回调重复激活保留输入、请求/格式化与结果，不新增业务调用。维护示例、canonical templates、CLI snapshots、lockfile 和实际 tarball 消费者已同步；固定历史 WebView corpus 未改写。

### 文档、规范与治理审计

- 已检查并同步 `docs/en` 与 `docs/zh` 中的 `architecture/overview.md`、`architecture/extension-platform.md`、`architecture/plugin-child-webview-runtime.md`、`development/frontend-guidelines.md`、`development/validation.md`、`development/plugin-project-template.md`、`development/plugin-development-mode.md`、`development/translation.md`、`plugin-development/public-packages.md`、`plugin-development/host-api.md`、`plugin-development/compatibility-and-errors.md` 和两类 tutorial。共 13 对受影响文档；所有 24 对文档路径结构一致。
- accepted delta 已转换为英文并同步至主规范：13 个能力、31 项 MODIFIED、15 项 ADDED，保留未变要求与场景，新建 `openspec/specs/launcher-shortcuts/spec.md`。二次合并幂等，无新 TBD。独立治理修复将 Host API 主规范 Purpose 的当前版本改为 `0.4.0`，并将 `open-isolated-plugin-runtime` 的当前 Session 场景去除旧版本限定；HTTP 在 `0.3.0` 引入的历史说明保留。
- 本次触发 project-level audit：Contract/SDK 的英中 README 发生版本与入口修改，并补齐语言互链及公共文档入口。复核了根 `README.md` / `README-zh.md`、`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、英中索引与 `development/project-workflow.md` 的职责、语言与导航规则。未改变语言集合、文档目录、索引或生成的 agent integrations；根治理规则无需修改，且保持可独立发现。
- touched 文档中遗留的开发模式手动 Smoke 验收已改为普通产品操作说明，移除手动造 symlink 与真实 WebView proof 流程。仓库验收只指向既有确定性 Gate，不新增 manual/optional compatibility Gate。搜索未发现旧标题锚点的入链；相关文档的 20 个文件/锚点链接核对通过。
- 最终本地文档检查覆盖 36 个 Markdown 文件、147 个相对文件链接，均可解析。修改的英中文档具有对应结构、意义、例子与限制。根 manifest/CI 未新增 Change 专用脚本、直接测试文件列表脚本、递归检查链或 Evidence dispatcher；新稳定 `launcher-shortcuts` 仅在 typed registry 内组合并去重既有能力步骤。没有引入 GUI、浏览器、真实 WebView、截图或性能验收路径。
- 四个项目临时目录均保持忽略，未发现已跟踪的临时文件；维护产物不依赖临时输入。Schema 派生类型和 validator 由现有 Generate target 更新，未手改工具生成的 agent integrations。

### 实际验证

| 命令 / 范围 | 结果 |
| --- | --- |
| `pnpm run generate -- plugin-host-api-types --write`，随后 generated-drift 检查 | 通过；历史 WebView corpus 保留 |
| `pnpm run test` | 完整 workspace 1,587/1,587 通过，无 skip/todo；包含根应用、公共包、示例与两个官方插件 |
| `pnpm run typecheck`、`pnpm run check`、`pnpm run build` | 最终源码均通过；类型、格式/静态检查与生产构建无引入 warning/error |
| `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` | 全部通过；Rust workspace 298/298，含 33 项原生快捷键专项；无 warning |
| `launcher-shortcuts`、`plugin-host-api-dispatcher`、`plugin-management-settings`、`plugin-testkit`、`plugin-project-template`、`plugin-developer-cli`、`validation-governance` | 全部通过；最终以现有 Gate dispatcher 合并执行并去重共享步骤，退出码 0 |
| `ci-lensx` 与 `ci-plugins` | 全部通过；最终与定向 Gate 合并执行，公共依赖重新构建、两类 CI 完整通过，退出码 0 |
| Change 与全部 stable specs 严格校验 | 1/1 与 45/45 通过，零 issues |
| 公共文档 / Contract 文档 / current version 检查 | 通过；实际 tarball 的 no-DOM、公开导出、深导入拒绝、模板 CLI build/validate/reproducible pack/inspect 与 Rust installer preparation 通过 |
| `git diff --check`、语言树/链接/旧版本与旧命令扫描 | 通过；旧协议号仅保留在明确的历史、迁移或独立协议维度说明中 |

验证使用机器配置的全局 pnpm store。沙箱内 pnpm 的全局数据库访问失败后，以获准的同一命令重跑，没有使用仓库本地 store 或 consumer 重建 root `node_modules` 的 workaround。CI Gate 按依赖闭包重新构建当前公共包、模板和插件；真实 tarball/纯 CLI consumer 在独立临时目录解析依赖，未借旧 dist 或 workspace 源码冒充安装消费。引入的格式、类型、协议 fixture 和交互回归均已修复并重跑；没有静默排除前端、Rust、构建或包消费领域。

证据边界：以上只建立确定性逻辑、跨层组合、包消费和编译结论；没有运行真实 macOS 输入投递、授权对话框、Secure Input 实机切换、WebView/GUI 或目标环境性能验收。普通组合键注册错误不能枚举外部应用，修饰键双击不具有系统独占性。未执行 archive、Git staging/commit/push 或发布。

最终执行记录：`pnpm run gate -- launcher-shortcuts plugin-host-api-dispatcher plugin-management-settings plugin-testkit plugin-project-template plugin-developer-cli validation-governance ci-lensx ci-plugins` 全部通过。最终扫描未发现引入的 warning/error，Git index 无已暂存条目。最终结论：实现、规范同步、英中文档与治理审计已完成，归档准备就绪；仍需另行请求才执行归档。

## Escape 取消补充修复（2026-10-28）

- 用户反馈：设置快捷键时需要通过 Escape 取消并退出编辑状态。原先只有录制框获得焦点且正在录制时处理裸 Escape，未覆盖整个编辑流程。
- 修复范围：`src/app/pages/ShortcutSettings.tsx` 在编辑期间安装 document capture 键盘监听，覆盖尚未录制、等待录制 lease、录制中其它控件/真实 Semi 弹层与保存失败后的取消。统一调用已有取消入口，丢弃候选、释放录制、恢复编辑入口焦点，保留已确认绑定和 Settings 页面；退出编辑及卸载时移除监听。修饰 Escape、IME 与已提交保存的 pending 保护保持现有契约。
- `tests/launcher-shortcuts-ui.test.tsx` 新增 8 项回归，覆盖上述阶段、迟到 lease 释放、焦点、输入法/修饰键排除、保存 pending 与监听清理；该文件 33/33 通过。
- 已同步 `docs/en/development/frontend-guidelines.md` 与 `docs/zh/development/frontend-guidelines.md` 的 Escape 编辑范围、取消和清理说明。现有 `host-settings` / `launcher-shortcuts` stable 与 delta 已规定 Escape 丢弃候选并返回编辑入口，本次修复落实既有要求，没有新增协议或能力。
- 实际验证：`pnpm run app:test` 812/812 通过；`pnpm run app:typecheck`、`pnpm run app:check`、`pnpm run app:build` 全部通过。测试辅助函数命名检查问题已修正并串行重跑上述完整应用验证，无 warning/error。
- 本次只涉及前端编辑交互、测试与对应英中文档，未修改 Rust、原生录制 lease、公共包或跨层协议，因此未重复运行不受影响的 Cargo、公共包 consumer 与整体快捷键 Gate；2026-10-27 的完整验证保留为该轮实施记录。未执行归档、提交或发布。
- 补充校验：`openspec validate --all --strict --no-interactive` 46/46 通过（1 Change、45 stable specs），`git diff --check` 通过。


## 9. 行式快捷键配置与单一唤出入口（2026-10-29）

用户追加范围取代原先“必需组合键 + 可选双击”的双入口约束；前述实施与验证记录属于对应日期的历史版本。

- [x] 9.1 同步 proposal/design/delta：唤出单行且只保留所选类型；Action 四列与新增草稿、原子改绑、删除与 Esc；明确 v2 与 v1 无损/待选择迁移、唯一入口失效的可见恢复。
- [x] 9.2 实施 typed v2 模型、桌面边界、原生读写/事务/恢复保护与迁移；测试旧文件保留、明确选择、无隐藏组合键、双击权限/监听失效与重新恢复，以及布局/唯一性回归。
- [x] 9.3 实施紧凑单行设置、行内编辑/新增/删除与 Action 选择，保留录制 lease、Esc、焦点、快照防退与失败候选；补齐英中资源和主题样式。
- [x] 9.4 更新真实 Semi UI、typed model/adapter 与 Rust 回归，覆盖两类触发器、四种 locale/theme、draft/持久化删除、重复目标、改绑、迁移和全部既有录制边界；同步对应英中文档。
- [x] 9.5 完成适用 `launcher-shortcuts` / `plugin-management-settings` / `validation-governance` Gate、完整前端测试/类型/格式静态检查/构建与 Rust 格式/测试/检查/构建；修复引入问题并重跑；同步接受的英文 stable specs，严格验证、链接/语言核对与 change-scope/project-level 触发复核，记录真实证据，不执行 archive 或 Git 发布操作。

### 行式配置追加范围审计与最终证据（2026-10-29）

- 用户确认：唤出只保留下拉框所选的一种类型，删除独立“双击修饰键唤出”行；唤出行顺序为标题、类型、当前快捷键，Action 行顺序为类型、当前快捷键、Action、删除，底部新增创建草稿。本次接受内容取代前述历史记录中的双入口约束。
- 实施路径：`src/app/pages/ShortcutSettings.tsx`、`src/app/shortcuts/{types,model,desktop,index}.ts`、`src/styles/global.less`、英中应用消息及 schema，和 `src-tauri/src/launcher_shortcuts/{model,service,mod,macos}.rs` 及相应测试。没有新增依赖、公共 Plugin Host API、包版本、root 脚本或 CI 入口。
- v2 与迁移：只投影/执行单一 `launcher` trigger。v1 单组合键读取无损且不改旧文件，后续同值明确保存也会提交 v2。v1 双入口保留原文件与两个候选，要求明确选择并以 `resolveLauncherMigration` 完整提交；其它写入不能隐式选择。未解决时 Launcher 不执行且窗口保持可见。保存失败与不确定 rename 均按实际存储确认决定是否清除迁移事实，没有隐藏旧组合键或默认键回退。
- 恢复保护：唯一双击失去授权、监听、Secure Input 可观察性或睡眠/唤醒状态时，原生主动显示已隐藏窗口并禁止不可恢复的 Hide；健康 tap 在普通配置/录制清理时保留，只清手势候选，避免正常隐藏制造假失效。独立审查未发现未解决的迁移或单入口恢复缺口。
- 行式交互：点击键位直接录制，完整候选明确保存；辅助操作只在当前行下紧凑展示。新增/删除草稿不写配置，删除已保存行走事务且失败保留；Action 改绑原子移除旧 ID、拒绝覆盖已占用 ID。Esc、候选失败保留、lease 迟到/续期/释放、native candidate、IME、保留键、快照防退、Semi portal 可访问名称与焦点恢复均保留并验证。
- 文档与规范：已同步英中 `architecture/overview.md`、`development/frontend-guidelines.md`、`development/validation.md` 共 6 个文件；修正菜单初始化与恢复可用性的描述，明确 Quit 独立可用。更新 proposal/design 和 `host-settings`、`launcher-shortcuts`、`launcher-window-lifecycle` 三份 delta 并同步到英文主规范，保留原有 requirement/scenario identity，新增迁移要求与行式交互场景。
- 治理触发复核：本次追加仅修改能力契约、实现/测试与既有分类文档，没有改变 README、索引、语言集合/目录结构、治理入口、spec-driver 配置或生成集成；不新增 project-level audit 触发，已复核前轮项目规则仍适用。24 对文档路径一致，6 个修改文档的 18 个相对文件链接全部可解析。root manifest/CI/维护文档和 stable specs 无新 Change 专用 alias、Evidence dispatcher 或 GUI/browser/真实 WebView 验收路径。
- 真实验证：`pnpm run test` **1,616/1,616**；`pnpm run typecheck`、`pnpm run check`、`pnpm run build` 全部通过。单行 UI **50/50**、TS 模型/桌面边界 **11/11**；共享配置 fixtures 覆盖 v1/v2 与 migration 投影，前端拒绝未投影的旧格式。
- Rust：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 全通过，workspace **305/305**，其中原生快捷键 **40/40**。覆盖真实临时文件读取保持、明确迁移写入后重启、事务各步故障、类型切换、权限反复及默认组合已被 Action 占用。
- Gate：`pnpm run gate -- launcher-shortcuts plugin-management-settings validation-governance` 与 `pnpm run gate -- ci-lensx ci-plugins` 全通过，保持全局 pnpm store，使用原有依赖构建闭包与独立 consumer，没有重建 root node_modules 的 consumer workaround。
- 严格规范校验、`git diff --check` 与引入 warning/error 扫描通过。上述均为确定性测试、构建与包消费证据，不代表真实 macOS 按键/授权、WebView/GUI 或视觉像素验收；未执行 archive、Git staging/commit/push 或发布。


## 10. 双击直接选择与组合键实时预览（2026-10-29）

- [x] 10.1 双击类型的键位单元格直接展示 Cmd/Ctrl/Option/Shift 下拉框，去掉双击录制入口和 lease 获取/续期；保持选择、保存、冲突、迁移与 Esc 行为。
- [x] 10.2 组合键录制区实时显示按下/松开的修饰前缀与主键，分离瞬时显示和有效候选；松开后保留完整候选，处理原生反馈、IME、未知/保留/多主键、失焦与取消清理。
- [x] 10.3 完成真实 Semi 与模型回归、完整应用测试/类型/格式静态检查/构建、英中文档与接受规范同步、严格校验及范围审计；明确未改动 Rust/公共协议的验证边界，不执行归档或 Git 发布。

### 双击选择与实时录制补充审计（2026-10-29）

- 用户追加要求已落实：Launcher 与 Action 的双击键位均为常驻 Cmd/Ctrl/Option/Shift Select，无录制输入或启动录制入口；选择只更新候选，不取得/续期录制 lease。切换自组合键录制时释放原 lease，继续使用原保存、冲突、迁移与 Esc 语义。
- 组合键使用独立的瞬时按键预览状态：keydown/keyup 显示当前修饰前缀与主键，所有键松开后保留完整有效候选。新录制先清空本地候选，防止旧绑定被误当作新采集；不完整、多主键、未知、保留键和 IME 输入不形成新保存值。原生已注册组合反馈立即显示；失焦、切换、取消与结束清理瞬时状态。
- 修改范围为 `ShortcutSettings.tsx`、`src/app/shortcuts/recording.ts` 及内部导出、英中消息/schema、两份快捷键测试、对应英中 frontend-guidelines、proposal/design 与接受的 `host-settings` / `launcher-shortcuts` delta 和 stable specs。未改变配置 v2、原生命令、Rust、公共包或协议版本。
- 真实 Semi UI **62/62**、模型/桌面边界 **12/12** 通过；完整 `pnpm run app:test` **846/846** 通过。`pnpm run app:typecheck`、`pnpm run app:check`、`pnpm run app:build` 均通过，无 warning/error。覆盖两种语言/主题、无录制监听时双击仍可选、重复双击冲突、lease 切换和迟到释放、实时按下/松开、native candidate、旧候选遇无效新输入及失焦清理。
- 已同步对应英中文档与接受规范，保留既有 requirement/scenario 标识。没有新增文档目录、索引、语言或治理入口，本轮不新增 project-level audit 触发。Rust 与公共包未改动，本轮不重复其此前已通过的 Cargo/consumer/CI 验证；记录仅说明本次实际执行的应用验证。
- 未进行真实 macOS 输入、WebView/GUI 或视觉像素验收；未归档、提交或发布。
- 最终严格校验 46/46（1 Change、45 stable specs）及 `git diff --check` 通过。


## 11. 精简说明与统一分组标题（2026-10-29）

- [x] 11.1 移除介绍段、录制/未保存说明及双击设置说明，两个内容分组改为同级“系统快捷键”/“功能快捷键”，sidebar 仍为“快捷键”，同步英中消息/schema、文档与接受规范。
- [x] 11.2 适配真实 Semi 回归验证，不再依赖被移除的提示文字作为录制等待信号；完成应用测试、类型/格式静态检查/构建、严格规范校验及范围审计，记录 Rust/公共协议未改动，不归档或发布。

### 说明精简与标题层级补充审计（2026-10-29）

- 已移除内容标题下介绍段落、录制/等待录制/未保存编辑提示与双击时限说明，编辑行仅保留靠右的保存/取消。内容分组标题为“系统快捷键”/“功能快捷键”（System shortcuts / Feature shortcuts），均使用同级 h3；左侧导航与整体区域名称仍为“快捷键”。空反馈区域保持可访问 live region，但不预留可见间距，实际保存/错误/授权/迁移反馈继续按状态显示。
- 删除已失效的 aria-describedby，录制控件通过 aria-busy 表示等待状态；即时键位、Esc、lease 与保存逻辑没有改变。清理 7 个不再使用的说明消息键，英中消息/schema 同步，避免残留死文案。
- 更新 `ShortcutSettings.tsx`、英中消息/schema、`tests/launcher-shortcuts-ui.test.tsx`、英中 frontend-guidelines、design 与 `host-settings` delta/stable。没有修改 Rust、配置或公共协议，也没有增加依赖、脚本、文档目录或治理入口；本轮不新增 project-level audit 触发。
- 真实 Semi 回归 **62/62** 通过：4 种 locale/theme 组合验证两个同级标题、导航名称不变，以及普通、录制和双击编辑态均不呈现说明文本。原交互回归改为依赖控件状态与真实按键/服务结果，不再以被删除文案作为录制等待信号。
- `pnpm run app:test` **846/846**、`pnpm run app:typecheck`、`pnpm run app:check`、`pnpm run app:build` 全部通过，无 warning/error。未改动 Rust/公共包，故未重复其此前通过的 Cargo/consumer/CI 检查；未执行真实 GUI/原生输入验收、归档、Git 提交或发布。
- 最终严格校验 46/46（1 Change、45 stable specs）与 `git diff --check` 通过。


## 12. 分组底部操作位置与文案（2026-10-29）

- [x] 12.1 将“恢复默认快捷键”放在系统分组末尾、“添加功能快捷键”放在功能分组末尾，两者均在对应底部分割线上方右对齐；同步英中文案与分组结构，保留恢复全部配置的确认语义。
- [x] 12.2 适配既有四种 locale/theme 回归，核对分组归属、顺序、对齐与原交互；完成应用测试/类型/格式静态检查/构建、英中文档和接受规范同步、严格校验与范围记录，不重复未改动的 Rust/公共包验证。

### 分组操作位置补充审计（2026-10-29）

- “恢复默认快捷键”移动至系统分组末尾、第一条分组分割线上方并右对齐；“添加功能快捷键”移动至功能分组末尾、第二条分组分割线上方并右对齐。英文对应 Restore default shortcuts / Add feature shortcut。
- 两个同级标题分别拥有命名 section，底部主题分割线归分组所有，行分割线只出现在相邻配置之间。按钮 ID、键盘焦点恢复、禁用条件和事件处理保持；恢复默认仍先确认并作用于整个快捷键配置。
- 已同步英中 frontend-guidelines、design、host-settings delta/stable 和按钮消息。没有新增文档、索引、语言或治理入口，本轮不新增 project-level audit 触发。未修改 Rust、配置格式或公共包。
- 既有四种 locale/theme 矩阵验证新文案、命名分组归属、组末尾位置和右对齐；快捷键 UI **62/62**、完整 `pnpm run app:test` **846/846** 通过。`pnpm run app:typecheck`、`pnpm run app:check`、`pnpm run app:build` 全通过，无 warning/error。
- 规范严格校验 **46/46**（1 Change、45 stable specs）和 `git diff --check` 通过。此轮为布局/文案调整，未重复未改动的 Cargo、公共包 consumer 或 CI；未进行真实 GUI/像素验收、归档、提交或发布。


## 13. 仅恢复系统快捷键（2026-10-29）

- [x] 13.1 恢复默认只替换系统 launcher，保留最新确认快照全部功能配置；默认键占用时报冲突不覆盖功能，迁移也保留 Action；同步确认文案、接受规范与英中文档。
- [x] 13.2 回归系统恢复成功/失败重试、占用冲突、迁移及对话框期间功能配置更新，完成应用测试、类型/格式静态检查/构建、严格规范校验与范围证据，不重复未改动的 Rust/公共协议验证。

### 系统专属恢复补充审计（2026-10-29）

- 本次用户指令取代此前整体恢复范围：按钮仅恢复系统 Launcher 为 Ctrl+Shift+Space，全部功能/Action 绑定原样保留；先前整体恢复记录保留为历史。
- 确认操作读取最新 confirmed snapshot，通过 `replaceShortcut(..., 'launcher', defaultShortcutConfiguration().launcher)` 只替换系统字段，保留 revision 与 Action 映射。默认组合被功能（含不可用但仍保留的绑定）占用时报告冲突，不写入、不清除或改绑功能。旧双入口迁移仍需显式 resolve，且保留其 Action 数据。
- 确认文案英中同步，明确功能快捷键不变；保存/冲突错误在对话框内可见，避免只显示在遮罩后的页面。打开确认清除旧反馈，确认期间的最新功能配置更新不会被旧快照覆盖。
- 更新前端实现、确认文案、回归、英中 frontend-guidelines、design 及 host-settings / launcher-shortcuts delta 与 stable specs。未改变 Rust 命令、配置格式、公共包、依赖或验证入口，本轮不新增 project-level audit 触发。
- 快捷键 UI **64/64** 通过，覆盖保留两项功能配置、失败重试、默认键冲突 no-write、迁移保留与确认期间 revision 更新。完整 `pnpm run app:test` **848/848**，`pnpm run app:typecheck`、`pnpm run app:check`、`pnpm run app:build` 全通过，无 warning/error。
- 严格规范校验 **46/46**（1 Change、45 stable specs）和 `git diff --check` 通过；当前维护文档和规范已无“恢复时清空全部 Action / whole-configuration restore”断言，首次安装的空 Action 默认值仍保留。未重复未改动的 Rust/公共包 consumer/CI 检查，未执行真实 GUI、归档、提交或发布。


## 14. 功能快捷键列表简化（2026-10-29）

- [x] 14.1 移除功能配置行间分割线，保留分组底线；Feature 目标按内置稳定 ID 排除“隐藏启动器”和“设置”，既有目标回填不重新加入菜单，不删除历史配置或改变搜索/Registry。
- [x] 14.2 覆盖英中新建/编辑/历史绑定菜单与保留数据，完成应用测试、类型/格式静态检查/构建、英中文档和接受规范同步、严格校验与范围记录；不重复未改动的 Rust/公共协议验证。

### 功能列表与目标筛选补充审计（2026-10-29）

- 已移除功能配置行之间的 border，仅保留间距和分组底部分割线。新建与编辑目标菜单按 `HIDE_LAUNCHER_ACTION_ID` / `OPEN_SETTINGS_ACTION_ID` 排除内置“隐藏启动器”和“设置”，已有行的 fallback 不会回灌这两个选项。
- 筛选依据稳定 ID 而非本地化名称，不移除普通 Launcher 搜索或 Registry 中的操作。已有已保存配置不自动删除；折叠选择可标识历史目标，用户可明确改绑或删除。同名插件仍正常可选。
- 修改范围为 `ShortcutSettings.tsx`、`global.less`、UI 回归、英中 frontend-guidelines、design 与 host-settings delta/stable。无新增依赖、脚本、目录或治理入口，本轮不新增 project-level audit 触发；未修改 Rust、配置格式和公共协议。
- 快捷键 UI **70/70** 通过，新增英中菜单覆盖新建、编辑、历史回填、无隐式写入、改绑/删除及同名插件保留。完整 `pnpm run app:test` **854/854**、`pnpm run app:typecheck`、`pnpm run app:check`、`pnpm run app:build` 全通过。renderSelectedItem 的显式类型问题已修复后重跑，无 warning/error。
- 严格规范校验 **46/46**（1 Change、45 stable specs）与 `git diff --check` 通过。未重复未改动的 Cargo/consumer/CI，未进行真实 GUI/像素验收、归档或 Git 提交发布。

## 归档复核（2026-10-29）

本节按用户的独立归档请求复核最终接受范围，包含第 9–14 组追加交互；此前“未归档”的记录仅描述对应执行阶段。

### 规范同步与范围

- 当前 schema 为 `spec-driven`，proposal、design、specs、tasks 均为 done，CLI 统计 66/66 项任务完成。通过 `status` 返回的 13 个 delta 路径复核同步，31 项 MODIFIED 和 16 项 ADDED 的 47 个完整要求块与英文主规范逐块一致，无剩余合并操作。
- 主规范保持单一 `## Requirements`、规范要求与场景标题，没有 delta 操作标题或新增 TBD；`launcher-shortcuts` Purpose 与 delta 完全一致。本轮同步为幂等复核，未改写现有主规范的标题、Purpose、未提及要求或场景。
- 复核实现和测试路径：`src-tauri/src/launcher_shortcuts/`、`launcher_window.rs`、`lib.rs`，`src/app/shortcuts/`、`src/app/pages/ShortcutSettings.tsx`、Launcher actions/navigation/plugin runtime，Contract/SDK/Testkit/CLI、官方插件与模板，以及对应快捷键、连续性和公共协议测试。最终范围包括 v2 单入口与 v1 明确迁移、唯一入口失效恢复、双击直接选择、组合键实时预览、仅恢复系统快捷键、功能目标筛选及独立 activation。

### 文档与项目治理复核

- 重新核对 13 对受影响英中文档：`architecture/{overview,extension-platform,plugin-child-webview-runtime}.md`、`development/{frontend-guidelines,validation,plugin-project-template,plugin-development-mode,translation}.md`、`plugin-development/{public-packages,host-api,compatibility-and-errors,tutorial-framework-neutral,tutorial-react-semi}.md`；另核对 Contract/SDK 的两对 README。覆盖与当前源码、稳定规范和最后追加范围一致，无需更新分类文档。
- 本 Change 的项目级审计仍触发：公共包 README 的版本及导航发生修改。已重新检查根 README 双语入口、`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、英中索引及 project-workflow，确认职责、导航、语言、临时目录和生命周期规则一致，未发现需要修复的治理缺口。后续 UI 调整没有新增触发，不能替代对整个 Change 的项目级复核。
- 24 对文档路径一致；38 个审计 Markdown 的 157 个相对链接全部可解析，其中 36 个带锚点。122 处 Gate/Generate 命令引用均能解析到注册 ID；`launcher-shortcuts` plan 含 15 个 Gate、51 个步骤，均声明为只读。`spec-driven` schema 可解析。四类临时目录已忽略，没有已跟踪临时文件、正式文档临时链接、陈旧 Change 专属 alias 或 Evidence dispatcher 引用。
- 本轮维护修改仅为本任务文件的当前状态说明、归档审计证据和移动后所需的项目流程相对链接；无需修改 stable specs、英中文档、索引、治理入口或生成集成。归档完整保留 `.openspec.yaml` 及其余 16 个产物文件，移动后已重新验证路径、链接和内容校验值。

### 当前验证与证据边界

- `pnpm run test`：153 个测试文件、1,637/1,637 项通过，其中应用 854 项，无失败、跳过或待办。`pnpm run typecheck`、`pnpm run check`、`pnpm run build` 全通过，未发现引入的 warning/error。
- `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 全通过，Rust workspace 305/305 项，其中快捷键 40/40 项，无编译 warning/error。
- `openspec validate add-configurable-shortcuts --strict` 与 `openspec validate --specs --strict --no-interactive` 通过，全部 45 份 stable specs 无失败；`git diff --check` 通过。
- 本轮完整 Gate 组合全部通过：`pnpm run gate -- launcher-shortcuts plugin-host-api-dispatcher plugin-management-settings plugin-testkit plugin-project-template plugin-developer-cli validation-governance ci-lensx ci-plugins`，最终退出 0，日志没有新的 warning/error。首次执行因沙箱阻止向机器全局 pnpm store 注册临时消费者链接而失败，通过权限审查后重跑同一命令成功；没有使用仓库本地 store 或重建根 `node_modules` 的 workaround。实际 tarball、两类生成模板、纯 CLI 消费者、Rust 包准备及两组 CI 的构建闭包均已验证。
- 上述证据只覆盖确定性逻辑、协议、组件交互、纯 CLI/包消费与编译；没有执行真实 macOS 输入/授权、Secure Input 实机切换、WebView/GUI、像素或目标环境性能验收。未执行 Git staging、commit、push 或发布。

归档准备结论：同步、实现验证、文档与项目治理审计均已完成，66/66 项任务完成，没有未解决的范围内阻塞，可以按本次授权归档。

归档执行结果：已移动至 `openspec/changes/archive/2026-10-29-add-configurable-shortcuts/`，活动变更列表为空。归档前 `openspec validate --all --strict --no-interactive` 46/46 通过，归档后 45/45 stable specs 通过；17 个归档文件齐全，除本任务记录外 16 个文件的校验值未变，13 份主规范也未发生本轮改写。归档内 5 个相对链接（含流程锚点）已按最终路径检查通过，`git diff --check` 通过。未提交或发布。
