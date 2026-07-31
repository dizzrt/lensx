## Context

当前前端以 React 本地状态维护查询、结果和选择状态，默认 Action 服务只注册隐藏启动器 Action。主题与语言已经由根级 Provider 统一管理，支持 `light` / `dark` 和 `en-US` / `zh-CN`，但没有持久化来源，也没有产品内设置入口。

设置是 Host 自身能力，不属于插件生命周期。它需要复用现有主窗口的顶部区域与公共内容区域：没有活动页面时顶部是搜索输入，存在活动页面时顶部变为页面上下文头部；下方区域根据状态展示主页、搜索结果或页面内容。该变化横跨 App Shell、Action 执行、Provider 初始化和 Rust/Tauri 持久化边界，因此需要在实现前固定最小状态与数据流。

## Goals / Non-Goals

**Goals:**

- 在现有单一 Tauri 主窗口中提供 Host 设置 Action 和设置页面。
- 用最小、明确的状态表达主页、搜索和页面三种呈现状态。
- 让设置页面修改现有全局主题与语言来源，并跨应用启动持久化。
- 保留 Action 描述符与 executor 的既有信任边界。
- 让打开前失败和打开后失败具有不同、可恢复的用户体验。
- 为未来 Host 页面或插件页面保留统一的页面身份形状，但不混合其运行时边界。

**Non-Goals:**

- 不创建独立的 Tauri 设置窗口。
- 不引入通用路由器、历史栈、`AppShellStore`、`AppShellController`、`useSyncExternalStore` 或新的状态管理框架。
- 不在公共 Action 描述符中增加页面目标，也不改变 `LauncherActionExecutor = () => Promise<void> | void`。
- 不实现插件页面加载、插件注册页面、插件安装、启停、卸载、权限或市场能力。
- 不实现最近使用、固定项目或历史数据；本次只保留主页内容位置。

## Decisions

### 1. App Shell 使用两个原始状态推导三种呈现状态

React App Shell 继续持有本地交互状态，并只新增：

```ts
type ActivePage = {
  owner_id: string;
  page_id: string;
  opened_by_action_id: string;
};
```

呈现状态由 `activePage` 和规范化后的查询推导：

- `activePage !== null`：`page`
- `activePage === null` 且查询非空：`search`
- `activePage === null` 且查询为空：`home`

`page` 的优先级高于查询。成功打开页面时统一清除查询、结果和选择状态；关闭页面时清除 `activePage` 并返回 `home`。页面身份保持扁平，不增加 `PageLocation.target`。

**替代方案：** 引入路由对象、导航历史或集中式 Shell Store。当前只有主页、搜索和单个活动页面，额外层次不能提供与复杂度相称的收益，因此不采用。

### 2. 页面身份统一，页面提供来源不统一

Host 页面和未来插件页面可以共享 `owner_id + page_id` 的页面身份以及 `opened_by_action_id` 的打开来源，用于页面查找、头部文案和诊断。设置页固定使用：

```text
owner_id = lensx.core
page_id = settings
opened_by_action_id = lensx.core.open_settings
```

Host 页面由受信任的 Host 页面目录提供。未来插件页面即使采用相同身份形状，也必须经过独立的插件适配与 Host 校验后才能进入页面目录；外部插件不能提供 React 组件、executor 函数或直接修改 App Shell 状态。本次只实现 Host 设置页，不建设通用页面平台。

**替代方案：** 为 Host 页面和插件页面使用不同的 Location 类型。这样会把展示导航与运行时来源耦合，使公共头部和内容区域产生不必要分支，因此只统一身份，不统一提供与执行边界。

### 3. Host executor 通过最小 AppNavigationService 打开页面

新增与 React 无关的 `AppNavigationService`，职责仅限：

1. 根据 `owner_id + page_id` 在受信任页面目录中预检目标；
2. 接收 App Shell 生命周期内注册的单一页面打开处理器；
3. 将验证后的 `ActivePage` 交给处理器。

`lensx.core.open_settings` 保持普通、可搜索的 Action 描述符；描述符不包含页面目标。其受信任 executor 直接调用：

