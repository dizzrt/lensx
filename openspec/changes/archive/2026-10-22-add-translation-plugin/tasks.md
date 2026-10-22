# Tasks

本清单对应 [design.md](design.md) 和 [official-translation-plugin](specs/official-translation-plugin/spec.md)。用户于 2026-10-22 授权 apply；按依赖顺序实施并记录实际证据后勾选。用户随后授权通用 Host HTTP，先修订 active artifacts 后实施；稳定规范同步、同步后审计与归档仍遵循 7.6–7.10 的后续授权和顺序要求，未自动提交、推送、发布或安装。

## 1. 独立插件结构与公共边界

- [x] 1.1 在 `plugins/translation` 建立直接 workspace 成员，声明 `@lensx/official-translation` 及公共 Contract/SDK/UI/Testkit/CLI、React/Semi 和构建测试依赖，配置有实际职责的 `build`、`typecheck`、`test`、`check`、纯 Node post-build `test:e2e`；以成员发现结果、包类型检查和 workspace 边界检查验证，无新增根脚本或 Host 源码导入。
- [x] 1.2 创建 `dev.lensx.translation` Manifest，贡献 `main` Page、`open` Action、`Translation` / `翻译` 名称与相关关键词，声明 800×600 可调整页面；用公共 Manifest validator 的有效/无效夹具及 CLI validate 验证 ID、语言和兼容范围，保持 Manifest0.4/wire0.2；Translation 声明 Host API>=0.3.0 <0.4.0。
- [x] 1.3 建立一次初始化的 SDK WebView bootstrap、完整 Context 订阅和插件私有 UI provider，接入空工作区；使用真实 SDK 与 Testkit 证明初始化失败、重试、Context 替换、断线和 dispose 不泄漏旧 client 或订阅，构建图没有 Host/Tauri 导入。
- [x] 1.4 新增 `docs/en/development/translation.md` 及同路径 `docs/zh/development/translation.md` 的插件身份、范围和公共边界说明，更新两语言 `index.md`、`development/plugin-workspace.md` 与 `plugin-development/index.md` 中受影响的入口；验证路径、双语语义一致及导航可达，尚未完成的内容不得写作已交付。

## 2. 语言目录与已确认配置

- [x] 2.1 建立带来源日期的官方语言目录快照与英文/中文标签，覆盖 `en`/`zh` 映射、繁体变体、`sk` 仅目标及六个仅可翻译到 `zh` 的源语言；用表驱动测试验证角色、显式语向拒绝、Auto 不被当作 API code，维护文档同步目录来源与未实测语向的边界。
- [x] 2.2 实现版本 1 配置 DTO 与 `settings.v1` 的运行时读取校验，区分缺失、有效、未知版本/结构损坏、仅目标失效和 Host storage 失败；通过真实 SDK + 可控存储响应验证初始读取前零翻译调用、读失败不覆盖记录、显式重读恢复、仅目标失效时保留已验证凭据并允许显式修复保存，以及相同身份重开恢复配置且不恢复文本。
- [x] 2.3 实现串行配置提交和 confirmed snapshot，保留完整记录未修改字段，设置保存确认后生效、确定失败保留旧值、结果不明重读核对；用延迟/失败/丢回复测试证明目标更新不覆盖 AK/SK、冲突提交被阻止、原文仍可编辑、旧 attempt 回调失效。
- [x] 2.4 实现源语言每次打开 Auto、手动源只在内存，以及目标语言恢复/首次 Context 推导/下拉自动保存后生效；测试 `en-US → en`、`zh-CN → zh`、推导不落盘、存储晚到与 Context 更新竞态、保存失败与结果不明、重启恢复及 Host locale 不覆盖选择。
- [x] 2.5 在双语维护文档补齐配置 schema、未加密 AK/SK、目标语言优先级、无默认写入、失败恢复与数据保留/清除语义；逐项对照配置测试和两语言资源，确认没有“加密保存”或跨 generation 浏览器存储的错误承诺。

## H. 已授权的通用 Host HTTP（先于重新打开的插件任务）

