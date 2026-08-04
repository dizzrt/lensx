## 1. macOS isolated-origin 可行性门禁

- [x] 1.1 接管并收敛现有normal/malicious canonical `.lxp` fixtures与WKWebView harness，增加至少两个plugin scopes和一个replacement generation，覆盖HTML/CSS/image/classic script/ES Module dependency、same-key storage、parent/frameElement/Tauri、host/path mismatch、cross-origin resource/navigation、popup/download/form与危险scheme；fixtures只依赖正式package contract和test code。
- [x] 1.2 在不进入production composition的真实macOS WKWebView中验证candidate `lensx-plugin://<scope>.runtime.localhost/...` authority，固定下游预期 `sandbox="allow-scripts allow-same-origin"`、`no-referrer`与deny-by-default Permissions Policy，记录document origin serialization、module request/execution、storage partitions、parent/Tauri absence与handler hit count。
- [x] 1.3 根据1.2关闭design Open Questions：只有authority形成stable non-opaque isolated origin、完整ES Module graph不依赖wildcard/null CORS、Host/other-plugin/old-generation storage与parent/Tauri稳定隔离时才继续；否则停止、保持placeholder并先更新proposal/design/spec/tasks，禁止shared-origin、classic-only/inlined-only或删除negative case绕过。

## 2. Host-private origin与Resource Contract

- [x] 2.1 在Rust Resource Service中定义唯一canonical isolated-origin grammar和internal tuple，复用现有32位lowercase hex scope作为origin/path key；拒绝shared host、extra/Unicode/punycode/uppercase label、userinfo、port、query、fragment、encoding ambiguity与origin/path mismatch，并增加property/table tests。
- [x] 2.2 更新scope URL issuer，使同一 `(entry_id, resource_generation)` 幂等返回同一isolated-origin `entry_url`，不同plugin/generation返回不同authority；不新增second token、persisted field、event/log field或standalone origin/scope output。
- [x] 2.3 更新Rust `PluginResourceEntry` contract validator与TypeScript Resource Contract parser/adapter，精确接受approved native/translated isolated shape并拒绝old shared/unknown/mismatched URL，同时保持request/result字段集合、frozen clone、bounded error和public package boundary不变。
- [x] 2.4 为invalid contract version/type、unknown field、plugin-provided origin/scope、shared host、host/path mismatch、translated origin-key loss、stale revision和identity mismatch增加fail-closed cross-language contract tests；不得回退到Manifest path、旧URL或frontend拼接。

## 3. Resource handler与lifecycle enforcement

- [x] 3.1 更新Resource handler URL envelope parsing，在scope map/filesystem访问前精确交叉验证scheme class、origin scope、path scope、plugin key、version与resource path；保留canonical containment、no-symlink、regular-file、post-open identity、64 MiB与path/MIME规则。
- [x] 3.2 增加current relative HTML/JS module/CSS/image/font/JSON/Wasm GET/HEAD success tests，以及shared/unknown/expired origin、host/path mismatch、another plugin/generation、traversal/encoding、metadata/directory、race与unknown MIME fixed failure tests。
- [x] 3.3 保持successful/error `Cache-Control: no-store`、`nosniff`、fixed 404/405/500与safe headers；增加negative tests证明无wildcard `Access-Control-Allow-Origin`、无`Origin: null`特殊授权、无content negotiation/range/download或information oracle。
- [x] 3.4 回归disable/re-enable、replacement/reinstall、uninstall、quarantine/incompatible recovery与restart使old scope/origin失效，failed/cancelled lifecycle保留original current generation，unrelated plugin revision不撤销current origin；验证pending physical cleanup不影响logical revocation。
- [x] 3.5 审计bounded errors、logs与evidence schema，拒绝raw URL、origin/scope、plugin identity、entry/revision/digest、payload/system path、native error、file/storage content与unknown fields。

## 4. Frame-aware isolated target normalization

- [x] 4.1 扩展frame-aware canonical document parser以比较scheme class、origin/path scope、plugin key、version、resource path与Host-derived fragment；native/translated equivalent必须保留同一origin key，old shared host与translation loss fail closed。
- [x] 4.2 增加exact current isolated target allow tests，以及shared/other origin/scope/plugin/version/generation、old lease、query/userinfo/port、case/Unicode/punycode/encoding、extra fragment、Host/external/dangerous scheme deny tests；normalization不得repair或fallback。
- [x] 4.3 回归active target epoch activate/replace/compare-current dispose/idle semantics、main/descendant disjoint allowlists、popup/new-window/download denial和bounded diagnostics，确保origin migration不改变pre-commit policy或放宽main frame。
- [x] 4.4 回归ordinary package subresource不被当作document authorization且继续由Resource Service验证current origin/scope/generation/path/MIME；shared/old origin即使path有效也不能成为active document。
- [x] 4.5 更新frame-aware native WKWebView harness与dependency drift gate，证明candidate isolated native URL进入真实descendant callback并按exact target allow/deny；保留main-only Tauri bootstrap、descendant invoke zero-hit与既有17类navigation/new-window/download evidence边界。

