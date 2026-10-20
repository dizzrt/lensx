# Tasks

## 1. 共享外层样式与维护文档

- [x] 1.1 删除 `src/styles/global.less` 中 `.launcher-surface` 的 CSS `box-shadow`；通过 diff 审核确认 `18px` 圆角、`overflow: hidden`、主题背景及现有窗口几何保持不变，且没有修改内层组件投影、Tauri 配置、Rust 或 vendored 依赖。
- [x] 1.1a 按用户追加授权，将 `vendor/frame-aware-navigation/tauri/mobile/android/.gradle/` 的 12 个已跟踪缓存文件保存在仓库外可恢复备份，取消跟踪并添加根 `.gitignore` 精确规则；不修改依赖源码、完整性基线或扫描逻辑，运行直接依赖完整性检查并重跑 1.2 的完整测试。
- [x] 1.2 运行 `pnpm run test`，记录包含 `tests/app-shell-navigation.test.tsx`、`tests/plugin-page-navigation-ui.test.tsx` 的现有共享外壳、页面切换、语言、主题及交互回归结果；本次一处声明删除不新增实现镜像式 CSS 字符串测试，也不改动专测 Action tile 的布局测试。
- [x] 1.3 在 `docs/en/development/frontend-guidelines.md` 的 Styling 部分说明共享外层圆角、裁剪、主题背景及原生投影责任，并同步 `docs/zh/development/frontend-guidelines.md`；逐项核对两种语言的含义、范围和验证限制一致，保持现有目录、索引和链接有效。

## 2. 最终验证与归档准备

- [x] 2.1 运行 `pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`，记录前端类型、格式、静态分析和构建结果；核对 1.2 的完整测试结果仍对应最终产品代码，若之后有相关修改则重跑 `pnpm run test`。Less 编译由构建覆盖，声明删除与保留项由 diff 审核确认。
- [x] 2.2 运行现有 `pnpm run gate -- plugin-runtime-slot`，记录外层 `18px` 圆角、插件布局及其 React/Rust 边界回归结果；将 Gate 证据与完整前端 lifecycle 证据分别记录，不新增或修改根脚本、Gate、Generate 或环境验证入口。
- [x] 2.3 根据最终 diff 记录完整 Rust 检查的适用性：本范围改变 Less、文档、缓存忽略规则和已跟踪缓存，未改变 Rust 源码、原生配置、Rust 构建配置或依赖源码，因此额外的 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 不适用；明确 2.2 仅执行 Gate 既有的部分 Rust 验证，不以部分 Gate 冒充完整 Rust 验证。
- [x] 2.4 在同步或归档前扫描根 `package.json`、CI、维护文档及规格，核对不存在本变更引入的 Change 专用命令、测试子集别名、递归检查链或废弃 dispatcher 引用，记录实际扫描范围和结论；保留正常的 OpenSpec 变更标识和文档引用。
- [x] 2.5 将已接受的 `frontend-foundation` delta 转写为英文并同步至稳定规格，保留机器可识别结构及规范语义；核对没有覆盖或删除既有要求与场景，记录同步路径和结果。同步必须先于归档。
- [x] 2.6 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 对最终范围完成治理与文档审计，并在本文件记录范围、检查路径、项目级审计触发决定、结论、理由、更新路径及实际验证。检查本变更 artifacts、共享样式、相关测试、`frontend-foundation` 与窗口相关稳定规格、双语前端指南、相关架构文档、索引、语言及链接；额外的缓存忽略规则按临时目录治理影响触发有限的项目级审计，复核根临时目录规则、入口、语言及命令边界，修复后再次确认。
- [x] 2.7 运行 `openspec validate remove-launcher-surface-css-shadow --strict` 与 `openspec validate --specs --strict`，复核同步后的规格、双语文档、链接及范围一致性；修复本变更引入的所有警告、错误和审计缺项，再重跑失败命令及完整最终适用验证集合，并记录真实结果。
- [x] 2.8 核对交付记录明确区分“已删除外层 CSS 投影、保留圆角和原生配置”与“macOS 最终像素效果未验证”；确认没有新增浏览器、真实 WebView、GUI、Launch Services、原生交互、截图、像素、视觉基线或目标环境性能验证路径。记录归档准备结论，归档操作仍需单独授权。

## 执行与验证记录

