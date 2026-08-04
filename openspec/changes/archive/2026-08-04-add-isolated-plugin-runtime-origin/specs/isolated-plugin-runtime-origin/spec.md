## ADDED Requirements

### Requirement: Every current resource generation MUST receive a distinct browser origin

系统 MUST 为每个 current `(entry_id, resource_generation)` 使用 OS-CSPRNG产生至少128-bit、process-local、不可猜测的scope，并使其Runtime document browser origin与Host、其他plugin scope和旧generation不同。相同generation重复resolve MUST复用同一scope与origin；scope MUST NOT被持久化、单独返回、写入event/log或加入public contract。origin authority与URL path MUST包含同一scope并进行精确交叉验证。

#### Scenario: Resolve the same current generation twice

- **WHEN** trusted Host在registration与resource generation未变化时重复resolve同一entry
- **THEN**两次结果使用相同opaque `entry_url`、scope与browser origin
- **THEN**unrelated plugin revision变化不撤销该current origin

#### Scenario: Resolve two different plugin identities

- **WHEN**两个eligible plugins各自resolve current entry
- **THEN**它们获得不同browser origins，即使version、entry filename或作者内容相同
- **THEN**任何一个plugin都不能通过猜测另一个plugin ID/path获得相同origin authority

#### Scenario: Replace the current resource generation

- **WHEN**disable/re-enable、replacement、reinstall、uninstall/recovery或process restart产生新的resource generation
- **THEN**旧scope、origin和URL失效，新generation获得不同origin
- **THEN**旧URL不能返回新payload或成为新Runtime的current authority

### Requirement: Isolated origin URLs MUST use one strict Host-owned grammar

Runtime resource URL MUST使用fixed-version Host-owned envelope。native custom-protocol shape MUST将精确32位lowercase hexadecimal scope置于独立authority，并在path中重复同一scope；supported translated form MUST保留该origin key并形成不同authority，而不能折叠为共享 `lensx-plugin.localhost`。parser MUST拒绝shared host、origin/path scope mismatch、unknown/extra label、Unicode/punycode、uppercase scope、userinfo、port、query、fragment、backslash、percent/double encoding ambiguity与unknown scheme。Manifest、plugin code和frontend caller MUST NOT选择或构造origin。

#### Scenario: Parse a canonical isolated URL

- **WHEN**URL使用approved native或translated scheme class、canonical isolated authority、matching path scope、Host-derived plugin key/version与valid package path
- **THEN**Host解析出唯一canonical resource tuple并继续current authorization
- **THEN**native/translated equivalent规范化到相同identity而不丢失origin scope

#### Scenario: Reject a shared or mismatched authority

- **WHEN**URL使用旧共享host、authority scope与path scope不同、另一个generation authority或ambiguous encoded form
- **THEN**Resource Contract、handler与navigation normalizer全部fail closed
- **THEN**系统不通过修复、解码、重写或fallback把输入转成allowed target

### Requirement: Isolated origin MUST enable the representative module graph without CORS relaxation

目标macOS WKWebView MUST在后续iframe固定的 `sandbox="allow-scripts allow-same-origin"` 下，从current isolated origin加载canonical package HTML、CSS、image、classic script、ES Module entry与module dependencies。Resource responses MUST保持`Cache-Control: no-store`与`X-Content-Type-Options: nosniff`，MUST NOT添加wildcard `Access-Control-Allow-Origin`、允许`Origin: null`或把request Origin当作authorization。classic-only、inlined-only或删除module case MUST NOT满足完成条件。

#### Scenario: Load a same-origin module dependency graph

- **WHEN**normal canonical `.lxp` document在current isolated origin导入entry module及至少一个package-relative dependency
- **THEN**WKWebView执行完整module graph，所有resource requests绑定同一current origin/scope/generation
- **THEN**验证不依赖wildcard/null CORS、network fallback或inlined dependency

#### Scenario: Module graph fails on the target WebView

- **WHEN**document仍为opaque/shared origin、module dependency未请求或执行失败，或成功需要放宽CORS
- **THEN**capability不得宣称完成且production iframe保持阻塞
- **THEN**团队必须更新OpenSpec origin mechanism，而不能降级public bundle contract

