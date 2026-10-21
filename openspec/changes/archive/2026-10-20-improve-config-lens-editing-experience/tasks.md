# Tasks

以下为实施任务及实际验证记录。每项在对应验证完成后勾选；完成范围限于确定性实现与验证，不代表真实 WebView 交互验收、发布或归档。

## 1. 通用 Child WebView 编辑快捷键

- [x] 1.1 在受审查 Wry macOS 路径提取生产 key-equivalent 策略，并接入窗口／可见性／first-responder 归属事实；用 fake adapter 测试非 Child、有效聚焦 Child、Host／另一视图聚焦、无响应器、隐藏和脱离窗口，验证原事件最多委托一次、修饰键和返回值保持。
- [x] 1.2 将策略接到实际 `performKeyEquivalent` 构建路径，并回归 Host `Cmd+W/Q` monitor；以生产策略和 Host 路由测试证明全选／查找／普通编辑组合键不被专门拦截，W/Q 仅前台执行一次，关闭／替换后的晚到事件不恢复旧 Child；以 Rstest 接线检查证明无插件身份分支、eval 合成事件或新增公开权限。
- [x] 1.3 在既有 typed Gate registry 中纳入 Wry 生产策略的纯 Rust 测试和修改文件的显式 rustfmt 检查，沿用现有 policy runner 模式；验证成功／失败均清理忽略目录内产物，`validation-governance` Gate 拒绝提交产物写入与禁止的环境步骤，根 `package.json` 不新增脚本。
- [x] 1.4 审阅同版本 upstream diff，更新 `scripts/frame-aware-navigation-dependency-drift.ts` reviewed paths、vendor 所有者 README 的补丁说明及退出条件，再显式执行 `pnpm run generate -- frame-aware-navigation-dependency-drift --write`；通过 `pnpm run gate -- frame-aware-navigation-dependency-drift` 验证锁定版本、完整性与新增 Wry 格式／策略检查，确保 Gate 本身不写基线。
- [x] 1.5 同步 `docs/en/architecture/plugin-child-webview-runtime.md` 与 `docs/zh/architecture/plugin-child-webview-runtime.md` 的焦点路由／W/Q 边界，及两语言 `development/validation.md` 的 Wry 验证说明；检查镜像语义、链接和命令 ID，并运行 `plugin-child-webview-runtime`、`plugin-child-webview-window-lifecycle`、`launcher-input-focus` 和 `frame-aware-webview-navigation-policy` 聚焦 Gate 记录结果。

## 2. 自动识别、手选锁定与 Worker 边界

- [x] 2.1 扩展插件内部协议的 analyze 分支和结果判别联合，保留明确语言的 Format／Compact 分支；新增请求／响应校验测试，覆盖未知语言、错形字段、输入／选择版本、unresolved 与 failed 的组合以及超界诊断，确认公共 SDK／Manifest／Host API 未变化。
- [x] 2.2 在语言 Worker 实现结构候选与已有 parser 配合的检测规则；用真实 fixtures 验证四语言、严格 JSON 容器优先、`[server]`、`port = 8080`、XML、YAML block／flow collection、残缺 XML／JSON、普通文本／标量／注释未识别及非法外部 XML 构造，保证识别不修改 source。
- [x] 2.3 将检测与校验合为一次有界请求，复用 180ms 防抖、2 MiB／100,000 行、整次五秒与 200 诊断限制；用 fake Worker／timer 测试并发取消、候选共享截止、crash／timeout／错形响应后恢复，确认超限不 dispatch 且没有逐候选延长预算。
- [x] 2.4 在页面加入 auto/manual 模式、生效语言和输入／选择版本，默认 auto 未识别；用组件状态测试验证自动结果显示、手选后粘贴／清空仍锁定、auto 清空回纯文本、手动转 auto 重新分析、临时歧义保留最近自动语言和明确新结构可切换。
- [x] 2.5 统一按钮和 `Ctrl/Cmd+Enter` 的执行条件；测试 pending／unresolved 禁止变换、Compact 仅当前有效 JSON 可用、操作期间编辑／手选／locale 或 theme 变化拒绝旧结果，以及上下文失效后重新分析；保留一次操作一次撤销和四语言保真回归。
- [x] 2.6 补充 hide/restore、真正关闭重开、卸载／重试和异步资源清理测试，验证模式、查询和 model 的保留／重置边界；同步两语言 `development/config-lens.md` 的自动默认、手选锁定、歧义、未识别和临时内容说明，并核对无持久化、日志或网络识别入口。

## 3. 四语言语法高亮

- [x] 3.1 在单次 Monaco loader 接入当前版本 JSON tokenization、YAML／XML definitions 和语言配置；以实际 tokenizer 导入及 token 输出测试验证关键类别和不完整文本，确认没有带入第二套 JSON 校验／格式化 provider、远端 schema 或额外 language service Worker。
- [x] 3.2 增加 TOML Monarch 定义和语言配置；以真实分词测试覆盖表／数组表、裸键／引用键、单行／多行字符串、注释、布尔、数值和日期时间，验证跨行 state 与嵌入转义，不以高亮替代严格 TOML 1.0 校验。
- [x] 3.3 将生效语言、plaintext 回退和浅色／深色主题更新接入同一 model；测试快速语言切换后的旧加载失效、残缺 XML 仍着色、诊断与着色独立以及正文／撤销历史不变；同步两语言 `development/config-lens.md` 的高亮范围和限制。

