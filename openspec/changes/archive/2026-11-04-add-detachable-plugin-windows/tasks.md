# Tasks

本清单跟踪实现进度；仅在行为与对应验证完成后勾选。行为以本变更 `specs/` 为准，技术决策见 [design.md](design.md)。每组在推进下一依赖组之前完成自己的测试与双语文档更新，最终组只做集成复核和归档准备。

规划阶段已执行 `openspec validate add-detachable-plugin-windows --type change --strict --no-interactive`，结果通过。额外结构检查确认 proposal 的 11 个 capability 与 delta 文件一一对应、37 个 MODIFIED requirement 保留原有全部场景、Markdown 相对链接可解析、50 项实现任务均未勾选。`pnpm run gate -- --list` 已确认复用 Gate 存在；新增 `plugin-detached-windows` Gate 尚待实现。规划轮没有运行产品测试或构建，这些规划检查不替代第 8 组的实现验证、文档治理审计和同步后验收。

## 1. 建立实例与窗口所有权模型

- [x] 1.1 将 Rust Child registry 从全局 `current` 改为 attempt 实例映射及 surface 唯一绑定，保留全局唯一 attempt/source；用 Cargo 测试证明 main 与两个同插件独立实例可并存且每窗口最多一个。
- [x] 1.2 定义并校验私有 window owner、ownership revision、迁移 token 与有界命令 payload；用 parser/状态测试覆盖伪造 window、错误来源、重复 token、旧 revision 和身份复用拒绝。
- [x] 1.3 将呈现 controller、slot revision 和清理操作绑定到实例及 owner；扩展现有 Child service/slot/presentation 测试，证明旧 main 的 resize、hide、focus、destroy completion 不命中已分离实例或新实例。
- [x] 1.4 将 Runtime/Session 管理从 React 当前 Page 卸载逻辑中解耦，保留中央 Host dispatcher 的应用级生命周期；用 `tests/plugin-runtime-lifecycle-controller.test.ts` 及相关 composition 测试验证呈现解绑不终止实例、真正 app teardown 清理全部。
- [x] 1.5 更新 `docs/en/architecture/plugin-child-webview-runtime.md` 与 `docs/zh/architecture/plugin-child-webview-runtime.md` 的实例、surface、来源与生命周期模型；核对语义一致及现有链接。

## 2. 扩展资源租约、Session 与终止隔离

- [x] 2.1 将 Resource Service 的单来源授权改为 generation scope 加独立 source/attempt 租约及有界创建预留；Cargo 测试覆盖两个同插件来源并行、关闭一个不撤销另一个、预留失败/取消/超时清理。
- [x] 2.2 实现最终租约和预留释放后的 scope 永久退休以及后续新 scope 分配；测试重复 resolve、cache hit 前后终止、旧来源使用兄弟 URL、generation retirement 和无旧授权复活。
- [x] 2.3 保持每实例 data-store、Session、bridge freshness 和请求空间独立，并使分离保持原绑定；以 Session/RPC fixtures 验证跨实例同 requestId、错误来源、过期回调、重放及零未授权 handler 命中。
- [x] 2.4 将 close/retry/failure 只作用于所属实例，将 disable/uninstall/upgrade/replace/已提交 development reload 扩展为匹配实例 fanout；测试提交前 reload 失败保留全部旧实例、无关插件不受影响及全应用退出清空。
- [x] 2.5 实现按 entry/generation 聚合的 breaker，保留 3 次/60 秒及 30 秒冷却并只阻止新建；虚拟时钟测试覆盖健康兄弟不抹除失败、无故障且 ready 的清零条件、分离不重置与冷却后无自动重启。
- [x] 2.6 更新 `docs/en/architecture/extension-platform.md`、`plugin-child-webview-runtime.md` 与对应中文镜像的 scope、来源租约、data-store 和实例/插件/进程清理边界；以 `plugin-contract-docs` 等现有文档断言验证无单实例冲突。

## 3. 实现原生迁移、回滚与恢复失败处理

- [x] 3.1 修正固定 Tauri/runtime-wry/Wry reparent 路径的 wrapper/native/registry 归属事务并跨全部阶段保留原始恢复快照，避免先移除记录后失败丢失；用 production policy 的纯 Rust fake-adapter 测试覆盖目标缺失、目标销毁、native/registry 失败与补偿本身无法确认，验证成功补偿或原实例恢复上下文仍受控保留。
- [x] 3.2 为 Host native adapter 定义私有迁移契约并实现可注入 adapter 的迁移状态机，覆盖隐藏目标准备、同 WebView 移动、目标 slot/clip/reveal/focus、main Home/Hide 与单次提交；通过生产策略的有序 fake-adapter 测试确认不增加 resolve/create-plugin/load/bootstrap/disconnect/destroy 次数，真实 shell 接线留给 4.3。
- [x] 3.3 在可注入 adapter 的生产状态机中实现全阶段同实例 rollback，包括目标 chrome 超时、bounds、reveal、focus、main 复位/hide 及 Launcher recovery 丢失；前向失败且补偿成功恢复 main，补偿本身无法确认进入 `recovery_required`。故障注入验证原实例/输入模型/Session 保留、不重载/重放/自动销毁、不伪报成功，必要目标在确认真实归属前受控保留而非误清理；真实 shell 仍非本组前置。
- [x] 3.4 将迁移与 close、Page replace、disable、upgrade、reload、Quit 通过 token/revision 协调，禁止跨主线程等待持 registry 锁；以可控 barrier 测试提交前后竞态、重复 D、旧回调及幂等终止。
- [x] 3.7 保留可重入的 `recovery_required` 原始上下文，以同一 attempt/token 支持明确重试原补偿、再次失败保留、确认恢复后释放及明确关闭/插件失效/Quit 的协调；冻结受影响 owner 和重复分离，保证 main 修复入口可见，按真实 native 归属安全清理；Cargo 故障与 barrier 测试验证有界重试、旧 callback、终止 fanout、当前来源权限和零额外 load/Session/Action。
- [x] 3.5 对修改过的 vendor 文件完成原生策略测试、对应 rustfmt、锁定依赖编译和 reviewed diff；仅审阅后运行 `pnpm run generate -- frame-aware-navigation-dependency-drift --write`，再以只读 `frame-aware-navigation-dependency-drift` Gate 验证 baseline 一致。
- [x] 3.6 更新 `docs/en/architecture/plugin-child-webview-runtime.md` 与中文镜像的迁移步骤、成功补偿、`recovery_required` 上下文/明确恢复/关闭/Quit 边界及证据局限；确认未添加 GUI、真实 WebView 或原生交互验收入口。
- [x] 3.8 修复主窗与独立窗口的 macOS 尺寸及约束确认，在受归属保护的主线程操作完成后读回同一几何语义，再提交或回退窗口状态。

## 4. 接入窗口级 Host shell、导航与 API

- [x] 4.1 增加轻量可信 detached Host shell 启动模式，复用构建产物但不重复主 App bootstrap、Plugin Manager、快捷键或中央 dispatcher；composition 测试断言多窗口只注册一套全局服务。
- [x] 4.2 实现 Rust 从实际 Host WebView 派生窗口绑定的私有控制面及窄 Tauri capability；negative tests 覆盖伪造 URL/label、跨窗 slot/close、插件调用 Host 命令和动态 label 通配越权。
- [x] 4.3 将第 3 组迁移状态机接线到已完成的真实 Host shell、窗口控制面和 native adapter，接入目标 ready、slot/clip/reveal/focus、main Home/Hide、错误回滚与恢复失败态的上下文/ACK/明确恢复及终止；用生产 composition/调用边界测试与 Cargo 构建验证整条路径使用已测试策略，并在窗口建立/销毁竞态下无重复启动或泄漏，不启动 GUI。
- [x] 4.4 将 navigation handler、ActivePage 关联和 activation channel 按 surface 管理；扩展 `tests/app-shell-navigation.test.tsx`，验证 main 新开 A₂、main 同 Page 复用、detached 内部换 Page、分离移交而不 dispose/replay，以及恢复失败态冻结受影响 surface 的普通导航并保留原 activation。
- [x] 4.5 将 `ui.close` 后响应效果、`actions.open` 和 Host Context/event 路由绑定调用 Session 的当前 owner；dispatcher 测试覆盖响应前分离、响应失败零 close effect、同插件另一窗口获焦、不合法本地 Action、迟到关闭、恢复失败态 `actions.open` 有界 `unavailable` 和成功响应后仍可明确关闭原实例。
- [x] 4.6 保留 HTTP 每 attempt 4/全局 16/DNS worker 16 及 RPC 配额，迁移中持续交付原请求，关闭一实例只取消其工作；测试跨窗口相同 requestId、迁移后单次结果与 generation 全体取消。
- [x] 4.7 保持 `storage.*` 插件级共享和串行提交、浏览器及业务内存按实例隔离；测试同 key 并发提交、后续读取、跨插件 namespace 拒绝，以及没有自动输入同步或隐式重启恢复。
- [x] 4.8 更新 `docs/en/plugin-development/host-api.md`、`runtime-permissions-security.md` 与相同路径中文镜像，说明调用者窗口导航/关闭、共享配置、独立临时状态和无需改包；通过现有文档/公共包边界检查。
- [x] 4.9 独立 Host shell 先确认订阅再上报首次就绪几何，即使订阅快照 revision 与启动快照相同也必须上报。处理布局变化、替换及卸载期间的迟到结果。

