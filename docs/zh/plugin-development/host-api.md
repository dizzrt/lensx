# Host API 参考

## Authority 模型

Host API `0.4.0` 是封闭的 Session-bound method catalog。公共 Contract 定义合法的
request、result、event 与稳定错误；当前 Host 组合 provider；最新的完整
`PluginRuntimeContext.capabilities` 列表说明当前 Session 可调用哪些 method。

Catalog 条目不等于 provider 可用性，也不会暴露 Tauri、任意 Rust command、原生剪贴板、
文件、Shell 或进程 authority。普通浏览器 Worker/network、远程资源、Blob/Data、WASM
和 origin storage 仍属于 Web Runtime 能力。独立的 `http.request` method 提供受控
Host HTTPS 传输，不改变浏览器的 CORS 或 CSP。

## Method 参考

### `http.request`

参数为 `{ url, method, headers?, body?, timeoutMs? }`。header 为
`{ name: string, value: string }`，headers 使用数组。结果为
`{ status, headers, body }`，其中 `status` 为 100–599，`body` 为 UTF-8 文本。
method 支持 `GET`、`HEAD`、`POST`、`PUT`、`PATCH`、`DELETE` 和 `OPTIONS`；
GET/HEAD 必须省略 body。HTTP 3xx/4xx/5xx 作为普通结果交由插件解释。Host 不跟随
重定向，也不依赖浏览器 CORS 响应头。

仅支持公共 Internet HTTPS 443。URL 最多 4096 UTF-8 字节，不允许 userinfo 或
fragment；拒绝本地、单标签、保留、回环、私网、链路本地、共享、多播、文档及特殊用途
目的地。DNS 必须在总期限内返回 1–16 个地址；任一不允许的答案会拒绝整个请求。
实际连接只使用已校验地址，TLS 仍校验原主机名。不支持系统/环境代理或跳过 TLS 校验。
该方法不是访问本地服务或云元数据的通道。
原生传输使用带有界 header parser 的 HTTP/1，不支持仅提供 HTTP/2 的 endpoint。

| 限制 | 契约 |
| --- | --- |
| Headers | 最多 32 项；单个名称最多 128 字节、值最多 8192 字节，全部名称和值合计最多 16 KiB。 |
| Header 语法 | ASCII HTTP-token 名称、ASCII U+0020–U+007E 值；请求名称忽略大小写后不得重复。 |
| 请求/响应 body | 各自最多 1 MiB UTF-8 字节；无效 UTF-8 失败。 |
| 序列化语义结果 | 最多 4 MiB，保持在既有 5 MiB carrier 限制内。 |
| 请求期限 | `timeoutMs` 为 1–15000，默认 15000，覆盖 DNS 至响应读取。 |
| RPC 期限 | HTTP 期限加 1000ms，最多 16000；其他方法保持 10000ms。 |
| 并发请求 | 每 Runtime attempt 最多 4 个、全局最多 16 个；超额立即失败，不排队。 |
| DNS worker | 全局最多 16 个，包含请求取消后仍在完成的 OS lookup。 |

SDK 通用 operation timeout 仍默认 10000ms。允许更长 HTTP 请求时，需显式设置 operation
`timeoutMs`，例如在 15000ms 原生请求外使用 16000ms；也可为完整业务操作采用更短的
本地期限和 abort signal。

请求 header 不允许设置 `Host`、`Content-Length`、`Connection`、`Transfer-Encoding`、
`Cookie`、`Cookie2`、`Origin`、`Referer`、`Accept-Encoding`、`Upgrade`、`TE`、`Trailer`，
以及以 `Proxy-`/`Sec-` 开头的名称。显式业务 header（包括 `Authorization`）仍由插件
拥有；Host 不补充环境凭据。响应 header 遵循相同大小限制，保留普通重复字段，过滤
Set-Cookie/Set-Cookie2 与 hop-by-hop 字段。Host 不共享 cookie jar 或 HTTP cache，
不重试、不自动解压，拒绝非 identity Content-Encoding。超限响应整体失败，不截断。
16 KiB header 限制约束读取 body 前已接受的语义 headers，不承诺 HTTP parser 不分配额外的
有界缓冲区。

取消使用 SDK 既有的 operation signal。取消、超时、断线或 Runtime 终止会停止请求等待、
释放请求并发名额，并使晚到结果失效。已开始的 OS DNS lookup 不能中断，会持有独立的
有界 worker 名额直到结束；随后丢弃结果，绝不为该取消请求继续连接。
隐藏/恢复同一当前 Runtime 不会创建额外请求。
URL query、headers、body、凭据、签名和原始网络异常不得进入日志或诊断。签名及服务
特定响应解释属于插件。

