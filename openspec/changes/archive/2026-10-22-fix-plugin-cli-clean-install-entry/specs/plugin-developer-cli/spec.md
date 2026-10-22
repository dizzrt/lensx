# Spec Delta

## ADDED Requirements

### Requirement: Public CLI installation MUST establish the executable before workspace build outputs exist

`@lensx/plugin-cli` MUST 提供安装时已存在的公共 `lensx-plugin` 入口，使受支持的包管理器在尚无工作区构建产物且禁用安装脚本时仍能建立消费者的命令入口。按声明的依赖顺序构建完成后，首次安装建立的入口 MUST 能执行现有公共 CLI 命令，且 MUST NOT 要求再次安装、重链接、全局 CLI、源码别名或由消费者直接调用内部构建路径。发布包 MUST 同时包含入口及其所需运行文件，并保持现有命令参数、JSON 和退出码契约。

#### Scenario: Install a source workspace before building the CLI

- **WHEN** 干净工作区不存在 CLI 或其公共依赖的构建产物，并使用锁定包管理器进行 frozen-lockfile、ignore-scripts 安装
- **THEN** 消费者的 `lensx-plugin` 入口建立成功，且不会因 CLI 的入口目标尚未构建而产生缺文件警告
- **THEN** 此时安装本身不会自动构建 CLI 或修改受版本控制的文件

#### Scenario: Build after installation without relinking

- **WHEN** 首次安装已完成，随后按声明依赖顺序构建 CLI 及其公共依赖，期间未再次安装或重链接
- **THEN** 原消费者命令入口能执行 `--help`、`--version` 和对兼容插件产物的 `validate --json`
- **THEN** JSON、返回状态和退出码保持现有契约，并且不借用原仓库或全局已安装的 CLI

#### Scenario: Invoke an unbuilt source workspace

- **WHEN** 开发者在所需构建产物仍缺失时调用已链接的 CLI 入口
- **THEN** 调用以非零状态失败，不将命令入口已创建报告为 CLI 已完成验证
- **THEN** 入口不会隐式安装、构建、下载依赖或执行源码作为替代实现

#### Scenario: Consume the published package outside the repository

- **WHEN** 外部消费者安装真实 CLI tarball 及其声明依赖后调用公共命令
- **THEN** 入口与所有运行文件均从已安装包解析，不依赖 lensX checkout、根 `node_modules` 或私有路径
- **THEN** 既有 create、build、validate、pack、inspect、语言选择及退出码语义保持不变

### Requirement: CLI validation MUST cover source installation before build separately from tarball consumption

CLI 验证 MUST 包含独立的干净源码工作区安装回归，以及现有预构建发布包的隔离消费验证。干净安装回归 MUST 在系统临时目录内使用真实受支持包管理器和项目锁定依赖，证明安装时没有 CLI 构建产物、初始命令入口存在，以及随后构建后通过该同一入口成功调用 CLI。它 MUST NOT 用模拟目录创建、预构建 tarball、复制已有 `node_modules` 或直接执行内部入口替代这项证据；成功或失败后 MUST 清理临时资源，并保持当前 checkout 的源码、锁文件和根 `node_modules` 不受修改。

#### Scenario: Existing developer artifacts could hide a missing entry

- **WHEN** 当前 checkout 已有 CLI 构建产物和可用命令入口
- **THEN** 干净安装回归仍从不含这些输出的独立源码工作区开始
- **THEN** 它检查命令与依赖解析均留在隔离工作区，不能通过继承的可执行搜索路径或模块路径借用当前 checkout

#### Scenario: A regression points the install entry at missing build output

- **WHEN** CLI 安装入口再次依赖安装时不存在的构建文件
- **THEN** 干净安装回归在首次安装后的入口检查中失败
- **THEN** 后续预构建 tarball 验证成功也不能抵消该失败

#### Scenario: A clean installation or command fails

- **WHEN** 临时工作区的安装、构建或公共命令调用失败
- **THEN** 验证保留可定位的失败阶段并返回非零结果
- **THEN** 临时工作区按同一清理边界释放，当前 checkout 的依赖和受版本控制的文件保持不变
