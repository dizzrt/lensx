# 前端指南

## 适用范围

这些规则适用于 React 组件、前端服务、样式、用户可见文案和前端测试。

## 组件选择

实现 UI 时按以下顺序选择：

1. 复用已有项目组件。
2. 使用 Semi Design 组件或文档化的组合模式。
3. 使用 Semi Design 基础组件组合小型项目组件。
4. 仅在现有技术栈无法满足需求时创建自定义行为。

对于非简单组件选择、API 使用、主题或无障碍行为，应参考仓库中的 Semi Design skill。没有明确的
设计理由，不要增加其他组件库或用途狭窄的 UI 依赖。

不要包装每一个 Semi Design 组件。只有在封装稳定产品语义、重复配置或有意义的无障碍契约时，
才引入项目级包装组件。

## 应用根层组合

保持 `src/index.tsx` 只负责一次性全局样式导入、React root 创建以及 `AppBootstrap`。bootstrap
必须先解析持久化偏好，再组合 `AppProviders` 与 `App`。不要在页面或功能模块中添加并行的应用级
Provider。

`AppProviders` 负责已经确立的根层顺序：

1. `AppLocaleProvider` 初始化应用 message 并持有 locale 状态。
2. `AppThemeProvider` 持有主题状态并同步文档主题。
3. Semi Design `LocaleProvider` 接收由应用 locale 映射得到的官方 locale pack。
4. `AppErrorBoundary` 隔离渲染失败，并使降级界面处于 locale、主题和 Semi Design 上下文内部。

Context value 必须使用稳定的更新回调和 memo 后的 value 对象。测试可以通过根 Provider 提供初始
locale 或主题，但功能代码必须消费 `useAppLocale` 和 `useAppTheme`，不能创建另一个全局事实来源。

偏好控件必须通过类型化桌面 adapter 提交完整、经过运行时校验的 snapshot。写入必须串行，且只有
Rust 确认持久化后才更新根 Provider。写入失败必须保留最后确认的值并显示本地化反馈。

## 样式

简单、局部样式使用 UnoCSS：

- 布局和 display；
- 间距和尺寸；
- flex 和 grid；
- 常见对齐；
- 小型响应式工具样式。

复杂或复用样式使用 Less：

- 语义化组件样式；
- 伪元素和复杂选择器；
- 状态组合；
- 动画和过渡；
- 主题 token 桥接；
- 可复用视觉模式；
- 使用工具类会导致标记难以理解的规则。

不要引入并行样式系统。当 Semi Design token 或应用语义变量已经存在时，避免硬编码颜色。

只从 `src/index.tsx` 导入 `@douyinfe/semi-ui/dist/css/semi.min.css` 和
`src/styles/global.less`。根元素 reset、语义 token 桥接和跨组件基础规则保留在 `global.less`；
简单的 App Shell 布局和间距使用 UnoCSS 工具类。

## 主题

- 同时支持明亮和黑暗模式。
- 使用 Semi Design 支持的主题机制和 token。
- 保持唯一的应用主题事实来源。
- 黑暗模式使用 `body[theme-mode="dark"]`，使挂载到 body 的浮层继承 Semi Design 暗色 token；
  明亮模式必须移除暗色主题属性。
- 将文档 `color-scheme` 与当前应用主题同步。
- 组件不能创建独立的全局主题状态。
- 在两种模式下测试自定义界面、焦点提示、禁用状态、浮层和错误状态。
- 只能通过已接受的 `AppPreferences` Rust/Tauri 边界持久化主题。
- 持久化成功前不能乐观更新根主题。

## 国际化

- 支持英文和简体中文。
- 英文是默认语言和规范 message 来源。
- 所有用户可见产品文案都必须来自应用国际化层。
- 将静态打包的应用文案保存为 `src/app/i18n/messages/` 下的 locale JSON 文件；TypeScript 只负责
  导入资源和暴露 key 类型。
- 使用嵌套对象组织 locale JSON，并在应用查询中使用点分隔的叶子路径。所有 locale 必须保持相同的
  对象层次和叶子路径。
- 规范英文 key 集合变化时同步更新 `messages.schema.json`，其嵌套属性层次必须与 locale 资源一致。
  每个 locale 都必须在前端测试中通过 schema 校验和完整叶子 key 集合比较。
- 保持英文和简体中文 message key 一致。
- 将 Semi Design locale 行为接入同一个应用 locale 事实来源。
- 将 `en-US` 和 `zh-CN` 映射到 Semi Design 官方 `en_US` 和 `zh_CN` locale pack，并同步
  HTML `lang` 属性。
- 不要使用 Semi Design 内置 locale 文案代替产品文案。
- 可以用完整 message 表达句子时，不要拼接多个翻译片段。
- 布局需要适应不同长度的文本。
- locale 只能通过完整偏好 snapshot 持久化；成功后同步更新应用 message、Semi Design locale 和
  HTML `lang`。

## React 结构

