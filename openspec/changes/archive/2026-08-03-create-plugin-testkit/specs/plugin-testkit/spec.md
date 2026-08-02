## ADDED Requirements

### Requirement: 系统 MUST 提供受约束且框架无关的公共 Plugin Testkit package

系统 MUST 提供可独立构建、测试和打包的 `@lensx/plugin-testkit@0.1.0` workspace package。package MUST 只通过公开根入口依赖 `@lensx/plugin-contract` 与 `@lensx/plugin-sdk`，并且其公共运行时和类型入口 MUST NOT 依赖私有根 Host、`src/app/**`、React、Semi Design、Tauri、DOM 全局类型、Node 文件系统 API、Host 内部样式或任一测试运行器 API。未声明的 deep import MUST NOT 成为公共 API。

#### Scenario: 仓库外消费者使用 Testkit 根入口

- **WHEN** workspace 外消费者从真实 tarball 安装 Contract、SDK 和 Testkit，并只导入 `@lensx/plugin-testkit`
- **THEN** 消费者在没有 DOM、React、Semi Design、Tauri、Host 私有模块或测试运行器类型的 ES2022 环境中完成 TypeScript 编译和 ESM Runtime smoke test

#### Scenario: 消费者尝试未声明的 deep import

- **WHEN** 消费者导入 Testkit 源码、测试、构建脚本或未在 package exports 中声明的内部模块
- **THEN** package resolution 拒绝该导入

#### Scenario: 两个 Testkit 实例被并行使用

- **WHEN** 两个测试分别创建 fixture、取消控制器或 fake transport
- **THEN** 任一测试的 handler、记录、listener、context 或取消状态不会改变另一个测试的状态

### Requirement: Testkit MUST 使用真实 Contract 创建和变换 Manifest fixture

Testkit MUST 提供每次都返回独立、最小、完整且满足当前 Manifest Contract 的 author-input fixture factory。Testkit MUST 使用 `@lensx/plugin-contract` 的公开类型、当前版本常量以及真实校验/规范化 API验证该基线，MUST NOT 复制 Manifest Schema、诊断排序、兼容性或规范化算法。Testkit MUST 另提供基于 JSON Pointer 的显式 `set`/`remove` mutation helper，以深复制输入、按顺序应用操作并返回 `unknown`；helper MUST NOT 修改调用者输入，也 MUST NOT 隐式 deep merge 数组或对象。

#### Scenario: 创建当前版本的有效 Manifest fixture

- **WHEN** 消费者创建一个默认 Manifest fixture 并依次交给公开的 Manifest validator 与 normalizer
- **THEN** validator 接受该输入，normalizer 返回当前版本兼容的确定结果，并且 fixture 不含 Host-owned registration、授权或 Runtime 状态

#### Scenario: 重复创建 Manifest fixture

- **WHEN** 消费者创建两份默认 fixture 并修改其中一份的嵌套值
- **THEN** 另一份 fixture 和 Testkit 后续返回的默认 fixture 保持不变

#### Scenario: 显式构造无效 Manifest

- **WHEN** 消费者通过 JSON Pointer mutation 删除必填字段或设置一个无效值
- **THEN** mutation helper 返回未修改原输入的候选 `unknown` 值，并且真实 Contract validator 按其稳定诊断拒绝该候选值

#### Scenario: mutation 定位无效

- **WHEN** mutation 使用非法 JSON Pointer、越界数组索引或无法完成的操作
- **THEN** helper 在返回部分变换结果前以确定的 Testkit 配置错误失败，并且原输入保持不变

### Requirement: Testkit MUST 创建只表达当前 SDK 边界的 Runtime context fixture

Testkit MUST 提供 Runtime context fixture factory，其默认值 MUST 使用 Contract 的当前 Host API 版本、`en-US` locale、`light` theme 和空 capability 列表。消费者 MUST 能整体替换 Host API 版本、locale、theme 和 capability 列表；每次结果及其 capability 列表 MUST 被复制和冻结。fixture MUST NOT 接受或添加 plugin identity、Page identity、安装来源、Manifest permission request、用户授权或 session grant。

