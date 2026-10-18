# Spec Delta

## MODIFIED Requirements

### Requirement: Create MUST generate one of the maintained project templates without external side effects

`create` MUST 要求显式目标目录、`framework-neutral | react-semi` 模板、有效 plugin ID 和项目名称，并从 CLI tarball 内已验证且与 Task 6.3 canonical 示例保持一致的资源生成项目。生成项目 MUST 只使用公开 lensX 包和普通可发布依赖，MUST 通过 Contract 校验；命令 MUST NOT 下载依赖、初始化 Git、安装或运行插件。

两种模板生成的入口 Action MUST 保留 `title` 字段，`title.en-US` 和 `title.zh-CN` MUST 直接使用通过现有校验的 `--name` 值。生成器 MUST NOT 额外拼接 `Open ` 或 `打开 `，MUST NOT 裁剪名称本身的词语，也 MUST NOT 合成旧标题兼容关键词。现有名称输入范围、包名规则、Action/Page 身份、目标和模板功能关键词 MUST 保持不变。

#### Scenario: Create a framework-neutral project

- **WHEN** 开发者对不存在的目标目录执行 `create`，选择 `framework-neutral`
- **THEN** CLI 生成包含 Manifest、Page、Action、build/typecheck/test/check 生命周期和无权限 Runtime 示例的完整项目
- **THEN** 项目不包含 React、Semi Design、Plugin UI、Host-private 导入或 workspace/file/link 依赖

#### Scenario: Create a React/Semi project

- **WHEN** 开发者执行 `create` 并选择 `react-semi`
- **THEN** CLI 生成由插件包直接拥有 React、React DOM、Semi Design 和 Plugin UI 的完整项目
- **THEN** 生成项目使用与 canonical React/Semi 示例相同的公开 Runtime、本地化、主题和测试边界

#### Scenario: Target or substitution is unsafe

- **WHEN** 目标目录非空、plugin ID 无效、名称无法安全替换，或生成结果不符合 Contract
- **THEN** CLI 以确定性诊断失败，且不覆盖任何已有文件
- **THEN** staging 内容被移除，不留下看似成功但生成不完整的项目

#### Scenario: Create an entry with the supplied project name

- **WHEN** 开发者为任一模板提供合法名称 `My Plugin`
- **THEN** 生成的入口 `title.en-US` 和 `title.zh-CN` 均为 `My Plugin`
- **THEN** 不生成 `Open My Plugin` 或 `打开 My Plugin` 标题，不将这些字符串或兼容用打开前缀加入关键词
- **THEN** plugin name、Page title 和包名继续遵循各自已有生成规则，Action target 与默认入口保持有效

#### Scenario: Preserve an opening word that belongs to the supplied name

- **WHEN** 开发者为任一模板提供通过现有输入校验的名称 `Open Studio`
- **THEN** 入口双语标题均为 `Open Studio`
- **THEN** 生成器既不再添加一个打开前缀，也不将名称裁剪为 `Studio`

#### Scenario: Inspect an existing plugin with an older title style

- **WHEN** 作者校验现有且原本符合 Contract 的插件，其 Action 标题仍包含 `Open` 或 `打开`
- **THEN** 本次生成默认值调整不会引入拒绝这种合法标题的校验规则
- **THEN** CLI 不自动改写现有项目、标题或关键词