## 4. Monaco 原生搜索与精简 Footer

- [x] 4.1 在首次有效 Runtime Context 后、Monaco API／Find／菜单首次导入前加载包内 NLS，并锁定 document 的 editor locale，统一 `main.tsx` 预加载和编辑器初始化传参；用隔离的模块初始化测试 en-US 和 zh-CN，验证 single-flight、SDK 重试不错误声称刷新缓存，运行中外层文案与 ConfigLens 诊断消息即时更新而原生搜索／菜单／诊断交互文案保留，真正重开后采用新语言，theme 始终即时更新。
- [x] 4.2 注册原生 Find 和所需菜单／诊断 contributions，为 Footer Search 接入同一 `actions.find`；使用实际模块注册检查和受支持 DOM 模型测试打开、前后匹配、无结果、匹配选项、Escape／关闭恢复编辑器焦点、反复打开无重复 widget，不用 textarea double 证明 Monaco 功能存在。
- [x] 4.3 验证正文 `Cmd/Ctrl+A` 与可见全选菜单选择整个 model，搜索输入全选仅作用于查询，Select／Host 输入不被抢焦点；验证原生显式替换若被使用会触发正常内容更新、撤销及在途分析失效，查找本身不修改正文。
- [x] 4.4 保持全局 Find clipboard 关闭和查询仅内存存储，补充搜索资源 teardown／hide-restore 测试；验证无新增 Host 剪贴板请求、browser storage、网络、持久化或私有 bridge。
- [x] 4.5 删除 Footer 状态节点、专用样式和占位；用组件及编译 CSS 契约测试空／有效／处理中／错误／长文案两语言两主题下均无状态区，正常 40px 和受限 72px Footer 完整容纳语言、Format、Compact、Search，仍恰好两个顶层区域。
- [x] 4.6 保留按钮 loading／disabled／aria-busy 和编辑器内安全诊断；测试无精确位置的 Worker／超限错误有可访问反馈，修正后可恢复，不产生 Footer 摘要或第三状态区；同步两语言 `development/config-lens.md` 的布局、搜索入口、原生文案重开更新与关闭丢失临时内容说明。

## 5. 产物与跨层集成

- [x] 5.1 扩展现有纯 Node built-output 检查，以实际模块图验证 Find、包内 NLS、JSON／YAML／XML tokenizer 与 TOML definition 进入延迟图，初始图仍排除重模块；运行 ConfigLens build 和既有产物检查，验证 JS／CSS／chunk／Worker／压缩包预算、本地资源完整性和无额外语言服务。
- [x] 5.2 将新增行为测试纳入既有 Rstest discovery 和 `ci-plugins`，将原生策略／接线检查纳入现有 Child／vendor Gate；通过 registry、workspace-boundary 和 package 检查验证没有新根别名、重复 lifecycle、源代码直连依赖或为了 smoke 重建根 `node_modules`。
- [x] 5.3 运行更新后的确定性插件候选打包／inspect 和生命周期检查，覆盖同一 model 的识别、搜索、高亮、格式化、隐藏恢复、关闭重开，以及通用 Runtime 下官方／外部／开发插件的策略一致；记录 Host 与插件分别交付的责任，不把仅插件更新描述成旧 Host 原生问题已修复。

## 6. 最终验证与归档就绪

- [x] 6.1 完成并记录完整前端／workspace 验证：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`（含格式和静态检查）、`pnpm run build`；核实这些结果独立于聚焦 Gate，记录实际命令与结果，不以规划命令充当通过证据。
- [x] 6.2 完成并记录 Rust 验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`，并验证第 1 组新增 vendor Wry 格式／策略步骤；当前原生层受影响，不豁免 Rust 构建。
- [x] 6.3 完成 `pnpm run gate -- ci-lensx`、`pnpm run gate -- ci-plugins`，并汇总 `plugin-child-webview-runtime`、`plugin-child-webview-window-lifecycle`、`launcher-input-focus`、`frame-aware-webview-navigation-policy`、`frame-aware-navigation-dependency-drift` 与 `validation-governance` 聚焦证据；所有过程保持确定性，不启动浏览器、真实 WebView、GUI、Launch Services、native harness、截图、像素或性能阶段，也不保留对应可选 Gate。
- [x] 6.4 修复本变更引入的全部 warning、error 和回归，重新执行曾失败命令及完整最终验证集；通过 `git diff --check` 并记录仍存的既有问题及与本范围的关系，不以基线问题掩盖新问题。
- [x] 6.5 在 sync／archive 前扫描根 `package.json`、CI、维护文档和规格，验证没有 Change 专用根命令、失效别名、单项 Rstest 文件列表脚本、递归 check 图或已删除 dispatcher 引用；本 active change 中用于自身验证的 ID 属合法规划上下文，不能成为维护命令接口。
- [x] 6.6 将最终接受的两份 delta 翻译／协调为英文并同步到 stable specs，保留未改条款的语义，特别复核显式语言旧禁令、空内容提示、Footer status、诊断 summary 及原生 locale 例外不再冲突；执行 `openspec validate improve-config-lens-editing-experience --strict` 与 `openspec validate --specs --strict`，记录同步后结果。
- [x] 6.7 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 对最终接受范围执行变更级治理／文档审计；在本文件记录审查范围、检查的实现／测试／规格／文档／索引／链接／语言路径、项目级审计触发决定及理由、结论及理由、实际更新路径和验证结果。治理表面或修复触发项目级审计时补做相应范围；“无需更新”也须有证据，不能把暂未检查记为无需更新。
- [x] 6.8 复核英文与简体中文镜像、导航和链接，确认所有同步和审计结果仍匹配最终 diff，重新验证同步后的规格和文档；缺失、陈旧或未解决的范围内治理问题阻塞归档就绪。仅记录就绪状态，归档须在用户另行请求时先确认同步再执行，不自动归档、提交、推送或发布。


