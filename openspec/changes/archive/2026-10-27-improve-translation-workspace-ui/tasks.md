# Tasks

以下任务按实际实现与验证结果更新，证据记录于文末。当前产品实现限于翻译插件的呈现、组合输入与语言互换协调及 Manifest 初始尺寸；400ms 自动翻译与现有 Host、Provider、存储和原生编辑边界继续沿用。用户先前追加授权的全仓历史规格整理已完成，本轮不扩大其范围。第 5 节（含 2026-10-27 细化）及后续修订证据代表用户最新要求。

## 1. 响应式语言栏与双卡片

- [x] 1.1 调整 `plugins/translation/src/TranslationPage.tsx`，以同一组控件组织顶部源/目标语言选择、右侧设置入口、原文卡片和译文卡片；保留原有标签关联、控件 ID、事件处理器和 source/output DOM 身份。验证真实 Semi 组件测试中的可访问名称、原文编辑、译文只读选择和纯文本输出，移除仅允许 vertical 的旧断言。
- [x] 1.2 在 `plugins/translation/src/styles.less` 落实 720px 宽窄断点、等宽双列/顺序单列、16px 间距、14px 圆角、16px/1.6 正文和主题表面；补齐长文本换行、控件伸缩、卡片内部滚动与短窗口页面滚动。通过有限的样式契约检查和插件构建确认断点、溢出与主题声明有效，记录 Happy DOM 不验证真实像素布局。
- [x] 1.3 扩展现有 Rstest 覆盖英/中 × 明/暗的标签、可见焦点语义和主题接入，验证呈现更新保留节点、选择、IME 会话、当前结果和请求身份；运行 `pnpm --dir plugins/translation run test`，不得用仅修改 `innerWidth` 或 class 的断言宣称几何验收。
- [x] 1.4 同步 `docs/en/development/translation.md` 与 `docs/zh/development/translation.md` 的工作区章节，说明宽视口左右、窄视口上下、滚动回退及初始窗口尺寸保持不变；逐项核对双语含义、相对路径和现有索引链接。

## 2. 字符计数、操作与状态归位

- [x] 2.1 在原文卡片增加按 Unicode code points 派生的字符计数和 5000 上限，将现有清空操作放到卡片脚部；补齐 `catalog.ts` 英文和简体中文文案与可访问关联。测试 5000/5001、代理对、组合字符、长纯空白和恢复输入，确认不截断、不改写文本、不改变请求时间。
- [x] 2.2 将空、等待、翻译中、成功、暂停、限额/语向阻塞、请求失败和重试整理到译文卡片附近；将检测语言和安全 RequestId 与正文分离，并保留服务发送说明。通过真实组件测试验证状态播报、`aria-busy`、重试条件、重复重试去重和旧结果不冒充当前结果。
- [x] 2.3 将缺少配置、读取失败、无效记录、无效目标及目标保存失败反馈放到合适的语言/配置上下文，保留对应设置、重载或目标修复操作；通过受控 SDK 测试证明每种恢复操作调用正确路径，且失败时不使用未确认配置或误发请求。
- [x] 2.4 运行既有调度与页面回归测试，确认最后一次有效编辑后 399ms 不请求、400ms 仅一次请求，IME 草稿不提交，清空取消旧工作，同值输入/主题语言变化不重发，迟到响应被丢弃；确认未增加手动翻译、语言互换、一键复制或多模态入口。
- [x] 2.5 同步两种语言的 `development/translation.md`，说明计数规则、操作位置、状态与恢复路径及仍沿用的自动翻译、原生复制边界；验证两份文档的行为、示例和限制一致，运行插件 `test`、`typecheck` 与 `check`。

## 3. 设置面板整理与编辑连续性

- [x] 3.1 整理当前文档内的设置表单、说明和操作层次，将凭据保存失败/草稿验证反馈留在表单内，维持原文卡片挂载和滚动可达；通过测试确认打开时聚焦凭据输入、关闭/取消后回到设置按钮、IME 使用 Escape 时不误关，保存期间原文仍可编辑。
- [x] 3.2 回归设置开启暂停请求、关闭恢复当前输入、不变配置保留有效结果、保存失败保留草稿和最近确认配置、旧保存响应不能关闭新面板；保留标准原生编辑路径，不增加全局编辑键或剪贴板处理器，以现有页面/控制器测试通过为完成依据。
- [x] 3.3 同步中英文翻译插件文档中的设置呈现与反馈位置，核对未加密凭据说明、保存/取消、焦点和暂停恢复语义均完整保留；运行插件 `test`、`typecheck`、`check` 和 `build`，确认表单与主题样式可编译。

