# 架构概览

## 文档状态

本文定义 lensX 持续维护的架构方向，并记录仓库当前具备的基础。架构方向不代表相关能力已经交付；
源码、测试和稳定 spec 共同决定已经实现的行为。

## 产品目标

lensX 是一款轻量级桌面效率启动器，其设计重点包括：

- 快速全局呼出；
- 键盘优先交互；
- 较低的常驻资源占用；
- 本地优先的工作流；
- 明确、安全的扩展边界；
- 在支持的桌面平台上提供可预测的行为。

## 当前基础

仓库目前提供：

- 由 Rust 支持的 Tauri 2 桌面应用运行时；
- 使用 Rsbuild 和 Rspack 构建的 React 与 TypeScript 前端；
- 作为前端 UI 和样式基础的 Semi Design、UnoCSS 与 Less；
- 带有统一 locale、主题、Semi Design 和渲染错误边界的产品自有 React App Shell；
- 由 Rust 统一拥有显示、隐藏、切换、全局快捷键、关闭与失焦行为的紧凑原生 launcher
  窗口；
- 框架无关的 TypeScript launcher action 核心，包含经过校验的 descriptor、Host 所有的
  registry、dispatcher，以及内建的隐藏和设置 action；
- 基于不可变 registry snapshot 的确定性 launcher action 搜索，包含本地化匹配和可访问、
  键盘优先的四列结果网格；
- Host 私有 Plugin surface 投影协调器，提供 provider-scoped Page/Action 原子替换、
  revision-aware 资格判断和 fail-closed 生命周期处理；
- Rust 所有的 scoped Plugin Resource Service，只通过严格 package-relative path、固定 MIME、
  no-store response 与 generation-bound 撤销提供当前 managed payload；
- 统一的 Host-owned Page Registry 与框架无关导航 service，用于受保护 Host Page 和声明式
  Plugin Page descriptor；
- 通过窄化 Rust/Tauri 边界持久化、并按当前 registry snapshot 解析的版本化最近使用与已固定
  Action 集合；
- 单窗口 Host 设置界面，包含持久化主题与语言偏好，以及刻意保持为空的插件部分；
- 公开的 `@lensx/plugin-contract@0.1.0` workspace package，提供受限的 Schema、类型、
  校验和规范化 exports，并通过真实 package tarball 验证；
- Rstest、Testing Library、TypeScript 检查、Biome 和 Cargo 验证命令；
- 用于能力和架构变更的 OpenSpec 配置。

在相应源码和测试存在之前，不能把超出这些基础的产品能力描述为已经实现。

## 前端应用基座

`src/index.tsx` 是唯一的前端组合入口。它只导入一次 Semi Design 全局样式表和项目
`global.less` 入口，然后渲染 `AppBootstrap`。bootstrap 会在产品 App Shell 渲染前读取偏好；
读取失败时使用安全默认值继续启动。

`AppProviders` 是唯一的应用级 Provider 组合：

```text
AppBootstrap
└── AppLocaleProvider
    └── AppThemeProvider
        └── Semi Design LocaleProvider
            └── AppErrorBoundary
                └── App
```

应用 locale 仅限 `en-US` 和 `zh-CN`，默认使用 `en-US`，并同时驱动应用 message、对应的
Semi Design 官方 locale pack 和 HTML `lang` 属性。英文 message 是规范源，两种 message 资源保持
相同的嵌套层次和叶子 key 集合。静态导入的资源位于 `src/app/i18n/messages/en-US.json` 和
`zh-CN.json`，应用通过点分隔路径查询叶子 message。共享的 `messages.schema.json` 镜像该层次，
固定允许和必需的 key、拒绝额外 key，并要求值为非空字符串。前端测试会依据该 schema 校验每个
locale，并比较完整叶子 key 集合。已确认的 locale 通过 Rust 偏好边界持久化，不跟随操作系统偏好。

应用主题仅限 `light` 和 `dark`，默认使用 `light`。主题 Provider 使用
`body[theme-mode="dark"]`，使挂载在 `body` 下的 Semi Design 内容（包括浮层）获得同一套 token，
并同步文档的 `color-scheme`。已确认的主题通过同一 Rust 偏好边界持久化，不跟随操作系统偏好。

