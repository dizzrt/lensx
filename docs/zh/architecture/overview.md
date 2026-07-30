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
  registry、dispatcher，以及通过类型化 Rust command 路由的内建隐藏 action；
- Rstest、Testing Library、TypeScript 检查、Biome 和 Cargo 验证命令；
- 用于能力和架构变更的 OpenSpec 配置。

在相应源码和测试存在之前，不能把超出这些基础的产品能力描述为已经实现。

## 前端应用基座

`src/index.tsx` 是唯一的前端组合入口。它只导入一次 Semi Design 全局样式表和项目
`global.less` 入口，然后在 `AppProviders` 内渲染产品 App Shell。

`AppProviders` 是唯一的应用级 Provider 组合：

```text
AppLocaleProvider
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
locale，并比较完整叶子 key 集合。locale 选择目前仅保存在内存中，不跟随操作系统偏好。

应用主题仅限 `light` 和 `dark`，默认使用 `light`。主题 Provider 使用
`body[theme-mode="dark"]`，使挂载在 `body` 下的 Semi Design 内容（包括浮层）获得同一套 token，
并同步文档的 `color-scheme`。主题选择目前仅保存在内存中，不跟随操作系统偏好。

`AppErrorBoundary` 隔离 Provider 根层以下的渲染失败。其本地化 Semi Design 降级界面保留当前
主题，并提供窗口重新加载操作，但不展示异常细节。事件处理器和异步错误需要显式错误状态，不属于此
渲染错误边界的捕获范围。

当前 App Shell 展示 lensX 产品身份、产品说明和一个本地受控的 launcher 输入。输入可以接受文本，
但不会产生结果或 action。它是可观察的 launcher 承载面，不代表搜索、执行、设置或插件工作流已经
实现。

## Launcher 窗口生命周期

Tauri 中带有稳定 `main` 标签的 webview 窗口被配置为紧凑的 launcher 承载面。窗口固定宽度为
650px，初始和最小高度为 180px，最大高度为 800px。窗口透明、保持置顶、无系统边框、不可调整
大小且非全屏。应用目前不会根据 DOM 内容或输入值调整原生窗口尺寸。

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

每次 `show` 成功后，Rust 向主 webview 发送 `launcher://activated`。其可序列化 payload 包含
`reason` 字段，值为 `startup`、`global_shortcut` 或 `programmatic` 之一，并使用 snake-case
序列化值。React 通过类型化桌面 adapter 接收该契约。launcher 输入在首次挂载时主动聚焦，并在每次
激活后重新聚焦。对应 hook 为当前事件源维护一个订阅，在事件源变化或组件卸载时释放 listener，并在
载荷格式错误或监听失败时输出诊断，而不破坏首次输入聚焦。

该生命周期本身不实现查询匹配、结果列表、设置、快捷键自定义、持久化或插件运行时行为。

## Launcher Action 核心

launcher action 核心位于 `src/app/launcher/actions/`，属于可信 TypeScript 应用与领域层。
它不依赖 React、Semi Design 或 Tauri API。每个 action 都有经过校验、可序列化的
descriptor，其中包含稳定的命名空间 `action_id`、`owner_id`、本地化元数据、本地化默认
关键词和静态启用状态。英文元数据是规范源，同时支持简体中文；缺少当前语言文本时回退到英文。

`LauncherActionRegistry` 是运行时已注册 launcher action 的唯一事实来源。注册过程在提交前校验并
规范化未知 descriptor 输入，拒绝重复 ID，并以原子方式应用批量注册。公开查询和 snapshot 返回
深度隔离的 descriptor 数据，绝不包含 executor。snapshot 按 `action_id` 排序，使默认顺序不依赖
provider 加载顺序。

executor 保持由 Host 所有，只能由 `LauncherActionDispatcher` 解析。dispatch 返回明确成功结果，
或者类型化的 `action_not_found`、`action_unavailable`、`action_execution_failed` 结果。
executor 抛出、reject 或返回无效结果时会被隔离，不会通过公开契约暴露原生或框架对象。

默认 service 当前只注册 `lensx.core.hide_launcher`。其标题和说明来自规范应用 message 资源。
executor 调用类型化桌面 adapter，后者调用窄化的 `hide_launcher` Tauri command。Rust 将该
command 映射到现有 managed `LauncherWindowActions` 边界和 `LauncherWindowAction::Hide`；
它不会复制原生窗口逻辑，也不接受任意 action ID。

当前 React App Shell 不创建或消费默认 action service，不读取 registry snapshot，不匹配
launcher 查询，也不渲染 action 结果。搜索、排序、选择、历史、设置、动态可用性、provider
生命周期和插件 action 投影仍属于未来能力。

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
