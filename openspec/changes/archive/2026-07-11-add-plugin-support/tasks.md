## 1. 契约与目录基础

- [x] 1.1 建立插件相关目录骨架：`src/app/plugin-host/`、`src/plugins/builtin/`、`src-tauri/src/plugin/`、`src-tauri/src/host_api/`、`packages/plugin-sdk/`、`schemas/plugin/` 和 `examples/plugins/`。
- [x] 1.2 配置 pnpm workspace，使 `packages/plugin-sdk` 能作为 `@lensx/plugin-sdk` 被示例插件和主工程引用。
- [x] 1.3 定义插件 manifest、pages、actions、permissions、runtime、lifecycle 和 sidecar 预留字段的 TypeScript 类型。
- [x] 1.4 定义 `manifest.schema.json`、`host-api.schema.json` 和 `permissions.schema.json`，并确保 Host、SDK 和示例插件共用同一契约来源。

## 2. ID 与 Manifest 校验

- [x] 2.1 实现前端共享的三段式 ID 校验工具，接受 `author.module.name` 和 `author.module.name_suffix`，拒绝第四段或更多段 ID。
- [x] 2.2 实现 Rust 侧三段式 ID 校验模块，用于插件 manifest、权限和 Host API 注册校验。
- [x] 2.3 实现插件 manifest 校验，覆盖必填字段、source、lifecycle、runtime、pages、actions、permissions 和 sidecar 预留字段。
- [x] 2.4 实现全局唯一 ID 校验，拒绝不同插件或同一插件内部重复声明的 ID。
- [x] 2.5 实现引用关系校验，拒绝缺失 `plugin_id`、缺失 `target_page_id`、未声明 permission 和页面父子循环。
- [x] 2.6 为 ID 校验、manifest 校验和引用校验补充 focused 单元测试或等价验证用例。

## 3. Rust/Tauri 插件核心

- [x] 3.1 实现 Rust 侧 Plugin Registry，支持注册内建和外部插件元数据，并按 ID 查询插件、页面、行为和权限。
- [x] 3.2 实现内建插件 source 入口，但只注册空集合或测试夹具，不实现具体内建插件业务。
- [x] 3.3 实现外部插件 source 的 manifest 读取和路径校验，限制插件资源只能来自插件安装目录。
- [x] 3.4 实现 sidecar 禁用策略：允许读取预留字段，但拒绝启动或执行 sidecar，并返回可诊断状态。
- [x] 3.5 实现基础 Host API Dispatcher，支持 method 注册、permission 关联、参数校验入口和统一错误返回。
- [x] 3.6 暴露薄 Tauri command，使前端可以读取插件 registry、解析外部插件入口、调用受控 Host API。

## 4. 前端插件宿主

- [x] 4.1 实现 `src/app/plugin-host/registry.ts`，接收 Rust/Tauri 返回的插件元数据并维护前端页面、行为和权限索引。
- [x] 4.2 实现内建插件 loader，支持主 Vue 动态模块页面加载，但不添加任何具体内建插件实现。
- [x] 4.3 实现外部插件 iframe 容器 `ExternalPluginFrame.vue`，支持懒加载、销毁、错误状态和受控资源入口。
- [x] 4.4 实现插件页面出口 `PluginPageOutlet.vue`，根据 runtime 策略渲染内建动态模块或外部 iframe。
- [x] 4.5 实现 action dispatcher，使插件 action 能按 `target_page_id` 打开对应插件页面。
- [x] 4.6 插件宿主 UI 使用 Naive UI 组件和 Provider 上下文，新增用户可见文案接入应用 i18n。
- [x] 4.7 插件宿主 UI 使用 UnoCSS 表达静态布局，使用 Less 表达复杂语义样式和主题变量桥接。
- [x] 4.8 验证插件宿主 UI 在 light/dark 主题下可读，并保持 Naive UI locale/dateLocale 由应用 locale 单一状态驱动。

## 5. JSON-RPC Bridge 与权限调用

