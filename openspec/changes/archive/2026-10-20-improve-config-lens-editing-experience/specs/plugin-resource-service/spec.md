## MODIFIED Requirements

### Requirement: Methods, MIME types, and response headers MUST be fixed and content sniffing MUST be prohibited

Protocol v0 MUST 只支持 `GET` 和 `HEAD`，MUST NOT 支持 Range、conditional requests、content negotiation、directory indexes 或任意下载。Host MUST 仅根据最终扩展名查询固定、ASCII 大小写不敏感的表，为 HTML、JavaScript 或 ES modules、CSS、JSON、Wasm、PNG、JPEG、GIF、WebP、AVIF、SVG、ICO、WOFF2（`font/woff2`）和 TrueType（`.ttf`、`font/ttf`）返回准确 MIME。未知扩展名 MUST NOT 回退到 `application/octet-stream`。

成功响应 MUST 包含准确的 `Content-Type`、`Content-Length`、`X-Content-Type-Options: nosniff` 和 `Cache-Control: no-store`，MUST NOT 增加 wildcard CORS。每个成功的当前 scope HTML 响应 MUST 同时包含准确的 Host-owned Plugin Runtime Content Security Policy；GET 和 HEAD MUST 返回相同安全响应头。非 HTML 资源、失败、过期 scope、作者 metadata、请求头、query 输入、source 与 publisher 信息 MUST NOT 选择、遗漏或放宽该策略。Handler MUST 原样提供已经验证的字节，MUST NOT 通过重写 HTML 注入 CSP。

#### Scenario: GET returns a known resource type

- **WHEN** GET 请求指向具有允许扩展名的有效资源
- **THEN** 响应使用固定 MIME、准确长度、`nosniff`、`no-store` 和完整正文
- **THEN** Host 不检查内容以猜测其他 MIME

#### Scenario: GET and HEAD serve a packaged TrueType font

- **WHEN** 当前 scope 通过 GET 或 HEAD 请求有效包内 `.ttf` 或 `.TTF` 资源
- **THEN** 两种响应均使用 `font/ttf`、字体的准确字节长度、`nosniff` 和 `no-store`
- **THEN** GET 返回未改写的字体字节，HEAD 在相同 scope、路径、生命周期和 MIME 验证后返回空正文

#### Scenario: GET returns a current scoped HTML document

- **WHEN** GET 请求指向当前 scope 的有效 HTML 资源
- **THEN** 响应除固定 MIME、长度、`nosniff` 和 `no-store` 外，还包含准确的 Host-owned Plugin Runtime CSP
- **THEN** 返回正文仍为验证后的包内字节，任何作者 meta policy、请求输入、source、publisher 或旧 grant 声明都不能扩大该 Header

#### Scenario: HEAD requests a valid resource

- **WHEN** HEAD 请求指向与成功 GET 相同的 URL
- **THEN** status、`Content-Type`、`Content-Length` 和安全响应头一致，包括 HTML 的 Plugin Runtime CSP，且正文为空
- **THEN** Handler 仍执行相同 scope、路径、生命周期和 MIME 验证

#### Scenario: A request targets an unknown extension

- **WHEN** 有效 payload 路径的最终扩展名不在固定 allowlist 内
- **THEN** Handler 将其作为普通不可用资源拒绝，不返回字节
- **THEN** 响应不使用 `application/octet-stream` 或浏览器 MIME sniffing

#### Scenario: A request uses an unsupported method or Range

- **WHEN** 请求使用 POST、PUT、DELETE、Range 或 conditional header
- **THEN** GET 和 HEAD 以外的方法收到 `405` 及固定 `Allow: GET, HEAD` 响应头，不支持的读取变体安全失败
- **THEN** Handler 不写文件、不返回局部内容，也不改变 Host 状态

#### Scenario: A stale or failed request attempts to obtain policy-dependent content

- **WHEN** 旧 generation、scope 不匹配、不安全路径、不可用 entry、不支持方法或其他失败请求指向 HTML
- **THEN** 既有固定失败响应不返回插件正文，也不能转为可用但策略放宽的 Runtime document
- **THEN** 响应差异不泄漏当前 scope、策略例外、插件身份、路径或存在性信息