## 实施与验证记录（2026-10-20）

### 接受范围与实现证据

- 原生范围：`vendor/frame-aware-navigation/wry/src/wkwebview/class/{mod,wry_web_view,key_equivalent}.rs`、`src-tauri/src/launcher_window.rs`。Child 路由同时要求附着窗口、窗口可见且为 key window、视图可见与真实 first responder 归属；策略保留事件对象、修饰键、返回值及单次委托，Host 前台 W/Q 仍先消费。官方、外部和开发插件没有身份分支。
- 原生验证接口：`scripts/wry-policy-tests.ts`、`scripts/validation/{catalog.ts,vendor-rustfmt.toml}`、`tests/{wry-key-equivalent,wry-policy-tests,validation-registry,frame-aware-navigation-dependency-drift}.test.ts`。生产 policy 的 pure Rust fake-adapter 测试、runner 成功／失败清理、接线和只读 Gate 检查分别存在；没有新增根脚本。
- Vendor 审阅：对照相同版本 Wry `0.55.1` 上游源码，新增修改只在受审查的三个 Wry class 文件。更新所有者 `vendor/frame-aware-navigation/README.md`、reviewed paths 和完整性基线；显式执行 `pnpm run generate -- frame-aware-navigation-dependency-drift --write` 后记录 377 个源码文件。既有 `.gradle` 缓存与 `target` 同样从源派生扫描排除，缓存本身保持；只读 Gate 不刷新基线。
- 插件范围：`plugins/config-lens/src/ConfigLensPage.tsx`、`catalog.ts`、`styles.less`、`language/`、`editor/`、`main.tsx`、对应 `tests/` 与 `scripts/{check,test-e2e}.mjs`。自动／手选、双版本协议、一次分析截止、四语言实际 tokenizer、原生 Find、全选菜单、双区域无状态 Footer 均接入同一个 model；未改 Manifest、公开 SDK／Host API、依赖版本或权限。
- 生命周期补强：Monaco NLS 在首次 Context 后、原生模块首次求值前加载，运行中只更新 ConfigLens 文案／诊断和 theme。固定版本的包内服务适配使 clipboard 只保留内存；服务适配源码检查及实际 Monaco DOM 模型点击／按键回归未引入程序化系统 clipboard 调用，此处不是实际 WebKit 交互验收。Surface 先释放 editor/model 以同步清空真实 WorkerManager client，再释放自有 Workers；bootstrap 在等待旧 SDK dispose 前释放旧 Workers，延迟 dispose 与连续重试测试证明旧释放不终止新代次。
- 文档所有者：更新 `docs/en/` 与 `docs/zh/` 的 `development/config-lens.md`、`architecture/plugin-child-webview-runtime.md`、`development/validation.md`。明确原生快捷键修复由 Host 交付、识别／搜索／着色由插件交付；不把仅更新插件等同于修复旧 Host。

### 实际验证

