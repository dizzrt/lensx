## 1. 建立首个官方产品成员

- [x] 1.1 使用当前 React/Semi 模板边界创建 `plugins/official/config-lens`，固定 package `@lensx/official-config-lens`、plugin `dev.lensx.config-lens`、版本、Node/pnpm engines、`private: true`、独立 `CHANGELOG.md` 和有意义的 `build`、`typecheck`、`test`、`check`、`test:e2e`、`visual` scripts。
- [x] 1.2 创建 Contract `0.2.0` Manifest，只贡献 `main` Page、指向它的 `open` Action 和默认 Launcher Action；补齐 `en-US`/`zh-CN` display、搜索关键词与 Publisher，确保两种语言的品牌均为 `ConfigLens`。
- [x] 1.3 为 ConfigLens 添加准确的 `.github/CODEOWNERS` 目录条目和首个 Changeset，更新 workspace lockfile，并扩展边界测试拒绝 Host/Tauri/private deep import、跨插件源码、workspace/file/link 依赖和身份/版本漂移。
- [x] 1.4 建立最小 SDK lifecycle 与 `PluginUiProvider` Page，覆盖 loading、ready、safe error、explicit retry、完整 context replacement 和幂等 cleanup，先用 Contract 与 Testkit 测试证明它是普通外部插件消费者。

## 2. 审查编辑器、语言引擎和目标 WebView

- [x] 2.1 对 `monaco-editor` 和 JSON、YAML、TOML、XML 候选解析/格式化依赖执行准确版本、许可证、维护状态、ESM/browser/Node 24、CSP/无 `eval`、WASM（若有）和供应链审查，将选择依据与拒绝项写入英文维护文档及中文镜像后固定版本。
- [x] 2.2 建立最小 Rsbuild/Monaco/静态 module Worker spike，证明 custom-protocol iframe 中 editor Worker、language Worker、按语言动态 import 和全部 package-owned chunks 可从自包含 `dist/` 加载，且构建不使用 CDN、远程 script、运行时包解析或 sourcemap。
- [x] 2.3 在真实 macOS WKWebView 中以正常与恶意样本验证 2 MiB、100,000 行、最多 200 diagnostics、五秒 deadline、Worker terminate/recreate、四语言最小 parse 和 Launcher 响应；将不含输入、URL、origin、path、nonce、Port 或 raw error 的有界证据接入 drift check。
- [x] 2.4 记录并自动检查 Monaco、各 language chunk、CSS、Worker 和完整 `.lxp` 的明确体积预算与首次加载事实；如果既定产品合同无法满足，暂停实施并更新本 change，不通过隐藏 chunk、远程加载或取消语言范围规避。

## 3. 实现 Worker 协议与通用语言边界

- [x] 3.1 实现 locale-neutral `LanguageId`、operation、request/result、`SafeDiagnostic` 和 `LanguageAdapter` 类型与双端 runtime validation，限制诊断数量和参数并拒绝完整输入、路径、raw error、stack 与依赖内部对象泄漏。
- [x] 3.2 实现 2 MiB UTF-8/100,000 行预检、generation controller、validation debounce、显式 operation、五秒 deadline、late-result rejection 和新请求/语言切换/timeout/teardown 时的 Worker 终止重建。
- [x] 3.3 实现包内 language Worker 路由和按语言动态 import，建立 valid、invalid、unsupported、limit、internal-error 的统一安全失败语义及 Monaco UTF-16 range 转换。
- [x] 3.4 添加协议畸形、Worker crash/timeout、并发 supersede、200 条截断、Unicode offset、输入上限边界和恢复测试，证明重型解析不在主线程执行且旧 generation 不能更新新页面。

## 4. 实现 JSON adapter

- [x] 4.1 实现严格 JSON token/CST 校验、格式化和 JSON-only 压缩，不以 `JSON.parse`/`JSON.stringify` 作为唯一转换路径。
- [x] 4.2 实现忽略非语义空白后的 token 序列保真复验，覆盖超大整数、指数/负零、属性顺序、重复属性、Unicode/转义字符串、深层容器、空值和换行风格。
- [x] 4.3 添加 JSON golden corpus 与错误定位测试，证明 Format/Compact 只改变许可空白、invalid 输入无输出且修正后可在新 generation 恢复。