## 4. 最终验证与归档就绪

- [x] 4.1 执行现有稳定 Gate `pnpm run gate -- ci-plugins`，记录公共依赖准备、插件 typecheck/test/check/build 和构建后纯 Node `test:e2e` 结果。定向诊断复用 `pnpm --dir plugins/translation run typecheck`、`test`、`check`、`build`、`test:e2e`；必须在公共依赖就绪且插件构建后运行包检查，不增加 Translation 专属 Gate 或根脚本。
- [x] 4.2 执行完整工作区 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`，分别记录测试、类型、格式/静态检查和生产构建结果；定向插件成功不能替代完整验证。现有 `ci-lensx-frontend` 是对应 CI 入口，无需另造别名。
- [x] 4.3 执行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 并记录结果。本次不改 Rust、Host API、持久化、HTTP 或原生窗口，因此不新增 Rust 实现和原生场景；仍执行完整 Rust 基线，现有 `ci-lensx-rust` 是对应 CI 入口。
- [x] 4.4 修复本变更引入的全部 warning/error，重跑失败命令与上述最终完整验证集；核对所有新增检查均为确定性 Rstest/Cargo/静态/构建/纯 CLI 检查。禁止新增浏览器、真实 WebView、GUI、Launch Services、原生交互 harness、截图、像素基线、真实付费服务或目标环境性能阶段，也不保留可选/手动兼容入口。
- [x] 4.5 在同步前扫描 root `package.json`、CI、维护文档与 specs，确认无 Change 专用执行别名、直接 Rstest 文件列表脚本、递归 check 编排或过时 Evidence/dispatcher 引用；记录命中及处理结论，并运行 `openspec validate improve-translation-workspace-ui --strict`。
- [x] 4.6a 按用户追加授权整理全部 44 份稳定规格的 300 条历史长正文警告；保留要求标识、已有场景与规范义务，将细节放入对应可观察场景，逐项复核数量/边界/失败恢复语义，不修改校验阈值或产品实现。重新执行全量稳定规格严格校验并记录语义保持证据。
- [x] 4.6 实现和验证完成后，将已接受 delta 转为英文并同步到 `openspec/specs/official-translation-plugin/spec.md`；验证布局 Requirement 的重命名与修改正确合并、响应成功场景不再固定为下方文本区、全部原有响应验证场景保留。执行 `openspec validate --specs --strict` 并记录结果，此任务不授权移动归档目录。
- [x] 4.7 按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 完成变更范围治理与文档审计，在本文件追加实际证据：最终接受范围、已检查实现/测试/specs/文档类别与路径、英中镜像、索引和链接、项目级审计触发判断、结论与理由、实际更新路径、实际验证命令及结果。按追加的全仓规格整理范围重新判断治理影响，并对治理规格组织与过时命令引用修复完成项目级审计；继续保持索引、目录、语言关系、README、AGENTS、治理配置与生成集成一致。
- [x] 4.8 在同步与审计后重新验证 Change 和稳定规格，检查中英文文档语义一致、全部受影响链接可解析、范围内无缺失或过时说明；先前已做审计也须按最终范围复核，无需更新的结论仍记录证据。明确区分确定性检查与未验证的真实 WebView 外观、原生复制及真实服务行为；只有实现、同步、审计与验证全部完成才可报告归档就绪，实际归档等待单独请求。

## 5. 用户界面复核后的修订

本节依据用户八项反馈及 2026-10-27 的四项细化反馈替代前期有关计数、清空、发送提示、空状态、互换非目标和初始高度的要求。第 1–4 节勾选与原证据保留为前一阶段记录，最终完成与归档就绪以本节复核为准。

- [x] 5.1 修复原文中文 IME 输入，使用真实 Semi 控件及 composition/input 事件顺序建立失败回归；保留组合期间不请求、结束后 400ms、同值事件与失效会话隔离。
- [x] 5.2 将语言栏改为居中紧凑胶囊和真实交换按钮；定义显式语言/Auto 检测、反向不支持、保存确认/失败、重复操作及迟到响应行为，保持原文内容不变，并补充确定性测试。
- [x] 5.3 移除文本区蓝色焦点边框、工作区发送提示、译文空提示、字符计数与清空按钮；保留非蓝色键盘焦点提示、5000 上限、必要错误状态与重试，使用中性卡片及独立原文/译文输入区背景。
- [x] 5.3a 按 2026-10-27 反馈移除原文/译文标题的聚焦下划线，不新增文本区装饰性焦点效果；为互换及同类自定义 SVG 图标设置显式尺寸，验证启用/禁用状态的图标结构与可访问按钮语义。
- [x] 5.3b 原文 TextArea 关闭 spellcheck、autocorrect、autocapitalize 与 autocomplete，验证属性确实透传到原生 textarea；保留中文组合输入、缺少元数据时的会话回退、普通删除与迟到事件隔离，不拦截系统输入法候选。
- [x] 5.3c 移除译文下方的可见状态与请求 ID/检测语言元信息；保留独立的隐藏 live region，必要错误和显式重试放到顶部配置/语言上下文，验证空/成功/加载、错误恢复、语向与限额状态及无重复播报。
- [x] 5.4 将插件 Manifest 默认逻辑尺寸从 800×600 调整为 800×480；保留响应式窄屏/短窗口滚动和可调整尺寸声明，更新受影响断言与包检查。
- [x] 5.5 更新真实组件/控制器/样式契约回归，并运行插件 test、typecheck、check、build 和构建后纯 CLI test:e2e；修复本轮引入问题。
- [x] 5.6 同步中英文翻译文档、当前 proposal/design/delta 及英文稳定规格，清理被新请求替代的旧 UI 约束；重新验证 Change 与全部稳定规格。
- [x] 5.7 重跑 ci-plugins Gate、完整工作区 test/typecheck/check/build 与 Rust format/test/check/build，记录实际结果及证据边界，不新增 GUI 或真实 WebView 验证入口。
- [x] 5.8 按最终修订范围复核治理、双语镜像、链接和规格同步，追加实际审计与验证证据；确认所有任务完成后再报告归档就绪，仍不自动归档或提交。

## 6. 设置独立视图修正（2026-10-27）

用户明确要求点击设置进入设置页面，而非在工作区下方追加表单。本节将此前内联展开呈现替换为插件内部的独立设置视图，不新增 Host Page 或 Runtime。

- [x] 6.1 将工作区与设置改为互斥可见视图；工作区节点保持挂载但隐藏且不可交互，设置提供返回入口，进入时滚动到顶部并聚焦凭据，返回/取消/保存成功后恢复工作区、原值、选择、滚动与设置触发器焦点。
- [x] 6.2 更新真实 Semi 与样式契约回归，覆盖视图可见性、节点连续性、返回/取消/Escape/保存成功与失败、IME 优先、迟到保存和暂停/恢复调度；返回后仍可在待保存期间编辑原文。
- [x] 6.3 同步 proposal/design/delta、英文稳定规格与中英文翻译文档，替换旧的下方内联/同时可滚动访问语义；校验保留配置、请求、原生编辑与生命周期契约及全部受影响链接。
- [x] 6.4 执行 ci-plugins Gate、完整前端 test/typecheck/check/build 与 Rust format/test/check/build，修复引入问题；复核变更范围治理、双语镜像与同步后的全部规格，追加实际证据并更新最终归档就绪状态，不自动归档或提交。

## 实施与验证证据（2026-10-23）

- 已实现同一组 DOM 的响应式语言栏与原译文卡片、720px CSS 断点、16px 间距、14px 圆角、16px/1.6 正文、主题表面与独立焦点轮廓。文本控件保留 180px 最小高度及内部滚动，页面提供纵向滚动回退。
- 原文计数按 Unicode code points 派生并关联输入说明；清空位于原文脚部，状态、重试和独立元信息位于译文脚部。语言栏附近区分配置重载、有效目标修复及目标保存错误；凭据保存与草稿验证错误在当前设置面板内显示。
- `TranslationPage.test.tsx` 使用真实 Semi 控件验证英/中 × 明/暗、文本/节点/焦点/选区/IME 与请求连续性、399/400ms、5000/5001、代理对、组合字符、6000 纯空白、显式恢复、保存失败和迟到响应。`workspace-styles.test.ts` 只检查有限的样式声明，不宣称 Happy DOM 能验证几何布局。
- 定向命令 `pnpm --dir plugins/translation run test` 通过（11 文件、222 测试）；`typecheck`、`check`（33 文件）和 `build` 均通过。新增测试开发期间发现并修复了带标签 article 与 textarea 的查询歧义、DOM 类型和 SDK signal 匹配问题，随后重新运行上述检查通过。
- `pnpm run gate -- ci-plugins` 通过：先构建 5 个公共依赖包，再验证 2 个直接插件的 typecheck/test/check/build 与构建后纯 Node `test:e2e`。Translation 的公共 CLI 校验、两次可复现打包及 inspect 通过（9 个产物文件）。未新增根脚本或 Gate。
- Rust 基线 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`（265 项测试）、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 全部通过，未发现 warning/error。未修改 Rust、Host API、Manifest、Provider、控制器、持久化或原生窗口协议。
- `docs/en/development/translation.md` 与 `docs/zh/development/translation.md` 已同步更新布局、计数、状态/恢复与设置章节；两份文档各 5 条相对链接均有效，双语链接目标一致，两份既有索引入口有效。
- 已完成独立源码复核，未发现新增缺陷。上述证据均为确定性测试、静态检查、声明式样式契约、编译或纯 CLI 包检查；不证明真实 WebView 像素外观、系统复制/IME 投递或真实付费服务行为。

