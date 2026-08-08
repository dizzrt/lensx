# Host API 参考

## Authority 模型

Host API `0.2.0` 是封闭的非特权 method catalog。公共 Contract 定义合法的
request、result、event 与稳定错误；当前 Host 组合 provider；最新的完整
`PluginRuntimeContext.capabilities` 列表说明当前 Session 可调用哪些 method。

Catalog 条目不等于 provider 可用性，也不会暴露 Tauri、Rust command、原生剪贴板、
文件、Shell 或进程 authority。Worker、网络、远程资源、Blob/Data、WASM 和浏览器
origin storage 属于普通 Web Runtime 能力，因此不会出现在该 method 列表中。

## Method 参考

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

## 恢复

Page 或 attempt 改变时取消过期操作。每次 Context event 都原子替换 locale、theme 和
capabilities。disconnect、reload 或 replacement 后，把旧 callback 与 pending work 视为
失效。重试会创建新的 SDK 和订阅，绝不复活旧 Session。

完整生命周期见[Runtime 与安全](runtime-permissions-security.md)，版本恢复见
[兼容性与错误](compatibility-and-errors.md)。