- [x] H.1 修订 proposal/design、official-translation-plugin 和所有受影响平台 delta specs，新增 plugin-host-http 规范；核对 URL/DNS/header/bytes/deadline/并发/取消/版本边界，严格校验后才开始实现。
- [x] H.2 扩展公共 Contract Schema、目录、校验器和 TS/Rust 共享夹具；Host API/Contract0.3.0、SDK0.4.0（支持>=0.2.0 <0.4.0），维护消费者和 Manifest 范围同步；通过现有 `generate -- plugin-host-api-types --write` 更新生成物，该 target 补齐 owning standalone-validator generator，不手改生成内容。
- [x] H.3 实现 Rust 公网 HTTPS 策略和可注入 resolver/transport，DNS 一次校验并 pin，保持 TLS、禁代理/重定向/自动重试/Cookie/解压；测试地址混合结果、映射IP、headers、UTF-8、1MiB/4MiB边界、总期限及4/16请求并发，另以全局16个OS DNS worker保证取消后阻塞解析不能无限积累。
- [x] H.4 在可信原生 RPC dispatcher 路径接入 HTTP，先登记取消再启动，SDK取消/RPC截止/Runtime终止直接停止原生future；HTTP专用有界截止不改变其他方法，测试旧attempt和并发释放，无新增插件Tauri command。
- [x] H.5 组合真实 provider 可用性与完整 Context，typed SDK HTTP 调用及旧Host缺能力恢复；测试TS/Rust真实接线、版本不兼容、取消与结果校验，保留其余8方法语义。
- [x] H.6 同步双语维护文档、公共包说明、开发模板与生成快照、错误/版本/能力发现文档和文档校验器；增加稳定 `plugin-host-http` Gate，不增加根script；清楚描述旧包重建和网络限制。

## 3. 火山引擎适配与浏览器签名

- [x] 3.1 审核并精确锁定插件私有 `@noble/hashes@2.4.0` 的发布 tarball、许可证、公开导出与依赖图，仅使用 SHA-256/HMAC 及必要编码子路径；通过浏览器构建及产物模块检查证明执行路径不依赖 Node builtin、Buffer shim、`crypto.subtle` 或远程代码，并将审核依据同步到双语维护文档。
- [x] 3.2 实现固定 endpoint、Action `TranslateText`、版本 `2020-06-01`、region `cn-north-1`、service `translate` 的 canonical request 与 Authorization；用带来源的独立官方参考固定向量校验 UTC 日期、query 编码、headers、Unicode/空格/换行、字段省略和正文哈希，验证签名字节与实际发送字节相同。
- [x] 3.3 将 provider 改为可注入公共 SDK HTTP transport/clock，发送单条完整 `TextList`，Auto 省略 `SourceLanguage`，签名与业务仍留插件，使用公共 http.request 的无环境凭据/无重定向 HTTPS 与 1 MiB 响应边界；用假 HTTP 检查所有发送字段、取消/超时、逐块超限及非 JSON 响应，全程不读取真实凭据或访问翻译服务。
- [x] 3.4 实现 HTTP 与 `ResponseMetadata.Error` 联合判断，包括非 2xx 服务错误、HTTP 200 错误、恰好一条字符串译文及安全 RequestId；用成功/畸形/超大/鉴权/权限/时钟/限流/语向/未知错误夹具验证本地化分类、原始消息隔离和无敏感日志，补齐 InvalidAccessKey/InvalidCredential/CodeN 分类，不把 Host 网络错误伪装为浏览器 CORS。
- [x] 3.5 在双语维护文档记录固定 API、语言自动识别字段语义、响应限制、签名选择及 Node SDK 版本差异；用实现和固定向量逐项核对，明确 OPTIONS 探测不等于有效签名 POST 或真实 WebView 验收。

## 4. 自动翻译状态与请求一致性

- [x] 4.1 实现 400ms 调度、实际值去重、先判空白再检查上限、保留原文请求字节及 5000 Unicode code point 限制；使用可控时间测试连续编辑、重复事件、5000/5001、超长纯空白、代理对/组合字符、超限恢复和不截断/不拆分。
- [x] 4.2 实现 IME 草稿、最终提交和退休组合会话处理；通过真实文本组件事件序列覆盖组合期间零请求、结束后仅一次调度、清空或卸载后迟到 composition end 不恢复内容，以及键盘确认键不触发额外工作。
- [x] 4.3 将请求绑定到 Runtime attempt、generation、文本、语言和仅随请求语义变化的配置修订，变化立即使旧译文失效并取消旧工作；用可控乱序成功、失败、timeout、finally 及取消无效夹具证明只有最新请求能改译文、错误和加载状态，测试无变化保存及同值目标持久化不清空成功译文或重发。
- [x] 4.4 实现覆盖签名至读取结束的 15 秒期限、仅显式重试及重试去重，设置打开时暂停、关闭按当前 confirmed 状态恢复；测试未改参数的成功译文不重复请求、取消后待完成输入可恢复、配置保存或目标选择确认前不发请求。
- [x] 4.5 实现同 attempt hide/restore 保留状态与真实终止/SDK 重建清理内存、计时器、请求、监听器；通过生命周期假实现验证恢复不重发、晚到回调失效和新 attempt 空文本，双语文档同步完整输入、错误和生命周期语义。

## 5. 工作区与插件内设置界面