```ts
appNavigation.openPage(
  { owner_id: "lensx.core", page_id: "settings" },
  "lensx.core.open_settings",
);
```

App Shell 通过 effect 注册处理器，并用现有 React 本地状态进入页面态；不把 React setter 交给 executor。目标不存在、不可用或 App Shell 尚未注册处理器时，`openPage` 失败并让 executor 抛出可诊断错误，Dispatcher 因此返回现有的执行失败结果。失败前不改变页面状态，搜索查询得以保留。

**替代方案：**

- 让 Action 返回 Navigation Effect：需要改变既有 executor 和 Dispatcher 合约，不采用。
- 在公共 Action 描述符增加 target：会把 Host 导航实现泄漏到可序列化插件契约，不采用。
- 让 executor 直接调用 React setter：破坏框架边界和可测试性，不采用。

### 4. 顶部区域和公共内容区域按呈现状态组合

`home` 与 `search` 状态使用可搜索的启动器输入；`home` 在公共内容区域显示主页内容，`search` 显示搜索结果或搜索空状态。

`page` 状态不显示可编辑搜索输入，而显示页面上下文头部：

- 页面/能力的本地化名称；
- 触发打开的 Action 本地化名称；
- 具有可访问名称的关闭按钮。

公共内容区域渲染活动页面。关闭按钮返回主页，并把键盘焦点恢复到启动器输入。设置页面不是覆盖层，也不创建新窗口。

### 5. 打开前错误与页面内错误分开处理

页面目录预检发生在进入页面态之前。目标缺失或不可用时，App Shell 保留当前 `home` / `search` 状态、查询和选择，并使用现有本地化反馈机制报告 Action 执行失败。

进入页面态之后，页面加载、渲染或页面运行时错误由公共内容区域内的页面级错误边界处理。错误界面保留页面上下文头部和关闭按钮，不自动返回主页，也不向用户展示堆栈。根级错误边界继续负责页面边界之外的不可恢复渲染失败。

### 6. 设置页面保持两部分的第一版范围

设置页提供“偏好”和“插件”两个一级部分：

- “偏好”包含颜色主题与语言两个设置项；
- 颜色主题只接受 `light` 或 `dark`；
- 语言只接受 `en-US` 或 `zh-CN`；
- “插件”只显示本地化空占位，不读取或推断插件状态，也不提供操作。

页面复用根级 Provider；不创建页面私有的主题或语言来源。交互优先使用现有 Semi Design 组件，简单布局使用 UnoCSS，设置页复杂、主题相关或可复用样式使用 Less。

### 7. Rust/Tauri 持久化完整的 AppPreferences

跨启动偏好由 Rust 持有并通过稳定命令边界暴露：

```ts
type AppPreferences = {
  theme_mode: "light" | "dark";
  locale: "en-US" | "zh-CN";
};
```

Rust 在应用配置目录中维护 Host 自有的偏好文件，读取和写入时都验证枚举值。文件不存在时返回默认值 `light` 与 `en-US`；文件不可读、格式无效或写入失败时返回带稳定错误码和安全消息的可序列化错误。写入采用临时文件加替换的原子策略，避免留下部分 JSON。

前端在渲染产品 App 之前读取偏好，并把成功结果作为 `AppProviders` 的初始值。启动读取失败时使用默认值继续启动，同时保留可诊断错误供本地化反馈，不阻塞应用。

用户修改设置时，前端基于当前完整快照串行调用写入命令。只有 Rust 确认持久化成功后，前端才更新对应根级 Provider；失败时控件恢复或保持已确认值，并显示本地化错误，不能宣称已保存。这样可以避免界面状态与磁盘状态长期分叉。

**替代方案：**

- 仅使用浏览器存储：会绕过 Rust 对桌面持久化与稳定命令边界的职责，不采用。
- 先更新 Provider 再异步保存：失败时需要复杂回滚且会短暂宣称未保存值，不采用。
- 为主题和语言分别维护文件：增加一致性与迁移成本，不采用。

### 8. 不增加运行时依赖