### `actions.open`

参数：`{ actionId: string }`。结果：`{ opened: true }`。Action 必须属于当前插件，
并且仍指向可用目标。

### `runtime.get_context`

参数：`{}`。结果为完整 Context，包含 `hostApiVersion`、`locale`、`theme` 和已排序去重的
`capabilities`。Context event 是完整替换，不是 patch。

### `storage.delete`

参数：`{ key: string }`。结果：当前插件 scoped Host storage namespace 中的
`{ deleted: boolean }`。

### `storage.get`

参数：`{ key: string }`。结果：`{ found: false }` 或
`{ found: true, value: JsonValue }`。

### `storage.get_quota`

参数：`{}`。结果：`{ usedBytes: number, limitBytes: number }`。后续写入仍可能返回
`limit_exceeded`。

### `storage.list`

可选参数：`{ cursor, limit }`。结果为已排序的 `keys` 和可选 opaque `nextCursor`。

### `storage.set`

参数：`{ key: string, value: JsonValue }`。结果：`{ stored: true }`。

### `ui.close`

参数：`{}`。结果：`{ accepted: true }`。只有匹配的当前 Page 可以关闭；被替换的
Session 不能关闭更新的 attempt。

## 稳定错误

| Code | 开发者动作 |
| --- | --- |
| `cancelled` | 安静停止过期工作，或让用户重试。 |
| `conflict` | 刷新当前状态后再重试。 |
| `internal_error` | 显示有限错误，不暴露私有细节。 |
| `invalid_params`、`invalid_request`、`method_not_found` | 修复调用或 Host API 版本假设；已删除的 clipboard 与未知 method 走该路径。 |
| `limit_exceeded` | 缩小 payload、batch 或存储数据。 |
| `not_found` | 刷新资源或显示空状态。 |
| `timeout` | 结束 attempt，并在安全时提供显式重试。 |
| `unavailable` | 降级功能并等待当前 provider。 |

HTTP 的 `invalid_params` 表示参数或目的地拒绝，`limit_exceeded` 表示大小/并发限制，
`timeout` 和 `cancelled` 表示终止，`unavailable` 覆盖网络、DNS、TLS 或不支持的响应。
这些安全类别不推断底层网络原因。已完成的 HTTP 状态仍是结果，不是 Host error。

## 恢复

Page 或 attempt 改变时取消过期操作。每次 Context event 都原子替换 locale、theme 和
capabilities。disconnect、reload 或 replacement 后，把旧 callback 与 pending work 视为
失效。重试会创建新的 SDK 和订阅，绝不复活旧 Session。

完整生命周期见[Runtime 与安全](runtime-permissions-security.md)，版本恢复见
[兼容性与错误](compatibility-and-errors.md)。

## Action 激活

`PluginActionActivation` 是复制并冻结的 `{ actionId, invocationId, source }`。
`actionId` 为当前插件局部 ID；`invocationId` 是当前 Page attempt 内递增的正安全整数；
`source` 为 `normal` 或 `shortcut`。只有原生 Action 专属绑定产生 `shortcut`；搜索、点击、
最近、固定项和 `actions.open` 均产生 `normal`，不继承上次来源。
不暴露实际按键、绑定、Session 身份或原生句柄。Runtime Context 仍严格只有
`hostApiVersion`、`locale`、`theme`、`capabilities` 四字段。

### actions.get_activation

精确 `{}` 参数返回当前 Page Session 的 `{ activation: null | PluginActionActivation }`。
查询不创建调用，也不接受目标或来源覆盖。

### actions.subscribe_activations

精确 `{}` 参数原子开启唯一 Session 通道，返回按 invocation ID 排序、最多 32 项的
`{ activations: PluginActionActivation[] }` 初始批次。重复订阅返回同一缓存批次，不建立新流。
新调用通过 `actions.activated` 发送，payload 就是 Activation。初始批次缓存不占用后续准入容量。
Session 关闭或替换会清除通道和批次。

SDK `0.5.0` 在请求订阅前安装内部 listener，合并初始化期间最多 64 个不同调用，按 ID 排序去重，
然后进入 ready 并投递回调。后续仅保留已消费高水位和当前快照，不累积无限历史。
缺少订阅能力时仍可 ready，`sdk.activation === null`；查询能力独立检查。
当前公共目录包含十一个方法和两个事件。
