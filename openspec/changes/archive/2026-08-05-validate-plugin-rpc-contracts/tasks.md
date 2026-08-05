## 1. 建立 RPC Policy 与有界分析基础

- [x] 1.1 在 Host-private Runtime 模块中定义冻结的 RPC v1 policy、闭集诊断类型和可选观察性 diagnostic sink，固定 5 MiB frame、32 层语义 payload、36 层总 frame、16,384 个节点、单请求 batch、32 并发和 10,000 ms Host deadline，并用 export/boundary 测试证明它们不会进入公共 Contract、SDK、UI、Testkit 或插件包。
- [x] 1.2 实现可提前终止、非递归且不先完整序列化的 JSON-compatible cost analyzer，覆盖 UTF-8/JSON escaping cost、plain object、有限数字、循环、byte/depth/node 限制和输入不变性。
- [x] 1.3 建立共享合法与恶意 RPC fixture corpus，并为每项预算增加低于、恰好等于和超过边界的确定性单元测试，包括最大 Contract 合法文本、深层 storage JSON、多键/多项值、非 JSON 值和 batch envelope。

## 2. 收紧入站 Request Admission

- [x] 2.1 将 Host 私有 frame 接收改为“浅层可信 envelope 分类 → 有界分析 → 公共 Contract 校验”，区分不可关联的 protocol violation 与可关联的 `invalid_request`、`invalid_params`、`method_not_found`、`limit_exceeded`，并验证所有请求级拒绝均为零 Handler/权限/provider hit。
- [x] 2.2 用严格递增 request sequence high-water mark 取代无界 terminal request-ID Set，保持 pending request 乱序完成、重复/倒退 ID fail closed、未知 cancel 幂等和 Session cleanup 行为，并补齐 replay 与长 Session 状态有界测试。
- [x] 2.3 在 Host adapter 中实施单 Session 32 个 in-flight Handler 上限；超限请求必须返回一次 `limit_exceeded`、不创建 controller/timer、不进入 Dispatcher，并在完成、取消、超时和 cleanup 后准确释放槽位。
- [x] 2.4 使用可注入测试 clock/scheduler 实施 10,000 ms Host execution deadline，统一 AbortController、SDK cancel、Session currentness、disconnect/dispose 与 Handler completion 的 exactly-once 竞态，并证明 Host timeout 与 SDK lifecycle timeout 保持可区分。

## 3. 约束出站结果、事件与诊断

- [x] 3.1 在发送 result/error/event 前应用同一 RPC budget 和公共 Contract 校验；将 Handler throw/reject、非法或超限返回、非法 error 和 method/result mismatch 转换为固定安全 `internal_error`，同时保持合法 Dispatcher/权限/存储错误代码不变。
- [x] 3.2 修改 event containment：合法事件照常交付，非法、未声明、含私有字段或超限事件仅产生安全 egress 诊断且不通知 SDK subscriber，也不因单次 Host 输出错误断开健康 Session。
- [x] 3.3 保持 post-response effect 的 response-first、currentness 和 exactly-once 约束，新增非法输出、超时、取消、Session replacement 和 postMessage 失败测试，确保失败路径不会执行 effect 或影响替代 Page。
- [x] 3.4 将 diagnostic sink 接入生产 Host adapter 组合，记录仅含可信 plugin ID、已验证 method、stage、闭集 code 和固定消息的冻结 record；验证 sink throw 不影响 settlement，且 request ID、payload、路径、origin、grant、异常、stack、Port 和 Host 对象均不会被记录或公开。

## 4. 集成证据与聚焦门禁

- [x] 4.1 扩展真实 Contract + SDK MessageChannel 集成测试，覆盖合法并发乱序、可恢复请求错误、权限拒绝、并发超限、Host deadline、SDK cancellation、非法 Handler 输出、非法 event、Session 后续恢复和零敏感值泄漏。
- [x] 4.2 新增 `scripts/check-plugin-rpc-validation.ts` 与根命令 `pnpm run check:plugin-rpc-validation`，组合 policy/fixture、Transport、Dispatcher、permission、storage、Runtime cleanup、tarball、workspace-boundary 和私有 deep-import/export 检查，且不新增运行时依赖。
- [x] 4.3 扩展有界 macOS WKWebView evidence，至少证明一次超限请求被拒绝、Handler hit 为零、后续合法请求仍可用，并确保 evidence 不包含 payload、URL、origin、identity、grant、request ID 或私有诊断内容。

## 5. 维护双语文档

- [x] 5.1 更新 `docs/en/architecture/extension-platform.md` 说明已交付的 RPC v1 policy、入站/出站数据流、稳定错误、诊断边界及 Task 7.5 非目标，并同步语义一致的 `docs/zh/architecture/extension-platform.md`。
- [x] 5.2 更新 `docs/en/development/validation.md` 记录聚焦命令、fixture/MessageChannel/WKWebView 证据范围和不证明的能力，并同步语义一致的 `docs/zh/development/validation.md`。

## 6. 最终验证

- [x] 6.1 依次运行 `pnpm run check:plugin-rpc-validation`、`pnpm run check:plugin-sdk-transport`、`pnpm run check:plugin-host-api-dispatcher`、`pnpm run check:plugin-scoped-storage` 和 `pnpm run check:plugin-permission-management`，修复本 change 引入的所有失败与警告。
- [x] 6.2 运行完整前端测试 `pnpm run test`，确保 RPC 变更没有破坏 Launcher、Runtime、SDK、Dispatcher、权限或存储回归。
- [x] 6.3 运行前端格式与静态检查 `pnpm run format` 后 `pnpm run check`；如格式化产生改动，复核范围并重新运行受影响测试。
- [x] 6.4 依次运行 `pnpm run typecheck` 和 `pnpm run build`，验证公共声明、私有边界和生产 bundle。
- [x] 6.5 虽然本 change 不新增 Rust authority 或 Tauri command，仍运行 `pnpm run src-tauri:format:check` 验证 Rust 格式保持干净。
- [x] 6.6 依次运行 `pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，证明现有存储、权限与桌面边界没有被前端 RPC 组合破坏。
- [x] 6.7 对任何失败命令先修复并单独重跑，再按顺序重跑 6.1–6.6 的完整最终集合，最后运行 `openspec validate validate-plugin-rpc-contracts --type change`；所有命令通过且文档镜像一致后才将实现报告为完成。
