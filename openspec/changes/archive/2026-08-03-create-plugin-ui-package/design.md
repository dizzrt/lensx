## Context

当前仓库已交付 `@lensx/plugin-contract@0.1.0`、`@lensx/plugin-sdk@0.1.0` 和公共 workspace/lifecycle 边界。SDK 的 `PluginRuntimeContext` 已稳定提供经过校验和冻结的 `locale: en-US | zh-CN` 与 `theme: light | dark`，但 SDK 有意保持无 React、Semi Design、DOM 和 Host 私有依赖，也没有公开 locale/theme 变化事件。Host 应用内部已经使用 React 19、Semi Design `LocaleProvider`、`body[theme-mode="dark"]`、`color-scheme` 和 Semi CSS token 实现双语与明暗主题，但这些 Context、组件和全局样式都属于 private root Host，外部插件不得导入。

Task 1.4 需要在这两者之间增加一个可选公共层：React 插件可以主动安装 `@lensx/plugin-ui` 获得 lensX 的稳定视觉语言，其他技术栈仍只消费 Contract/SDK。未来外部插件在隔离 iframe 中运行，因此 UI package 必须能在插件自己拥有的 document 和 bundle 内独立工作，不能假设 Host 会共享 React、Semi、CSS、全局变量或应用 Context。真实 iframe、Runtime session、Host API 和插件包格式仍由后续 change 负责。

## Goals / Non-Goals

**Goals:**

- 建立 `@lensx/plugin-ui@0.1.0` 的受限公共 API、显式样式入口、独立构建和真实 tarball 验证。
- 用 SDK 的只读 Runtime context 驱动插件 document 内的 Semi locale、light/dark 和 lensX 语义 token。
- 提供只承载稳定 lensX 语义的最小组件集：`PluginUiProvider`、`PluginPage` 和 `PluginFeedback`。
- 让 React 插件在自己的 bundle 内拥有一份 React Runtime，并证明 Host 不需要提供 React、Semi、私有组件或样式。
- 保持 SDK 和非 React 插件完全不依赖 UI package。
- 以自动化行为检查和固定视口视觉验收覆盖双语、明暗主题、成功页面、loading、empty、error 与 recovery。

**Non-Goals:**

- 不实现 iframe、资源服务、Runtime transport/session、Host API、权限、安装、注册、页面执行或动态 context 事件协议。
- 不复制 Host App Shell、Launcher、导航、设置页或其他 private root 组件。
- 不包装 Button、Input、Table、Form、Modal 等通用 Semi 组件，也不建立第二套通用组件库。
- 不提供 Plugin Testkit、项目生成模板、插件 package format、发布 registry 或真实 Host E2E。
- 不承诺插件 UI 与 Host 私有页面像素完全一致；只稳定公开的语义组件和 token。

## Decisions

### 1. 公共面保持为 Provider、Page 与 Feedback 三类语义

package 根入口公开 `PluginUiProvider`、`PluginPage`、`PluginFeedback` 及其 props/type；样式通过唯一的 `@lensx/plugin-ui/styles.css` 子路径公开，其他 deep import 均拒绝。

- `PluginUiProvider` 只负责 Runtime context 到插件 document/Semi 环境的适配。
- `PluginPage` 渲染语义化的 page/main、heading、可选 description/actions 和内容区域，拥有稳定的 lensX 页面间距与排版。
- `PluginFeedback` 提供 `loading | empty | error` 三种页面级状态、可选覆盖文案和可选 recovery action。
- 插件直接按需导入 Semi 的通用控件；UI package 不重导出整个 Semi API，也不为每个 Semi 组件创建薄包装。

这样既给第三方提供足够的 lensX 识别度，又把长期兼容面限制在真实产品语义上。替代方案是发布完整组件库或复用 Host 组件，但前者会快速扩大维护面，后者会泄漏 private root 依赖并破坏 iframe 隔离。

### 2. Provider 接受 SDK context snapshot，但不拥有 transport

