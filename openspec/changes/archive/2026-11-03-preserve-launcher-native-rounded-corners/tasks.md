# Tasks

本文件记录实施与归档准备。原生策略、启动和运行期呈现接线、确定性回归、双语文档和英文稳定规范已完成，最终验证通过；以下勾选仅依据实际实现和检查结果，不代表实机像素验收。范围与行为见 proposal、design 和两份 delta specs。

## 1. Window 级圆角策略与 macOS 适配

- [x] 1.1 在产品 Rust 中增加具名 18 逻辑点半径和独立于 AppKit 的小型裁剪操作策略，使用 fake adapter 验证成功、重复配置幂等、对象不可用、设置失败及读回不匹配，确认失败不会进入显示步骤。
- [x] 1.2 在 macOS adapter 中通过完整 `Window("main")` 解析当前 `NSWindow.contentView`，主线程启用 layer backing 并配置既有 layer 的四角裁剪；用生产接线测试和 `pnpm run src-tauri:check` 确认没有选择单个 WebView、替换 contentView、改变 responder 或持有跨线程裸指针。
- [x] 1.3 为现有 macOS `objc2-app-kit` 增加最小必需 feature，保持已锁定版本和非 macOS 条件编译边界；以 Cargo diff、`pnpm run src-tauri:check` 和默认构建确认无需 vendor 修改或依赖升级。
- [x] 1.4 同步 `docs/en/architecture/plugin-child-webview-runtime.md` 及中文镜像中的原生共同容器、Window 级所有权、逻辑半径和阴影边界；逐段对照实际 adapter 与两种语言，消除“CSS 即可裁剪 native sibling”的隐含表述。

## 2. 首次显示与失败时序

- [x] 2.1 将 macOS 主窗口创建接线改为隐藏创建，在 Host view 建立后、插件可呈现前安装并确认裁剪；用初始化顺序测试证明确认发生在首次 reveal 之前，非 macOS 初始化语义保持不变。
- [x] 2.2 显式接入首次 reveal 与既有激活/焦点行为，保留快捷键注册失败仍可见的窗口兜底；以顺序和失败注入测试覆盖成功启动、注册失败、重复初始化及不得遗漏首次显示。
- [x] 2.3 将 native Window/contentView/layer 不可用及读回失败映射到有界 setup 错误，保持失败窗口不呈现；测试没有先显示后补裁剪，没有向产品文案暴露原生内部诊断。
- [x] 2.4 若主线程操作需调度，接线必须等待真实执行结果；以可控制队列测试区分投递成功、执行失败和过期完成，避免主线程自等待，并证明未确认之前不会显示内容。
- [x] 2.5 同步既有架构文档及中文镜像的首次显示、快捷键失败兜底、失败和整体回滚说明；核对文档与生产顺序/失败测试一致。

## 3. 插件呈现、几何变化与生命周期

- [x] 3.1 在当前 Child 首次 reveal、same-attempt restore 和父窗口恢复显示路径接入幂等裁剪确认，保留 load/bridge/SDK readiness；通过既有 Child/launcher controller 测试验证无额外 resolve/create/load、Session/Worker/model 重建或焦点转移。
- [x] 3.2 保持当前 contentView bounds 的隐式裁剪，并在现有 surface 配置完成路径维持策略；测试固定与 resizable surface 转换、resize burst、工作区适配及 1x/2x/其他有效 scale 下逻辑半径恒定，Child physical bounds 与 revision 收敛规则不变。
- [x] 3.3 覆盖 Home/Search/Host Page、插件 loading/ready/failed/retry、Settings overlay、close/reopen 和 A 到 B 替换；以生产控制器/fake adapter 断言证明旧 attempt 的更新、ready 和 destroy 不移除 Window 裁剪或操作新 Child。
- [x] 3.4 接入运行期重确认失败的既有错误/隐藏路径，保留可确认的安全呈现；用失败注入测试覆盖无未裁剪 Child 暴露、无虚假显示成功、Host 可安全显示时导航/重试/关闭仍可用，以及恢复后正确重新确认。
- [x] 3.5 同步既有架构文档及中文镜像中 resize/scale、同 attempt 恢复、晚到事件和错误边界；用场景对照表确认官方、外部、Development Mode 插件没有不同裁剪路径。

## 4. Host 样式一致性与跨层验证接线

