# Spec Delta

## ADDED Requirements

### Requirement: ConfigLens MUST support word selection in the focused editor body

在 macOS 上，ConfigLens 正文获得文本焦点时，`Option+Shift+Left` 和 `Option+Shift+Right` MUST 按编辑器既有词边界向左／右扩展选区。重复操作和反向操作 MUST 保留合法的选择锚点并按原生编辑器规则扩展或收缩选区，MUST NOT 改写内容、触发格式化、发出内容变更通知、清空或丢失既有撤销／重做历史。词选择 MUST 遵循编辑器既有撤销分组语义，包括在导航时结束当前输入组；选择本身不构成内容编辑。

该行为 MUST 在英文／简体中文界面与明／暗主题下保持一致，并保留空文档、文档边界和只读内容的正常选择语义。焦点位于 Find 查询、其他输入或 Host 时，正文 MUST NOT 接管该组合键、改变自身选区或抢回焦点。功能 MUST 使用插件自己的普通编辑器能力，不增加 Host 权限、全局快捷键或插件专属原生补丁。

#### Scenario: Extend selection in either word direction

- **WHEN** macOS 用户在正文词边界按 Option+Shift+Left 或 Option+Shift+Right
- **THEN** 选区按编辑器词边界向对应方向移动，重复或反向操作正确扩展或收缩并保留锚点
- **THEN** 内容和内容变更通知保持不变，既有撤销／重做能力保留，前后输入遵循编辑器的正常分组边界

#### Scenario: Empty boundaries and read-only content remain safe

- **WHEN** 文档为空、光标已到文档边界，或正文为只读
- **THEN** 词选择保留编辑器合法范围与只读选择能力，不产生内容修改或错误
- **THEN** 在英文／简体中文与明／暗主题下保持同一选择契约

#### Scenario: Non-body focus retains its selection ownership

- **WHEN** Find 查询或其他输入拥有焦点，用户使用该组合键
- **THEN** ConfigLens 正文选区和内容不变，焦点仍由当前输入拥有
- **THEN** 返回正文焦点后可继续正常按词选择，不创建额外全局 handler