`PluginUiProvider` 接受只读 `PluginRuntimeContext` prop，并只消费其中的 `locale` 与 `theme`。Provider 使用官方 Semi locale pack 包裹 children，并同步插件 document 的：

- `document.documentElement.lang`；
- `document.documentElement.style.colorScheme`；
- `document.body` 的 `theme-mode="dark"` 属性，light 时移除。

Provider mount 时记录原值，prop 改变时重新同步，unmount 时恢复原值。该 document 在目标架构中属于插件 iframe，因此这些副作用不会进入 Host document。测试/独立 consumer 也必须给 Provider 独占的 document 环境。

当前 SDK context 是冻结 snapshot 且没有 locale/theme 事件。UI package 对新的 prop 值作出响应，但不订阅 transport、不修改 SDK、不发明事件名称，也不自动轮询；未来 Runtime change 可以在获得可信新 context 后更新 React prop。

Provider 内置的默认反馈文案只覆盖 package 自己的 loading、empty、error 和 retry 文案，并为 `en-US`、`zh-CN` 提供等价资源。插件业务文案由插件自行国际化，不引入 Host i18n Context，也不把 i18next 设为强制依赖。

替代方案是只接受独立 `locale`/`theme` props，但这会复制 SDK 已稳定的公共边界；直接使用 Host AppProviders 则违反 public/private 依赖方向。

### 3. 公开小型 lensX 语义 token，而不是稳定整个 Semi token 集

样式入口加载 package 自己的已构建 CSS，并确保 Semi 基础样式在插件 bundle 中可解析。v0 对外稳定以下 CSS custom properties：

- `--lensx-plugin-color-background`
- `--lensx-plugin-color-surface`
- `--lensx-plugin-color-text`
- `--lensx-plugin-color-text-secondary`
- `--lensx-plugin-color-border`
- `--lensx-plugin-color-accent`
- `--lensx-plugin-color-danger`
- `--lensx-plugin-color-focus`
- `--lensx-plugin-radius-page`
- `--lensx-plugin-space-page`

颜色 token 在 package 内映射到受支持的 Semi token，间距与圆角由 lensX package 定义；light/dark 的实际颜色跟随 Semi 的受支持主题机制。组件源样式使用 Less，简单布局可以使用普通 CSS/局部工具，但发布物不依赖 Host UnoCSS 扫描或 `src/styles/global.less`。

插件作者仍可直接使用 Semi token，但只有 `--lensx-plugin-*` 列表属于 lensX 的版本化公共承诺。替代方案是把所有 Semi variables 重新导出，这会把 lensX 的 SemVer 面绑定到上游完整 token 集；复制 Host global styles 则会带入 Launcher 专用行为和私有选择器。

### 4. React 属于插件 bundle，Host 不提供 external

`react`、`react-dom` 和 `@lensx/plugin-sdk` 作为 UI package 的 peer dependencies；package 开发时将它们列入 dev dependencies。`@douyinfe/semi-ui` 是 UI package 的直接 Runtime dependency，版本与仓库当前验证的 Semi 2.x 范围一致。若组件确实使用 Semi icons，则 `@douyinfe/semi-icons` 必须作为显式 Runtime dependency，不能依赖传递解析。

第三方 React 插件项目必须直接安装 peer dependencies，并由自己的浏览器构建把 React、React DOM、Semi、UI package 和样式组成自包含产物。UI package 本身不内联第二份 React，因而同一个插件内的组件共享插件自己的 React 实例；Host 不提供 externals、import map、window global 或依赖注入。真实插件 package 的文件结构和压缩规则仍留给 Task 3.1。

替代方案是从 Host 共享 React/Semi，但这会跨 iframe 泄漏实现版本、破坏隔离并让单个插件升级影响 Host。把 React 直接打进 UI library tarball 则容易让一个插件出现多份 React 和 invalid hook call。

### 5. 行为、可访问性与视觉验证分层完成

package-local Rstest/Testing Library 测试覆盖：

