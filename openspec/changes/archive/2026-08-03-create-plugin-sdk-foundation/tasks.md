## 1. 建立 SDK package 与公共边界

- [x] 1.1 创建 `packages/plugin-sdk`，补齐 `package.json`、TypeScript/Rstest 配置、LICENSE、ESM build 以及有意义的 `build`、`typecheck`、`test`、`check`、`test:pack` lifecycle scripts，并声明 `@lensx/plugin-contract` 为唯一 workspace runtime dependency。
- [x] 1.2 定义单一根 package export、`PLUGIN_SDK_VERSION`、`PLUGIN_SDK_SUPPORTED_HOST_API_RANGE` 及全部公共类型出口，确保未声明 deep import 无法解析且不导出 Host、React、Semi、Tauri、DOM 全局或 Node filesystem 类型。
- [x] 1.3 增加 SDK 公共 API typecheck fixture 和 package boundary 测试，覆盖合法外部消费、禁止的任意 raw Host method client API、结构兼容取消 signal 以及受限 exports。

## 2. 实现版本、Context 与错误基础

- [x] 2.1 实现 package-private SemVer 解析/比较和 SDK Host API 半开范围检查，复用 `@lensx/plugin-contract` 的当前 Host API 版本常量，不导出第二套当前版本或通用 SemVer API。
- [x] 2.2 定义并实现 `PluginRuntimeContext` 的运行时校验、复制与冻结，覆盖 Host API version、`en-US`/`zh-CN`、`light`/`dark`、空 capabilities、唯一非空 capability ID 以及无效输入的原子拒绝。
- [x] 2.3 定义 `PluginSdkError` 与稳定 error codes，统一映射取消、超时、断开、销毁、不兼容版本、非法 context、非法参数和未知 transport failure，并确保不泄漏原始异常、stack、Host 对象或 wire 数据。
- [x] 2.4 为 SemVer boundary/prerelease、兼容/不兼容 Host API、有效/无效 context、不可变 snapshot 和安全错误映射增加 package unit tests。

## 3. 实现 Transport 语义与 SDK Client 生命周期

- [x] 3.1 定义 framework-neutral `PluginSdkTransport` 连接、抽象请求、抽象事件、断开订阅和销毁 interface，以及 package 内部 fake transport fixture；公共类型不得出现 request ID、nonce、identity、origin、Window、MessagePort、postMessage 或 JSON-RPC envelope。
- [x] 3.2 实现 SDK operation runner：10000 毫秒默认 timeout、正有限整数覆盖、AbortSignal-compatible 取消、transport 取消传播、timer/listener 清理和迟到结果抑制。
- [x] 3.3 实现 `createPluginSdk` 实例 client 及 `idle → initializing → ready/disconnected → disposed` 状态转换、并发初始化合并、失败后显式重试、只读 context、状态订阅和幂等 dispose。
- [x] 3.4 实现断开/销毁时的 pending operation 终止、listener 清理和新操作拒绝；不实现自动重连、真实 session 或任意 raw Host API client method。
- [x] 3.5 增加 lifecycle unit tests，覆盖多 client 隔离、成功初始化、并发合并、timeout/cancel/transport failure 重试、事件 unsubscribe、断开、重复 dispose、迟到结果及 disposed 后拒绝。

## 4. 发布验证、文档与路线图状态

- [x] 4.1 建立确定性的 SDK build/pack 校验，检查 tarball 文件列表、exports、声明与 runtime dependencies，并排除 tests、fixtures、scripts 和 Host 私有源码。
- [x] 4.2 在隔离 external consumer 中安装真实 Plugin Contract 与 SDK tarball，只通过公共入口完成无 DOM TypeScript typecheck 和 SDK lifecycle runtime smoke test。
- [x] 4.3 更新 workspace lifecycle/boundary fixtures 与必要的根验证入口，证明根 `build`、`typecheck`、`test` 和 `check` 覆盖 SDK package，且现有 Contract package 与 Host 行为保持不变。
- [x] 4.4 更新 `docs/en/architecture/extension-platform.md` 和 `docs/en/development/plugin-workspace.md`，记录 SDK 公共 API、生命周期、context、版本、错误、transport/Testkit 边界和验证命令。
- [x] 4.5 同步更新 `docs/zh/architecture/extension-platform.md` 与 `docs/zh/development/plugin-workspace.md`，逐项核对与 canonical English 文档语义一致。
- [x] 4.6 在实现、测试和双语文档完成后，将 `plugin-roadmap.md` 的 Task 1.3 标记为完成，同时保持 iframe Runtime、Host API、权限、插件执行和公开 Testkit fake 为未交付状态。

## 5. 最终验证

- [x] 5.1 运行 SDK focused build、typecheck、test、check、真实 tarball consumer 和 workspace boundary/lifecycle tests；确认受限 exports、无 DOM 公共声明、版本/context/lifecycle/错误语义全部通过。
- [x] 5.2 运行完整前端验证 `pnpm run test`、`pnpm run format`、`pnpm run check`、`pnpm run typecheck` 和 `pnpm run build`，修复本 change 引入的全部 warning/error。
- [x] 5.3 运行完整 Rust/Tauri 验证 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`；虽然本 change 不应修改 Rust Runtime，仍以这些命令证明现有跨层契约未回归。
- [x] 5.4 对任何失败先运行对应修复/格式化命令，再重跑失败命令；最后重新运行 5.1–5.3 的完整验证集合，并执行 `openspec validate create-plugin-sdk-foundation --type change`，确认所有 warning/error 已清零且 change 与实际实现一致。
