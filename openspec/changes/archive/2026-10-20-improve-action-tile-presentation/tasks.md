# Tasks

以下为本 Change 的实施与验收清单。各组交付对应测试与文档；最终一组执行集成验证、同步和归档就绪审计。完成状态以复选框及文末实际证据为准，未记录结果的计划命令不代表已经通过。

## 1. 方形 Action 布局

- [x] 1.1 调整 `src/styles/global.less` 及共享 Action 的必要布局，使列宽决定 tile 的方形边长，消除行拉伸／最小尺寸冲突，按钮与 hover/focus/selected 共用边界；通过确定性样式约束及组件测试验证八列 Home、四列 Search、固定图标与标题行盒。
- [x] 1.2 扩展 `tests/launcher-home-ui.test.tsx` 和 `tests/launcher-action-search-ui.test.tsx`，覆盖两个集合各八项、搜索两行八项、空态及 pending／错误反馈，验证排列、主操作和原生窗口目标不因方形展示改变；测试由现有 Rstest discovery 运行。
- [x] 1.3 更新 `docs/en/development/frontend-guidelines.md` 的 Action 布局说明并同步 `docs/zh/development/frontend-guidelines.md`，记录方形边界及列数／窗口约束；核对双语含义、相同相对路径和有效链接，不增加目录或索引入口。

## 2. 单行标题适配

- [x] 2.1 在 `src/app/launcher/` 内实现私有字号计算 helper，使用实际宽度计算 `[12, 14]` 内连续候选并有界校正；新增 `tests/action-tile-title-fit.test.ts`，验证 14px、非整数中间值、12px 截断、恰好容纳、字距差异及无效尺寸，不按字符数或固定档位处理。
- [x] 2.2 将适配 hook 与完整文本测量节点接入 `ActionTile.tsx`，统一 CSS 单行省略和 `isTruncated` 状态，保留完整标题及可访问名称；新增 `tests/action-tile-ui.test.tsx`，用可控 DOM 度量验证字号、固定行盒、原文保留及测量节点不参与辅助技术命名。
- [x] 2.3 实现标题／语言、容器宽度、字体就绪和后续加载的失效重算，合并通知并清理 observer、事件及排队任务；在组件测试中验证缩小后恢复 14px、零宽／失败后恢复、旧异步通知失效、卸载清理及无循环提交。
- [x] 2.4 更新英文 frontend guidelines 中的字号范围、适配触发、回退和单一截断所有权说明，同步对应中文段落；核对示例与实现及测试一致，并明确不依赖 `text-fit` 或新增字体适配库。

## 3. 完整名称提示与交互

- [x] 3.1 在 Home / Search 内实现局部提示候选协调并接入受控 Semi Tooltip，Recent 与 Pinned 共用候选、使用实例唯一标识；组件测试验证只提示实际截断标题、hover 优先、短标题抑制旧提示、离开恢复，以及重复 Action 不产生重复浮层或标识。
- [x] 3.2 接入 Home 主按钮焦点和 Escape 关闭语义，保留 Enter／Space 主操作及 pending 去重；扩展 Home 测试验证提示无新增 Tab 目标、不抢焦点、关闭后同一触发周期不立即重开，以及指针进入浮层仍可阅读。
- [x] 3.3 通过必要的 `App.tsx` / `ActionSearchResults.tsx` 展示状态接入输入框焦点和 selected option，包括默认首项；扩展 Search 测试验证完整名称提示随选择更新、焦点留在 input、既有 `aria-describedby` 与 `aria-activedescendant` 保留，以及 Enter 执行、箭头导航、Escape 一次清空和 IME 优先级不变。
- [x] 3.4 完成提示清理和窗口内展示，使用 body overlay、主题 token、限宽及长词换行；测试覆盖查询清空、失焦、卸载、Action 移除、标题更新、字体／宽度变化、英文与中文回退、明暗主题，确认没有失效标题、额外按钮或重复产品文案。
- [x] 3.5 在 `docs/en/development/frontend-guidelines.md` 和 `docs/en/architecture/overview.md` 记录当前实现的提示所有权、键盘焦点与测量边界，同步对应两份 `docs/zh/` 文档；逐段核对两种语言及现有索引链接，并确认没有把未实现内容写成已交付能力。