### 扩展范围与最终验证

- 首次完整 `pnpm run test` 在未修改的 `tests/app-bootstrap.test.tsx` 主题断言处失败；没有修改该测试、Provider 或其配置，也没有添加重试或等待。精确用例、整个 4 项测试文件及随后两轮完整工作区测试均通过。现有 passive effect 时序可能相关，但未将该推断当作已确认根因。
- 首次稳定规格严格校验产生 303 条正文长度警告。其中 300 条逐项对应 Git HEAD 中已经超过 500 字符的历史正文，另 3 条来自本次新增要求的英文展开。用户明确授权扩展到全部历史警告。新增要求和全部历史正文均已整理，校验器、阈值与 root 命令规则保持不变。
- 已整理 `openspec/specs/` 全部 44 份 `spec.md`，覆盖 Launcher、Host、插件平台、包/协议/SDK/UI、官方插件及治理规格。原有 400 个 Requirement 标识除本次批准的工作区重命名外均保留；新增 3 个呈现要求后共 403 个。长正文的原规范句子转移到具体操作场景，既有场景保留；全仓逐句核对保留了 1874 句原正文（不计本次批准重写的布局要求，过时 Gate 引用按下述等价映射核对）。
- 四组分别处理 73、77、75、75 条历史警告，并逐组执行严格校验。独立复核进一步检查新增 WHEN 的适用范围，修复了将通用约束错误限定到 DNS、终止、失败或更新事件的条件：包括 HTTP 准入身份/取消注册/所有阶段取消/同 attempt 隐藏恢复、全部包资源限制与诊断、原生编辑全过程与任意候选目标。没有删除义务或缩窄原有适用范围。
- 同步后的 Translation 稳定规格与中文 delta 的 5 个修改/新增要求具有一致的场景名称与顺序；响应验证场景完整保留，成功响应不再固定描述为下方文本区。实现、维护文档和稳定规格内已无旧 vertical 布局或 lower text area 约束。
- 命令扫描扩展到裸文本、反引号和命令调用；发现并将 `plugin-development-documentation/spec.md` 中两处已移除根 check 别名映射为当前 `pnpm run gate -- plugin-development-documentation`，验证范围不变。最终 87 个已移除 alias 零命中；按 root manifest、全部 CI 文件、双语文档、稳定规格与 active Markdown 复扫共 100 个文件，193 条显式 Gate/Generate 引用涉及 39 个 Gate、4 个 Generate ID，全部可通过现有 CLI 列表解析。root 25 个 scripts 与 CI 无 Change 专用别名、直接测试文件列表或递归 check 编排。
- 最终完整重跑全部通过：`pnpm run gate -- ci-plugins`、`pnpm run test`（145 文件、1457 测试）、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`、`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`（265 测试）、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`。最终日志未发现 warning/error 诊断。
- `openspec validate --specs --strict`：44/44 通过，零 issues。`openspec validate improve-translation-workspace-ui --strict` 通过；同步后出现的 ADDED 已存在 INFO 对应已写入主规格，不是错误或警告，后续归档须按已同步规格流程处理。`openspec validate --all --strict --no-interactive`：45/45 通过。`git diff --check` 通过。

