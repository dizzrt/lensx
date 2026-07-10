## 1. 依赖与目录准备

- [x] 1.1 确认应用级 i18n 方案，若采用 `vue-i18n`，使用 `pnpm add vue-i18n` 添加运行时依赖并更新锁文件。
- [x] 1.2 新增前端基础设施目录，用于承载应用 Provider、主题状态、i18n message 和 Naive UI locale/dateLocale 映射。
- [x] 1.3 定义应用支持的初始 locale 集合和 fallback 策略，默认 locale 使用 `zh-CN`，并保留扩展到英文的结构。

## 2. 主题基座

- [x] 2.1 定义应用 theme mode 类型和默认值，默认 theme mode 使用 `light`，并覆盖 `light` 与 `dark` 两种模式。
- [x] 2.2 建立 theme mode 到 Naive UI theme 的映射，确保 dark 模式使用 Naive UI 暗色主题，light 模式使用亮色主题。
- [x] 2.3 如需要项目自有主题变量，使用 Less 或 CSS 变量桥接 Naive UI token，避免组件内写死亮色颜色。

## 3. i18n 与 Naive UI locale 同步

- [x] 3.1 建立应用 i18n message 文件或模块，将当前用户可见业务文案纳入应用级 i18n 管理。
- [x] 3.2 建立应用 locale 到 Naive UI `locale` 与 `dateLocale` 的显式映射。
- [x] 3.3 确保应用 locale 是唯一语言状态来源，同时驱动业务 i18n message 和 Naive UI `locale` / `dateLocale`。
- [x] 3.4 为缺失 Naive UI locale/dateLocale 映射的语言提供明确 fallback。

## 4. Provider 接入

- [x] 4.1 新增应用级 Provider 组件或等价组合，包裹 `NConfigProvider` 与 `NGlobalStyle`。
- [x] 4.2 在 `src/index.ts` 或根组件中接入应用 Provider，确保所有 Naive UI 组件位于统一 Provider 之下。
- [x] 4.3 保持 `App.vue` 作为视图层组件，不直接承担全局主题、全局 locale 或 Naive UI 配置所有权。

## 5. 现有启动器输入界面迁移

- [x] 5.1 将当前输入界面中的业务文案迁移到应用 i18n message，组件模板不保留不可翻译业务文案硬编码。
- [x] 5.2 移除 `App.vue` 中未使用的 scoped 样式块，保留必要交互和 Tauri 拖拽区域标记。
- [x] 5.3 清理 `bg-white`、`#fff` 等与明暗主题冲突的硬编码颜色，改用 Naive UI token、项目主题变量或兼容主题的 UnoCSS/Less 表达。
- [x] 5.4 保持当前启动器输入框布局和基础交互可用，不改变窗口生命周期、快捷键、托盘或 Tauri 权限配置。

## 6. 样式分工检查

- [x] 6.1 检查新增或修改的布局样式是否优先使用 UnoCSS 工具类或 shortcut。
- [x] 6.2 检查复杂语义样式、伪类、媒体查询和主题绑定是否放入 Less 或等价主题样式层。
- [x] 6.3 确认没有新增普通组件 CSS 文件作为样式入口，`src/index.css` 仍只承载 UnoCSS 入口和最小全局基础样式。

## 7. 验证

- [x] 7.1 运行 `pnpm run build`，确认前端生产构建通过。
- [x] 7.2 运行 `pnpm run check` 或 `pnpm run format`，确认格式和 Biome 检查符合项目要求。
- [x] 7.3 手动检查 light/dark 两种主题下启动器输入界面可读且无亮色硬编码冲突。
- [x] 7.4 手动检查应用 locale 变化时，业务文案与 Naive UI 内置组件文案/日期格式由同一个应用 locale 同步驱动。