### Requirement: Same-origin browser state MUST remain partitioned from Host and other generations

current plugin document MAY使用自身isolated origin的ordinary browser storage，但 MUST NOT读取或修改Host、另一个plugin、另一个scope或旧generation的DOM/storage。即使下游iframe使用`allow-same-origin`，plugin MUST不能访问`window.parent` DOM、`frameElement`或Host React state。隔离 MUST由browser origin与Host bootstrap boundary执行，不依赖plugin作者添加key prefix、避免API或自报identity。

#### Scenario: Two plugins write the same storage key

- **WHEN**plugin A与plugin B在各自current origin写入同名local/session storage key
- **THEN**每个plugin只能读回自身值且不能观察Host值
- **THEN**storage isolation不依赖作者namespace convention

#### Scenario: A replacement attempts to inherit old state

- **WHEN**new resource generation使用新origin启动并查询old generation写入的state
- **THEN**new generation不能把old partition作为current authority读取或覆盖
- **THEN**old document与URL也不能访问new generation resources

#### Scenario: Plugin attempts parent access

- **WHEN**plugin读取或修改`window.parent` document、`frameElement`、Host storage或React-owned DOM
- **THEN**browser same-origin boundary在Host state变化前稳定拒绝
- **THEN**origin isolation不以DOM cleanup或作者合作作为证据

### Requirement: Trusted Tauri and Host-private boundaries MUST remain absent from the plugin origin

独立origin MUST NOT改变main-only Tauri initialization guarantee。Host main frame MUST保持既有Tauri bootstrap与trusted invoke；任何plugin descendant MUST在最早author script前缺少`isTauri`、`__TAURI_INTERNALS__`、metadata、invoke key与IPC bootstrap，代表性invoke MUST NOT到达Rust handler。Origin/scope、URL parser、Resource adapter、navigation lease与harness internals MUST保持Host-private，不能进入Manifest、public packages、plugin messages或bounded diagnostics。

#### Scenario: Normal and malicious descendants inspect Tauri

- **WHEN**normal或malicious plugin document在isolated origin最早脚本阶段检查Tauri surfaces并尝试representative invoke
- **THEN**所有surfaces不存在或不可用，privileged handler hit count保持为零
- **THEN**Host main frame trusted invoke仍正常工作

#### Scenario: Public boundary is inspected

- **WHEN**workspace gate检查Contract、SDK、UI、Testkit、官方/示例/外部plugins
- **THEN**它们不能import origin issuer/parser、scope map、Resource adapter、navigation target或WebView harness internals
- **THEN**本capability不新增public Runtime/session/Host API export

### Requirement: Delivery MUST use real macOS WKWebView evidence and preserve the Runtime-free product state

交付 MUST在真实macOS WKWebView中验证canonical normal/malicious `.lxp`、isolated origin serialization、module graph、storage partition、parent/frameElement/Tauri absence、host/path mismatch、cross-plugin/old-generation resource与navigation rejection、lifecycle revocation和no-CORS behavior。evidence MUST记录bounded macOS、WKWebView engine/version、Tauri/Wry revision与bundle shape，MUST NOT记录raw URL、scope/origin token、invoke key、payload、本机路径或storage value。DOM simulation、unit tests和dependency source inspection MUST NOT替代real evidence。本capability MUST保持production policy idle、Plugin Page placeholder与所有UI/locale/theme/focus行为不变，且 MUST NOT声明Windows/Linux支持。

#### Scenario: Dedicated macOS gate passes

- **WHEN**`check:isolated-plugin-runtime-origin`在目标macOS WKWebView执行完整matrix
- **THEN**module/origin/storage/parent/Tauri/resource/navigation/lifecycle断言全部通过且evidence符合bounded schema
- **THEN**后续iframe Runtime可以消费该entry URL contract，但本capability本身不创建iframe或执行production plugin UI

#### Scenario: Any security invariant cannot be proven

- **WHEN**目标WebView不能形成isolated non-opaque origin、不能加载module graph、泄露parent/Tauri/storage，或old/cross target仍可访问
- **THEN**capability保持未完成且现有Host-owned placeholder继续显示
- **THEN**团队先更新origin或platform design，不得删除negative case、放宽CORS或误报blocked evidence