## 5. 配置默认 Cmd+D 与精确原生键路由

- [x] 5.1 扩展 TS/Rust 快捷键私有配置和 snapshot 为 v3 的可空 detach chord，并保留 Host 私有未解决迁移记录；共享 fixtures 测试新用户 `Cmd+D`、v1/v2 只读投影、显式保存、保留旧 revision/绑定和冲突不被无关保存清除。
- [x] 5.2 将 detach 与 global Launcher/Action 纳入同一 canonical 冲突校验，但不进入 global registration；测试双向冲突、unavailable 占位、旧 Cmd+D 保留、恢复默认失败以及局部故障不影响 Launcher recovery。
- [x] 5.3 在唯一 macOS foreground local monitor 中接入默认及自定义 detach chord，从 actual key Window/可信实例验证 ready、overlay、录制、原生输入法组合、Launcher recovery 与 `recovery_required`；策略测试覆盖 Host/Child 获焦、其他应用、detached 透传、无焦点、自动重复和重复投递。
- [x] 5.4 更新快捷键设置固定分离行、录制/改键/清除/恢复默认/冲突反馈，复用 Semi 和现有 i18n；真实组件测试覆盖 English/简体中文、明暗主题、可访问名称、Escape、保存后焦点和旧响应失效。
- [x] 5.5 将 W 路由为 key Window 的 main Hide 或 detached Close，将 Q 路由为全部实例退出；Cargo 策略测试验证无重复入口、目标失效不改投新窗口、录制时保留命令、恢复失败态 main Hide 被阻止而明确实例关闭/Quit 仍可执行，以及其他前台应用不被截获。
- [x] 5.6 更新现有中英文 Runtime/验证文档中的应用内与全局快捷键区别、Cmd+D 对主窗插件同键操作的优先级和迁移冲突处理；通过 `launcher-shortcuts` Gate 及文档断言。

## 6. 完成独立窗口展示与交互

- [x] 6.1 增加主窗口 chrome 分离控件及加载/不可用/迁移中/失败/恢复失败态反馈，禁止 overlay 或组合输入中绕过分离条件；组件测试验证键盘访问、状态与快捷键提示、双语/主题及不泄漏内部诊断。
- [x] 6.2 将尺寸、resizable、work-area fitting、slot 与窗口裁剪应用到实例 owner，分离保留有效尺寸，新开仍用 Manifest 初值；扩展 presentation/slot 测试覆盖双窗口分别 resize、scale change 和旧 main revision。
- [x] 6.3 实现独立窗口不全局置顶、失焦保持显示、关闭仅终止自身，主窗口分离后 Home 隐藏并能独立唤回；窗口策略和 App Shell 测试覆盖 main 与两个同插件窗口、其他插件并发和恢复入口失败/补偿失败时 main 修复入口必须可见。
- [x] 6.4 保留有效 native responder、输入/选择/撤销与任务状态，分离后焦点交给原插件，main 再召唤只恢复自己的输入；以 production focus policy、真实编辑 handlers 和明确模型状态测试防止旧 owner 强抢焦点及重复编辑。
- [x] 6.5 向每个当前可信 shell/Session 更新主题、语言及本地化 Page 元数据，终止后取消监听；多窗口组件/Context tests 验证更新无重载、无跨实例 activation 广播及无监听泄漏。
- [x] 6.7 增加 English 默认/简体中文的恢复失败反馈与“重试恢复”“关闭实例”“退出”明确控件，复用 Semi、主题和 i18n；组件及调用边界测试验证可访问名称、键盘/焦点、重复 D 禁止、main Hide 禁止、有界恢复再失败/成功、关闭/Quit 可用和旧响应无效；证明“重试恢复”不调用创建新 Runtime 的普通 Retry，也不泄漏内部诊断。
- [x] 6.6 同步 `docs/en/architecture/overview.md`、Runtime 文档、`docs/en/development/config-lens.md`、`translation.md` 与对应中文路径的用户行为、恢复失败态和恢复/关闭/退出边界；检查全部受影响导航链接，按实际需要维护索引。
- [x] 6.8 移除插件 Page 上的通用 Action 失败提示和普通窗口操作错误提示/检查按钮，保留实际恢复 ticket 的明确操作。在 Host 私有开发诊断中记录失败步骤与细分原因，不暴露插件数据。
- [x] 6.9 移除主窗插件 Page 的分离控件、键位提示及其专用鼠标接纳和命令权限。保留设置中的分离快捷键、原生按键路由和明确恢复操作。
- [x] 6.10 为 macOS 独立窗口提供无可见标题的原生标题栏，仅显示关闭、最小化和缩放按钮。shell 移除重复的 HTML chrome，插件从内容区原点铺满，保持内容尺寸、焦点和按实例关闭语义。
- [x] 6.11 将独立窗口绿色按钮改为切换 macOS 原生全屏。进入和退出全屏均保留同一插件实例，退出时恢复原窗口尺寸。

## 7. 组合稳定 Gate 与跨层回归

- [x] 7.1 在 `scripts/validation/catalog.ts` 注册只读 `plugin-detached-windows` Gate，组合上述确定性测试与既有依赖 Gate；用 validation-governance tests 验证无新根脚本、嵌套 shell 验证图、写入 baseline 或环境启动步骤。
- [x] 7.2 增加跨层状态矩阵：A₁ 分离→A₂ 同插件新开分离→main 打开 B→关闭 A₁→A₂ 请求完成→插件失效→Quit；另覆盖 `recovery_required`→明确恢复/关闭/Quit 与 generation 失效分支；断言实际实例、响应、保留上下文、清理次数、scope 存续及终止后零残留，不仅验证调用发生。
- [x] 7.3 以官方 ConfigLens/Translation 的既有业务逻辑和合规/恶意插件 fixtures 验证无需 SDK/Manifest 更新，覆盖输入/撤销/Worker/HTTP 连续性、公共包边界和 Development Mode；全部在确定性测试及纯 CLI consumer 范围内完成。
- [x] 7.4 更新 `docs/en/development/validation.md` 与中文镜像的 Gate 组合、命令和证据范围，说明模型/生产策略/编译分别证明的边界；验证 Gate 清单中仅新增稳定 capability ID。

## 8. 最终验证与归档准备

