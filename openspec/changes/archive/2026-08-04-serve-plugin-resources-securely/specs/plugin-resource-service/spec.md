## ADDED Requirements

### Requirement: Host 必须通过独立私有契约解析当前插件 entry URL

系统 MUST 提供独立版本的 Host-private Plugin Resource Contract，并只允许可信 lensX root application 通过 `resolve_plugin_resource_entry` 查询插件 entry URL。request MUST 精确包含 `contract_version`、`entry_id` 与 `expected_revision`；调用方 MUST NOT 提交或接收安装路径、package digest、record key、文件 handle、package bytes 或 Manager object。success MUST 精确包含 contract version、entry ID、当前 revision、Host 解析的 plugin ID/version 与 opaque `entry_url`。Rust 与 TypeScript MUST 从不可信边界值严格验证请求、成功结果和错误，且该契约 MUST NOT 成为 Manifest、公共插件包、iframe Runtime 或其他插件可导入/调用的能力。

#### Scenario: 可信应用解析当前 entry
- **WHEN** 可信 root application 使用有效 contract version、当前 entry ID 与当前 Registration revision 查询 eligible 插件
- **THEN** Host 返回由当前 registration 的 normalized `runtime.entry` 派生的 scoped entry URL
- **THEN** 结果不包含安装路径、digest、record key、文件内容或可变 Host object

#### Scenario: 请求试图提交 Host 私有事实
- **WHEN** 请求包含 path、plugin ID、version、digest、origin、scope、未知字段或错误 contract version/type
- **THEN** 完整请求以稳定 `invalid_request` 失败
- **THEN** 系统不签发 scope、不读取文件且不改变 Manager、Registry 或 revision

#### Scenario: 公共插件代码尝试使用资源查询边界
- **WHEN** workspace boundary gate 检查 Manifest、官方/外部插件或 `@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-ui`、`@lensx/plugin-testkit`
- **THEN** 这些消费者不能导入 Resource Contract、desktop adapter、Tauri command wrapper 或 Host-private 实现
- **THEN** entry URL 查询仍只存在于可信 lensX application boundary

### Requirement: Scope 签发必须来自一个当前且可证明安全的 registration

Host MUST 在一个原子 Plugin Manager read projection 中校验 expected revision 并解析 healthy registration、process-local resource generation、enabled intent、两维 compatibility、normalized Manifest、installation path 与 package digest。只有 Manager 非 degraded、registration healthy/enabled/compatible，且 installation path 可证明是 installer-owned `packages/<plugin-key>/<package-sha256>` 当前唯一活跃 payload 时才 MUST 签发 URL。Host source、Publisher 文本、requested permissions 与 Runtime `inactive` MUST NOT 自行授予或拒绝资源访问；无法证明 managed payload ownership 时 MUST fail closed。

#### Scenario: 当前 managed registration 可以签发 scope
- **WHEN** healthy、enabled、lensX/Host API compatible registration 的 record key、plugin identity、digest 与 canonical installer-owned payload 完全一致
- **THEN** Host 为它的当前 resource generation 签发或复用一个 scoped entry URL
- **THEN** URL 中的 plugin key、version 与 entry 均来自该原子 read projection

#### Scenario: 调用方使用过期 revision
- **WHEN** request 的 expected revision 与当前 Registration revision 不同
- **THEN** 查询以稳定 `stale_revision` 失败且不返回旧或新 URL
- **THEN** 调用方必须从完整当前 Registration snapshot 重新开始

#### Scenario: Registration 当前不可执行
- **WHEN** entry 不存在、quarantined、disabled、任一 compatibility 为 false，或 Manager recovery 为 degraded
- **THEN** 查询以稳定 `not_found` 或 `unavailable` 结论失败
- **THEN** 系统不因 payload 目录仍存在而签发资源能力