- [x] 5.1 按仓库 Semi Design 指引实现上下多行原文/只读译文、语言选择、状态和重试，使用插件主题与本地化层；用真实组件验证 textarea 标签、readonly 可选择语义、普通文本安全渲染、长文本布局结构，以及两语言/明暗主题组合，无 Monaco 或额外 UI 库。
- [x] 5.2 实现同文档设置面板，服务仅火山引擎、AK/SK 默认掩码、明文保存说明、草稿保存/取消及输入校验；组件集成测试验证不销毁原文控件、不丢文本、保存失败不采用草稿、成功后仅使用确认值和条件未变不重复计费请求。
- [x] 5.3 补齐英文基准与简体中文的控件、语言目录、状态、错误和可访问文案，Context 更新只影响表现；用词条对齐与组件测试证明 locale/theme 切换不改变目标、文本或网络调用数量。
- [x] 5.4 完成键盘操作、设置焦点进入/返回、Escape 与 IME 优先级、请求状态 live region 及当前文本焦点的原生编辑兼容；通过确定性 DOM 事件测试验证焦点与处理器行为，不模拟为 OS 复制验收，不新增 Host clipboard 或全局编辑拦截器。
- [x] 5.5 在双语维护文档补齐实际界面流程、首次配置、语言记忆、输入限制、错误恢复和原文发送至服务的说明；对照最终组件词条与行为测试校核两语言示例和限制一致。

## 6. 自包含产物与现有 CI 接入

- [x] 6.1 完成插件私有 Rsbuild 生产配置、自包含 HTML/脚本/样式及收紧外连的文档 CSP；运行包内 build 并检查全部引用都在 `dist/` 内、无远程脚本、Host 全局、Node polyfill 或 source credential，所有资源满足现有 `.lxp` 限制。
- [x] 6.2 实现纯 Node 的 post-build `test:e2e`：通过公共 CLI `validate --project`、两次 `pack --project --no-build --output` 和 `inspect` 校验 Manifest、完整资源与包字节可重复；临时包使用操作系统临时目录，验证成功/失败清理且不改变根 `node_modules` 或 pnpm store，不导入 CLI 私有模块。
- [x] 6.3 确认现有 `ci-plugins` 自动发现新成员并准备其声明依赖，成员生命周期与 post-build 检查真实执行；以 Gate plan 和运行结果验证，保持 root scripts、workflow 和 Gate 注册不新增 Change/插件专用别名。
- [x] 6.4 完成两语言维护文档的准确构建/包验证命令和安装/开发重载边界，检查 `development/validation.md`、`development/continuous-integration.md` 及插件入口是否需同步最小修改；以实际脚本和 Gate plan 核对引用，不宣称已发布、自动安装或真实服务联调通过。

## 7. 最终验证与归档就绪

- [x] 7.1 运行并记录适用的现有聚合与边界 Gate：`pnpm run gate -- ci-plugins`、`pnpm run gate -- workspace-boundaries`、`pnpm run gate -- workspace-lifecycle`、`pnpm run gate -- plugin-developer-cli`、`plugin-host-http`、`plugin-host-api-contract`、`plugin-host-api-dispatcher`、`plugin-child-webview-host-dispatcher`、`plugin-sdk`、`plugin-sdk-transport`、`plugin-testkit`；先检查各自 plan，记录重叠阶段的等价证据以避免不必要重复，但不得用 focused Gate 代替完整生命周期。
- [x] 7.2 完成并记录完整前端/工作区验证：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`；明确测试、格式与静态检查、类型和生产构建结果，不能只报告新增插件局部通过。
- [x] 7.3 完成并记录 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`。本轮修改 Rust/Host HTTP 和协议版本，必须执行完整原生回归；若最终范围导致某项确实不适用，必须记录检查依据和理由，不能默默省略或以未运行冒充通过。
- [x] 7.4 修复本变更引入的全部警告和错误，重跑失败命令及完整最终验证集合；记录残留基线问题与影响范围，不将其与本变更验收混淆。确认生命周期、Gate、Generate 和 CI 不包含真实 API、浏览器、WebView、GUI、Launch Services、native harness、截图/像素或目标环境性能路径。
- [x] 7.5 完成当前 change 的严格校验 `openspec validate add-translation-plugin --strict --no-interactive`，核对 proposal/design/spec/tasks 与实际实现一致；运行 `git diff --check` 并校验双语文档路径、链接、索引和语义，记录实际结果而非仅列计划命令。
- [x] 7.6 在获得后续同步/归档授权后、任何归档操作之前，将本变更八份已接受 delta 转写为英文并同步至 `openspec/specs/` 对应能力（含 official-translation-plugin、plugin-host-http 和六项现有平台能力），保留协议名和要求语义；用 `openspec validate --specs --strict --no-interactive` 验证同步结果。本轮 apply 不执行稳定规范同步或归档。
- [x] 7.7 同步后按 `docs/en/development/project-workflow.md#governance-and-archive-readiness` 对最终已接受范围执行并记录变更级审计，检查插件实现/测试、稳定规范、双语维护文档、索引、链接与适用约束；在本节追加实际 inspected paths、结论、理由、updated paths 和验证记录，即使无需更新也必须留证，归档前重新确认。
- [x] 7.8 执行并记录项目级治理审计：本变更新增维护文档并更新两语言索引，已触发文档结构/导航审计；核对 canonical ownership、目录分类、双语同步、根入口角色、临时目录规则和生命周期。修复后再次评估触发范围；不扩展为全项目功能或历史变更审计。
- [x] 7.9 在同步/归档前扫描 root `package.json`、CI、维护文档和稳定规范中的 Change ID 专用命令、废弃别名、直接 Rstest 文件列表脚本、递归检查和过时 dispatcher 引用；验证没有引用或依赖项目根临时目录。审计记录需包含扫描路径、实际结论及必要修复。
- [x] 7.10 对同步后的规范和修复后的文档重跑严格校验、链接/双语一致性与必要最终检查，确认无缺失、过时或未解决的范围内治理问题；仅在用户另行要求时进入 archive，保持“先同步、后审计验证、再归档”的顺序，不自动提交、推送、发布或安装。

