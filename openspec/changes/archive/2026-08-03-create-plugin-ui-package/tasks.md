## 1. 建立 UI package 与依赖边界

- [x] 1.1 在实现前核对仓库当前 React 19 与 Semi Design 版本的 `LocaleProvider`、dark theme、CSS 引入和组件可访问性用法，并把确认后的 API 限制在本 change 已批准的 Provider/Page/Feedback 范围内。
- [x] 1.2 创建 `packages/plugin-ui` workspace member，补齐 `package.json`、TypeScript/Rstest/Less build 配置、LICENSE、ESM 输出和有意义的 `build`、`typecheck`、`test`、`check`、`test:pack` scripts。
- [x] 1.3 配置 `@lensx/plugin-ui@0.1.0` 的根 JavaScript export 与 `./styles.css` export，声明 CSS side effects，并确保未声明 deep import 被拒绝。
- [x] 1.4 将 React、React DOM 和 `@lensx/plugin-sdk` 配置为兼容的 peer/dev dependencies，将实际 import 的 Semi package 配置为直接 Runtime dependency，并为任何实际使用的 Semi icons 声明显式依赖。
- [x] 1.5 增加 package 公共 API typecheck 和 metadata/boundary 测试，验证不导出 Host Context、private root、Tauri、Host styles、完整 Semi API 或未声明内部路径。

## 2. 实现 Runtime context、locale 与 theme 适配

- [x] 2.1 实现 package-owned 的 `en-US`/`zh-CN` Semi locale 映射和 loading、empty、error、retry 默认文案，保持 English 默认语义完整且不引入 Host i18n Context 或强制 i18next 依赖。
- [x] 2.2 实现 `PluginUiProvider`，接受只读 `PluginRuntimeContext`，用官方 Semi `LocaleProvider` 组合 children，并同步 document `lang`、`color-scheme` 和 `body[theme-mode="dark"]`。
- [x] 2.3 实现 Provider 对新 context prop 的确定性更新和 unmount document 状态恢复，确保不订阅 transport、不轮询 Host、不保留 listener 或 package 全局状态。
- [x] 2.4 增加 Provider 测试，覆盖 English/light、Chinese/dark、双向 prop 更新、内置文案联动、多个 consumer 隔离和 mount/unmount cleanup。

## 3. 实现公开 token 与最小语义组件

- [x] 3.1 建立 package Less/CSS 入口，加载 consumer 所需的 Semi 基础样式并发布十个批准的 `--lensx-plugin-*` token；验证 light/dark 映射、CSS export 和无 Host global style/UnoCSS 依赖。
- [x] 3.2 实现 `PluginPage` 的 main、heading、可选 description/actions 和内容结构，以公开 token 提供页面间距、排版、surface、长文本和 focus 语义，不接入 Host navigation、Launcher 或 Tauri。
- [x] 3.3 实现 `PluginFeedback` 的 `loading | empty | error` 判别 API、默认/覆盖文案和可选 recovery handler，使用合适的 busy、status、alert、live region 与键盘语义。
- [x] 3.4 增加 Page/Feedback Rstest 与 Testing Library 测试，覆盖正常内容、最小 props、loading、empty、error、recovery、English/Chinese、light/dark、长文案、keyboard、focus 和不只依赖颜色的状态表达。
- [x] 3.5 检查公共声明和样式，证明 package 只稳定 Provider/Page/Feedback 与已批准 token；通用 Button、Input、Table、Form、Modal 继续由 consumer 直接从 Semi Design 按需导入。

## 4. 建立发布、外部消费与依赖验证

- [x] 4.1 实现确定性的 UI build/pack validator，检查 tarball 文件列表、exports、CSS side effects、dependency/peer dependency、workspace range 转换、Runtime imports 和开发/Host 文件泄漏。
- [x] 4.2 创建隔离的 React/Rsbuild browser consumer fixture，只安装真实 Contract、SDK、UI tarball 及其公开 peers，通过公共入口和 `styles.css` 完成 typecheck、build 与 Runtime smoke test。
- [x] 4.3 检查隔离 consumer 的浏览器产物与依赖图，证明插件拥有一份 React Runtime，React/React DOM/Semi/UI styles 已进入插件构建，且不存在 Host external、import map、window global、Tauri、private root 或未解析 bare Runtime import。
- [x] 4.4 回归现有 framework-neutral/no-DOM SDK consumer，证明它不安装 UI、React 或 Semi Design 仍然通过，并验证 SDK package metadata/声明没有新增 UI 反向依赖。
- [x] 4.5 将 UI package 接入根 workspace lifecycle、focused `check:plugin-ui` 和 boundary/lifecycle fixtures，覆盖依赖顺序、失败传播、禁止 private Host import 以及 SDK 不反向依赖 UI。

## 5. 完成视觉与可访问性验收

- [x] 5.1 建立独立 browser visual fixture，在固定 `650×600` 视口展示正常 PluginPage 以及 loading、empty、error/retry 状态，并提供足够长的 English 与 Simplified Chinese 内容验证布局。
- [x] 5.2 自动验证 `en-US`/`zh-CN` × light/dark 四种组合的 document 属性、十个公开 token、关键 computed styles、语义结构、live region、keyboard recovery 和可见 focus indicator。
- [x] 5.3 为四种 locale/theme 组合捕获并人工检查 `650×600` 截图，确认页面无裁切、长中文可读、明暗主题与 Semi/lensX 视觉语言一致，并在交付报告中记录验收结果而不把临时截图作为稳定项目依赖。

## 6. 更新双语文档与 Roadmap 状态边界

- [x] 6.1 更新 `docs/en/architecture/extension-platform.md` 与 `docs/en/development/plugin-workspace.md`，记录 UI package 公共组件/token、Provider/context 数据流、样式入口、peer/Runtime dependency 所有权、React 与非 React 消费路径和 Runtime 非目标。
- [x] 6.2 同步更新 `docs/zh/architecture/extension-platform.md` 与 `docs/zh/development/plugin-workspace.md`，逐项核对与 canonical English 文档语义一致，并保持两种语言 index 在需要时同步。
- [x] 6.3 在实现开始后为 `plugin-roadmap.md` Task 1.4 记录 active change 状态/链接但不提前勾选完成；只有实现验证、English stable spec 同步和 archive 都完成后，才由归档流程更新当前基线、Release Checkpoint 和 Task 1.4 checkbox。

## 7. 最终验证

- [x] 7.1 运行 UI focused build、typecheck、test、check、真实 tarball consumer、bundle/metadata 检查、workspace boundary/lifecycle tests 和 visual fixture 自动化；确认 public API、样式、依赖、context、组件、a11y 与主题/locale 要求全部通过。
- [x] 7.2 运行完整前端验证 `pnpm run test`、`pnpm run format`、`pnpm run check`、`pnpm run typecheck` 和 `pnpm run build`，修复本 change 引入的全部 warning/error。
- [x] 7.3 运行完整 Rust/Tauri 验证 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`；本 change 不修改 Rust Runtime，但仍以这些命令证明现有跨层契约未回归。
- [x] 7.4 对任何失败先运行对应修复或格式化命令，再重跑失败命令；最后重新运行 7.1–7.3 的完整验证集合，并执行 `openspec validate create-plugin-ui-package --type change`，确认所有 warning/error 已清零、工件与实现一致且 change 已达到可同步/归档状态。
