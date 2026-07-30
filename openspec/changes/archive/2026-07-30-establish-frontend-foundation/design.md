## Context

当前入口直接由 `src/index.tsx` 渲染单一 `App`，`App` 和 `App.css` 仍展示 Rsbuild 模板内容；
`static/index.html` 把文档语言固定为中文，Rust 入口仍暴露未被产品使用的 `greet` command。Semi
Design、UnoCSS 与 Less 已安装和配置，但应用没有全局 Semi 样式、`LocaleProvider`、主题状态或业务
国际化边界。

这个 change 横跨 React 根入口、全局样式、运行时上下文、测试和 Rust 入口，并需要新增业务国际化
运行时依赖。后续所有页面都会依赖这层基座，因此必须先固定 Provider 组合、locale/theme 单一事实来源
以及模板清理边界。

## Goals / Non-Goals

**Goals:**

- 建立唯一的 `AppProviders` 组合，向整个 React 应用提供业务 i18n、Semi Design locale、主题和错误隔离。
- 默认使用英文，同时同步支持简体中文业务文案与 Semi Design 内置文案。
- 使用 Semi Design 官方全局样式和 `body[theme-mode="dark"]` 机制支持明亮/黑暗模式。
- 用最小、产品自有且可访问的 App Shell 替换所有用户可见脚手架内容。
- 清理未使用的示例 Tauri command、模板 CSS、React 项目中的 Vue 扫描后缀和没有配套插件的 SVG 声明。
- 用行为测试锁定默认 locale、locale 切换、主题切换、错误降级和模板内容移除。

**Non-Goals:**

- 不实现 locale/theme 持久化、系统偏好跟随或设置 UI。
- 不增加路由、业务状态库、数据获取层或产品领域服务。
- 不调整 Tauri 窗口尺寸、外观、托盘、快捷键或其他桌面行为。
- 不定义插件或外部 iframe 如何继承 locale/theme；相关契约由后续 capability 负责。
- 不新增除业务国际化所必需依赖以外的运行时库。

## Decisions

### Decision 1：使用单一 `AppProviders` 作为根层组合入口

`src/index.tsx` 只负责导入一次性全局样式、创建 React root，并渲染：

```text
React.StrictMode
└── AppProviders
    ├── application i18n context
    ├── application theme context
    ├── Semi LocaleProvider
    └── AppErrorBoundary
        └── App
```

Provider 的状态和映射集中在 `src/app/` 下，页面不能创建第二套全局 theme 或 locale Provider。
错误边界放在 locale/theme 上下文内部，使降级 UI 可以使用翻译文案、Semi Design 组件和当前主题。

备选方案是把 Provider 分散到各页面，但这会产生重复状态、上下文顺序差异和测试成本，因此不采用。
也不引入通用全局状态库；两个低频全局值使用小型类型化 Context 足够。

### Decision 2：使用 i18next 与 react-i18next 承载业务国际化

新增 `i18next` 和 `react-i18next`，在前端启动时同步注册 `en-US` 与 `zh-CN` 资源。`AppLocale`
限制为这两个值，默认 `en-US`。文案资源使用静态导入的 JSON 文件，避免异步加载造成首次渲染闪烁
或未翻译 key，也为后续本地化工具提供通用交换格式。

英文 JSON 是规范源。`messages.schema.json` 使用 JSON Schema 固定允许的 key、必填 key、值类型和
额外属性策略；前端测试使用 schema validator 校验每个 locale，并独立比较英文与简体中文的递归 key
集合。TypeScript 入口只负责导入 JSON、导出资源和推导规范 key 类型，不重复承载文案。

应用 locale 是唯一事实来源，并同时驱动：

- react-i18next 的当前语言；
- Semi Design `LocaleProvider` 的官方 `en_US` / `zh_CN` locale pack；
- `document.documentElement.lang` 的 `en-US` / `zh-CN` 值。

Semi Design locale 只处理组件库内置文案，所有产品文案仍由应用 message 资源提供。英文 message
是规范源，简体中文必须保持相同 key 集合。

备选方案是自行实现字符串 Context，但它会重复 fallback、插值、测试和扩展能力；只使用 Semi
`LocaleProvider` 又无法承载产品文案，因此均不采用。直接用 TypeScript 对象能够提供较强的编译期
约束，但会把文案维护耦合到源码；TOML 需要额外前端解析和本地化工具适配。JSON 与 i18next、构建工具
和翻译平台的兼容性更好，因此配合 schema 与测试获得可维护性和验证能力。

### Decision 3：主题使用应用 Context，并映射到 Semi Design 的全局主题属性

定义 `ThemeMode = 'light' | 'dark'`，默认值为 `light`。`AppThemeProvider` 暴露当前值和类型化
更新方法，并把状态同步到 `document.body` 的 `theme-mode` 属性：

- `light`：移除或设置为 light，不保留暗色属性；
- `dark`：设置 `theme-mode="dark"`；
- 同步更新根文档的 `color-scheme`，使浏览器原生表单与滚动区域匹配当前模式。

