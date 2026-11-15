# Tasks

本清单记录实施及归档前准备；实际完成证据见下方实施与最终审计记录。验收契约见 `specs/launcher-shortcuts/spec.md`，实现决策及测试矩阵见 `design.md`。

## 1. 原生资源所有权与完整清理

- [x] 1.1 在 `launcher_shortcuts` 内实现生产/fake 后端共用的 tap/source 唯一资源所有者，并接入 macOS 适配器；以正常创建、空资源、tap 失败、source 失败、创建后未启用的单测验证半初始化资源全部回收，任意时点注册数不超过一。
- [x] 1.2 将运行中撤销/重建、部分创建失败和线程结束接入统一幂等清理；以生产所有者的操作记录验证 `CFMachPortInvalidate` 先于 source/tap 引用释放、附加过的 source 从正确 RunLoop/mode 移除、重复 cleanup/Drop 不重复释放。
- [x] 1.3 为 callback Context 和睡眠/唤醒通知订阅建立匹配的作用域生命周期，保证正常退出、提前退出及受控 Rust unwind 时先清理原生输入资源再销毁上下文，解除通知 token；用 fake 回调存活期和通知注册计数测试验证，无需真实通知或系统输入。
- [x] 1.4 更新 `docs/en/architecture/overview.md` 的快捷键章节及 `docs/zh/architecture/overview.md`，说明资源所有者、部分失败和清理顺序；通过逐段语义对照及相关链接检查确认两种语言一致。

## 2. 恢复、健康保持与可用性发布

- [x] 2.1 将观察循环的真实中断、tap 禁用、运行间隔异常、授权丢失、Secure Input、睡眠/唤醒和不再需要监听的转换接入资源所有者；用可注入事实驱动生产转换，验证先撤销 admission、清候选和完整清理，再允许新建。
- [x] 2.2 保留仍健康且继续需要的同一监听跨配置、录制、隐藏及手势 epoch 重置；用资源 identity 和 create/invalidate 计数回归验证不制造额外监听或假 Unavailable。
- [x] 2.3 保留单调时间的一秒创建节流和既有锁外 10 ms 等待；用虚拟时间验证首次尝试、999 ms 不重试、1000 ms 至多一次尝试、连续失败无忙等/重试队列，并通过既有 `monitor_poll_tests`。
- [x] 2.4 仅在资源完整建立且确认 enabled 后发布 Active，恢复时重新采样当前物理状态；以状态与手势集成测试验证部分失败不可用、旧候选和旧回调不执行、恢复后新序列只触发一次。
- [x] 2.5 覆盖停止、服务锁中毒和观察线程异常退出时的 fail-closed 收尾，保持资源析构不再获取服务锁；以可控异常/停止测试验证 admission 被撤销、资源归零且后续不重建。
- [x] 2.6 复用并补齐服务/恢复测试：唯一 Launcher 双击失效时修复与退出可访问、不可恢复隐藏被禁止、无历史/default fallback；共享服务健康且故障仅限于被动监听时普通 chord 独立，服务损坏时保守降级。
- [x] 2.7 在英文架构快捷键章节及中文镜像同步记录健康监听保持、受控重建、节流、停止和修复入口边界；对照稳定恢复契约及本 Change 增量确认无行为冲突。

## 3. 长期转换的确定性回归与验证文档

- [x] 3.1 使用生产资源所有者与状态转换运行至少 1000 次可控的中断、权限/Secure Input/sleep 事实变化、创建失败和成功恢复；逐步断言注册数、tap/source 引用持有量有界，旧资源先注销，新资源后创建，最终分配/释放平衡且无旧候选回放。
- [x] 3.2 确认 fake 后端分别建模系统注册与引用，遗漏 invalidate 或错误清理顺序确实会使断言失败；将相关测试保留在 `launcher_shortcuts` Cargo discovery 内，验证既有 `pnpm run gate -- launcher-shortcuts` 实际执行它们，无需新根脚本或 Gate。
- [x] 3.3 更新 `docs/en/development/validation.md` 的 Configurable Shortcut Validation 章节及 `docs/zh/development/validation.md`，列出资源计数、部分失败、重复恢复、停止/unwind、健康资源保持的覆盖和真实 macOS 性能/授权行为的证明限制；检查语言一致性和文档命令对应现存 Gate。

## 4. 最终验证与归档准备

