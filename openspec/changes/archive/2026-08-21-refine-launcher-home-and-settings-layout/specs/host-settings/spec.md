## ADDED Requirements

### Requirement: 设置页必须以主题化边界分隔共享 Header、导航和内容

当 `lensx.core/settings` Host Page 激活时，App Shell MUST 在共享 Page Context Header 与设置内容之间显示一条贯穿内容宽度的横向边界。设置内容 MUST 使用左侧顶级导航和右侧当前 section 内容的左右布局，并在两者之间显示从 Header 下方延伸到内容底部的纵向边界。边界 MUST 使用应用支持的主题 token，在明暗主题下可辨，并且 MUST NOT 把 Header、导航或内容呈现为彼此分离的持久卡片。

布局 MUST 保持现有固定 `650×600` Host Page presentation。右侧内容 MUST 能在可用高度内独立滚动，长内容不得扩大原生窗口、覆盖共享 Header 或使左侧导航离开可用区域。该设置专用布局 MUST NOT 改变 Home、Search、其他 Host Page 或 Plugin Page 的布局。

#### Scenario: 打开设置页

- **WHEN** `lensx.core/settings` 在固定 Host Page surface 中激活
- **THEN** 共享 Header 与设置内容之间显示完整横向边界
- **THEN** 左侧导航与右侧内容之间显示连续纵向边界
- **THEN** Preferences 默认内容在右侧显示，原生窗口仍使用 `650×600` Host Page presentation

#### Scenario: 在固定视口中显示长内容

- **WHEN** 当前设置 section 的内容超过右侧可用高度
- **THEN** 右侧内容可以独立滚动并保持可读
- **THEN** 共享 Header、左侧导航、横向边界和纵向边界保持稳定

#### Scenario: 切换明暗主题

- **WHEN** 设置页可见时应用在 light 与 dark 主题之间切换
- **THEN** 横向边界、纵向边界、导航选中态和焦点态使用对应主题 token
- **THEN** 边界和交互状态不只依赖颜色差异表达含义

#### Scenario: 打开其他页面

- **WHEN** App Shell 显示 Home、Search、另一个 Host Page 或 Plugin Page
- **THEN** 系统不应用设置页专用的 split-layout modifier
- **THEN** 这些 surface 保持各自既有布局和 presentation 语义

## MODIFIED Requirements

### Requirement: The first settings version must contain preferences and plugins sections

设置页 MUST 提供本地化且可访问的顶级 `Preferences` 与 `Plugins` section。两个 section MUST 呈现在左侧纵向导航中，Preferences MUST 为打开设置页时的默认选中项，右侧 MUST 只显示当前选中 section 的内容。导航 MUST 暴露本地化可访问名称、当前选中状态和可见焦点，并且 MUST 支持键盘和指针选择。

Preferences MUST 包含 color-theme 与 language 设置，并且两项设置 MUST 各自使用一个可访问的单选下拉框，不得把所有选项持续并列显示。每项设置的用户可见说明 MUST 只描述对应设置的可见用途，并且 MUST NOT 暴露 Host、组件库或其他内部实现名称。Language 下拉框 MUST 在所有界面 locale 下将 `en-US` 显示为 `English`、将 `zh-CN` 显示为 `简体中文`；语言名称 MUST NOT 随当前界面 locale 翻译。Plugins MUST 提供 `plugin-management-settings` specification 定义的 Host-owned 本地插件管理能力，并且 MUST 只呈现 trusted typed services 暴露的当前 Registration facts 和 operations。系统 MUST NOT 伪造插件数据、向插件代码暴露插件管理，也 MUST NOT 提供 marketplace 或远程分发操作。

#### Scenario: 查看默认 Preferences section

- **WHEN** 用户打开设置页
- **THEN** 左侧导航将 Preferences 暴露为当前选中项
- **THEN** 右侧显示 color-theme 与 language 设置
- **THEN** 每项设置和控件具有本地化 label 与可访问名称
- **THEN** 每项设置只显示一个当前选择，下拉展开后才显示其余候选项

#### Scenario: 在任意界面语言下查看语言选项

- **WHEN** 用户在 `en-US` 或 `zh-CN` 界面中展开 language 下拉框
- **THEN** `en-US` 选项显示为 `English`
- **THEN** `zh-CN` 选项显示为 `简体中文`

#### Scenario: 查看偏好设置说明

- **WHEN** 用户在 `en-US` 或 `zh-CN` 界面中查看 color-theme 与 language 说明
- **THEN** color-theme 说明只描述可以选择 lensX 的外观，language 说明只描述 lensX 使用的语言
- **THEN** 两条说明不出现 Host、Semi Design、组件库或其他内部实现名称

#### Scenario: 使用键盘切换顶级 section

- **WHEN** 用户通过键盘从 Preferences 选择 Plugins
- **THEN** 左侧导航把 Plugins 暴露为当前选中项并保持可见焦点
- **THEN** 右侧显示当前 Plugin Management 内容且不创建新的 Host Page 或窗口

#### Scenario: 查看没有 Registration 的 Plugins section

- **WHEN** 用户进入 Plugins 且当前可用 Registration snapshot 为空
- **THEN** 右侧显示本地化 empty state 与 trusted 本地安装入口
- **THEN** 页面不伪造插件内容，也不把 Manager degradation 呈现为普通空状态

#### Scenario: 查看包含 Registration 的 Plugins section

- **WHEN** 用户进入 Plugins 且当前可用 Registration snapshot 包含 entries
- **THEN** 右侧显示当前插件列表并允许选择 revision-consistent Host-owned detail
- **THEN** lifecycle、replacement 与 data controls 保持在 trusted Host settings boundary 内，且不显示 marketplace operation

#### Scenario: 设置页切换 locale

- **WHEN** 用户成功切换应用 locale
- **THEN** 左侧导航、右侧 section 标题和当前设置内容一起更新为新 locale
- **THEN** 当前选中 section 与键盘焦点语义保持稳定