## 5. 实现 YAML 1.2 adapter

- [x] 5.1 实现 YAML 1.2 parse/validate/format，配置明确的 alias、collection depth、recursion 和诊断上限，禁止远程 tag/resource 解析并不提供 Compact。
- [x] 5.2 实现 document count、directive、comment、anchor/alias、tag、map/sequence order 和 scalar semantics 的格式前后保真复验。
- [x] 5.3 添加 YAML golden 与恶意 corpus，覆盖多文档、block/flow、quoted/folded/literal scalar、merge/alias、custom tag、重复/无效结构、alias bomb、深层输入和安全恢复。

## 6. 实现 TOML 1.0 adapter

- [x] 6.1 实现 TOML 1.0 parse/validate/format，保留 comment、key/table order 并明确禁止 Compact。
- [x] 6.2 实现 TOML-specific semantic fingerprint 和 comment/order inventory 复验，覆盖 dotted key、table/array-of-table、字符串、整数/浮点、boolean、array、inline table 和各类 date/time。
- [x] 6.3 添加 TOML golden 与错误 corpus，覆盖 duplicate declaration、type conflict、invalid key/value、边界数字/日期时间、深层 table 和 formatter fidelity rejection/recovery。

## 7. 实现 XML 1.0 adapter

- [x] 7.1 实现不解析外部实体的 XML 1.0 token/stream validation 与保守 formatter，只在 element-only 结构边界加入缩进并不提供 Compact。
- [x] 7.2 实现 declaration、namespace、attribute/element/text/CDATA/comment/PI 顺序和 mixed-content whitespace 的格式前后复验。
- [x] 7.3 添加 XML golden 与恶意 corpus，覆盖 namespace、mixed content、CDATA、comment、PI、malformed nesting/attribute，以及 DOCTYPE、entity、XInclude、external reference 必须 unsupported、零网络访问且可恢复。

## 8. 完成 Monaco 与 Semi 产品界面

- [x] 8.1 将产品界面收敛为显式 JSON/YAML/TOML/XML Select、Format、JSON-only Compact、状态摘要和诊断列表；移除 Apply result、语言检测/建议及全部变更比较入口，空输入禁用操作。
- [x] 8.2 将 Monaco input/preview models 与 Diff Editor 改为单一可编辑 model 和 standalone editor，保留 selected-language highlighting、markers、resize，并让成功 Format/Compact 通过一次 `pushEditOperations` 直接且可撤销地替换全文。
- [x] 8.3 简化操作状态：仅当 source、language、Runtime context 与 current generation 仍匹配时写回；invalid/unsupported/limit/timeout/malformed/superseded 结果保持当前内容，late Worker response 不得替换新内容。
- [x] 8.4 使用 Semi Design、Plugin UI、UnoCSS 和 Less 更新 `en-US` 默认及语义一致 `zh-CN` catalog、light/dark、650×600 单编辑器布局、长文案、非颜色状态、live region、visible focus、可访问名称和可见按钮配套的 `Ctrl/Cmd+Enter`。
- [x] 8.5 更新统一幂等 teardown，释放 SDK subscription/client、单一 Monaco editor/model/markers、ResizeObserver、listeners、timers 和全部 Workers；继续禁止 fetch/WebSocket、localStorage/IndexedDB、内容日志、Host persistence/clipboard 和程序化 Copy 行为。

## 9. 建立插件级自动化证据