- [x] 4.1 执行并单独记录 focused Gate `pnpm run gate -- launcher-shortcuts` 的实际结果；确认所有新增测试属于同一生产生命周期路径的确定性验证，不启动系统事件监听、浏览器、真实 WebView、GUI 应用或原生交互 harness。
- [x] 4.2 执行 `pnpm run test`，记录完整 frontend/workspace 测试结果；focused Gate 不能替代该结果。
- [x] 4.3 执行 `pnpm run typecheck` 和 `pnpm run check`，记录 frontend/workspace 类型、格式和静态检查结果。
- [x] 4.4 执行 `pnpm run build`，记录 frontend/workspace 构建结果；不启动产物进行 GUI 或环境性能验证。
- [x] 4.5 执行 `pnpm run src-tauri:format:check` 和 `pnpm run src-tauri:test`，记录 Rust workspace 格式及完整测试结果。
- [x] 4.6 执行 `pnpm run src-tauri:check` 和 `pnpm run src-tauri:build`，记录 Rust workspace 静态检查与构建结果。
- [x] 4.7 修复本 Change 引入的全部警告和错误后，重跑失败命令及 4.1–4.6 完整最终验证集；若任何验证领域因最终范围变化而不适用，记录具体原因，不能无说明跳过。
- [x] 4.8 在最终范围接受后，将本 Change 已接受增量改写为英文并同步至 `openspec/specs/launcher-shortcuts/spec.md`；核对原有 requirement/scenario 无丢失，并验证同步结果。本任务不执行归档。
- [x] 4.9 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 执行最终 Change 范围的治理和文档审计；在本文件记录实际范围、检查路径、规格/架构/验证文档归属、英文与中文语义、索引/链接、结论及理由、实际修改路径与实际验证结果，含“无需更新”的证据。
- [x] 4.10 记录 project-level audit 的触发判定及理由，并在审计修复后重新判定；预期只更新现有分类文档正文、无治理/索引/语言关系变化，故不触发；若实际触及治理面，完成相应项目级审计后才能确认 readiness。
- [x] 4.11 在同步与归档前检查根 `package.json`、`.github/`、`scripts/validation/`、维护中的英中文档、稳定规格及本 Change：无新增 Change 专属脚本、直接测试文件列表的根别名、递归 check 别名、废弃 dispatcher 引用或环境验证入口；记录扫描命令、范围及结果。
- [x] 4.12 对同步后的结果运行 `openspec validate fix-macos-input-monitor-resource-leak --strict --no-interactive`、`openspec validate --all --strict --no-interactive` 和 `git diff --check`，并检查相对链接与语言镜像；有未解决的范围内文档、治理或验证问题时记录为未就绪，不勾选完成。

归档需在实施、上述规格同步、审计和验证完成后另行授权；归档前再次确认最终接受范围及审计证据，本任务清单不授权执行归档或 Git 提交、推送。

### 本轮规划验证记录（2026-11-13）

- 新增范围仅为本 Change 的 `.openspec.yaml`、proposal、design、`launcher-shortcuts` 增量和 tasks；未实施产品代码或提前同步稳定规格。
- `openspec validate fix-macos-input-monitor-resource-leak --strict --no-interactive`：通过。
- `openspec validate --all --strict --no-interactive`：47 项通过、0 项失败，包含本 Change 和 46 个稳定能力。
- 规划文件存在性、相对 Markdown 链接、模板占位符及实施任务未勾选检查通过；工作区差异仅新增本 Change 目录。
- 本轮未执行产品 Gate、前端/Rust 测试或构建；上述 4.1–4.12 的实施、同步、审计和最终验证仍待后续阶段实际完成，不能以规划校验代替。


### 实施与确定性回归证据

- 实际范围：`src-tauri/src/launcher_shortcuts/monitor.rs` 的唯一、线程绑定资源所有者与转换控制器；`macos.rs` 的原生后端、Context/通知作用域、繁忙输入期间的生命周期处理和恢复接线；`mod.rs` 的线程退出状态收尾。未改变持久化版本、公开 payload、权限申请策略、手势阈值、10 ms 锁外等待或新增依赖。
- 清理统一经过 owner：撤销 admission、清候选后，`CFMachPortInvalidate` → 原 RunLoop/mode 移除 source → source 引用释放 → tap 引用释放；部分构造、重复清理、线程正常/提前退出与 Rust unwind 均走同一资源路径。Context 与通知作用域在原生清理后结束，析构不获取服务锁。
- `WorkspaceSleep` 将 sleep 与 epoch 发布为同一个原子事实，先于通知回调获取服务锁；服务状态滞后时禁止重建，合并 sleep/wake 仍拒绝旧 epoch。原生 callback 在取锁前后校验 epoch，create/enabled 也检查该事实。持续繁忙的输入只推迟 quiet confirmation，不再推迟中断/停止清理。
- `monitor_tests.rs`：13 项生产 owner/转换回归，涵盖独立系统注册/引用/附加计数、空与部分失败、未启用、幂等清理、原 RunLoop/mode、错误注销/释放顺序负面对照、健康资源 identity、首次及 999/1000 ms 创建边界、停止、旧候选/旧回调、新物理状态、通知状态滞后、正常退出和受控 unwind。
- 长期回归实际运行 1200 轮混合中断、授权/Secure Input/sleep/需求丢失、tap/source/disabled 创建失败与成功恢复，共 2401 次创建尝试；每步注册、tap/source 引用和附加 source 不超过一，退休资源先清理，最后分配/释放平衡，旧输入无回放。
- `monitor_exit_tests.rs`：3 项直接覆盖生产 `finish_observation` 的健康结束、服务锁中毒与停止；验证独立 admission、recording、gesture 和恢复判定的 fail-closed 行为。`service/tests.rs` 新增普通 Action chord 跨被动监听故障/恢复保持同一注册和可执行性的回归，并复用 sole-double-tap、无历史/default fallback、sleep/stop 和恢复契约测试。
- 验证均使用可注入事实、虚拟时间、fake 后端或 Tauri mock runtime；未启动系统事件监听、授权对话框、浏览器、真实 WebView、GUI 应用、Launch Services 或原生交互 harness。真实 macOS 的长期性能、禁用频率和授权/系统事件投递仍不由这些测试证明。

