## Context

当前 Launcher Home 使用同一个 `ActionTile` 同时承载主 Action 与右上角固定/取消固定附属按钮。`LauncherHome` 为 Recent 和 Pinned 两个集合都注入固定操作，`App` 维护乐观更新、pending 状态和失败回滚；Rust/Tauri 则独立拥有有界、排序且原子持久化的 Action 集合。用户已决定本期只移除可见入口，保留底层集合合同和已有固定数据，替代入口留待后续变更。

当前 Host Settings 在共享 App Shell Page Context Header 下使用顶部 Tabs 切换 Preferences 与 Plugins。页面运行于固定 `650×600` Host Page 表面，外层 Launcher body 带统一内边距，Plugin Management 在自身内容中已经使用 list/detail 分栏和滚动边界。新布局需要让设置页面直接承接 Header 下方空间，使用左侧顶级导航和右侧内容，并让横向与纵向边框在明暗主题下连续、清晰。

本变更只涉及 Host 前端呈现、交互编排、消息资源、确定性测试和双语文档。Rust 的权限、持久化、Tauri 命令和原生窗口尺寸保持不变。

## Goals / Non-Goals

**Goals:**

- 从 Recent 与 Pinned 卡片移除固定/取消固定按钮、Tooltip、图标样式及仅服务于该入口的 React 状态和消息，同时保留固定集合读取、展示、主 Action 执行和底层写入合同。
- 让已有 `pinned_action_ids` 在升级后继续按确认顺序展示；空集合使用中性文案，不暗示本期存在用户可操作的固定入口。
- 使用左侧顶级导航与右侧内容重组 Preferences / Plugins，并保持现有偏好持久化、Plugin Management Service、Page Error Boundary 和 App Shell 关闭/焦点恢复语义。
- 在共享 Header 下方提供完整横向边界，在设置导航与内容之间提供完整纵向边界，并维持固定视口中的可读、可滚动和键盘可操作行为。
- 复用 Semi Design、UnoCSS、Less、i18n 和现有 Gate；不引入新运行时依赖或 Change 专用根脚本。

**Non-Goals:**

- 不决定或实现固定能力的未来入口，也不添加上下文菜单、更多按钮、拖拽或设置项。
- 不删除 Pinned 区域、不清空或迁移已有固定数据、不改变集合容量、顺序、错误合同或 Rust/Tauri 命令。
- 不改变 Home、Search、Host Page 的原生尺寸，不影响 Plugin Page 自有 presentation，也不创建独立设置窗口。
- 不复制参考界面的账号、市场、AI、启动项、菜单图标或其他不存在的产品能力。
- 不添加截图、浏览器、真实 WebView、GUI、原生交互或视觉基线验证。

## Decisions

### 1. 固定集合保留为数据能力，首页暂时只读展示

`LauncherActionCollections`、前端 typed client 的 `setPinned` 合同、Rust 命令、磁盘格式与相关底层测试保持不变。应用启动时仍读取集合，Registry 解析仍过滤缺失或禁用的 Action，Pinned 卡片的主操作仍通过既有 Dispatcher 执行。

React 呈现层移除 `ActionTile.pinAction`、Recent/Pinned 的 `onSetPinned` 注入、固定按钮 Tooltip、`PinIcon` 及 `.launcher-action-pin` 状态样式。`App` 中只服务于可见固定入口的 pending 状态、点击处理、乐观固定/取消固定和对应 UI 反馈一并移除；Recent 的成功记录与集合读取/回滚路径继续保留。这样不会留下不可达的卡片控件或死的呈现状态，同时未来入口仍可复用不变的 typed client 与 Rust 边界。

替代方案是在本期仅用 CSS 隐藏按钮，但隐藏控件仍会残留不可达语义、无用状态和误导测试，因此不采用。另一个替代方案是立刻迁移到右键菜单，但入口及其键盘/触屏语义尚未决定，超出已确认范围。

### 2. 设置页使用受控的 Semi Design 纵向导航

`SettingsPage` 维护只包含 `preferences` 与 `plugins` 的本地选中键，默认值为 `preferences`。左侧使用 Semi Design `Nav` 的 vertical 模式承载两个真实顶级 section；右侧只呈现当前选中 section。外层使用语义化导航区域与内容区域，简单的 flex/min-height/spacing 交给 UnoCSS，选中状态、边框、滚动和主题化细节放在 `global.less`。

不继续使用顶部 Tabs，因为它无法表达目标左右信息架构。也不引入 Router 或全局 Shell store：section 选择只影响设置页内部呈现，不改变 `ActivePage`、Page Registry 或 Host 导航身份。Plugin Management Service 继续由根组合拥有，切换 section 只影响叶组件订阅/呈现，不转移初始化和销毁责任。

### 3. App Shell 以设置页身份启用 edge-to-edge split modifier

共享 Page Context Header 继续由 `App` 持有。仅当当前解析后的 Host Page 身份是 `lensx.core/settings` 时，App Shell 为 surface/body 暴露稳定的设置布局 modifier：