## 首轮 Web 直连实现的历史验证记录（2026-10-22）

以下为传输修订前证据，不作为新增 Host HTTP 的完成依据；被影响的任务已重新打开。

- 1.1–1.4：新增直接成员 `plugins/translation`、Manifest `0.4.0`、公共 SDK WebView bootstrap、插件私有 UI。`pnpm --dir plugins/translation run typecheck` 与 Manifest/Runtime 测试通过；公共 CLI validate 返回 compatible，构建图无 Host/Tauri 导入。`workspace-boundaries` 扫描及 21 项测试通过；`workspace-lifecycle` 自动发现新成员，修正成员顺序夹具后 6 项测试通过。根 scripts、Gate 注册和 CI workflow 未增加入口。
- 2.1–2.5：129 个官方语言代码（128 源、123 目标），完整双语标签和语向限制；真实 SDK/Testkit 存储测试覆盖缺失、无效、读失败、目标修复、串行提交、确认失败、丢回复重读、Context 竞态、能力丢失、重开和无变化修订。配置与 controller 合计 55 项确定性测试通过。
- 3.1–3.5：精确固定 `@noble/hashes@2.4.0`，核对发布 tarball 完整性、MIT、公开导出及零运行时依赖；来源、摘要与固定官方 signer 提交写入双语文档。语言/provider/signing 共 73 项测试通过，覆盖独立固定签名向量、完整发送字节、HTTP/服务错误、响应流大小、取消与总期限。生产模块清单和 bundle 断言无 Node builtin、Buffer shim、`crypto.subtle` 或远程脚本。
- 4.1–5.5：400ms 防抖、5000 code point、IME 会话退休、请求 generation、15 秒总期限、显式重试、设置暂停/恢复和 attempt 销毁已实现。真实 Semi 组件测试覆盖四种 locale/theme 组合、普通文本只读输出、迟到 IME、取消后新输入、同文档草稿、确认前阻塞、保存失败、重开设置的旧回调、焦点/Escape、原生编辑事件不拦截和新 Runtime 空文本。插件完整 8 文件、157 项测试通过；typecheck/check 通过。
- 6.1–6.2：包内生产构建通过；`test:e2e` 用公共 CLI validate、两次 pack 和 inspect 验证 9 个自包含文件、包字节相同及实际 SHA-256 与 CLI 摘要相等。临时目录成功/故障清理均通过；HTML/CSS 资源与全部 chunk inventory 闭包通过，构建专用 `.build/` 清单不进入包。安装使用机器全局 pnpm store，lockfile 只新增本插件 importer、精确 noble 依赖及非弃用的插件测试 matcher 版本；未修改根 node_modules 拓扑以运行 consumer 检查。
- 7.3：`pnpm run src-tauri:format:check`、`src-tauri:test`、`src-tauri:check`、`src-tauri:build` 全部退出 0；Rust 241 项测试通过，main/doc tests 为 0，无警告或错误。未修改 Rust/Host 协议，保留完整项目基线回归。
- 6.3–6.4：事先检查 `ci-plugins`、`workspace-boundaries`、`workspace-lifecycle`、`plugin-developer-cli` 四个 Gate plan。`pnpm run gate -- ci-plugins` 通过：准备 5 个公共依赖包、执行 2 个官方插件各自的 typecheck/test/check/build/test:e2e；Translation 的公共 CLI 包检查实际执行。双语维护文档与验证入口命令经实际脚本、plan 和执行结果核对。
- 7.2：完整根 `pnpm run test`、`typecheck`、`check`、`build` 全部退出 0。test 共 11 个项目、139 个测试文件、1331 项测试通过（含新插件 157 项）；无失败或跳过。check 包含既有文档、元数据与源码检查，生产构建涵盖所有成员；不是仅新增插件局部通过。
- 7.5：`openspec validate add-translation-plugin --strict --no-interactive` 通过；`openspec validate --all --strict --no-interactive` 43/43 通过。两个文档检查器与最终双语路径/本地链接/代码块/外链一致性检查、`git diff --check` 通过。proposal/design 开头已区分变更前基础与当前 apply 进度，未把 active delta 描述为已同步稳定规范。
- 验证中修复：新增成员的生命周期期望、组件和存储 DTO 类型、Semi DOM Canvas 测量假实现、IME 退休/面板会话回调/状态公告、CLI pack 状态及 digest 字段、生产与测试导入边界、格式问题均已修复并重跑失败检查及最终根生命周期。公共 CLI Gate 首次因全局 store 缺失离线 tarball（`acorn@8.19.0`，随后 `prosemirror-changeset@2.4.4`）未通过；以既有 Gate 依赖输入在系统临时 consumer 准备缓存，保持 Gate、仓库依赖和全局配置不变，最终结果在下方补记。
- 7.1、7.4 最终结果：离线 consumer 所需缓存补齐后，`pnpm run gate -- plugin-developer-cli` 完整退出 0；公共 tarball、两种生成模板、包可重复性与 Rust inspector/installer preparation 均通过。Gate 内包含 `workspace-boundaries` 和 `plugin-package-format` 的相同步骤，作为重复边界的等价通过证据；另外已经独立执行并通过 `workspace-boundaries`、`workspace-lifecycle` 与 `ci-plugins`，完整根生命周期未被 focused Gate 替代。最终所有适用检查通过，无未解决的引入警告/错误。安装时已有其他成员使用的 `@testing-library/jest-dom@6.10.0` 弃用提示属于原 lockfile 基线，本插件固定非弃用 6.9.1，未改动其他成员。
- 首轮结论（已被 Host HTTP 扩展重新打开）：Web直连 apply 的实现与确定性验证曾完成；7.6、7.7、7.10 保持未勾选，因为它们明确要求后续同步授权或以同步后的稳定规范为前提。本轮未同步 `openspec/specs/official-translation-plugin/spec.md`、未 archive；此处同步前审计和全部通过的验证不能代替同步后复验。