#### Scenario: Registration 指向不可证明的 payload
- **WHEN** installation path 不在 canonical installer packages root、plugin key/digest 不匹配、root/entry 缺失、是 symlink，或真实树不安全
- **THEN** 查询以稳定 `unsafe_state` 失败并不返回任何路径证据
- **THEN** builtin/external source 或 Publisher 声明不能覆盖失败结论

### Requirement: Resource scope 必须不可猜测、进程内且只绑定一个 payload generation

系统 MUST 使用 OS CSPRNG 为 scope 生成至少 128 bit entropy，不得使用时间、PID、递增序号、路径或未加密普通 hash 作为 bearer token。每个当前 `(entry_id, resource_generation)` MUST 至多对应一个 scope，重复查询 MUST 复用它；scope MUST 仅驻留进程内且 MUST NOT 被持久化、发送到 changed event、写入日志或作为独立字段返回。每个协议请求 MUST 根据当前 Manager projection 重新确认 scope、entry、generation、plugin identity、version、digest 与 payload root，且 URL 中的可读字段 MUST NOT 取代 opaque scope 授权。

#### Scenario: 同一 generation 重复解析
- **WHEN** 调用方在 registration/resource generation 未改变时重复提交有效查询
- **THEN** Host 返回相同 entry URL 且不会无界增加 scope
- **THEN** unrelated plugin 的 revision 变化不会使该 scope 失效

#### Scenario: 同版本不同内容被 reinstall
- **WHEN** 同一 plugin ID 与 SemVer 成功 replacement 到不同 package digest
- **THEN** old resource generation/scope 永久失效且新 registration 获得不同 scope
- **THEN** old URL 不能返回新 payload 或旧缓存内容

#### Scenario: 插件被禁用后重新启用
- **WHEN** disable 成功后同一 payload 再次 enable
- **THEN** disable 前的 scope 不恢复且下一次成功解析生成新 scope
- **THEN** 相同 plugin ID、version 与 digest 不能让旧 bearer URL 重新有效

#### Scenario: 应用进程重启
- **WHEN** Manager 从现有 Store 恢复同一 registration
- **THEN** 前一进程的全部 scope 均不可用且恢复后的 registration 使用新的 process-local generation
- **THEN** Store record、Registration Contract 与 package layout 不新增持久化 scope/generation 字段

### Requirement: 协议请求必须被限制在 scope 绑定的 package-relative regular file

Resource handler MUST 只接受固定版本的 `lensx-plugin` URL envelope，并 MUST 在 Rust 中对 package-relative path 执行严格 lexical validation、逐段 symlink/reparse rejection、canonical root containment、regular-file 检查、打开后 identity/revalidation 与 bounded read。路径 MUST 使用 package protocol 的 portable ASCII segment 约束；绝对路径、空 segment、`.`、`..`、`%`、反斜杠、NUL、query、非 UTF-8、过长/过深路径、目录、metadata records 与跨 payload target MUST fail closed。成功读取 MUST 限于现有 single-file 64 MiB 上限，并且 handler MUST NOT 列举目录、重写 HTML 或把 root-relative URL 隐式映射回 scope。

#### Scenario: 读取当前插件的合法相对资源
- **WHEN** 有效 scope 请求其 canonical payload 内满足 path、type、size 和 MIME 规则的 regular file
- **THEN** handler 返回该文件的一致完整 bytes
- **THEN** 请求不能观察 canonical root、相邻 plugin directory 或 Host 文件系统结构

#### Scenario: 请求执行路径穿越或编码混淆
- **WHEN** path 包含 Unix/Windows absolute form、`..`、dot segment、double slash、反斜杠、percent/double encoding、NUL、query 或超出 package path limits 的结构
- **THEN** handler 在文件 open 前拒绝完整请求
- **THEN** 单次或多次 decode、separator replacement 与 normalization 不会把请求转换成可读取路径

#### Scenario: 请求经过 symlink 或 reparse escape
- **WHEN** target 或任一中间 component 是 symlink/reparse point，或 canonical target 不再位于 scope root
- **THEN** handler 不跟随 escape 且不返回目标 bytes
- **THEN** payload 外文件和其他插件资源保持不可读

