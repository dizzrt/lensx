## ADDED Requirements

### Requirement: 系统必须提供受限且框架无关的公共 Plugin SDK package

系统 MUST 提供可独立构建、测试和打包的公共 workspace package `@lensx/plugin-sdk`。其公开 Runtime 与类型入口 MUST NOT 依赖 private root Host、`src/app/**`、React、Semi Design、Tauri、DOM 全局类型、Node filesystem API 或 Host 内部样式；未在 package exports 中声明的路径 MUST NOT 成为公共 API。

#### Scenario: 外部 consumer 使用 SDK 公共入口

- **WHEN** workspace 外的 consumer 从真实 SDK tarball 安装 package，并只导入声明的公共入口
- **THEN** consumer 的 TypeScript 编译和 ESM Runtime smoke test 成功
- **THEN** consumer 无需访问 lensX 源码、React、Semi Design、Tauri、DOM lib 或 Node filesystem API

#### Scenario: Consumer 尝试 deep import

- **WHEN** consumer 导入未在 package exports 中声明的 SDK 源码、测试、fixture 或内部模块
- **THEN** package resolution 拒绝该导入

#### Scenario: 检查 SDK 公共声明边界

- **WHEN** repository 验证 SDK 生成的公共声明和 Runtime 依赖
- **THEN** 验证拒绝 Host 私有类型、UI 框架、Tauri、DOM 全局类型或未声明 runtime dependency 的泄漏

### Requirement: SDK client 必须使用实例化且可预测的生命周期

系统 MUST 通过显式 factory 创建彼此隔离的 SDK client，不得使用进程级或模块级 singleton。client MUST 暴露 `idle`、`initializing`、`ready`、`disconnected` 和 `disposed` 的只读生命周期状态，并 MUST 提供初始化、状态订阅和幂等销毁能力。

#### Scenario: 成功初始化独立 client

- **WHEN** 两个 SDK client 使用各自 transport 初始化成功
- **THEN** 每个 client 独立从 `idle` 进入 `initializing` 再进入 `ready`
- **THEN** 一个 client 的状态、context、订阅或销毁不改变另一个 client

#### Scenario: 合并并发初始化

- **WHEN** 同一 `idle` client 在首次初始化尚未完成时收到多个初始化调用
- **THEN** client 只启动一次 transport 初始化
- **THEN** 所有调用观察同一个成功结果或同一个稳定 SDK 错误

#### Scenario: 从可恢复初始化失败重试

- **WHEN** 初始化因 timeout、cancelled 或 transport failure 失败
- **THEN** client 返回 `idle` 且不保留 listener 或 pending operation
- **THEN** 调用方可以显式再次初始化，SDK 不自动重试

#### Scenario: Transport 断开连接

- **WHEN** ready client 的 transport 报告断开
- **THEN** client 进入 `disconnected`，终止 pending operation，并拒绝新的通信操作
- **THEN** SDK 不自动建立新 session

#### Scenario: 幂等销毁 client

- **WHEN** 调用方一次或多次销毁任意非 disposed client
- **THEN** client 最终处于 `disposed`，transport 最多销毁一次，所有 SDK listener 和 pending operation 均被释放
- **THEN** 后续初始化或通信尝试以 `disposed` 错误失败

### Requirement: SDK 必须定义不泄漏 wire protocol 的 transport 抽象

系统 MUST 公开 framework-neutral `PluginSdkTransport` 注入边界，表达连接、抽象请求、抽象事件、断开通知和销毁语义。该公共 interface MUST NOT 包含 request ID、nonce、plugin identity、origin、`Window`、`MessagePort`、`postMessage`、JSON-RPC envelope 或 Host 私有类型。`PluginSdkClient` MUST NOT 暴露接受任意 method 字符串的 raw Host API 调用入口。

#### Scenario: 在非浏览器环境注入测试 transport

- **WHEN** 测试在没有 DOM 或 Tauri 的环境中实现公共 transport interface 并将其注入 SDK client
- **THEN** 测试可以驱动初始化、请求结果、事件、取消、超时、断开和销毁语义
- **THEN** SDK package 不要求真实 iframe transport