### 最终验证结果

| 验证范围 | 实际命令 | 最终结果 |
| --- | --- | --- |
| focused capability Gate | `pnpm run gate -- launcher-shortcuts` | 通过；现有 Gate 发现并执行新增 owner/转换/退出/服务测试，相关 Rust 模块 77 项通过。 |
| 完整 frontend/workspace 测试 | `pnpm run test` | 通过；11 个 Rstest 汇总共 1751 项通过、0 失败，包含 root application 的 967 项。 |
| 类型、格式及静态检查 | `pnpm run typecheck`、`pnpm run check` | 全部通过。 |
| frontend/workspace 构建 | `pnpm run build` | 通过；未运行 GUI 产物。 |
| Rust 格式及完整测试 | `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` | 全部通过；Rust workspace 506 项通过、0 失败。 |
| Rust 静态检查及构建 | `pnpm run src-tauri:check`、`pnpm run src-tauri:build` | 全部通过；无新增警告或错误。 |

- 首轮沙箱内全部 pnpm 命令在 CLI 启动时因用户级数据库不可打开而退出，未执行项目验证；确认沙箱外既有 pnpm 可运行后，使用机器配置重新执行，未改变仓库 pnpm store 或全局配置。
- 首轮实际完整 frontend 测试有 4 项既有 UI 用例失败（Action 切换、两种 dark locale 的迁移选择、detach 冲突超时）；同一源码下完整 `pnpm run test` 重跑通过。未修改 UI 或其测试以规避失败。
- 补齐 sleep/epoch 并发边界后，重新执行了表中 4.1–4.6 的完整最终验证集，所有命令退出码均为 0。focused Gate 与完整 frontend/workspace/Rust 证据分别记录，未省略任何领域。

### 稳定规格同步与 Change 范围审计