#### Scenario: 路径在验证与读取之间变化
- **WHEN** target/component 在 lexical/canonical 检查、open、metadata 复核或 bounded read 之间被替换、增长、截断或改变 identity
- **THEN** handler 丢弃整个 body并返回安全失败，或返回已安全打开的单一一致文件版本
- **THEN** response 不能混合两个文件或返回未经最终 identity/size 检查的 bytes

#### Scenario: 请求 metadata 或目录
- **WHEN** scope 请求 `manifest.json`、`checksums.json`、payload directory 或不存在的资源
- **THEN** handler 返回与普通 unavailable resource 相同的失败表现
- **THEN** metadata、目录列表与存在性细节不被暴露

### Requirement: Method、MIME 与 response headers 必须固定且禁止内容嗅探

协议 v0 MUST 只支持 `GET` 与 `HEAD`，MUST NOT 支持 Range、conditional request、content negotiation、目录 index 或任意下载。Host MUST 仅按最终扩展名的固定 ASCII case-insensitive 表返回 HTML、JavaScript/ES module、CSS、JSON、Wasm、PNG、JPEG、GIF、WebP、AVIF、SVG、ICO 与 WOFF2 的精确 MIME；未知扩展名 MUST NOT 回退为 `application/octet-stream`。成功 response MUST 包含准确 `Content-Type`/`Content-Length`、`X-Content-Type-Options: nosniff` 与 `Cache-Control: no-store`，且 MUST NOT 添加 wildcard CORS。

#### Scenario: GET 返回已知资源类型
- **WHEN** GET 请求一个允许扩展名的合法资源
- **THEN** response 使用固定 MIME、准确长度、`nosniff`、`no-store` 和完整 body
- **THEN** Host 不检查内容来猜测其他 MIME

#### Scenario: HEAD 请求合法资源
- **WHEN** HEAD 请求与某个成功 GET 相同的 URL
- **THEN** status、Content-Type、Content-Length 与安全 header 相同且 body 为空
- **THEN** handler 仍执行相同 scope、path、lifecycle 与 MIME 验证

#### Scenario: 请求未知扩展名
- **WHEN** 合法 payload path 的最终扩展名不在固定白名单
- **THEN** handler 按普通 unavailable resource 拒绝且不返回 bytes
- **THEN** response 不使用 `application/octet-stream` 或浏览器 MIME sniffing

#### Scenario: 请求不支持的方法或 Range
- **WHEN** 请求使用 POST、PUT、DELETE、Range 或 conditional header
- **THEN** 非 GET/HEAD 返回 `405` 与固定 `Allow: GET, HEAD`，不支持的读取变体安全失败
- **THEN** handler 不写文件、不返回部分内容且不改变任何 Host state

### Requirement: 生命周期提交必须使旧 scope 按插件精确失效

resource generation MUST 在影响目标插件资源资格的成功状态转换中改变，并 MUST 保持 unrelated plugin scope。disable、replacement、uninstall、quarantine/incompatible recovery 与进程结束后的新请求 MUST 使旧 scope 失败；re-enable/reinstall MUST 使用新 scope。失败或被取消的 lifecycle/replacement transition MUST 保持原 registration、generation 与 scope。逻辑 uninstall 一旦提交，物理 payload cleanup 是否完成 MUST NOT 影响撤销结论。

#### Scenario: Disable 或 uninstall 成功
- **WHEN** target plugin 的 disable 或 logical uninstall 已成功提交
- **THEN** 所有新请求都拒绝旧 scope，即使 payload 目录仍存在或 cleanup pending
- **THEN** resource service 不等待前端缓存、物理删除或应用重启才撤销能力

#### Scenario: Replacement 成功
- **WHEN** candidate payload 与 Manager record 已 durable commit
- **THEN** 旧 scope 立即失效，新 scope 只指向 candidate canonical payload
- **THEN** sibling old payload 是否已清理不能让旧 scope 返回任何 bytes

