# Tasks

本清单记录本次实施与实际验证。已完成项以源码、测试、文档及命令结果为依据；最终验证和归档就绪项仅在相应检查结束后勾选。本次 apply 不执行归档。

## 1. 正式入口名称与现有消费路径

- [x] 1.1 将 Host 消息资源中的设置标题改为 `Settings` / `设置`，将 `plugins/config-lens/manifest.json` 中的 Action 双语标题改为 `ConfigLens`；更新 `tests/launcher-action-service.test.ts` 和 `plugins/config-lens/tests/manifest.test.ts` 的正式元数据断言，验证 ID、target、default action、既有功能关键词及 `Hide launcher` / `隐藏启动器` 均保持不变。
- [x] 1.2 在现有搜索、主页、集合和 App Shell 导航测试中验证新标题在两种 locale 下显示并作为 accessible name，已有 Recent/Pinned ID 和 Dispatcher 打开路径保持有效；保留现有主题、键盘、失败恢复断言，只更新依赖正式文案的期望，不全局改写合法的合成标题夹具。以相关 Rstest 测试通过为证。
- [x] 1.3 用正式设置注册和 ConfigLens 投影元数据验证新名称及既有功能词仍可搜索、description 不参与搜索、无新增旧标题/打开前缀关键词；在仅包含对应 Action 的受控快照中验证缺少匹配 token 的旧完整标题不再命中，避免将断言扩大为整个 Registry 永远返回空列表。以现有搜索/投影测试通过为证。
- [x] 1.4 同步更新 `docs/en/development/config-lens.md`、`docs/en/development/frontend-guidelines.md` 及对应 `docs/zh/` 文件，说明正式入口名称、真实操作保留动词和身份连续性；核对两种语言含义一致、产品 copy 与源元数据一致、既有导航链接有效。

## 2. 模板与 CLI 生成默认值

- [x] 2.1 修改 `examples/plugins/framework-neutral/manifest.json` 和 `examples/plugins/react-semi/manifest.json` 的入口标题为设计中列出的双语目的地名称，并扩展其现有 Manifest 测试验证标题与该模板目的地名称一致、关键词和目标不变；随模板分发的测试应适用于 CLI 自定义名称，不硬编码无法被生成器替换的中文名称。通过两个模板测试及 canonical 名称核对验证。
- [x] 2.2 使用现有 `packages/plugin-cli/scripts/verify-templates.mjs --write` 同步两个 CLI 打包快照，随后以 `node packages/plugin-cli/scripts/verify-templates.mjs` 的只读模式验证零漂移；检查快照差异仅包含本组需要的源变更，不增加根脚本、Gate 或 Generate 目标。
- [x] 2.3 修改 `packages/plugin-cli/src/create.ts` 的标题赋值，直接使用已验证的 `--name`；扩展 `packages/plugin-cli/tests/create.test.ts`，对两种模板实际生成的 Manifest 验证 `My Plugin`、`Open Studio` 双语标题、既有关键词和有效目标，并保留输入拒绝、非空目录保护、staging 清理及无外部副作用测试。运行 CLI 测试验证。
- [x] 2.4 在现有 CLI 打包消费者检查中核验实际 tarball 生成的标题及无旧标题别名，确保生成项目自身测试仍通过；复用 `pnpm run gate -- plugin-project-template` 和 `pnpm run gate -- plugin-developer-cli`，记录两个模板的生成、测试、构建、校验与打包消费结果，消费者安装仅在系统临时消费者目录进行。
- [x] 2.5 同步更新 `docs/en/development/plugin-project-template.md`、`docs/en/development/plugin-developer-cli.md` 和对应中文镜像，说明默认标题、原样保留合法项目名称、无旧标题关键词兼容；核验文档示例与 `create` 输出一致，并检查链接及语言对应关系。

## 3. 命名指南与兼容边界

