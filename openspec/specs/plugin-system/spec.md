## Purpose

定义 lensX 插件系统的稳定能力边界，包括统一插件 contract、全局 ID 与引用校验、内建插件与外部插件运行时、外部插件 Host API 通信、同仓 Plugin SDK、插件规范文档，以及 sidecar 第一阶段预留策略。

## Requirements

### Requirement: 插件系统必须提供统一插件 Contract

系统 MUST 为内建插件和外部插件提供统一插件 contract，至少包含插件 ID、来源、生命周期策略、运行时策略、页面、行为、权限、SDK/Host API 兼容信息和 sidecar 预留信息。插件来源 MUST 只描述插件来自内建包还是外部安装包，MUST NOT 隐含插件能否卸载或禁用；卸载和禁用能力 MUST 由生命周期策略显式表达。

#### Scenario: 注册内建插件元数据

- **WHEN** 系统加载来源为 `builtin` 的插件 contract
- **THEN** 系统通过统一插件 registry 注册该插件
- **THEN** 系统根据 lifecycle 字段判断插件是否可卸载和可禁用

#### Scenario: 注册外部插件元数据

- **WHEN** 系统读取来源为 `external` 的插件 manifest
- **THEN** 系统通过统一插件 registry 注册该插件
- **THEN** 系统根据同一套 pages、actions 和 permissions contract 暴露插件能力

#### Scenario: 来源不决定生命周期策略

- **WHEN** 插件来源为 `builtin`
- **THEN** 系统仍然 MUST 读取 lifecycle 字段决定是否允许禁用
- **THEN** 系统 MUST NOT 仅因为插件来源为 `builtin` 就推导所有生命周期策略

### Requirement: 插件系统必须严格校验全局三段式 ID

系统 MUST 要求插件、页面、行为、权限、快捷键绑定和 sidecar 预留项等可引用内容 ID 全局唯一，并 MUST 使用严格三段式 `author.module.name`。系统 MUST 拒绝使用第四段或更多段表达层级的 ID；归属、层级和引用关系 MUST 通过显式字段表达。

#### Scenario: 接受合法三段式 ID

- **WHEN** 插件 manifest 声明 `lensx.core.settings_page_main`
- **THEN** 系统识别该 ID 为三段式 ID
- **THEN** 系统允许继续执行后续引用校验

#### Scenario: 拒绝多段式层级 ID

- **WHEN** 插件 manifest 声明 `lensx.core.settings.page.main`
- **THEN** 系统拒绝注册该插件
- **THEN** 系统返回可诊断的 ID 格式错误

#### Scenario: 拒绝重复 ID

- **WHEN** 两个插件或同一插件内两个内容项声明相同 ID
- **THEN** 系统拒绝注册冲突项
- **THEN** 系统返回包含冲突 ID 的可诊断错误

### Requirement: 插件系统必须严格校验引用关系

系统 MUST 在插件注册阶段校验页面、行为、权限和归属字段引用的目标是否存在。系统 MUST 拒绝缺失引用、错误 plugin_id、未声明权限引用和循环页面父子关系，MUST NOT 自动创建缺失项。

#### Scenario: 拒绝缺失目标页面的行为

- **WHEN** 插件 action 声明 `target_page_id` 指向不存在的页面
- **THEN** 系统拒绝注册该插件
- **THEN** 系统返回包含 action ID 和缺失 target_page_id 的错误

#### Scenario: 拒绝未声明权限引用

- **WHEN** 插件 action 或 Host API 调用声明需要未定义的 permission ID
- **THEN** 系统拒绝该插件注册或拒绝该调用
- **THEN** 系统返回包含缺失 permission ID 的错误

#### Scenario: 拒绝循环页面父子关系

- **WHEN** 插件页面通过 `parent_page_id` 形成循环
- **THEN** 系统拒绝注册该插件
- **THEN** 系统返回可诊断的循环引用错误

### Requirement: 内建插件必须使用主 Vue 动态模块运行时

系统 MUST 支持内建插件以主 Vue 动态模块运行。内建插件源码 MUST 位于 `src/plugins/builtin/**`，插件 manifest MUST 使用与外部插件兼容的 contract 表达 pages、actions、permissions 和 lifecycle。内建插件页面 MUST 在主应用 Provider、主题、i18n 和 Naive UI locale/dateLocale 上下文内渲染。

#### Scenario: 加载内建插件页面

- **WHEN** 用户打开一个内建插件页面
- **THEN** 系统通过主 Vue 动态模块加载对应组件
- **THEN** 页面位于应用级 Naive UI Provider、主题和 i18n 上下文内

#### Scenario: 内建插件共享统一 contract

- **WHEN** 内建插件声明 pages 和 actions
- **THEN** 系统使用与外部插件相同的 ID 和引用校验规则处理该声明
- **THEN** 系统通过统一 registry 暴露这些页面和行为

### Requirement: 外部插件必须使用 iframe 隔离运行时

