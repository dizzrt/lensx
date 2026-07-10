## Context

lensX 当前是 Tauri 2 + Vue 3 的早期启动器 scaffold，已有 Rust 侧窗口动作、快捷键管理和 Vue 侧一体化启动器面板，但还没有插件模型、命令注册表、搜索索引或外部扩展运行时。

插件能力需要同时支持两类来源：

- 内建插件：随软件打包预装，是 lensX 产品的一部分，例如后续的设置插件；部分内建插件不可卸载、不可禁用。
- 外部插件：由第三方开发、以插件包安装，必须隔离渲染并通过受控 Host API 使用 lensX 能力。

本设计建立统一插件 contract 和插件宿主基础设施，但第一阶段不实现任何具体内建插件，不启用 sidecar，也不开放后台常驻插件能力。

## Goals / Non-Goals

**Goals:**

- 建立内建插件和外部插件共享的 manifest、页面、行为、权限、生命周期和运行时策略模型。
- 实现全局唯一、严格三段式 ID 校验，拒绝错误引用和重复 ID。
- 支持内建插件以主 Vue 动态模块运行，外部插件以 iframe 隔离渲染。
- 支持外部插件通过 JSON-RPC 2.0 over `postMessage` 调用 Host API。
- 提供 `@lensx/plugin-sdk` workspace package，封装 RPC、Host API 类型、manifest 类型和运行时上下文。
- 提供 Host API schema、manifest schema 和权限 schema，作为 Host、SDK、示例和文档的共源契约。
- 沉淀内建/外部插件开发规范、调用规范、发布格式、载入流程和安全边界到项目文档。
- 保持启动器主路径轻量：应用启动时只加载插件元数据，不常驻加载外部插件 iframe。

**Non-Goals:**

- 不实现具体内建插件，包括设置插件本体。
- 不实现插件市场、远程下载、签名分发或自动更新。
- 不支持外部插件直接访问主 Vue store、Tauri command 或 Rust 内部对象。
- 不支持外部插件动态注入 Rust 代码、动态库或主进程原生模块。
- 不启用 sidecar；仅在 manifest/schema 中预留字段并在 Host 侧拒绝执行。
- 不实现后台常驻插件、插件间直接通信、流式 RPC、大文件传输或外部插件搜索索引。

## Decisions

### 1. 统一 Plugin Contract，来源与生命周期策略分离

插件 contract 包含：

- `id`
- `source`: `builtin` 或 `external`
- `lifecycle`: `uninstallable`、`disableable`
- `runtime.ui`: `vue_module` 或 `iframe`
- `pages`
- `actions`
- `permissions`
- `sdk` / `host_api` 兼容信息
- `sidecar` 预留字段

`source` 只描述插件来源，不隐含能否卸载或禁用。是否可卸载、可禁用由 `lifecycle` 独立表达。

备选方案是将 `builtin` 直接硬编码为不可卸载、不可禁用。该方案短期简单，但无法表达“内建但可禁用”的后续能力，也会把产品策略耦合进来源字段，因此不采用。

### 2. 所有可引用内容 ID 全局唯一且严格三段式

插件、页面、行为、权限、快捷键绑定、sidecar 预留项等可引用内容 ID 必须使用严格三段式：

```text
author.module.name
```

第三段内部可以用 `_` 表达类型和局部名称，例如：

```text
lensx.core.settings
lensx.core.settings_page_main
lensx.core.settings_action_open
lensx.core.permission_preferences_read
```

不得使用第四段或更多段表达层级，例如 `lensx.core.settings.page.main` 必须被拒绝。归属、层级和引用关系必须通过显式字段表达，例如 `plugin_id`、`parent_page_id`、`target_page_id`。

注册阶段必须严格失败：重复 ID、格式错误、缺失引用、循环页面父子关系、未声明权限引用都必须阻止插件注册。

### 3. 内建插件使用主 Vue 动态模块

内建插件源码位于 `src/plugins/builtin/**`，使用 TypeScript manifest 声明插件 contract，页面组件通过动态 import 加载。

内建插件共享主应用的 Vue runtime、Naive UI Provider、主题、应用 i18n、Naive UI locale/dateLocale 和 UnoCSS/Less 样式体系。这样可以保持内建功能的性能和视觉一致性。

备选方案是让内建插件也用 iframe。该方案统一运行时，但会给产品内置功能带来不必要的隔离和性能成本，因此不作为默认策略。

### 4. 外部插件使用 iframe 隔离渲染

外部插件以 `.lxplugin` 包发布，本质为压缩包，至少包含：

```text
manifest.json
dist/index.html
assets/*
```

安装后解压到用户数据目录。应用启动时只读取 manifest、校验 contract、注册页面和行为元数据，不加载 iframe。用户打开外部插件页面时，`ExternalPluginFrame` 才懒加载 iframe。

iframe 通过插件资源协议或等价本地资源入口加载，Host 必须设置 sandbox/CSP/origin 校验，禁止外部插件直接访问主页面对象。iframe 内部用户界面由插件自行负责，Host 只保证容器、尺寸、主题/locale 事件和 RPC bridge。

