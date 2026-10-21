# Tasks

## 1. 插件装配与同组回归

- [x] 1.1 在既有 NLS 后初始化链加载官方 wordOperations；先在原装配下运行真实 Monaco 键盘选区测试失败，再验证左右、重复扩选／反向收缩、空／边界／只读、两语言／主题和非正文焦点；断言内容、onInput 不变、撤销能力保留及默认输入分组，不用热导入／自定义 binding 绕过生产初始化。
- [x] 1.2 在现有产物检查中要求 wordOperations 进入延后加载的 editor 图，验证 bootstrap 预算、Worker 与自包含资源仍通过；沿用现有脚本／discovery，不新增根命令、Gate ID 或依赖。
- [x] 1.3 同步 docs/en/development/config-lens.md 与中文镜像，说明正文键位、默认词边界、焦点／内容不变、插件构建交付和确定性证据边界；核对双语语义、相对链接及未改变的 NLS／Find／Host 职责。

## 2. 最终验证与归档就绪

- [x] 2.1 完成插件 test／typecheck／check／build／test:e2e、根 pnpm run test／typecheck／check／build，以及 pnpm run gate -- ci-plugins validation-governance；修复引入 warning/error 后重跑失败命令与最终集。Rust format／test／check／build、本机 GUI／LLDB 和 vendor Generate 本次不适用：没有 Rust、原生适配、Cargo／SDK／Manifest／权限变更，且不新增环境验收；不把前次原生结果当成本次按词选择实测。
- [x] 2.2 将本次接受的 delta 语义同步为英文 stable spec，保留已有要求／场景；同步前扫描 root manifest、CI、维护文档和 specs，确认无失效 alias、临时来源、Change 专用脚本或退役 dispatcher，运行 Change／stable specs 严格校验。
- [x] 2.3 按项目流程完成最终变更级治理／文档审计，记录范围、检查路径、项目级触发决定及理由、更新路径和实际验证；复核新 diff 与两语言／导航／链接，执行 openspec validate --all --strict --no-interactive 与 git diff --check 后记录就绪。保持两个 Change 的边界与既有工作区修改，当前 Change active，不自动归档、暂存、提交、安装或发布。

## 2026-10-21 实施证据

- 1.1：生产代码仅在既有 `contributions.ts` 增加官方 wordOperations import。模块继续由 NLS 就绪后的 Promise 初始化加载，首次 editor 创建前完成注册；没有新增自定义键位、热导入或 resolver 刷新。`monaco-word-selection-cases.ts` 通过既有 en／zh 测试接线，新增 12 项真实 Monaco 键盘用例。原装配下 8 项失败、4 项非正文焦点负例通过；加载模块后完整 Monaco 聚焦 46/46 通过。另补返回正文后的实际词选择断言，最终完整插件测试 176/176 通过。断言覆盖锚点／方向／选中文本、重复与反向、空／边界／只读、两语言／主题、Find／其他输入不抢焦点、内容版本与 onInput 不变，且实际 Undo／Redo 仍只撤销／重做先前编辑。
- 1.2：现有 `scripts/test-e2e.mjs` 的 delayed editor module 清单新增 wordOperations。对旧产物先得到明确的 missing delayed module 失败，重建插件后检查通过（45 个自包含文件）。实际 module inventory 将该模块归入延后加载的 JS/CSS chunk，未进入 HTML 初始图；初始 JS 为 98,946 bytes，小于既有 256 KiB 上限，其余 CSS／完整 JS／Worker／资源预算检查通过。没有新根命令、Gate、依赖或构建配置。
- 1.3：已同步两语言 ConfigLens 文档的正文词选择、锚点、焦点／undo、NLS 后装配、插件构建交付和确定性证据边界；保留前次 Host 原生修复、剪贴板、Find 布局及生命周期内容。两语言标题结构、相对链接／锚点和 diff 空白检查通过；无文档移动或索引变化。
- 保留前一项 `fix-unified-native-editing-shortcuts` 的全部工作区修改和 23/23 状态；本次没有修改其 artifacts、Host／Rust／vendor 或权限配置。
- 审查校准：官方词选择会结束当前输入 undo 组，原“undo 不变”表述过强。已将本次契约与文档精确为内容不变、既有撤销能力保留且沿用默认分组；补充真实连续输入分组回归后再确认 1.1。此校准不改变用户要求的官方 wordOperations 行为或生产补丁范围。
- 分组补充已通过：每种 locale 各验证真实 typing `alpha`、词选择往返、typing `beta`，随后实际键盘 Undo 依次得到 `alpha`／空、Redo 依次恢复；测试没有手动 pushUndoStop 或先用 paste 封闭输入组。选择本身不新增内容版本或 onInput 通知；typing 的实际逐字符通知按真实数量记录。最终 Monaco 聚焦 48/48、插件 typecheck／check 和 diff 检查通过，1.1 可重新确认。文档与 delta 已同步正确的默认分组语义。