#### Scenario: 检查公共 transport 类型

- **WHEN** consumer 检查 SDK 公共 transport 声明
- **THEN** 声明只描述语义 operation 和 listener，不暴露或要求构造私有 wire envelope、可信身份或 Host 对象

#### Scenario: 插件尝试任意调用 Host method

- **WHEN** 插件作者只持有公开 `PluginSdkClient`
- **THEN** client 不提供以任意字符串绕过未来 typed Host API method 的公共调用接口

### Requirement: SDK 必须统一取消、超时、事件和迟到结果语义

系统 MUST 对初始化和 SDK 管理的请求应用可配置的正有限 timeout，默认值 MUST 为 10000 毫秒。取消输入 MUST 接受与原生 `AbortSignal` 结构兼容且不要求 DOM 类型库的 signal。事件订阅 MUST 返回幂等 unsubscribe；operation 取消、超时、断开或销毁后到达的结果和事件 MUST NOT 改变 client 状态或再次通知 consumer。

#### Scenario: Operation 正常完成

- **WHEN** transport 在 timeout 前成功完成未取消的 operation
- **THEN** SDK 只交付一次成功结果并清理 timer 与取消 listener

#### Scenario: 调用方取消 operation

- **WHEN** 调用方提供的兼容 signal 在 operation 完成前变为 aborted
- **THEN** SDK 以 `cancelled` 错误结束 operation，并通知 transport 停止工作
- **THEN** transport 的迟到结果被忽略

#### Scenario: Operation 超时

- **WHEN** transport 未在默认或显式覆盖的 timeout 内完成 operation
- **THEN** SDK 以 `timeout` 错误结束 operation，触发 transport 取消并清理相关资源

#### Scenario: 配置非法 timeout

- **WHEN** 调用方提供零、负数、非有限数或非整数 timeout
- **THEN** SDK 在启动 transport operation 前以稳定的参数错误拒绝配置

#### Scenario: 取消事件订阅

- **WHEN** consumer 一次或多次调用某个事件订阅返回的 unsubscribe
- **THEN** 该 listener 不再收到后续事件，且重复 unsubscribe 不产生副作用

### Requirement: Runtime context 必须只读、版本化并经过运行时验证

系统 MUST 定义与 client 生命周期状态分离的 `PluginRuntimeContext`。首版 context MUST 包含 Host API SemVer、`en-US | zh-CN` locale、`light | dark` theme 和只读 capability ID snapshot。空 capability snapshot MUST 有效；非空 capability ID MUST 唯一且非空。SDK MUST 在 client 进入 `ready` 前验证、复制并冻结 context，且 context MUST NOT 接受插件提供的身份、权限、来源、安装或 Host 生命周期事实。

#### Scenario: 接受有效 Runtime context

- **WHEN** transport 返回兼容 Host API 版本、受支持 locale/theme 和有效 capability snapshot
- **THEN** client 进入 `ready` 并公开不可由 consumer 修改的 context snapshot

#### Scenario: 接受空 capability snapshot

- **WHEN** transport 返回空 capabilities 数组
- **THEN** context 仍然有效，且 SDK 不虚构任何可用 Host API method

#### Scenario: 拒绝非法 Runtime context

- **WHEN** transport 返回未知 locale/theme、非法 SemVer、重复或空 capability ID，或缺少必需字段
- **THEN** 初始化以 `invalid_runtime_context` 失败且 client 返回 `idle`
- **THEN** 无效 context 不会部分写入 client

#### Scenario: 插件尝试改变可信 Runtime 事实

- **WHEN** consumer 尝试修改已返回 context 或通过初始化选项提供 plugin identity、Page identity、权限或来源
- **THEN** context snapshot 保持不变，且这些 Host-owned 事实不成为受支持 SDK 输入

### Requirement: SDK 与 Host API 必须使用独立且单源的版本边界

系统 MUST 从 `0.1.0` 开始独立版本化 SDK package/public API，并 MUST 公开 SDK 版本和半开 Host API 支持范围 `>=0.1.0 <0.2.0`。当前 Host API 版本 MUST 继续以 `@lensx/plugin-contract` 的 `PLUGIN_HOST_API_VERSION` 为唯一事实源；SDK MUST NOT 定义第二个当前 Host API 版本常量。SDK MUST 在初始化完成前按 SemVer precedence 检查 Runtime context 的 Host API 版本。

