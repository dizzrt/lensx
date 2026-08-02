## 1. Package 与 workspace 基础

- [x] 1.1 建立 `packages/plugin-testkit` 的 `@lensx/plugin-testkit@0.1.0` ESM package、单一根 export、TypeScript/Rstest/build 配置、许可证和简短消费说明，并声明对 `@lensx/plugin-contract` 与 `@lensx/plugin-sdk` 公共入口的运行时依赖。
- [x] 1.2 将 Testkit 纳入 workspace lockfile、根 `build`/`typecheck`/`test`/`check` 生命周期、依赖方向和边界测试，新增可失败传播的 `check:plugin-testkit` 专用 gate，并验证 SDK 不反向依赖 Testkit。
- [x] 1.3 增加 Testkit public API/declaration 与 package boundary 测试，拒绝 deep import、Host 私有模块、React、Semi Design、Tauri、DOM、Node 文件系统和测试运行器运行时泄漏。

## 2. Manifest fixture

- [x] 2.1 实现 `createPluginManifestFixture()`，使用 Contract 当前版本常量返回相互隔离的最小有效 author input，并用真实 validator/normalizer 测试兼容结果、无 Host-owned 字段和无共享可变状态。
- [x] 2.2 实现基于 JSON Pointer 的 `mutatePluginManifestFixture(input, operations)`，支持显式 `set`/`remove`、深复制和顺序应用，测试字段删除、无效值、数组定位、转义、非法 pointer、越界操作及原输入不变。

## 3. Runtime context 与异步控制

- [x] 3.1 实现 `createPluginRuntimeContextFixture(overrides?)`，默认使用当前 Host API 版本、`en-US`、light 和空 capabilities，支持整字段覆盖并复制/冻结结果，测试中英文、明暗主题、空/非空 capabilities 以及 permission/identity 字段不进入公共输入。
- [x] 3.2 实现 runner-neutral 的 `PluginTestCancellationController` 和 `createDeferred<Value>()`，测试 signal listener 增删、幂等 abort、单次 Promise settle、无 DOM/runner 依赖和测试实例隔离。

## 4. 语义 Fake Transport 与 SDK 场景

- [x] 4.1 实现 `FakePluginSdkTransport` 的默认连接、显式 connect/request handler、抽象事件、断开、dispose 和只读观测快照，保证不同实例的 handler、记录、listener 与 context 隔离。
- [x] 4.2 测试 fake 的请求/signal 记录、事件订阅与幂等取消、重复断开/清理、pending handler 和迟到结果，同时断言公共 API 不包含 RPC envelope、request ID、nonce、origin、Window、MessagePort、postMessage 或 Host identity。
- [x] 4.3 使用真实 `createPluginSdk` 覆盖初始化成功、无效/不兼容 context、transport failure、取消、超时、Host 断开、显式重试、状态订阅和幂等 dispose；确认 Testkit 不增加 raw Host method client、permission harness 或虚构 Host API 错误。

## 5. 发布与仓库外消费门禁

- [x] 5.1 为 Testkit 实现 `build`、`typecheck`、`test`、`check` 和 `test:pack`，校验 tarball 文件白名单、单一根入口、公共声明、许可证、说明文件及 Contract/SDK 依赖元数据，并拒绝测试、脚本、Host 私有源码和未声明 deep entry 泄漏。
- [x] 5.2 增加非 workspace 的隔离 Testkit consumer，安装真实 Contract、SDK 与 Testkit tarball，在无 DOM 的 ES2022 环境中完成 typecheck 和 ESM smoke test，覆盖 Manifest/context fixture、SDK 初始化、观测与 dispose，但不形成 Task 1.6 的正式插件模板。
- [x] 5.3 让 `check:plugin-testkit` 串联 package check/build/pack、Contract/SDK tarball 前置验证以及 workspace boundary/lifecycle 测试，并增加能够捕获发布内容、依赖方向和根聚合 drift 的失败用例。

## 6. 文档与路线图对齐

- [x] 6.1 更新 `docs/en/architecture/extension-platform.md` 和 `docs/en/development/plugin-workspace.md`，并同步相同相对路径的 `docs/zh/` 简体中文镜像，记录 Testkit 公共 API、典型生命周期用法、验证命令、依赖边界与后续 Host API/权限/Runtime 扩展点。
- [x] 6.2 收窄 `plugin-roadmap.md` Task 1.5 的目标、范围和完成标准，移除初版 permission harness、真实 Host API 调用和页面 Runtime 承诺，保留 checkbox 未完成且不提前写入 archive 链接，并确认 Task 1.6 仍只依赖已交付的 Testkit core。
- [x] 6.3 校验英文/简体中文文档语义等价、索引和相对链接有效，且任何文档都没有把 fake transport、capability ID 或隔离 consumer 描述成真实 Host API、权限授权、iframe Runtime、插件执行或正式项目模板。

## 7. 最终验证

- [x] 7.1 运行 `pnpm run check:plugin-contract`、`pnpm run check:plugin-sdk`、`pnpm run check:plugin-testkit`、`pnpm run test:workspace-boundaries` 和 `pnpm run test:workspace-lifecycle`，确认 Contract → SDK → Testkit、真实 tarball 和 workspace 门禁全部通过。
- [x] 7.2 运行完整前端/共享验证 `pnpm run test`、`pnpm run check`、`pnpm run typecheck` 和 `pnpm run build`；其中 `pnpm run check` 必须完成 Biome 格式与静态检查以及 workspace boundary 检查。
- [x] 7.3 尽管本 change 不修改 Rust/Tauri 运行时，仍运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，确认公共 Contract 与 workspace 变化没有造成跨层回归。
- [x] 7.4 运行 `openspec validate create-plugin-testkit --type change --strict`、`openspec validate --all --strict`、双语文档镜像/链接检查和 `git diff --check`，确认规划、规范、文档和文件格式一致。
- [x] 7.5 修复本 change 引入的全部 warning 与 error，重跑任何失败命令，然后重跑 7.1–7.4 的完整最终验证集并记录最终结果。
