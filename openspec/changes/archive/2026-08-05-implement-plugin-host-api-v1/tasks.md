## 1. 建立 Host 私有 Dispatcher 核心

- [x] 1.1 新增 Host 私有、按 Session 创建的 Dispatcher factory/binding 与窄依赖接口，只接受 transport lease identity、Contract-valid request 和 Host-owned cancellation signal，并保持公共 Contract、SDK 与 wire exports 不变。
- [x] 1.2 建立覆盖 Host API `0.1.0` 十个 method 的封闭 provider table：为 `runtime.get_context`、`ui.close`、`actions.open` 注册真实 provider，并让 `storage.*`、`clipboard.*` 在后续能力交付前稳定返回 `unavailable`。
- [x] 1.3 实现统一安全错误映射、currentness/cancellation 前后检查和非法 provider output 收敛，确保 unknown method、domain failure 与内部异常不泄露 identity、grant、payload、stack、path、executor 或 Host 对象。
- [x] 1.4 增加 Dispatcher 聚焦单元测试，覆盖可信 identity、伪造字段、未知/未实现 method、稳定错误、异步取消、late completion、跨 Session 隔离和无副作用失败。

## 2. 实现 Runtime Context 与事件

- [x] 2.1 实现从唯一 Host API version、当前 locale、theme、真实 provider 可用性和当前授权事实生成的复制、排序、去重、冻结 Context snapshot；初始 capabilities 只包含三个本 Task 真实可用方法。
- [x] 2.2 实现 `runtime.get_context` provider，确保真实 iframe transport 初始化可以取得 Contract-valid Context 并让 SDK 进入 `ready`，且 Context 不含 plugin/Page identity、source、Manifest request、raw grant、Registration revision、路径或 Host lifecycle 对象。
- [x] 2.3 为 session binding 接入 `runtime.context_changed` 完整 replacement：locale、theme 或 capability 实际变化时发送一次，相同 snapshot 不重复发送，authority 变化继续终止旧 Session而不通过事件重新授权。
- [x] 2.4 增加 Context/事件测试，覆盖 `en-US`/`zh-CN`、light/dark、排序 capability、空/未实现 capability 排除、重复 snapshot、identity/grant 缺失、Session replacement 和 subscriber 更新顺序。

## 3. 固化响应后副作用与当前 Page 关闭

- [x] 3.1 扩展 Host 私有 transport handler outcome，使 adapter 能先验证并成功发送 Contract result、终结 request，再执行至多一次不可序列化且不跨 wire 的 post-response effect；保持现有公共 SDK transport interface 和 private frame shape 不变。
- [x] 3.2 增加窄 App Navigation match-and-close 能力，只在 trusted `{ owner_id, page_id }` 仍匹配 active Page 时关闭，保留现有 Host UI 关闭行为并拒绝 stale Session 关闭 replacement Page。
- [x] 3.3 实现 `ui.close` provider：只接受 exact `{}`，由 Session identity 推导目标，返回 `{ accepted: true }` 后再执行带 currentness/cancellation 检查的 close effect。
- [x] 3.4 增加 transport、Navigation 与 `ui.close` 测试，证明 response-before-close、exactly-once、重复 cleanup 幂等，以及 navigation、replacement、disable、uninstall、disconnect、dispose、timeout 或 cancellation 获胜时无 late close。

## 4. 接入本插件 Action Dispatcher

- [x] 4.1 实现 `actions.open` provider，只接受 plugin-local `actionId`，从 trusted `plugin_id` 推导现有 `${plugin_id}.${actionId}` 全局 ID，并复用当前 Launcher Action Registry/Dispatcher 重新解析和执行。
- [x] 4.2 将 Action 成功、unknown/unavailable 和 executor failure 分别映射为 Contract-valid `{ opened: true }`、`not_found` 和安全 `internal_error`，禁止 core、其他插件、global ID、route 或 plugin-supplied executor。
- [x] 4.3 增加 Action/Dispatcher 回归测试，覆盖自己的可用 Page Action、core/跨插件尝试、禁用/卸载/不兼容/投影替换、stale executor、异步取消和真实导航导致 Runtime 替换时的响应与 cleanup。