## 4. 最终验证与归档就绪

- [x] 4.1 运行现有 `pnpm run gate -- launcher-input-focus`，单独记录 Search、IME 和焦点回归结果；确认新测试仍由完整 Rstest discovery 覆盖，没有新增 Change 专用根脚本、Gate、Generate target 或运行时依赖。
- [x] 4.2 执行完整前端／workspace 验证：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，记录实际命令、结果和覆盖边界；其中 `check` 包含格式及静态检查，不能只用聚焦 Gate 代替。
- [x] 4.3 按仓库要求运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`，记录结果并确认 Rust/Tauri 契约无修改；这些是仓库回归，不引入浏览器、真实 WebView、GUI、Launch Services 或交互 native harness 验收。
- [x] 4.4 在满足 clean-checkout-equivalent 准备条件下运行现有 `pnpm run gate -- ci-lensx` 和 `pnpm run gate -- ci-plugins`，记录准备条件和实际结果；复用确定性构建、包和 CLI 检查，不增加截图、像素、视觉基线或目标环境性能阶段。
- [x] 4.5 修复本变更新增的所有 warning/error，并重跑失败命令及最终验证集合；记录未执行或受阻项的具体原因，未完成必需验证时不得宣称归档就绪。
- [x] 4.6 在同步前扫描 `package.json`、CI、维护文档及 specs，确认不存在 Change 专用入口、已删除别名、根脚本直接指定 Rstest 文件列表、递归检查链或失效 dispatcher 引用；通过实际扫描结果和 `git diff --check` 验证，仅处理本变更相关问题。
- [x] 4.7 在实施完成后的同步阶段，将已接受 delta 转为 `govern-spec.yaml` 指定的英文并同步到 `openspec/specs/frontend-foundation/spec.md`，保留现有要求及场景；运行 `openspec validate improve-action-tile-presentation --strict --no-interactive` 和 `openspec validate --specs --strict --no-interactive`，记录实际同步路径及校验结果。同步必须先于归档，本任务不授权执行归档。
- [x] 4.8 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 审计最终 accepted scope，并在本文件追加证据：范围、检查的实现／测试／specs／文档／索引／语言／链接／治理路径、结论和理由、实际更新路径、实际验证结果。复核英文文档及中文镜像；即使无需进一步更新，也记录覆盖依据。
- [x] 4.9 在本文件记录 project-level audit 触发判断：预期仅变更既有分类文档与展示能力，不触发项目级治理审计；若最终修复涉及索引、文档结构、语言关系、agent 指令或其他治理面，则补做并记录项目级审计。重新确认此前审计，只有同步、文档和全部适用验证完成后才记录归档就绪，等待单独的归档指令。

## 实施、验证与归档就绪证据（2026-10-20）

### 最终 accepted scope 与实现复核

- 范围为 Recent、Pinned、Search 的共享方形 Action、完整标题的连续 `12–14px` 适配和截断全文提示。Home 八列、Search 四列最多八项、固定窗口目标、Action 身份／排序／执行／集合持久化保持原有契约。
- 检查并更新 `src/styles/global.less`、`src/app/launcher/ActionTile.tsx`、`LauncherHome.tsx`、`ActionSearchResults.tsx` 和必要的 `src/App.tsx` 焦点展示状态。新增私有 `actionTileTitleFit.ts`、`useActionTileTitleFit.ts`、`useActionTileTooltip.ts`；没有公共插件 API、Rust/Tauri payload 或持久化格式变更。
- 适配器只度量完整文本，独立使用 `14px` 基准、比例候选和有界校正；可见标题与测量节点共享有效字体继承、字重及字距。固定 `28px` 图标和 `20px` 行盒，只有最小字号仍超宽时判定截断。无效尺寸回退、标题／语言失效、ResizeObserver、字体事件、通知合并及卸载清理均已覆盖。
- Home 两集合共享局部候选，实例标识区分重复 Action；指针优先于 Home 主按钮焦点或输入框持焦时的 Search 选择。先仲裁再判断截断，短标题可抑制其他提示；移除后恢复有效候选。显式覆盖 Semi 包装层的默认 Tab 停靠点，保持输入框原有 ARIA 关联、IME 优先级、Enter／Space、方向键、Escape 和 pending 去重。
- 提示挂载到 body，使用主题 token、窗口限宽、长词换行及限高滚动。提示全部内边距和滚动区域均由带鼠标进入／离开处理的内容节点持有；已覆盖进入后等待 `120ms` 及滚动仍可阅读。没有额外产品文案或操作按钮。
- 新增 `tests/action-tile-layout.test.ts`、`tests/action-tile-title-fit.test.ts`、`tests/action-tile-ui.test.tsx` 及 `tests/helpers/action-title-measurement.ts`；扩展两份 launcher Home/Search UI 测试。`tests/plugin-action-mapper.test.tsx` 改用主按钮完整可访问名称断言，避免隐藏测量节点干扰原始文本查询。

### 实际验证与准备条件

环境为 macOS、Node `v24.19.0`、pnpm `11.17.0`，沿用现有依赖和机器配置的全局 store，没有新增运行时依赖、根脚本、Gate 或 Generate target。

| 实际命令 | 结果与覆盖 |
| --- | --- |
| `pnpm run gate -- launcher-input-focus` | 15 个步骤通过；独立验证 Search、IME、输入焦点、active descendant、状态关联及原生窗口生命周期／策略边界，包含严格 Tao 编译和 vendored 格式检查。 |
| `pnpm run test` | 完整 workspace 的 122 个测试文件、985 项测试通过；其中根应用 83 个文件、670 项测试，包含所有新增适配与 UI 测试；0 失败／跳过。 |
| `pnpm run typecheck` | 完整 workspace 类型检查通过。 |
| `pnpm run check` | 格式、静态、生成漂移与源码策略检查通过；稳定规格同步后再次执行并通过。 |
| `pnpm run build` | 完整 workspace 生产构建通过。 |
| `pnpm run src-tauri:format:check` | Rust workspace 格式检查通过。 |
| `pnpm run src-tauri:test` | Rust 231 项测试通过，0 失败。 |
| `pnpm run src-tauri:check` | Rust workspace 静态检查通过。 |
| `pnpm run src-tauri:build` | Rust workspace 构建通过。 |
| `pnpm run gate -- ci-lensx` | 16 个步骤通过；公开依赖按 Contract → CLI 等依赖顺序准备，覆盖前端及 Rust。 |
| `pnpm run gate -- ci-plugins` | 通过；重新构建 4 个公开依赖包并验证 1 个直接插件，ConfigLens 纯 Node 构建产物检查覆盖 29 个自包含文件。 |
| `openspec validate improve-action-tile-presentation --strict --no-interactive` | 同步后通过，exit 0。 |
| `openspec validate --specs --strict --no-interactive` | 同步后全部 42 份稳定规格通过，0 失败。 |
| `git diff --check` | 最终改动通过，无空白错误。 |

- 两个 CI Gate 执行前，已将根应用、5 个公开包、1 个直接插件及3 个示例的共 10 处忽略的 `dist` 输出移开，并确认这些目录不含受管文件。Gate 从缺失构建输出的 clean-checkout-equivalent 条件重新构建，没有重建根 `node_modules`、源代码别名或递归构建补丁。
- 首次聚焦 Gate 和完整测试被实施前已有的 `vendor/frame-aware-navigation/tauri/mobile/android/.gradle/` 缓存阻挡。对完整 vendored 清单逐文件比较，差异仅为 12 个额外缓存文件，受管文件缺失与哈希变化均为 0。临时隔离缓存后，重跑两条失败命令及完整最终验证集合均通过；没有更改 `.lensx-integrity.json`、vendored 源码或忽略规则。
- 验证完成后已原样恢复该缓存，12 个文件恢复前后 SHA-256 一致。这些通过结果对应隔离既有缓存后的源码环境；当前工作区直接重跑完整性检查仍会遇到该既有缓存，不能把它描述为本次源码漂移或不附条件的当前环境通过。
- 本次引入并在开发检查中发现的格式／交互问题已修复；最终 lifecycle、两个 CI Gate 和同步后静态检查均无 warning/error。OpenSpec 只有 INFO：长 requirement 建议，以及已同步 ADDED 已存在的提示；均为 exit 0，不是未完成行为。后续归档须识别已同步状态，避免再次应用相同 ADDED。
- 验证是确定性的算法、DOM／样式约束、状态、Cargo、静态、构建、包和纯 CLI 消费检查，不证明真实平台字体的像素排版、原生 IME 候选窗或真实 WebView 行为。没有启动浏览器、GUI、Launch Services、真实 WebView 或交互 native harness，没有增加截图、视觉基线或目标环境性能验收。

### 稳定规格、双语文档与链接审计

- 按 `govern-spec.yaml` 的英文稳定规格策略，将 delta 的 3 个新增 Requirement、15 个 Scenario 同步到 `openspec/specs/frontend-foundation/spec.md`；原有 480 行逐字保留，追加 221 行英文。Requirement／Scenario 标题及顺序与中文 delta 完全一致，15 个 WHEN／40 个 THEN 对齐；逐段复核未缩减场景或额外扩展契约。active delta 保留中文。
- 已同步实际实现说明：`docs/en/development/frontend-guidelines.md`、`docs/zh/development/frontend-guidelines.md`、`docs/en/architecture/overview.md`、`docs/zh/architecture/overview.md`。四份既有分类文档覆盖布局边界、连续字号、测量生命周期与失败回退、提示候选所有权、键盘焦点和确定性测试边界；没有将未实现内容写成已交付能力。
- 通过临时 Python 的 pathlib／正则链接校验器检查上述四份文档及 `docs/en/index.md`、`docs/zh/index.md`：6 个文件、44 个本地相对目标／标题锚点／显式 HTML 锚点，0 失败。两组文档相对路径和标题层级数量对应，已逐段人工核对中英文含义、范围与限制。两份索引与 HEAD 字节一致，无需新增导航入口或修改其他入链。
- 同步后重新执行 change 和全部 stable specs 严格校验，并对四份文档、两份索引和稳定规格执行 `git diff --check`，全部通过；相关文档无项目临时目录引用。
- 同步前实际扫描 `package.json`、`.github`、`docs`、`openspec/specs` 中 Change ID 及 Action-title 专用别名／失效 dispatcher 模式，无匹配。另解析根 scripts，确认不存在 `&&` 验证链、直接指定 Rstest 文件列表或 Change 专用入口；`git diff -- package.json .github` 为空，现有 `validation-governance`／registry 测试通过。没有新建或保留临时验证入口。

### 治理触发判断与归档就绪结论

- 检查了 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、README 双语入口、两份文档索引、`.agents`／`.codex` 集成、验证命令规则及临时目录边界。最终治理路径差异只包含四份既有分类文档的普通正文；未修改 agent 指令、README、索引、文档结构／语言集／同步关系、driver 配置或生成集成，故不触发 project-level audit。
- 修复有效字体继承、提示鼠标区域及 Tab 行为也没有触及治理面；修复后重新确认上述触发判断。四个根临时目录仍全部被忽略，且无已跟踪文件；本次正式代码、测试、文档和规格无临时来源依赖。
- change-scope audit 已覆盖最终 planning artifacts、受影响实现／测试、同步后的 `frontend-foundation`、既有 `launcher-action-search`／`launcher-action-collections`、上述双语文档及索引／链接／语言关系。结论为覆盖完整，无需进一步文档或治理修复；实际更新路径与验证结果均已列出。
- 同步、双语文档、适用验证和审计均完成，本次 apply 已达到归档准备条件。Change 保持 active，未归档、暂存、提交或推送；等待单独归档指令，归档时仍须复核最终范围、已同步状态和本记录。

## 归档前复核（2026-10-20）

- 本次收到独立归档指令后，重新读取当前 archive context、全部 4 份已完成产物及 CLI 任务统计：`spec-driven`，21/21 项任务完成。归档目标为 `openspec/changes/archive/2026-10-20-improve-action-tile-presentation/`。
- 规格同步先于归档。复用本次获取的 specs rules，逐项复核唯一 delta `specs/frontend-foundation/spec.md` 与对应稳定规格；3 个新增 Requirement、15 个 Scenario 的英文内容已同步，无待应用差异，因此本次同步为无内容变更。原有 480 行、标题及 Purpose 保持不变，新增 221 行英文，场景顺序及 15 个 WHEN／40 个 THEN 对齐，稳定规格没有 delta 操作分节头。
- 再次审计最终实现与测试：`ActionTile.tsx`、`LauncherHome.tsx`、`ActionSearchResults.tsx`、`App.tsx`、`global.less`、3 个新增标题／提示 helper 与 hook、3 份新增 Action tile 测试、Home/Search 和 plugin-action-mapper 测试及测量替身。方形边界、完整文字测量、失效恢复、局部提示仲裁、焦点／IME 与 pending 语义符合 accepted scope；既有 `launcher-action-search`、`launcher-action-collections` 身份、顺序和执行要求保持适用。
- 重新核对 `docs/en/architecture/overview.md`、`docs/en/development/frontend-guidelines.md` 及对应 `docs/zh/` 镜像，并检查双语索引、语言关系和链接：6 个文件的 44 个本地路径／锚点有效，两组文档语义与标题层级对应，索引与 HEAD 一致。现有文档覆盖布局、测量生命周期、提示所有权、键盘及确定性验证限制，无需继续更新；本次仅追加本文件的归档审计证据。
- 复核 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、双语 README／索引、`.agents`、`.codex`、`package.json` 和 `.github`：治理面差异为空；普通分类文档正文更新不改变目录、语言集或同步关系，因此仍不触发 project-level audit。根 25 个 scripts 无 `&&` 验证链、直接 Rstest 文件列表、Change 专用入口或 Evidence script；根 manifest、CI、维护文档和稳定规格无本 Change 专用别名或失效 dispatcher 引用。4 个根临时目录仍被忽略且无已跟踪文件。
- 本次实际执行 `pnpm exec rstest run tests/action-tile-layout.test.ts tests/action-tile-title-fit.test.ts tests/action-tile-ui.test.tsx tests/launcher-home-ui.test.tsx tests/launcher-action-search-ui.test.tsx tests/plugin-action-mapper.test.tsx`：6 个文件、63 项测试通过，0 失败／跳过／todo。此为聚焦归档回归；前文完整 workspace、Rust、两个 CI Gate 的通过证据予以复核沿用，本轮没有重新执行这些完整集合。
- 本次实际执行 `openspec validate improve-action-tile-presentation --strict --no-interactive` 与 `openspec validate --specs --strict --no-interactive`：变更有效、42 份稳定规格通过；只有已有的长 requirement 和 ADDED 已同步 INFO。`git diff --check` 通过。当前既有 `.gradle` 缓存及其他非归档文件保持原状；完整验证仍带有前文隔离该缓存的准备条件，不将聚焦测试通过描述为当前完整性检查无条件通过。
- 结论：本次 change-scope audit 重新确认此前审计，规格、双语文档与适用验证证据覆盖完整，无待修复的范围内文档或治理问题，具备归档条件。验证范围仍限于确定性算法、DOM／样式、状态及已有 Cargo／构建／CLI 证据，不扩展为真实字体像素、原生 IME 候选窗或真实 WebView 验收。