主题属性必须位于 `body`，而不是 App Shell 子节点，因为 Semi Design 浮层默认挂载到 body。自有
样式使用 Semi token 或项目语义变量，不写死只适用于单一主题的背景、文本或边框色。

备选方案是仅在 App Shell 添加 `.semi-always-dark`，但浮层不一定继承局部 class；使用 body 全局
主题能为后续 Modal、Tooltip 等组件提供一致行为，因此不采用局部方案。

### Decision 4：全局样式只在入口导入一次

入口按稳定顺序导入 Semi Design 官方全局 CSS 和项目 `global.less`。`global.less` 仅承载：

- html/body/root 的尺寸和基础 reset；
- 应用语义 token 桥接；
- 全局主题与 color-scheme 相关规则；
- 不适合工具类表达的跨组件基础行为。

App Shell 的简单 flex、尺寸、间距和对齐使用 UnoCSS。移除 `App.css`，并从 UnoCSS 扫描配置中删除
Vue 后缀。没有安装 `@rsbuild/plugin-svgr`，因此删除误导性的 `*.svg?react` 声明，不为未使用能力
新增插件。

备选方案是继续使用普通 CSS 文件，但这会违反已经确定的 UnoCSS/Less 分工，因此不采用。

### Decision 5：最小 App Shell 只表达产品身份和基座状态

`App` 渲染语义化 `main`，使用 Semi Design `Typography` 展示 `lensX` 和一条来自业务 i18n 的简短
产品说明。它不包含搜索框、设置入口、模拟 action 或其他暗示功能已交付的元素。

该界面同时提供可观察的 Provider 集成点：默认英文文案、主题 token 和语义化主区域。测试通过公开
可访问名称和文案断言行为，不依赖组件内部 DOM。

备选方案是渲染完全空白页面，但空白界面无法验证国际化与 Semi Design 基座是否真正接入，也不利于
开发环境诊断，因此不采用。

### Decision 6：根层错误边界提供可恢复降级界面

使用 React Error Boundary 捕获 App Shell 及后续子树的渲染错误，显示由业务 i18n 提供的错误标题、
说明和重新加载操作，并保持当前 Semi 主题。错误对象可以记录到开发控制台，但不得把堆栈或内部错误
细节直接展示给用户。

重新加载操作调用浏览器 reload 作为本阶段的最小恢复路径。错误上报服务不在本 change 范围。

备选方案是只依赖 React 默认错误输出，但 Tauri 生产窗口会变成不可诊断空白界面，因此不采用。

### Decision 7：Rust 侧只移除示例 command，不扩展桌面边界

删除 `greet` 函数及 `generate_handler![greet]` 注册，保留 Tauri Builder、opener plugin 和现有运行
入口。这样可以消除错误的公共 command 示例，同时避免把桌面功能设计混入前端基座 change。

## Risks / Trade-offs

- [Risk] 新增 i18next 运行时依赖会增加少量 bundle 与维护成本。→ Mitigation：只引入 i18next 与
  React adapter，不引入额外 formatter；通过构建结果检查影响。
- [Risk] JSON 文案、schema 与 locale 之间可能发生 key 漂移。→ Mitigation：测试使用 schema
  validator 校验每份资源，并比较 schema、英文规范资源和所有翻译资源的完整 key 集合。
- [Risk] theme 和 locale Context 更新会使全部消费者重新渲染。→ Mitigation：Context 值使用稳定
  回调和 memo，且这两个状态只在低频用户操作时变化。
- [Risk] 修改 body 属性属于全局副作用，测试间可能泄漏。→ Mitigation：Provider effect 在卸载时
  恢复由自身写入的属性，测试 setup 在每个用例后清理 DOM。
- [Risk] 错误边界无法捕获事件处理器和异步任务中的异常。→ Mitigation：文档明确其只负责渲染子树
  降级；后续异步边界使用显式错误状态。
- [Risk] 最小 App Shell 可能被误认为产品首页。→ Mitigation：文案保持产品介绍性质，不出现模拟功能，
  文档明确当前 foundation 状态。

## Migration Plan

1. 增加业务 i18n 依赖、message 资源、locale 类型与初始化入口。
2. 增加 theme 状态、Semi locale 映射、`AppProviders` 和 `AppErrorBoundary`。
3. 接入 Semi 全局样式与 `global.less`，清理模板 CSS、无效 UnoCSS 后缀和 SVG 声明。
4. 用最小 App Shell 替换模板页面，并把静态 HTML 默认语言改为英文。
5. 删除 Tauri `greet` 示例 command。
6. 替换模板测试，覆盖 Provider、theme、locale、错误恢复和根渲染。
7. 同步英文与简体中文实现文档，执行前后端完整验证。

本 change 尚未归档时，可以整体回退其代码、依赖和文档变更。归档后如需改变 locale/theme
契约，应通过新的 OpenSpec change 修改稳定 spec。

## Open Questions

无。主题和语言的持久化、系统偏好跟随及用户切换 UI 均明确留给后续 change。
