# Host API 参考

## Authority 模型

Host API `0.1.0` 分为三层：

1. 公共 catalog 定义合法 method、request、result、permission 和稳定 error 形状。
2. 当前 Host 可能为 catalog method 组合 provider。
3. 最新完整 `PluginRuntimeContext.capabilities` 决定 method 在本 session 是否可调用。

Catalog 条目不代表 provider 可用或 authority，provider 也不代表 grant。必须读取最新完整
context，对 unavailable feature 降级或隐藏，绝不能绕过 SDK 自行构造调用。

## Method 参考

### `actions.open`

参数：`{ actionId: string }`。结果：`{ opened: true }`。base provider 要求当前插件 Action
及其 target 可打开。当前状态变化时可能得到 `invalid_params`、`not_found`、`conflict`、
`unavailable`、`cancelled` 或受限 internal failure。

### `clipboard.read`

参数：`{}`。结果：`{ text: string }`。macOS text-clipboard provider、Manifest request、
current grant 与 session capability 必须同时存在。需处理 `permission_denied`、`unavailable`、
`cancelled`、`timeout`、limit 或受限 internal error。

### `clipboard.write`

参数：`{ text: string }`。结果：`{ written: true }`。需要匹配的 request、grant、provider
与 current capability。无效或超长文本会被拒绝；撤销会立即使旧 authority 失效。

### `runtime.get_context`

参数：`{}`。结果：包含 `hostApiVersion`、`locale`、`theme` 和有序唯一 `capabilities`
的完整 context。初始化使用这一 base method；后续 context event 是完整 replacement，不是 patch。

### `storage.delete`

参数：`{ key: string }`。结果：`{ deleted: boolean }`。scoped storage provider 将数据绑定到
当前插件 identity。无效 key、stale session、provider failure 与 current-state conflict 都安全失败。

### `storage.get`

参数：`{ key: string }`。结果：`{ found: false }` 或
`{ found: true, value: JsonValue }`。不存在是正常结果，不应视为 internal error。

### `storage.get_quota`

参数：`{}`。结果：`{ usedBytes: number, limitBytes: number }`。大写入前应检查 current quota，
但仍必须处理之后出现的 `limit_exceeded`。

### `storage.list`

参数：可选 `{ cursor, limit }`。结果：有序 `keys` 和可选 opaque `nextCursor`。cursor 必须视为
opaque；stale 或 invalid cursor 后重新开始 listing。

### `storage.set`

参数：`{ key: string, value: JsonValue }`。结果：`{ stored: true }`。处理 invalid value、
limit、cancellation、conflict 与 unavailable，不能假定部分写入成功。

### `ui.close`

参数：`{}`。结果：`{ accepted: true }`。base provider 只为匹配的 current page 接受 close。
stale 或 replaced session 无法关闭新的 page generation。

## 稳定错误

| Code | 开发者动作 |
| --- | --- |
| `cancelled` | 安静停止，或让用户显式 retry。 |
| `conflict` | retry 前刷新 context/current state。 |
| `internal_error` | 展示受限失败，不暴露私有细节。 |
| `invalid_params`、`invalid_request`、`method_not_found` | 修正调用或版本假设，盲目 retry 无效。 |
| `limit_exceeded` | 缩小 payload、batch 或存储数据。 |
| `not_found` | 刷新资源或呈现 empty state。 |
| `permission_denied` | 解释 feature 不可用，绝不自动 grant。 |
| `timeout` | 结束 attempt，并在安全时提供显式 retry。 |
| `unavailable` | 降级 feature，等待新 context/provider state。 |

SDK lifecycle error（如 disconnected、disposed、transport failure、invalid context、
incompatible Host API）与 method result 不同。

## 恢复

page 或 attempt 变化时取消 obsolete operation。完整 context replacement 到达后，原子替换
locale、theme 与 capabilities，并停止已消失 capability 的工作。disconnect、reload 或
replacement 后，旧 callback 与 pending work 均为 inert。retry 创建 fresh SDK、transport 与
subscription set，不会复活旧 session。dispose 始终幂等。

完整生命周期见 [Runtime、权限与安全](runtime-permissions-security.md)，版本恢复见
[兼容与错误](compatibility-and-errors.md)。