- [x] 8.1 执行新增 `pnpm run gate -- plugin-detached-windows`，以及受影响的 `plugin-child-webview-window-lifecycle`、`plugin-child-webview-continuity`、`plugin-child-webview-session`、`plugin-child-webview-runtime`、`plugin-child-webview-resource-binding`、`isolated-plugin-runtime-origin`、`plugin-host-api-dispatcher`、`plugin-host-http`、`plugin-scoped-storage`、`launcher-input-focus`、`launcher-shortcuts`、`plugin-development-mode`、`frame-aware-navigation-dependency-drift` Gates；记录实际命令、结果和覆盖，已有依赖图可去重但须可追溯。
- [x] 8.2 分别执行 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，记录完整 frontend/workspace 结果；不得把定向 Gate 通过当作全量通过。
- [x] 8.3 分别执行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`；另以 `cargo test --locked --manifest-path src-tauri/Cargo.toml --features plugin-development-mode` 及对应 `cargo check`、`cargo build` 验证受影响 feature，记录实际结果。
- [x] 8.4 对本变更新增或触及的 vendor 路径执行对应格式检查、纯策略测试和固定依赖编译，复核 integrity baseline；消除引入的所有 warning/error，重跑失败命令及完整最终验证集合。
- [x] 8.5 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 完成 change-scope 文档与治理审计，在本文件记录最终接受范围、检查路径、结论与理由、实际更新文件及实际验证；规划期检查不能替代此审计。
- [x] 8.6 评估并记录 project-level audit 触发决定：普通分类文档修改本身不触发；索引、新文档、治理、语言或生成集成修复若触发则执行额外审计；修复后再次判断并记录理由，不以“未改文档”代替覆盖证据。
- [x] 8.7 在同步/归档准备阶段将本变更 delta 翻译并同步到英文 stable specs，保留全部适用场景，修正受影响 Purpose 的单窗口/旧 Runtime 表述；同步现有中英文 docs、索引和链接，验证所有 capability 名称及 requirement rename 一致。
- [x] 8.8 扫描根 manifest、CI、维护文档与 stable specs 的临时 Change alias、直列测试文件脚本、递归验证图及退役 Evidence/GUI 路径；通过现有 governance/docs 检查，并记录中文镜像语义和链接复核结果。
- [x] 8.9 执行 `openspec validate add-detachable-plugin-windows --type change --strict --no-interactive` 与同步后的相关 stable spec strict validation；记录继承问题与本变更问题的区别，完成前序全量检查后才能宣称实现及归档准备完成。归档、提交与发布仍须后续单独指令，本清单不自动执行。
- [x] 8.10 验证尺寸切换、就绪握手与失败诊断的回归，复核中英文 Runtime 文档及稳定规范；记录本次修正后的实际验证与限制。
- [x] 8.11 验证主窗无分离提示、原生标题栏和全内容区边界，复核快捷键/ACL、正常与开发配置、相关稳定规范和中英文文档。

## 实施证据（持续更新）

### 2026-11-04 归档复核

- **最终范围。** CLI 确认 proposal、design、specs、tasks 均已完成，任务为 60/60。复核涵盖实例分离与恢复、按窗口归属的资源和 Session、快捷键、可信 shell，以及 6.8–6.11 和 8.10–8.11 的后续修正。以 `src-tauri/src/{plugin_detached_window_native,plugin_detached_window_migration,launcher_surface}.rs`、`src/app/windows/`、`tests/{launcher-rounded-corners,plugin-detached-window-composition}.test.*` 和窗口权限清单核对最终行为。主窗只提供已配置的分离组合键，保留真正的恢复入口。独立窗口使用原生标题栏，绿色按钮切换原生全屏，普通窗口的边缘调整权限独立于全屏。
- **规格同步。** 按 CLI 返回的 11 个 delta 路径与英文稳定规格逐一比较。16 项新增、40 项修改和其中两项重命名均已同步，315 个 delta 场景的标题、顺序、条件和结果标记均对应，旧名称已移除。与仓库基线比较，422 个已有场景均保留，42 个未涉及的需求块保持原文。本次复核无需重写稳定规格。
- **文档与治理。** 复核 9 对分类文档，包含架构、Host API 与安全、官方插件、前端规范和验证说明。修正 `docs/{en,zh}/architecture/overview.md` 的主窗尺寸与来源校验说明，在同目录的 `plugin-child-webview-runtime.md` 中区分脱离视图层级和独立窗口中的 Child，并注明全屏期间切换 Page 后应用尺寸的时机。两种语言各 24 份 Markdown，路径一致；24 份受影响文档及入口的 123 个本地链接（含 32 个锚点）有效。文档位置与索引条目均适用。
- **项目级审计。** Gate 注册和 Tauri 权限生成配置触发项目级复核。检查 `scripts/validation/catalog.ts`、`src-tauri/{build.rs,command_inventory.rs,capabilities,permissions}`、两份 README、根及 docs 的 AGENTS、语言政策、OpenSpec 配置、双语索引、根 manifest、CI 和忽略规则。普通与开发构建按各自命令清单生成 main 权限，独立 shell 只获 6 个启动、订阅与几何命令。既有 Gate 和 Generate 入口仍适用，根 scripts、CI、文档及稳定规格中未发现废弃的验证别名。四个项目根临时目录均被忽略且没有已跟踪文件。复核后的双语修正只涉及原有分类文档，项目级触发结论不变。
- **当前源码验证。** `pnpm run test` 通过 1,751/1,751 项（160 个文件）；`pnpm run typecheck`、`pnpm run check`、`pnpm run build` 分别通过。Cargo 格式检查通过；普通配置和 `plugin-development-mode` 配置分别通过锁定的 test（489/489、519/519）、check 和 build。`openspec validate add-detachable-plugin-windows --type change --strict --no-interactive`、稳定规格 strict（46/46）、全仓 strict（47/47）、`node scripts/check-plugin-contract-docs.ts` 及 `git diff --check` 通过。CLI 的 6 条 INFO 指向已同步的 ADDED 需求。
- **组合 Gate。** `pnpm run gate -- plugin-detached-windows` 通过，33 个能力、101/101 个步骤的实际顺序与执行计划一致。首次执行被沙箱阻止在全局 pnpm store 注册临时消费者，按同一配置重跑成功。临时 UI 包消费者仍报告此前记录的 peer 依赖提示。
- **实机证据边界。** 此前实测了 ConfigLens 的快捷键分离、焦点、最小化、当时版本的缩放和关闭。最新绿色按钮的原生全屏进入、退出和尺寸恢复未做实机复验；早期缩放记录仅适用于当时版本。
- **归档后复核。** 调整 `design.md` 中指向 Wry 和迁移 driver 的 3 个源码链接后，归档内 7 个本地链接（含 2 个锚点）全部可解析。`.openspec.yaml`、14 份 Markdown 制品和 60 项已完成任务均已保留；11 份 delta 和对应稳定规格的内容摘要与移动前一致。活动清单为空，归档后的全仓 strict 为 46/46。

### 独立窗口绿色按钮切换原生全屏

分离窗口使用 AppKit 的 `FullScreenPrimary`，绿色按钮独立于普通窗口的边缘缩放权限。宿主在全屏时暂停普通窗口尺寸写入。全屏中切换插件页面时，宿主保留该页面的窗口尺寸请求，回到普通窗口后再应用。

本次按用户要求未运行测试或启动 GUI。手动验收方式为单击分离窗口的绿色按钮进入 macOS 全屏，再次单击退出并确认原窗口和插件内容恢复。下方记录的缩放操作是此前标题栏版本的实测结果。

### 移除主窗分离提示与独立窗口原生标题栏（此前版本）

- 按最新交互要求修订此前的 Page chrome 设计。主窗仅保留原上下文胶囊和关闭按钮，移除独立的分离标签、键位提示、点击区域和相关 renderer 命令。配置的本地组合键继续按原生焦点/IME/恢复条件接纳；清除组合键后可在快捷键设置中重新配置。真正的 recovery ticket 保留已有操作。
- macOS 独立窗使用不覆盖内容的标准系统标题栏，只显示原生关闭、最小化和缩放按钮。可访问的语义窗口名保留，标题栏隐藏文字。可信 shell 不绘制第二套标题/关闭/拖动条，slot 从内容原点 `(0, 0)` 填满整个内容区。主窗使用原 18 点外轮廓，独立窗的矩形内容根与系统边框衔接。
- 私有 ACL 删除四个已无产品调用者的 renderer 操作，独立 shell 只保留 6 个启动/订阅/几何命令。窗口系统关闭、`ui.close`、本地 W/Q 与恢复流程仍由原有实例/owner 边界处理。普通/开发 AppManifest 的 main 命令清单为 63/68，移除的命令均不再出现在生成授权中。
- 真实 ConfigLens 分离验证显示主窗没有分离按钮或提示。使用 `Cmd+D` 后，窗口内容为 `800×600`，系统标题栏计入 `800×632` 外框；标题文字隐藏，三个 macOS 按钮均存在且启用。已验证最小化、恢复同一窗口、缩放到 `1512×872`、再次缩放回原尺寸，以及仅关闭本次独立窗口。这是一次性实机观察，没有增加 GUI 验收命令。
- 最终构建再次确认主窗 17050 与独立窗 17060 为不同原生窗口。独立窗使用系统不透明背景，语义标题随当前 Page 更新，视觉上没有标题文字。最终尺寸快照采用计入系统边框后实际可用的目标内容区，回滚使用该尺寸。完整 workspace 测试 1,750/1,750（160 文件，主应用 966 项），类型检查、静态检查及生产构建通过。Rust 普通模式 489/489、开发模式 519/519，两个配置的锁定检查和构建均通过。已关闭测试创建的独立窗，原有开发服务保留。
- 复核 `plugin-detached-windows`、`plugin-child-webview-runtime`、`plugin-page-window-presentation`、`launcher-shortcuts` 的 delta 与英文 stable specs，以及中英文概览、Runtime、前端规范、验证文档，已对齐本次快捷键入口和原生标题栏行为。生成权限的 main/独立窗口隔离与退役命令负向检查通过。README、索引、根 scripts 和插件包不需要变更。最终 `pnpm run gate -- plugin-detached-windows` 全部 101 个步骤通过，保留已记录的外部临时 consumer peer 提示；全仓 OpenSpec strict 47/47、双语文档检查和 `git diff --check` 通过。

### 2026-11-04 Host 插件呈现与分离修正

- **最终收尾**：按下文解锁后的两次成功实测完成本次桌面验收。最终完整 workspace 测试 1,758/1,758（160 文件，主应用 974 项），类型检查、静态检查和生产构建分别通过。Rust 普通 491/491、development feature 521/521，普通与开发配置的锁定检查、构建均无警告。同步窗口生命周期静态断言后完整重跑 `pnpm run gate -- plugin-detached-windows`，101/101 步骤通过。OpenSpec 全仓 strict 47/47，文档和差异检查通过。

- 两条截图提示原属 LensX Host。ConfigLens 请求 `800×600`，但 macOS 旧尺寸 setter 将操作排队后立即读回，Host 把旧尺寸误报为失败并写入通用 Action 提示。截图附近的三次目标 WebView 均在 23–34 ms 内关闭，早于 shell 页面运行。另确认订阅前上报就绪的竞态。未修改 ConfigLens、Translation、SDK 或 Manifest 的业务行为。
- 主窗与独立窗现在由同一受 owner guard 约束的主线程路径同步写入 AppKit 内容尺寸和内容约束，并从对应内容属性确认。分离目标根据真实原 attempt、当前插件注册和有效原生视口继承呈现。最终批次发布实际已应用的 slot bounds，包括准备期间发生的尺寸变化。已有主窗快照只用于对应回退。
- shell 在订阅 ACK 后主动上报本次布局，revision 相同也上报；后续 resize 串行提交，替换或卸载后的结果失效。普通 Host 窗口操作不再把两条通用错误或检查按钮绘制在插件页，只有实际恢复 ticket 显示明确恢复操作。Rust 开发诊断保留原迁移步骤、细分原因和回退结果。相关行为已同步到 `plugin-page-window-presentation`、`plugin-detached-windows`、`launcher-window-lifecycle` 的英文 stable specs、active delta 以及中英文架构文档。
- 实测前的确定性验证：相关前端 82/82，Rust 普通模式 484/484、development feature 514/514，`app:typecheck`、`app:check`、Rust 格式和 diff 检查通过。完整 `pnpm run gate -- plugin-detached-windows` 101/101 步骤通过，最终 ConfigLens 纯 CLI 产物检查包含 45 个自包含文件。原有离线 consumer 缺少外部 tarball 时只准备全局缓存；修正过期静态断言后重跑整套 Gate。未改变根验证接口或插件依赖。
- 源码冻结后，完整 workspace test 1,756/1,756（160 文件，主应用 972 项）、typecheck、check（679 文件/11 个 Biome 报告）与 build 分别顺序通过，无 warning/deprecation 或 skip/todo。严格 OpenSpec 全仓 47/47，双语文档检查及 `git diff --check` 均通过。
- 已按本次用户指令启动 `pnpm run app:dev`，新实例 PID 95050。等待期间 macOS 持续报告锁屏，未向锁定的桌面输入按键。测试实例已按精确 PID 与路径正常退出。ConfigLens 打开后的实际页面、Cmd+D 分离与焦点观察仍需在解锁桌面补验。
- 解锁后实测定位出两个后续问题。普通 Hide/Show 切换时，暂时无法恢复焦点曾导致已可见且 SDK-ready 的 Child 被销毁；现在保留原 Session，并将唯一一次重试绑定原 owner 和可见性修订，旧 slot/focus 回复失效。分离驱动还曾将快捷键服务锁竞争判定为 `RecoveryUnavailable`；现在唤出能力与录制到期均从已发布的确认事实读取，实际撤销、休眠、退出和真正的录制继续生效。接纳后先保留原窗口的回滚上下文，再处理后续失去唤出资格的情形，不会凭空进入不可修复的状态。
- **真实 macOS 验收通过**。两次成功运行均使用 `pnpm run app:dev` 打开 ConfigLens、聚焦编辑器后发送完整 `Cmd+D`。最终构建 PID 35127 的主窗 16472 从 Home 的 `650×320` 变为 `800×600`，无底部错误。14:37:42 的分离后主窗隐藏，新窗口 16481 单独显示原 ConfigLens 编辑器与格式化/压缩控件，无顶部错误和检查按钮。稳定后的实际尺寸为 `800×600`。AX 焦点窗口与屏幕上的 ConfigLens 窗口一致，连续 26 次采样保持 5.14 秒。按精确 PID/路径正常退出，开发命令退出 0，进程与 IPv4/IPv6 端口 40755 均已释放。前一次独立验收也连续确认焦点 5.15 秒。本次按用户要求进行的一次性 GUI 观察不作为维护 Gate 或 CI 步骤。

### 2026-11-04 快捷键布局 SIGTRAP 修复与实机复验

- 实际 macOS 崩溃栈确认监听线程发布快捷键快照时，经 `valid_in_layout` 进入 `TISGetInputSourceProperty`，触发 HIToolbox 的主队列断言。现在只有主线程读取 Carbon 输入源和转换物理键位，后台监听、状态发布及 detach 可用性读取拥有的 Rust 快照。保存和目标刷新先在主线程采集布局，再获取 service 锁。实际 OS 注册及按键按下仍按当前布局检查语义保留键，松键可以释放原按键状态。
- 新的真实 service/registry 工作线程用例覆盖 off-main 捕获拒绝、读取快照、Command 专属映射、保留键、无效转换以及布局替换。第一次启动复查还暴露了首次显示时 macOS 拒绝激活，以及 Tauri 开发 watcher 把生成权限文件当作源码变更。首次 Show 改为启动回调返回后由主队列执行。已确认可见时的 focus 拒绝允许一次受约束重试，新的窗口操作、归属变更或隐藏将取消重试。开发 watcher 只忽略 `permissions/autogenerated`，维护的权限、配置和源码仍受监视。
- 最终普通 Rust 478/478、development feature 508/508、`launcher-shortcuts` Gate 54/54 步骤通过。未改 SDK、Manifest 或持久化格式。
- 修正后的 `pnpm run app:dev` 已在真实 macOS 会话启动，PID 50030 持续运行到明确退出。观察期间系统报告 `CGSSessionScreenIsLocked=Yes`，前台由 `loginwindow` 持有。本轮未取得 AX 主窗与焦点窗持续一致的证据。已按精确 PID/路径退出，IPv4/IPv6 本地开发端口均已释放。解锁后需再次实测。

### 2026-11-04 启动焦点回归

- 用户的 `pnpm run app:dev` 日志显示编译成功，进程在 setup 的首次 Show/Focus 阶段退出。旧诊断将原生请求失败、归属过期和即时焦点读回失败合并为同一条消息，日志无法区分具体分支。
- 普通主窗 Show 现在在有效 owner 下执行原生焦点与应用激活请求。AppKit 可以在启动回调返回后才通知窗口成为 key window，setup 不再要求同步观察到该通知。真正的激活拒绝会保留具体原因。焦点请求指定 main，应用激活不再要求前置全部窗口。分离提交和回滚继续确认各自目标的真实焦点。
- Tauri MockRuntime 回归覆盖焦点请求已接受但 key 状态仍为 false 时首次 reveal 单次完成，以及激活拒绝和旧 owner。普通 Rust 全量 471/471、development feature 501/501、`--no-default-features` 开发构建、Rust 格式检查及 `launcher-input-focus` Gate 的 20 个步骤均通过。同步更新两种语言的架构说明。本次没有观察修复后的真实 macOS 桌面启动。

### 最终验证（源码冻结后）

- **最终完整组合 Gate 通过**：`pnpm run gate -- plugin-detached-windows` 退出 0；计划与日志逐 ID/顺序核对一致，33 个 capability、101/101 个步骤执行，无缺失或失败。任务 8.1 列出的所有依赖 Gates 均在该图中去重执行，包含 Development Mode 正/负产物、公共 pack/纯 CLI consumer、正常/恶意 fixtures、HTTP/storage、窗口/Session/continuity、快捷键、治理与文档检查。最后 ConfigLens 产物检查确认 45 个自包含文件。
- 7.3 最终 Gate 同时通过真实官方插件连续性 2/2、ConfigLens 全套 188 tests 与 Translation 全套 255 tests、已有公共 SDK/Manifest 包边界及 Development Mode 检查；使用现有插件业务逻辑，无新增 SDK 方法或 Manifest 字段。Monaco 实际 model/undo 与生产 Worker/HTTP handler 的受控交付不等同于真实 WebView 调度证据。
- 8.4 最终依赖 Gate 只读验证已审阅的 385-file integrity baseline，执行修改路径对应 vendor rustfmt、39 个纯策略测试与固定依赖严格编译；应用两种配置 check/build 均成功。无引入的 source warning/error。完整 Gate 仅保留上文已定位的既有临时 UI consumer Tiptap peer 提示；不将该外部依赖提示误报为无警告运行。
- 8.9 在全部前序检查完成后再次执行 `openspec validate add-detachable-plugin-windows --type change --strict --no-interactive`（通过）、`openspec validate --specs --strict --no-interactive`（46/46）；全仓 strict 47/47。6 条已同步 ADDED 的 INFO 不属于 warning/error；后续归档需按已同步状态处理，不能再次盲目应用 ADDED。`git diff --check` 通过。
- **结论：52/52 任务已实现并验证，范围内文档/治理与 stable specs 同步完成。** 未启动真实 macOS GUI、WebView 或 IME 验收；本证据不声称测量了真实 AppKit/WebKit 交互。不归档、不 stage/commit/push、不发布。

- 8.2 四个完整 workspace 命令分别顺序执行并退出 0：`pnpm run test` 1,749/1,749、160 个测试文件/11 个 workspace report（主应用 965；Contract 155、CLI 66、SDK 62、Testkit 23、UI 17、ConfigLens 188、Translation 255、examples 合计 18）；`pnpm run typecheck` 11 stages；`pnpm run check` 11 Biome reports/678 files 及生成物/metadata/边界检查；`pnpm run build` 11 stages。四份日志无 warning/deprecation、无 skip/todo，无需修正后续问题。
- 权限生成修复已确认：main grant 由同一 cfg command inventory 写入 Cargo `OUT_DIR`，detached grant 保持单独维护的 8 个命令；Tauri 重新生成前仅清理其忽略的 `permissions/autogenerated`。真实普通→开发→普通 ACL/授权检查逐次通过，main command 67→72→67、development 0→5→0、generated dev allow/deny 0→10→0，第三次普通结果与第一次逐字相同。新普通 release 构建无警告，6 个开发标记均不存在，原 `check-plugin-development-mode-boundaries.ts` 不改断言即通过。对应 Rstest 3/3、格式与 diff 检查通过。
- 生成修复后再次全仓 `openspec validate --all --strict --no-interactive` 47/47，Contract 文档检查通过；全部最终 Rust 命令及完整组合 Gate 正在复跑，最终完成状态以下方实际结果为准。
- 8.3 生成修复后再次分别执行全部七项 Rust 最终命令：format check、普通 test（469/469）/check/build、锁定 development-feature test（499/499）/check/build 全部通过，binary/doc-test 空目标均成功，所有捕获日志零 warning/error。未改源码或启动 GUI。

### 最终范围与项目治理审计

| 审计项 | 已检查对象、结论与证据 |
| --- | --- |
| 接受范围 | 同 WebView/Session 分离、多实例按窗口归属、成功补偿及用户批准的 `recovery_required`、逐实例/逐 generation/进程终止、v3 应用内分离快捷键、可信 chrome 和 native source/ACL 边界。检查 proposal/design、11 个 delta 与同步后的 stable specs、任务清单及对应 Rust registry/resource/Session/RPC/迁移/Host broker/native policy、React navigation/instance registry/controls/shortcut 与 vendor 事务/Channel 模块。 |
| 架构与公共边界 | `docs/{en,zh}/architecture/{overview,extension-platform,plugin-child-webview-runtime}.md`、`plugin-development/{host-api,runtime-permissions-security}.md` 已覆盖多窗口拥有者、资源来源租约、同实例连续性、恢复入口和公共 `ui.close`/`actions.open`，保留 SDK/Manifest 无新增权限边界。清除触及的 single-current、旧 permission/grant 和 iframe/MessagePort 实现叙述，历史 scenario 标识不改。 |
| 产品与工程文档 | `docs/{en,zh}/development/{config-lens,translation,frontend-guidelines,validation}.md` 已覆盖官方插件状态连续性、独立临时输入与共享配置、v3/In-app 行与迁移选择、Owner→Action→close 胶囊加独立 trailing Detach、恢复/关闭/Quit，以及确定性证据与真实 AppKit/IME/WebKit 未实测边界。实际 Monaco/业务 handler 测试不被描述为原生交互观测。 |
| 项目级触发决定 | **触发并完成**。原因是 typed Gate 注册和 Tauri AppManifest/ACL 生成配置变化，且最终修复了 feature 构建残留生成权限。额外检查 `README.md`、`README-zh.md`、根与 docs `AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、两语言 `index.md`、根/`src-tauri/.gitignore`、`package.json`、CI、`build.rs`、`command_inventory.rs`、capabilities 与 maintained/generated permissions 所有权。修复后触发决定不变。 |
| 项目级结论 | 英文基线、中文镜像、auto active prose、英文 stable specs 及六字段语言政策一致；入口文件只导航到唯一分类索引与 stable specs，规则可脱离 skill/生成集成发现。18 个变更文档路径未增删，两个索引与 README 无需增加条目。`command_inventory.rs` 是维护源；main grant 为 cfg-aware `OUT_DIR` 生成物，detached grant 为窄维护源，autogenerated 只由 owning build 工具生成/清理并保持忽略。未手改 OpenSpec integrations 或全局配置。 |
| 导航与临时材料 | 24 个变更文档/入口共 123 个相对链接（含标题和显式锚点）均有效；两语言路径集合和目录布局一致。根四种临时目录均被忽略且无 tracked 文件，正式代码/文档/spec 不依赖临时输入；新官方插件测试直接引用维护的插件业务模块。 |
| 验证接口与扫描 | 根 scripts 未新增 alias/单测入口/嵌套 shell 图；仅新增稳定 Gate `plugin-detached-windows`。扫描 root manifest、CI、双语维护文档和 stable specs，未发现本 Change alias、旧 `pnpm run check:/run:/refresh:/generate:/ci:` 或 Evidence dispatcher 引用；不存在 GUI/浏览器/native harness 验收路径。完整 workspace test/typecheck/check/build 已通过，包含 registry/governance、包边界与文档断言；`node scripts/check-plugin-contract-docs.ts` 通过，`openspec schemas --json` 确认 spec-driven，strict 全仓 47/47 通过。 |
| 实际更新与限制 | 更新上述 9 对既有分类文档、11 个英文 stable specs、active delta 标题/同范围原生 Session 修正、typed Gate 与 cfg-aware ACL 生成源及对应测试。根 README/AGENTS/语言配置/索引/CI 无需变更；保持已有角色和路径。审计无未决范围内文档/治理问题；工程完成仍以最终完整 Gate 结果为准，不等同于真实 macOS GUI/IME 验收，也不执行归档、提交或发布。 |