## 5. 专用真实包、安全与回归门禁

- [x] 5.1 将通过1.2的authority形态接入真实Resource Service路径，验证normal `.lxp`完整module/resource graph、current storage与Host-derived route，以及malicious `.lxp`的parent/frameElement/Tauri/cross-plugin/old-generation resource-storage-navigation尝试全部稳定失败。
- [x] 5.2 增加root `check:isolated-plugin-runtime-origin`，组合fixture generation/inspection、Resource Contract/handler/lifecycle tests、frame-aware tests、workspace boundary、production-placeholder regressions、necessary Rust tests与real WKWebView harness；non-interactive/CI输出必须deterministic且fail closed。
- [x] 5.3 保存并校验bounded committed macOS evidence，包含macOS、WKWebView engine/version、Tauri/Wry revision、bundle shape与case结果，不包含raw URL、origin/scope、invoke key/payload、local path或storage value；DOM simulation/unit/source inspection不得替代real result。
- [x] 5.4 回归Host main frame trusted bootstrap/invoke继续工作、descendant最早author script缺少全部Tauri surfaces且representative handler zero-hit；不得通过全局删除Tauri initialization获得negative result。
- [x] 5.5 扩展workspace boundary gate，证明Contract、SDK、UI、Testkit、官方/示例/外部plugins不能import origin issuer/parser、scope map、Resource adapter、navigation target、dependency patch或harness internals；Manifest/public package declarations不新增origin/session/API字段。
- [x] 5.6 增加App shell/Plugin Page regression，证明production policy保持idle、`PluginPagePlaceholder`仍渲染、`App.tsx`不创建iframe，Home/Search/Host Page、shared close、locale/theme、query/selection与focus restoration不变。

## 6. 文档、依赖与下游对齐

- [x] 6.1 按`docs/AGENTS.md`更新canonical English `docs/en/architecture/extension-platform.md`及相关development/validation docs，并同步相同路径`docs/zh`镜像；记录isolated authority、host/path binding、no-CORS、lifecycle、macOS evidence与shared-host migration。
- [x] 6.2 更新文档中的current capability list和`pnpm run check:isolated-plugin-runtime-origin`，明确本change不创建production iframe、不执行plugin UI、不交付Session/Host API/permissions/complete CSP，也不宣称Windows/Linux支持。
- [x] 6.3 复核`add-isolated-plugin-iframe-runtime` proposal/design/spec/tasks只消费本change验证后的isolated `entry_url`与`allow-scripts allow-same-origin`，没有shared-origin、opaque classic-only或wildcard/null CORS fallback；不得勾选其Task 4.2 completion。
- [x] 6.4 更新`plugin-roadmap.md`中Task 4.2 dependency，使`add-frame-aware-webview-navigation-policy -> add-isolated-plugin-runtime-origin -> add-isolated-plugin-iframe-runtime`顺序、scope与completion criteria一致；只标记本change实际完成项，不提前完成下游Task。
- [x] 6.5 检查README、AGENTS、Manifest schema与public package declarations不承载concrete origin design；本change不新增runtime dependency/component library，若实现需要改变vendor Tauri/Wry patch则记录exact revision、upstream rationale、drift ownership与rollback。

## 7. 最终验证

- [x] 7.1 运行`pnpm run check:isolated-plugin-runtime-origin`，修复fixture、real package、Resource/origin/navigation/WebView/security、workspace boundary与production-placeholder gate的所有warning/error，并重新运行至通过。
- [x] 7.2 顺序运行完整frontend tests `pnpm run test`，修复本change引入的所有failure/warning后重新运行至通过。
- [x] 7.3 运行frontend format/static check `pnpm run check`，修复Biome、workspace boundary和member check问题后重新运行至通过。
- [x] 7.4 运行`pnpm run typecheck`与`pnpm run build`，修复所有error/warning并重新运行两项至通过。
- [x] 7.5 运行`pnpm run src-tauri:format:check`；如需格式化，运行`pnpm run src-tauri:format`后重新检查至通过。
- [x] 7.6 顺序运行`pnpm run src-tauri:test`与`pnpm run src-tauri:check`，修复本change引入的所有error/warning并重新运行至通过。
- [x] 7.7 运行`openspec validate add-frame-aware-webview-navigation-policy --type change`、`openspec validate add-isolated-plugin-runtime-origin --type change`与`openspec validate add-isolated-plugin-iframe-runtime --type change`，直接统计三份tasks checkbox，并复核artifacts、source/tests、英中文档、dependency revision与real macOS evidence一致；任何origin/module/storage/parent/Tauri/lifecycle假设未验证都阻止完成声明。
- [x] 7.8 只有7.1–7.7全部通过且本capability completion standard有真实证据后，才标记本change/roadmap对应前置任务完成；随后重新运行`pnpm run check`与三项OpenSpec validation，确认docs/roadmap/change仍一致，production iframe仍未启用。