- 共享 drag/header 区域底部绘制贯穿 surface 内容宽度的主题化横边框；
- Host Settings body 取消通用页面内容内边距，使左侧导航的纵边框从横边框下方连续延伸到底部；
- 左侧导航采用约 `152px` 的固定栏宽，右侧内容获得剩余空间并在内部恢复适当内边距；
- 右侧内容拥有 `min-height: 0` 和独立纵向滚动，Plugin Management 的内部 list/detail 分栏继续在剩余宽度中工作；
- Home、Search、其他 Host Page 和 Plugin Page 不继承该 modifier。

把 modifier 绑定到已解析 Host Page 身份，而不是查询文本、Action ID 或 DOM 测量，可避免布局泄漏并保持现有 Host-owned Page 边界。边框使用 Semi Design theme token，不使用硬编码颜色，也不把页面变成独立卡片。

### 4. 可访问性、本地化和确定性验证随结构一起调整

设置导航必须有本地化可访问名称、明确的选中状态、可见焦点，并支持 Semi Nav 的键盘选择。切换 locale 时菜单、面板标题和控件同步更新；切换 theme 时横纵边框、选中态和焦点态使用相应 token。右侧长内容滚动时，共享 Header 与左侧导航保持稳定。

Preferences 的 color-theme 与 language 使用受控 Semi Design 单选 `Select`，替代会在紧凑宽度下换行的并列 Radio button group。每个 Select 继续由本地化 label 与 description 标注，保存期间同时禁用，选择结果仍进入既有串行持久化链。主题选项随界面 locale 本地化；语言选项是语言自称，所有 locale 下固定显示 `English` 与 `简体中文`，避免把目标语言名称翻译成当前界面语言。

偏好设置的 description 只说明用户能够观察到的用途：外观说明仅描述可以选择 lensX 的外观，语言说明仅描述 lensX 使用的语言。用户可见说明不得出现 Host、Semi Design、组件库或其他内部实现名称；这些架构信息只保留在开发文档与规格中。

固定入口移除后，Action 卡片只保留一个可聚焦主操作；i18n 删除或改写不再可达的固定/取消固定、容量和写入反馈文案，并让 Pinned 空状态保持中性。英语继续作为 canonical locale，简体中文保持完整键集与语义一致。

聚焦验证复用 `ci-lensx-test`（覆盖完整 Rstest，包括 Launcher Home）和 `plugin-management-settings`（覆盖 Host Settings/Plugin Management 集成）Gate；完整交付使用 `ci-lensx` 以及独立 Rust 生命周期命令。变更不新增 Gate、Generate target 或根脚本。

## Risks / Trade-offs

- [已有固定项在本期无法由用户移除，新用户也无法创建固定项] → 明确记录为有意的过渡状态，保留数据且使用中性文案；未来入口必须通过独立 OpenSpec Change 决定。
- [底层 `setPinned` 暂时没有产品 UI 调用者] → 保留 typed client、Rust 合同及底层单元测试，避免未来入口需要迁移数据或重新设计边界。
- [设置侧栏压缩 Plugin Management 的内部双栏] → 使用紧凑固定侧栏、右侧 `min-width: 0`/滚动链，并在固定 `650×600` 视口下通过 DOM 与样式语义断言覆盖长内容。
- [设置专用边框或 padding 覆盖泄漏到其他页面] → modifier 必须绑定解析后的 `lensx.core/settings` Host Page 身份，并覆盖其他 Host/Plugin 页面不出现该 modifier。
- [从 Tabs 改为 Nav 改变键盘和焦点行为] → 使用 Semi Nav 内建语义，补充默认选中、键盘切换、可见焦点和关闭设置后恢复 Launcher input 的测试。
- [Select 弹层使偏好切换的 DOM 与键盘路径发生变化] → 使用 Semi Select 原生 combobox/option 语义，确定性覆盖当前值、选项自称、禁用状态、确认后 locale/theme 更新和失败回滚。
- [移除固定文案导致 locale schema 漂移] → 同步更新英语、简体中文和消息 schema，并运行完整消息键一致性测试。

## Migration Plan

1. 先调整 delta specs、消息合同和确定性测试，使暂时只读的 Pinned 行为与设置 split layout 成为可观察目标。
2. 实现卡片入口移除和设置布局 modifier，不改 Rust/Tauri 或磁盘格式。
3. 更新英语 canonical 文档及简体中文镜像，运行聚焦 Gate 与完整验证。
4. 发布无需数据迁移；已有 `pinned_action_ids` 在首次读取时直接沿用。

回滚时可恢复旧固定按钮和 Tabs 呈现，因为底层固定集合与数据格式未变；无需恢复或转换用户数据。

## Open Questions

- 固定能力未来使用何种用户入口尚未决定；该问题明确延期，不阻塞本变更，也不得在实施中自行扩展范围。