### 第 6/7 组进行中

- 第 6 组最终完成：主窗分离控件置于既有 Owner→Action→close 胶囊之外的 trailing chrome，保留原关闭按钮邻接/焦点契约。React layout 后重新确认控件位置、对不变矩形去重、非法位置撤销旧矩形；组件/位置回归 38/38、完整 app:typecheck 与 Biome 通过。9 组中英文文档已同步，Runtime 旧“仍在实现”句子移除；frontend-guidelines 更新 v3/In-app 分组、独立默认恢复/迁移选择。全部受影响导航保持原路径，无须新增索引项。
- 8.3 最终 Rust：`pnpm run src-tauri:format:check`、`src-tauri:test`（469 tests）、`src-tauri:check`、`src-tauri:build` 全部通过；`cargo test/check/build --locked --manifest-path src-tauri/Cargo.toml --features plugin-development-mode` 全部通过，feature tests 499/499。binary/doc-test 空目标亦成功，测试/检查/构建日志零 warning/error；未运行 GUI。
- 完整 Gate 首次运行在既有 UI 离线 consumer 的全局缓存缺失处停止（`tslib@2.9.1`、`@tiptap/react@3.32.2` 等传递依赖）。已按原 consumer manifest 在系统临时目录联网准备相同依赖闭包并验证产物，未修改仓库 manifest、lockfile、根 node_modules 或离线检查规则；随后重跑完整原 Gate，最终结果另行记录。
- 后续完整 Gate 暴露两个必须修正的验证/生成问题：Development Mode 共享 corpus 的 CLI 调用漏传既有 Rust 固定兼容版本，已对齐同一 baseline，11 个正反例与 Rust counterpart 通过，没有修改产品版本或放宽断言；普通 release artifact 确认包含开发 command 字符串，来源是手写 main grant 未按 feature 限制及 Tauri 未清理上次 feature 的 autogenerated permission。正在修复 cfg-aware 权限生成并保留原 artifact negative check。由于 build.rs 将变化，8.3 已重新置为未完成，修复后重跑最终 Rust 集合。
- 既有 UI consumer peer 提示已独立定位：Semi 依赖闭包将 `@tiptap/core`/`pm` 解析为 3.32.2，而部分 extension/suggestion 要求 3.32.1。仓库 manifest、lockfile、UI 包与其 consumer 脚本均无依赖变更；该外部既有 peer 组合提示与本次 source warnings 分开记录，不为消除提示而改动无关依赖或放松验证。

