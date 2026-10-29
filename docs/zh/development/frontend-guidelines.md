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

共享 `.launcher-surface` 负责 Home、Search、Host Page 和插件 Page 的 `18px` 外层圆角、
`overflow: hidden` 内容裁剪及 `var(--semi-color-bg-0)` 主题背景。外层不叠加 CSS 投影，
macOS 桌面窗口保留现有原生投影。该策略在 `en-US`、`zh-CN` 及两种主题下保持一致，不改变
窗口几何、页面布局、拖动、键盘导航、焦点恢复、插件 Page 的原生缩放权限，以及内层控件与浮层
自身的投影。浏览器预览呈现没有 macOS 原生投影的圆角表面。确定性测试、源码审查和构建用于
验证实现及既有契约，不能证明 macOS 最终像素效果。

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
- 根据规范化查询、扁平 `ActivePage` 与当前可信 Page resolution 推导类型化
  `home`、`search`、`host_page` 和 `plugin_page` surface target；不引入 router 或并行 Shell store。
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
- 通过类型化 launcher surface adapter 发送这些 tagged target。Home、Search 和 Host Page
  分别固定为 `650×320`、`650×480` 和 `650×600`。plugin target 只能携带已校验 Manifest
  初始逻辑尺寸、`resizable`、Page 和 Page-attempt 身份。组件与 plugin message 都不得把 DOM
  内容、集合长度、结果数量或任意尺寸作为原生 Window 输入。
- 仅在限定到 `main` 窗口的 capability 中授予 `core:window:allow-start-dragging`。不得为此交互授予
  位置设置、缩放、最大化或其他无关原生窗口权限。
- 可调整 plugin 布局要在 flex chain 中使用 `min-height: 0`，由一个 content 区吸收 viewport
  变化；基本控件位于语义化有界 footer，diagnostics 可滚动。`ResizeObserver` 只布局现有
  editor，不重建 model、Worker 或 Runtime。
- 设置 split-layout modifier 只能绑定解析后的 `lensx.core/settings` Host Page 身份。其 body 使用
  edge-to-edge 布局，在共享 Header 下方绘制基于主题 token 的横边界，在约 `152px` 导航后绘制纵边界，
  并在可独立滚动的右侧内容区恢复内边距。沿该链保留 `min-height: 0` 与 `min-width: 0`，使 Plugin
  Management 在固定 `650×600` Host Page 尺寸中继续保有自身的 list-detail 内部分栏。Home、Search、
  其他 Host Page 与 Plugin Page 不得应用该 modifier。

## Launcher Action 与集合

