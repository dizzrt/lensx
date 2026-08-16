## MODIFIED Requirements

### Requirement: Development Mode MUST require build capability and explicit per-process opt-in

系统 MUST 仅在原生和前端构建都显式包含 Plugin Development Mode capability 时暴露开发控制。显式 per-process opt-in MUST 来自受信任 Host 设置中的用户操作，或来自专用 `pnpm run dev:plugin-development-mode` 启动命令；专用命令 MUST 在前端读取 capability 前真实启用当前进程的原生状态。原生命令 MUST 独立检查 build capability 和当前 process-local switch，前端可见性 MUST NOT 建立 authority。生产构建 MUST NOT 注册 development Tauri commands、managed state 或前端 operation entry points。

#### Scenario: User enables Development Mode in a capable build

- **WHEN** 当前 build 包含原生和前端 development capabilities，且用户在受信任 Host 设置中显式启用 Development Mode
- **THEN** 当前进程可以显示并调用 development-directory registration
- **THEN** 仅启用模式不会注册插件、读取目录、创建 Host authority 或创建 Runtime

#### Scenario: Dedicated development command starts

- **WHEN** 开发者执行专用 `pnpm run dev:plugin-development-mode`
- **THEN** 新进程将该命令视为显式 opt-in，并在首次 capability snapshot 与设置渲染时报告 Development Mode enabled
- **THEN** 该 opt-in 本身不自动打开 Launcher Action、插件 Page、Runtime 或 Child WebView

#### Scenario: User disables an auto-enabled process

- **WHEN** 用户在由专用命令启动的当前进程中关闭 Development Mode
- **THEN** Host 完成既有 quiesce 后把 process-local switch 置为 disabled，且本进程不会因启动配置仍存在而再次自动启用
- **THEN** 下次专用启动创建新的 opt-in，但不会恢复本进程的 registration、snapshot、scope 或 Runtime

#### Scenario: Production artifacts are checked

- **WHEN** release artifact gate 检查排除 Plugin Development Mode 的生产构建
- **THEN** 前端 bundle 不包含 development UI 或 development-command call，原生 binary 不注册 development command 或 managed state
- **THEN** 手工构造的前端请求仍不能启用模式、选择目录、注册、reload 或移除 development plugin

### Requirement: Development registration MUST accept only one explicitly selected self-contained dist directory

交互式 registration operation MUST 通过 Host-owned native folder picker 获得一个 user-authorized directory，并 MUST 把其根视为 self-contained `dist/`。该交互式操作与专用启动的 Host-owned bootstrap discovery 相互独立。无论输入来自 picker 还是 bootstrap，Host MUST 只读取 regular files、不跟随 symlink，并 MUST 检查 portable paths、case collisions、file-count、per-file/total-size limits、`manifest.json`、Manifest semantics、current compatibility 及每个引用资源的完整性。Host MUST NOT 搜索候选 `dist/` 的父目录、读取 project metadata、执行 build script、接受 remote URL 或把 frontend-supplied path 当作 authority。

#### Scenario: Register a valid compatible dist interactively

- **WHEN** 用户显式选择的目录包含 valid compatible Manifest、self-contained Runtime/resources 以及 bounded regular portable files
- **THEN** Host 可以继续 snapshot preparation，并只返回 safe candidate facts
- **THEN** frontend、events、logs 和 Registration Contract 不接收 absolute source-directory path 或 file content

#### Scenario: User cancels directory selection

- **WHEN** native folder picker 关闭且未选择目录
- **THEN** operation 返回普通 cancelled result
- **THEN** 系统不创建 staging directory、snapshot、registration、revision、scope 或 Runtime

#### Scenario: Directory contains unsafe or incomplete content

- **WHEN** picker 或 bootstrap 候选缺少 `manifest.json`/引用资源，包含 link、special file、absolute/colliding path，超过限制，包含 invalid Manifest，或与当前 Host 不兼容
- **THEN** Host 用稳定且有界的 invalid/incompatible diagnostic 拒绝该候选
- **THEN** untrusted paths、raw I/O errors、file bytes 和 partial Manifest facts 不离开 native boundary