`AppErrorBoundary` 隔离 Provider 根层以下的渲染失败。其本地化 Semi Design 降级界面保留当前
主题，并提供窗口重新加载操作，但不展示异常细节。事件处理器和异步错误需要显式错误状态，不属于此
渲染错误边界的捕获范围。

App Shell 根据本地 `activePage` 和规范化查询推导三种呈现状态。三种状态共享同一顶部行和非交互
avatar 占位。`home` 保留 launcher 输入，并依次从已接受的 Action 集合渲染“最近使用”和“已固定”；
它不会用 registry 顺序或模拟数据补齐。“已固定”旁的本地化“全部”只是非交互占位。`search` 保留
同一输入，并在单一四列网格中显示最多八个真实启用的 Action 结果。`page` 用本地化的“所属方 / Action”
上下文条和可访问关闭图标替换输入，同时保留 avatar 占位。关闭页面会返回 `home` 并恢复输入焦点；
页面级错误边界会在内容失败时保留上下文条和关闭控件。

## Launcher 窗口生命周期

Tauri 中带有稳定 `main` 标签的 webview 窗口被配置为紧凑的 launcher 承载面。窗口固定宽度为
650px，初始高度为 320px、最小高度为 180px、最大高度为 800px。窗口透明、保持置顶、无系统边框、
不可由用户调整大小且非全屏。

Host 通过类型化 Rust command 把 App Shell 呈现状态映射到固定逻辑高度：`home` 使用 320px、
`search` 使用 480px、`page` 使用 600px。这样公共内容区保持可见，同时不会测量 DOM 内容或根据
集合或搜索结果数量改变高度；前端也不能提交任意尺寸。

Rust 通过单一动作边界拥有全部 launcher 原生窗口操作：

- `show` 依次恢复窗口、显示窗口、请求焦点，然后发送类型化激活事件；
- `hide` 隐藏窗口，但不终止应用进程；
- `toggle` 读取当前可见性，并复用对应的 `show` 或 `hide` 路径。

动作边界通过 Tauri adapter 解析 `main` 窗口，并在失败时同时报告请求的动作和失败的原生操作阶段。
原生快捷键和窗口事件 handler 通过该边界路由动作，不会各自直接调用窗口 API。

官方 Tauri global-shortcut 插件注册唯一的默认 `Ctrl+Shift+Space` 绑定。只有按下事件会路由到
`toggle`；释放事件和未知快捷键不执行动作。生命周期 setup 先安装动作状态，再注册快捷键，最后才
为主窗口安装 listener。注册成功后，关闭请求会被阻止并路由到 `hide`，失焦也会路由到 `hide`。
如果快捷键注册失败，应用会报告包含绑定的错误，并保持关闭转隐藏和失焦隐藏为禁用状态，使可见窗口
保留普通关闭行为，而不会进入无法恢复的隐藏状态。

在 macOS 上，无装饰 launcher 不能依赖默认的“关闭窗口”菜单命令：其原生 `performClose:` selector
要求窗口具备 closable style，因此不会为这个无边框承载面产生 `CloseRequested`。只有在恢复快捷键
和原生窗口 listener 都就绪后，Host 才会用应用所有的菜单替换默认应用菜单；该菜单保留标准的应用、
编辑、显示、窗口、帮助以及 `Cmd+Q` 退出语义，同时移除所有 predefined Close Window accelerator。
恰好一个自定义“关闭窗口”项目持有应用内 `Cmd+W` accelerator，其稳定菜单 ID 会进入与原生关闭请求
和失焦相同的 Rust `Hide` action 边界。它不是全局快捷键，也不会影响其他应用中的 `Cmd+W`。如果恢复
快捷键或窗口 listener 不可用，Host 不会安装该自定义菜单；如果菜单安装本身失败，Host 会记录
`hide` action 与 `install_menu` 操作阶段且不会终止进程，已经注册的恢复快捷键和原生生命周期 listener
仍然可用。

