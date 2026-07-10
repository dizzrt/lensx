## Context

当前前端入口很薄：`src/index.ts` 直接挂载 `App.vue`，`App.vue` 局部导入 Naive UI 组件并包含临时样式，`src/index.css` 同时承担 UnoCSS 入口和少量全局基础样式。这个结构可以支撑早期验证，但无法保证后续 UI 在 Naive UI 主题、明暗模式、应用级 i18n、Naive UI locale/dateLocale 和样式分层上保持一致。

本变更只涉及 Vue 前端基础设施，不改变 Rust/Tauri 命令、窗口生命周期、快捷键、托盘、权限或跨前后端 API 契约。

## Goals / Non-Goals

**Goals:**

- 建立统一的前端 Provider 根节点，集中管理 Naive UI 配置、全局样式、主题和本地化。
- 让应用 locale 成为唯一语言状态来源，同时驱动业务 i18n message 和 Naive UI `locale` / `dateLocale`。
- 让应用 theme mode 成为唯一主题状态来源，同时驱动 Naive UI theme 和项目主题变量。
- 清理当前 UI 中与规范冲突的硬编码亮色样式、未使用样式和临时文案。
- 保持当前启动器输入界面功能不变，只调整其基础设施接入和样式来源。

**Non-Goals:**

- 不实现设置页、语言切换 UI、主题切换 UI 或持久化偏好。
- 不新增命令注册、搜索索引、插件系统或扩展运行时。
- 不改变 Tauri 窗口尺寸、拖拽区域、快捷键、托盘和隐藏/显示策略。
- 不引入新的状态管理框架，除非实现时证明现有 Vue 组合式状态不足。

## Decisions

### 1. 使用应用根 Provider 组合承载 Naive UI、主题和 i18n

在 Vue 根层增加应用级 Provider 组件或等价组合，例如 `AppProviders`。该层负责包裹 `NConfigProvider` 和 `NGlobalStyle`，并向内部视图提供 theme mode、应用 locale、Naive UI locale/dateLocale 映射。

备选方案是继续在 `App.vue` 中直接拼装 Provider。这个方案初期更少文件，但会让视图组件和应用基础设施混在一起，后续增加通知、弹窗、语言、主题等全局能力时更难维护。因此采用独立 Provider 边界。

### 2. 应用级 i18n 使用专门 message 层，Naive UI locale 只负责组件内置文案

业务文案由应用 i18n 层管理，建议使用 `vue-i18n` 作为 Vue 3 生态内的标准方案。Naive UI 的 `locale` 和 `dateLocale` 只用于 Naive UI 组件默认文案和日期格式，例如选择器占位、分页文案、日期面板文案等。

应用 locale 是唯一来源。实现时建立显式映射：

```text
appLocale
├─ application messages: zh-CN / en-US / ...
└─ naive ui locales: zhCN + dateZhCN / enUS + dateEnUS / ...
```

备选方案是只使用 Naive UI locale。该方案不能覆盖业务标题、按钮、空状态、错误和菜单文案，不满足项目规范。另一个备选方案是自建极简 i18n 函数；这会减少依赖，但会很快遇到插值、类型、回退和组合式 API 集成问题，不适合作为长期基座。

### 3. 主题状态统一驱动 Naive UI theme 和项目样式变量

应用维护 `light` / `dark` 的主题模式状态。Naive UI 通过 `NConfigProvider` 的 `theme` 接入 `darkTheme` 或默认 light theme；项目自有样式通过 CSS 变量或 Less 变量桥接主题 token，避免在组件中写死 `bg-white`、`#fff` 这类亮色假设。

短期默认主题可以固定为 dark 或 light，但结构必须允许未来接入系统主题或用户偏好。此变更不要求实现持久化或系统主题监听。

### 4. UnoCSS 负责布局工具类，Less 负责语义样式和主题桥接

静态布局、尺寸、间距、flex/grid 等继续使用 UnoCSS。组件级复杂选择器、伪类、主题变量桥接和较长语义样式使用 Less。`src/index.css` 保持为 UnoCSS 入口和最小全局 reset，不继续承载组件样式。

备选方案是全面使用 UnoCSS。它适合布局，但复杂状态样式和主题变量桥接会变得难读。另一个备选方案是全面回到 CSS/Less，也会削弱当前 UnoCSS 的布局效率。

## Risks / Trade-offs

- [Risk] 新增 `vue-i18n` 会增加一个运行时依赖。→ Mitigation: 只引入一个成熟、Vue 3 原生支持的 i18n 库，并把 message 范围限制在当前 UI 需要的最小集合。
- [Risk] Provider 抽象过早膨胀。→ Mitigation: 只建立 theme、locale、Naive UI config 和 global style 所需的最小 Provider，不引入状态管理框架。
- [Risk] 清理硬编码颜色后 UI 视觉可能发生细微变化。→ Mitigation: 保持当前输入界面布局和交互不变，改用 Naive UI token 或项目主题变量表达相同意图。
- [Risk] Naive UI locale 与应用 i18n 映射遗漏语言。→ Mitigation: 先支持项目默认语言集合，并为不支持的语言设置明确 fallback。

## Migration Plan

1. 新增应用级 theme 和 i18n 基础模块，定义默认 theme mode、默认 locale、业务 messages 和 Naive UI locale/dateLocale 映射。
2. 在 Vue 根入口接入 Provider，确保所有 Naive UI 组件位于 `NConfigProvider` 之下。
3. 将当前 `App.vue` 的临时业务文案和组件内置文本迁移到业务 i18n message 或 Naive UI locale 管理范围。
4. 移除当前硬编码亮色样式和未使用 scoped CSS，保留拖拽区域和输入布局。
5. 运行前端构建和格式/检查命令，验证现有桌面入口不受影响。

Rollback 策略：由于不涉及数据迁移和 Rust/Tauri 配置，若实现出现问题，可回退前端 Provider 接入和新增依赖，恢复当前直接挂载方式。

## Resolved Defaults

- 默认应用 locale 使用 `zh-CN`，并保留扩展到英文 message 的结构。
- 默认 theme mode 使用 `light`，同时保留 dark 模式结构和 Naive UI dark theme 映射。

## Open Questions

无。