- [x] 4.1 在现有 Rstest discovery 范围内增加 Rust 逻辑半径与 `.launcher-surface` 18px 的一致性断言，保留 CSS overflow、透明根背景和无外阴影；验证测试能识别半径漂移而不把 CSS 声明称为原生裁剪证明。
- [x] 4.2 扩充已有 slot/App Shell 回归，覆盖 edge-to-edge 的零 inline/bottom inset、零 gap、无内卡片圆角，以及 `en-US`/`zh-CN`、light/dark、空白/不透明插件内容和错误状态；确认没有插件专用分支、新增焦点目标或公开协议字段。
- [x] 4.3 将原生策略与生产接线检查纳入已有 `plugin-child-webview-runtime`、`plugin-child-webview-window-lifecycle` / `launcher-input-focus` Gate 路径；核对实际调用测试过的策略，保持现有输入/编辑回归和锁定依赖检查，不添加根脚本或真实 WebView 路径。
- [x] 4.4 同步 `docs/en/development/frontend-guidelines.md`、`docs/en/development/validation.md` 和中文镜像，明确 DOM 样式、原生策略、接线及编译证据的分工；核对 Gate IDs 可解析，文档不承诺未验证的 macOS 像素、阴影或原生边缘交互。

## 5. 最终验证与归档准备