- Provider 默认/切换 locale 与 theme、document 同步及 unmount 恢复；
- `PluginPage` 的 main/heading 结构、actions 与正常内容；
- `PluginFeedback` 的默认/覆盖文案、loading/empty/error、live region、busy 状态、recovery action 和键盘操作；
- public exports、props typecheck、样式 subpath 和 deep-import 拒绝。

真实 tarball consumer 使用公开 Contract、SDK 与 UI tarball，在独立 React/Rsbuild 浏览器项目中完成 typecheck、build 和 Runtime smoke test。构建检查确保最终浏览器产物没有 Host 私有导入、Tauri、Host globals 或未解析的 React/Semi bare external。现有 no-DOM SDK consumer 继续在没有 React/Semi/UI package 时通过，以证明可选依赖方向。

视觉 fixture 在当前插件页面目标视口 `650×600` 下覆盖 `en-US`/`zh-CN` × light/dark，并呈现正常页面、loading、empty、error/retry。自动化断言检查关键 computed styles、主题属性、长中文文案布局、focus indicator 与语义；实施验收保存并人工检查四组截图，但不在本 change 引入新的通用截图框架。

### 6. 版本、文档与完成状态沿用公共 package 治理

UI package 从 `0.1.0` 开始，使用 ESM、受限 exports、明确 `sideEffects` CSS 声明和有意义的 `build`、`typecheck`、`test`、`check`、`test:pack`。根 workspace lifecycle 按依赖顺序覆盖新 package，boundary checker 验证 SDK 不反向依赖 UI，package/consumer 不导入 private Host 路径。

canonical English 架构和 workspace 文档说明公共 API、样式入口、依赖所有权、React 与非 React 两条路径及 Runtime 非目标，并同步中文镜像。只有实现、验证、稳定 spec 同步和 archive 完成后，才把 Roadmap Task 1.4 标记为完成。

## Risks / Trade-offs

- **[公开组件和 token 过早固化]** → v0 只稳定三类语义组件和十个语义 token，保持 pre-1.0 SemVer，并拒绝通用 Semi 重导出。
- **[插件同时出现多份 React]** → React/React DOM 使用 peer dependency，真实 consumer 扫描 bundle 和依赖图；文档要求插件直接安装并打包唯一实例。
- **[Semi 上游 token 或 React 19 行为变化]** → 锁定仓库验证过的 Semi 2.x 范围，实施前核对当前版本文档，并以 light/dark、overlay、focus 和 React 19 测试门禁升级。
- **[Provider 修改错误的 document]** → API 不接受 Host document 注入，只操作其渲染环境的 global document，测试 mount/unmount 恢复；真实 iframe 集成仍由 Runtime change 验证隔离。
- **[静态 context 被误解为实时同步]** → 文档和类型示例明确由调用者传入新 snapshot；动态事件、握手和 transport 保持后续 Task 范围。
- **[视觉验收依赖人工判断]** → 用 computed-style、DOM、a11y 自动化覆盖可判定事实，截图只检查布局和视觉一致性；暂不扩大为仓库级截图基础设施。
- **[路线图的“插件可运行”早于 Runtime]** → 本 change 只证明独立浏览器 consumer 可构建/渲染以及 framework-neutral consumer 不受影响，不声称 lensX Host 已能执行插件。

## Migration Plan

1. 新增 UI workspace package 和 package-local API/样式/测试，不修改现有 SDK 或 Host 应用。
2. 增加真实 tarball consumer、bundle/exports/依赖验证和固定视口视觉 fixture，再接入根 lifecycle/boundary gate。
3. 更新双语架构与开发文档，明确已交付 UI package 和仍未交付的 iframe/Host Runtime。
4. 后续 Project Template change 可以把本 package 加入 React/Semi 模板；Runtime change 可以把可信 context snapshot 传给 Provider，不需要开放 Host Context。

回滚时可以移除新 package、consumer、验证入口和对应文档；当前没有生产 Runtime consumer、持久化数据、wire protocol 或 Rust migration。

## Open Questions

无。真实 context 更新事件、iframe document 创建、插件 package 格式和 Host 执行验收由其各自后续 change 决定。