## 最终治理与文档审计（2026-10-23）

- **最终范围**：翻译页面 `plugins/translation/src/TranslationPage.tsx`、`catalog.ts`、`styles.less`，真实 Semi 页面测试 `plugins/translation/tests/TranslationPage.test.tsx` 与新增 `workspace-styles.test.ts`；两份翻译开发文档；本 Change 的 proposal/design/specs/tasks；追加授权的全部 44 份稳定规格正文组织及两处过时命令引用。
- **已检查的文档类别与路径**：界面、配置/HTTP/存储与生命周期契约归属 `openspec/specs/official-translation-plugin/spec.md` 和 `docs/en/development/translation.md` / `docs/zh/development/translation.md`；开发约定与验证归属 `docs/en/development/frontend-guidelines.md`、`validation.md`、`project-workflow.md` 及已有中文镜像。全仓规格整理未增加产品能力或改变 API，因此其他产品文档无需行为改写。原文约束和既有场景保留核对为该结论提供依据。
- **项目级触发决定**：初始纯 UI 与普通文档原位更新不触发；追加全仓规格整理涉及 `validation-gate-governance`、`repository-continuous-integration`、`plugin-development-documentation` 等治理契约组织，并修复已移除命令引用，因此按最终范围补充项目级审计。
- **项目级检查对象**：`AGENTS.md`、`docs/AGENTS.md`、`README.md`、`README-zh.md`、`govern-spec.yaml`、`openspec/config.yaml`、`docs/en/index.md`、`docs/zh/index.md`、双语 `development/project-workflow.md`、`.gitignore`、root `package.json`、`.github/` CI 和现有 Gate/Generate catalog。入口仍通过规范索引/文档索引导航，无并行实现目录；规范、文档、代理规则及 spec driver 配置的职责与来源顺序保持一致。
- **语言、结构与链接**：`govern-spec.yaml` 的 6 字段继续选择英文本位 README/docs、英文 agent/spec driver/stable specs 与 active `auto`；本次新增 active 审计为中文。英中各 24 个文档路径完全对应，文档根和语言根符合目录约束；77 条治理/导航本地链接目标有效。翻译文档两份各 5 条相对链接及既有索引入口有效、目标一致，行为、例子和未验证边界逐项复核一致。
- **临时材料与生成集成**：四个项目临时根均被忽略且无已跟踪内容；维护产物不引用临时来源。未改动工具生成的技能/集成、全局配置或 pnpm store。OpenSpec CLI 为已安装的 1.14.3，`openspec schemas --json` 可解析现有 `spec-driven`；未执行初始化、升级或集成刷新。
- **实际更新与无需更新结论**：实际修改路径为上述 UI/测试、两份翻译文档、44 份稳定规格与当前 Change artifacts。没有增删/移动维护文档，现有索引、README、AGENTS、语言配置和 driver 配置已经满足所检查的约束，因此不改动这些入口或治理文件。命令迁移只修复规格引用，没有添加执行入口。
- **列表核对补充**：完成上述完整 pnpm 验证后，额外的 `pnpm run gate -- --list` / `pnpm run generate -- --list` 封装调用报告 `unable to open database file`；直接执行相同脚本的 `node --experimental-strip-types scripts/validation/cli.ts gate --list` 与 `generate --list` 均通过，完成全部 ID 解析核对。未据此改动任何 pnpm、数据库或全局配置，也未把该封装诊断描述为已确认根因。
- **结论与证据边界**：实现、稳定规格同步、语义保持整理、变更范围审计、追加项目级审计及最终确定性验证已完成。已复核最终范围，无缺失或过时的本次 UI 说明，符合归档就绪条件；实际归档仍等待单独请求。未进行真实 WebView 像素外观、系统复制/IME 或真实服务验收，不将确定性检查描述为这些验收。