- [x] 3.1 在 `docs/en/plugin-development/public-packages.md` 的 Action 元数据说明中定义 `title` 展示语义、页面入口目的地命名、多入口区分及真实操作保留动词，明确本次不添加旧标题关键词；同步中文镜像，并使前端/模板/CLI 文档引用同一指南。核对受影响教程，仅修正实际过期的命名示例，不替换普通“打开”操作说明或扩展根治理文件。
- [x] 3.2 复核并按需补充现有 Contract/投影行为测试，证明合法 `Open Studio` 等标题仍可通过并原样保留、空英文标题仍被拒绝；通过测试和差异审查确认未增加前缀禁用、自动裁剪、`name` 字段、Schema/API 版本或搜索算法变更。保留并运行已有相关覆盖即可，不重复添加同义测试。

## 4. 最终验证与归档就绪

- [x] 4.1 串行运行并记录稳定 Gate：`pnpm run gate -- plugin-action-projection`、`pnpm run gate -- plugin-project-template`、`pnpm run gate -- plugin-developer-cli`、`pnpm run gate -- plugin-development-documentation-docs`。若最终代码与相关依赖未再变化，可引用 2.4 的已通过结果而不重复执行；Gate 结果与全量验证证据分别记录。
- [x] 4.2 串行完成最终前端/workspace 验证：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，覆盖应用、ConfigLens、模板和 CLI；记录实际结果，确认 check 包含格式化、静态检查与生成漂移。修复本变更引入的所有错误和警告后，重跑失败命令及完整最终验证集。
- [x] 4.3 完成 Rust 集成回归：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`；即使不修改 Rust 源码，仍记录跨语言 Manifest/包消费者及桌面构建边界的实际验证结果。所有验证保持确定性，不启动真实浏览器、WebView、GUI、Launch Services 或原生交互 harness，不增加截图、视觉或性能验证。
- [x] 4.4 将最终接受的五份增量语义同步为英文稳定规格，保留机器标识和原有未改变场景，并落实设置场景的 description 搜索表述修正；运行 `openspec validate simplify-action-display-titles --strict --no-interactive` 与同步后的 `openspec validate --specs --no-interactive`。对既有稳定规格警告记录来源和是否新增，不能把计划命令记为通过；此任务不移动或归档 Change。
- [x] 4.5 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 审计最终变更范围：记录接受范围、源码/测试与五个稳定 capability、分类文档、索引、双语镜像、链接和治理约束的实际检查路径、结论、理由、修复路径和命令结果。普通分类文案更新预计不触发项目级审计；必须根据最终变更及修复重新判断触发条件，触发时完成额外审计，否则记录不触发理由。
- [x] 4.6 完成归档前一致性核验：确认标题、关键词、身份及生成结果符合接受方案，规范/文档已同步且无未解决的范围内漂移；扫描根 `package.json`、CI、维护文档和规格中新增或残留的 Change 专用命令、旧别名、直接测试文件列表脚本、递归检查或已删除 dispatcher 引用。记录检查结果，并预检将来日期前缀归档路径下的相对链接；归档仍需单独用户请求。


## 实施与验证记录（2026-10-18）

### 已核验的实现范围

- 正式元数据：`src/app/i18n/messages/{en-US,zh-CN}.json` 的设置标题为 `Settings` / `设置`；`plugins/config-lens/manifest.json` 的 Action 双语标题均为 `ConfigLens`。服务和 Manifest 测试断言身份、目标、默认入口、既有关键词及隐藏启动器标题不变。
- 消费路径：`tests/app-shell-navigation.test.tsx` 使用正式设置服务及真实 ConfigLens Manifest 投影，核验两种 locale、浅色/深色、已有 Recent/Pinned ID、可访问名称、Dispatcher、目标及页面上下文；`tests/host-settings-ui.test.tsx` 更新依赖正式标题的期望。搜索和 mapper 测试在仅含目标 Action 的快照中核验旧标题不命中，保留第三方合成夹具。
- 模板/CLI：两个 `examples/plugins/` canonical Manifest 和测试已更新，快照仅由 `node packages/plugin-cli/scripts/verify-templates.mjs --write` 同步，随后只读校验零漂移。`packages/plugin-cli/src/create.ts` 直接使用已验证名称，实际创建测试覆盖两个模板与 `My Plugin` / `Open Studio` 四种组合。`scripts/check-plugin-developer-cli.ts` 在原有 tarball 消费路径新增生成标题、原关键词及目标断言。
- 兼容边界：共享 Contract invalid fixtures 新增缺省/空白英文 Action 标题；既有 Contract 测试断言 `Open Project` / `打开项目` 原样保留。现有 mapper 覆盖保留；没有修改 Schema、协议版本、名称输入范围、搜索算法、生产投影、Rust 源码、WebView 隔离或焦点/responder 实现。

### 聚焦验证与修复

- `pnpm exec rstest run tests/launcher-action-service.test.ts`：5/5 通过；ConfigLens 包内 `pnpm exec rstest run tests/manifest.test.ts`：1/1 通过。
- 搜索、mapper、App Shell、Host 设置、搜索 UI、Home UI、集合七个既有测试文件的聚焦 Rstest：75/75 通过。首次新增集合用例只发 Enter 事件，未模拟原生按钮默认点击；改为按钮点击并保留搜索 Enter、焦点和导航断言后完整重跑通过。
- canonical framework-neutral / react-semi 测试分别 8/8、7/7 通过；CLI 测试 64/64 通过；Contract 测试 112/112 通过。模板测试通过目的地元数据比较支持 CLI 自定义名称，不硬编码中文模板名。
- `plugin-action-projection` Gate 首轮发现旧标题评分期望过期：新完整标题“设置”为 1800 分，混合查询为 1200 分，旧完整标题仅保留原本声明该关键词的第三方夹具。仅更新测试期望，Gate 重跑 87/87 通过，搜索算法未改动。
- 首次 pnpm 运行受沙箱全局工具目录权限限制，使用获准权限重跑。模板 Gate 首轮离线消费者安装因 pnpm 元数据缓存布局变化失败；缓存修复和后续 Gate 结果另记，不将该失败计为通过。

### 规格同步

已将 `launcher-action-core`、`plugin-manifest-contract`、`official-config-lens-plugin`、`plugin-project-template`、`plugin-developer-cli` 五份增量语义合并到对应英文稳定规格：修改 4 个 requirement，新增 3 个 requirement 和 15 个 scenario，原有场景全部保留；设置搜索场景已修正为 title/keywords-only。

- `openspec validate simplify-action-display-titles --strict --no-interactive --json`：1/1 通过。
- `openspec validate --specs --no-interactive --json`：42/42 通过。
- `openspec validate --specs --strict --no-interactive --json`：仍因 257 条既有 requirement 长度警告失败；按 capability、requirement 标题及诊断内容对比实施前基线，新增 0、移除 0。没有新增规格错误；不将严格全量检查记为通过。


### 变更范围文档与治理审计

- **接受范围与检查对象**：复核本 Change 的 proposal、design、五份 delta specs 和 tasks；正式消息/ConfigLens Manifest、两个 canonical 模板及其快照、CLI create/创建与消费者测试、Contract fixtures、Host 服务/搜索/投影/集合/导航测试。五个稳定 capability 与上述实现逐项对应，旧场景全部保留。
- **文档归属与更新路径**：更新 `docs/{en,zh}/development/{config-lens,frontend-guidelines,plugin-project-template,plugin-developer-cli,plugin-development-mode}.md` 和 `docs/{en,zh}/plugin-development/public-packages.md`，共六组镜像。共享规则由 public-packages 的 `action-display-names` 锚点维护；开发模式文档的粗体旧设置名称在独立复核后补正。教程全文及全 docs `Open`/“打开”匹配已复核；普通操作、兼容边界反例和合成 Smoke 夹具保留。
- **导航、镜像与链接**：两份 `docs/{en,zh}/index.md` 及 12 份修改文档共 14 文件、52 个本地链接/锚点通过。六组镜像的链接集合和标题层级一致，人工核对命名、例子、限制与身份连续性语义；两个语言树均为 23 个相同相对路径，均可由各自索引到达，无需修改索引。活动 Change 的 8 份 Markdown 中仅一个本地链接 `proposal.md`，在当前路径及模拟 `archive/2026-10-18-simplify-action-display-titles/` 下均有效。
- **治理触发判定**：不触发额外项目级审计。按当前跟踪/未跟踪路径及 `git diff HEAD --name-only` 复核 119 个治理/集成相关文件：根及目录 instructions、README、索引、语言集合/镜像关系、`govern-spec.yaml`、`openspec/config.yaml`、临时目录规则、生成集成、CI、根 scripts 和 registry 均未变化；新增共享锚点和开发模式标签修复只涉及既有分类正文，没有增删文档或改变导航组织。
- **命令治理**：读取 `tests/validation-governance.test.ts` 和当前 validation catalog，检查 25 个根脚本与 25 个策略键、87 个已退休别名、9 个 workspace check 脚本及 91 个维护面文件（46 docs、42 稳定 specs、2 CI workflows、根 package.json）。161 个 Gate 引用对应 37 个有效 ID，16 个 Generate 引用对应 4 个有效 ID；没有 Change 专用根脚本、旧别名、直接测试文件列表根脚本、根 shell 链、递归/重叠生命周期或 Evidence dispatcher 命令。
- **临时材料与元数据差异**：四个根临时目录均被忽略，跟踪文件为零。对 HEAD 的 JSON 结构比较证明两份消息及五份正式/模板 Manifest 仅改变预期 title 字段；根 package、lockfile、搜索源码未变化。现有模板 descriptions 中“打开页面”仍只是说明，不参与搜索。
- **结论与理由**：本次命名范围的规格、实现、文档和镜像已对应，无未解决的范围内漂移。`git diff --check` 通过；以上均为确定性检查，不建立真实 WebView、GUI 或原生交互行为证据。最终生命周期和消费者 Gate 结果另列，未通过项不会因本审计而视为通过。
- **独立于本次范围的既有差异**：HEAD 中模板文档仍写公开依赖 `^0.1.0`，React 教程开头仍称 iframe bundle，模板稳定规格的旧 requirement 保留 `0.3.0` 与后续 `0.4.0` WebView requirement 并列。它们不是本次标题语义或验收路径的变更，记录为后续文档维护线索，没有借机修改依赖、协议或 Runtime 范围。


### 最终 workspace 验证

以下命令在最终源码及测试修正后串行运行，全部退出 0：

| 命令 | 实际结果 |
| --- | --- |
| `pnpm run test` | 10 个 Rstest 报告，共 119 个文件、951/951 测试通过，无失败或跳过。 |
| `pnpm run typecheck` | 应用及 9 个直接 workspace 成员类型检查通过。 |
| `pnpm run check` | Biome 格式/静态检查、源边界及生成漂移检查通过；包含 Contract 的 Manifest/Host API 生成内容检查，无自动修复写入。 |
| `pnpm run build` | 应用、公开插件包、CLI、模板和 ConfigLens 的完整依赖顺序构建通过；CLI build 先执行只读模板快照漂移检查。 |

模板 Gate 的离线安装环境修复首轮尝试：只在系统临时消费者中执行在线 `pnpm install --ignore-scripts` 补齐机器全局 store/cache，随后另一全新临时消费者离线安装成功，下载 0；两个临时目录已删除；但 Gate 重跑仍报告相同缓存错误，继续核对实际 pnpm 执行路径和环境，不能将该离线探针视作 Gate 通过。没有在仓库根安装或重建 node_modules，没有修改全局配置、依赖版本、lockfile 或 Gate 的离线要求。


### Rust 集成回归

`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 在同一最终实现上串行完成，全部退出 0，无编译警告；Rust 231/231 测试通过，包含共用 Manifest fixtures 的新增缺省/空英文标题输入。运行的是格式、单元/边界、静态和构建验证，没有启动真实 WebView、浏览器、GUI、Launch Services 或原生交互 harness。