- 1.1：`git diff -- src/styles/global.less` 确认产品代码仅删除共享外层的 `box-shadow: var(--semi-shadow-elevated)`；`overflow: hidden`、`border-radius: 18px` 和主题背景原样保留。`git diff --stat` 确认无内层控件、窗口几何、Tauri、Rust 或 vendored 依赖修改；`git diff --check` 通过。
- 1.2 首次执行：沙箱内 pnpm 在启动测试前报 `unable to open database file`，允许访问机器配置的全局数据库后正常启动。根应用 83 个测试文件、670 个测试中 669 通过、1 失败；失败位于 `tests/frame-aware-navigation-dependency-drift.test.ts:291`，后续 workspace 成员尚未执行。直接运行 `node --experimental-strip-types scripts/frame-aware-navigation-dependency-drift.ts` 同样报告依赖完整性漂移。只读哈希核对：基线 376 个文件全部匹配，无缺失或内容变化，额外 12 个文件均为已跟踪 Gradle 缓存。用户已授权 1.1a 修复，不能把此次失败记录为通过。
- 1.1a：12 个缓存文件已保存到仓库外备份，并逐一比对移动前后的 SHA-256；根 `.gitignore` 精确排除该 Gradle 缓存目录，`git check-ignore` 验证命中，`git ls-files` 确认该目录已无跟踪文件。直接依赖完整性检查通过（376 个文件）；未重写 `.lensx-integrity.json` 或扫描逻辑。随后完整 `pnpm run test` 退出码为 0，共 122 个测试文件、985 项测试通过。
- 1.2 重跑：完整 workspace test lifecycle 通过，包含根应用 83 个文件、670 项测试；`rstest.config.ts` 的 `tests/**/*.test.{ts,tsx}` discovery 包含共享外壳、插件页面导航和此前失败的依赖完整性回归。现有测试覆盖页面切换、失败恢复、语言、主题与键盘/焦点行为；未新增 CSS 声明字符串测试，也未修改 Action tile 测试。测试对应最终产品代码与缓存修复。
- 1.3：英文 Styling 与中文“样式”部分已同步外层 `18px` 圆角、裁剪、主题背景、原生投影职责，以及语言/主题、窗口几何、交互、内层投影不变的范围。两语均说明浏览器预览缺少 macOS 原生投影，确定性验证不能证明 macOS 最终像素效果。逐项对照 diff 语义一致，未新增或移动文档、标题和链接；原有索引与路径保持有效，`git diff --check` 通过。
- 2.1：完整 workspace `pnpm run typecheck`、`pnpm run check`、`pnpm run build` 均退出码 0，日志未出现 warning/error。构建覆盖 Less 编译；类型检查和静态检查分别执行，未用 Gate 替代完整 lifecycle。1.2 重跑后仅更新文档与任务证据，产品代码和缓存修复未再变化，因此 985 项测试结果仍适用于最终实现。
- 2.2：`pnpm run gate -- plugin-runtime-slot` 退出码 0：既有 source check 验证外层 `18px` 圆角、插件无内层圆角及布局边界；4 个 Rstest 文件共 27 项通过，Cargo 的 presentation/service/slot 三组分别 2/21/5 项通过，既有 `cargo check` 和 `app:typecheck` 通过。无 warning/error，未改变 Gate、Generate 或根脚本。
- 2.3：`git diff --name-only HEAD` 确认产品仅有一条 Less 声明删除，额外内容为文档、忽略规则与 12 个缓存删除；Rust/Tauri 源码、配置、Cargo 清单、依赖源码与完整性基线均未改变。因此不额外运行完整 `src-tauri:format:check`、`src-tauri:test`、`src-tauri:check`、`src-tauri:build`；2.2 的 28 项 Rust 测试和 cargo check 仅为 Gate 的部分 Rust 证据。
- 2.4：同步前扫描 `package.json`、两份 `.github/workflows/*.yml`、维护 docs、全部稳定规格及本 change 的 4 个 Markdown（96 个文件）。25 个根脚本符合既有 `ROOT_SCRIPT_POLICY`；对照 87 个 retired aliases，并解析 163 个 Gate 和 16 个 Generate 引用，未发现失效引用、Change 专用入口、Rstest 文件列表别名或递归检查链。补充 `rg` 扫描维护入口无本 Change ID、`pnpm evidence`、`check:`/`test:` 旧别名及 `rstest run tests/` 命中；`git diff HEAD -- package.json .github scripts/validation` 为空。正常 OpenSpec 标识及规划文档引用保留。
- 2.5：按当前 `openspec instructions specs --change remove-launcher-surface-css-shadow --json` 规则，将中文 delta 合并到 `openspec/specs/frontend-foundation/spec.md`。新增英文要求 `Launcher outer surfaces must use consistent rounded corners and shadows`，对应原要求“Launcher 外层表面必须统一圆角与投影表现”；同步 Home/Search、进入退出页面、失败恢复、语言主题四个场景。源 delta 保留中文，后续归档应识别此语义对应，避免重复追加。逐字节比较确认既有稳定规格全文保持原样，仅追加 1 条要求及 4 个场景，未引入 delta 操作标题。`openspec validate --specs --strict` 通过。