每次 `show` 成功后，Rust 向主 webview 发送 `launcher://activated`。其可序列化 payload 包含
`reason` 字段，值为 `startup`、`global_shortcut` 或 `programmatic` 之一，并使用 snake-case
序列化值。React 通过类型化桌面 adapter 接收该契约。launcher 输入在首次挂载时主动聚焦，并在每次
激活后重新聚焦。对应 hook 为当前事件源维护一个订阅，在事件源变化或组件卸载时释放 listener，并在
载荷格式错误或监听失败时输出诊断，而不破坏首次输入聚焦。每次激活还会使用当前查询和最新 registry
snapshot 刷新搜索，但不会填充、清除或执行 action。

该生命周期本身不实现查询匹配、结果列表、设置、快捷键自定义、持久化或插件运行时行为。独立的受约束
surface mode command 只控制同一 `main` 窗口的固定呈现高度。

## Launcher Action 核心

launcher action 核心位于 `src/app/launcher/actions/`，属于可信 TypeScript 应用与领域层。
它不依赖 React、Semi Design 或 Tauri API。每个 action 都有经过校验、可序列化的
descriptor，其中包含稳定的命名空间 `action_id`、`owner_id`、本地化元数据、本地化默认
关键词、静态启用状态，以及可选且经过校验的 `{ kind: "host", token }` 展示图标。Host icon token
始终是可序列化 plain data，只能通过 Host icon resolver 解析；缺失或无法解析时使用稳定的通用
Action 图标。英文元数据是规范源，同时支持简体中文；缺少当前语言文本时回退到英文。

`LauncherActionRegistry` 是运行时已注册 launcher action 的唯一事实来源。注册过程在提交前校验并
规范化未知 descriptor 输入，拒绝重复 ID，并以原子方式应用批量注册。可信 provider 还可以在一次
转换中替换或注销其完整的 owner-scoped 批次；非法、重复或跨 owner 输入会保留完整调用前状态，且
不能触碰其他 provider 的 executor。公开查询和 snapshot 返回深度隔离的 descriptor 数据，绝不包含
executor 或 provider bookkeeping。snapshot 按 `action_id` 排序，使默认顺序不依赖 provider 加载顺序。

executor 保持由 Host 所有，只能由 `LauncherActionDispatcher` 解析。dispatch 返回明确成功结果，
或者类型化的 `action_not_found`、`action_unavailable`、`action_execution_failed` 结果。
executor 抛出、reject 或返回无效结果时会被隔离，不会通过公开契约暴露原生或框架对象。

默认 service 注册 `lensx.core.hide_launcher` 和 `lensx.core.open_settings`。两者的本地化
metadata 都来自规范应用 message 资源。隐藏 executor 通过类型化桌面 adapter 调用窄化的
`hide_launcher` Tauri command；设置 executor 通过框架无关的 `AppNavigationService` 请求固定
的 `lensx.core/settings` Host 目标。公开 descriptor 都不暴露 executor 或页面目标。

Host 私有 Plugin surface 投影协调器消费 Plugin Registration Desktop Adapter 的完整 snapshot 和同
revision detail。只有 enabled、registered、未 quarantine，并同时兼容 lensX 与 Host API 的插件才
具备资格。它把每个 Manifest Page 映射为稳定的
`(owner_id = plugin_id, page_id = 插件本地 Page ID)` 身份，并把每个 Manifest Action 映射为
owner `plugin_id` 和全局 ID
`<plugin_id>.<local_action_id>`，保留规范化的 Action 自有 metadata，并生成 Host-owned Page opener
executor。Manifest asset icon、Action target、publisher/source 声明和
`default_action_id` 排名都不会进入 descriptor。package-local icon 会被省略，从而使用现有通用
Action 图标。

投影按 Registration revision 串行收敛。过期 detail 结果会被丢弃；disabled、incompatible、
quarantined、degraded、已消失或无法验证的 provider 会 fail closed 注销。单个 provider 的失败只
影响该 owner，并且只产生有界安全诊断。对当前合格 revision，生产环境先提交完整 Page 批次，再发布
目标当前 available 的 Action；移除时先注销 Action，再注销 Page。Page 仅在其全部 required
permission ID 都存在于当前 Host-owned grant snapshot 时 available。这只是机械的子集检查，不是
permission catalog、grant decision、提示或 Runtime session 授权。

