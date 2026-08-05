## Why

当前插件 iframe Transport 已能验证私有 frame 与公共 Host API Schema，并保持取消、乱序响应和 Session currentness；但它仍会在完整递归检查后才拒绝超大或超深消息，也没有统一的 Host 侧并发、执行期限与安全降级策略。Handler 抛错、返回非法值或返回与请求方法不匹配的结果时，当前路径还会终止 Session，而不是稳定地向插件返回受控 `internal_error`，因此 Task 5.6 需要补齐一条可验证的 RPC 入站、执行和出站防线。

## What Changes

- 新增 Host-private RPC validation policy，在调用 Dispatcher 前以有界遍历校验单帧结构、消息大小、嵌套深度、节点数量、单 Session 并发和 Host 执行期限。
- 保持现有单请求 wire，不引入 batch RPC；数组式或复合批量 envelope 继续被拒绝，因此每个 frame 的批量上限固定为一个请求。
- 将可安全关联到有效请求 ID 的请求错误稳定映射为 `invalid_request`、`invalid_params`、`limit_exceeded` 或 `timeout`；身份、版本、request ID、未知 frame 类型等不可安全关联的协议违规仍终止受影响 Session。
- 在发送 response 或 event 前继续按共享 Contract 验证；Handler 抛错、非法返回值或 method/result 不匹配统一转换为安全 `internal_error`，不得把原始异常、栈、路径、Host 对象或 payload 发送给插件。
- 记录有界、Host-private 的 plugin ID、method、失败阶段和诊断代码，不记录 request/result/event/error payload 或敏感值。
- 新增共享 fixture corpus、Transport/Dispatcher/SDK MessageChannel 集成测试、压力边界测试和聚焦验证命令，并更新英文架构/验证文档及其简体中文镜像。
- 不新增 Host API 方法、公共 SDK 配置或公开私有 wire；不实现 batch/streaming RPC、调用频率窗口、iframe/CPU/内存监控、插件暂停隔离、恢复策略、权限 UI 或插件管理 UI。

## Capabilities

### New Capabilities

- `plugin-rpc-validation`: 定义 Host-private RPC 入站预算、并发与执行期限、出站 Schema 防泄漏、稳定错误映射、安全诊断及验证要求。

### Modified Capabilities

- `plugin-sdk-iframe-transport`: 将现有 Transport 与 RPC validation policy 组合，明确哪些拒绝可返回请求级错误、哪些协议违规必须断开 Session，并以 `internal_error` 安全处理非法 Handler 输出。

## Impact

- 用户可见行为：正常插件调用保持不变；可恢复的错误输入、资源超限和 Host 非法输出将返回稳定安全错误，而不是把健康插件页面直接断开。
- 主要影响 `src/app/plugins/runtime/transport-contract.ts`、`transport-adapter.ts`、`host-api-dispatcher.ts` 及其组合位置和测试。
- 公共 `@lensx/plugin-contract` 的方法、Schema、错误代码集合与 `@lensx/plugin-sdk` API 保持兼容；私有 wire 版本保持 `0.1.0`。
- 新增 RPC policy/diagnostic 模块、共享恶意 fixture 和 `check:plugin-rpc-validation` 聚焦门禁；现有 Transport、Dispatcher、权限、存储与完整前端/Rust 验证仍需通过。
- 更新 `docs/en/architecture/extension-platform.md`、`docs/en/development/validation.md` 及对应 `docs/zh/` 镜像；完成并归档后才可勾选路线图 Task 5.6。