- 原生第 6 组完成：detached Cargo filter 71/71、更新后的 Wry admission wiring 4/4、普通/开发模式 Cargo check、所属文件格式和 diff 检查通过，零警告。固定尺寸目标继承当前实际尺寸，窗口环境变化按 owner 合并；blur/close/恢复失败态与 main Hide 边界按窗口隔离。明确恢复状态、main-only Quit、原生 pointer 控件矩形与 admission failure 已接线。
- 前端控件定向 78/78、完整 app:typecheck、app:build 与 Biome 通过；主窗真实 App chrome、四组 locale/theme、精确 ticket、恢复期间 Close/Quit、旧响应隔离、原生控件注册/清理均有覆盖。native 失败使用可重放的真实 restored settlement 或当前 attempt admission marker 显示安全反馈；不从状态 hint 推断成功。上下文胶囊布局兼容修正尚待最终验证。
- 7.3 新增真实 Monaco model/撤销栈与 ConfigLens production language engine/controller、SDK 的迁移连续性测试，以及真实 Translation runtime/settings/controller/signing/公共 SDK HTTP 请求在分离、兄弟关闭和 Context 更新后的单次结果测试。2/2 通过；根 typecheck 暴露 Monaco 类型声明依赖插件自身 alias，已改为实际导入的 `editor/editor.api.js` 类型（无 runtime 或公共契约变更），并修正测试 terminal reason。完整 app:typecheck 随后通过；完整组合 Gate 正在执行。
- 独立审查修正 live shell document reload 留下未注册窗口与销毁后迟到 Channel publisher 重建大消息缓存两处竞态。前者保留确认关闭/重试所需 metadata；后者用不保活 ResourceTable 的 Weak 精确身份退休记录拒绝迟到插入。纯 vendor 策略 39/39、相关 Rstest 9/9、双配置 Cargo check 和 vendor 格式通过；审阅两文件 diff 后显式 Generate 更新 385-file baseline，最终 Gate 只读核对。

