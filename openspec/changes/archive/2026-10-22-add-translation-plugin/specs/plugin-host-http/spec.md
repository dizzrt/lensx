# Spec Delta

## Purpose

定义所有插件共用的受控 Host HTTPS 文本传输能力，在服务端没有浏览器跨域响应头时仍可取得真实状态和正文，同时以可信 Runtime 身份、公网地址策略、资源上限和原生取消守住平台边界，业务和签名继续由插件负责。

## ADDED Requirements

### Requirement: Host HTTP MUST expose one public generic text request contract

Host API `0.3.0` MUST 增加 `http.request`。参数 MUST 为 `{ url, method, headers?, body?, timeoutMs? }`，headers MUST 为 `{ name, value }` 数组；允许 method 为 `GET`、`HEAD`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS`，GET/HEAD MUST 省略 body。结果 MUST 为 `{ status, headers, body }`，status 范围为 100–599，body 为 UTF-8 文本。Host MUST 返回有界的 HTTP 3xx/4xx/5xx 状态与正文供插件解释，不因为状态码非 2xx 拒绝读取，也不依赖 CORS header。插件 MUST 通过公共 typed SDK 及当前能力发现调用，MUST NOT 取得 native client、原始 bridge 或 Tauri command。所有插件 MUST 使用同一规则，Host MUST NOT 包含翻译服务、凭据签名或 provider 特例。

#### Scenario: Plugin performs a signed text request
- **WHEN** 插件提交满足策略的 HTTPS URL、显式 Authorization/header 和完整文本正文
- **THEN** Rust Host 发送经校验的相同正文 UTF-8 字节并返回 status/headers/body
- **THEN** 签名和业务响应解析留在插件，Host 不修改正文或增加业务字段

#### Scenario: Remote response has no CORS header
- **WHEN** 远端返回合法有界的 HTTP 响应但不包含 Access-Control-Allow-Origin
- **THEN** Host HTTP 返回实际状态和文本，保持浏览器本身的安全设置不变

#### Scenario: Plugin targets an unsupported Host
- **WHEN** 当前 Context 不宣告 http.request
- **THEN** SDK 不将该方法当作可用能力，插件不得绕过公共边界请求

### Requirement: Host HTTP MUST restrict destinations to validated public HTTPS

URL MUST 不超过 4096 UTF-8 字节且只允许 HTTPS/443；userinfo、fragment、单标签或本地/保留主机名 MUST 被拒绝。DNS MUST 在总期限内一次解析，答案须有 1–16 个地址，任一非公网地址 MUST 拒绝整个请求；云平台服务地址 `168.63.129.16` MUST 明确拒绝。IPv4 的未指定、回环、私网、链路本地、共享、文档、多播、保留及协议特殊地址 MUST 被拒绝。IPv6 仅允许公网 2000::/3 并排除 2001::/23、2001:db8::/32、2002::/16、3fff::/20 等特殊/文档/转换地址；IPv4-mapped IPv6 MUST 应用 IPv4 策略。实际连接 MUST 固定到已校验地址，保留原主机名 TLS 验证，MUST NOT 再解析到未经校验地址。Host MUST NOT 使用系统/环境代理或提供 TLS 跳过验证选项。

#### Scenario: A public hostname resolves to a private address
- **WHEN** DNS 的任一结果为私网、回环、链路本地或其他被拒绝的地址，即使同时有公网结果
- **THEN** Host 在发送任何请求前返回安全拒绝，不连接其中任何地址

#### Scenario: DNS answers change after validation
- **WHEN** 初次 DNS 答案通过，随后域名解析可能改变
- **THEN** 请求仅使用初次已校验并固定的地址，TLS 仍校验原 URL 主机名

#### Scenario: Plugin supplies credentials in a URL or an unsupported destination
- **WHEN** URL 包含 userinfo、fragment、非 HTTPS、非 443、本地名称或非公网 IP
- **THEN** 请求在网络操作前失败，错误不暴露解析细节或内部地址

### Requirement: Host HTTP MUST bound headers payloads and serialized responses

请求 header MUST 不超过 32 项，名称须为 ASCII HTTP token 且不超过 128 字节，值须为 ASCII U+0020–U+007E 且不超过 8192 字节，总名称和值字节数 MUST 不超过 16 KiB；大小写不敏感的重复名称 MUST 被拒绝。Host/Content-Length/Connection/Transfer-Encoding/Cookie/Cookie2/Origin/Referer/Accept-Encoding/Upgrade/TE/Trailer 及 Proxy-*/Sec-* MUST 不得由插件提交。响应 headers MUST 在正文读取前受同等单项/数量/总字节边界约束；这些是可接受语义值上限，底层 HTTP parser 还 MUST 使用有界解析缓冲。响应 headers 可以保留重复的普通字段，MUST 过滤 Set-Cookie/Set-Cookie2 和 hop-by-hop 字段。

请求正文 MUST 不超过 1 MiB UTF-8 字节。响应 MUST 在读取过程中限制到 1 MiB 原始字节并校验 UTF-8，序列化后的完整语义结果 MUST 不超过 4 MiB，保留既有 5 MiB wire frame 上限。超限或无效结果 MUST 整体失败，MUST NOT 截断、部分成功或输出二进制猜测值。

#### Scenario: Plugin forges transport identity or framing
- **WHEN** 请求包含受保护、控制字符、Unicode 或大小写重复 header
- **THEN** Host 拒绝请求，不合并为不同的签名字节，不注入浏览器或系统环境身份

#### Scenario: Response stream exceeds a limit
- **WHEN** 逐块读取的响应超过正文、header 或序列化结果上限
- **THEN** Host 终止本地读取并返回 limit_exceeded，不透传部分内容

#### Scenario: Text expands when encoded into the bridge frame
- **WHEN** UTF-8 正文在 JSON 转义后超过 4 MiB 语义结果上限
- **THEN** Host 返回有界 limit_exceeded，MUST NOT 放大现有 wire 限制

### Requirement: Host HTTP MUST preserve bounded foreground execution and cancellation

每个请求 timeoutMs MUST 在 1–15000ms，默认 15000ms，覆盖 DNS、连接、TLS、发送和响应读取。HTTP 的 RPC 截止 MUST 为请求期限加 1000ms 且不超过 16000ms；其他方法维持原有 10000ms。每 Runtime attempt MUST 最多 4 个、全局 MUST 最多 16 个在途 HTTP 请求，超额 MUST 立即失败而不排队。

原生 provider MUST 从当前来源绑定的 RPC 获得 attempt/source/request_id，不接受插件自报身份。系统 DNS resolver MUST 另有全局最多 16 个在途 worker 限制且不排队，名额由已开始的 OS 解析调用持有至完成。取消 MUST 立即结束当前 HTTP future/等待并丢弃迟到解析结果，MUST NOT 在取消后建立连接；不承诺撤回已发送 DNS 数据包或中断 OS 不支持取消的既有解析调用。

取消句柄 MUST 在异步执行开始前登记；SDK 取消、RPC 截止、真实关闭、禁用、替换、重载或断线 MUST 取消原生工作并幂等释放资源。晚到结果 MUST NOT 恢复终止请求或修改新 attempt。临时隐藏恢复同一 attempt MUST 不新增请求或丢失其有效状态。

#### Scenario: Cancellation races DNS or response reading
- **WHEN** 插件取消、请求超时或 Runtime 终止发生在 DNS、连接或读取期间
- **THEN** HTTP 工作和等待被停止，请求并发名额释放，过期结果不能返回新 Runtime；不可中断的 OS DNS worker 独立保留其有界名额直到完成

#### Scenario: Concurrency is exhausted
- **WHEN** 单 attempt 已有 4 个或全局已有 16 个 HTTP 请求
- **THEN** 新请求返回 limit_exceeded，现有请求不被替换且不创建等待队列

#### Scenario: HTTP duration exceeds the old generic RPC deadline
- **WHEN** HTTP 指定 15000ms 且在 10000ms 时仍合法进行
- **THEN** 通用 RPC 不在旧 10 秒边界提前终止它，但仍受 HTTP 总期限和有界 RPC margin 约束

### Requirement: Host HTTP MUST avoid ambient credentials retries and sensitive diagnostics

Host MUST 不共享 Cookie、系统凭据或 HTTP cache，不自动重定向、重试或解压。首版 MUST 使用 HTTP/1 和有界 HTTP parser，不承诺仅接受 HTTP/2 的 endpoint。非 identity Content-Encoding MUST 成为安全失败。只有插件明确提交的业务 headers/body 可发送；Host MUST 不记录 URL 查询、请求/响应正文、Authorization、凭据、签名或原始网络异常。

失败 MUST 使用既有稳定 Host API 错误：invalid_params、limit_exceeded、timeout、cancelled、unavailable、internal_error，并只提供产品拥有的有界文案。目的地策略拒绝 MUST 为 invalid_params，网络/TLS/DNS/不可支持响应 MUST 为 unavailable，大小或并发限制 MUST 为 limit_exceeded。HTTP 状态错误 MUST 仍作为结果交给插件解析。

#### Scenario: Remote server redirects to a local destination
- **WHEN** 服务器返回重定向
- **THEN** Host 返回原始 3xx 响应而不跟随 Location，不向任何新目标转发鉴权

#### Scenario: Service sets a cookie or asks for a retry
- **WHEN** 响应携带 Set-Cookie、Retry-After 或非成功状态
- **THEN** Host 不存储 Cookie、不自动重试，插件自行展示已界定的业务状态

#### Scenario: Native transport fails with private diagnostics
- **WHEN** resolver、TLS 或 transport 产生原始错误
- **THEN** 插件与日志只收到安全类别，不得到主机内部路径、地址、凭据或响应片段

### Requirement: Host HTTP MUST ship with deterministic cross-layer evidence

维护验证 MUST 覆盖公共 Schema/生成类型/目录/TS-Rust 共享夹具、typed SDK、能力发现、原生 dispatcher 来源绑定、地址与 DNS pinning、大小/headers/UTF-8/序列化预算、期限、并发、取消和生命周期。测试 MUST 使用受控 resolver/transport，不依赖外部网络、真实凭据、计费请求、浏览器/WebView、GUI 或原生交互 harness。新增能力 MUST 进入稳定 plugin-host-http Gate，复用既有根生命周期、包 consumer 与生成器，MUST NOT 新增 Change 专用脚本。

#### Scenario: Deterministic provider and bridge tests run
- **WHEN** 假 DNS/transport 控制正常响应、恶意目的地、超限、失败及取消竞态
- **THEN** 可以验证公网策略、原生取消和隔离，而不访问真实服务或声称真实账户翻译已验证
