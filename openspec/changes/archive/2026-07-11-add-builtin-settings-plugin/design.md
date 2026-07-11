## Context

当前插件系统已经定义统一 contract、严格三段式 ID、内建 Vue module runtime、外部 iframe runtime、插件页面出口和 registry 校验，但 `builtin_plugin_manifests()` 仍为空，尚未有真实内建插件跑通完整链路。前端基座已经具备 `AppProviders`、Naive UI theme、应用 i18n、Naive UI locale/dateLocale 映射和 `appThemeMode` 状态，但主题仍是前端内存状态，没有持久化偏好入口。

设置插件会成为第一个真实内建插件。它同时触碰插件 registry、前端布局复用、应用主题状态、Rust 本地持久化、快捷键只读展示和 i18n 文案，因此需要明确所有权边界，避免把“设置”做成只修改 Vue ref 的临时页面。

用户已确认采用“正式设置”方案，并要求设置页面使用左侧菜单栏、右侧详情页布局；该布局需要抽象为统一 layout，供后续页面复用。

## Goals / Non-Goals

**Goals:**

- 注册内建设置插件 `lensx.core.settings`，包含打开设置的 action、设置主页面、样式页面和快捷键页面。
- 建立应用偏好设置边界，由 Rust 侧负责偏好模型、读写和持久化，Vue 通过 typed Tauri command 读取和更新。
- 支持 `theme_mode: light | dark` 持久化；应用启动时恢复偏好，设置页切换后立即影响全应用主题。
- 新增可复用侧边导航布局，设置页采用左侧菜单栏和右侧详情页结构。
- 快捷键页面只读展示当前默认快捷键绑定，不改变现有快捷键注册、冲突检测或动作路由。
- 新增用户可见文案全部接入应用 i18n，设置 UI 位于现有 Naive UI Provider、主题和 locale/dateLocale 同步机制之下。

**Non-Goals:**

- 不实现快捷键编辑、录制、恢复默认或冲突处理 UI。
- 不实现语言切换设置页。
- 不实现插件启停、插件市场、外部插件安装管理或外部插件新权限。
- 不改变窗口尺寸策略、托盘行为、关闭隐藏行为、始终置顶行为或默认全局快捷键触发动作。
- 不新增前端状态管理框架，不把偏好事实源放到 Vue 组件内部。

## Decisions

### 1. 偏好事实源放在 Rust 侧，Vue 只做呈现和同步

新增 Rust 偏好模块，例如 `src-tauri/src/preferences/`，定义应用偏好模型：

```text
AppPreferences
└─ theme_mode: "light" | "dark"
```

Tauri command 保持薄而 typed：

```text
get_app_preferences() -> AppPreferences
update_app_preferences(patch: UpdateAppPreferencesRequest) -> AppPreferences
```

跨前后端字段使用 `snake_case`。前端启动时读取偏好并初始化 `appThemeMode`；设置页修改主题时调用更新命令，成功后同步 `appThemeMode`。如果写入失败，UI 应显示可诊断错误，不能静默显示已保存。

理由：主题、快捷键、窗口行为和未来插件设置都属于应用偏好，不应由某个设置页面或 Vue ref 独占。Rust 负责本地持久化也符合项目“系统集成和持久化优先放 Rust”的边界。

备选方案是直接在设置页修改 `appThemeMode`。该方案实现小，但重启后丢失，也会让后续偏好继续分散。另一个备选方案是使用前端 localStorage；在 Tauri 桌面应用里它会把本地配置所有权偏向 WebView，不利于后续 Rust 侧快捷键和窗口偏好接入，因此不采用。

### 2. 偏好存储使用本地应用配置文件，先保持最小模型

第一阶段只持久化 `theme_mode`。存储位置应来自 Tauri app data/config 目录下的应用自有文件，格式可使用 JSON，读写由 Rust 偏好 gateway 封装。缺失文件时使用默认偏好；文件内容非法时返回可诊断错误或回退默认值时明确记录，不能让无效配置导致前端状态不可解释。

理由：模型很小，不需要数据库或额外依赖。用 gateway 隔离文件读写可以让后续迁移到更复杂存储时不影响 Tauri command contract。

偏好文件损坏时采用保守可用策略：系统 MUST 回退默认偏好值，并向设置页提供可诊断的损坏状态，使用户可以看到提示并执行后续重置配置操作。系统 MUST NOT 因偏好文件损坏阻止设置页打开，也 MUST NOT 静默忽略损坏状态。

### 3. 内建设置插件使用统一插件 contract 注册

设置插件 manifest 使用严格三段式 ID：

```text
plugin: lensx.core.settings
page:   lensx.core.settings_page_main
page:   lensx.core.settings_page_style
page:   lensx.core.settings_page_shortcuts
action: lensx.core.settings_action_open
```

子页面通过 `parent_page_id` 指向主页面表达层级，不使用第四段 ID。runtime 使用 `vue_module`，页面组件通过 `src/plugins/builtin/**` 的动态注册机制加载。

理由：这是第一个真实内建插件，应验证现有 contract，而不是绕过插件 registry 做硬编码设置入口。

### 4. 新增可复用侧边导航布局，不在布局内重新提供全局 Provider

新增通用布局建议放在 `src/app/layouts/`，例如 `SideNavigationLayout.vue`。它使用 Naive UI 的 `NLayout`、`NLayoutSider`、`NMenu`、`NLayoutContent` 组合，提供：

