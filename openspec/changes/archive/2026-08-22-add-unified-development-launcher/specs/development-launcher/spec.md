## ADDED Requirements

### Requirement: Maintained desktop development MUST use one Host-owned launcher

系统 MUST 为完整桌面开发提供一个统一的 Host-owned 启动器。该启动器 MUST 在 Tauri 启动前创建并持有 Rsbuild 开发服务器，MUST 使用 Rsbuild 返回的实际 loopback 端口，且 MUST NOT 通过先探测并释放 socket、解析人类日志或读取临时端口文件建立 authority。独立前端开发入口 MAY 保留，但 MUST NOT 被描述为完整桌面进程编排。

#### Scenario: 首选端口可用

- **WHEN** 开发者通过维护的普通桌面开发入口启动应用，且首选端口可用
- **THEN** 启动器先让 Rsbuild 在该端口完成 listen，再使用其返回的实际端口启动 Tauri
- **THEN** 本次运行只有一个由启动器拥有的 Rsbuild server

#### Scenario: 首选端口已占用

- **WHEN** 另一个进程已占用首选端口，而 Rsbuild 解析出另一个可用 loopback 端口
- **THEN** 启动器保持实际 server listener 并使用解析后的端口启动 Tauri
- **THEN** Tauri 不连接被占用的首选端口，也不要求开发者手工修改 committed 配置

#### Scenario: Rsbuild 启动失败

- **WHEN** Rsbuild 配置、编译或 listen 在返回实际端口前失败
- **THEN** 启动器返回稳定非零结果且不 spawn Tauri
- **THEN** 它不留下端口预留、临时配置或由本次启动拥有的后台进程

### Requirement: One validated development App origin MUST bind every Host security consumer

启动器 MUST 将实际端口编码为本次运行唯一的 `http://localhost:<port>/` App target，并通过 Tauri runtime configuration 传递。Rust Host MUST 从该配置验证并获得精确 target；主窗口导航策略与插件 Runtime `frame-ancestors` MUST 消费同一事实，且 MUST NOT 从 Manifest、插件请求、前端消息、HTTP header、日志或另一份端口环境变量派生。发布编译 MUST 继续使用 `tauri://localhost`，不得启动本地 HTTP server。

#### Scenario: 动态 origin 被完整传播

- **WHEN** Rsbuild 实际监听端口 `P` 且启动器准备 Tauri child
- **THEN** Tauri `devUrl`、Host 主文档导航 target 和插件 Runtime CSP ancestor 都精确使用 `http://localhost:P`
- **THEN** 插件 CSP 除可信 ancestor 外的所有 directive 与生产 profile 保持一致

#### Scenario: 开发 App target 不可信

- **WHEN** runtime configuration 中的开发 target 缺失，或包含非 HTTP scheme、非精确 `localhost` host、无效/缺失端口、credentials、非根 path、query 或 fragment
- **THEN** Rust Host 在创建可信导航与插件资源 authority 前使启动失败
- **THEN** 系统不回退到 `40755`、通配 ancestor、请求 Host 或插件提供的 origin

#### Scenario: 发布应用启动

- **WHEN** 发布构建加载 bundled Host document
- **THEN** App target 与插件可信 ancestor 仍为既有 `tauri://localhost` profile
- **THEN** 统一开发启动器、动态端口和开发 `devUrl` 不进入发布 Runtime authority

### Requirement: Ordinary and Plugin Development modes MUST compose over the same launcher

普通桌面开发与稳定的 `dev:plugin-development-mode` 命令 MUST 复用同一 server、Tauri config、child lifecycle 和 cleanup 实现。普通模式 MUST NOT 启用插件开发 frontend composition、Rust feature、startup root 或 process-local switch。插件开发模式 MUST 在创建 Rsbuild 配置和 Tauri child 前启用既有 build capability，MUST 保留默认 repository `plugins/` root 与单个 `--plugins-root <path>` override，并 MUST NOT 改变现有 bootstrap、snapshot、Registration 或 Runtime 语义。

#### Scenario: 普通桌面开发启动