| 检查 | 实际结果 |
| --- | --- |
| Wry 生产 policy、Host 组合与接线 | pure Rust 3 tests、Host `launcher_window` 30 tests 通过；Wry 真正 macOS Cargo check 通过；新增 policy／接线／registry 测试通过。 |
| `pnpm run gate -- frame-aware-navigation-dependency-drift` | 通过；76 Rstest、Tao 严格编译、Tao/Wry policy、两套显式格式检查及 377 文件基线一致。 |
| 原生聚焦 Gates | `plugin-child-webview-runtime`、`plugin-child-webview-window-lifecycle`、`launcher-input-focus`、`frame-aware-webview-navigation-policy` 全部退出 0。 |
| `pnpm run gate -- validation-governance` | 通过，拒绝提交产物写入及禁止环境步骤；最终治理／registry 两文件复验 43/43。 |
| 插件行为 | 语言协议／adapter／分析／controller 108 tests；Page 14 tests；Monaco／bootstrap 13 tests 通过。完整插件 suite 合计 138 tests，包含既有 Manifest／Runtime 等回归。实际 Monaco 模块证明搜索、词法类别、焦点、菜单、替换／undo、NLS、同 model 和清理；textarea double 仅证明 Page 编排。 |
| `pnpm run test` | 完整 application／workspace 1,093 tests 通过，0 failure，包括 ConfigLens 138 tests。 |
| `pnpm run typecheck`、`pnpm run check`、`pnpm run build` | 完整 workspace 四项生命周期最终全部退出 0；check 包含格式、静态、边界及生成漂移检查。 |
| Rust 完整生命周期 | `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 全部通过；235 Rust tests，实际 macOS 应用构建通过。 |
| `pnpm run gate -- ci-plugins` | 独立运行通过，准备 4 个公共依赖后对唯一直接插件执行一次生命周期与纯 Node built-output 检查。 |
| 最终候选 | 公开 CLI `pack --no-build --json` 两次字节相同；公开 TypeScript `inspect --json` 兼容；构建并执行已有纯 CLI `plugin_project_template_package_smoke`，Rust inspection 与安装准备两份候选均通过，digest 与文件数量一致。未安装到用户应用。 |
| 预算与模块闭包 | dist 6,195,269 bytes，全部 JS 4,108,881 bytes；初始 JS 98,946 bytes、CSS 587 bytes；压缩包 1,014,507 bytes、46 files。实际延迟图含 Find、包内 NLS、JSON/YAML/XML tokenizer、TOML，初始图无重模块，无额外语言服务；单 chunk／Worker 与本地资源检查通过。 |

最终候选 SHA-256：`c17907f3256255cdbd1bc622e10ce924f63db2c057d4ebf72507d60b999c050d`。打包与检查用的临时候选已清理，根 `node_modules` 未重建，所有 pnpm 命令沿用机器配置的 store。

实施期间修复并重跑的检查包含：接线断言的 rustfmt 换行、Semi option 可访问名称含图标前缀、编译 CSS 将 grid-row 合并成 grid-area、Monaco 服务初始化顺序／测试断言，以及说明注释命中隐私扫描。产品侧发现的 WebKit clipboard 初始化和异步 SDK 释放竞态均已修复并有行为回归；未放宽隐私、预算或确定性规则。失败的 `pnpm run check` 已单独重跑，再从 `pnpm run test` 开始重跑完整 workspace 四项。pnpm cache 数据库的沙箱访问限制通过获批的同一命令执行解决，未改全局配置。

### 稳定规格同步与治理／文档审计

- 审查范围：最终 proposal、design、两份 delta、全部实际变更实现／测试、两份对应 stable specs、上述六份分类文档、vendor 所有者 README、typed 验证与生成边界。
- 检查对象：根 `AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、根 README 双语版本、`docs/en/index.md`／`docs/zh/index.md`、`package.json`、CI、registry、vendor 基线与相关实现／测试。语言策略仍是 English canonical docs/stable specs 与同路径中文镜像；active audit 使用中文。
- 项目级审计触发：本次修改 vendor README、完整性生成扫描边界及 typed validation registry，执行限定项目级复核。根治理、语言策略、索引、根脚本和 CI 本身未改，不扩展审计到无关历史功能。上述治理入口已足够表达规则，无需新增或重写。
- 规格同步：按当前 `openspec status` 返回的两条 delta 路径及有效 `instructions specs` 规则，将接受条款协调为英文。ConfigLens 为 15 requirements／49 scenarios，Child Runtime 为 8／24；未修改的 8+6 项 requirement 原文保留。默认 JSON／禁止识别、空提示、Footer status、summary 与原生 locale 更新时间冲突均已消除。中文 active delta 保留。
- 实际同步验证：`openspec validate improve-config-lens-editing-experience --strict` 退出 0；`openspec validate --specs --strict` 42/42 通过。CLI 对已同步 ADDED 项给出“already exists”的归档模拟 INFO，此为已同步状态，不是严格校验失败；后续归档应复核同步后使用已同步路径，不重复应用 delta。
- 导航／镜像：72 条范围内相对路径及锚点零缺失；23 对中英文档路径一致；六份改动文档章节、代码围栏、数值、命令、行为及限制语义对齐。没有新增／移动／删除文档，现有索引仍能到达全部所有者，无需索引更新。
- 命令与临时边界：根 25 个脚本与 `ROOT_SCRIPT_POLICY` 完全一致；83 Gates、5 Generate target 结构验证通过。维护表面无本 Change 专用根命令、失效 alias、单项 Rstest 根脚本、递归 check 图或旧 Evidence 调用。四种项目根临时目录与 vendor `.gradle` 均被忽略，已跟踪临时文件为 0，维护产物无临时来源链接。
- 更新路径：六份双语文档、vendor README、两份 stable specs、reviewed-path／integrity／typed Gate 对应文件；根 AGENTS、govern、driver config、README 与索引均无需更新，理由是导航、语言、所有者和生命周期规则未改变且上述复核通过。
- 证据边界：全部验证为确定性策略、状态、真实 Monaco DOM 模型、静态、构建和纯 CLI 包检查；没有启动浏览器、真实 WebView、GUI、Launch Services、native harness，未生成截图、像素、视觉基线或目标性能结果。没有尚存的本变更 warning/error 或需豁免的 Rust 构建；真实 macOS 按键投递不属于本次证据。


