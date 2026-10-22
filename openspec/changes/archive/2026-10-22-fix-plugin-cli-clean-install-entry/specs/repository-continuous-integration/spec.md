# Spec Delta

## MODIFIED Requirements

### Requirement: Plugins CI shall prepare public workspace dependencies from a clean checkout

Plugins CI SHALL 在干净 runner 中安装依赖，并在执行插件消费者之前按传递依赖拓扑顺序构建所需公共工作区包。它 SHALL 从工作区依赖图推导顺序、去重共享依赖构建，并 SHALL NOT 依赖已有 `dist`、源码别名或 Host/Tauri 私有源码导入。插件所需的公共 CLI 命令 SHALL 在首次依赖安装时建立入口，并在现有依赖构建完成后可调用；该保证 SHALL 同样适用于本地 `ci-plugins` 和使用该 CLI 的 `plugin-host-http` Gate，不得依赖额外的 workflow-only 安装、重链接或全局工具。

#### Scenario: Public package dist directories are absent

- **WHEN** Plugins CI 从没有预构建工作区输出的干净检出开始
- **THEN** 它 SHALL 在任何插件消费公共包之前生成所需公共导出
- **THEN** 安装时生成的公共 CLI 入口 SHALL 在依赖构建完成后可用，无需再次安装或重链接

#### Scenario: Public packages have transitive build dependencies

- **WHEN** 插件依赖的公共包还依赖另一个可构建工作区包
- **THEN** Plugins CI SHALL 先构建依赖，再构建依赖它的包，最后执行插件消费者

#### Scenario: Shared public dependency is required more than once

- **WHEN** 多个插件或包依赖同一个公共工作区包
- **THEN** 一次 CI 计划 SHALL 在所有消费者之前仅准备该包一次

#### Scenario: A required public package build fails

- **WHEN** 任一所需公共工作区包构建失败
- **THEN** Plugins CI SHALL 在报告插件验证成功之前失败

#### Scenario: A plugin resolves project code

- **WHEN** 插件在 CI 中进行类型检查、测试或构建
- **THEN** 它 SHALL 仅通过已声明的公共包导出消费项目功能

#### Scenario: A local Gate uses the public CLI

- **WHEN** 干净安装后的工作区运行 `ci-plugins` 或 `plugin-host-http`
- **THEN** 公共依赖构建完成后，插件产物检查 SHALL 通过真实 `lensx-plugin` 命令入口运行
- **THEN** Gate SHALL NOT 以内部路径调用、全局安装或额外重链接替代该命令可用性

## ADDED Requirements

### Requirement: Plugin artifact checks MUST distinguish command startup failures from command results

插件产物检查调用公共 CLI 时，MUST 区分进程未启动、进程被信号终止、正常启动后非零退出，以及成功退出但输出协议不合法的情况。失败诊断 MUST 标识可执行命令与子命令，并提供对应的启动错误代码或名称、退出状态或信号；可用 stdout/stderr MUST 作为有界上下文保留，缺失输出 MUST 有明确占位，不能只显示 `undefined`。仅在启动与退出成功后才可解析和验证 JSON；检查 MUST 保持阻断行为，不重试、跳过或将启动失败误报为插件内容不兼容。此要求属于验证调用方，不改变公共 CLI 的 JSON 协议或产品界面文案。

#### Scenario: Public CLI executable cannot be started

- **WHEN** 操作系统因命令不存在或无法执行而拒绝启动公共 CLI
- **THEN** 检查 MUST 报告命令、子命令及 `ENOENT`、`EACCES` 或实际可用的错误标识，并返回失败
- **THEN** 即使 stdout/stderr 均不存在，诊断也 MUST 能定位启动失败，且不得尝试解析 JSON

#### Scenario: Public CLI exits unsuccessfully or by signal

- **WHEN** 已启动的 CLI 返回非零状态或被信号终止
- **THEN** 检查 MUST 分别报告退出状态或信号，并附带有界输出上下文
- **THEN** 检查 MUST 在该步骤停止，不能把异常退出当作有效 CLI 结果

#### Scenario: Successful process returns invalid output

- **WHEN** CLI 返回零退出状态，但 stdout 为空、不是合法 JSON 或不满足当前命令预期的结果状态
- **THEN** 检查 MUST 以输出协议错误失败，并标识失败的子命令
- **THEN** 该错误 MUST 与进程启动失败区分

#### Scenario: Public CLI returns a valid successful result

- **WHEN** CLI 正常退出并返回满足既有契约的 validate、pack 或 inspect 结果
- **THEN** 检查 MUST 继续验证原有包内容、重复打包字节和摘要一致性
- **THEN** 新增诊断逻辑 MUST NOT 放宽任何既有断言或将无结果状态报告为成功