## 最终验证

- 2.1 最终候选：`pnpm run test` 合计 1,166 项通过（含 ConfigLens 完整 178 项），0 失败／skipped／todo；`pnpm run typecheck`、`pnpm run check`、`pnpm run build` 全部通过。插件 test／typecheck／check／build 均由 workspace lifecycle 实际执行；`pnpm --dir plugins/config-lens run build` 与 `node plugins/config-lens/scripts/test-e2e.mjs` 也分别通过。
- `pnpm run gate -- ci-plugins validation-governance` 通过，包含插件最终构建、自包含产物和预算检查；没有新增入口。审查校准及新增分组用例修正后，完整最终 workspace 集和 Gate 已重跑，日志无引入的 warning/error。pnpm 使用机器配置的全局缓存，未修改 store／代理／依赖设置。
- Rust／Host／vendor／原生权限不在本次修改范围，未重跑其 format／test／check／build 或 Generate；前次原生诊断和测试不作为本次词选择的 OS 证据。本次没有启动 GUI、浏览器、WebView、LLDB 或安装／发布。

## 规格同步与最终审计

- 2.2：在成功获取本 Change 的 status／specs instructions 快照后，只在 `openspec/specs/official-config-lens-plugin/spec.md` 追加英文 1 个 requirement／3 个 scenario。程序确认原文件为完整字节前缀，旧内容、标题、Purpose 和顺序保留；delta 保持中文。同步了词边界、锚点、正文焦点、空／只读、内容通知、既有撤销能力与默认分组语义，没有扩大为 Find 原生词选择或 Host 修复。
- 同步前检查 root manifest／CI／既有 registry、两语言 ConfigLens 文档和相关 specs：没有本 Change 专用根命令、新 Gate、失效 alias、临时来源或退役 dispatcher。`ci-plugins`／`validation-governance` 均实际解析并执行通过。Change strict、stable specs strict（42/42）和同步后 all strict（44/44）通过；已同步 ADDED 条目存在的 INFO 为预期状态，后续归档须先复核同步并避免重复应用。

| 变更级审计项 | 结论与证据 |
| --- | --- |
| 范围与检查对象 | 本 Change 四类 artifacts；contributions 初始化与 NLS／single-flight 链；真实词选择及 undo 分组测试、en／zh 接线；真实产物 inventory／预算；两语言 ConfigLens 文档、两索引与链接；official-config-lens-plugin 稳定规格；root scripts、CI、依赖／权限与 governance 入口。 |
| 实际更新路径 | `plugins/config-lens/src/editor/contributions.ts`（1 行 import）；`plugins/config-lens/tests/monaco-word-selection-cases.ts` 及 en／zh 测试接线；`plugins/config-lens/scripts/test-e2e.mjs`（1 个模块清单项）；`docs/{en,zh}/development/config-lens.md`；`openspec/specs/official-config-lens-plugin/spec.md`；本 Change artifacts。 |
| 文档／镜像／导航 | 两语言新增段落与最终实现和测试一致，已纠正过强 undo 表述；relative links／anchors／标题层级检查通过。无文档新增或移动，索引无需改动；旧 Host、剪贴板与 Find 内容保留。 |
| 项目级触发 | 不触发：未改变 README、索引、语言集合、目录／镜像关系、Agent 指令、spec 配置、临时目录政策或生成集成。普通分类文档和已有内部产物检查覆盖变化不改变根命令治理政策。 |
| 工作区隔离 | 前次 native 修复的生产源码、两份 stable specs 和 Change 状态保持；此前未提交修改保留。新插件装配不添加权限、依赖版本、Host／Rust／vendor 改动或环境验证入口。 |
| 验证 | 原装配行为红测和旧产物模块缺失检查按预期失败；修后 Monaco 48/48、完整插件 178/178、workspace 1,166/1,166、typecheck／check／build、ci-plugins／validation-governance 均通过。同步后重新运行治理 Gate、all strict（44/44）、diff 与新增文本空白检查通过。 |
| 结论 | 独立审查已针对最终规格同步重新确认；无范围内未解决问题，变更级审计通过。默认分组校准属于忠实采用用户要求的官方模块语义，未改生产修复范围。 |