缓存根因随后明确：仓库 `packageManager` 选择 pnpm `11.17.0`，而 Gate 未声明 `packageManager` 的临时消费者使用 `/opt/homebrew/bin/pnpm` 的 `12.8.1`；首轮缓存探针误用了前者。第二轮仅在系统临时消费者中用 Gate 相同执行文件和环境在线补齐新版元数据布局；在另一无 lockfile/node_modules 的临时消费者中，继承 root `pnpm exec node` 环境的实际离线安装通过，315 个缓存包复用、下载 0。项目配置和离线 Gate 要求保持不变。


新版 metadata 布局修复后，模板消费者安装通过，但 Rstest 编译暴露后续缓存缺口：锁文件已解析 core/binding `2.1.10`，机器 store 仅有 Darwin arm64 原生 binding `2.1.7` / `2.1.8`，缺少可选原生包 `2.1.10`，实际加载回退为 `2.1.8`。该次 Gate 未通过；确认错误后仅终止停滞的 Rstest 子进程，使父 Gate 执行自身清理。继续补齐匹配的可选原生包缓存，不修改项目依赖、源码或断言。


匹配的 native `2.1.10` 已补齐；新建离线双项目消费者保留 Gate 的 root native `2.1.8`，仍能验证 child core → binding → native 全部解析为 `2.1.10`，实际 addon 的 `EXPECTED_RSPACK_CORE_VERSION` 一致，下载 0。只删除自建临时目录，保留机器缓存；源码、依赖和 Gate 未修改。