- 已将已接受的两条增量要求和 10 个场景改写为英文，并同步到 `openspec/specs/launcher-shortcuts/spec.md`。源 delta 同步采用相同英文 requirement/scenario 标识，重复合并不会产生两套要求；原稳定规格所有既有正文、requirement 和 scenario 逐字保留，无删除或改名。proposal/design/tasks 保留中文。
- 实际检查对象：本 Change 的 proposal/design/delta/tasks、上述 Rust 实现与测试、稳定 `launcher-shortcuts` 规格；`docs/en/architecture/overview.md`、`docs/en/development/validation.md` 及对应 `docs/zh/`；双语 `index.md`；根 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml` 和项目 workflow/validation 规则。
- 内容归属与修改：资源所有权、失败和恢复边界归入现有 architecture overview 的 Configurable Shortcuts；确定性覆盖和真实系统证明限制归入现有 validation 的 Configurable Shortcut Validation；规范行为归入既有稳定能力。英中四份文档已逐段对照，sleep/epoch、清理顺序、健康保持、重试、退出、修复/退出入口和限制语义一致。
- 无需更新的证据：未新增、删除、移动文档或改变分类；双语 index 的现有入口仍可到达这两类正文，全部 24 个 Markdown 镜像路径匹配。README、agent onboarding、语言集合/关系、驱动配置、临时目录规则、生成集成、导航、依赖及 CI 均无需更新，实际 diff 也未触及这些路径。
- project-level audit 触发判定：不触发。实际变更仅现有能力实现/测试、其已接受规格及现有分类文档正文；未改变任何治理面。审计修复只补充同一分类文档与本记录，再次判定仍不触发。
- 命令治理扫描范围：根 `package.json`、`.github/`、`scripts/validation/`、全部维护中的英中文档、稳定规格和本 Change。执行 `rg -n` 检索 Change ID、`pnpm run evidence`、Evidence/visual/native-harness/Launch Services 等入口词，并对根 scripts 用 JSON 断言检查 Change 别名、直接 Rstest 文件列表与递归 check 链；另扫描可执行 `pnpm run/exec evidence/visual/Change` 引用。无新增或残留可调用入口；广义命中均为禁止规则、证明限制、现有业务描述/单位或本 Change 的正常校验命令。根脚本、CI、Gate/Generate registry 无 diff，无需新增根命令或独立 Gate。
- 已实际运行 `openspec validate --specs --strict --no-interactive`：46 个稳定能力通过；`openspec validate fix-macos-input-monitor-resource-leak --strict --no-interactive`：通过；`openspec validate --all --strict --no-interactive`：47 项通过、0 失败。最终相对链接检查覆盖 53 个文件链接和 6 个 Markdown anchor，全部有效；24 个英中 Markdown 镜像路径匹配，根临时目录跟踪文件为 0，文档新增正文已按英文基线逐段核对中文镜像。
- readiness 结论：实现、已接受规格同步、Change 范围治理/文档审计和完整确定性验证均已完成，无未解决的范围内问题；此结论不代表实际 macOS GUI/性能验收，不授权或执行归档、Git 提交、推送、打包、部署或替换正在运行的应用。归档前仍需按届时最终接受范围重确认审计。

### 独立归档复核（2026-11-15）

- 本轮依据用户明确的归档请求，重确认最终接受范围：本 Change 全部产物、`launcher_shortcuts/{macos,monitor,mod}.rs`、`monitor_tests.rs`、`monitor_exit_tests.rs` 和 `service/tests.rs`，以及稳定 `launcher-shortcuts` 规格。重新检查生产资源所有者、清理顺序、恢复节流、sleep/epoch、退出收尾及对应确定性测试，未发现范围偏离或归档阻塞。`openspec status --change fix-macos-input-monitor-resource-leak --json` 显示四类产物全部完成；`openspec list --json` 确认任务 26/26。
- 按本轮 `openspec instructions specs --change fix-macos-input-monitor-resource-leak --json` 的规则快照执行幂等同步复核：唯一 delta 的两条新增要求、10 个场景已逐字存在于主规格；Python 块比较确认无剩余增量，主规格以 HEAD 原文为完整前缀，标题、Purpose 和全部既有内容保留，且不含 delta 操作标题。本轮无需再次写入主规格。
- 重新检查 `docs/en/architecture/overview.md`、`docs/en/development/validation.md` 及对应中文镜像、双语 index、`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml` 和 workflow/validation 规则。两类现有分类正文覆盖资源所有权、清理/恢复边界和验证限制，英中语义一致；Python 检查确认 24 个 Markdown 镜像路径匹配、53 个相对文件链接及 6 个 Markdown anchor 有效。前次审计对当前最终范围仍成立，无需修复文档、索引或治理文件。
- project-level audit 再次判定不触发：最终范围及本轮复核未改变治理面、索引、目录、语言集合/同步关系或生成集成。根 `package.json`、`.github/`、`scripts/validation/`、维护文档、稳定规格及本 Change 的命令治理扫描未发现可调用的废弃入口或 Change 专属根脚本；根脚本断言违规数为 0，根临时目录跟踪文件为 0。
- 本轮实际重跑 `pnpm run gate -- launcher-shortcuts`，退出码 0；全部依赖步骤通过，末尾快捷键前端 124 项、Rust 模块 77 项通过。沙箱内 pnpm 无法打开既有用户级数据库，已在沙箱外沿用机器配置完成 Gate，未改变 store 或全局配置。完整 frontend/workspace 与 Rust 验证沿用上方同一实现的最终通过记录；本轮只追加本审计记录并移动归档，不改产品源码、测试、依赖或构建配置。
- 本轮实际运行 `openspec validate fix-macos-input-monitor-resource-leak --strict --no-interactive`（通过）、`openspec validate --specs --strict --no-interactive`（46/46）、`openspec validate --all --strict --no-interactive`（47/47）及 `git diff --check`（通过）。实际更新路径仅本 `tasks.md` 和随后整个 Change 的归档位置；归档移动后继续确认元数据、产物、相对链接及稳定规格校验。
- 归档就绪：无未完成任务、同步差异或未解决的范围内问题；真实 macOS 长期性能、权限弹窗和系统事件投递仍不由确定性检查证明。
- 已归档至 `openspec/changes/archive/2026-11-15-fix-macos-input-monitor-resource-leak/`。移动后 SHA-256 比较确认全部 5 个文件内容完整保留（含 `.openspec.yaml`），归档产物的相对文件链接有效，活动清单已移除本 Change；再次执行 `openspec validate --all --strict --no-interactive`，剩余 46 个稳定能力全部通过。