- 组件应专注于展示和交互编排。
- 把可复用领域规则从组件提取到可测试函数或服务。
- 优先推导渲染状态，不要使用 effect 同步重复状态。
- 由用户操作引起的事件驱动工作应保留在事件处理器中。
- 不要在 render 函数内部创建组件。
- 避免会导致无关子树重新渲染的宽泛 Context Provider。
- 在稳定边界懒加载大型可选界面。
- 原生调用保留在类型化适配器之后，不要在组件树各处直接调用 Tauri。
- `AppNavigationService` 必须独立于 React。Host executor 可以通过它请求经过校验的页面，但不能
  接收 React setter。
- Host 与 Plugin target 必须通过统一的 Host-owned Page Registry 解析。Plugin provider replacement
  必须保持完整批次和原子性；active Plugin Page 消失或变为 unavailable 时，必须通过 Host navigation
  invalidation transition 关闭，而不是通过插件 callback。
- 私有 Page route、registration detail 与 provider bookkeeping 不得进入 `ActivePage` 或展示 props。
  Plugin Page 只能通过 Host-owned 隔离 Runtime 渲染；插件展示代码不得获得 Tauri bridge、Host DOM、
  其他插件 origin 或 Host 私有状态。
- 根据规范化查询和扁平 `ActivePage` 状态推导 `home`、`search` 和 `page`；当前单层页面深度不
  引入 router 或并行 Shell store。
- 保持统一顶部行几何：`home` 和 `search` 渲染 launcher 输入，`page` 渲染由 ID 派生的页面上下文
  条，所有状态都渲染非交互 avatar 占位。不要恢复独立产品标题或介绍。
- 在渲染共享页面上下文视图前解析页面 Owner 和打开页面的 Action 展示信息。视图不得包含 Owner ID
  或 Registry 分支，只接收可序列化的 Owner 名称/图标和 Action 名称展示数据。
- 页面上下文必须呈现为一个按内容收缩的分段胶囊，顺序为 Owner、打开页面的 Action 和关闭按钮。
  Owner 与 Action 分段保持非交互；只有紧邻 Action 的 Semi Design borderless 关闭按钮可以获得焦点
  或排除窗口拖动。Owner 图标必须通过独立的 Host token 命名空间解析，并提供通用提供方 fallback，
  不得使用设置齿轮等打开页面的 Action 图标。
- 保持完整页面上下文槽位透明且可拖动。UnoCSS 只负责简单 flex/min-width 组合；胶囊层级、装饰性斜切
  分隔、基于 token 的填充、文本省略以及关闭按钮的 hover/active/focus 状态保留在语义化 Less 中。
- 将从原生窗口上边缘到统一顶部行下方间距结束的完整横向区域作为一个使用事件委托的 launcher
  拖动区域。只有主鼠标按下可以路由到类型化 `LauncherWindowDragController`；desktop adapter 只能
  暴露当前 Tauri 窗口的 `startDragging()` 操作，浏览器和测试组合使用 inert 或 fake 实现。
- 请求原生拖动时不得取消搜索输入的默认鼠标行为。无移动单击必须继续聚焦输入并定位光标；指针移动
  时原生窗口拖动优先于鼠标文本范围选择。键盘编辑、键盘选择和输入法组合必须独立于拖动路径。
- 统一顶部区域内的每个交互控件都必须使用可复用的 `data-launcher-drag-exclude` 属性。页面关闭按钮及
  其图标后代必须在原生请求前被排除；装饰 avatar 和页面上下文文字即使能从其表面发起拖动，也仍然
  保持不可操作。
- Launcher 必须保持一个连续统一的 surface 背景。静止状态的输入、页面上下文、集合空状态和 Action
  tile 不得形成常驻卡片；填充色只用于短暂的 hover、focus、selected 或 pending 状态。
- 通过类型化 launcher surface adapter 发送这些呈现状态，由 Rust 选择固定的 320px、480px 或
  600px 高度。组件不能根据 DOM 内容、集合长度或结果数量提交任意原生尺寸。
- 仅在限定到 `main` 窗口的 capability 中授予 `core:window:allow-start-dragging`。不得为此交互授予
  位置设置、缩放、最大化或其他无关原生窗口权限。

## Launcher Action 与集合

- 保持 Action descriptor 可序列化且不包含 executor。可选展示图标使用经过校验的 Host token 和共享
  Host resolver；组件不得按 `action_id` 分支选择图标。
- 通过同一个当前不可变 registry snapshot 解析最近使用和已固定 ID，保持持久化顺序，过滤缺失或
  禁用 Action，且不用 registry 顺序或模拟数据补齐。
- 仅在 Dispatcher 成功后记录最近使用；Action 结果与集合持久化反馈保持分离。
- Optimistic 固定/取消固定界面必须在失败时恢复最后经 Rust 确认的 snapshot；不得为了第九项固定而
  移除现有项。