- [x] 9.1 更新 Contract、SDK 和 Testkit 组件/集成测试，覆盖 Action/Page manifest、SDK lifecycle、完整 locale/theme replacement、单编辑器输入、直接替换、单步 undo、操作失效保护、无 preview/diff/apply/语言建议、诊断与 keyboard/focus 行为。
- [x] 9.2 更新固定 650×600 的 `en-US`/`zh-CN` × light/dark 自动截图与 computed-style gate，覆盖 empty、valid formatted editor、invalid、limit、long text、focus 和 recovery；移除 preview 与 suggestion 场景且不添加人工 UI replay 任务。
- [x] 9.3 更新 package `test:e2e`，从 build output 验证自包含 Manifest、单 Monaco/Worker/module chunk closure、无 preview/diff/apply 与远程/CDN/Host-private 引用、直接替换操作 smoke 和 teardown，并使 package-local `build/typecheck/test/check/test:e2e/visual` 全部通过。
- [x] 9.4 重跑并修正根级 `check:official-config-lens-plugin`，顺序验证成员 lifecycle、四语言 corpus、dependency/bundle drift、更新后的 visual、package repeated-pack/inspect、目标 WKWebView evidence 和无用户内容泄漏检查。

## 10. 接入真实官方候选与完整 Host 生命周期

- [x] 10.1 扩展官方 release contract/planner/Changeset/文档门禁的零/一/二成员测试，使 ConfigLens-local path 只选择自身，共享边界选择所有真实成员但不产生隐式 bump，并保留零成员 no-op 与临时双成员独立性。
- [x] 10.2 更新并重跑候选 gate，使 ConfigLens 的单编辑器产物通过 lifecycle、CLI build/validate/two packs/inspect、TypeScript/Rust facts agreement、普通 local-install preparation 和同一 digest-fixed `.lxp` Runtime/E2E，禁止 fixture-only success 掩盖真实成员失败。
- [x] 10.3 更新真实 macOS WKWebView 自动 E2E，覆盖安装、Launcher 搜索、Action 打开、SDK ready、单 Monaco 与包内 Workers、四语言直接替换最小操作、关闭/重开新 generation、禁用和卸载后旧上下文不可恢复。
- [x] 10.4 扩展 ordinary replacement 自动 E2E，使用两个独立 ConfigLens 版本证明升级终止旧 iframe/Worker/Session、加载新资源且不恢复内存输入；验证官方身份、sidecar 和仓库路径不改变安装或 Runtime authority。
- [x] 10.5 修复通用 Host Page/Runtime 组合：为 active owner/Page、route、availability 与 retry 建立稳定执行语义，保留 `PageRegistry` immutable clone 和 launcher activation facts refresh；语义等价 resolution 不得 cleanup/re-resolve 当前 Runtime，全局 Registration revision 只触发 revalidation，真实 route/availability、当前插件 identity/resource generation 或 lifecycle 变化仍 fail closed。
- [x] 10.6 添加跨层 React 回归，证明插件 Page ready 后发生语义等价 Page refresh/快捷键 activation 时复用同一 iframe DOM node、Runtime attempt、navigation lease 与 Session，ConfigLens 内存输入保持；同时证明真正 close/reopen 仍创建新 generation 并清空旧内容，且测试不以浏览器或 Host 持久化伪造连续性。

## 11. 更新双语维护文档与 Roadmap

- [x] 11.1 更新 canonical English 官方发布、workspace、validation 与插件开发 hub/相关参考，说明 ConfigLens 的单编辑器、四语言 Format、JSON-only Compact、Monaco/Worker、自包含安装、临时内容和非特权官方来源，并维护路径一致的 Simplified Chinese 镜像与双语 indexes。
- [x] 11.2 扩展文档 drift gate，除既有越界描述外拒绝 preview-first、Diff、Apply result、语言建议等旧 ConfigLens 交互，并验证直接且可撤销的单编辑器语义。
- [x] 11.3 在修复验证期间撤回 `plugin-roadmap.md` Task 7.2 checkbox；只有代码、真实 WKWebView、官方候选、双语文档和完整最终验证均通过后，才恢复已验证的 ConfigLens 状态并同步受其影响的 Task 7.3/后续依赖措辞。
- [x] 11.4 更新 canonical English ConfigLens/Runtime 生命周期说明及相同路径 Simplified Chinese 镜像，明确单编辑器直接替换、单步 undo、Launcher hide/restore 不关闭当前 Page、实际 close 仍丢弃临时输入；继续禁止用 localStorage、IndexedDB 或 Host persistence 实现连续性。