系统 MUST 支持外部插件以 iframe 隔离运行。外部插件安装后，系统启动时 MUST 只读取并注册 manifest 元数据，MUST NOT 常驻加载插件 iframe。外部插件页面 MUST 在用户打开对应页面时懒加载，并 MUST 与主应用内部 Vue 状态隔离。

#### Scenario: 应用启动时只注册外部插件元数据

- **WHEN** lensX 启动且用户已安装外部插件
- **THEN** 系统读取外部插件 manifest
- **THEN** 系统注册插件 pages、actions 和 permissions 元数据
- **THEN** 系统不加载该插件 iframe 页面

#### Scenario: 打开外部插件页面时加载 iframe

- **WHEN** 用户打开外部插件页面
- **THEN** 系统创建外部插件 iframe 容器
- **THEN** 系统加载 manifest 声明的插件页面入口

#### Scenario: 外部插件不能访问主 Vue 状态

- **WHEN** 外部插件页面在 iframe 中运行
- **THEN** 插件不能直接访问主应用 Vue store、组件实例或内部模块
- **THEN** 插件只能通过官方 SDK 调用 Host API

### Requirement: 外部插件必须通过 JSON-RPC 调用 Host API

外部插件 MUST 通过 JSON-RPC 2.0 over `postMessage` 调用 lensX Host API。系统 MUST 提供 Plugin Bridge 接收插件 RPC 请求，并在执行前校验 plugin_id、消息来源、方法 ID、权限和参数 schema。插件 MUST NOT 直接调用 Tauri command。

#### Scenario: 插件成功调用 Host API

- **WHEN** 外部插件通过 SDK 发起合法 JSON-RPC 请求
- **THEN** Plugin Bridge 校验请求来源、方法、权限和参数
- **THEN** Host API Dispatcher 执行对应 Host API
- **THEN** 插件收到 JSON-RPC result 响应

#### Scenario: 插件缺少权限

- **WHEN** 外部插件调用需要未授权 permission 的 Host API
- **THEN** 系统拒绝执行该调用
- **THEN** 插件收到 JSON-RPC error 响应

#### Scenario: 插件不能绕过 SDK 调用 Tauri

- **WHEN** 外部插件尝试直接访问 Tauri command 或主应用内部桥接对象
- **THEN** 系统不向 iframe 暴露这些内部对象
- **THEN** 插件只能通过 JSON-RPC Host API 获得受控能力

### Requirement: 插件系统必须提供同仓 Plugin SDK

系统 MUST 在当前仓库内提供 `@lensx/plugin-sdk` workspace package。SDK MUST 封装 JSON-RPC 2.0 over `postMessage`、Host API 类型、manifest 类型、permission 类型、runtime context 和标准错误处理。外部插件开发者 MUST 通过 SDK 调用 Host API，而不是手写底层 `postMessage` 协议。

#### Scenario: 外部插件使用 SDK 调用 Host API

- **WHEN** 外部插件导入 `@lensx/plugin-sdk`
- **THEN** 插件可以通过类型化 API 发起 Host API 调用
- **THEN** SDK 负责生成 JSON-RPC 请求并处理响应、错误和超时

#### Scenario: SDK 与 Host API schema 保持一致

- **WHEN** Host API schema 定义一个方法的参数、返回值和权限
- **THEN** SDK 暴露的类型 MUST 与该 schema 一致
- **THEN** Host 侧校验 MUST 使用同一能力定义

### Requirement: 插件规范必须沉淀到项目文档

系统 MUST 提供稳定的插件架构和开发规范文档，并 MUST 保持英文和简体中文文档镜像。文档 MUST 说明内建插件实现方式、外部插件实现方式、目录结构、ID 规则、manifest 结构、发布格式、iframe runtime、JSON-RPC、SDK、权限、安全边界、性能约束和 sidecar 预留策略。

#### Scenario: 文档覆盖内建和外部插件规范

- **WHEN** 开发者阅读插件架构和开发规范文档
- **THEN** 文档说明内建插件使用主 Vue 动态模块
- **THEN** 文档说明外部插件使用 iframe 和 JSON-RPC Host API

#### Scenario: 文档镜像保持一致

- **WHEN** 项目新增或更新英文插件规范文档
- **THEN** 项目存在对应路径的简体中文文档
- **THEN** `docs/index.md` 包含插件规范入口

### Requirement: Sidecar 必须仅作为预留能力

系统第一阶段 MUST NOT 启用外部插件 sidecar。manifest 和 schema 可以包含 sidecar 预留字段，但 Host MUST 拒绝执行外部插件声明的 sidecar，并 MUST 返回可诊断的未支持错误。

#### Scenario: 拒绝执行外部插件 sidecar

- **WHEN** 外部插件 manifest 声明 sidecar
- **THEN** 系统可以读取该预留字段
- **THEN** 系统不得启动 sidecar 进程
- **THEN** 系统返回或记录 sidecar 暂不支持的可诊断状态