生产 launcher action service 在 React render 之外只创建一次，并允许在 App Shell 边界替换为
隔离的测试 service。Launcher action 搜索是 registry descriptor snapshot 的纯消费者。它使用
Unicode NFKC、locale-aware 大小写折叠和 Unicode 空白折叠来规范化查询及可搜索 metadata。每个
查询 token 都必须匹配已解析标题、某个已解析默认关键词或已解析描述。固定的 exact、prefix 和
substring 权重产生按 score 降序的顺序，并以 `action_id` 作为确定性平分规则。禁用 action 会在
排序结果截断到 v0 上限八项之前被过滤。搜索结果是冻结的可序列化数据，只包含身份、已解析展示文本、
可选安全 icon metadata 和 score；icon 与 Action 集合都不影响匹配、评分或排序，结果绝不包含
executor 或 registry 内部状态。

App Shell 将这些结果实现为 combobox/listbox 交互，并使用固定四个视觉列和最多两行。第一项默认
选中；左右键移动到相邻结果，上下键在目标存在时按四项移动，且移动不循环。Escape 清空搜索，
pending dispatch 会阻止重复执行。成功会清空查询；类型化 dispatcher failure
会保留查询和选中项，同时显示安全的本地化反馈。结果数量、空状态、pending、成功和失败状态通过
live region 播报，而不会形成第二个可见结果分区。结果网格在现有 surface 内保持有界，不会调整原生
窗口尺寸。

## Launcher Action 集合

Rust 在独立的应用配置文件中持有版本化 `LauncherActionCollections` snapshot。
`recent_action_ids` 是从新到旧的 MRU 列表，`pinned_action_ids` 保持固定顺序。两个集合都只包含唯一、
经过校验的 Action ID，且最多八项。文件缺失时返回空集合；严格读取会拒绝格式错误的版本、字段、ID、
重复和超限数据。写入使用已同步的临时文件再原子替换，并返回不包含路径或文件内容的稳定安全错误。

TypeScript client 只公开读取、记录成功使用和设置固定状态操作。React 通过当前不可变 registry
snapshot 解析已存 ID，保持顺序，隐藏缺失或禁用 Action，但不删除或替换这些 ID。只有成功 dispatch
才记录最近使用；dispatch 失败不记录。最近使用持久化失败不会把已成功 Action 改写为失败。固定与
取消固定使用 optimistic 视图，但失败后恢复最后确认 snapshot；第九个固定请求会被拒绝，且不会删除
现有项。

插件管理、安全插件资源/icon 解析、iframe Runtime、生命周期写操作和完整权限决策仍属于未来能力。
生产 Plugin Action 现在只会在其投影目标 Page available 时出现。持久化 Plugin Action ID 可以自然
隐藏和恢复，而不会从最近使用或已固定存储中删除。

## Host 页面与偏好

Host 与 Plugin Page 共用统一的 Host-owned Page Registry，以及扁平的 `owner_id`、`page_id` 与
`opened_by_action_id` `ActivePage` 身份。Registry 保护 `lensx.core`，按插件 provider 原子替换完整
Page 批次，并返回隔离且确定性的 snapshot。私有 route、required permission ID、provider
bookkeeping、安装事实和 Runtime entry 不会进入 `ActivePage` 或展示 props。

`AppNavigationService` 在把 `ActivePage` 交给唯一 App Shell handler 前预检当前 descriptor 与
availability。Registry 更新移除 active Plugin Page 或令其 unavailable 时，会触发 Host-owned close
transition 返回 `home`；相同 available 身份的 metadata 更新不会关闭 Page。插件不会获得 React
setter、navigation handler、Registry mutation API、renderer 或 Tauri 对象。

页面上下文 resolver 从 Page resolution 与 Launcher Registry snapshot 派生当前本地化 Owner、Page
标题与 opening Action 名称。缺失 `zh-CN` Owner 文本时回退 `en-US`；opening Action 缺失时回退当前
Page 标题。Host Page 使用受保护 Host icon token；在 scoped resource resolver 交付前，Plugin Page
使用通用 provider icon。显示字符串不会复制进 `ActivePage`，因此 locale 与 metadata 更新会从当前
事实重新解析。

App Shell 继续在现有 main window 中使用唯一 `home` / `search` / `page` presentation state。
`lensx.core/settings` 渲染可信 Settings surface。available Plugin Page 只会在现有 Page error boundary
内渲染本地化 Host-owned placeholder；它不会读取私有 route、加载 entry 或 asset、创建 iframe、调用
Tauri 或执行插件代码。Task 4.1 scoped resources、Task 4.2 iframe Runtime 和 Task 5.5 完整权限管理
仍未实现。