- 使用 `title` 作为主要展示名称，并遵循统一的
  [Action 命名指南](../plugin-development/public-packages.md#action-display-names)。
  页面和工具入口使用目的地名称；真正的操作保留有意义的动词，例如 `Hide launcher` / `隐藏启动器`。
- Host 设置入口为 `Settings` / `设置`，ConfigLens 在两种语言中均为 `ConfigLens`。名称保留在各自的
  应用消息或插件 Manifest 中。不要在渲染时裁剪前缀或合成旧标题搜索别名；保留既有功能关键词。
- 修改标题时保留稳定的 Action ID 和执行目标。搜索、Recent、Pinned、无障碍名称及打开页面的 Action
  上下文通过既有元数据路径解析当前本地化标题；改名无需迁移集合，也无需另一条 Dispatcher 路径。
- 保持 Action descriptor 可序列化且不包含 executor。可选展示图标使用经过校验的 Host token 和共享
  Host resolver；组件不得按 `action_id` 分支选择图标。
- 通过同一个当前不可变 registry snapshot 解析最近使用和已固定 ID，保持持久化顺序，过滤缺失或
  禁用 Action，且不用 registry 顺序或模拟数据补齐。
- 仅在 Dispatcher 成功后记录最近使用；Action 结果与集合持久化反馈保持分离。
- 保留设置固定状态的 typed client 与 Rust 合同，但 Launcher Home 只按顺序只读展示已有 Pinned
  Action。Recent 或 Pinned 卡片都只能包含一个主 Action；在专门能力定义未来入口前，不得暴露固定、
  取消固定、菜单或替代管理控件。
- 在专门能力被接受前，本地化“全部”文字和 avatar 视觉始终只是非交互占位。
- 搜索使用单一四列、最多八项的 listbox 网格。左右键移动一项，上下键仅在目标存在时移动四项；
  pointer 与键盘激活必须复用同一 Dispatcher 路径。

### Action 卡片展示

Recent、Pinned 和 Search 共用 `ActionTile` 展示。通过 `aspect-ratio: 1`，以当前网格列宽决定每张
卡片的方形边长；网格内容和条目均向起始侧对齐，避免剩余行高拉伸交互区域。主按钮填满该区域，
pointer、hover、focus、selected 和 pending 状态保持相同的方形边界及 `12px` 圆角。`28px` 图标
和固定 `20px` 标题行盒在卡片内居中；标题长短和反馈不得改变卡片尺寸或移动相邻 Action。

Home 的每个集合保持八个等宽列，按已确认顺序展示最多八个已解析 Action。Search 保持四个等宽列，
最多八项结果、两行。因此不同网格可以使用不同的方形边长。Home 和 Search 在空态、pending 和错误
状态下仍保持固定的 `650×320` 和 `650×480` 原生窗口目标，不得从文字或条目数量推导窗口尺寸。
静止卡片在连续 launcher surface 上保持透明，交互状态仅使用现有主题 token。简单网格组合使用
UnoCSS；方形几何、按钮边界和可复用状态样式归语义 Less 所有。

#### 单行标题适配

以完整的当前本地化标题作为输入，依据标题行盒的可用内宽进行适配。Host 私有
`fitActionTileTitle` helper 从独立的 `14px` 基准测量，恰好容纳或仍有余量时保持 `14px`。
否则先按宽度比例计算候选，再通过有界校正在连续 `12–14px` 区间中选择尽可能大的可容纳字号，
精度误差不超过 `0.1px`。不得按字符数估算、轮询固定整数字号，或在已适配结果上逐步缩小。
只有完整标题在 `12px` 下仍超宽时才标记为截断并需要完整名称提示。保留标题原文及完整可访问名称。

`useActionTileTitleFit` 拥有 DOM 测量与失效处理。完整文本测量节点脱离正常布局、对辅助技术隐藏且
不可聚焦；它与可见标题共用 font family、weight 和 letter spacing，但不参与按钮命名。语义 Less
拥有固定行高和单行 CSS 省略，hook 提供计算后的字号。不得同时启用 Typography 的 JavaScript
ellipsis，不依赖 `text-fit`，也不新增字体适配库。

标题或 locale 变化、`ResizeObserver` 发现可用宽度变化、字体首次就绪及后续加载完成或失败时重新
测量。将重复通知合并到同一个动画帧，结果未变时保留状态。替换或卸载时断开 observer、移除字体
listener、取消排队帧，并忽略旧异步回调。无效、零宽或暂不可用的测量回退到 `14px`，通过单行 CSS
溢出保护保留完整可访问名称，不断言截断，也不展示误导提示。后续有效布局或字体通知会重试测量，
并可恢复 `14px`。

#### 完整名称提示

每个 Home 或 Search surface 拥有局部的 `useActionTileTooltip` 协调器，Home 的 Recent 与 Pinned
共用一份。每个渲染实例具有唯一身份，同一 Action 在两个首页集合中出现时也使用不同身份。
先仲裁候选，再判断截断：指针所在卡片及其可阅读提示优先于 Home 已聚焦主按钮，或 Search 输入框
保持焦点时的选中结果，包括默认选中的首项。因此悬停完整显示的短标题会抑制另一键盘候选的提示；
离开卡片和浮层后恢复仍有效的键盘候选。最多只有一个截断标题显示提示。

使用挂载于 `body` 的受控 Semi Tooltip，采用当前主题 token、限制在窗口内的宽高、长词换行，
并为极端长名称提供可滚动溢出。指针从卡片移入浮层时保持可读。内容仅为完整已解析标题，不新增产品
文案、操作或 Tab 停靠点，也不获取或恢复焦点。将提示关联到对应实例的主按钮或 option，不覆盖
输入框的状态区 `aria-describedby` 或 `aria-activedescendant` 关系。

Home 的 Escape 关闭当前提示，直到指针或焦点触发条件重新建立；Enter 和 Space 仍执行主操作。
Search 输入框的键盘处理保持主导：IME 优先，方向键更新选择，Enter 分派，一次普通 Escape 清空
查询和提示。结果仍通过 active descendant 表达，不成为 DOM 焦点目标。失焦时清除键盘候选，
移除或卸载时释放实例，查询清空、surface 切换或重新测量发现当前标题不再截断时清除旧提示内容。
保留 pending 执行去重和既有语言回退。

### Launcher 组合输入

- App Shell 的 `query` 只表示已提交的完整输入值。启用 Semi Input 的 `composition` 支持，
  让局部草稿保持可见、可编辑，同时保留已提交结果、选择、live status 和 surface target。
  独立的 Registry 更新仍遵循既有搜索规则。
- Semi 最终的 `onChange` 是唯一的查询提交入口。采用完整输入值，不从 `compositionend.data`
  猜测；在清除反馈或重置选择之前对等值通知去重。取消回原值时保留搜索，最终空值返回首页，
  无匹配文本沿用既有本地化反馈。普通编辑、粘贴和删除立即提交。
- Escape、Enter 与结果导航之前先检查同步组合会话、原生 `isComposing` 和输入法
  `keyCode === 229`。即使带标记的确认键在组合结束后到达，也要保留输入法默认处理。
  下一次独立普通按键不需要定时器或延迟。
- 显式清空、成功分派、页面切换和卸载使组合会话失效。可见草稿必须与重置查询收敛，
  拒绝失效会话中带组合标记的 input、迟到结束及其等值尾随 change，并忽略已拆除输入节点的事件。
  原生 `isComposing` 与组合 `inputType`（包括 `insertFromComposition`）即使在迟到结束之前，
  也属于来源标记。新的普通编辑、粘贴或组合会话可以正常继续。首页/搜索切换与查询重置保持同一
  原生输入 DOM。
- Semi UI/Foundation `2.101.1` 在受控重置值未变化时会保留草稿与组合标记。类型化 Semi
  Input class ref 仅通过 `foundation.setValue` 和 `compositionEnter` 重置这些输入局部事实；
  `forwardRef` 保留既有 DOM 焦点句柄。升级 Semi 时重新验证真实组件事件序列。
  该有界集成不引入第二个查询 store 或焦点 effect。
- 在两种应用语言和主题中覆盖中文提交、取消、重置竞态、按键优先级、类型化失败、
  combobox/listbox 关系、active descendant 与 live status。确定性 DOM 与调用边界测试
  不能证明原生候选窗口行为。

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

### 标准编辑命令

全选、复制、剪切、粘贴、撤销和重做属于当前文本焦点。在 macOS 上，Host 通过共享响应链
负责原生交付；恢复正常命令传播的修复同时覆盖 Host 输入与当前插件 Child WebView。
前端 handler 应兼容这条路径，不增加 document 全局编辑键 handler 或剪贴板 bridge。
保留 Web 取消默认行为的能力，以及各控件的只读、禁用、空选区和历史语义；已处理的命令
不能再触发一次默认编辑。

既有合规外部插件随 Host 更新获得平台修正，无需修改插件源码、重新打包、更新 SDK 或
申请额外权限。Find、格式化等业务命令仍由插件负责。前台 `Cmd+W/Q` 仍是 Host 保留的
应用命令。原生焦点、传播和生命周期的所有权见
[原生编辑边界](../architecture/plugin-child-webview-runtime.md#原生编辑快捷键)。

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
- 编辑测试必须区分真实 handler 与浏览器缺失的默认行为。Host 测试挂载真实 Semi Input；
  测试自有外部文档只使用普通 `input`、`textarea`、`contenteditable`，不授予插件权限或注入
  生产界面。Happy DOM 缺失的选择、剪贴板默认编辑与撤销历史采用明确的纯文本原语模型：
  先派发可取消的键盘、剪贴板及适用的 `beforeinput` 事件，再执行未被取消的默认操作，
  最后通过 `input` 通知。断言选区、独立 `DataTransfer` 输入／输出、内容、编辑次数、取消、
  焦点变化、空／只读／禁用状态与恢复。不得用 paste 后手动 `change` 或剪贴板 service 的
  自写自读代替编辑证据。这些模型不证明原生事件交付或系统剪贴板访问；应配合生产原生策略、
  适配接线及独立记录的运行证据。Monaco 正文和 Find 输入的不同边界见
  [ConfigLens 检查](config-lens.md#限制chunk-与确定性检查)。
- locale 行为变化时覆盖英文和简体中文输出。
- 主题行为变化时覆盖明亮和黑暗模式集成。
- 通过 `AppErrorBoundary` 覆盖 App Shell 渲染失败；React 错误边界不会捕获事件处理器和异步
  失败，因此这些失败必须使用显式错误状态。
- 通过页面级错误边界覆盖活动页面渲染失败，确保上下文头部和关闭控件继续可用。
- Launcher 顶部区域变化通过 component、controller 与 Rust policy test 覆盖拖动分类、caret/input
  routing、键盘选择、页面关闭、失焦隐藏、快捷键恢复和固定 320/480/600px mode。
- 分段页面上下文变更通过 DOM 与状态断言覆盖英文/简体中文、light/dark semantic token、关闭按钮
  紧邻关系与键盘焦点、avatar 状态保持和长文本省略。
- 共享 Action 卡片使用可控宽度度量覆盖连续字号适配和无效尺寸恢复、observer/字体失效及清理、
  方形样式约束和完整可访问名称。通过真实 Semi Tooltip 交互覆盖 Home 两集合与 Search，包括
  pointer 优先、重复实例、焦点、Escape、IME、语言、主题及 pending 执行。确定性 DOM 度量证明
  计算和交互契约，不能证明平台字体排版或最终像素外观；不得新增浏览器、WebView 或截图验证。
- 为提取出的领域函数增加聚焦测试。
- 避免使用会掩盖有效行为断言的 snapshot。
- Plugin management 变更必须覆盖英文/简体中文与 light/dark 的全部维护状态，并断言 split-surface
  语义、selection、border/overflow class、长名称/诊断、modal 行为、disabled state 与 focus recovery。

## 快捷键设置

快捷键分区复用现有设置导航、固定 `650×600` 窗口与独立滚动的右侧内容区。注入 typed Host-private
`ShortcutService`；组件不直接调用原生命令，不与主题、语言或集合共享持久化。分别展示已确认绑定与
运行可用性。保留不可用 Action ID 的修改和清除入口，不伪造旧标题。恢复默认需要确认，且只替换系统唤出 trigger，
保留全部功能/Action 绑定。编辑或恢复系统快捷键都执行普通冲突检查；默认组合被占用时报告冲突，
不得删除或改写占用它的功能配置。

内容区使用同级的“系统快捷键”和“功能快捷键”标题，侧边栏仍称“快捷键”。不展示介绍段落、
录制提示、未保存编辑说明或双击时限说明；编辑行只保留靠右的保存/取消按钮，实际保存/错误、授权和
迁移反馈在需要时仍可访问。空反馈不预留可见间距。

唤出只展示一行，依次为标题、类型下拉框、当前快捷键，不再单列双击唤出。每条 Action 行依次为类型
下拉框、当前快捷键、Action 下拉框、删除按钮。列表底部“新增”创建本地草稿，不完整行不持久化。
“恢复默认快捷键”位于系统快捷键分组末尾、底部分割线上方并右对齐；“添加功能快捷键”位于功能
快捷键分组末尾、底部分割线上方并右对齐。分组分割线位于分组操作之后，功能行之间只保留间距，不绘制分割线。
恢复在确认时使用最新已确认快照，仅修改 `launcher`，保留期间更新的功能配置；保存/冲突错误
在确认对话框内可见。解决旧配置迁移时也保留原 Action 映射。
组合键点击键位单元格开始录制；双击类型在常态和编辑态的键位单元格直接显示 Cmd/Ctrl/Option/Shift
下拉框，选择修饰键不会启动录制或取得/续期 lease。保存/取消紧凑地放在当前编辑行下方，不附说明文案。类型或 Action
变更在明确保存前都只是候选。Action ID 改绑原子执行，并拒绝覆盖其它行已占用的目标。 功能目标下拉框按稳定 ID 排除内置
`lensx.core.hide_launcher` 和 `lensx.core.open_settings`，已有行的回填选项也不得重新加入它们；
不按显示文案过滤，不移除 Launcher 搜索或 Registry 中的这两个操作。已有已保存绑定不自动删除，
折叠的选择控件仍可标识其目标供用户明确改绑或删除，但不在下拉选项中提供这些 ID。删除草稿
只影响本地；删除已保存行走完整事务，失败保留该行。Escape 删除未保存草稿或恢复已保存行，并将
焦点返回键位或新增按钮。长标签保持在固定且可滚动的右侧内容区内。

配置 v2 只有一个唤出 trigger，类型为组合键或修饰键双击。类型切换成功后旧入口停用，不保留隐藏
恢复组合键。唯一入口不可用时保持窗口可见供修改或退出。快照含 `launcher_migration` 时，类型
保持未选，保留两个旧候选，要求明确选择类型并保存后才能修改 Action 行。只有这次保存或已确认
恢复默认才发送 `resolveLauncherMigration: true`，不得把占位组合键显示为已生效。

即时反馈使用共享快捷键策略，最终校验由 Rust 执行。录制物理 `KeyboardEvent.code`，同时检查
当前 `key` 语义及物理保留别名；显示 Host 提供的当前布局标签，不假定 QWERTY 字母。只有组合键采集使用原生 lease；
开始前先订阅，仅在可见且录制时续期，取消、失焦、隐藏、离开分区或卸载时释放，并忽略旧 lease
事件。已注册原生组合可通过候选事件交付。无论焦点位于哪个控件，裸 Escape 都退出快捷键编辑，
包括尚未开始录制、正在取得 lease 和保存失败后的状态。取消会丢弃候选、释放录制并将焦点恢复到
编辑入口，不改变已确认绑定；已经提交的保存仍保留进行中保护。录制时带修饰键的 Escape 仍是候选；
忽略 IME 输入，Cmd+W/Q 保留原生关闭/退出。退出编辑或卸载时移除 Escape 监听，保持普通设置导航
原有的键盘行为。

候选不代表已生效绑定。校验、注册或存储失败时保留候选；revision 冲突重新读取已确认快照，再由
用户明确保存。live feedback、控件、保留/冲突目标和运行状态使用语言资源与 Semi 主题 token，
覆盖两种语言和主题。不得展示原始诊断或其它应用输入。只对双击解释监听授权，且仅由用户主动请求。
双击要求同一物理修饰键两次完整按压（每次最多 200 毫秒）、两击间隔最多 300 毫秒，再静默确认
300 毫秒。窗口内连续系统多击会取消候选；被动监听不向其它应用独占该手势，也不阻止系统辅助功能。

组合键开始新录制时清空本地候选，并在按下/松开时实时预览当前修饰键与主键（包括不完整前缀）。
显示状态不是可持久化 trigger；所有键松开后保留最后完整有效候选。未知、保留和多主键输入被拒绝，
不得把旧绑定冒充本次成功采集。原生已注册组合反馈立即更新显示；忽略 IME，并在失焦、切换类型、
取消、释放 lease 和卸载时清除瞬时按键状态。