### 英文 stable specs 同步

- 8.7 已同步 11 个 capability（10 个既有、1 个新增），最终共 98 个 requirement、532 个 scenario；全部 422 个既有 scenario 标识保留，42 个不受影响 requirement block 保持逐字不变，新增 16 个 requirement 并应用 2 个 rename。
- 为使同步与后续归档使用同一身份，将 81 个 active delta Requirement/Scenario 标题规范为对应英文，中文正文保留。18 个英文 statement 用等义简洁措辞满足长度限制，所有场景保留；复核恢复失败态、来源/租约、原实例连续性与逐窗口语义。修正受影响 Purpose 的单窗口/iframe 旧描述，并修复 Session 中同范围继承的 retired iframe/MessagePort/frontend-only 叙述，改为既有 native bridge/frontend+Rust 边界，保留历史 scenario 标识。
- `openspec validate --specs --strict` 46/46、`openspec validate --all --strict` 47/47 通过，无 warning/error；6 条 INFO 仅提示已同步 ADDED requirement 存在，是同步后的正常核对信息。未归档或提交。

- 6.5：broker 21/21 与 ACL/inventory Rstest 3/3 通过。真实 Channel 三窗口测试覆盖同插件 A₁/A₂ 与另一插件 B，确认 locale/theme/本地化 metadata 广播不改变 attempt、owner 或 generation；Closing 和失效窗口不再接收更新，关闭/重载/Quit 释放订阅。旧 metadata 与旧 snapshot 发布由 revision/epoch 限制，不能覆盖或通知新 generation。
- 7.1：新增唯一稳定 capability ID `plugin-detached-windows`，通过 typed 依赖图组合任务 8.1 的既有 Gates、文档检查、确定性迁移/UI/官方插件测试。注册表与治理 Rstest 46/46 通过；没有新增根脚本、嵌套 shell 验证图、baseline 写入或 GUI 步骤。组合 Gate 尚待第 6 组与跨层矩阵完成后全量执行。
- 中英文 overview、ConfigLens、Translation 与 validation 文档正在同步最终多窗口语义及证据边界；本节不提前声明尚未完成的控件或组合 Gate 通过。
- 7.2：`cargo test --locked --manifest-path src-tauri/Cargo.toml plugin_detached_window_matrix --lib` 2/2 通过。新矩阵使用生产 Manager/Resource/registry/Session/HostDispatcher/迁移与恢复协调器，仅 native view 与 Host transport 可控替换；断言 A₁/A₂/main B 的独立身份、共同 scope 存续、A₂ 单次原响应、失效的迟到响应拒绝、无关 B 保留、原生单次销毁，以及退出后的 scope/lease/reservation/Session/dispatch/HTTP/recovery/target 全空与新 admission 拒绝。另一测试逐一验证明确恢复、关闭、generation 失效与 Quit 分支。
- 7.4：中英文 validation 文档同步新 Gate 的依赖、命令与证据表，明确模型/真实 handler/固定依赖编译/纯 CLI consumer 的证明范围及 AppKit/IME/WebKit 未实测边界。注册表与治理 46/46、文档 Contract 检查通过；24 个已改文档及入口的 123 个相对路径/标题或显式锚点均有效，未增加文档路径或索引条目。

### 第 5 组进行中：配置与设置

- 5.1/5.4 已完成：TS/Rust strict v3、可空应用内 detach chord、v1/v2 只读投影、Host-owned 版本化待决迁移记录、显式解决与配置 revision/确认提交语义保持一致。固定 Semi 分离行支持录制、改键、清除/保持关闭与独立默认恢复；Launcher reset 不改分离键或待决记录。
- Rust shortcut 定向 52/52 及补充录制 tail 回归通过；前端定向 94/94、最终 model 15/15、TypeScript、Biome、生产 build 通过。
- 完整 `pnpm run app:test`：97 文件 942/942 通过，包含此前两类 Save 时序失败。修正是测试在操作下一个受控 Select 前等待确认保存后解除 `aria-disabled`，保留原功能断言，没有降低检查标准。
- 原生 D/W/Q monitor、启动可用性、精确目标捕获与 Quit 清理仍在最终接线验证；其任务及整个第 5 组不提前声明完成。

### 第 5 组完成

- 唯一前台 local monitor 捕获实际 key Window、原生 Host/Child responder、当前 owner/attempt、surface epoch 与录制/IME/recovery 事实；D 在 worker 分发前预留原实例，已接管手势及重复事件持续至释放。W 仅操作接纳时目标，Q 在事件循环仍运行时完成撤权与清理再退出，不再使用固定 300ms 猜测等待。
- local monitor 可用性使用启动前安装的共享 atomic，设置不依赖快捷键 mutex；锁竞争不能使默认 D 永久不可用，停止立即撤销。本地录制独立于全局监听授权，并处理全局/局部重复候选及后台漏掉 KeyUp 的已跟踪按键释放。
- Rust shortcut 53/53、launcher 144/144、最终 window 49/49、Quit 5/5、detached 57/57、相关 Rstest 32/32 及最终 wiring 4/4 通过。普通与 development Cargo check、格式及 diff 检查通过，零警告。
- `pnpm run gate -- launcher-shortcuts` 及全部组合依赖最终通过。修正了既有静态检查中全局 single-current、旧呈现 lease、退役 spike 和旧 slot 字面量假设，改为实例/owner/真实计数及确认式原生路径；没有删减功能断言。
- Gate 的完整 `app:typecheck` 暴露 6 个测试 fixture 类型不匹配，修正为精确类型后通过；相关 101/101 测试、完整 types/tools 检查与 Biome 通过。此前完整 app:test 942/942 与生产 build 通过；最终组仍会重跑全量。
- 中英文 Runtime、架构 overview 与 validation 文档同步应用内/全局边界、主窗 Cmd+D 优先级及迁移冲突处理。另按当前 mapper 和 stable specs 修正 overview 的旧 permission/grant 可用性叙述，保留在最终审计范围。
- 当前 32/52 完成。下一组完成主窗 chrome 分离与恢复控件、窗口呈现及多窗口偏好交互；未归档、提交或发布。

