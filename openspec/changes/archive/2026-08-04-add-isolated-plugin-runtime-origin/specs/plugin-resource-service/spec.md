## MODIFIED Requirements

### Requirement: The Host MUST resolve the current plugin entry URL through an independent private contract

系统 MUST 提供独立版本化的Host-private Plugin Resource Contract，并且只允许trusted lensX root application通过`resolve_plugin_resource_entry`查询plugin entry URL。request MUST精确包含`contract_version`、`entry_id`与`expected_revision`；caller MUST NOT提交或接收installation path、package digest、record key、file handle、package bytes、origin、scope、generation或Manager object。successful result MUST精确包含contract version、entry ID、current revision、Host-resolved plugin ID/version与一个opaque isolated-origin `entry_url`。Rust与TypeScript MUST严格校验untrusted boundary request/result/error，并拒绝shared-host、unknown或host/path scope不匹配的URL。该contract MUST NOT成为Manifest、public plugin packages、iframe Runtime或其他plugins可以import/invoke的capability。

#### Scenario: The trusted application resolves the current entry

- **WHEN**trusted root application以valid contract version、current entry ID与current Registration revision查询eligible plugin
- **THEN**Host从current registration normalized `runtime.entry`派生scope-bound isolated-origin entry URL
- **THEN**result不包含standalone origin/scope/generation、installation path、digest、record key、file content或mutable Host object

#### Scenario: A request attempts to submit Host-private facts

- **WHEN**request包含path、plugin ID、version、digest、origin、scope、generation、unknown field或错误contract version/type
- **THEN**完整request以stable `invalid_request`失败
- **THEN**系统不发行scope、不读取文件且不改变Manager、Registry或revision

#### Scenario: Public plugin code attempts to use the resource query boundary

- **WHEN**workspace boundary gate检查Manifest、official/external plugins或`@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-ui`、`@lensx/plugin-testkit`
- **THEN**这些consumer不能import Resource Contract、desktop adapter、Tauri command wrapper、origin validator或Host-private implementation
- **THEN**entry URL query仍仅对trusted lensX application boundary可用

### Requirement: Resource scopes MUST be unguessable, process-local, and bound to exactly one payload generation

系统 MUST使用OS-CSPRNG为每个scope生成至少128-bit entropy，MUST NOT使用time、process ID、incrementing sequence、path或unkeyed plain hash作为bearer token。每个current `(entry_id, resource_generation)` MUST最多映射一个scope，重复query MUST复用它。该scope MUST同时作为isolated browser origin key与path authorization key，authority scope与path scope MUST精确相等。scope MUST只位于process memory，MUST NOT持久化、写入changed event/log或作为standalone field返回。每个protocol request MUST根据current Manager projection重新确认scope、entry、generation、plugin identity、version、digest与payload root；URL可读字段和browser same-origin结果 MUST NOT替代opaque scope authorization。

#### Scenario: The same generation is resolved repeatedly

- **WHEN**caller在registration与resource generation未变化时重复valid query
- **THEN**Host返回相同entry URL与isolated browser origin，且不无界创建scope
- **THEN**unrelated plugin revision变化不撤销该scope/origin

#### Scenario: The same version is reinstalled with different content

- **WHEN**相同plugin ID与semantic version被不同digest package成功替换
- **THEN**旧resource generation、scope与origin立即失效，new registration获得不同scope/origin
- **THEN**旧URL不能返回new payload、stale cached content或继承new generation authority

#### Scenario: A plugin is disabled and then re-enabled

- **WHEN**相同payload在successful disable后再次enable
- **THEN**pre-disable scope/origin不会恢复，下一次successful resolution创建new scope/origin
- **THEN**matching plugin ID、version和digest不能让old bearer URL再次有效

#### Scenario: The application process restarts

- **WHEN**Manager从Store恢复相同registration
- **THEN**prior process所有scopes/origins不可用，recovered registration使用new process-local generation
- **THEN**Store record、Registration Contract与package layout不增加persisted scope、origin或generation field

### Requirement: Protocol requests MUST be restricted to a package-relative regular file bound to the scope

Resource handler MUST只接受fixed-version `lensx-plugin` URL envelope，其authority MUST包含canonical isolated origin scope，path MUST重复相同scope，并且两者 MUST byte-for-byte相等；old shared host与不能保留origin key的translated form MUST fail closed。Rust MUST执行strict lexical validation、拒绝每个component中的symlink/reparse point、enforce canonical root containment、require regular file、open后revalidate identity并bounded read。path MUST遵守portable ASCII segment constraints。absolute path、empty segment、`.`/`..`、`%`、backslash、NUL、query、fragment、userinfo、port、non-UTF-8、过长/过深path、directory、metadata record、another payload或host/path scope mismatch MUST fail closed。successful read MUST保持现有64 MiB single-file limit；handler MUST NOT enumerate directories、rewrite HTML、add wildcard/null CORS或把root-relative URL隐式映射回scope。

#### Scenario: Read a valid relative resource from the current plugin

- **WHEN**valid isolated authority与matching path scope请求canonical payload内满足path/type/size/MIME规则的regular file
- **THEN**handler返回完整且内部一致的bytes
- **THEN**request不能观察canonical root、adjacent plugin directories、Host filesystem或其他browser origin

#### Scenario: A request attempts path traversal or encoding confusion

- **WHEN**path包含Unix/Windows absolute form、`..`、dot segment、double slash、backslash、percent/double encoding、NUL、query或超过package path limits的结构
- **THEN**handler在open文件前拒绝完整request
- **THEN**single/repeated decoding、separator replacement与normalization不会把request转成readable path

#### Scenario: A request traverses a symlink or reparse escape

- **WHEN**target或任意intermediate component是symlink/reparse point，或canonical target不再位于scope root
- **THEN**handler不follow escape且不返回target bytes
- **THEN**payload外文件与其他plugin resources保持不可读

#### Scenario: The path changes between validation and reading

- **WHEN**target/component在lexical/canonical validation、open、metadata revalidation或bounded reading之间被替换、增长、截断或改变identity
- **THEN**handler丢弃完整body并返回safe failure，或返回safely opened file的一个internally consistent version
- **THEN**response不能组合两个文件或返回未通过final identity/size validation的bytes

#### Scenario: A request targets metadata or a directory

- **WHEN**scope请求`manifest.json`、`checksums.json`、payload directory或nonexistent resource
- **THEN**handler返回与ordinary unavailable resource相同的failure presentation
- **THEN**metadata、directory listing与existence detail不暴露

#### Scenario: Origin authority and path scope do not match

- **WHEN**request使用current origin authority但path包含另一个scope，或使用old/shared authority指向current path
- **THEN**handler在scope map或filesystem读取前fail closed
- **THEN**fixed external response不揭示哪一个scope、origin、plugin或path存在