页面状态、目录、导航服务和偏好模型使用现有 React、TypeScript、Tauri、Serde 与 Rust 标准能力实现。UI 使用已有 Semi Design 栈，不引入新的路由、状态管理、持久化或组件依赖。

### 9. 主窗口使用由呈现状态驱动的固定离散高度

原有 `650 × 180` 主窗口只能容纳产品标题和启动器输入，新公共内容区域会被
`h-screen` 容器与 `overflow: hidden` 裁剪。设置页即使内部可滚动，也没有足够的
可见高度展示页面上下文头部和内容。

主窗口宽度继续固定为 `650`，用户仍不能手动缩放。Host 为 App Shell 的三种
呈现状态定义固定高度：

- `home = 240`：展示标题、输入、主页内容与诊断状态；
- `search = 480`：为固定上限的结果滚动区提供空间，但不根据结果数量改变高度；
- `page = 600`：展示页面上下文头部和可滚动 Host 页面。

前端通过类型化桌面适配器把 `home` / `search` / `page` 发送到 Rust。Rust
命令只接受这三个枚举值，在解析 `main` 窗口后映射到固定高度并执行原生 resize；
前端不能提交任意宽高。状态变化触发一次离散切换，不读取 DOM 高度，也不根据
搜索结果数量连续缩放。原生失败返回稳定、安全的可序列化错误，但不会清除当前
App Shell 状态。

**替代方案：**

- 始终把窗口扩大到页面高度：会让主页和启动器搜索失去紧凑形态，不采用。
- 根据 DOM `scrollHeight` 自动调整：把原生窗口形状耦合到布局细节，并会随结果
  数量抖动，不采用。
- 只让 180px 窗口内部滚动：标题和两层头部已经占满高度，用户仍无法看到有效
  内容，不采用。

## Risks / Trade-offs

- [偏好写入完成前界面不会切换] → 设置控件显示短暂保存状态并禁止同一项重复提交；成功后立即同步 Provider。
- [启动读取增加异步引导阶段] → 引导逻辑只读取一个小型本地文件；失败使用默认值继续启动，不让偏好故障阻断主界面。
- [单处理器导航服务只能服务一个 App Shell] → 当前产品只有一个主窗口和一个 App Shell；服务在卸载时注销处理器，并在重复注册时明确失败。
- [扁平 ActivePage 不支持嵌套导航] → 第一版明确没有页面栈；未来确有多层导航需求时再通过独立 change 扩展。
- [插件空占位可能被误解为插件能力已上线] → 文案明确当前没有可管理内容，不展示虚构列表、状态或操作。
- [偏好文件可能被外部修改或损坏] → Rust 严格验证并返回诊断错误，前端安全回退默认值，后续成功保存可重建有效文件。
- [窗口高度切换可能失败] → Rust 约束允许的模式和高度并返回安全错误；App Shell
  保持当前状态，后续状态切换可重试。

## Migration Plan

1. 先新增 Rust 偏好模型、默认值、文件存储与 Tauri 命令，并用临时目录测试缺失、有效、无效及写入失败场景。
2. 为前端增加类型化偏好适配器和启动引导，将读取结果接入现有 `AppProviders`。
3. 增加最小 Host 页面目录、`AppNavigationService` 和 App Shell 页面态，不改变现有 Action executor/Dispatcher 合约。
4. 注册 `lensx.core.open_settings`，实现设置页面、页面头部、关闭/焦点恢复和页面级错误边界。
5. 接入偏好保存、Provider 同步、本地化资源和主题样式。
6. 更新测试与中英文文档，完成全量前端、Rust 和 OpenSpec 校验。
7. 根据运行态可视验证补充受约束的 launcher 呈现高度命令，并覆盖三态切换。

回滚时可以移除设置 Action、页面目录、导航服务与偏好命令，使 App Shell 恢复仅主页/搜索状态。已写入的偏好文件属于无害的 Host 配置数据；旧版本不会读取它，无需破坏性迁移。

## Open Questions

无。本次变更所需的产品范围、状态模型、运行时边界和持久化责任均已确定。
