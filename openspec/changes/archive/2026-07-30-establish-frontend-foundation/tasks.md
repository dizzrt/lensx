## 1. 建立业务国际化边界

- [x] 1.1 添加 `i18next` 与 `react-i18next` 运行时依赖并更新 pnpm lockfile，确认没有引入其他 UI
  组件库或非必要国际化扩展。
- [x] 1.2 在 `src/app/i18n/messages/` 建立 `en-US.json` 规范 message、同 key 的
  `zh-CN.json` message 和 `messages.schema.json`，由轻量 TypeScript 入口导入资源并推导 key；
  保留受限 `AppLocale` 类型和同步初始化入口，默认 locale 设为 `en-US`。
- [x] 1.3 实现应用 locale 状态及其与 react-i18next、Semi Design `LocaleProvider` 官方 locale
  pack、`document.documentElement.lang` 的单向映射，确保只有一个 locale 事实来源。
- [x] 1.4 为默认英文、简体中文切换、切回英文、HTML `lang` 同步和 Semi locale 映射增加前端测试；
  使用 JSON Schema validator 校验所有 locale，并验证 schema、英文规范资源和简体中文资源的完整
  key 集合一致。

## 2. 建立主题、Provider 与错误隔离

- [x] 2.1 在 `src/app/theme/` 实现受限 `ThemeMode`、默认 `light` 的主题 Context，以及
  `body[theme-mode="dark"]` 和文档 `color-scheme` 的同步与卸载清理。
- [x] 2.2 实现应用级 Error Boundary，使用当前 locale 的产品文案和 Semi Design 组件展示可访问的
  降级界面、重新加载操作，并避免展示堆栈或内部错误细节。
- [x] 2.3 实现唯一的 `AppProviders` 根层组合，按 design 组合业务 i18n、应用主题、Semi
  `LocaleProvider` 和 Error Boundary，并为 Context value 提供稳定引用。
- [x] 2.4 为默认明亮模式、黑暗模式切换、恢复明亮模式、body/文档属性同步、Provider 复用、渲染错误
  降级和重新加载操作增加行为测试，并清理测试间的全局 DOM 副作用。

## 3. 替换前端脚手架并统一样式入口

- [x] 3.1 在前端入口只导入一次 Semi Design 官方全局 CSS 与项目 `global.less`，让 Less 只承载
  根元素 reset、主题 token 桥接和跨组件基础规则。
- [x] 3.2 用语义化 `main` 和 Semi Design `Typography` 实现最小 lensX App Shell，产品说明从
  业务 i18n 获取，简单布局和间距使用 UnoCSS，不加入任何模拟 launcher、设置或插件入口。
- [x] 3.3 删除 `App.css`、Rsbuild 欢迎文案和无配套 SVGR 插件的 `*.svg?react` 声明，从 UnoCSS
  扫描配置移除 Vue 后缀，并把静态 HTML 的默认语言调整为 `en-US`。
- [x] 3.4 替换模板测试，使用 Testing Library 的可访问查询验证产品自有根界面、默认英文文案、
  简体中文文案、无模板文案以及未交付功能入口不存在。

## 4. 清理 Tauri 示例行为

- [x] 4.1 从 Rust 入口删除示例 `greet` command 及其 handler 注册，保留现有 Tauri Builder、
  opener plugin 和应用运行入口。
- [x] 4.2 检查前端没有残留对 `greet` 的调用，并通过 Rust 编译与测试证明移除示例 command
  不影响桌面应用入口。

## 5. 同步实现文档

- [x] 5.1 更新 `docs/en/architecture/overview.md` 与 `docs/en/development/frontend-guidelines.md`，
  记录已经实现的 AppProviders、i18n、Semi locale、主题属性、错误边界和全局样式入口，不修改
  README 或 Agent 规则来承载实现细节。
- [x] 5.2 同步更新相同相对路径的简体中文文档，确认英文为规范源、两种语言标题结构和语义一致，并
  确认两个语言索引仍能通过相对链接访问相关文档。

## 6. 最终验证

- [x] 6.1 运行 OpenSpec 严格验证、英中文档镜像路径检查、相对链接检查和临时来源禁用检查，修复本
  change 引入的全部文档或规格错误后重新执行。
- [x] 6.2 运行 `pnpm run test`、`pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`，
  修复本 change 引入的全部前端 test failure、warning 和 error，再重新执行失败命令及这一整组前端验证。
- [x] 6.3 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和
  `pnpm run src-tauri:check`，修复本 change 引入的全部 Rust 格式、测试、warning 和 error，再
  重新执行失败命令及这一整组 Rust 验证。
- [x] 6.4 联合重新执行 OpenSpec、文档、前端和 Rust 完整验证，确认所有命令通过、没有本 change
  引入的 warning/error、没有模板占位内容，并将最终验证结果记录在实现交付说明中。