- [x] 5.1 实现 JSON-RPC 2.0 消息类型、request/response/error/notification 处理和标准错误码。
- [x] 5.2 实现 iframe `postMessage` transport，包含 request id、timeout、origin/source 校验和插件生命周期校验。
- [x] 5.3 实现 Plugin Bridge，将外部插件 RPC 请求转发到 Host API Dispatcher。
- [x] 5.4 实现权限校验：每次 RPC 调用必须校验插件声明权限、Host API 所需权限和当前授权状态。
- [x] 5.5 实现运行时上下文同步，向外部插件提供 plugin_id、Host 版本、locale、主题模式和权限状态。
- [x] 5.6 实现主题与 locale 变化通知，确保外部插件通过事件获知变更且不能访问主 Vue 内部对象。
- [x] 5.7 为 RPC 成功、权限拒绝、参数错误、超时和未知方法补充 focused 测试或验证用例。

## 6. Plugin SDK

- [x] 6.1 实现 `@lensx/plugin-sdk` 包入口和构建配置，导出 manifest、ID、runtime、permission 和 Host API 类型。
- [x] 6.2 实现 SDK RPC client，封装 JSON-RPC over `postMessage`、超时、错误解析和事件订阅。
- [x] 6.3 实现 SDK runtime API：读取 plugin_id、Host 版本、locale、主题模式和权限状态。
- [x] 6.4 实现 SDK Host API 包装：`actions`、`events`、`ui`，以及最小 preferences 类型入口；实际权限能力按 Host API schema 约束。
- [x] 6.5 确保 SDK 暴露的 RPC 方法 ID、参数、返回值和 permission 与 Host API schema 保持一致。
- [x] 6.6 为 SDK client、错误处理和事件订阅补充 focused 单元测试或示例验证。

## 7. 外部插件示例与打包格式

- [x] 7.1 创建 `examples/plugins/hello-world` 示例插件，使用 `@lensx/plugin-sdk` 调用运行时上下文和一个安全 Host API。
- [x] 7.2 示例插件 manifest 使用严格三段式 ID，声明 iframe runtime、pages、actions、permissions 和 sidecar 预留禁用状态。
- [x] 7.3 定义 `.lxplugin` 包结构说明，并提供本地示例打包脚本或命令。
- [x] 7.4 验证示例插件安装目录读取、manifest 校验、iframe 打开、RPC 调用和 iframe 销毁流程。

## 8. 项目文档规范

- [x] 8.1 新增 `docs/en/plugins/architecture.md`，说明统一插件 contract、内建/外部运行时、ID 规则、权限和 Host API 边界。
- [x] 8.2 新增 `docs/zh/plugins/architecture.md`，与英文架构文档语义对齐。
- [x] 8.3 新增 `docs/en/plugins/development.md`，说明外部插件开发、SDK 使用、manifest、发布格式、iframe runtime 和 JSON-RPC 调用方式。
- [x] 8.4 新增 `docs/zh/plugins/development.md`，与英文开发文档语义对齐。
- [x] 8.5 在文档中明确第一阶段不支持 sidecar 执行、不支持外部插件直接 Rust 原生渲染、不支持外部插件直接调用 Tauri command。
- [x] 8.6 更新 `docs/index.md`，增加插件架构与插件开发规范入口，不创建 `docs/en/index.md` 或 `docs/zh/index.md`。
- [x] 8.7 手动检查 `docs/en/**` 与 `docs/zh/**` 镜像关系和新增 Markdown 链接。

## 9. 集成与验证

- [x] 9.1 运行 `pnpm install` 更新 workspace 依赖关系和 lockfile。
- [x] 9.2 运行 `pnpm run check` 验证 TypeScript、Vue、SDK 和文档格式敏感问题。
- [x] 9.3 运行 `pnpm run build` 验证主前端应用和插件宿主构建。
- [x] 9.4 运行 SDK package 的构建或类型检查命令，验证 `@lensx/plugin-sdk` 可被示例插件消费。
- [x] 9.5 执行 Rust/Tauri 相关检查，验证插件 registry、manifest 校验和 Host API command 编译通过。
- [x] 9.6 手动验证启动器主路径不常驻加载外部插件 iframe，打开外部插件页面时才创建 iframe。
- [x] 9.7 手动验证外部插件无法访问主 Vue 内部对象或直接调用 Tauri command，只能通过 SDK/RPC 调用 Host API。
- [x] 9.8 运行 `openspec status --change add-plugin-support`，确认 change 处于可实施或可归档前的预期状态。