#### Scenario: Lifecycle 或 replacement 失败
- **WHEN** disable/uninstall persistence 或 replacement commit 失败且原 registration 保持有效
- **THEN** 原 resource generation/scope 保持有效
- **THEN** resource service 不根据未提交 intent 误撤销或签发 candidate scope

#### Scenario: 另一个插件发生变化
- **WHEN** Registration global revision 因不同 plugin 的安装、diagnostic 或 lifecycle 变化而增加
- **THEN** 当前 plugin 未变化的 resource generation/scope 继续有效
- **THEN** 全局 revision 不是唯一的 protocol request authorization 条件

### Requirement: 缓存与错误必须 fail closed 且不形成 Host 信息 oracle

v0 的成功与错误 response MUST 全部使用 `Cache-Control: no-store`。协议 MUST 将 unknown/expired scope、identity/generation mismatch、越界/不存在路径、metadata、unknown MIME、disabled/incompatible/quarantine/uninstalled 与 unsafe payload 统一为固定 `404` 外部表现；非 GET/HEAD MUST 使用固定 `405`，只有无法取得 managed state 或不可分类内部故障才能使用固定 `500`。response 与日志 MUST NOT 包含 scope、entry/plugin identity、version、digest、record key、绝对路径、原始 I/O、stack、文件内容或存在性差异。Host-private command 可以返回稳定 typed code，但 message MUST 为 canonical safe text。

#### Scenario: 两种不同拒绝原因被探测
- **WHEN** 调用方分别请求不存在文件、另一个插件路径、unknown MIME 与 expired scope
- **THEN** protocol 返回相同固定 `404` 类响应与安全 headers
- **THEN** status/body/header 不透露哪一个 scope、plugin 或磁盘文件真实存在

#### Scenario: Rust 文件读取失败
- **WHEN** permission、metadata、open、read、size 或 identity revalidation 失败
- **THEN** handler 返回固定安全错误并丢弃任何 partial body
- **THEN** response、serialized command error 与日志不包含原始系统错误或 Host path

#### Scenario: WebView 尝试依赖缓存继续访问
- **WHEN** resource generation 已撤销后再次使用旧 URL
- **THEN** 先前 response 的 `no-store` 策略要求重新进入 handler 并得到失败
- **THEN** 同版本 reinstall、disable/re-enable 或 uninstall 后不能通过旧缓存继续读取

### Requirement: Task 4.1 必须保持后续 Runtime 与 UI 能力未实现

本 capability MUST 只交付 Host-private Resource Contract、desktop adapter、Manager resource generation/projection、scoped protocol service、path/MIME/lifecycle enforcement、测试和维护文档。它 MUST NOT 创建 iframe、执行插件代码、改变 Plugin Page placeholder、显示 package-local icon、内联 SVG、建立 Runtime Session/transport/RPC/Host API、授予权限或宣称完整 CSP。由于本 change 不新增 UI，其完成 MUST NOT 改变现有英文默认/简体中文 locale、键盘与可访问性行为、Semi Design theme 或 light/dark presentation。

#### Scenario: Task 4.1 独立完成
- **WHEN** Resource Service 的 focused gate 与完整验证全部通过而 Task 4.2–4.4 仍未实现
- **THEN** Host 能安全解析和响应 scoped plugin resource URL，但当前 Plugin Page 仍只显示本地化 Host-owned placeholder
- **THEN** 用户界面、locale、theme、焦点和键盘行为保持现状，插件 HTML/JavaScript 不执行

#### Scenario: 后续 iframe 消费 entry URL
- **WHEN** Task 4.2 将当前 scoped entry URL 作为 iframe 输入
- **THEN** Task 4.1 只保证 URL 到一个当前 payload 的受限读取
- **THEN** iframe sandbox、origin/navigation、Tauri bridge isolation、页面错误状态及 session identity 仍由后续 capability 明确定义
