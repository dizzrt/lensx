## Why

当前前端实现仍处于早期脚手架状态：Naive UI 组件已被局部使用，但应用没有统一的 Naive UI Provider、主题入口、应用级 i18n 层，也存在硬编码亮色样式。现在需要先标准化前端基础设施，避免后续界面功能在主题、国际化和样式体系上继续分散。

## What Changes

- 建立前端应用级 Provider 基座，统一承载 Naive UI 配置、全局样式、主题和本地化能力。
- 接入 Naive UI 兼容的明暗主题机制，移除当前亮色硬编码样式，后续 UI 必须通过 Naive UI token 或项目主题变量适配 light/dark。
- 接入应用级 i18n 层，要求业务文案由项目 i18n message 管理，不再直接硬编码在组件中。
- 将 Naive UI `locale` / `dateLocale` 与应用 locale 绑定，由同一个应用语言状态驱动组件内置文案、日期格式和业务文案。
- 明确 UnoCSS 与 Less 的样式分工：静态布局和常用工具类使用 UnoCSS，复杂组件语义样式和主题桥接使用 Less。
- 清理当前 `App.vue` 和全局样式中的无效样式、亮色硬编码和临时示例文案，使现有启动器输入界面符合新基座。

## Capabilities

### New Capabilities

- `frontend-foundation`: 定义前端应用基座要求，包括 Naive UI 优先、Provider 接入、明暗主题、应用级 i18n、Naive UI locale/dateLocale 同步、UnoCSS/Less 样式边界和现有 UI 兼容性。

### Modified Capabilities

无。

## Impact

- 影响前端源码：`src/index.ts`、`src/App.vue`、`src/index.css`，以及新增的前端主题和 i18n 相关模块。
- 可能新增前端依赖：应用级 i18n 库，例如 `vue-i18n`，具体选择在设计中确认。
- 不改变 Rust/Tauri 命令、窗口生命周期、全局快捷键、托盘行为或桌面权限配置。
- 不改变 README、稳定文档目录结构或 OpenSpec 配置规则本身。