## 后续修订收尾与复核（2026-10-27）

本记录以第 5 节及本日四项细化反馈为最终接受范围，取代前阶段有关标题焦点下划线、可见译文状态/元信息和常驻控件的验收结论。此前 44 份规格历史整理保持不变，本轮仅继续同步翻译插件对应的稳定规格。

- **中文输入与上次未完成项**：区分组合标记的临时空草稿和普通删除；在原生 input 缺少 isComposing/inputType 时，只通过仍有效的 token 与 composing 状态回退判断。`n → 空 → ni → 你`、无元数据原生事件、明确非组合删除、迟到提交、399/400ms、同值通知和请求一致性回归均通过。没有增加第二份文本状态或原生键盘拦截。
- **语言与窗口**：保留紧凑居中语言胶囊、目标保存确认后原子生效的互换，以及可调整的 800×480 初始 Manifest 尺寸。互换不替换原文，Auto 仅采用当前有效成功检测结果，单向/同值语对及未检测场景保持禁用；保存失败/回读、重复激活和旧 Runtime 响应回归通过。Manifest 测试及构建后包检查使用新尺寸，不改 Host/Rust 通用窗口 fixtures。
- **本次四项细化**：移除 `.translation__card:focus-within > label` 装饰规则，文本聚焦不再给标题添加下划线；原生光标/选择保持不变。交换及设置的自定义 SVG 显式声明 20×20，装饰图像对辅助技术隐藏而按钮保留名称。原文 textarea 声明 `spellCheck=false`、`autoCorrect="off"`、`autoCapitalize="off"`、`autoComplete="off"`，不修改系统设置或抑制输入法候选。
- **状态与恢复**：译文卡片只保留标签和只读文本，不渲染状态 footer、RequestId 或检测语言文案。等待/翻译中/成功/暂停通过卡片外的视觉隐藏 live region 提供；空状态不播报。输入限额、语向、HTTP 不可用及请求失败在顶部语言/配置上下文显示一次 alert，失败重试与其相邻，隐藏 status 不重复播报同一错误。配置重载、目标修复与凭据表单错误仍按各自归属处理。
- **图标诊断依据**：已安装 Semi Icon 组件只包裹传入 svg，没有为自定义图像补充宽高；旧 SVG 仅有 viewBox。显式尺寸和非空描边几何在实际 Semi 按钮的启用/禁用状态下经过 DOM 契约测试，构建同时验证样式与图标产物。该证据不等同于实际像素渲染验收。
- **最终验证**：`pnpm run gate -- ci-plugins` 通过，包含公共依赖准备、两个插件 lifecycle 和纯 Node 包检查；Translation 为 12 文件、249 测试，CLI 校验、可复现 pack 与 inspect 通过（9 个产物文件）。完整 `pnpm run test` 为 146 文件、1484 测试通过；`pnpm run typecheck`、`pnpm run check`、`pnpm run build` 通过。Rust format/test/check/build 全部通过，265 测试；以上最终日志无 warning/error。真实组件测试同时保留四种语言/主题组合、IME 和互换回归。
- **规格与文档同步**：最终 `official-translation-plugin` 含 21 个 Requirement、120 个 Scenario；旧可见计数要求已按明确删除/替代关系移除，新限额要求仍保留全部校验行为。13 个未受影响的要求及完整响应安全块逐字保留。中文 delta 与英文主规格的有效场景名称/顺序一致，英文要求正文均满足长度约束。`openspec validate --all --strict --no-interactive` 45/45 通过，`git diff --check` 通过。
- **治理与文档复核**：已复核当前 proposal/design/delta/tasks、插件页面/控制器/样式/Manifest/测试及包检查、英文稳定规格、`docs/en/development/translation.md` 和相同路径的中文镜像。双语交互、例子、失败恢复、原生边界一致；两份文档各 5 条本地链接、现有索引入口及 active artifact 相对链接均有效。原位更新普通分类文档，无新增/移动文档、索引或语言关系变化；未改 README、AGENTS、治理配置、生成集成、root scripts 或 CI。本次细化未新增项目级治理触发，前一阶段项目级审计的约束与入口结论仍成立。
- **实际更新范围**：本轮新增细化主要为 `plugins/translation/src/TranslationPage.tsx`、`styles.less`、`tests/TranslationPage.test.tsx`、`tests/workspace-styles.test.ts`；同时完成此前控制器/语言互换测试、catalog、Manifest 与包断言改动的复验。文档更新限于双语翻译文档、本 Change artifacts 和 `openspec/specs/official-translation-plugin/spec.md`，保留其余已完成规格整理。
- **完成与边界**：全部实现、未完成回归、稳定规格同步及最终审计已收尾。自动更正等原生提示的实际表现、真实 WebView 像素效果、系统复制/IME 投递及真实翻译服务未作原生验收；本次没有启动 GUI、真实 WebView 或付费请求。用户的截图是反馈输入，不作为本轮已通过的实机证据。变更具备归档条件，但不自动归档、提交、安装或重载插件。

