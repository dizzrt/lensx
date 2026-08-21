## Why

Launcher 首页当前在 Action 卡片右上角暴露固定/取消固定按钮，但该附属控件在紧凑卡片中形成了含义不清的视觉噪声；同时，Host 设置页的顶部页签难以在后续设置分区增长时维持清晰的信息层级。本变更统一收敛这两处 Host 界面：暂时撤下卡片固定入口，并把设置内容改为边界清晰的左右导航布局。

## What Changes

- **BREAKING**：从最近使用和已固定 Action 卡片移除用户可见的固定/取消固定按钮；本期不提供替代入口，因此用户暂时不能新增或移除固定项。
- 保留 Host-owned 固定集合、现有 `pinned_action_ids` 数据、读取/写入持久化合同、已固定 Action 的展示与主操作执行；不迁移或清空已有数据。
- 将已固定空状态和相关提示改为不暗示当前存在固定入口的中性文案，并维持英语与简体中文语义一致。
- 将 Host 设置页从顶部 `Preferences` / `Plugins` 页签改为左侧顶级菜单与右侧内容面板的布局，默认选中 Preferences，并保持两项现有设置能力及其数据流不变。
- 将 color-theme 与 language 从并列按钮组改为单选下拉框；语言选项始终使用 `English` 与 `简体中文` 自称，不随当前界面 locale 翻译。
- 偏好设置说明只解释用户可见的外观与语言效果，不向用户暴露 Host、组件库或其他内部实现名称。
- 在共享 Header 与设置内容之间增加横向主题化边框，在左侧菜单与右侧内容之间增加纵向主题化边框；布局继续适配固定 `650×600` Host Page 表面及明暗主题。
- 保持设置页键盘可操作、可见焦点、可访问名称、内容滚动和关闭后焦点恢复语义。
- 非目标：本期不设计固定能力的新入口，不新增上下文菜单、更多按钮或设置项，不改变 Rust/Tauri 固定集合合同，不改变 Host Page 尺寸，不复制参考界面的其他菜单、图标或功能。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `launcher-action-collections`：撤下首页 Action 卡片的固定/取消固定操作入口，同时保留固定集合数据、持久化边界、已固定内容展示和中性空状态。
- `host-settings`：把 Preferences 与 Plugins 的顶级导航从顶部页签改为带横纵分隔边框的左侧菜单/右侧内容布局，并明确键盘、焦点、滚动、主题和本地化要求。

## Impact

- 受影响的前端区域包括 Launcher Home、Action Tile、Host Settings、App Shell 页面布局、全局 Less 语义样式及英语/简体中文消息资源。
- 需要更新 Launcher Home 与 Host Settings 的 Rstest/Testing Library 断言，移除固定按钮交互覆盖并增加设置侧边导航、下拉选择、固定语言自称、选中状态、键盘切换、分隔边界和滚动语义覆盖。
- Rust 固定集合存储、Tauri 命令、序列化格式和既有磁盘数据不变；无需数据迁移或新增运行时依赖。
- 维护文档需要同步说明固定入口的暂时不可用状态以及设置页的新信息架构，并保持 `docs/en` 与 `docs/zh` 镜像一致。