- **WHEN** 开发者运行维护的普通桌面开发命令
- **THEN** 统一启动器使用普通 Rsbuild composition 与普通 Tauri feature 集启动应用
- **THEN** Plugin Development Mode 保持不可用且没有 startup root 被读取或暴露

#### Scenario: 专用插件开发命令启动

- **WHEN** 开发者运行 `dev:plugin-development-mode`，可选提供一个有效 `--plugins-root <path>`
- **THEN** 同一启动器在 Rsbuild 配置解析前启用 frontend capability，并为 Tauri 增加 `plugin-development-mode` feature 与规范化 Host-private startup root
- **THEN** 端口、origin、child lifecycle 与普通模式使用相同实现，而插件注册仍由既有 Host bootstrap 负责

#### Scenario: 插件开发参数无效

- **WHEN** 专用命令收到未知、重复或缺值的参数
- **THEN** 启动器在创建 Rsbuild server 或 Tauri child 前返回稳定非零诊断
- **THEN** 诊断不披露绝对插件路径、环境内容、原始异常栈或 private Host state

### Requirement: Launcher-owned processes MUST converge through one terminal lifecycle

启动器 MUST 对 Rsbuild server 与 Tauri child 实施单调且幂等的 terminal lifecycle。Tauri spawn 失败或退出、父进程收到支持的终端信号、以及 server/child 错误都 MUST 最终关闭由启动器拥有的 server；信号 MUST 至多转发一次给仍存活的 Tauri child。最终结果 MUST 保留主要 Tauri 非零退出码或信号语义，late event 与重复 cleanup MUST 无副作用。

#### Scenario: Tauri 正常或失败退出

- **WHEN** Tauri child 以零或非零退出码终止
- **THEN** 启动器关闭 Rsbuild、移除自身 signal handlers 并以对应结果结束
- **THEN** 不存在由该启动器拥有的 server 或 child 留在后台

#### Scenario: 父进程收到终端信号

- **WHEN** 运行中的启动器收到一次或重复的 `SIGINT` 或 `SIGTERM`
- **THEN** 它至多向仍存活的 Tauri child 转发一次终端信号，等待终端收敛并关闭 Rsbuild
- **THEN** 重复信号、child late exit 和 server late error 不会重复 close、重新 spawn 或覆盖主要终端结果

#### Scenario: Tauri 无法 spawn

- **WHEN** Rsbuild 已监听但 Tauri child 创建失败
- **THEN** 启动器关闭 Rsbuild 并返回稳定非零结果
- **THEN** 它不自动选择另一个端口、重试 Tauri 或保留半启动状态

### Requirement: Delivery MUST use deterministic governed validation and bilingual documentation

交付 MUST 在 typed Gate registry 中提供稳定 `development-launcher` Gate，并通过 Rstest、Rust 单元测试、静态策略与双语文档检查覆盖端口解析和传播、mode 隔离、配置拒绝、spawn/exit/signal 竞态、幂等 cleanup、生产不变性和 public boundary。Gate MUST 是 read-only，MUST NOT 增加 Change 专用 root alias，也 MUST NOT 启动 Tauri GUI、Rsbuild listener、浏览器、真实 WebView、native harness、截图、视觉基线或 target-environment 性能流程。

#### Scenario: 稳定 Gate 完整通过

- **WHEN** `development-launcher` Gate 及其依赖在本地或 CI 运行
- **THEN** fake server/child 模型、Rust origin/CSP policy、source/config drift 与 English/简体中文文档断言确定性通过
- **THEN** Gate ID 可解析且没有直接 Rstest 文件列表或 Change 名称 root script 被加入维护接口

#### Scenario: 真实环境步骤被提议作为完成条件

- **WHEN** 验证尝试启动 `tauri dev`、真实 Rsbuild listener、浏览器、WebView、GUI 应用或保留可选/manual 环境证据
- **THEN** validation governance 拒绝该步骤
- **THEN** 缺失的断言必须通过纯函数、fake lifecycle、Rust policy、静态检查或未来独立 Change 重新设计