- 左侧标题、说明和菜单区域。
- 右侧内容插槽。
- 当前菜单值和选择事件。
- 适合 650px launcher 窗口的侧栏宽度，建议约 180-220px。
- 明暗主题兼容的语义样式。

该布局不得重新包裹 `NConfigProvider`，因为全局主题、locale、dateLocale 已由 `AppProviders` 统一管理。布局只消费 Provider 上下文，不拥有主题或 locale。

理由：参考的左侧菜单 + 右侧详情结构适合设置页，但 lensX 的窗口更窄，且已有全局 Provider。抽象通用 layout 可以避免后续每个插件页面复制侧栏结构。

### 5. 设置页内部先用本地 active section，不引入 vue-router 子路由

设置插件页面内部维护 `activeSection: "style" | "shortcuts"`，左侧菜单切换 active section，右侧渲染对应详情组件。暂不引入路由子页面。

```text
SettingsPage
└─ SideNavigationLayout
   ├─ menu: style / shortcuts
   └─ content:
      ├─ StyleSettingsPanel
      └─ ShortcutSettingsPanel
```

理由：当前插件页面出口按 page id 渲染动态组件，不依赖 Vue Router。为两个设置子页引入路由会增加全局路由设计问题，也不符合当前启动器小窗口的复杂度。保留 page metadata 可支持后续外部导航或搜索命中具体设置项。

### 6. 快捷键页只读展示当前绑定

快捷键页面展示默认启动器快捷键绑定和用途，例如 `Ctrl+Shift+Space` 激活启动器。数据可以来自 Rust 侧现有快捷键默认绑定模型或一个只读 command，但本变更不得新增可编辑绑定命令，也不得改变注册生命周期。

理由：桌面快捷键已有 Rust 管理器和动作路由。设置页第一阶段只需要让用户看到当前行为；编辑、录制、冲突处理和持久化快捷键属于独立复杂变更。

实现时根据 Rust 模块可见性决定数据来源：如果现有默认绑定模型可以稳定导出给 command 或前端契约，则复用该模型；如果模块边界不适合直接暴露，则新增只读 Tauri command 返回展示所需绑定。无论采用哪种方式，都不能在前端维护与 Rust 默认绑定漂移的第二事实源。

### 7. i18n 与样式遵循现有前端基座

设置插件、侧边导航布局、主题切换控件、快捷键说明、保存/错误/加载状态等用户可见文案全部进入 `src/app/i18n/messages.ts`。Naive UI built-in 文案继续由应用 locale 映射到 Naive UI locale/dateLocale。

布局骨架、间距、flex/grid 优先使用 UnoCSS；较长的侧栏、内容区域、状态、响应式和主题变量绑定写在 Less 中。颜色使用 Naive UI token、`useThemeVars` 或项目主题变量，避免硬编码只适用于亮色主题的背景、文本或边框。

## Risks / Trade-offs

- [Risk] 偏好文件损坏导致启动主题不可恢复。→ Mitigation: Rust 读取时回退默认偏好并记录诊断；前端设置页提示用户配置已损坏并提供后续重置配置入口，不静默吞掉。
- [Risk] 设置页和全局主题状态出现双写。→ Mitigation: `appThemeMode` 只作为前端呈现状态，持久化成功后的偏好结果用于同步；初始化也只来自 `get_app_preferences()`。
- [Risk] 通用布局过早泛化。→ Mitigation: 只抽象左侧菜单 + 右侧内容的稳定结构，不加入 header/footer/watermark 等当前不需要的扩展。
- [Risk] 650px 窗口中侧栏挤压右侧表单。→ Mitigation: 控制侧栏宽度，右侧使用紧凑表单和必要滚动；响应式下可考虑菜单收窄或垂直堆叠。
- [Risk] 快捷键展示与 Rust 默认绑定漂移。→ Mitigation: 尽量从 Rust 现有默认绑定或只读接口获取展示数据，避免前端硬编码另一份快捷键事实源。
- [Risk] 内建插件注册失败会影响插件区域展示。→ Mitigation: 继续依赖 registry 校验和错误展示；实现时为设置 manifest 增加 focused 验证。

## Migration Plan

1. 新增 Rust 偏好模型、默认值、文件 gateway 和 Tauri commands。
2. 前端启动时读取偏好并初始化 `appThemeMode`，保留读取失败的错误处理和默认值策略。
3. 注册内建设置插件 manifest，并注册对应 Vue module loader。
4. 新增通用侧边导航布局。
5. 实现设置插件主页面、样式页和快捷键页。
6. 增加 i18n messages 和明暗主题样式适配。
7. 验证 `pnpm run build`、相关 Rust/Tauri 检查、主题切换和重启恢复。

回滚策略：如果偏好持久化导致启动问题，可以回退 Tauri command 注册和前端初始化调用，应用会恢复到默认 `light` 内存主题；由于只新增一个小型本地配置文件，回滚不需要迁移用户业务数据。

## Resolved Decisions

- 偏好文件损坏时采用“回退默认值并提示用户重置配置”。设置页仍可打开，但必须展示可诊断提示，不能静默忽略损坏状态。
- 快捷键只读展示的数据来源在实现时根据 Rust 模块可见性决定；优先复用 Rust 默认绑定模型，必要时新增只读 Tauri command，但不得让前端维护第二份快捷键事实源。
