# Tasks

## 1. 区分快捷键暂停和故障

- [x] 1.1 在 Rust 快捷键服务区分执行资格、当前唯一 Launcher 入口的已确认故障和暂时中断。用现有 `service/tests.rs` 与 `monitor_tests.rs` 验证普通组合键配插件双击、唯一双击可正常重建、重建实际失败、权限撤销，以及现有注册或补偿故障。
- [x] 1.2 在 macOS 适配层独立观察电源、桌面会话与前台应用事件，给中断和恢复分配代次并管理订阅生存期。用可注入的通知与时钟验证单独锁屏、仅亮屏、唤醒但仍锁定、普通密码框安全输入、重叠中断、缺失桌面事件和观察线程退出；复核唯一入口故障须能在双击权限被撤销时继续推进。
- [x] 1.3 在 `docs/en/architecture/overview.md` 和 `docs/zh/architecture/overview.md` 的快捷键章节说明何时暂停输入、何时复查以及哪些证据允许修复显窗。核对两个语言版本对普通组合键和双击入口的示例一致。

## 2. 约束主窗口显示和待派发的快捷键

- [x] 2.1 将运行期自动修复显窗的调用方汇入统一判断，执行前在主线程复查会话代次、配置、故障原因和可见性。用假窗口记录激活、显示、请求焦点与恢复子视图的调用，验证健康恢复和过期任务调用数为零、同一次持续故障仅成功显示一次、显示失败后可重试、已可见窗口不被重复聚焦。
- [x] 2.2 锁屏或睡眠中断时，撤销旧候选、录制及未派发的 Toggle、Show 和 Action，按既有回执结束受理后失效的调用。用延迟主线程队列验证一次完整睡醒、二次锁屏、`host_ready` 重新就绪、配置替换与退出，并验证恢复后的新手势只派发一次。
- [x] 2.3 在确有待修复故障且主窗口隐藏时，接入用户明确重新打开运行中应用的 macOS `Reopen` 事件。以注入事件验证缺少桌面激活证据时仍能进入修复；窗口已显示、健康会话和单纯唤醒均不会因此重复显窗或执行 Action。验证真正的入口失效仍会阻止不可恢复的隐藏，并保留退出操作。
- [x] 2.4 在现有 `launcher_window` 和页面连续性用例补齐跨层回归：隐藏首页恢复后仍在首页，隐藏翻译页在主动唤出后恢复同一实例和输入，恢复本身不执行翻译；已显示的主窗口真实失焦后沿用可恢复隐藏，独立窗口继续遵循其关闭和失焦语义。核对父窗口与当前子视图的实际调用顺序。
- [x] 2.5 同步英中架构文档中的主窗口生命周期和修复入口说明，并在 `docs/en/development/validation.md`、`docs/zh/development/validation.md` 记录测试边界。核对文档中的行为、Gate 名称与实现，区分确定性事件模拟和安装版观察。

## 3. 验证与归档就绪审计

