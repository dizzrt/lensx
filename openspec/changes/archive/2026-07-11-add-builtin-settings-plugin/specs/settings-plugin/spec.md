## ADDED Requirements

### Requirement: 系统必须提供内建设置插件

系统 MUST 提供内建设置插件 `lensx.core.settings`。该插件 MUST 通过统一插件 registry 注册，并 MUST 至少提供打开设置的行为、设置主页面、样式子页面和快捷键子页面。设置插件 MUST 使用内建 Vue module runtime，并在现有应用 Naive UI Provider、应用主题、应用 i18n、Naive UI locale/dateLocale 上下文内渲染。

#### Scenario: 插件 registry 暴露设置入口

- **WHEN** 应用加载默认插件 registry
- **THEN** registry 包含 `lensx.core.settings` 内建插件
- **THEN** registry 包含可打开设置主页面的 action

#### Scenario: 打开设置插件页面

- **WHEN** 用户触发设置插件打开行为
- **THEN** 系统通过插件页面出口加载内建设置 Vue module
- **THEN** 设置页面独占搜索框下方的 launcher 主体区域，不与启动器结果列表或插件入口列表并列展示
- **THEN** 设置页面位于现有应用 Provider、主题和 i18n 上下文内

### Requirement: 设置插件必须使用左侧菜单和右侧详情布局

设置插件页面 MUST 使用左侧菜单栏、右侧详情页的布局。左侧菜单 MUST 至少包含“样式”和“快捷键”两个设置项；右侧内容 MUST 根据当前选中的菜单项展示对应详情。该布局 MUST 适配 launcher 固定宽度，MUST NOT 挤压详情区到不可读状态。

#### Scenario: 默认展示样式页面

- **WHEN** 用户首次打开设置插件页面
- **THEN** 左侧菜单显示“样式”和“快捷键”入口
- **THEN** 系统默认选中“样式”
- **THEN** 右侧详情区展示样式设置内容

#### Scenario: 切换到快捷键页面

- **WHEN** 用户在左侧菜单选择“快捷键”
- **THEN** 左侧菜单选中态移动到“快捷键”
- **THEN** 右侧详情区展示快捷键设置内容

### Requirement: 设置插件必须支持正式偏好持久化

系统 MUST 通过正式应用偏好边界读写设置值。偏好事实源 MUST 位于 Rust/Tauri 侧，Vue 设置页 MUST 通过 typed Tauri command 或等价稳定边界读取和更新偏好。偏好 payload 中跨前后端字段 MUST 使用 `snake_case`。

#### Scenario: 读取应用偏好

- **WHEN** 前端初始化设置相关状态
- **THEN** 前端通过偏好读取边界获得当前应用偏好
- **THEN** 返回数据包含 `theme_mode`

#### Scenario: 更新应用偏好

- **WHEN** 用户在设置页更新主题偏好
- **THEN** 前端通过偏好更新边界提交 `theme_mode`
- **THEN** Rust/Tauri 侧持久化该偏好并返回更新后的应用偏好

#### Scenario: 偏好写入失败

- **WHEN** 用户更新主题偏好但持久化失败
- **THEN** 系统显示可诊断错误
- **THEN** 系统 MUST NOT 让用户误以为偏好已经保存成功

#### Scenario: 偏好文件损坏时回退默认值

- **WHEN** 应用读取到损坏或非法的偏好文件
- **THEN** 系统使用默认偏好继续启动
- **THEN** 设置页面提示用户配置已损坏并需要重置配置
- **THEN** 系统 MUST NOT 静默忽略损坏状态

### Requirement: 样式页面必须切换并持久化主题模式

设置插件的样式页面 MUST 支持在 `light` 和 `dark` 之间切换应用主题。切换成功后，系统 MUST 立即更新应用主题状态、Naive UI theme 和设置页面自身显示效果，并 MUST 持久化用户选择。

#### Scenario: 切换到暗色主题

- **WHEN** 用户在样式页面选择 `dark`
- **THEN** 系统持久化 `theme_mode` 为 `dark`
- **THEN** 应用主题状态切换为 dark
- **THEN** Naive UI 组件使用暗色主题配置

#### Scenario: 切换到亮色主题

- **WHEN** 用户在样式页面选择 `light`
- **THEN** 系统持久化 `theme_mode` 为 `light`
- **THEN** 应用主题状态切换为 light
- **THEN** Naive UI 组件使用亮色主题配置

#### Scenario: 重启后恢复主题偏好

- **WHEN** 用户已保存 `theme_mode` 为 `dark` 并重新启动应用
- **THEN** 应用初始化时读取持久化偏好
- **THEN** 应用主题状态恢复为 dark
- **THEN** 设置页面和其他 Naive UI 组件以暗色主题渲染

### Requirement: 快捷键页面必须只读展示当前快捷键绑定

设置插件的快捷键页面第一阶段 MUST 只读展示当前启动器快捷键绑定及其用途。该页面 MUST NOT 提供编辑、录制、恢复默认或重新注册快捷键的交互。

#### Scenario: 展示默认启动器快捷键

- **WHEN** 用户打开快捷键设置页面
- **THEN** 页面展示默认启动器激活快捷键 `Ctrl+Shift+Space`
- **THEN** 页面说明该快捷键用于激活或切换启动器窗口

#### Scenario: 不提供快捷键编辑入口

- **WHEN** 用户查看快捷键设置页面
- **THEN** 页面不展示快捷键录制控件
- **THEN** 页面不展示保存快捷键或重新绑定快捷键的操作

### Requirement: 设置插件文案和样式必须接入前端基座

设置插件所有用户可见文案 MUST 来自应用 i18n message。设置插件 UI MUST 使用 Naive UI 组件，并 MUST 兼容 light 和 dark 主题。静态布局 MUST 优先使用 UnoCSS；复杂语义样式、响应式规则和主题变量桥接 MUST 使用 Less。

#### Scenario: 设置文案来自应用 i18n

- **WHEN** 设置插件展示标题、菜单、表单标签、说明、错误或空状态文案
- **THEN** 这些文案来自应用 i18n message

#### Scenario: 设置页面兼容明暗主题

- **WHEN** 应用主题在 light 与 dark 之间切换
- **THEN** 设置插件页面保持文本、背景、控件和状态信息可读
- **THEN** 页面不出现亮色硬编码导致的暗色主题冲突

#### Scenario: Naive UI locale/dateLocale 保持单一来源

- **WHEN** 设置页面渲染 Naive UI 组件
- **THEN** Naive UI 内置文案和日期格式仍由应用 locale 单一状态驱动
- **THEN** 设置插件不创建独立的 Naive UI locale/dateLocale 状态