### CI 补充验证

按维护验证文档要求，在确认全部为 ignored、未跟踪且非符号链接后，仅清除应用和 9 个 workspace 成员的 10 个 `dist/` 构建目录。随后串行运行 `pnpm run gate -- ci-lensx` 和 `pnpm run gate -- ci-plugins`，两者均退出 0。前者从缺少公开包构建产物的状态准备依赖并完成前端/Rust 检查；后者覆盖直接插件及 ConfigLens 的生命周期与纯 Node 产物检查。此证据独立于最终 workspace/Rust 生命周期与聚焦 capability Gate。


### 必需 Gate 暴露的既有检查修复

`plugin-project-template` Gate 在缓存修复后完整通过。`plugin-developer-cli` Gate 的 package-format 步骤随后报告两份未改动的仓库内 Rstest 测试导入 CLI 源码。核对 `ce1c891` 历史及当前 `scripts/workspace-lifecycle.ts` / `scripts/app-lifecycle.ts`：这两处 src 导入是有意保留的确定性源码测试；改回 dist 会增加本地 app:test/typecheck 的构建前置条件，与现行组织不符。

按 4.5 的范围内检查修复，最小修改 `scripts/check-plugin-package-format.ts` 的调用方角色判断：三个打包/生成脚本仍禁止 `packages/plugin-cli/src/`，两份仓库内 Rstest 可继续测试当前源码，全部五个调用方仍禁止已退役 `tools/plugin-package-format` 路径。没有更改生命周期、根脚本、registry、测试导入、产品实现、包协议或外部消费者断言。独立复核确认该修复保持当前架构；这不是跳过失败检查。修改后当前检查与 Biome 均通过，最终生命周期、受阻 Gate 和审计重新核验后再勾选。


