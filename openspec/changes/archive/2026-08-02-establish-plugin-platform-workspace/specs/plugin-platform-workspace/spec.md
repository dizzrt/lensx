## ADDED Requirements

### Requirement: 仓库必须提供明确的插件平台 workspace 拓扑

仓库 MUST 将根 lensX 应用保留为 private workspace root，并 MUST 将 `packages/*`、`plugins/official/*` 与 `examples/plugins/*` 中包含 package manifest 的直接子目录识别为受支持的 workspace 成员。该拓扑 MUST NOT 要求将根应用迁移到 `apps/desktop`，也 MUST NOT 将其他位置或更深层的 package 隐式纳入 workspace。

#### Scenario: 识别受支持位置中的成员

- **WHEN** 一个包含有效 package manifest 的 package 位于三个受支持成员模式之一的直接子目录
- **THEN** pnpm 将该 package 识别为 workspace 成员
- **THEN** 根 lensX 应用仍作为 private workspace root 工作

#### Scenario: 空成员区域不影响根应用

- **WHEN** 一个或多个受支持成员区域尚未包含 package
- **THEN** workspace 安装和根应用命令仍能成功运行
- **THEN** 系统不会为了填充成员区域而创建或发布公共 package

#### Scenario: 不纳入未声明位置

- **WHEN** 一个 package 位于受支持成员模式之外或位于其更深的嵌套目录
- **THEN** pnpm workspace 不会仅因该 package 位于仓库内而自动纳入它

### Requirement: Workspace 成员必须遵守单向公共依赖边界

根 Host 应用 MUST 能够通过声明的 package 依赖消费公共 workspace package。公共 package、官方插件和示例插件 MUST NOT 依赖根 private package、`src/app/**`、Host Tauri adapter 或根内部样式入口。插件源码 MUST NOT 依赖 `@tauri-apps/*`。任何 workspace 成员消费另一个成员时 MUST 使用对方声明的 package 名和公开 export，而 MUST NOT 通过跨成员相对路径导入对方源码。官方插件 MUST 与示例插件遵守相同边界。

#### Scenario: 通过公共 package export 建立允许依赖

- **WHEN** 根 Host、官方插件或示例插件通过 package manifest 声明依赖并从公共 package export 导入模块
- **THEN** workspace 依赖检查接受该依赖

#### Scenario: 插件尝试导入 Host 私有模块

- **WHEN** 官方插件或示例插件通过相对路径、仓库 alias 或 package 声明引用根应用私有模块
- **THEN** workspace 依赖检查拒绝该引用
- **THEN** 官方插件不会因为位于同一仓库而获得例外

#### Scenario: 插件尝试导入 Tauri 能力

- **WHEN** 官方插件或示例插件导入 `@tauri-apps/*` 或 Host Tauri adapter
- **THEN** workspace 依赖检查拒绝该导入

#### Scenario: 成员绕过另一个成员的公开入口

- **WHEN** 一个 workspace 成员通过相对路径直接导入另一个成员的源码
- **THEN** workspace 依赖检查拒绝该导入
- **THEN** 消费方必须改用被依赖 package 的声明名称和公开 export

### Requirement: 依赖边界必须由确定性的仓库检查强制执行

仓库 MUST 提供可从根部执行的依赖边界检查，并 MUST 将其纳入标准根 `check`。检查 MUST 覆盖 workspace 成员位置、必需 lifecycle scripts、package 依赖和源码模块引用。发生违规时，检查 MUST 返回非零状态，并 MUST 输出足以定位违规文件、引用和规则的确定性诊断。仓库 MUST 使用合法与非法 fixture 自动验证允许和禁止的边界。

#### Scenario: 合法依赖图通过检查

- **WHEN** workspace manifests、源码引用和 lifecycle scripts 全部满足边界规则
- **THEN** 根依赖边界检查成功
- **THEN** 标准根 `check` 能继续完成其余检查