- [x] 5.1 执行 `pnpm run gate -- plugin-child-webview-runtime`、`pnpm run gate -- launcher-input-focus`、`pnpm run gate -- validation-governance`，记录实际计划与结果；确认依赖已覆盖 `plugin-runtime-slot`、`plugin-child-webview-window-lifecycle`、`frame-aware-navigation-dependency-drift`，不重复执行同一依赖阶段。
- [x] 5.2 执行完整前端/workspace 验证 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，分别记录测试、类型、格式/静态检查与构建结果；focused Gate 不替代全量验证。
- [x] 5.3 执行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`；另用相同入口追加 `--features plugin-development-mode` 执行 test/check/build，记录默认与开发构建的实际覆盖，Gate 已执行的同参数步骤可复用证据。
- [x] 5.4 修复本变更新增及触及的所有 warning/error，重跑失败命令和完整最终验证集；包含用户已确认的三个 Rust `cfg(test)` 文件中四处 Host API 兼容上限夹具修正（`0.4.0` → `0.5.0`），以及本轮触及的资源绑定接线断言漂移；记录继承问题与本变更结果的区别，不以模型/编译成功声称实机像素验收。
- [x] 5.5 在同步前扫描 root manifest、CI、维护中的 docs/specs 和 validation registry，确认没有 Change 专用根命令、直接 Rstest 文件列表别名、递归 check、旧 Evidence dispatcher 或真实 WebView/GUI/截图/视觉基线/性能入口；记录实际检查路径与结果。
- [x] 5.6 实施完成后，将最终接受的两份中文 delta 同步为 `language_policy.stable_specs` 指定的英文 stable specs，保留既有 requirement/scenario 的完整语义；逐项核对本文 2 个能力的 delta 与同步结果，不在同步时删除旧场景。
- [x] 5.7 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 对最终接受范围完成 change-scope 文档与治理审计，记录 scope、检查对象、结论和理由、实际更新路径与验证；重新确认早期审查，缺失或冲突的范围内文档必须修复。
- [x] 5.8 在审计及修复后重新判定 project-level audit 触发条件并记录理由；预计只更新既有分类文档、普通代码和测试而不触发，若实际触及入口、索引、语言/目录关系、治理规则或生成配置，则完成相应 project-level audit 后再判定就绪。
- [x] 5.9 核对双语文档语义、现有索引与所有受影响链接，执行 `openspec validate preserve-launcher-native-rounded-corners --strict`、`openspec validate --specs --strict` 及 `pnpm run gate -- validation-governance` 验证同步后结果；在下表填写真实证据，明确尚未执行的归档、发布和实机验证。

审计与最终验证记录（2026-11-03）：

| Evidence | 当前状态 |
| --- | --- |
| Reviewed scope | proposal、design、tasks 及两份 delta；`src-tauri/src/launcher_rounded_corners.rs`、`frame_aware_navigation_setup.rs`、`launcher_window.rs`、`launcher_surface.rs`、`lib.rs`、Child adapter/service/slot/dispatcher 和对应测试；CSS/Rust drift、slot/App Shell 回归；现有 Gate 接线；用户已批准的四处 Development Mode 测试夹具上限修正。 |
| Objects checked | 两份对应 stable specs；`docs/en/architecture/plugin-child-webview-runtime.md`、`docs/en/development/frontend-guidelines.md`、`docs/en/development/validation.md` 及 `docs/zh/` 镜像；双语 index、20 个相对链接和锚点；`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、root manifest、`.github/`、validation catalog 与执行计划。 |
| Project-level audit | 审计前及修复后均不触发。仅修改既有分类文档、普通代码/测试、两份能力规范、Cargo feature 和已有 Gate 的步骤/断言；未改变 README/AGENTS、索引、语言集合/目录关系、治理规则、spec-driver 配置或生成集成。新增测试夹具修正与接线断言维护不改变此结论。 |
| Result and rationale | 实施与归档准备就绪：共同原生内容容器的 18 逻辑点四角裁剪在首次显示前建立，在父窗口/Child 呈现和 surface 配置时确认；确认不持有 Child registry 锁，完成后重新核对 attempt、handle、readiness 和私有显示意图版本。surface 主线程回调只投递合并请求，工作线程保持原事务顺序。窗口拥有裁剪，旧 Child 无权移除；原公开协议、slot 几何、焦点与插件来源边界不变。 |
| Updated paths | 上述 Rust 实现及 `src-tauri/Cargo.toml`、`Cargo.lock`；`scripts/launcher-rounded-corners-contract.ts`、`check-plugin-runtime-slot.ts`、`check-plugin-child-webview-resource-binding.ts`、`validation/catalog.ts`；`tests/launcher-rounded-corners.test.ts`、`plugin-runtime-slot.test.tsx`、`plugin-page-navigation-ui.test.tsx`、`validation-registry.test.ts`；上述六份双语文档；`openspec/specs/frontend-foundation/spec.md`、`openspec/specs/plugin-child-webview-runtime/spec.md`；三个 Development Mode Rust 文件内的四个 `cfg(test)` 夹具值。 |
| Spec synchronization | 两份中文 delta 已逐项同步为英文；frontend requirement 保留原 6 个场景并扩展至 9 个，Child slot requirement 保留原 7 个并扩展至 11 个。唯一旧场景语义变更为计划中的外轮廓裁剪 MAY → MUST；没有删除原场景。 |
| Gate validation | `pnpm run gate -- plugin-child-webview-runtime launcher-input-focus validation-governance` 通过。采用 CLI 支持的组合请求执行三项指定 Gate，解析 17 个 Gate、42 个唯一执行步骤；包含 `plugin-runtime-slot`、`plugin-child-webview-window-lifecycle`、`frame-aware-navigation-dependency-drift`，共享步骤按 ID 去重。包含锁定依赖检查和 macOS Tao `-D warnings` 编译。同步前及最终审计记录后单独执行的 `validation-governance` 亦通过。 |
| Frontend/workspace validation | 最终完整重跑 `pnpm run test`：11 个测试汇总共 1659 项通过（Host 875）；`pnpm run typecheck`、`pnpm run check`、`pnpm run build` 全部通过。focused Gate 未替代这些完整命令。 |
| Rust validation | 最终完整重跑 `pnpm run src-tauri:format:check`、`src-tauri:test`、`src-tauri:check`、`src-tauri:build` 全部通过，默认测试 330/330。相同 test/check/build 入口追加 `--features plugin-development-mode` 全部通过，开发模式测试 360/360。文档要求的 `cargo test --release --manifest-path src-tauri/Cargo.toml --lib release_setup` 3/3 通过。原生策略 8 项、surface 24 项、Child service 24 项及窗口启动/恢复回归包含在这些测试中。 |
| Governance/spec validation | root manifest、CI、维护中的 docs/specs、registry 扫描与 Gate 检查通过；命中 screenshot/Evidence 等词的维护文案为禁止或证据限制说明，不是可执行入口。无新增根命令、Change 别名、直接文件列表根脚本、递归 check、旧 Evidence dispatcher 或真实 WebView/GUI/视觉验证路径。变更 strict 校验通过；stable specs strict 45/45；双语路径、索引导航、链接/锚点、机器标识符语义对照和 `git diff --check` 通过。 |
| Failure repair and inherited evidence | 最初 Development Mode 测试 349 通过、11 失败：HEAD 的四处有效插件测试夹具上限排除当前 Host API `0.4.0`，与圆角实现无关；用户明确批准将测试上限改为 `0.5.0` 后 360/360 通过。组合 Gate 最初发现资源绑定断言仍匹配旧的直接调用；本轮触及的 `lib.rs` 已使用既有 helper，断言已核对 helper 内真实绑定与生产调用并修正。实施期绑定访问器/调用顺序及格式问题均已修复，失败命令与完整最终集已重跑，无剩余 warning/error。 |
| Dependency and evidence boundaries | Cargo 只增加既有 macOS `objc2-app-kit` 的 `objc2-quartz-core` feature；锁文件仅新增该已锁定依赖边，不升级版本、不修改 vendor。没有启动 GUI、浏览器、真实 WebView 或截图验证。测试/编译不证明实机合成像素、抗锯齿、原生阴影或边缘 hit-test；尚未归档、提交、发布或部署。 |