检查修复的独立复核确认：角色判断只作用于现有五个固定调用方，只有两份已有源码单测获得源码导入许可；其余限制不变。一次性系统临时影子目录使用真实检查脚本进行六项行为验证：当前布局通过；三个脚本分别加入 CLI 源码导入均被拒绝；两份测试分别加入旧 tools 导入均被拒绝。临时目录已清理，没有新增维护命令或为了检查结果改写真实输入。

文档/规格复核确认，现有 `docs/en/development/validation.md`、`plugin-developer-cli.md` 与对应稳定规格已区分仓库内测试和真实 tarball 消费，不需要新增条款或生命周期修改。最终差异再次核对治理触发面，结论仍为不触发项目级审计；范围内审计新增此检查脚本修复及其理由。

`pnpm exec node --experimental-strip-types scripts/check-plugin-developer-cli.ts` 独立执行成功：真实 tarball 为 framework-neutral 生成 `My Plugin`、为 react-semi 生成 `Open Studio`，双语标题与原关键词/身份/目标断言通过；两个生成项目的测试、typecheck、build、validate、两次一致 pack、CLI inspect 和 Rust 内容/安装准备均通过。该独立结果不替代完整 `plugin-developer-cli` Gate，后者仍须重跑通过。


### 聚焦 capability Gate 最终结果

