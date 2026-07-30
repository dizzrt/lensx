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

当前 App Shell 只展示 lensX 产品身份和产品说明。它是可观察的前端基座，不代表 launcher、设置或
插件工作流已经实现。

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