## 设置视图修正证据与最终复核（2026-10-27）

- **最终接受行为**：点击设置切换到插件内部独立设置视图，工作区与表单互斥可见，不再上下拼接。工作区使用持久挂载的 `translation__workspace`，进入设置时设置 hidden/inert，并以显式 `[hidden] { display: none }` 防止 flex 样式覆盖隐藏语义。原文/译文节点、控制器、文本、结果、语言与选区保留；不新增 Host Page、路由或原生窗口。
- **导航与焦点**：设置页有英中本地化的“返回翻译”入口。进入前保存工作区 scrollTop，视图可见后在 layout effect 内滚动至顶部并聚焦第一个凭据输入；返回、取消、普通 Escape 或当前会话保存成功后，先恢复工作区可见性，再恢复滚动与设置触发器焦点。焦点操作使用 preventScroll；IME 正在使用的 Escape 不离开设置。
- **配置与调度连续性**：隐藏工作区不卸载文本控件或改写输入。配置读取/无效记录的反馈与重载在当前设置视图仍可访问，凭据失败留在表单；失败保存保留草稿，旧保存响应不关闭重新打开的视图。保存中允许先返回再编辑原文，相关请求仍等待确认/核对。已有取消、迟到响应隔离、有效结果保留及返回后 399/400ms 调度语义保持。
- **实现与测试路径**：更新 `plugins/translation/src/TranslationPage.tsx`、`styles.less`、`catalog.ts` 及 `plugins/translation/tests/TranslationPage.test.tsx`、`workspace-styles.test.ts`。新增视图可见性、hidden/inert、默认 role 查询排除、同节点/值/选区保留、英中返回按钮、滚动保存恢复、各关闭路径、保存中返回编辑及在途取消/迟到响应回归；没有修改 controller、settings 持久化、Provider、Host 或 Rust。
- **实际验证**：插件 12 文件、253 测试通过；`pnpm run gate -- ci-plugins` 通过（两插件共 439 测试，含公共依赖准备、类型/静态检查、构建及纯 CLI 包检查）；完整 `pnpm run test` 为 146 文件、1488 测试通过，`typecheck`、`check`、`build` 通过。`src-tauri:format:check`、`src-tauri:test`（265 项）、`src-tauri:check`、`src-tauri:build` 全部通过。最终日志无 warning/error；独立源码复核无新增问题。
- **同步与治理复核**：已核对 current proposal/design/delta/tasks、英文稳定 `official-translation-plugin`、双语 `development/translation.md`、现有索引及相关前端/验证/工作流约束。稳定规格只修订设置、响应式短窗口场景与键盘返回行为三个块，其他 18 块逐字不变；共 21 要求、123 场景，正文长度均合规。旧机器场景名 `Pause and resume around the inline settings panel` 保留用于既有场景完整性，但其条件与结果已全部描述独立视图，不保留下方内联行为。
- **文档与链接**：英中行为、保存中返回限制、暂停/恢复、隐藏节点及原生证据边界一致，两份翻译文档各 5 条相对链接与原索引入口有效，链接目标一致。普通文档原位更新，未增删路径、改变语言关系或改动治理配置/生成集成；本轮不新增项目级审计触发，先前项目级入口约束仍成立。`openspec validate --all --strict --no-interactive` 45/45 通过，`git diff --check` 通过。
- **完成边界**：本记录取代此前“同文档下方展开设置”的呈现结论，完成第 6 节全部实现、规格同步和审计。确定性测试覆盖状态与 DOM/声明契约，不代表真实 WebView 像素、系统焦点/撤销投递或真实服务验收；没有运行 GUI 或付费请求。变更继续具备归档条件，但不自动提交、归档、安装或重载。