| 命令 | 实际结果 |
| --- | --- |
| `pnpm run gate -- plugin-action-projection` | 退出 0，87/87 Rstest 通过；包含正式标题、搜索评分及供应方撤销。 |
| `pnpm run gate -- plugin-project-template` | 缓存修复后完整退出 0；61/61 Rstest 通过，两个 canonical 模板及隔离 tarball 消费者的测试、typecheck、build、check、模块边界、包格式和文档检查通过。 |
| `pnpm run gate -- plugin-developer-cli` | 检查角色修复后完整退出 0；保留 workspace/package-format/CLI 文档和包消费检查。CLI 打包为 80 个文件，两个实际生成项目分别为 `My Plugin` 与 `Open Studio`，标题、原关键词、身份/目标、测试、typecheck、build、validate、可重复 pack、inspect 和 Rust 准备均通过。 |
| `pnpm run gate -- plugin-development-documentation-docs` | 退出 0；16 个双语页面、5 个公开包和 8 个 Host API 方法的文档检查通过。 |

CLI Gate 失败项已完整重跑通过，没有绕过或降低实际产物消费者检查。投影、模板及文档 Gate 所依赖的源码/依赖在其最终通过后未改变，引用已有通过结果；检查脚本的最后修复仅改变 CLI Gate 内部的调用方分类。完整 workspace/Rust 最终验证另行重新执行并记录。


### 最终重新确认与归档就绪