### 最终复验与就绪结论

- 最终源码与镜像文档定稿后，`pnpm run gate -- ci-lensx` 再次退出 0，覆盖 Host／公共包检查、测试、类型与构建，并再次执行 Rust format／235 tests／check／build；与独立 workspace 四项和 `ci-plugins` 的通过结果分别记录，不相互替代。
- 最终 `openspec validate --all --strict --no-interactive` 43/43 通过；同步后的 72 条链接／锚点、23 对文档路径、中文 delta 与英文 stable 语义、未改条款和治理／registry 43 tests 均已复核。`git diff --check` 通过，最终 workspace／CI／候选构建日志无 warning/error。
- 审计结论：本次接受范围的实现、测试、规格、文档、语言镜像、导航和治理约束一致，归档就绪。没有缺失、陈旧或未解决的本范围治理问题；根治理入口与索引无需变更的结论在最终 diff 后仍成立。
- 当前 Change 保持 active；本次没有执行 archive、staging、commit、push、安装到用户应用或发布。若另行请求归档，须先重新确认 stable 同步与审计仍适用，再使用已同步规格的归档流程。

## 7. 用户反馈修正（2026-10-20）

本节承接图标显示方框与移除底部搜索按钮的最新要求，替代 4.2／4.5 中的 Footer Search 入口要求。上述验证记录保留为前一候选证据；本次修正需完成下列复验后才可重新判断就绪。

- [x] 7.1 修正 ConfigLens 提取 CSS 的包内相对资源路径，Host 静态资源 MIME 表增加 TTF；在既有纯 Node 产物检查中按样式表地址解析资源 URL，验证资源存在且 codicon 字体与锁定 Monaco 字节一致，先证明旧产物失败，再证明修复后通过。使用已有 GET／HEAD MIME matrix 测试 TTF 大小写、安全头与资源隔离；不改变 CSP、权限或体积预算。
- [x] 7.2 删除底部 Search 按钮、独有回调和双语文案；组件覆盖两语言／两主题下 Footer 仅有语言、Format、Compact，真实 Monaco DOM 模型仍通过 `Cmd/Ctrl+F` 打开同一原生 Find 并保留导航、关闭和焦点行为。

## 8. 修正后的验证与归档就绪