## 独立归档请求复核（2026-10-27）

- **授权与完成状态**：用户明确请求归档 `improve-translation-workspace-ui`。当前 OpenSpec 1.14.3 将项目根解析为本仓库，schema 为 `spec-driven`，proposal/specs/design/tasks 均为 done，CLI 统计 36/36 任务完成。本次按归档前同步要求复核最终状态，不以先前勾选或审计替代本轮检查。
- **最终范围与实现复核**：检查当前 proposal/design/delta/tasks、`plugins/translation/src/TranslationPage.tsx`、`controller.ts`、`catalog.ts`、`styles.less`、`manifest.json`、页面/控制器/语言互换/样式/Manifest 测试和 `scripts/test-e2e.mjs`。原生 IME 空草稿与普通删除隔离、当前成功检测结果互换、目标确认后共同采用语对、隐藏工作区节点连续性、设置会话及焦点/滚动恢复与最终接受契约一致，未发现阻止归档的实现问题。
- **稳定规格同步结果**：仅使用 status 返回的 `specs/official-translation-plugin/spec.md` 作为 delta 来源，并读取一次当前 specs instructions。英文主规格已包含 6 个 MODIFIED、4 个 ADDED、1 个 REMOVED 和 1 个 RENAMED 操作的全部有效结果，10 个修改/新增要求的场景名称与顺序逐项一致；全文为 21 个要求、123 个场景。已人工核对中英文行为、错误恢复和边界语义，旧名称与已移除计数要求均不存在；原标题和 Purpose 与 HEAD 逐字一致，全部要求处于唯一 Requirements 节下，无 delta 操作标题，正文长度合规。本轮同步为幂等核对，无需重写已同步规格。
- **历史规格整理复核**：此前用户授权的 44 份稳定规格整理属于最终接受范围，全部标题与 Purpose 保留。除 Translation 的授权行为修改外，43 份规格保留 383 个原要求和 1,310 个原场景；1,309 个场景正文逐字不变，1,785 个原正文句段中 1,784 个仍逐字存在于同一要求，唯一文字迁移均为已退休命令转为 `pnpm run gate -- plugin-development-documentation`。新增的 457 个场景承接原正文。抽查 HTTP 身份与各阶段取消、包限额与诊断、Child 编辑全过程、资源撤销、Runtime 清理和 Gate/CI 条件，未发现新增 WHEN 缩窄通用义务；此结论基于全量结构/原文保留检查和关键语义抽查，不宣称形式化等价证明。
- **文档与语言检查**：复核 `docs/en/development/translation.md` 和中文镜像，以及双语 frontend-guidelines、validation、project-workflow 与文档索引。最终布局、IME、互换、反馈、独立设置及保存中返回、原生证据边界含义一致，现有文档覆盖充分，无需新增或修改维护文档。英中各 24 个文档路径对应，文档根和语言根符合目录规则；95 条范围内本地链接目标有效，其中翻译文档各 5 条的目标顺序一致。
- **项目级审计触发与复核**：此前全仓整理涉及治理契约组织及旧命令引用，已触发项目级审计，本次重新确认该结论；最新 UI 修订未增加新的治理触发。检查 `AGENTS.md`、`docs/AGENTS.md`、README 双语、`govern-spec.yaml`、`openspec/config.yaml`、双语索引/工作流、`.gitignore`、root `package.json` 与 `.github/`。入口职责、来源顺序、同步语言、临时路径及归档门槛一致；没有需要修复的治理漂移。四个临时根均被忽略且无已跟踪内容，生成集成保持不变。
- **命令治理复核**：扫描 root manifest、CI、维护文档、44 份稳定规格和 active Markdown 共 100 个文件，195 条显式 Gate/Generate 引用涉及 39 个 Gate 与 4 个 Generate ID，均可由现有 CLI 列表解析；87 个已移除别名零命中。root 25 个 scripts 无 Change 专用别名、直接测试文件列表或 `&&` 验证图，未发现过时 Evidence 命令引用。
- **本轮实际验证**：`pnpm run gate -- ci-plugins` 通过，两个插件共 439 测试；Translation 253 测试及公共 CLI 校验、两次可复现打包和 inspect 通过（9 个产物文件）。`pnpm run test` 全工作区 1,488 测试通过，`pnpm run typecheck`、`pnpm run check`、`pnpm run build` 全部通过；`pnpm run src-tauri:format:check`、`src-tauri:test`（265 测试）、`src-tauri:check`、`src-tauri:build` 全部通过，验证日志无 warning/error 诊断。
- **规格验证与归档方式**：`openspec schemas --json` 确认当前 schema；`openspec validate --specs --strict --no-interactive` 44/44 通过，`openspec validate --all --strict --no-interactive` 45/45 通过，`git diff --check` 通过。Change 校验中的 ADDED 已存在 INFO 对应已同步主规格，不是待处理警告或失败；完成上述同步核对后，按归档技能移动目录，避免重复应用 delta。
- **实际更新、结论与边界**：本轮只追加本审计记录，并按用户请求将完整 Change（包括 `.openspec.yaml`）移动至 `openspec/changes/archive/2026-10-27-improve-translation-workspace-ui/`；源码、测试、稳定规格、维护文档和治理入口无需进一步修改。实现、同步、变更范围及项目级复核、最终验证均满足归档条件。归档不等于提交、安装、重载或发布；真实 WebView 像素、系统 IME/复制/焦点/撤销投递及真实翻译服务仍未验收。