设置在现有 `main` Tauri 窗口中渲染，包含“偏好”和“插件”两个一级部分。“偏好”控制受支持的
`light`/`dark` 主题与 `en-US`/`zh-CN` locale；“插件”只是不可操作的空占位，不代表插件管理
已经实现。

Rust 持有完整 `AppPreferences` payload，并在应用配置目录中保存 `preferences.json`。文件缺失时
返回 `light` 和 `en-US`；无效内容与 I/O 失败返回稳定、可序列化且安全的错误。写入先生成临时文件
再替换目标文件。TypeScript 桌面 adapter 会校验成功 payload 和错误 payload。

设置通过串行保存链写入完整偏好 snapshot。只有 Rust 确认写入后，根主题与语言 Provider 才会
切换。写入失败会保留最后确认的 Provider 值并显示本地化反馈；启动读取失败会使用安全默认值并保留
本地化诊断状态。

## 分层模型

```text
┌─────────────────────────────────────────────┐
│ React 展示层                                │
│ 页面、交互状态、视图组合                    │
├─────────────────────────────────────────────┤
│ 应用与领域服务                              │
│ 启动器概念、编排、契约                      │
├─────────────────────────────────────────────┤
│ 类型化桌面适配器                            │
│ 可序列化的 Tauri command 与 event           │
├─────────────────────────────────────────────┤
│ Rust 桌面运行时                             │
│ 原生集成、持久化、特权操作                  │
└─────────────────────────────────────────────┘
```

扩展运行时通过明确的 Host 契约接入。它们不能绕过应用服务直接访问 React 状态、Tauri
内部实现或具有特权的原生 API。

## 职责边界

### React 前端

前端负责：

- 展示与视图组合；
- 临时交互状态；
- 应用界面内的键盘和焦点行为；
- 主题和语言展示；
- 通过类型化应用适配器和桌面适配器发起调用。

只要业务规则能够表示为可测试的领域函数或服务，就应使其独立于 React 组件。

### Rust 桌面运行时

Rust 负责：

- 原生窗口和操作系统集成；
- 特权操作和安全敏感的校验；
- 持久化和文件系统边界；
- scoped plugin resource 授权、安全文件打开与 protocol response；
- 对性能敏感的后台工作；
- 稳定的 Tauri command 和 event。

Rust 不能通过 Tauri 边界泄漏内部实现类型。

### 跨边界契约

前端、Rust 和扩展边界使用的 payload 必须：

- 具有明确类型；
- 可以序列化；
- 在信任边界进行校验；
- 在外部消费者依赖时进行版本化；
- 足够稳定，可以独立测试。

除非已接受的契约另有规定，跨语言序列化字段使用 `snake_case`。

Host 私有 Resource Contract 遵循该边界：可信 TypeScript 只提交 entry ID 与调用方观察到的
Registration revision；Rust 派生当前 plugin identity/version/entry 与 opaque URL；每个 custom-protocol
request 都依据当前 Manager generation 与 Installer-owned payload 重新验证进程内 scope。React 与公共
plugin package 都不会获得 installation path、digest、record key 或通用文件读取器。这只是资源读取
基础；iframe isolation、Runtime Session identity、Host API transport 与完整 CSP 仍是独立工作。

## 依赖方向

- UI 组件可以依赖应用服务，但不能直接依赖 Rust 内部实现。
- 应用服务可以依赖抽象适配器和领域契约。
- Tauri 适配器负责在应用契约与原生 command 之间转换。
- 原生服务不能依赖前端组件结构。
- 扩展契约不能依赖私有 React 模块。

不要为语言、主题、持久化偏好或已注册能力建立并行事实来源。

## 横切要求

- 英文是应用默认语言，同时支持简体中文。
- 明暗模式使用 Semi Design 支持的主题机制。
- 键盘访问和可见焦点属于一等需求。
- 跨边界错误必须可诊断，并且能够安全展示或记录。
- 规划中的行为必须先经过 OpenSpec，才能成为稳定的能力契约。