- 在专门能力被接受前，本地化“全部”文字和 avatar 视觉始终只是非交互占位。
- 搜索使用单一四列、最多八项的 listbox 网格。左右键移动一项，上下键仅在目标存在时移动四项；
  pointer 与键盘激活必须复用同一 Dispatcher 路径。

## 无障碍与键盘行为

- 使用语义化 HTML 和无障碍名称。
- 保留可见焦点。
- 主要工作流必须能够在不使用指针设备的情况下操作。
- 为启动器界面的打开、关闭和切换定义可预测的焦点移动。
- 页面活动时以不可编辑的 Owner/Action 分段页面上下文替换搜索输入，提供具有无障碍名称的关闭图标，
  并在关闭后恢复输入焦点。
- Avatar 与“全部”占位不能具有 button、link、menu、hover、pointer 或键盘焦点语义。
- 不要只通过颜色表达状态。
- 以合适方式通知异步错误和重要状态变化。

### 插件管理表面

- Plugins 保持为单一连续的列表/详情表面。button、banner、tag、empty/loading state、radio choice 与 modal
  使用 Semi Design；共享 split-pane、selection、scrolling 与 focus treatment 才使用语义 Less。
- 所有展示 fact 与 operation 都由 `PluginManagementService` 驱动。组件不得直接 invoke Tauri、缓存
  Registration state，或复制 Manager ownership/lifecycle 决策。
- 共享 plugin service 的创建、初始化与 terminal disposal 必须集中在 root composition owner。每一代
  composition 只配对一个 effect cleanup；leaf component 与 `App` 不得销毁注入的 service。使用 root
  `StrictMode` setup-cleanup-setup 测试覆盖生产 owner。
- 列表选择和每个 action 都必须可用键盘完成。上下方向键在相邻 entry 间移动。关闭 replacement、uninstall
  或 clear-data confirmation 后恢复触发控件焦点；移除成功后聚焦相邻 entry 或安装按钮。
- mutation pending 时禁用所有冲突操作。replacement classification、uninstall data policy 与永久 clear-data
  都需要显式 modal。卸载默认保留数据；仅当选中的 registered plugin 已禁用时才允许清除数据。
- 通过 live region 通知安全的 status/error 摘要。不得渲染 raw native error、path、payload、stack trace 或
  diagnostic message。

### 插件安装信任

- installation/replacement 确认保持在现有连续 Plugins 表面内。文案需明确：安装表示信任插件代码使用普通
  开放 Web 能力，但 Host 边界保持封闭。
- identity、version、source、Publisher-unverified 状态与 replacement classification 只作为有界事实展示。
  package digest、source 或 Publisher metadata 不得呈现为 Host authority，也不代表 Host 背书远程行为。
- 不得渲染 permission checklist、grant/revoke 控件、作者提供的 permission reason 或 partial-grant state。
  当前公共 Host API 不包含 native capability。
- 所有 copy 都进入应用 i18n resource，并在 light/dark 下测试英文与简体中文。固定 `650×600` 时，验证
  focus、disabled、modal、alert、legacy recovery 与长内容状态不依赖颜色也清晰可见。

## 测试

- 测试用户可观察行为，而不是组件实现细节。
- 优先使用 Testing Library 的无障碍查询。
- 为键盘优先工作流覆盖键盘和焦点行为。
- locale 行为变化时覆盖英文和简体中文输出。
- 主题行为变化时覆盖明亮和黑暗模式集成。
- 通过 `AppErrorBoundary` 覆盖 App Shell 渲染失败；React 错误边界不会捕获事件处理器和异步
  失败，因此这些失败必须使用显式错误状态。
- 通过页面级错误边界覆盖活动页面渲染失败，确保上下文头部和关闭控件继续可用。
- Launcher 顶部区域变化必须在固定 650px viewport 下完成 macOS 原生验收。在 `home`、`search`
  和 `page` 中分别从顶部空白、搜索输入、页面上下文非操作区域和 avatar 拖动真实窗口；随后回归光标
  定位、英文和中文输入法、键盘选择、页面关闭、失焦隐藏、快捷键恢复以及固定 320/480/600px 高度。
  保存验收截图，并检查连续表面、圆角、透明背景、avatar 和顶部间距的计算样式。
- 分段页面上下文变更必须在 `650×600px` Page 视口下保存英文浅色、简体中文浅色和至少一种深色组合
  的截图。通过计算样式和几何数据检查胶囊按内容收缩、基于 token 的分段层级、斜切分隔、关闭按钮
  紧邻关系与键盘焦点、avatar 几何保持，以及长文本省略且不发生重叠。
- 为提取出的领域函数增加聚焦测试。
- 避免使用会掩盖有效行为断言的 snapshot。
- Plugin management 变更必须在 `650×600` 下为英文/简体中文与 light/dark 捕获全部维护状态。除截图外，
  还要通过 computed style 检查 split surface、selected fill、border、overflow、长名称/诊断、modal contrast
  与 disabled/focus state。