本 Change 已就绪并保持 active，不自动归档、暂存、提交、安装或发布。新的 ConfigLens 构建已生成；实际使用须加载更新的插件构建。证据为真实 Monaco 的确定性事件／模型测试及产物检查，不声称完成原生 GUI／OS 按键验收。

## 2026-10-21 归档复核

用户现已明确请求归档本 Change；上文保持 active 的记录对应实施阶段，归档授权以本次请求为准。当前 schema 为 `spec-driven`，CLI 确认四类产物均完成，任务为 6/6。

| 复核项 | 当前证据与结论 |
| --- | --- |
| 接受范围与实现 | 复核本 Change 的 proposal、design、delta、tasks，以及 `plugins/config-lens/src/editor/{contributions,monaco}.ts`、`plugins/config-lens/tests/monaco-word-selection-cases.ts`、en／zh 测试接线和 `plugins/config-lens/scripts/test-e2e.mjs`。官方 wordOperations 在 NLS 就绪后、首个 editor 前注册；测试与产物断言覆盖接受范围。本轮未修改实现、测试或构建配置。 |
| 规范同步 | 已获取当前 specs instructions 并按内联同步流程复核 `official-config-lens-plugin`：英文稳定规范恰有 1 条对应 requirement／3 个对应 scenario，包含默认 undo 分组和非正文焦点边界，与中文 delta 一致，无待应用内容。未重复追加或改写稳定规范；程序确认 HEAD 原有文件为当前文件完整字节前缀，标题、Purpose 和旧要求保持。 |
| 文档、镜像与导航 | 复核 `docs/{en,zh}/development/config-lens.md`、两语言索引、英文 workflow、根与 docs Agent 指令和对应规格。两语言的词选择、NLS、焦点、undo 分组、插件构建交付及确定性证据边界一致。12 个范围内文件的 56 条本地链接／锚点全部有效；英中各 23 份文档路径对应，ConfigLens 标题层级一致。无新增、移动文档或索引更新需求。 |
| 命令与项目级触发 | 扫描 root `package.json`、两份 CI workflow、维护文档和 stable specs 共 91 文件，无本 Change 专用根命令、失效 alias、直接 Rstest 文件列表脚本或退役 Evidence 命令。本次未影响 Agent 指令、README、索引、语言／目录关系、spec driver、临时目录政策或生成集成，因此不触发项目级审计；此前审计结论仍成立。 |
| 实际验证 | 本轮 `pnpm --dir plugins/config-lens run test` 178/178 通过，0 失败／skipped／todo；`node plugins/config-lens/scripts/test-e2e.mjs` 通过（45 个自包含文件）；`pnpm run gate -- validation-governance` 通过；`openspec validate --specs --strict --no-interactive` 42/42、`openspec validate --all --strict --no-interactive` 43/43 通过；`git diff --check` 通过。ADDED 已存在的 INFO 与已完成同步一致，不是未完成任务或校验错误。 |
| 既有验证与边界 | 复核上文完整 workspace test／typecheck／check／build 与 ci-plugins 的实施记录，本轮归档未改实现，因此未重复全量构建。Rust／Host／vendor 仍不在本 Change 范围，未重跑原生层验证或启动 GUI。上一项已归档 native Change 及其他未提交修改保持原样。 |
| 更新路径与结论 | 本轮仅为当前 `tasks.md` 追加复核证据并移动整个 Change；稳定规范和双语文档无需更新。先同步、后审计和校验的要求已满足，无范围内未解决问题，可以按用户授权归档。 |