#### Scenario: 创建默认 Runtime context

- **WHEN** 消费者创建默认 context 并通过 fake transport 初始化 SDK client
- **THEN** client 进入 `ready`，context 使用当前兼容 Host API 版本、英文、light theme 和空 capability 列表

#### Scenario: 覆盖 locale、theme 和 capabilities

- **WHEN** 消费者创建 `zh-CN`、dark 和非空唯一 capability 列表的 context
- **THEN** SDK 接受对应值，调用者不能通过修改输入数组或返回结果改变 context snapshot

#### Scenario: 测试无效或不兼容 context

- **WHEN** fake transport 被配置为返回非法 context 或 SDK 不支持的 Host API 版本
- **THEN** 真实 SDK 分别返回其稳定的 `invalid_runtime_context` 或 `incompatible_host_api` 错误，Testkit 不替代 SDK 执行校验

#### Scenario: capability 被误作权限授权

- **WHEN** context fixture 包含一个 capability ID
- **THEN** Testkit 不产生 permission grant、permission decision 或任何对应 Host API 执行能力

### Requirement: Fake transport MUST 可编排并提供受控观测

Testkit MUST 提供实现公开 `PluginSdkTransport` 的语义 fake transport。fake MUST 默认以新的有效 Runtime context 完成连接，并 MUST 允许消费者显式配置 connect 和 request handler、发送抽象事件、通知断开以及保持操作 pending。handler MUST 接收 SDK 提供的结构化 cancellation signal。fake MUST 提供连接尝试、请求、signal、订阅和 dispose 行为的只读观测快照，MUST NOT 暴露或要求 RPC envelope、request ID、nonce、origin、`Window`、`MessagePort`、`postMessage`、Host object 或可信身份字段。

#### Scenario: 默认 fake 完成 SDK 初始化

- **WHEN** 消费者将一个未额外配置的 fake transport 注入新 SDK client 并初始化
- **THEN** client 进入 `ready`，fake 记录一次连接尝试，并且观测记录不暴露私有 wire 数据

#### Scenario: 配置 transport failure

- **WHEN** connect handler 以任意私有异常失败
- **THEN** 真实 SDK 将结果映射为安全的 `transport_failure`，fake 的公共观测不泄露该异常的 stack、Host object 或 wire payload

#### Scenario: 发送和取消订阅抽象事件

- **WHEN** 消费者订阅一个抽象事件、通过 fake 发送 payload、重复取消订阅并再次发送事件
- **THEN** listener 只收到取消订阅前的 payload，重复取消订阅没有额外副作用

#### Scenario: Host 断开并产生迟到结果

- **WHEN** 初始化或语义请求仍 pending 时 fake 通知断开，随后 pending handler 才完成
- **THEN** SDK 进入 `disconnected` 并中止其 signal，迟到结果不会恢复 client 或再次通知消费者

#### Scenario: fake 被重复清理

- **WHEN** SDK 或消费者重复执行 dispose
- **THEN** fake 的 listener 被释放，dispose 观测保持可预测，并且不会影响其他 fake 实例

### Requirement: Testkit MUST 提供框架无关的取消与异步控制工具

Testkit MUST 提供实现 `PluginSdkCancellationSignal` 的取消控制器以及通用 deferred factory。取消控制器 MUST 支持结构化 signal、listener 增删和幂等 abort；deferred MUST 只暴露 promise、resolve 和 reject。两者 MUST NOT 修改全局 timer、安装 runner matcher，或要求 DOM `AbortController` 与特定测试运行器。

#### Scenario: 调用者取消初始化

- **WHEN** connect handler 保持 pending，消费者使用 Testkit 取消控制器取消 SDK 初始化
- **THEN** SDK 返回 `cancelled`，transport signal 被中止，取消 listener 被清理，并且迟到 resolve 不改变 client 状态

#### Scenario: SDK 操作超时

- **WHEN** handler 使用 deferred 持续 pending，且 SDK 配置的 timeout 到期
- **THEN** SDK 返回 `timeout`、中止 transport signal 并忽略 deferred 的迟到完成