### 第 4 组完成

- 可信 native bootstrap 分流 main 与轻量 shell；中央实例/导航/activation 管理支持同插件多个 surface、预移交及移交后回滚的同实例 slot adoption、owner revision 更新，以及窗口内 Page 替换保留 shell。调用者 `ui.close` 与 `actions.open` 按原 attempt 路由，已提交共享 storage 不因响应丢失回滚。
- AppManifest 与 WebView capability 明确隔离 main、detached Host 和插件 Child。因 Tauri 通用事件订阅允许声明其他 target，独立 shell 不获该权限，改用实际调用者绑定的 Channel；大 payload fetch 绑定同一 WebView resources identity，错误来源不能读取或消费，producer Drop 保留最后 payload，确认销毁按原 identity 清理。
- actual native adapter 已接入受测 driver、恢复协调器、Host ACK 与最终原生交互批次。准备 ACK 后才显示/聚焦并发布；main surface epoch 阻止旧尺寸/Hide/焦点，真实关闭原子捕获当前 owner，插件失效与退出清理实际 shell/恢复上下文。
- 4.6 补齐：DATA 消息按精确原 WebView 身份路由，普通呈现仍按 owner fencing；`ui.close` 等待原 receiver 确认，等待期间取消/超时有效且不发送第二响应。取消唤醒等待器，不持 registry 锁等待或轮询；每实例浏览器存储使用独立 non-persistent store，避免旧 macOS 默认 data-store 回退导致同 generation 共享状态。
- 最终前端定向 104/104、原生 detached 60/60、launcher 128/128 及 checkpoint 回归、Child 87/87、Host broker 19/19、治理/ACL Rstest 42/42、native 相关 Rstest 64/64、纯 vendor 策略 37/37 均通过。普通/开发模式锁定检查、TypeScript、生产 app build、应用静态与 Rust 格式检查通过，最终编译无警告。
- root 审阅新增 DATA/Channel/manager cleanup 差异后执行 Generate，记录 385 个 vendor 文件；只读 dependency-drift Gate 通过。双语 Host API、安全与前端组合指南已同步，10 份文档相对链接复核通过，`plugin-contract-docs` 与 OpenSpec strict 通过。
- 完整 `pnpm run app:test` 当前 929/930，唯一失败为未修改的 `launcher-shortcuts-ui` 保存按钮时序；此前同类定向 70/70。它位于下一组快捷键 UI 范围，将修正并在最终全量重新验证；不把此结果记为全量通过。
- 当前 26/52 完成。分离按键配置、用户入口、恢复控件与最终验证仍未完成；没有归档、提交或发布。

### 第 3 组完成（恢复失败态批准后）

- 3.1：Tauri/runtime-wry/Wry 现在保留跨阶段 native transaction，原快照在首次真实修改前捕获；wrapper/native/registry 归属按确认结果更新，Unknown 与 Destroyed 分开，明确终止使用确认式关闭。原生 begin/commit 回复丢失仍可取回同一事务，确认回执先于回复释放本地冻结；旧 completion 不能释放新 gate。
- 3.3/3.7：保留原 Context、attempt/token 并支持明确恢复/关闭、失效及退出协调。提交/取消凭据不依赖原实例存续，恢复记录退休前阻止新分离；repair epoch 在终止后失效，Unknown 原生归属不允许误清理窗口，关闭失败仍可重试同一原对象。
- 迁移/恢复 Cargo 25/25、Child 77/77、Launcher 42/42；普通与 development feature Cargo check 零警告。独立复核确认四项已发现 coordinator 竞态均有对应回归并已修正。
- vendor 生产策略 27/27、相关 Rstest 51/51、14 个 vendor 文件格式检查通过。审阅包括所有新增未跟踪实现文件；修复了 begin 丢回复导致孤立 token、commit 丢回复导致冻结泄漏，以及新 retained native path 未复用受测策略的问题。
- root 审阅后执行 `pnpm run generate -- frame-aware-navigation-dependency-drift --write`，记录 383 个 vendor 文件；随后只读 `pnpm run gate -- frame-aware-navigation-dependency-drift` 通过（末段 Rstest 80/80），未改变依赖固定版本。
- 中英文 Runtime 文档已同步事务、成功补偿、恢复失败态及证据范围，并按独立语义审查修正“已接线”歧义。`plugin-contract-docs` Gate、`src-tauri:format:check`、`app:check`、OpenSpec change strict 和 diff 检查通过。
- 当前 18/52 完成。第 3 组建立受测生产策略和原生事务原语；实际 shell、导航、控制面及 UI 接线仍属后续任务，不宣称目标 macOS 交互已实测。

### 第 4 组进行中：请求与共享配置回归

- Task 4.6 已验证：新增真实 Rust dispatcher 回归覆盖 owner transfer 尚未提交时 HTTP 正常单次交付，以及提交后交付、同 requestId 的兄弟关闭仅取消自身、零重发。`cargo test --locked --manifest-path src-tauri/Cargo.toml plugin_child_webview_host_dispatcher --lib`：14/14；每 attempt 4 / 全局 16 并发回归 1/1。已有 DNS worker 16 与每 Session RPC 限制保持原实现，第 3 组 Child 回归覆盖 RPC。
- 初次 HTTP 回归因只等待 pending map 清空而过早读取结果失败；改为等待实际响应交付后重跑通过，未改产品逻辑或放宽断言。
- 原生 storage 回归 15/15，新增同 key 的 8 个并发完整写入、兄弟身份后续读取一致、后续写入可见及伪造 namespace 拒绝。Task 4.7 还需结合窗口级 TS Session 接线验证，不提前勾选。
- 中英文 Host API / Runtime Security 文档已准备窗口归属、共享配置、独立临时状态与无需改包说明；`plugin-contract-docs` 通过。对应真实窗口控制面、导航与 Session 接线仍在进行，4.8 待完成后复核。
- 接线复核重新打开 4.6：dispatcher 测试已证明原请求绑定不变，但 runtime-wry 的 `EvaluateScript` 仍捕获入队时的 Window ID；入队后原 view 已迁移时，按旧 Window 查找可能丢弃同一实例的 RPC 回包。必须让数据投递按精确原 WebView 身份解析并验证失效，不能把普通旧呈现操作一并重定向；补充该生产路由策略证据后再勾选。

### 第 1 组：实例与窗口所有权