## 治理与文档审计

- 审查范围：本 change 的 proposal、design、delta、tasks；`src/styles/global.less`、`src/App.tsx`、`tests/app-shell-navigation.test.tsx`、`tests/plugin-page-navigation-ui.test.tsx`、`tests/frame-aware-navigation-dependency-drift.test.ts`、`scripts/check-plugin-runtime-slot.ts`、依赖完整性扫描器与基线；根 `.gitignore` 及 12 个已取消跟踪的 Gradle 缓存。产品实现仍只有一条外层 CSS 声明删除。
- 检查对象：`openspec/specs/frontend-foundation/spec.md`、`launcher-window-lifecycle/spec.md`、`plugin-page-window-presentation/spec.md`、`plugin-child-webview-runtime/spec.md`；两语 `development/frontend-guidelines.md`、`architecture/overview.md`、`architecture/plugin-child-webview-runtime.md`、`development/project-workflow.md` 及索引。检查 `src-tauri/tauri.conf.json`、`src-tauri/src/frame_aware_navigation_setup.rs` 和 vendored Tao 的原生投影默认值，确认职责和配置未变。
- 项目级审计触发：原始样式与分类文档改动不触发；追加缓存忽略规则按临时目录治理影响执行有限项目级审计。复核 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、README 双语、索引与 `.gitignore`，不扩展到历史功能审计。四个根临时目录的忽略规则仍有效且无跟踪文件；新增精确缓存规则未改变它们的权限、用途或稳定来源身份。修复后再次核对，未触及其他治理表面。
- 结论与理由：双语前端指南已补齐共享外层责任、适用状态和验证边界；稳定规格新增一条英文要求及四个场景，保留既有要求。窗口几何、插件原生缩放和 Child WebView 布局契约无冲突，既有架构文档继续准确，无需重复添加投影细节。README、索引、语言政策、agent/driver 规则及生成集成无更新需要，因为职责、路径、语言集与工作流保持不变。
- 实际更新路径：`src/styles/global.less`、`.gitignore`、两语 `docs/*/development/frontend-guidelines.md`、`openspec/specs/frontend-foundation/spec.md`、本 change 的 proposal/design/tasks，以及 12 个缓存跟踪条目的删除。未修改依赖源码、扫描器、完整性基线、根脚本或 CI。
- 实际审计验证：最终只读检查 20 个范围内文件的 77 个相对链接、9 个锚点，全部有效；两语文档相对路径集合为 23/23，目录根布局有效，新增文档段落与 delta 英译逐项一致。命令扫描重核 100 个文件、25 个根脚本、87 个废弃别名、164 个 Gate 引用及 16 个 Generate 引用，无失效命令或新增入口。`openspec schemas --json` 确认 `spec-driven` 可用；工作树与索引的 `git diff --check` 均通过。此前完整测试、类型、静态、构建及 Gate 证据适用于最终产品代码；稳定规格严格校验已通过，最终全量 OpenSpec 校验在 2.7 记录。

- 2.7：最终 `openspec validate remove-launcher-surface-css-shadow --strict` 通过；`openspec validate --specs --strict` 为 42/42 通过；治理补充的 `openspec validate --all --strict --no-interactive` 为 43/43 通过。无 WARNING/ERROR，只有长 requirement 的 INFO 建议。双语、局部链接与最终 diff 复核通过。缓存修复后已重跑原失败检查、完整测试和全部最终适用 typecheck/check/build/Gate，后续仅有文档、规格及审计记录变更，无需重复运行未受影响的产品测试。

- 2.8：最终范围确认：共享外层 CSS 投影已删除，`18px` 圆角、裁剪、主题背景及原生投影配置保留；985 项完整测试与确定性 Gate 通过，不代表 macOS 最终像素效果已验证。未创建浏览器、真实 WebView、GUI、Launch Services、原生交互、截图、像素、视觉基线或目标环境性能验证路径。缓存修复已获单独授权，12 个缓存的取消跟踪删除位于暂存区；其他修改未暂存，未提交或推送。稳定规格已同步，变更级与有限项目级审计及严格验证完成，已具备归档准备条件；本次未执行归档，实际归档仍须单独授权并复核最终状态。