#### Scenario: 非法依赖使检查失败

- **WHEN** fixture 或实际 workspace 成员包含一条受禁止的 package 依赖或源码引用
- **THEN** 边界检查返回非零状态
- **THEN** 诊断标识违规文件、引用和被违反的稳定规则

#### Scenario: 每类边界都有回归覆盖

- **WHEN** 运行边界检查测试
- **THEN** 合法公共 import fixture 被接受
- **THEN** Host 私有导入、Tauri 导入和跨成员相对源码导入的负例分别被拒绝

### Requirement: 标准根命令必须完整验证所有 workspace 成员

仓库根部的 `build`、`typecheck`、`test` 与 `check` 命令 MUST 分别执行根应用及每个实际 workspace 成员对应的 lifecycle script。每个成员 MUST 声明这四个 scripts；聚合命令 MUST NOT 静默跳过缺失 script 的成员。任何根应用或成员命令失败时，聚合命令 MUST 返回非零状态。根应用的 `dev`、`preview` 与 Tauri/Rust 专用命令 MUST 保持其现有用途。

#### Scenario: 聚合命令覆盖根应用和成员

- **WHEN** 开发者从仓库根部运行任一标准 lifecycle 命令
- **THEN** 对应的根应用验证和每个 workspace 成员验证都被执行
- **THEN** 成员按照 workspace 依赖关系以有效顺序执行

#### Scenario: 成员缺少 lifecycle script

- **WHEN** 一个实际 workspace 成员未声明 build、typecheck、test 或 check 中的任一必需 script
- **THEN** workspace 验证返回非零状态
- **THEN** 缺少的成员和 script 能从诊断中确定

#### Scenario: 成员验证失败

- **WHEN** 根应用或任一 workspace 成员的 lifecycle script 失败
- **THEN** 对应的标准根命令返回非零状态
- **THEN** CI 不会把部分验证误报为完整通过

#### Scenario: 没有叶级成员时验证根应用

- **WHEN** 三个成员区域都还没有实际 package
- **THEN** 标准根命令仍执行并验证根应用
- **THEN** 聚合过程不会递归调用根命令自身

### Requirement: Workspace 基础不得改变已交付的产品行为与契约

引入 workspace 后，系统 MUST 保持现有 React/Rsbuild 应用入口、前端构建产物、Manifest Schema 与验证结果、Launcher 行为以及 Tauri/Rust command 和运行时行为不变。该基础 MUST NOT 声明或发布公共插件 package，也 MUST NOT 使静态 Manifest 获得安装、注册或执行能力。

#### Scenario: 根应用继续通过完整验证

- **WHEN** workspace 迁移完成并执行现有前端与 Rust 完整验证
- **THEN** 根应用测试、类型检查、格式与静态检查、前端构建、Rust 格式检查、Rust 测试和 Rust 静态检查全部通过

#### Scenario: 静态 Manifest 不获得 Runtime 能力

- **WHEN** workspace 基础已经建立
- **THEN** Manifest 验证仍只执行既有结构、语义、规范化和兼容性处理
- **THEN** 系统不会因此发现、安装、注册或执行插件

### Requirement: Workspace 约定必须提供双语工程文档

仓库 MUST 在规范角色适用的英文工程文档中说明 workspace 布局、标准根命令、成员接入要求和依赖方向，并 MUST 在 `docs/zh/` 的相同相对路径提供语义一致的简体中文镜像。文档 MUST 将 workspace 基础与尚未实现的插件运行能力明确区分。

#### Scenario: 开发者查阅 workspace 约定

- **WHEN** 开发者从英文或简体中文工程文档查找插件 workspace 接入方式
- **THEN** 文档说明受支持的成员位置、四个必需 lifecycle scripts、允许依赖方向和禁止的 Host/Tauri 导入
- **THEN** 两种语言不会把 workspace 配置描述成已交付的插件运行能力