- [x] 3.1 运行专项 `pnpm run gate -- launcher-shortcuts`，记录快捷键、输入焦点、主窗口与插件连续性结果。使用现有 Cargo、Rstest 与假适配器；验证链中仅含确定性检查，无真实 GUI、WebView、Launch Services、截图、像素或目标环境性能步骤。
- [x] 3.2 分别运行 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，以及 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`。按仓库原生验证约定为 Rust 的 test/check/build 加跑 `--features plugin-development-mode`；检查发布模式的事件接线时运行 `cargo test --release --manifest-path src-tauri/Cargo.toml --lib release_setup`。修复引入的告警和错误，重跑失败命令及完整最终验证集，分别记录结果。
- [x] 3.3 在同步或归档前检查根 manifest、CI、维护文档、稳定规格和 Gate 注册表中的 Change 专用别名、直接列文件的根测试命令、递归检查及废弃的验证入口。使用现有 Gate 验证 ID，检查文档镜像、索引、链接和 `git diff --check`；在本文件记录实际检查路径和结果。
- [x] 3.4 按 `docs/en/development/project-workflow.md` 的归档就绪流程，针对最终接受范围核对实现、测试、英中维护文档和两份 delta。将接受的变更同步至对应英文稳定规格，逐项核对已有场景后执行 `openspec validate preserve-hidden-launcher-across-sleep --strict` 和 `openspec validate --specs --strict`。在本文件记录审计范围、依据、结论、变更路径、验证结果及是否触发项目级治理审计；治理面受影响时完成项目级审计，归档前复核记录。

## 实施与验证记录

- 1.1　Cargo 定向用例通过。service/tests.rs、monitor_tests.rs 覆盖已注册组合键配插件双击、唯一双击恢复成功、实际创建失败、权限撤销、注册失败和补偿不确定。
- 1.2　独立的 NSWorkspace 订阅与原子会话快照覆盖锁屏、单独亮屏、会话切换、叠加中断、Secure Input、缺失激活与宿主退出。注入权限复核、时钟与私有通知中心的用例通过，观察线程退出后仍可复查唯一入口。
- 1.3　对照两份 architecture/overview.md 核对组合键配 Translation 双击、唯一双击、允许重试与前台桌面证据的示例及边界。
- 2.1　repair.rs 的主线程复核和假窗口用例通过。覆盖隐藏、已可见、显窗失败重试、持续故障去重、睡醒代次失效，以及在查询可见性时配置更替或退出。
- 2.2　定向 Cargo 91 项通过。延迟执行用例覆盖多次完整中断、配置替换、Host 重新就绪、退出、失败回执和新输入仅执行一次；窗口 Show 成功后 Host 才可领取 Action。
- 2.3　核对 Tauri RunEvent::Reopen 接线和真实主窗口可见性查询。用注入的 Reopen 来源验证无桌面激活时的持续故障、健康与已可见窗口、阻止不安全隐藏；应用级退出路径独立于此判断。
- 2.4　launcher_window 55 项、Host 页面导航 16 项、Translation Page 43 项、独立窗口与官方插件 17 项通过。验证父窗口先于当前子视图显示并聚焦、首页输入获焦、同一翻译实例的输入与结果保留，翻译服务仅调用一次。
- 2.5　核对英中 overview.md 与 validation.md 的窗口生命周期、故障复查、Finder 重开和确定性验证边界。两份镜像引用同一 launcher-shortcuts Gate，文档明确区分模拟与安装版实际通知顺序。
- 3.1　pnpm run gate -- launcher-shortcuts 通过。--plan 展开 15 个 Gate、54 个只读步骤；包含输入焦点、窗口、Action 投影、子视图会话与连续性。末步 Cargo 快捷键测试 91 项通过。复核执行计划未发现 GUI、真实 WebView、Launch Services、截图或性能步骤。
- 3.2　pnpm run test（各成员 Rstest 合计 1751 项）、typecheck、check、build 均成功。src-tauri:format:check 通过；src-tauri:test、src-tauri:check、src-tauri:build 在默认及 --features plugin-development-mode 两组均通过，Rust 分别为 520、550 项测试。cargo test --release --manifest-path src-tauri/Cargo.toml --lib release_setup 为 3/3。初次 Gate 发现故障持续期间隐藏保护的测试预期过时，修正后重跑通过。
- 3.3　检查 package.json、.github/workflows/{lensx-ci,plugins-ci}.yml、scripts/validation/catalog.ts、docs/{en,zh} 与 openspec/specs。无 Change 专用别名、根测试文件列表、递归验证或废弃入口。registry 与 governance 测试 46 项通过；两种语言目录的 24 个相对路径一致，两份索引及四份变更文档共 52 个本地链接目标可解析。git diff --check 通过。
- 3.4　按 docs/en/development/project-workflow.md 核对 proposal、design、两份 delta、src-tauri/src/launcher_shortcuts/（服务、监听、工作区订阅、修复队列及测试）、lib.rs、launcher_window.rs、tests/plugin-page-navigation-ui.test.tsx 和 plugins/translation/tests/TranslationPage.test.tsx。行为、测试与英中 architecture/overview.md、development/validation.md 一致。同步 launcher-shortcuts 和 launcher-window-lifecycle 两份英文稳定规格，并使对应 delta 的接受文本一致；原有场景与顺序全部保留，分别由 56 增至 60、125 增至 130。openspec validate preserve-hidden-launcher-across-sleep --strict 成功，openspec validate --specs --strict 为 46/46。再次对照 AGENTS.md、docs/AGENTS.md、govern-spec.yaml、openspec/config.yaml 和两种语言索引。变更仅涉及现有分类文档正文、功能实现、用例和对应规格，治理入口、语言、镜像关系、目录与验证策略均沿用，无项目级治理审计触发项。实施期审计通过，执行归档时须依流程复核。

## 2026-11-26 归档复核

- OpenSpec 确认 proposal、design、specs、tasks 四项产物均已完成，跟踪任务为 12/12。逐项比较两份 delta 与对应英文稳定规格，`launcher-shortcuts` 的 2 条修改和 `launcher-window-lifecycle` 的 3 条修改全文一致。相对变更前的版本，原有场景和顺序均保留，分别新增 4 和 5 个场景。
- 对照 3.4 所列实现与测试，复核两种语言的 `architecture/overview.md` 和 `development/validation.md`。文档覆盖锁屏及睡醒后的隐藏状态、故障显窗、Finder 重开、翻译页面连续性和模拟测试边界。24 组镜像路径匹配，两份索引与四份文档中的 52 个本地链接均可解析，含 6 个章节锚点。治理入口、语言配置、索引、目录结构和验证命令均无变动，本次仅补充本审计记录。
- 归档前重跑 `cargo test --manifest-path src-tauri/Cargo.toml --lib launcher_shortcuts`，91 项通过。变更和全部 46 份稳定规格均通过 OpenSpec 严格校验，`git diff --check` 通过。实施期的完整测试和构建结果见 3.1、3.2；安装版 macOS 实机睡眠验收尚未执行。