归档是后续独立操作，仅在实施、英文 stable specs 同步、适用审计和最终验证完成且获得归档指令后进行。本任务列表不执行归档、提交、发布或部署。

## 归档复核（2026-11-03）

本轮依据用户明确的归档指令重新确认上述实施期审计。下表记录本轮实际复核与验证；上表中的全量产品测试仍为实施期证据，本轮未重复执行，也未新增实机验收证据。

| Evidence | 本轮结果 |
| --- | --- |
| Reviewed scope | 最终 proposal、design、27/27 tasks、两份 delta；共同原生容器裁剪策略及启动、父窗口、surface、Child 呈现接线；对应 Rust/Rstest 回归、跨层断言、Gate registry、Cargo feature/lock diff 和四处 Development Mode 测试夹具修正。只读复核未发现接受范围、实现与测试接线之间的归档阻塞。 |
| Spec synchronization | 按内联同步流程复用本轮 `openspec instructions specs --change preserve-launcher-native-rounded-corners --json` 规则快照，核对两份英文 stable specs。frontend 的 9 个场景和 Child slot 的 11 个场景均已涵盖对应 delta，无待应用差异，无需重复改写。结构检查确认标题、Purpose、未涉及的 requirement 保持原样，原 6/7 个场景全部保留；唯一既有场景语义修改为已接受的外裁剪 MAY → MUST，无 delta 操作标题残留。 |
| Objects checked | `docs/en/architecture/plugin-child-webview-runtime.md`、`docs/en/development/frontend-guidelines.md`、`docs/en/development/validation.md` 及中文镜像；双语 index；`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、root manifest、`.github/`、稳定规格与 validation registry。六份文档的归属、时序、失败边界、几何及证据限制与当前实现和规格一致；六份文档、双语 index、五份变更 Markdown 共 61 个本地链接/锚点有效。 |
| Project-level audit | 复核前后均不触发。本轮仅补充本任务文件的归档证据并移动变更目录；本变更未修改 README/AGENTS、文档索引、语言集合、目录镜像关系、治理规则、spec-driver 配置或生成集成，无修复引入新的治理影响。 |
| Result and rationale | 重新确认 change-scope 文档/治理审计通过，无需修订稳定规格或六份双语文档。现有索引覆盖全部受影响文档，维护文案中的 Evidence/GUI 等表述属于禁止或证据边界；root manifest、CI、维护 docs/specs 无本 Change 专用入口或路径引用。 |
| Updated paths | 本轮仅追加本 `tasks.md` 的审计记录；归档时将完整变更目录连同 `.openspec.yaml` 移至 `openspec/changes/archive/2026-11-03-preserve-launcher-native-rounded-corners/`。保留工作区既有实现与文档修改。 |
| Validation | 本轮 `openspec validate preserve-launcher-native-rounded-corners --strict` 通过；`openspec validate --specs --strict` 为 45/45；`pnpm run gate -- validation-governance` 通过（3 个 Gate、4 个步骤，测试批次分别为 6、21、72 项，另有 workspace boundaries 检查）；`git diff --check` 通过。规格结构/原场景保留、双语语义和链接、命令入口扫描通过。全量 frontend/workspace 和默认/Development Mode Rust test/check/build 沿用上表实施期记录，本轮未重新运行。 |
| Evidence boundaries | 未启动 GUI、浏览器或真实 WebView，未证明 macOS 最终合成像素、抗锯齿、原生阴影及边缘 hit-test。归档不包含 Git 提交、发布或部署。 |

归档后检查：已移入上述目录，移动前后的 6 个文件逐字节校验一致（含 `.openspec.yaml`），归档内部相对链接有效；`openspec list --json` 确认活动变更为空，`git diff --check` 通过。本段为移动校验完成后追加的结果记录。