备选方案是独立 Webview。Webview 隔离更强，但内存、启动、焦点和生命周期成本更高。第一阶段默认采用更轻量的 iframe；后续可为高权限插件增加 `runtime.ui.type = "webview"`。

### 5. 外部插件通过 JSON-RPC 2.0 over postMessage 调用 Host API

外部插件不得直接调用 Tauri command。插件 SDK 将 Host API 调用封装为 JSON-RPC 2.0 消息，通过 `postMessage` 与 Host bridge 通信。

调用链为：

```text
外部插件 iframe
  -> @lensx/plugin-sdk
  -> JSON-RPC 2.0 over postMessage
  -> Plugin Bridge
  -> Host API Dispatcher
  -> Vue Host Service 或 Tauri/Rust Core
```

Host API Dispatcher 必须校验：

- 消息来源与 plugin_id
- RPC 方法 ID 是否存在且为三段式
- 插件是否声明并获得所需 permission
- params 是否符合 schema
- 调用是否在当前插件生命周期内有效

备选方案是 gRPC。gRPC 对 iframe 边界不自然，需要 HTTP/gRPC-Web/代码生成链路，且不能解决 plugin_id、origin、权限和生命周期校验问题，因此第一阶段不采用。

### 6. `@lensx/plugin-sdk` 在当前仓库内以 workspace package 维护

SDK 位于 `packages/plugin-sdk/`，第一阶段不单独开仓库。SDK 与 Host API 强绑定，早期会频繁调整，同仓维护可以让 Host、schema、SDK 和示例插件一起演进和验证。

SDK 负责：

- 封装 JSON-RPC request/response、notification、timeout 和错误码。
- 提供 manifest、pages、actions、permissions、runtime context 类型。
- 提供类型化 Host API 包装，例如 runtime、preferences、actions、events、ui。
- 屏蔽 `postMessage` 协议细节，避免外部插件手写底层消息。

### 7. Host API 和插件 schema 共源

新增 `schemas/plugin/`：

- `manifest.schema.json`
- `host-api.schema.json`
- `permissions.schema.json`

schema 用于：

- Host 侧 manifest 和 RPC 参数校验。
- SDK 类型和文档生成。
- 示例插件校验。
- 后续插件打包工具校验。

第一阶段可以手写 TypeScript 类型和 schema，但必须保持同源关系，不允许 Host、SDK、文档各自维护不一致的能力列表。

### 8. Rust/Tauri 与 Vue 边界

Vue 侧负责：

- 插件页面 outlet 和路由映射。
- 内建插件动态模块加载。
- 外部插件 iframe 容器、尺寸、焦点和主题/locale 事件转发。
- JSON-RPC bridge 和前端 Host API dispatch。

Rust/Tauri 侧负责：

- 外部插件目录、manifest 读取、文件路径和资源入口校验。
- 插件 registry、ID 校验、权限校验和 sidecar 禁用策略。
- preferences、clipboard、window、actions 等系统能力的 Host API 实现。
- 需要跨前端/Rust 的命令保持薄、 typed、snake_case payload。

### 9. 文档沉淀为项目规范

新增稳定文档并保持中英文镜像：

- `docs/en/plugins/architecture.md`
- `docs/zh/plugins/architecture.md`
- `docs/en/plugins/development.md`
- `docs/zh/plugins/development.md`

文档必须覆盖：

- 内建插件与外部插件差异。
- 目录结构。
- ID 规则。
- manifest 结构。
- 生命周期策略。
- iframe runtime。
- JSON-RPC 和 SDK 使用。
- 外部插件发布格式。
- sidecar 第一阶段禁用但预留。
- 安全、权限和性能约束。

同时更新 `docs/index.md`，不创建 `docs/en/index.md` 或 `docs/zh/index.md`。

## Risks / Trade-offs

- [Risk] iframe 插件页面与主窗口焦点、拖拽和高度管理存在边界问题。→ Mitigation: `ExternalPluginFrame` 明确处理焦点事件、尺寸协议和禁止主窗口拖拽穿透 iframe。
- [Risk] JSON-RPC 方法和权限如果缺少统一 schema，SDK、Host 和文档会漂移。→ Mitigation: `schemas/plugin/` 作为共源，并在任务中加入 Host/SDK/示例一致性验证。
- [Risk] 外部插件 iframe 如果常驻会增加内存占用。→ Mitigation: 启动时仅注册 manifest，iframe 按页面打开懒加载，并支持关闭后销毁。
- [Risk] 内建插件走主 Vue 模块、外部插件走 iframe，会形成两种 runtime。→ Mitigation: runtime 策略不同，但 plugin contract、ID、pages、actions、permissions、registry 和文档模型统一。
- [Risk] 第一阶段预留 sidecar 字段可能被误认为已支持原生插件能力。→ Mitigation: spec 和文档明确 Host 必须拒绝执行 sidecar，直到后续 change 正式启用。
- [Risk] 插件文档新增会扩大文档维护面。→ Mitigation: 严格使用 docs/en 与 docs/zh 镜像文件，并更新 `docs/index.md`。
