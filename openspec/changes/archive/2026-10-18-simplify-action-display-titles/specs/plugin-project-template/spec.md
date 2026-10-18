# Spec Delta

## ADDED Requirements

### Requirement: Template entry Action titles MUST use destination names

两个维护的 canonical 模板及 CLI 打包快照 MUST 使用目的地名称作为默认入口 Action 的 `title`，不添加仅表示进入行为的“打开 / Open”前缀。framework-neutral 标题 MUST 为 `Framework-neutral starter` / `无框架起步模板`，react-semi 标题 MUST 为 `React and Semi starter` / `React 与 Semi 起步模板`。标题简化 MUST 保留既有 ID、目标、功能关键词和默认入口配置，MUST NOT 添加旧标题兼容关键词。

#### Scenario: Use the framework-neutral starter

- **WHEN** 开发者使用未改名的 framework-neutral canonical 模板
- **THEN** 其入口 `title.en-US` 为 `Framework-neutral starter`，`title.zh-CN` 为 `无框架起步模板`
- **THEN** 同一 Action 继续打开同一 Page，现有关键词、运行时和权限边界保持不变

#### Scenario: Use the React and Semi starter

- **WHEN** 开发者使用未改名的 react-semi canonical 模板
- **THEN** 其入口 `title.en-US` 为 `React and Semi starter`，`title.zh-CN` 为 `React 与 Semi 起步模板`
- **THEN** 同一 Action 继续打开同一 Page，现有关键词、本地化、主题和运行时边界保持不变

#### Scenario: Consume the packaged template snapshots

- **WHEN** 开发者使用 CLI 包内的两个模板快照
- **THEN** 快照与对应 canonical 模板保持既有一致性要求，入口名称遵循同一规则
- **THEN** 快照不保留额外的“打开 / Open”入口标题，也不将已替换标题加入关键词

#### Scenario: Adapt a starter into multiple entry points

- **WHEN** 开发者按维护指南为插件增加多个页面入口
- **THEN** 指南要求用能区分目的地的各自名称，而非为所有 Action 机械复用插件名称
- **THEN** 指南说明真正执行操作的入口保留必要动词，并明确 `title` 字段继续存在