#### Scenario: 初始化兼容 Host API

- **WHEN** Runtime context 的 Host API 版本满足 SDK 的半开支持范围
- **THEN** 版本检查成功，初始化可以继续

#### Scenario: 拒绝不兼容 Host API

- **WHEN** Runtime context 的 Host API 版本低于最小值或达到排他上限
- **THEN** 初始化以 `incompatible_host_api` 失败且 client 不进入 `ready`

#### Scenario: 比较预发布版本

- **WHEN** SDK 检查合法的 SemVer prerelease Host API 版本
- **THEN** 比较遵守 SemVer prerelease precedence，而不是按普通字符串排序

#### Scenario: SDK 获得实现修订

- **WHEN** SDK package 实现发生不改变公共 API 或 Host API 支持范围的修复
- **THEN** SDK package version 可以独立增加，而 Manifest 和 Host API protocol version 不必改变

### Requirement: SDK 必须暴露稳定且安全的 SDK 级错误

系统 MUST 提供可判别的 `PluginSdkError` 和稳定 `PluginSdkErrorCode`，至少覆盖 `cancelled`、`timeout`、`disconnected`、`disposed`、`incompatible_host_api`、`invalid_runtime_context`、`invalid_argument` 和 `transport_failure`。错误 MUST 提供安全、可预测的 message，但 MUST NOT 向 consumer 暴露 transport 原始异常、stack、Host 对象或私有 wire 数据。具体 Host API 权限、method 和参数错误 MUST 留给后续 Host API contract 定义。

#### Scenario: 映射未知 transport failure

- **WHEN** transport 以未知异常拒绝初始化或 operation
- **THEN** SDK 向 consumer 抛出 code 为 `transport_failure` 的 `PluginSdkError`
- **THEN** 错误不包含原始异常对象、私有 stack 或 transport envelope

#### Scenario: Consumer 按稳定 code 处理错误

- **WHEN** consumer 捕获 SDK lifecycle、timeout、cancel 或兼容性错误
- **THEN** consumer 可以通过公开 error code 做可靠分支，而无需匹配本地化文本或内部异常类型

#### Scenario: SDK 不虚构 Host API 错误

- **WHEN** consumer 检查 foundation 的错误类型
- **THEN** package 不声称已经定义权限拒绝、未知 Host method 或 Host 参数 Schema 错误

### Requirement: SDK package 必须参与完整 workspace、发布和文档验证

SDK package MUST 声明有意义的 `build`、`typecheck`、`test` 和 `check` scripts，并 MUST 被根聚合命令覆盖。Repository MUST 验证真实 tarball 的文件内容、exports、声明和 Runtime 消费，且 MUST 排除测试、fixture、构建脚本与 Host 私有源码。Canonical English 架构/开发文档及其相同相对路径的 Simplified Chinese 镜像 MUST 描述 SDK 公共边界，并 MUST 明确 iframe Runtime、Host API、权限、插件执行和公开 Testkit fake 尚未由本 capability 交付。

#### Scenario: 根命令覆盖 SDK package

- **WHEN** 开发者运行根 `build`、`typecheck`、`test` 或 `check`
- **THEN** 对应 SDK package lifecycle script 执行，且失败传播到根命令

#### Scenario: 验证 SDK tarball

- **WHEN** SDK 被打包并安装到隔离 external consumer
- **THEN** tarball 只包含声明的发布文件和依赖元数据，公共 typecheck 与 Runtime smoke test 成功
- **THEN** 测试、fixture、构建脚本和 Host 私有源码不在 tarball 中

#### Scenario: 查阅双语 SDK 文档

- **WHEN** 开发者查阅英文或中文 plugin architecture/workspace 文档
- **THEN** 两种语言语义一致地说明 SDK 初始化、context、版本、错误和 transport 注入边界
- **THEN** 文档不把 SDK foundation 描述成已经可安装、注册或执行插件的 Runtime