## 2026-10-20 归档复核

- 授权与产物：用户明确请求归档 `remove-launcher-surface-css-shadow`。当前 repo-local root 为本仓库，schema 为 `spec-driven`；`openspec status --change remove-launcher-surface-css-shadow --json` 的四个产物均为 `done`，`openspec list --json` 唯一匹配项为 12/12 项任务完成。已读取本次 archive 上下文及四条操作指导，均与项目流程一致。
- 同步先行：仅使用 status 返回的 `specs/frontend-foundation/spec.md` 作为 delta 来源，并读取一次当前 specs 指令。中文新增要求及 Home/Search、页面进入退出、失败恢复、语言主题四个场景已逐项对应稳定规格中的英文要求 `Launcher outer surfaces must use consistent rounded corners and shadows`。本次幂等同步复核无需重写或重复追加；字节比较确认原稳定规格全文、标题和 Purpose 未变，仅追加这一条英文要求和四个场景，结构无 delta 操作标题。
- 最终范围：重新核对 proposal、design、delta、tasks、共享样式、已有布局边界检查和窗口相关规格，并审查双语前端指南、相关架构文档、索引与治理入口。`git diff HEAD` 的 17 个路径与既有实施记录一致：产品仍仅删除一条外层阴影声明，另有双语指南、稳定规格、精确缓存忽略规则和 12 个缓存删除；原生配置、Rust、依赖源码、完整性基线、根脚本、CI 及验证注册表未变化。本次仅补充本归档审计记录并移动 change 目录。
- 治理结论：保留缓存忽略规则所触发的有限项目级审计，复核 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、README 双语、索引与 `.gitignore`。四个根临时目录及 vendored Gradle 缓存目录均命中忽略规则，均无当前跟踪文件；没有新增语言、文档目录、命令或生成集成。范围内文档对共享外层圆角、裁剪、主题背景和投影职责的覆盖充分，本次无须再修改稳定规格或双语指南。
- 非阻塞既有事项：架构总览 `docs/en/architecture/overview.md` 及中文镜像仍有旧 Plugin iframe / Runtime Session 描述，与专门的 `architecture/plugin-child-webview-runtime.md` 中原生兄弟 WebView 描述不一致。该内容在本变更前已存在，且本次未修改对应架构或总览段落，按项目流程记录为后续事项；前述“无冲突”结论仅限本次共享外层与窗口几何职责，不表示全部历史架构描述均已更新。
- 本次实际检查：`openspec validate remove-launcher-surface-css-shadow --strict` 通过，`openspec validate --specs --strict` 为 42/42 通过；只有既有长 requirement 的 INFO 建议。直接依赖完整性检查重新核对 376 个文件通过；既有 `scripts/check-plugin-runtime-slot.ts` 源码边界检查通过。扫描根 manifest、CI、docs 和稳定规格共 92 个文件，未发现本 Change ID 进入维护入口、废弃 dispatcher 或旧测试命令形式。工作树与暂存区的 `git diff --check` 均通过。
- 独立审计复核：检查 23 个范围与治理文件的 77 个相对链接和 9 个锚点，均有效；双语文档路径集合为 23/23，文档根布局合规。复用现有 `ROOT_SCRIPT_POLICY`、`migrationInventory` 和注册表校验，检查 99 个维护与产物文件、25 个根脚本、87 个废弃别名、164 个 Gate 引用及 16 个 Generate 引用，均通过；审计记录中的旧命令检索词不是可执行维护入口。
- 验证适用性：本次不改产品、依赖或验证实现，沿用上文已经记录的完整前端 985 项测试、typecheck/check/build 及 `plugin-runtime-slot` Gate 证据；本次直接源码检查不冒充重新执行完整 Gate。完整 Rust lifecycle 仍因范围未触及 Rust 或原生构建而不适用。macOS 最终像素效果仍未验证，不新增环境验证路径。
- 归档前最终结果：补充本次审计记录后，`openspec validate --all --strict --no-interactive` 为 43/43 通过，无 WARNING/ERROR；工作树和暂存区差异检查通过，CLI 再次确认 12/12 项任务完成。同步与适用审计均已结束，目标归档目录不存在，满足移动条件。