- [x] 8.1 同步本次范围的英文／中文 ConfigLens／扩展平台文档、active artifacts 和英文 stable specs；运行完整 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`、`pnpm run gate -- ci-plugins`、`pnpm run gate -- ci-lensx`、`pnpm run gate -- plugin-resource-service` 及 Rust `src-tauri:format:check`／`src-tauri:test`／`src-tauri:check`／`src-tauri:build`，记录实际结果并修复本次引入的问题。Rust 受 Host MIME 修正影响必须复验；未改 vendor 或其完整性基线。
- [x] 8.2 严格验证 active change 和 stable specs，复核文档镜像、链接、根脚本／Gate 和本次 diff；追加变更级治理与文档审计结论及项目级审计触发判断，执行 `git diff --check`。保持 active，不自动归档、提交或发布；不启动浏览器或原生交互验收。

### 本轮修正证据与审计

- 根因：异步样式表曾引用 `./static/font/codicon.53f8eae9ce.ttf`，从样式表目录解析时指向不存在的文件；Host 的固定 MIME 表也尚未支持 `.ttf`。仅修正 CSS 路径不足以恢复图标。
- 实现：`plugins/config-lens/rsbuild.config.ts` 为 CSS Extract loader 设置 `publicPath: 'auto'`，保留 JS／Worker 的原有入口前缀。`src-tauri/src/plugin_resource_service.rs` 增加 `ttf → font/ttf`，同一 GET／HEAD matrix 增加 `.ttf` 与 `.TTF`；未改变 scope、generation、路径、安全头、CSP 或权限处理。
- UI：`ConfigLensPage.tsx`、`catalog.ts`、`editor/MonacoSurface.tsx` 删除 Footer 搜索及独有状态／回调；Page 测试验证英／中、明／暗和状态变化下仅有 Format／Compact 两个操作按钮，Monaco fixture 以实际键事件发送 `Cmd/Ctrl+F`，继续验证原生搜索、导航、替换、撤销、关闭和焦点。
- 回归：新增产物检查先在旧 CSS 上报 `e2e/css-resource-missing`，修复后 45 个产物文件通过。当前样式表引用 `../../../static/font/codicon.53f8eae9ce.ttf`，按样式表路径解析后文件存在，140,956 字节与锁定 Monaco 字体完全相同。总 CSS 为 931,024 字节，完整 dist 为 6,201,108 字节，既有预算均保留。
- 方案取舍：曾验证 CSS 内嵌字体，但实际总 CSS 为 1,118,946 字节，超过 1,048,576 字节预算，因此已撤回内嵌配置，未放宽预算，也未为此修改无关样式或依赖。
- 实际验证：完整 `pnpm run test` 1,093 tests 通过（含 ConfigLens 138）；完整 `typecheck`、`check`、`build` 退出 0。`ci-plugins` 通过并执行最终产物检查，`plugin-resource-service` Gate 通过。Rust 全套 format／235 tests／check／build 通过，最终 `ci-lensx` 再次退出 0。并行初次构建时测试曾读取到公共包清理中的 exports 产物，等待构建完成后串行重跑完整测试通过；没有将该失败计为产品通过证据。
- 规格：同步 `official-config-lens-plugin` 和 `plugin-resource-service` 英文 stable specs，active proposal／design／delta 明确删除 Footer Search、外部字体和 Host 配套更新。新增资源服务 delta 保留完整受影响 requirement 的既有安全场景。`openspec validate --all --strict --no-interactive` 为 43/43；既有 ADDED 条款已同步提示仍属于同步状态，未执行归档。
- 审计范围：上述实现／测试／构建配置、`docs/{en,zh}/development/config-lens.md`、`docs/{en,zh}/architecture/extension-platform.md`、对应 stable／active specs 与本 tasks；依据根／docs AGENTS、govern-spec、OpenSpec config 和 project-workflow 复核语言与所有权。四份文档链接和两语言索引可达，英文与中文语义一致；未新增、移动或删除文档，无需改索引。
- 项目级审计触发：本轮没有修改治理入口、目录／语言策略、生成配置、根脚本或 Gate registry，未触发额外项目级治理审计。此前 vendor／registry 修改与审计作为已有工作保留，不被本轮修改覆盖。本轮只调整现有插件产物检查，未新增验证入口。
- 结论：本轮修正的实现、回归、稳定规格和双语文档一致，`git diff --check` 通过，无本轮遗留 warning／error。当前 Change 继续 active；未启动应用或浏览器、未执行视觉验收、安装、归档、暂存、提交或发布。图标完整修复须使用更新后的 Host 并重载更新后的插件。

## 9. 语言选择器显示修正

用户仅授权实施语言选项去版本号、自动模式简化标签和缩短选择框。Find 关闭按钮对齐及顶部遮挡仅作只读原因／方案分析，本节不实施这两项。以下要求替代此前选择器显示识别结果的约定，内部语言识别及版本支持不变。

- [x] 9.1 语言选项只显示 JSON／YAML／TOML／XML；自动模式始终显示 Auto／自动，删除多余状态文案，保留当前有效语言、Worker、格式化与手选锁定逻辑。更新既有组件回归，验证两语言／两主题和识别前后简洁标签。
- [x] 9.2 选择框以 120px 为基准、不再填满剩余宽度，窄布局可缩至 72px；更新既有编译 CSS 契约并保留 Footer 40／72px 几何约定。

## 10. 选择器修正验证与归档就绪

- [x] 10.1 同步英文／中文 ConfigLens 文档、active proposal／design／delta 和英文 stable spec；完成插件生命周期及 `ci-plugins`、完整前端／workspace test／typecheck／check／build，修复本轮引入问题后复验。此次未修改 Rust、Host、vendor 或原生边界，Rust format／test／check／build 继续沿用第 8 节结果，不重复执行。
- [x] 10.2 严格验证同步后的 specs／active change、文档语言／链接及 `git diff --check`；记录本轮变更级审计与项目级触发判断。第 4／5 项分析结论不视为接受或实施，保持 active，不归档或提交。

### 选择器修正证据与审计

- 实施范围：`ConfigLensPage.tsx` 的 Auto option 固定使用本地化 `messages.auto`；`catalog.ts` 删除 unused detected／unresolved 标签，四个语言 ID 仅转为大写显示。语法诊断与 YAML 1.2／TOML 1.0／XML 1.0 支持保持原状，未修改语言 Worker 或有效语言判断。
- 样式：`styles.less` 仅调整 `.config-lens__language .semi-select` 至 `min-width:72px`、`max-width:120px`、`flex:0 1 120px`，删除重复的窄屏 min-width 规则；没有加入 Find 样式覆盖或修改 Monaco options。既有 compiled-CSS 检查验证紧凑宽度、允许收缩且禁止扩展，同时接受压缩器语义等价的 `flex:0 120px`。
- 行为验证：既有 Page 回归检查下拉五项为 Auto／JSON／YAML／TOML／XML、自动识别前后标签不变、手选锁定与状态清理；两语言／两主题和 pending／resolved／invalid 状态均保持简洁自动标签。完整 `pnpm run test` 1,093 tests 通过，其中 ConfigLens 138；完整 `pnpm run typecheck`、`pnpm run check`、`pnpm run build` 退出 0，最终 `pnpm run gate -- ci-plugins` 与 45 文件产物检查通过。
- 失败与复验：初版 CSS 断言要求未压缩的三段 flex 声明，被构建器的等价两段写法触发；修正断言识别等价语义后，Biome、原失败产物检查及插件完整 CI 再次通过，产品 CSS 无额外修改。
- 同步与审计：检查本节源码／测试／CSS、两语言 `development/config-lens.md`、`official-config-lens-plugin` stable spec 与 active proposal／design／delta；对照根／docs AGENTS、govern-spec 和 project-workflow，更新选择器标签、识别状态显示边界、紧凑宽度与场景，保留技术版本要求。镜像语义、现有索引可达和相对链接均通过；没有新增、移动或删除文档，无需改索引。
- 治理触发：本轮没有改变治理入口、语言策略、目录结构、生成集成、根脚本或 Gate registry，不触发额外项目级审计；仅在现有产物检查追加样式契约。`openspec validate --all --strict --no-interactive` 43/43 通过，`git diff --check` 通过，未发现本轮遗留 warning／error。
- 分析边界：关闭键偏移和首行遮挡仅对照当前依赖、源码及 CSS 进行只读分析；没有将候选局部盒模型／外边距修正写入实现或接受规格，未改参考仓库。当前记录不代表真实 WebView 像素验收，未启动服务、GUI 或浏览器，未归档、提交或发布。

## 11. ConfigLens 内的 Find 布局修正

用户现已授权实施第 4／5 项，限定在 ConfigLens 内局部调整。本节承接并替代前两节的仅分析边界，不修改全局 Plugin UI reset、Host、参考仓库、Monaco 版本或编辑器 padding。

- [x] 11.1 在 `.config-lens-editor` 范围内移除 Find 的顶部 margin，并对普通 `.button:not(.toggle)` 恢复 content-box；保留原生 toggle／selection 控件的盒模型和默认 `addExtraSpaceOnTop`，通过现有编译 CSS 契约验证局部选择器与声明。
- [x] 11.2 扩展既有真实 Monaco DOM 模型回归，覆盖打开、展开／折叠替换、关闭时顶部占位的变化及清理，继续验证原 model、内容和焦点恢复；不将 DOM 模型测试作为真实像素布局证据。

## 12. Find 布局验证与归档就绪

- [x] 12.1 同步英文／中文 ConfigLens 文档、active proposal／design／delta 和英文 stable spec；完成完整 workspace test／typecheck／check／build 及 `ci-plugins`，修复引入问题并复验。本轮未改 Rust、Host、vendor、公共包或原生边界，Rust format／test／check／build 沿用第 8 节证据，不重复执行。
- [x] 12.2 严格验证同步后的 active change／stable specs、镜像文档／链接和 `git diff --check`；追加变更级审计与项目级触发判断，确认产品修改仅在 ConfigLens 局部样式。保持 active，不归档、暂存、提交或发布，不启动 GUI／浏览器。

### Find 局部布局修正证据与审计

- 产品变更只有 `plugins/config-lens/src/styles.less` 两条局部规则：`.config-lens-editor .monaco-editor .find-widget` 的 `margin-top: 0`，以及其 `.button:not(.toggle)` 的 `box-sizing: content-box`。没有硬改 close 的 top、添加永久正文 padding、改写原生占位算法或修改全局 reset。替换展开按钮被选择器排除，选区按钮没有 `.button` 类，因此均保留原生 border-box。
- 独立只读检查以实际 Monaco CSS 和内存 DOM 验证局部 CSS 先／后加载均得到相同层叠结果：close／前后按钮为 content-box、toggle／selection 为 border-box、Find margin 为 0。选择器优先级足够，不依赖异步样式表加载顺序；此检查不代表像素渲染验收。
- `tests/monaco-en.test.tsx` 在既有用例中验证 `addExtraSpaceOnTop` 为 true、打开后首行 layout-model top 增大、Replace 展开／折叠相应调整、重复打开只有一个 zone、Escape／Close 删除 zone 并恢复原高度，且 model、内容、撤销及焦点契约保留。没有增加浏览器、真实 WebView 或视觉测试入口。
- `scripts/test-e2e.mjs` 在既有编译 CSS 契约中新增两条完整作用域的断言；旧产物首先因缺少 Find 局部间距规则失败，重建后 45 个自包含文件全部通过，两条规则均出现在最终 CSS 中。
- 实际验证：完整 `pnpm run test` 1,093 tests 通过（含插件 138），完整 `pnpm run typecheck`、`pnpm run check`、`pnpm run build` 退出 0；最终 `pnpm run gate -- ci-plugins` 再次覆盖插件 check／test／typecheck／build／产物检查并通过。`openspec validate --all --strict --no-interactive` 43/43 通过，Biome 与 `git diff --check` 通过，无本轮遗留 warning／error。
- 审计与同步：依据根／docs AGENTS、govern-spec、OpenSpec config 和 project-workflow，检查两条样式、真实 Monaco 用例、产物断言、`docs/{en,zh}/development/config-lens.md`、对应 stable spec、active proposal／design／delta／tasks；同步按钮对齐、Find／Replace 首行避让、关闭释放占位及 ConfigLens 局部边界。双语镜像、相对链接和索引可达验证通过，没有新增、移动或删除文档。
- 项目级触发决定：本轮未修改治理入口、目录／语言策略、生成集成、根脚本或 Gate registry，不触发额外项目级审计；既有边界足以约束局部修复。共享 Plugin UI、Host／Rust、vendor、参考仓库与依赖版本均未因本轮修改。
- 结论：授权的第 4／5 项已按局部方案完成实现和确定性验证；当前 Change 保持 active，未执行归档、暂存、提交、发布或插件安装，未启动 GUI／浏览器。最终真实 WebView 的视觉效果仍不在本轮证据范围内。

## 归档前同步与最终审计（2026-10-20）

- 授权与完成状态：用户明确请求归档 `improve-config-lens-editing-experience`。当前 CLI 确认本仓库为 planning root，schema 为 `spec-driven`，proposal／design／specs／tasks 全部 done，任务 43/43；本节接续此前“保持 active”的阶段记录。
- 同步流程：使用本次 `openspec status` 返回的三条 delta 路径及一次成功取得的 `instructions specs` 规则快照，在根代理内联执行同步评估与逐项语义比较。`official-config-lens-plugin` 的 7 条／32 个场景、`plugin-child-webview-runtime` 的 2 条／8 个场景、`plugin-resource-service` 的 1 条／7 个场景均已完整落实到英文 stable specs，没有待应用的新增或修改、删除或重命名。本次同步为无内容变更的复核，未重复改写已经一致的稳定规格。
- 同步后结构：三份 stable 分别为 15／8／10 条 requirement、51／24／41 个 scenario；Title 与 Purpose 相对现有 HEAD 完全保留，未提及的 8／6／9 条 requirement 原文未改，主规格没有 delta section 标题。所有 delta requirement／scenario 名称均存在，并逐段确认中文 delta 与英文稳定条款语义一致；场景排列次序差异不改变契约。
- 变更级审计：复核当前插件 UI／语言协议与 Worker／Monaco 资源及清理、字体路径和 TTF MIME、选择器、Find 局部布局、Host／Wry 快捷键策略与相关测试、构建与验证配置、三份 stable specs 和全部 active artifacts。第 7～12 节修正及复验与当前源码吻合；本次没有新增或修改产品代码、依赖或测试。
- 文档与导航：检查 `docs/{en,zh}/architecture/{extension-platform,plugin-child-webview-runtime}.md`、`docs/{en,zh}/development/{config-lens,validation,project-workflow}.md`、两语言 index、双语 README、根／docs AGENTS、govern-spec、OpenSpec config。25 个范围文件的 86 条相对链接／锚点全部有效，23 对双语文档路径一致；四对改动文档的章节、代码围栏、命令、标识、行为与限制语义一致。没有新增、移动或删除维护文档，现有索引足以导航，无需修改。
- 项目级审计触发与复核：延续最初 vendor 所有者 README、完整性扫描边界与 typed validation registry 的限定触发，重新检查治理入口、生成所有权、只读 Gate／显式 Generate 边界、语言及临时材料规则。25 个根脚本与 `ROOT_SCRIPT_POLICY` 完全一致，`validateRegistry` 通过（83 Gates、5 Generate targets）；根 manifest、CI、维护文档和 stable specs 无 Change 专用命令、旧外部 alias 或 Evidence dispatcher。内部 migration-baseline 的历史字符串不是对外命令入口。四类根临时目录均忽略且无 tracked 文件，实际 vendor `.gradle` 仍忽略。
- 本次修正路径与理由：`design.md` 将过期“两份 delta”改为最终三份并纳入后续接受范围；英文 `docs/en/development/validation.md` 明确 Gate 仅检查格式，与中文现有“显式检查”及 registry `rustfmt --check` 对齐；本文件将可能误读为真实 WebKit 验收的旧句澄清为静态服务适配检查和实际 Monaco DOM 模型回归。中文镜像的既有准确表述无需改写；治理入口、索引和 stable specs 无需额外更新。
- 本次实际验证：`pnpm run check` 完整 workspace 退出 0；`openspec validate --all --strict --no-interactive` 43/43 通过；上述链接、镜像、结构、registry、残留扫描及 `git diff --check` 通过。实现未再改变，第 8／12 节已经完成的 workspace 1,093 tests、插件 138 tests、类型与构建、Rust 235 tests 及 format／check／build、CI Gates 仍适用，本次没有将未重跑的项目计为新结果。
- 就绪结论：不存在未完成任务、缺失文档、未同步条款或未解决的范围内治理问题。三份规格已同步并验证，归档目标为 `archive/2026-10-20-improve-config-lens-editing-experience/`；此前 CLI 的 ADDED-already-exists 提示对应已完成同步，本次按技能的已同步目录归档流程移动，避免重复应用 delta。归档将保留 `.openspec.yaml`，不执行 Git 暂存、提交、推送、发布、安装或 GUI／浏览器验收。

### 归档完成验证

- 已移动至 `openspec/changes/archive/2026-10-20-improve-config-lens-editing-experience/`，原 active 目录不存在；移动前后 7 个文件逐字节摘要一致，包含 `.openspec.yaml`，本段为移动验证后追加的结果记录。
- `openspec list --json` 确认 active changes 为空；移动前 change strict 校验通过，移动后 `openspec validate --all --strict --no-interactive` 对 42 份稳定规格全部通过。
- 归档文件没有因层级变化产生失效相对链接，`git diff --check` 通过；既有实现与其余工作区改动保持，未执行任何 Git 暂存或提交。