## 5. 完成生产 Runtime 组合

- [x] 5.1 在 App/Plugin Runtime 组合中把现有 Navigation Service、Launcher Action Service、locale、theme 和 Runtime currentness 组装为可注入的 session-scoped Dispatcher factory，并保留测试显式 fake/unavailable binding。
- [x] 5.2 将 `PluginRuntimeFrame` 的固定 `unavailablePluginRuntimeTransportHandler` 替换为真实 Dispatcher binding，绑定 adapter emitter 与 lifecycle cleanup，确保每个 ready lease 只消费一次且 Session/Page 销毁释放所有订阅和 pending effect。
- [x] 5.3 增加生产组合和 React Runtime 集成测试，覆盖真实 SDK 初始化、三个方法 round-trip、并发/乱序、Context event、Page close、Action navigation、malformed/stale/cross-plugin Port、replacement 和零 late handler/effect。
- [x] 5.4 扩展 `check:plugin-host-api-dispatcher` 聚焦门禁及其 package/workspace drift 断言，证明公共 tarball 不泄露 Dispatcher、post-response outcome、identity、private wire、Host service 或新增 Runtime 依赖。
- [x] 5.5 更新浏览器 MessageChannel fixture 与目标 macOS WKWebView smoke，验证真实 production-style Dispatcher、响应后关闭、Action 导航、Context replacement、取消和 terminal cleanup；不把 fixture provider 描述成 storage、clipboard 或 permission 交付。

## 6. 更新维护文档与交付边界

- [x] 6.1 更新 `docs/en/architecture/extension-platform.md`、相关英文 development/validation 文档及相同路径 `docs/zh/` 镜像，说明三个真实 Dispatcher method、Context capabilities、响应后关闭和仍未实现的 storage/permission/RPC 边界。
- [x] 6.2 更新受影响的 package/workspace 使用说明与验证命令，移除“生产 Host 始终 unavailable”的过时状态，同时不得声称十个 Contract method、Milestone 5、模板、CLI 或开发模式均已交付。
- [x] 6.3 增加或更新文档/边界检查，验证英文与中文镜像、Roadmap Task/change 映射、公共 exports、依赖方向和 planned-versus-shipped 表述保持一致。

## 7. 最终验证

- [x] 7.1 顺序运行新增的 `pnpm run check:plugin-host-api-dispatcher`、现有 `pnpm run check:plugin-sdk-transport` 以及受影响的 Navigation、Action、Runtime Session/lifecycle 聚焦测试。
- [x] 7.2 运行完整前端测试 `pnpm run test`，确认 Dispatcher、SDK、Launcher、Settings、插件安装/Registration/Runtime 与既有应用行为无回归。
- [x] 7.3 运行前端格式化及静态检查 `pnpm run format`、`pnpm run check`，修复本 change 引入的全部格式、lint、边界、文档和 drift 问题。
- [x] 7.4 运行前端类型检查与构建 `pnpm run typecheck`、`pnpm run build`，确认公共 declaration、browser bundle、workspace package 和生产 App 组合成功。
- [x] 7.5 运行 Rust 格式与无回归门禁 `pnpm run src-tauri:format`、`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`；本 change 不新增 Rust command，但必须证明现有 native contract 不受影响。
- [x] 7.6 对任何失败或 warning 先修复并重跑对应命令，再按 7.1–7.5 的顺序重跑完整最终验证集，保留真实 browser/WKWebView 与 consumer 证据。
- [x] 7.7 仅在实现、文档和全部验证通过后，将 `plugin-roadmap.md` Task 5.3 标为完成且保持 5.4、5.5、5.6 与 Milestone 5 未完成；随后重跑 `pnpm run check` 和 `openspec validate implement-plugin-host-api-v1 --type change`。
