## Why

lensX 需要从早期启动器骨架演进到可扩展的桌面工具平台，但插件能力如果直接混入主应用逻辑，会很快产生内建插件、外部插件、权限、页面渲染和 Host API 调用之间的边界混乱。

本变更先建立统一插件架构、外部插件 SDK 和项目级插件开发规范，为后续设置、搜索、剪贴板、文件等插件化能力提供稳定基础，同时保持启动器主路径轻量。

## What Changes

- 新增统一插件支持能力，定义内建插件和外部插件共享的插件 contract，包括 manifest、页面、行为、权限、生命周期策略和运行时策略。
- 将插件来源与生命周期策略分离：`builtin` / `external` 只描述来源，可卸载、可禁用由独立策略字段表达。
- 规定所有可引用内容 ID 必须全局唯一，并使用严格三段式 `author.module.name`；不得通过第四段或更多段表达层级，层级和归属关系必须使用显式字段表达。
- 定义内建插件运行策略为主 Vue 动态模块，外部插件运行策略为 iframe 隔离渲染。
- 新增外部插件 JSON-RPC 2.0 over `postMessage` 调用链，插件必须通过 Host API 调用 lensX 能力，不能直接访问主 Vue 状态或 Tauri command。
- 新增 `@lensx/plugin-sdk` workspace package，用于封装 JSON-RPC、Host API 类型、manifest 类型、权限类型和插件运行时上下文。
- 新增插件规范文档，沉淀内建插件目录规范、外部插件开发规范、发布格式、载入流程、SDK 使用方式、RPC 约束、安全边界和 sidecar 预留策略。
- 新增插件架构建议目录，包括 `src/app/plugin-host/`、`src/plugins/builtin/`、`src-tauri/src/plugin/`、`src-tauri/src/host_api/`、`packages/plugin-sdk/`、`schemas/plugin/` 和 `examples/plugins/`。
- 第一阶段不实现任何具体内建插件；只实现插件支持基础能力、SDK、规范和最小示例验证。
- 第一阶段不启用 sidecar；manifest 可以预留 sidecar 字段，但 Host 必须拒绝执行外部插件 sidecar。

## Capabilities

### New Capabilities

- `plugin-system`: 定义 lensX 插件 contract、ID 规则、插件来源与生命周期策略、内建/外部运行时策略、插件注册校验、外部插件载入、Host API 调用边界和 SDK 要求。

### Modified Capabilities

- `frontend-foundation`: 前端基座需要支持插件宿主容器、内建插件动态模块、外部插件 iframe 容器，并保持 Naive UI、主题、i18n 和样式分工要求。

## Impact

- 前端 UI：新增插件宿主模块、插件页面出口、外部插件 iframe 容器、JSON-RPC bridge、SDK 使用示例；新增 UI 必须继续接入 Naive UI Provider、明暗主题、应用 i18n 和现有 UnoCSS/Less 分工。
- Rust/Tauri：新增插件 manifest/registry/permission/Host API 模型，新增外部插件来源和资源载入校验；Tauri command 仍保持薄而稳定，系统能力由 Rust Host API 实现。
- API/SDK：新增 `@lensx/plugin-sdk` workspace package 和 Host API schema，SDK 与 Host API 定义必须共源。
- 文档：新增并镜像英文/中文插件架构与开发规范文档，更新文档索引。
- 工具与包管理：新增 pnpm workspace package、schema 文件和外部插件示例工程；暂不引入独立 SDK 仓库。
- 安全与权限：外部插件默认没有直接原生权限；只能通过 SDK 发起 JSON-RPC，Host 侧执行 plugin_id、permission、method 和参数 schema 校验。
