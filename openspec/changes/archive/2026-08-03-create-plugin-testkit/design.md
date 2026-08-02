## Context

`@lensx/plugin-contract@0.1.0` 已经拥有 Manifest Schema、生成类型和两阶段校验/规范化 API；`@lensx/plugin-sdk@0.1.0` 已经拥有 Runtime context、语义 transport、取消、超时、错误和客户端生命周期。SDK 自身测试中存在一个私有 fake transport、取消 signal 和 deferred helper，但发布包明确排除测试与 fixture，仓库外插件作者无法消费它们。

Task 1.5 位于 Plugin Developer Preview，而真实 iframe Runtime、Runtime session、Host API contract、SDK iframe transport 和权限管理位于后续 Milestone 4、5。当前 `PluginSdkClient` 也刻意不暴露任意字符串 Host 方法调用。因此初版 Testkit 必须只模拟已经公开的语义边界，不能提前定义未来 wire protocol、Host API 或授权结果。

本 change 面向仓库内外的 TypeScript 插件作者和插件工具维护者。它不涉及产品 UI、Rust/Tauri 行为或桌面 Host 启动路径，但会横跨新的公共 package、workspace 聚合命令、pack consumer 及双语工程文档。

## Goals / Non-Goals

**Goals:**

- 发布一个只有根入口的 `@lensx/plugin-testkit@0.1.0`，在无 DOM、无 Tauri、无桌面 Host 的 ES2022 环境中使用。
- 提供可预测、相互隔离且不修改调用者输入的 Manifest、Runtime context、transport、取消和异步控制工具。
- 让插件测试能够使用真实 Contract 与 SDK 覆盖初始化成功、无效/不兼容 context、transport failure、取消、超时、断开、事件和 dispose。
- 让公共声明、依赖方向、tarball 内容和仓库外运行时消费都受到自动门禁保护。
- 为后续 Host API、权限和 Runtime harness 保留在同一 package 上增量扩展的空间，但不承诺尚未设计的 API。

**Non-Goals:**

- 不增加或改变 `PluginSdkClient` 的调用能力，不提供 raw Host method client。
- 不定义 Host API method/params/result/event/error Schema，不模拟 `PermissionDenied`、未知方法或参数校验。
- 不把 Runtime context 的 capability ID 当作 Manifest permission request、用户授权或 session grant。
- 不实现 `Window`、`MessagePort`、`postMessage`、nonce、origin、RPC envelope、iframe、CSP 或页面 Runtime。
- 不提供 React、Semi Design、DOM mount、视觉测试或测试运行器专用 matcher/plugin。
- 不把隔离 consumer 扩展为 Task 1.6 所负责的正式插件项目模板。

## Decisions

### 1. Testkit 是位于 SDK 之上的独立公共 package

依赖方向固定为：

```text
@lensx/plugin-contract
          │
          ▼
 @lensx/plugin-sdk
          │
          ▼
@lensx/plugin-testkit  ──▶ plugin author tests
```

Testkit 以普通 runtime dependencies 消费 Contract 和 SDK 的公开根入口，不能 deep import 它们的源码、测试或 fixture。Testkit 只公开一个根入口，使用当前 Node 24 / ESM / TypeScript / Rstest 工具链完成自身构建和验证，但运行时不依赖 Rstest、Vitest、React、DOM、Semi Design、Tauri、根 Host 或 Node 文件系统。

备选方案是从 SDK 导出当前私有 fake。该方案会把测试工具塞入生产 SDK 的公共面，也无法自然承载 Manifest fixture，故不采用。另一个方案是让 SDK 测试反向依赖 Testkit；这会形成 `SDK → Testkit → SDK` 的测试依赖环，故 SDK 的白盒私有 fake 保留，Testkit 仅依据 SDK 公共接口独立实现黑盒测试工具。

### 2. Manifest 有效基线与无效变体使用两条显式路径

Testkit 提供 `createPluginManifestFixture()`，每次返回一份新的、最小但完整的当前版本 `PluginManifestInput`。基线数据使用 Contract 的当前版本常量，并在 Testkit 自身测试中通过真实 `validatePluginManifest` 和 `normalizePluginManifest` 验证；Testkit 不复制 Schema、诊断排序或规范化算法。

Testkit 另提供 `mutatePluginManifestFixture(input, operations)`。operations 只使用 JSON Pointer 定位，并显式执行 `set` 或 `remove`；函数先深复制 JSON 数据，再按顺序应用操作并返回 `unknown`。数组只能被整体设置或通过明确索引定位，不提供隐式 deep merge。这样既能稳定构造无效输入，又不会让一个“typed override”假装保证语义有效。

备选方案是 `DeepPartial<PluginManifestInput>` 自动深合并。它对数组、删除字段和无效输入的行为模糊，也容易在 Manifest 演进时掩盖缺失字段，故不采用。

### 3. Runtime context fixture 只表达当前 SDK 信任边界

`createPluginRuntimeContextFixture(overrides?)` 默认使用 Contract 的当前 Host API 版本、`en-US`、`light` 和空 capability 列表。overrides 只允许替换 `hostApiVersion`、`locale`、`theme` 与整组 `capabilities`。每次调用都复制并冻结结果及 capability 列表，避免测试间共享可变状态。

合法 locale/theme 的覆盖用于双语言和明暗主题场景；不兼容版本、非法字段或缺失字段通过 fake transport 的 connect handler 直接返回 `unknown`，交由真实 SDK 校验。Testkit 不向 context 添加 plugin identity、Page identity、source 或 permission 字段。

