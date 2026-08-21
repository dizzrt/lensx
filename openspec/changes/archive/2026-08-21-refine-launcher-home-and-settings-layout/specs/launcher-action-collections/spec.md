## ADDED Requirements

### Requirement: 首页必须在固定入口延期期间只读展示固定集合

Launcher Home MUST 继续从 Host-owned `pinned_action_ids` 解析并按确认顺序展示真实、当前且启用的 Action。Recent 与 Pinned 卡片 MUST 只提供主 Action 操作，并且 MUST NOT 显示或暴露固定、取消固定、更多菜单或其他替代管理入口。Pinned 标题旁的本地化 All 文本 MUST 继续只是视觉占位，不得成为按钮、链接、菜单触发器或可聚焦元素。

当固定集合为空时，页面 MUST 使用中性、本地化的空状态说明固定 Action 会显示在该区域，并且 MUST NOT 声称用户当前可以从卡片固定 Action。移除入口 MUST NOT 删除、迁移、重排或伪造既有固定 ID，也 MUST NOT 改变 Rust/Tauri 集合读取、写入、容量和安全错误合同。

#### Scenario: 展示已有固定 Action

- **WHEN** 持久化快照包含能够由当前 Registry 解析的固定 Action ID
- **THEN** Pinned 区域按确认顺序显示对应真实 Action
- **THEN** 每个卡片只提供主 Action 操作，不提供固定、取消固定或菜单操作

#### Scenario: 执行已有固定 Action

- **WHEN** 用户通过键盘或指针激活 Pinned 卡片的主操作
- **THEN** 系统通过既有 Dispatcher 路径执行该 Action
- **THEN** 固定集合不会因为主 Action 执行而被新增、删除或重排

#### Scenario: 查看空的固定集合

- **WHEN** 当前可解析的固定集合为空
- **THEN** Pinned 区域显示本地化的中性空状态
- **THEN** 页面不显示固定或取消固定按钮，也不提示用户使用当前不存在的固定入口

#### Scenario: 检查占位和焦点顺序

- **WHEN** 用户或辅助技术检查 Recent、Pinned 和 All 占位
- **THEN** Action 卡片的焦点顺序只包含主操作
- **THEN** All 占位不存在按钮、链接、菜单触发或键盘焦点语义

## MODIFIED Requirements

### Requirement: Home Action collections must remain accessible, localized, and theme-aware

Recent 与 Pinned 分区、空状态、Action 标题、集合读取反馈 MUST 使用应用 i18n，默认语言为 `en-US`，并提供语义一致的 `zh-CN` 资源。每个可见 Action 卡片的主操作 MUST 同时支持键盘和指针输入并具有可见焦点；卡片 MUST NOT 暴露固定或取消固定操作的可访问名称、焦点目标或仅视觉控件。在明暗主题中，卡片、选择、悬停、焦点、空状态和反馈 MUST 使用 Semi Design 支持的主题 token，并且 MUST NOT 只依靠颜色表达状态。

#### Scenario: 仅使用键盘操作 Home Action

- **WHEN** 用户使用键盘在 Recent 或 Pinned 卡片之间导航
- **THEN** 用户可以聚焦并执行每个卡片的主 Action
- **THEN** 焦点顺序不包含固定、取消固定、avatar 或 All 占位

#### Scenario: 使用简体中文

- **WHEN** 应用 locale 为 `zh-CN`
- **THEN** 分区标题、中性空状态和集合反馈使用简体中文
- **THEN** Action 标题继续使用既有的 `zh-CN` 到 `en-US` 回退

#### Scenario: 切换主题

- **WHEN** Home surface 可见时用户在明暗主题之间切换
- **THEN** 两个集合、卡片、主操作和反馈使用对应主题 token
- **THEN** 文本、焦点和交互状态继续清晰可辨

## REMOVED Requirements

### Requirement: Users must be able to pin and unpin visible home Actions

**Reason**: 卡片级固定/取消固定入口在紧凑 Launcher Home 中造成含义不清的附属控件；用户已决定本期先撤下入口，未来入口另行设计。

**Migration**: 保留 `pinned_action_ids`、既有磁盘数据、集合读取/写入/容量合同和 Pinned 展示。升级后已有固定项继续只读显示；用户暂时不能新增或移除固定项，后续 OpenSpec Change 再定义替代入口。