#### Scenario: Directory changes while being read

- **WHEN** root 或任一文件在授权、metadata check、读取或 snapshot copy 期间被替换、改变类型、增长、截断或变成 link
- **THEN** Host 返回 retryable bounded `source_changed`/unsafe result，且不发布 mixed generation
- **THEN** 任一既有 development registration 和 Runtime 保持 current

## ADDED Requirements

### Requirement: Dedicated development startup MUST discover and register repository plugin builds without opening them

专用 `pnpm run dev:plugin-development-mode` MUST 默认使用仓库 `plugins/` 作为 startup root，并 MUST 支持一个可选 `--plugins-root <path>` 覆盖。Host MUST 仅按确定顺序检查该 root 的非隐藏直接子目录，并只把存在的 `<member>/dist` 视为候选；缺少 `dist/` 的成员 MUST 被视为尚未构建并忽略。每个成功候选 MUST 作为 process-local、enabled、`source=development`、Runtime inactive 的不可变 snapshot registration 发布。bootstrap MUST NOT 自动执行 Launcher Action、打开 Page、创建 Runtime、构建、安装、watch 或 reload 插件。

#### Scenario: Default repository plugins are ready

- **WHEN** `plugins/*/dist` 中存在一个或多个 valid compatible self-contained candidates，且其 plugin IDs 与当前 Registration 全局唯一
- **THEN** 专用启动在前端初始 projection 前注册所有有效候选，并让 Settings Switch 显示 enabled
- **THEN** Launcher 可以投影这些插件的 Actions，但在用户显式执行 Action 前没有插件 Page 或 Child WebView 被打开

#### Scenario: Custom plugin root is supplied

- **WHEN** 开发者通过专用命令提供一个 `--plugins-root <path>`
- **THEN** Host 仅把该规范化 root 的直接成员 `dist/` 用于本进程 bootstrap，并不同时扫描默认仓库 root
- **THEN** root、source directories 和 snapshots 不进入 frontend、events、Registration Contract 或 plugin Runtime

#### Scenario: Root or member has no built dist

- **WHEN** startup root 缺失、为空、不可读，或某个直接成员没有 `dist/`
- **THEN** 应用仍以 Development Mode enabled 启动，并为不可发现 root 产生稳定有界 summary 或忽略未构建成员
- **THEN** Host 不猜测其他目录、不执行构建，用户仍可使用交互式 native picker

#### Scenario: A candidate is invalid but IDs do not conflict

- **WHEN** 一个候选产生 invalid、incompatible、source-changed、unsafe 或候选级读取 diagnostic，而其他候选可以验证
- **THEN** Host 清理并跳过失败候选，以稳定成员标签/错误码和 loaded/skipped 计数报告结果，并继续注册其余有效候选
- **THEN** diagnostic 不泄露 absolute path、file content、raw native error 或 partial authority facts

#### Scenario: Candidate IDs conflict

- **WHEN** 两个已验证 bootstrap candidates 使用同一 plugin ID，或候选 ID 已属于 builtin、external、quarantine 或 development identity
- **THEN** Host 在向前端暴露 bootstrap registration 前清理所有未提交候选，并以稳定 conflict 阻断专用开发启动
- **THEN** Host 不 shadow、replace、upgrade、disable 或 remove 既有 identity

#### Scenario: Bootstrap infrastructure cannot initialize or commit safely

- **WHEN** development cache、snapshot coordinator 或 Plugin Manager 无法初始化，或在通过 ID preflight 后发生不能安全收敛的系统级 commit failure
- **THEN** Host 回滚本批已提交 authority、清理可证明属于本批的 snapshots，并让应用启动失败
- **THEN** UI 不得显示一个实际不能安全注册或撤销 authority 的 enabled mode
