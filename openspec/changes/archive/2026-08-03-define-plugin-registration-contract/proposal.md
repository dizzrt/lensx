## Why

当前 Rust Plugin Manager 已能持久化、恢复并查询 Host 私有的插件注册状态，但 React 前端和后续 Action/Page 投影仍没有稳定、类型化且可恢复的跨 Tauri 边界。现在需要先建立唯一的 Host-owned Registration Contract，避免后续能力各自复制 Manifest、生命周期或权限事实，并确保作者输入永远不能伪造可信注册状态。

## What Changes

- 新增仅供 lensX Host、Tauri 与应用前端共享的 Plugin Registration Contract；它不是插件作者可调用的 SDK，也不作为 `@lensx/plugin-contract` 的公共插件 API 导出。
- 明确区分 author Manifest、normalized Manifest、registered plugin read model 与瞬时 Runtime status，并由 Host 组合 source、enabled、compatibility、quarantine、permission grant 和安全诊断事实。
- 提供稳定、可序列化且经过双方校验的注册列表摘要、单插件详情和完整 snapshot 查询 payload；健康记录与 quarantine stub 使用显式可辨识类型。
- 定义只读前端查询边界和 snapshot-changed 通知。通知只表示新快照可用，前端在启动、重连或收到通知后重新读取完整 snapshot，不依赖可丢失的增量 patch 重放。
- 保证事件只在 Plugin Manager 状态成功持久化并发布后发出；失败转换不得发布新 revision 或让前端观察到未落盘状态。
- 对前端 payload 进行最小披露：不公开安装绝对路径、原始错误、栈、插件内容或其他 Host 私有实现对象；列表摘要与详情字段分别定义。
- 明确 publisher 仍是未验证作者声明，不能推导 trusted provenance、签名结论、权限授权或生命周期豁免。
- 增加 Rust、Tauri、TypeScript 的共享 fixtures、序列化/校验测试与 contract drift gate，并更新中英文架构文档。
- 非目标：不实现插件安装、升级、卸载、用户触发的 enable/disable 命令、Action/Page 投影、插件管理 UI、真实 Runtime session 状态机、签名格式/验证、权限决策或 Host API。

## Capabilities

### New Capabilities

- `plugin-registration-contract`: 定义 Host-owned 插件注册 read model、完整 snapshot、详情查询、稳定错误、变化通知、跨 Rust/Tauri/TypeScript 校验和敏感字段边界。

### Modified Capabilities

- 无。

## Impact

- Rust/Tauri：在现有 Plugin Manager 之上新增安全的 snapshot/detail 投影、revision 与查询 command/event 边界；现有逐插件持久化事实源保持唯一。
- TypeScript：新增 Host 私有 registration 类型、校验器和只读 Tauri adapter，供后续 Action/Page 投影与插件管理界面复用。
- Contract 边界：不会扩大 `@lensx/plugin-contract`、`@lensx/plugin-sdk` 或插件可调用 API 的导出面；不新增插件 Runtime 能力。
- 测试与验证：增加跨语言共享 fixtures、Rust command/事件测试、TypeScript payload 校验测试以及根级 drift gate。
- 文档：更新 `docs/en/architecture/extension-platform.md` 及对应的简体中文镜像，区分已交付 Registration Contract 与仍未实现的安装、执行、权限和管理能力。
