## MODIFIED Requirements

### Requirement: The repository must provide an explicit plugin-platform workspace topology

仓库 MUST 保持根 lensX application 为 private workspace root，并 MUST 把 `packages/*`、`plugins/*` 和 `examples/plugins/*` 下包含 package manifest 的直接子目录识别为 supported workspace members。每个直接 `plugins/*` member MUST 是产品官方插件；非官方示例 MUST 继续位于 `examples/plugins/*`，release fixtures MUST NOT 进入产品 `plugins/*`。该 topology MUST NOT 要求把根 application 移到 `apps/desktop`，也 MUST NOT 隐式包含其他位置或更深层级的 packages。

#### Scenario: Recognize a member in a supported location

- **WHEN** 一个具有 valid package manifest 的 package 是三项 supported member patterns 之一的直接子目录
- **THEN** pnpm 将该 package 识别为 workspace member
- **THEN** 根 lensX application 继续作为 private workspace root 运行

#### Scenario: Recognize a direct official plugin member

- **WHEN** 一个产品插件 package 位于 `plugins/<slug>`
- **THEN** workspace lifecycle 和 boundary checks 将其分类为 official plugin member
- **THEN** 该分类不授予 Host import、Tauri、Runtime、permission、signature 或 trust 例外

#### Scenario: Empty member areas do not affect the root application

- **WHEN** 一个或多个 supported member areas 尚未包含 package
- **THEN** workspace installation 和 root application commands 继续成功
- **THEN** 系统不会仅为填充这些区域而创建或发布 public packages

#### Scenario: Do not include an undeclared location

- **WHEN** package 位于 supported member patterns 之外，或在其中嵌套超过一层
- **THEN** pnpm workspace 不会仅因为它位于仓库内就包含它

#### Scenario: Nested official directory is no longer a member area

- **WHEN** package 位于旧的 `plugins/official/<slug>` 层级
- **THEN** 新 workspace topology 不把它识别为官方插件直接 member
- **THEN** 维护者必须把产品插件迁移到 `plugins/<slug>`，而不是保留两套发现规则