## 项目级治理与导航审计（同步前）

- 范围与触发：新增维护文档和更新双语索引已触发项目级文档结构/导航审计；未扩展为其他能力或历史变更审计。此记录不代替 7.7 要求的稳定规范同步后变更级审计，归档前必须重新确认。
- inspected paths：`README.md`、`README-zh.md`、`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、`docs/{en,zh}/index.md`、`docs/{en,zh}/development/{project-workflow,plugin-workspace,translation,validation,continuous-integration}.md`、`docs/{en,zh}/plugin-development/index.md`、root `package.json`、`.github/workflows/`、`openspec/specs/`、忽略规则及新增插件源码/测试/构建配置。
- 结论与理由：英文 canonical、同路径中文镜像、根入口职责、公开插件边界和既有生命周期规则均适用且充分，无需修改治理规则。CI/Gate 已按直接成员动态发现；仅生命周期测试的显式成员期望需要添加新成员。当前稳定规范尚无本能力，保留 active delta，不能声称已经同步或归档就绪。
- updated paths：两语言 `development/translation.md`、`index.md`、`development/plugin-workspace.md`、`plugin-development/index.md`、`development/validation.md`；`tests/workspace-lifecycle.test.ts`。`continuous-integration.md` 已准确描述动态发现，无需修改。
- 实际验证：两个现有文档校验器通过；24 对镜像 Markdown 路径及目录分类、82 个本地链接、Translation 双语代码块/外链/章节对应通过；`git diff --check` 通过。扫描 25 个根脚本和 93 个 manifest/workflow/docs/spec 路径，无本 Change 专用命令、直接 Rstest 文件列表脚本、递归 check 或新 dispatcher；无新增根临时目录引用，四种临时目录均被忽略且没有已跟踪临时文件。
- 边界：全部维护验证为确定性 Rstest、Cargo、静态、构建与纯 CLI 检查；没有真实翻译调用、真实凭据、浏览器、WebView、GUI、Launch Services、native harness、截图/像素或目标环境性能验证，未宣称真实账户/网络/OS 复制验收通过。

## Host HTTP 修订证据

- 用户授权：2026-10-22 选择方案二，要求先更新同一 change 的设计/规范/任务，再实施通用受控 Host HTTP；翻译业务和签名仍在插件内。真实 WebView 控制台确认 HTTP200 被 CORS 拦截；无凭据与合成无效凭据探测说明预检通过不保证实际响应可读，不证明用户凭据是否正确。
- 当前修订状态：先完成 H.1，再执行平台契约/原生接线和重新打开的插件/最终验证任务；历史勾选不覆盖新传输验收。稳定规范同步和归档尚未执行。

- H.1 验证：proposal/design/tasks 与八份 delta specs 已先于实施更新；`openspec validate add-translation-plugin --strict --no-interactive` 通过。公网策略、DTO、版本迁移与原生取消路线已交叉核对，开始 H.2–H.6。

- H.3–H.5 与插件传输验证：Rust provider 的 19 项确定性测试和 native dispatcher 的 7 项测试通过，包含公网/特殊地址、DNS pinning/独立 worker 限制、body/header/JSON 预算、期限/并发，以及取消或销毁发生在 HTTP 登记前后的竞态；登记后再次核对可信 current attempt/source/pending request，避免已取消请求仍建立网络。HTTP RPC 有界 margin 保留旧方法 10 秒规则。Host Context、typed SDK 与插件接线测试通过；误入 JS dispatcher 的 HTTP 返回 unavailable。
- 1.2、3.3–3.5、4.4–4.5、5.3、5.5、6.1–6.2：插件改为 SDK HTTP transport，签名仍在插件；真实 SDK/Testkit 证明 HTTP200 且无 CORS 头的 InvalidAccessKey/CodeN 可安全显示鉴权错误，缺能力阻塞/恢复与 Context 仅表现变化均覆盖。插件 9 文件、178 项测试及 typecheck/check/build 通过；公共 CLI validate、两次 pack 字节与 SHA-256、inspect 通过，9 个自包含产物，CSP connect-src none，无浏览器 fetch fallback 或私有原生导入。
- 工作区验证进展：完整 root test/typecheck/check/build 已通过（1380 项测试、141 文件，无跳过）；最终组合 Gate 已通过 HTTP/Contract/SDK/原生桥/包格式阶段，CLI test:pack 的旧 Contract 版本元数据断言需要同步修复后重跑，尚未把整个组合 Gate 记为通过。

- H.2、H.6 契约/文档证据：Contract132、SDK50、Testkit22、CLI65、UI17项测试通过，五个公共包的适用真实 tarball 检查均通过；Contract/SDK/Testkit无DOM消费者、UI单React与SDK隔离、CLI80文件发布闭包通过。现有Generate target现在调用类型及standalone validator拥有者生成器，check:generated无漂移；模板由拥有者脚本同步。版本和旧包上界断言逐项更新，历史binary corpus未改写，使用明确0.2Host基线并另验当前Host不兼容。
- H.6 文档审计：同步11对维护文档和Contract/SDK英文README及仓库内中文镜像，修订文档/SDK/fixture/dispatcher校验器；16页9方法覆盖、24对文档路径、受影响链接/章节/README代码块对应与diff-check通过。明确SDK通用10秒默认、HTTP专用期限、HTTP/1限制、OS DNS不可中断但独立16worker、网络目的地限制与升级旧包流程。
- 7.3 最终原生验证：最终Rust实现 `src-tauri:format:check`、`src-tauri:test`、`src-tauri:check`、`src-tauri:build` 均通过，265项测试，无引入警告/错误；额外 `cargo test --manifest-path src-tauri/Cargo.toml --workspace --features plugin-development-mode` 295项通过，覆盖用户正在使用的开发模式。所有维护验证均为确定性测试或纯CLI，未启动GUI、读取真实凭据或发出真实翻译请求。

- 6.3–6.4、7.1 最终 Gate：已先检查组合 plan，再完整运行 `plugin-host-http plugin-host-api-dispatcher plugin-sdk plugin-sdk-transport plugin-testkit plugin-developer-cli ci-plugins workspace-lifecycle`，全部退出0。47个去重阶段包含公共Contract/SDK/Testkit包、工作区边界、原生dispatcher/RPC、历史包格式、CLI临时consumer与Rust准备、翻译包检查；`ci-plugins` 实际验证2个官方插件并准备5个公共包。CLI旧元数据断言已修复，失败组合整体重跑通过，UI独立test:pack额外通过。
- 7.2、7.4 最终复验：所有修复后重新执行完整根 `test/typecheck/check/build`，全部退出0；1380项测试、141文件，无跳过；最终Rust默认265/开发模式295项及format/check/build通过，最终日志无引入警告/错误。未以focused Gate替代完整生命周期。
- 7.5 最终规范/文档检查：当前change严格校验通过；`openspec validate --all --strict --no-interactive` 43/43通过，仅需求长度提示INFO；受影响双语文档链接、HTTP/Translation可执行代码块对应、24对路径、拥有者文档校验器与 `git diff --check` 通过。说明图和Mermaid标签按语义翻译，不要求英文标签与中文标签逐字节相等。历史package-format/WebView binary corpus和期望文件无变化。

## Host HTTP 扩展后的项目级治理审计（同步前重新确认）

- 触发与范围：新增公共方法/版本、Rust原生执行、双语维护文档、既有Generate增强和稳定HTTP Gate，要求重新审计平台契约、文档及验证入口。只检查本次变化及受影响消费者，不扩大为历史功能审计。
- inspected paths：`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、本change的proposal/design/tasks/八份delta、`packages/plugin-{contract,sdk,testkit,ui,cli}/`、维护plugins/templates/consumers、`src/App.tsx`、Host dispatcher、`src-tauri/src/plugin_http.rs`及native dispatcher/RPC/service/validation、`Cargo.toml/lock`、`scripts/validation/catalog.ts`、相关文档/fixture/SDK检查脚本、root package.json、CI workflows和两语言architecture/development/plugin-development文档。
- 结论与理由：新增HTTP通过通用公开契约实现，翻译业务和签名只在插件；无额外Tauri command、官方私有例外或安全关闭。版本升至HostAPI0.3/Contract0.3/SDK0.4，旧方法与wire0.2/Manifest0.4保持；超出范围的旧包明确不兼容。英文文档canonical与中文镜像同步，根README/AGENTS/config职责无需改变。Generate仍显式写入，Gate只读；根scripts未新增别名。修复主要为类型、版本/peer断言、历史fixture明确基线及原生取消竞态；没有引入新的治理例外。
- updated paths：上述实现/契约/生成物/维护消费者、11对文档、Contract/SDK README及中文镜像、验证目录和校验脚本；未更新稳定规范或归档目录。
- 7.9 扫描与边界：根脚本策略和治理测试通过；最终Gate计划不含GUI、WebView、浏览器、Launch Services、真实API、native交互harness或性能路径；维护代码/文档未新增项目根临时目录依赖、Change专用根命令或旧dispatcher别名。没有真实账号/系统剪贴板/实际WebView联网验收声明。
- 当前结论：Host HTTP实施与本轮全部确定性验证已完成；仅7.6、7.7、7.10保留给后续稳定规范同步、同步后审计及复验。未commit/push/publish/install，未启动或重启用户应用；使用新能力需运行新Host并重新加载插件快照。