### 4. Fake transport 是可编排的语义 adapter，不是 wire 模拟器

`FakePluginSdkTransport` 实现公开的 `PluginSdkTransport`。默认 `connect` 返回新的有效 context；消费者可通过显式 handler 配置连接和请求结果，使用 `emit` 发送抽象事件，使用 `disconnect` 通知断开，并使用 deferred helper 保持操作 pending。handler 接收 SDK 传入的结构化 cancellation signal，因而测试可以观察取消，而不需要 DOM `AbortSignal`。

Fake 对外提供连接尝试、请求记录、传入 signal、订阅和 dispose 次数的只读快照。不同实例不得共享 handler、记录、listener 或 context。unsubscribe、disconnect 和 dispose 的重复调用必须可预测并释放 listener；迟到的结果是否被忽略仍由真实 SDK 行为决定。

Transport 的 `request` 继续是语义 adapter 接口，可供 Testkit 自测和未来 typed SDK adapter 使用；本 change 不在 `PluginSdkClient` 上增加任意字符串调用入口，也不把 fake request 声称为真实 Host API 调用。

备选方案是模拟 JSON-RPC/postMessage。当前 wire、session identity 和 origin 校验尚未定义，这会制造第二套事实源，故延后到相应 Runtime/Host API change。

### 5. 取消和 pending 控制不绑定测试运行器

Testkit 提供实现 `PluginSdkCancellationSignal` 的 `PluginTestCancellationController`，以及通用 `createDeferred<Value>()`。控制器的 `abort()`、listener 移除和重复调用具有幂等语义；deferred 只暴露 promise、resolve 和 reject，不安装 fake clock，也不修改全局 timer。

超时测试继续使用 SDK 自己的 timeout 配置，Testkit 只通过 unresolved deferred 创建 pending 条件。这样 Rstest、Vitest 或其他运行器可以自行选择真实 timer 或其 runner-level fake timer，而 Testkit 不依赖任何 runner API。

### 6. 真实 tarball consumer 是发布门禁，不是项目模板

Testkit 提供 `build`、`typecheck`、`test`、`check` 和 `test:pack`。根命令和专用 `check:plugin-testkit` 覆盖 package。pack gate 构建真实 Contract、SDK 和 Testkit tarball，校验根入口、文件白名单、声明和依赖元数据，再在不属于 workspace 的隔离 consumer 中安装这些 tarball，完成无 DOM TypeScript 编译和 ESM Runtime smoke test。

隔离 consumer 只证明仓库外可以创建 Manifest/context fixture、用 fake transport 初始化 SDK、观察状态并 dispose。正式 framework-neutral/React 插件模板及其使用示例仍由 Task 1.6 交付，避免形成“Task 1.5 的验收依赖 Task 1.6、Task 1.6 又依赖 Task 1.5”的循环。

### 7. 文档只承诺当前 Testkit core

英文架构与开发文档及其简体中文镜像新增 Testkit package、公共入口、典型用法、验证命令和边界说明。文档必须把 Testkit 模拟与真实 Host 行为分开，明确 permission、Host API、iframe 和页面 Runtime 尚未交付。`plugin-roadmap.md` 同步收窄 Task 1.5 的目标、范围和完成标准，但 apply 阶段保持 checkbox 未完成且不写入尚不存在的 archive 链接；归档成功后再由归档流程更新完成状态。包级 README 只保留消费入口和指向项目工程文档的简短说明，不承载完整架构设计。

## Risks / Trade-offs

- [SDK 私有 fake 与公共 Testkit fake 存在少量行为重复] → 两者都通过同一 SDK 公共接口和共享生命周期场景验证；不以破坏依赖方向为代价强行复用私有测试源码。
- [公开 fake API 可能过早固化] → 首版只暴露语义 handler、事件、断开、记录和清理；不暴露 wire 字段、Host identity 或尚未定义的错误码。
- [基线 Manifest 随 Contract 演进而 drift] → 使用 Contract 版本常量，并在 Testkit 单测与根级 drift gate 中以真实 validator/normalizer 校验。
- [真实 timer 使超时测试变慢或偶发] → Testkit 提供 deferred 和结构化取消控制；package 测试使用短但有界的 timeout，外部 consumer 不依赖时间敏感断言。
- [消费者误把 capability 当权限] → 类型、文档和测试都只把 capabilities 当不透明 ID；初版不导出 permission harness 或 grant API。
- [未来 Host API 扩展要求 breaking change] → Host API、Permission 和 Runtime harness 在各自契约确定后以新增 API 为主；若必须破坏现有 Testkit API，则按独立 package SemVer 处理。

## Migration Plan

1. 新增 Testkit package 和 package-local 验证，不改变现有 Contract、SDK 或 Host 入口。
2. 将 Testkit 纳入 workspace 聚合与边界门禁，再加入真实 tarball 外部 consumer。
3. 更新双语文档，最后运行完整前端、Rust、pack 和 OpenSpec 验证。

该能力是纯新增且没有持久化数据迁移。回滚时可以移除 Testkit package、专用根命令、隔离 consumer 和对应文档；Contract、SDK、Host 与用户数据不需要恢复操作。

## Open Questions

无。Host API、权限和 Runtime harness 的具体公共 API 必须由后续对应 change 决定，本 change 不预留推测性的类型或占位方法。
