## Why

当前插件 Action 投影核心已经能够把 Page-only Action 交给 Host-owned Page opener，但生产组合仍因缺少可预检真实插件 Page 的 Registry 与导航边界而保持关闭。需要补齐受 Host 控制的 Page descriptor 投影、可用性判断和单窗口导航，使 Task 2.3 的 Action 可以安全到达一个已注册页面，同时继续把插件资源加载和代码执行留给后续隔离 Runtime。

## What Changes

- 新增 Host-private Plugin Page Registry，从同一 revision 的 Plugin Registration detail 投影插件 Page descriptor，并以插件 owner 为单位原子替换或注销完整 Page 批次。
- 将 `(owner_id = plugin_id, page_id = plugin-local Page ID)` 作为稳定全局 Page identity，保留插件内父子关系，不引入第二套拼接 Page ID、前端 Router 或并行 Shell state。
- 扩展 framework-neutral application navigation service，使其通过统一 Page catalog 预检 Host 与插件 Page；插件不能获得 React setter、导航 handler、route、executor 或内部 Registry 引用。
- 仅在 Page 的 `required_permissions` 全部存在于当前 Host-owned `granted_permission_ids` snapshot 时视为已授权；本 change 不定义 permission catalog、授予决策、提示或 session 权限。
- 从 Page descriptor、Registration detail 和 Launcher Registry 解析当前 locale 下的 Owner、Page 与 opening Action 展示信息；opening Action 缺失时回退到 Page title，插件资源图标可用前使用 generic provider icon。
- 保持现有单窗口 `home` / `search` / `page` presentation、扁平 `ActivePage` 和关闭后返回 Home/恢复输入焦点的行为；插件 Page 在 iframe Runtime 交付前显示 Host-owned、不可执行代码的安全占位内容。
- 以 Registration revision 串行协调 Page 与 Action projection：注册/替换时先提交 Page 再发布 Action，失效/移除时先注销 Action 再注销 Page；错误对单插件 fail closed，其他插件和 `lensx.core` 不受影响。
- 当已打开的插件 Page 因 Registry 刷新而消失或变为不可用时，通过 Host-owned invalidation 边界关闭页面并返回 Home；对外保持安全、稳定的 unavailable 语义，具体原因仅进入有界诊断。
- 在真实 Plugin Page 预检可用后启动生产 Plugin Action publication，不改变统一搜索、Dispatcher、recent/pinned 或 Host built-in 行为。
- 更新英文架构文档及其简体中文镜像，区分已交付 Page 导航、Host placeholder 与仍未交付的资源服务、iframe Runtime、生命周期写操作和完整权限管理。

## Capabilities

### New Capabilities

- `plugin-page-navigation`: 定义插件 Page descriptor、provider-scoped Registry、Registration revision 投影、权限 snapshot 预检、framework-neutral 导航、展示信息 fallback、单窗口占位页面和活跃页面失效语义。

### Modified Capabilities

- `plugin-action-projection`: 将生产激活条件从“Plugin Page Registry 尚未交付时保持关闭”推进为“与同 revision Page projection 安全协调后发布插件 Action”，并固定注册与注销顺序。

## Impact

- 主要影响 `src/app/navigation/`、`src/app/plugins/`、Launcher production composition、`src/App.tsx` 的 Page descriptor 解析与 Host-owned placeholder，以及相应 TypeScript/Rstest 测试。
- 复用现有 Plugin Registration Desktop Adapter、Launcher Action Registry/Dispatcher、Page context UI 和单窗口 surface；不改变 Rust Registration wire contract、Manifest Schema、持久化格式或 Tauri command 集合。
- 不新增 Runtime dependency、组件库、前端 Router、插件管理 UI、安装/禁用/卸载写操作、安全资源 URL、iframe、Host API 或完整 permission decision system。
- 更新 `docs/en/architecture/overview.md`、`docs/en/architecture/extension-platform.md`、相关开发说明及其 `docs/zh/` 镜像；新增稳定 capability spec，并同步修改 `plugin-action-projection` 稳定需求。