#### Scenario: 重复 abort 或完成 deferred

- **WHEN** 消费者重复 abort 同一控制器，或在 deferred 已 settle 后再次 resolve/reject
- **THEN** 已公布的取消状态和 Promise 结果保持不变，不产生额外 listener 通知

### Requirement: Testkit MUST 只验证当前公开 SDK 生命周期而不伪造未来 Host 能力

Testkit MUST 支持插件作者覆盖初始化成功、重试、无效或不兼容 context、取消、超时、transport failure、Host 断开、事件取消订阅和幂等 dispose。初版 Testkit MUST NOT 在 `PluginSdkClient` 上增加任意字符串调用方法，MUST NOT 定义真实 Host API method/error Schema、permission harness、授权结果、iframe transport、Runtime session、页面 Runtime 或插件执行路径。Transport 的抽象 `request` MUST NOT 被描述为已经交付的 Host API 调用。

#### Scenario: 初始化失败后显式重试

- **WHEN** 第一次连接因取消、超时或 transport failure 返回到 `idle`，随后消费者重新配置 fake 并再次初始化
- **THEN** 第二次初始化可以成功，Testkit 不自动重试或隐藏第一次 SDK 错误

#### Scenario: client 被幂等 dispose

- **WHEN** 消费者对任意未 dispose 的 client 调用一次或多次 dispose
- **THEN** client 最终保持 `disposed`，pending 操作和 listener 被释放，transport 至多由 SDK 清理一次

#### Scenario: 消费者尝试获取权限判定

- **WHEN** 消费者检查初版 Testkit 公共入口
- **THEN** 公共入口不包含 permission grant/deny harness、Host permission catalog 或虚构的稳定 PermissionDenied 错误

#### Scenario: 消费者尝试模拟 iframe wire

- **WHEN** 消费者只持有初版 Testkit fake transport
- **THEN** 其 API 不允许配置 origin、nonce、window、message port 或 RPC envelope，也不声称验证 iframe 来源安全

### Requirement: Testkit MUST 参与完整 workspace、发布与文档验证

Testkit package MUST 声明有实际作用的 `build`、`typecheck`、`test`、`check` 和真实 tarball 验证脚本，根聚合命令与专用 Testkit gate MUST 覆盖这些脚本。真实 tarball gate MUST 校验文件白名单、根入口、公共声明与依赖元数据，并 MUST 在隔离的非 workspace consumer 中安装真实 Contract、SDK 和 Testkit tarball。英文架构与开发文档及相同相对路径的简体中文镜像 MUST 说明 Testkit 用法、边界和验证方式，并 MUST 明确它不交付真实 Host API、权限、iframe 或插件执行。

#### Scenario: 根命令覆盖 Testkit

- **WHEN** 开发者运行根 `build`、`typecheck`、`test` 或 `check`
- **THEN** 对应 Testkit package lifecycle script 被执行，且失败会传递到根命令

#### Scenario: Testkit tarball 被隔离消费

- **WHEN** pack gate 安装真实 Contract、SDK 和 Testkit tarball
- **THEN** 隔离 consumer 可以创建 Manifest/context fixture、使用 fake transport 初始化 SDK、观察状态并 dispose，且不读取 lensX 源码或启动桌面 Host

#### Scenario: Testkit 发布内容发生 drift

- **WHEN** tarball 泄漏测试、构建脚本、Host 私有源码或未声明 deep entry，或者缺失运行时 JavaScript、声明、许可证、说明文件或依赖元数据
- **THEN** Testkit 发布门禁失败并报告 drift

#### Scenario: 开发者阅读双语 Testkit 文档

- **WHEN** 开发者阅读英文或简体中文插件架构与 workspace 文档
- **THEN** 两种语言以等价语义描述公共 helper、典型生命周期测试和根/包验证命令
- **THEN** 两种语言都不会把 Testkit 模拟描述为已实现的 Host API、权限决策、iframe Runtime、正式项目模板或插件执行能力