## 12. 聚焦验证与修复闭环

- [x] 12.1 运行 `pnpm --dir plugins/official/config-lens run build`、`typecheck`、`test`、`check`、`test:e2e`、`visual` 和 `pnpm run check:official-config-lens-plugin`，修复全部 warning/error 后重跑失败命令与本组命令。
- [x] 12.2 运行 `pnpm run check:official-plugin-release-pipeline`、`check:plugin-developer-cli`、`check:plugin-project-template`、`check:plugin-package-format` 和 `check:workspace-boundaries`，证明更新后的真实成员、公开 consumer、确定性打包与依赖边界。
- [x] 12.3 运行 `pnpm run check:local-plugin-installation`、`check:plugin-action-projection`、`check:plugin-lifecycle-controls`、`check:plugin-upgrade-and-rollback`、`check:plugin-runtime-session` 和 `check:open-isolated-plugin-runtime`，证明普通安装、搜索/打开、关闭、禁用、升级、卸载和隔离 teardown。
- [x] 12.4 运行 `pnpm run check:plugin-development-documentation` 与更新后的双语/状态 drift 检查；确认英文 canonical 文档与相同路径中文镜像语义一致且没有把 Task 7.3、签名、Marketplace、自动更新或 native permission 描述为已交付。

## 13. 最终完整验证

- [x] 13.1 运行前端与 workspace 全集 `pnpm run test`、`pnpm run format`、`pnpm run check`、`pnpm run typecheck` 和 `pnpm run build`；检查格式化 diff，修复所有引入的 warning/error，并重跑失败命令和完整五项。
- [x] 13.2 运行 Rust 全集 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`；即使没有新增公开 Rust API，也必须验证 ConfigLens 使用的 inspector、installer、replacement、Runtime 与 lifecycle 路径。
- [x] 13.3 运行 `openspec validate add-official-config-lens-plugin --type change`、仓库严格 OpenSpec/文档验证和 `git diff --check`，核对全部 specs/scenarios、单编辑器直接替换、Launcher hide/restore 连续性、实际 teardown、依赖审查记录、自动证据与 Task 7.2 完成标准均无缺口。
- [x] 13.4 在 Roadmap 或任何最终修复后重新运行 12.1–12.4 与 13.1–13.3 的完整集合；只有全部成功且无未验证假设时才恢复 Task 7.2 勾选，任何失败都必须撤销完成声明并在修复后从失败命令及完整最终集合重新验证。

## 14. 收敛编辑器优先布局

- [x] 14.1 移除 iframe 工作区内重复的可见主标题与副标题，同时保留可访问 main/region 名称；将单一 Monaco 编辑器调整到语言 Select、Format 与 Compact 控件之前，并保持状态、诊断、键盘和 locale/theme 行为不变。
- [x] 14.2 更新组件测试，自动证明工作区不渲染重复 heading/副标题，Monaco surface 在 DOM 与视觉顺序上先于语言及操作控件，且显式语言选择、按钮禁用和 `Ctrl/Cmd+Enter` 行为继续成立。
- [x] 14.3 更新 650×600 双语双主题视觉 fixture、computed-style/layout 断言和全部 28 张基线，并同步 canonical English ConfigLens 文档及相同路径中文镜像的编辑器优先布局说明。
- [x] 14.4 运行 ConfigLens package `format`（若定义）、`build`、`typecheck`、`test`、`check`、`test:e2e`、`visual` 与根级 `check:official-config-lens-plugin`，修复全部 warning/error 后重跑失败命令及本组完整集合。
- [x] 14.5 按 13.4 重跑 12.1–12.4 与 13.1–13.3 的完整最终集合、严格 change/repository OpenSpec validation 和 `git diff --check`；只有全部通过后才恢复 Roadmap Task 7.2 与本 change 的完成声明。