- Rust registry 按 attempt 索引，surface 唯一绑定，已终止 source 不复用；实际退出清理全部实例。私有 owner/revision 与单次 token 为后续迁移提供基础，当前尚未开放独立窗口入口。
- presentation `0.3.0`、slot `0.2.0` 绑定实际 Host 来源及 owner；前端呈现 lease 与 Runtime 终止分开，中央服务不随 main slot 移除销毁。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml plugin_child_webview --lib`：60/60 通过。
- `pnpm exec rstest run tests/plugin-child-webview-owner.test.ts tests/plugin-child-webview-presentation.test.ts tests/plugin-child-webview-slot-contract.test.ts tests/plugin-runtime-lifecycle-controller.test.ts tests/plugin-runtime-slot.test.tsx tests/app-shell-navigation.test.tsx tests/official-plugin-runtime-e2e.test.tsx tests/plugin-page-navigation-ui.test.tsx`：8 文件，58/58 通过。
- `pnpm exec tsc --noEmit`、定向 Biome 与两个更新后的静态边界检查通过；`git diff --check` 通过。pnpm 访问机器全局 store 数据库需沙箱提升，未更改 store 或依赖配置。
- 更新中英文 Runtime 文档的实例、owner、来源及清理模型；复核两份语义与现有相对链接，链接检查通过。该组结果不替代后续原生迁移、资源并发与最终全量验证。

### 原生异步呈现复核

- 复核发现 task 1.3 目前只在 registry 接纳操作时检查 owner；Tauri native setter 的排队执行尚未逐项绑定该 ownership revision。成功移走后旧 window ID 通常使其失效，但回滚到原窗口时，旧排队 hide/bounds/focus 仍可能执行。
- 因此重新打开 1.3；前述 60/60 Cargo 与前端测试只建立 registry/模型边界，不能作为该原生执行路径的完整证明。修正必须在真实 native 执行点检查 owner，并避免持 registry 锁等待主线程确认，完成对应故障/竞态验证后再勾选。

### 第 2 组：资源租约与创建预留

- Task 2.1/2.2 完成：generation scope 持有独立来源租约与绑定 native-issued attempt 的有界创建预留（10 秒、最多 32 个）；预留不授予读取权限，取消、失败、超时与最后持有者释放永久退休 scope。未绑定预查询仅为有界非授权候选。
- 私有 presentation 0.3.0 新增只读 admission 事实及 native create 权威 URL/generation；既有 Resource Contract 0.1.0 保持不变。准入不分配 scope、资源或 Child；前端整体验证另记。
- 修复并测试迟到旧 resolve 与提交回调误撤销新 generation 的竞态；cache miss/hit 交付前关闭均拒绝旧来源，不影响兄弟实例。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml plugin_resource_service --lib`：20/20；development feature 资源测试 21/21；admission 4/4；Child service 30/30。
- `pnpm run gate -- plugin-child-webview-resource-binding` 与 `pnpm run gate -- isolated-plugin-runtime-origin` 通过（后者含 CLI build、2 项 fixture、resource/service/adapter 确定性测试）。普通及 `--features plugin-development-mode` Cargo check 均零警告。
- 原生呈现 task 1.3 的执行点保护仍在修正；这些独立通过的资源任务不代表分离功能已开放或第 3 组可以跳过前置检查。

### 第 2 组：Session、失效范围与聚合冷却

- Task 2.3/2.4：独立 attempt/source/data-store/Session/request 空间；修复取消后迟到 dispatch 重新发布 Host 绑定的竞态。提交回调按 entry/generation 清理全部旧实例，Host reload 先撤权再清理捕获实例，Exit 清理全体。
- Rust dispatcher 12/12 通过，包含同 requestId 的双实例回应、取消/迟到响应、4 实例 HTTP 失效矩阵与清理次数；development reload 确定性回归 1/1，拒绝 staging 保留两个旧实例，成功提交才撤销。对应 feature Cargo check 零警告。
- Task 2.5：真实 Manager generation 在资源解析前经私有 admission 读取；preflight 限时 10 秒并支持取消，固定首次可信事实，冷却中零 resolve/create。native create 后仅一次接纳权威 URL，损坏结果清理已知实例；保留实例的 metadata revalidation 不重新获取 scope，实际来源与租约继续由 native 校验。
- Breaker 聚合所有同 entry/generation 实例，保持 3/60 秒与 30 秒冷却；健康兄弟不抹除新故障，必须连续无故障且有持续 ready 实例才清零，移交不重置，旧 generation 回调无效。
- TS lifecycle/Session/App composition 定向 31/31；强化后的 Slot/resolver/presentation/owner/navigation 定向 72/72；最后 resolver 说明修正后 19/19 重跑通过。`pnpm exec tsc --noEmit` 与 `pnpm run app:check` 通过，定向 Biome 通过。
- Task 2.6：更新中英文 Extension Platform 与 Runtime 文档的 source lease、generation、data-store 和实例/插件/应用终止边界，语义及相对链接复核通过；`pnpm run gate -- plugin-contract-docs` 通过，覆盖 24 份双语文档。
- 提前运行的完整 `pnpm run app:test` 最近结果 900/901；唯一失败为尚未修改的快捷键设置行测试，正在定向复查。该结果不记为全量通过，最终第 8 组仍必须重跑全部要求。原生执行点保护 task 1.3 仍未完成，第 3 组尚未开始。
- 随后 `pnpm exec rstest run tests/launcher-shortcuts-ui.test.tsx` 定向 70/70 通过，未修改该文件。该次全量失败未在定向运行重现；后续仍须以完整最终运行结果为准。

### Task 1.3 原生执行点修正完成

- 新增可撤销 owner epoch 和 slot/visibility intent 执行许可，主线程 callback 在真实父窗口核验后执行并读回结果。移交/终止/新 intent/超时使旧 callback 失效，回滚到同一 Window 也不能复用旧许可；registry 在锁外执行/等待，再 compare owner 提交。
- AppKit bounds 保留 Retina 小数逻辑坐标，保留仍有效的当前 descendant responder；Show 仍先确认 clip 再显示。未新增 GUI 或 native harness，未修改 vendor。
- 最终 `cargo test --locked --manifest-path src-tauri/Cargo.toml plugin_child_webview --lib`：76/76；圆角与 slot Rstest：18/18；普通 Cargo check、已运行的 development feature check 零警告，rustfmt 与 diff 检查通过。ready-presentation 静态检查另确认 presentation lease 只释放几何、Runtime lease 负责 hide/destroy。
- 中英文 Runtime 文档已补齐执行点许可、锁边界、Retina 与 responder 语义。Task 1.3 重新勾选；第 1、2 组共 11/50 完成。原生迁移仍须先排空执行队列再捕获回滚状态，继续由第 3 组实现与验证。

### 第 3 组：迁移策略与原生回滚阻塞（批准前历史）

- Task 3.2/3.4 的生产 driver 和 transfer API 已实现；真实 shell 接线仍属于 4.3。所有前向副作用成功后才 commit，恢复新 source revision 并清理目标后才 cancel；过期 callback 与明确终止不得复活或改投实例。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml plugin_detached_window_migration --lib`：9/9，覆盖 22 个前向失败位置、66 个阶段/终止交错、17 个真实线程 barrier、deadline、恢复入口丢失、重复 D、最终 owner waiters、原模型 undo/selection/Worker/pending result 与清理计数。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml plugin_child_webview --lib`：76/76；普通及 development feature Cargo check 零警告；本轮修改文件格式与 diff 检查通过。
- 3.1 vendor 工作仅为可审阅的未完成补丁：六个 Tauri/runtime-wry/Wry 文件及生产策略，纯 Rust 测试 11/11、2-space rustfmt、锁定普通/feature 编译通过。未生成 integrity baseline，未将新 vendor 策略加入维护 runner/Gate，3.1/3.5 不勾选。
- **批准前曾因 3.3 暂停后续实施**：成功前向 reparent 后原始原生快照生命周期不足；source Window 存活也不能保证 AppKit 接受原 responder。故障注入明确得到 `MoveFailure::Rollback`/`RecoveryRequired`，不能算恢复原主窗成功。当时证据与后来获批的恢复契约在 [design.md](design.md#implementation-review--2026-11-03)。
- 该批准前检查点为 13/50 完成。后续 shell、导航、快捷键、分离 UI、稳定 Gate、最终全量验证、稳定规范同步及归档审计当时均未完成。没有归档、暂存、提交或发布；临时英文翻译准备不算规范同步。

### 恢复失败态已批准，恢复授权范围内实施

- 用户在关联 [design.md 实施评审](design.md#implementation-review--2026-11-03) 的确认中明确选择“批准恢复失败态（推荐）”。因此仅补偿本身无法确认时进入 `recovery_required`，保留原实例/Session/事务/原始快照、不重载/重放/自动销毁、不伪报成功，冻结归属变更与重复分离，保持 main 修复和退出入口可见；明确重试恢复、关闭和 Quit 继续受同一 attempt/token、当前来源及既有终止范围约束。
- 本轮同步 proposal/design 与 9 份受影响 delta，并新增未勾选 3.7、6.7；保留已验证 3.2/3.4 的原任务描述和完成状态，新增恢复扩展由 3.3/3.7/6.7 及对应接线任务单独验证。新增任务按依赖分别置于 3.5/3.6 与 6.6 的验证/文档任务之前，不重编号原有任务。
- 当前为 13/52 完成、39 项未完成。授权问题已解除，不再以该范围决定阻塞实施；该记录不把恢复入口或整体功能标为已实现，也不替代最终治理审计、规范同步或验证。
- 随后完整 `pnpm run app:test` 为 900/901；此前快捷键设置测试失败未复现，当前唯一失败为 `frame-aware-navigation-dependency-drift`，原因是 vendor baseline 按 3.5 要求等待 reviewed diff 后才生成。该结果不记为全量通过；`pnpm run app:check`、`pnpm exec tsc --noEmit` 和当次 OpenSpec change strict 通过。新迁移模块引入的 Rust module 顺序格式问题已调整，最终格式及完整验证仍按任务重跑。