在上述最小检查修复之后，完整串行重跑 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`、`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`，八项全部退出 0。最终 workspace 仍为 119 文件、951/951 测试通过；Rust 231/231 通过，无失败、跳过或新增编译/静态警告。该组为检查修复后的最终生命周期证据，取代此前尚待重跑的状态。

再次核对最终差异：产品源码只涉及两份设置消息、ConfigLens 与两份 canonical 模板 Manifest、CLI 标题赋值；另有对应快照、测试、五份稳定规格、六组分类文档镜像和已有验证脚本的最小修复。ID、功能关键词、目标、Schema/API、搜索算法、Host executor、Rust Manifest 契约、WebView 隔离和焦点/responder 实现均未改变。根脚本、依赖/lockfile、CI、registry、索引、语言结构和其他治理触发面仍无变化，项目级审计结论重新确认为不触发。

规格普通验证 42/42、活动 Change 严格验证通过；严格全量规格的 257 条既有长度警告与基线相同（新增 0）。同步后活动检查的 `ADDED ... already exists` 为稳定规格已合并的提示，不是新错误。范围内文档/规格、命令引用、镜像及链接没有未解决漂移，先前本地链接的归档路径预检仍有效；最后 `git diff --check` 通过。全部验证保持确定性，没有原生界面或视觉验收。Change 仍位于活动目录，未归档、未提交；归档需后续明确请求，并应再次复核最终状态。

## 归档前复核（2026-10-18）

本轮依据用户对 `simplify-action-display-titles` 的明确归档请求，重新确认最终接受范围；以下为本轮归档检查，与前述实施阶段的全量生命周期证据区分。

- **完成状态与规范同步**：`openspec status --change simplify-action-display-titles --json` 确认为 `spec-driven`、四项产物全部 `done`；`openspec list --json` 两次确认任务为 17/17。仅使用 status 返回的五个 delta 路径，读取当前 specs 指令后逐项对照英文稳定规格，确认新增 3 条 requirement、修改 4 条 requirement、增加 15 个 scenario 的语义均已同步，无待合并内容，本轮幂等核验无需再次改写规格。只读结构比较确认五份稳定规格的标题、Purpose、全部既有场景及未涉及 requirement 原文保留，所有 delta 场景存在，且无增量操作标题残留。
- **范围与源码证据**：重新检查 proposal、design、五份 delta、五份稳定规格差异和最终源码/测试差异。独立复核确认两份 Host 消息及五份正式/模板 Manifest 仅改变预期 title，关键词、ID、目标未变；canonical 模板与 CLI 快照逐字节一致。`packages/plugin-cli/src/create.ts`、创建测试及 `scripts/check-plugin-developer-cli.ts` 保留合法原名与真实 tarball 消费覆盖；搜索、集合、页面上下文和兼容性测试与接受范围一致。`scripts/check-plugin-package-format.ts` 的角色修复仍限于已有五个调用方，符合现有生命周期和公开包边界，没有放宽三个脚本或旧 tools 路径的限制。
- **文档、镜像与导航**：重新审计 `docs/{en,zh}/development/{config-lens,frontend-guidelines,plugin-project-template,plugin-developer-cli,plugin-development-mode}.md`、`docs/{en,zh}/plugin-development/public-packages.md` 及两个语言索引，六组镜像含义、标题层级和链接集合一致。一次性只读 Python 检查覆盖 14 文件、52 个本地链接（含 8 个锚点），零失败；两棵语言树各 23 个相同相对路径且全部可从索引到达。8 份 Change Markdown 的一个本地链接在活动目录及预期 `archive/2026-10-18-simplify-action-display-titles/` 位置均有效。
- **治理判定与理由**：依据 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 复核现有审计，仍不触发额外项目级审计。本轮检查的 95 个跟踪治理/README/索引/集成路径无改动，也无新增未跟踪治理入口；最终修复没有改变文档集合、镜像关系、导航、生成集成或生命周期。根 manifest、lockfile、CI、registry、语言政策、agent instructions 和 spec-driver 配置未变。四个根临时目录均被忽略且无跟踪文件；没有新增验证入口或范围内治理漂移。
- **本轮实际验证**：`openspec validate simplify-action-display-titles --strict --json --no-interactive` 通过；已同步 ADDED 项的 `already exists` 仅为 INFO。`openspec validate --specs --json --no-interactive` 为 42/42 通过。当前规格与从 HEAD 导出的独立系统临时基线分别执行 `openspec validate --specs --strict --json --no-interactive`，均退出 1、仅有 257 条长度 WARNING、零 ERROR；按 capability、requirement 标题、级别和诊断内容比较，新增 0、移除 0，临时基线已删除。严格全量检查未被记为通过。
- **本轮聚焦 Gate**：串行运行 `pnpm run gate -- plugin-action-projection`（87/87）、`pnpm run gate -- plugin-development-documentation-docs`（22/22，16 个双语页面、5 个公开包、8 个 Host API 方法）和 `pnpm run gate -- validation-governance`（三个测试阶段分别 6/6、21/21、70/70，workspace 边界通过），全部退出 0。治理 Gate 核验根脚本策略、退休别名分类、确定性 registry/lifecycle 及维护文档/规格中的 dispatcher 引用。首轮投影 Gate 因沙箱禁止创建全局 pnpm 工具目录而未启动测试，获准访问后完整重跑通过，未修改 store 配置或重建根 node_modules。
- **结论、更新路径与证据边界**：规格同步、双语文档、相对链接、命令治理和实现范围均无未解决阻断；本轮只补充本文件的归档审计记录，无需追加产品、稳定规格、文档、索引或治理修复。`git diff --check` 通过。前述修复后的 951/951 workspace、231/231 Rust、八项最终生命周期、模板/CLI 消费者及 CI Gate 结果继续作为实施阶段证据引用，本轮未重新执行整套构建或原生界面验证。完成本记录后的最终检查通过即可移入日期前缀归档目录；移动后另行核验文件完整性、相对链接和归档列表。