## 归档前稳定规范同步与最终审计（2026-10-22）

- 授权与顺序：用户本轮明确要求归档 `add-translation-plugin`，按项目既有约定先同步规范，再完成同步后审计与验证。上文“同步前”记录保留为实施历史；7.6、7.7、7.10 在本轮实际完成后勾选。OpenSpec `spec-driven` 的四项 artifact 均为 done。
- 同步范围：新增 `openspec/specs/official-translation-plugin/spec.md` 与 `openspec/specs/plugin-host-http/spec.md`；更新 `open-isolated-plugin-runtime`、`plugin-contract-package`、`plugin-host-api-contract`、`plugin-host-api-dispatcher`、`plugin-manifest-contract`、`plugin-sdk-foundation` 六份既有规范。共新增 23 项要求、修改 16 项要求，其中一项 SDK 要求改名；39 项 delta 要求、133 个场景均已等价同步，39 个未涉及的既有要求块逐字节保留。旧 SDK 标题已移除、新标题存在，没有删除能力、遗漏场景或残留 delta 操作标题。
- 语言与结构：正文按 `stable_specs: en` 转为英文，保留协议、代码标识、数值及产品本地化字面量。两份新规范使用规范标题和单一 Requirements 区域；新 Purpose 保留已著述含义并按项目语言策略等价英译，不生成 TBD。同步阶段完整保留六份既有标题和 Purpose。后续独立审计发现 `plugin-host-api-contract` Purpose 仍宣称 Host API `0.2.0`，与新要求冲突；依据项目范围内漂移修复规则，仅将该处改为 `0.3.0`。此为显式审计修复，不属于以 delta 覆盖既有 Purpose，其余 Purpose 原文不变。
- inspected paths（实现与契约）：本变更 proposal/design/tasks/八份 delta 与上述八份 stable specs；`plugins/translation/src/{controller,settings}.ts`、`plugins/translation/src/provider/`、Manifest 和测试；公共 Contract/SDK 常量、Schema、生成物与对应测试；`src-tauri/src/{plugin_http,plugin_child_webview_host_dispatcher,plugin_child_webview_rpc,plugin_child_webview_service}.rs`、Cargo 配置；`src/App.tsx` 与 Host dispatcher；公共包、模板和 ConfigLens 兼容声明。抽查确认通用传输属于 Rust、签名与翻译业务属于插件，可信来源、取消竞态、资源上限、旧响应隔离与配置确认语义对应已接受契约。
- inspected paths（文档与治理）：`AGENTS.md`、`docs/AGENTS.md`、`govern-spec.yaml`、`openspec/config.yaml`、根 README 双语版本与 `package.json`、`.github/workflows/`、忽略规则、`scripts/validation/catalog.ts`；`docs/{en,zh}/index.md`、受影响 `architecture/` 文档、`development/{translation,plugin-workspace,plugin-development-mode,validation,project-workflow,continuous-integration}.md`、`plugin-development/{index,host-api,public-packages,compatibility-and-errors,runtime-permissions-security}.md`，以及 Contract/SDK README 和中文镜像。
- 项目级触发与复核：新增 Translation 文档、双语索引和包中文说明已触发导航、目录结构与语言审计。本轮重新核对 canonical ownership、文档归属、双语语义、入口职责、命令与临时目录约束；修复后触发范围未扩大。治理约束已由项目文件完整承载，无需修改规则、生成集成、根命令或 CI。四类项目根临时目录均被忽略，无已跟踪临时文件；命令扫描没有 Change 专用根入口、直接测试文件列表脚本、递归 check、废弃 dispatcher 或临时材料依赖。
- 文档修复与结论：中文 `docs/zh/plugin-development/host-api.md` 的禁用请求头清单漏写 `Cookie2`，已对照英文、HTTP 契约和实现补齐。其余双语内容覆盖平台版本、旧包重建、Host HTTP 与浏览器策略边界、明文凭据、配置恢复、期限、取消及验证限制，无需新增文档。复核 30 份受影响 Markdown 的 120 个本地链接与 14 个锚点全部可解析，两语言全部 24 对文档路径一致；场景英译逐项核对未发现语义遗漏。
- updated paths：本轮写入上述八份 stable specs、中文 Host API 文档和本 `tasks.md`；归档迁移还修正 `design.md` 六个仓库内相对链接的目录深度，不改变设计正文。保留全部既有实现、测试、依赖与其他工作区修改。归档通过整体移动包含 `.openspec.yaml` 的变更目录完成。11 个变更内本地链接已按最终归档位置预演解析，六个指向仓库外层的链接须随迁移增加一层 `../`，其余五个内部链接保持不变。
- 实际规范与文档验证：`openspec validate --specs --strict --no-interactive` 44/44 通过；`openspec validate --all --strict --no-interactive` 45/45 通过；当前 change 严格校验通过。输出仅含长要求 INFO 及已同步 ADDED 要求重复的 archive-preview INFO；同步后的归档仅移动目录，不再次应用 delta。`openspec schemas --json` 确认 `spec-driven` 可用。`node scripts/check-plugin-contract-docs.ts` 与 `node scripts/check-plugin-development-documentation-docs.ts` 在修复后重新通过（24 对文档；16 页、5 个公共包、9 个 Host API 方法），链接/镜像/场景完整性检查和 `git diff --check` 通过。
- 实际实现复验与既有证据：本轮 Rust `cargo test --manifest-path src-tauri/Cargo.toml --workspace plugin_http::tests` 19/19 通过，`cargo test --manifest-path src-tauri/Cargo.toml --workspace plugin_child_webview_host_dispatcher::tests::http_` 2/2 通过，Translation 目录 `node_modules/.bin/rstest run` 9 文件、178/178 通过，无跳过。`pnpm --dir plugins/translation run test` 初次在进入测试前遇到执行环境 `unable to open database file`，上述直接 Rstest 调用执行其相同 package script；不将初次命令记为通过。根 `pnpm run check` 同样先遇到环境数据库访问问题，允许访问机器既有缓存后原命令重跑通过，没有更改 store、全局配置或根依赖拓扑。
- 验证边界与就绪结论：复核上文最终实施证据的完整 root 1380 项测试/141 文件、Rust 默认 265 项和开发模式 295 项、47 个去重 Gate 阶段以及完整格式/类型/静态/构建结果。本轮只修改规格、文档与归档证据，不重复全量构建；额外轻量复验及全工作区 check 已通过。`plugin-host-http --plan` 的 4 个 Gate、25 个阶段均为只读确定性检查。没有未解决的范围内实现、文档或治理阻塞；未运行真实账户翻译、真实 WebView 网络或 OS 复制验收，未提交、推送、发布或安装。
