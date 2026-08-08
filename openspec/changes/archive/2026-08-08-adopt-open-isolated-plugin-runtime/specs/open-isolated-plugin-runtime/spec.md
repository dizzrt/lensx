## ADDED Requirements

### Requirement: 安装必须成为当前阶段唯一的插件行为信任决定

系统 MUST 将安装、替换或开发注册一个插件解释为用户允许该插件在自身隔离 Web Runtime 中运行，而 MUST NOT 再为 Worker、网络、远程资源、`blob:`、`data:`、WASM 或浏览器 origin storage 建立 lensX permission request、grant 或逐项授权交互。可信 Host 安装界面 MUST 说明 lensX 隔离 Host 与其他插件，但不审核、担保或持续监控插件如何处理用户主动交给它的数据。

#### Scenario: 用户安装使用网络和 Worker 的插件
- **WHEN** 用户确认安装一个有效兼容插件，且插件运行时创建 Dedicated Worker 并访问远程服务
- **THEN** Host 不显示 lensX 权限选择、不创建 grant，并允许行为进入同一隔离 Web Runtime
- **THEN** 安装确认不被描述为 lensX 对插件行为或远程服务的安全背书

#### Scenario: 用户拒绝安装
- **WHEN** 用户在 durable commit 前取消候选插件安装
- **THEN** Host 不创建 Registration、Runtime、Web 上下文或持久信任状态
- **THEN** 取消不留下 permission decision、grant 或拒绝历史

### Requirement: 开放 Web Runtime 必须与 Host 原生 authority 分离

插件 Runtime MUST 支持目标 WebView 基线内的普通 Web 内容和连接能力，包括页面生命周期内的 Dedicated Worker、网络请求、远程资源、`blob:`、`data:`、WASM 与浏览器 origin storage。该能力 MUST NOT 暴露 Tauri IPC、Host DOM、任意 Rust command、文件系统、Shell、进程或未公开的原生 provider，也 MUST NOT 承诺 SharedWorker、ServiceWorker 或脱离当前页面生命周期的后台执行。

#### Scenario: 插件使用开放 Web 能力
- **WHEN** 当前插件页面加载远程子资源、创建 package/remote/Blob Dedicated Worker 或发起浏览器网络连接
- **THEN** 目标 WebView 按浏览器标准执行该行为，不查询 lensX grant
- **THEN** Worker 或网络上下文仍无法取得 Tauri、Host-private command、另一个插件 Session 或跨 origin 数据

#### Scenario: 插件请求未公开的原生能力
- **WHEN** 插件尝试调用 Tauri、任意 Rust command、Shell、文件系统或已移除的 Host clipboard 方法
- **THEN** Host 边界拒绝或不存在该调用面
- **THEN** 开放 Web、官方来源、开发来源或安装事实均不产生原生 authority

### Requirement: 每个插件和 generation 必须保持独立安全域

Host MUST 为每个当前插件资源 generation 维持独立、不可由作者选择的 origin、路径 scope、Session identity、存储命名空间和导航租约。一个插件的 package、远程内容、Worker、Blob、网络响应、浏览器 storage 或 SDK 消息 MUST NOT 读取、写入、导航或复用 Host、另一个插件或旧 generation 的受保护状态。

#### Scenario: 远程代码尝试跨插件访问
- **WHEN** 插件加载的远程代码尝试访问 Host origin、另一个插件 origin、旧 generation URL、DOM、storage 或 MessagePort
- **THEN** origin、sandbox、Session 与 Resource 边界阻止访问
- **THEN** 失败不泄漏目标 URL、scope、path、nonce、Port 内容或 Host 私有错误

#### Scenario: 当前 generation 被替换
- **WHEN** 插件被关闭、禁用、卸载、替换或开发 reload 提交新 generation
- **THEN** Host 终止旧 iframe、Dedicated Worker、Session、Port、请求和租约
- **THEN** 旧 Web 上下文不能在新页面或进程中恢复 authority

### Requirement: 来源与社区信息不得改变 Runtime authority

official、external 与 development 插件 MUST 使用相同的 Web Runtime、Host 隔离、Session、资源和生命周期边界。Publisher、repository、release digest、未来扫描、评分或社区标签 MAY 用于展示和选择，但 MUST NOT 放宽 Host 隔离、授予原生能力或改变跨插件结论。

#### Scenario: 官方插件与外部插件执行相同行为
- **WHEN** official 与 external 插件分别加载相同类型的 Worker、网络或远程资源
- **THEN** Runtime 根据当前 WebView 与隔离基线得到相同允许或失败结论
- **THEN** official 来源不获得 Tauri、Host API、跨插件或持久后台例外

#### Scenario: 社区信息缺失或变化
- **WHEN** 插件没有评分、扫描或签名，或其社区信息随后变化
- **THEN** 已安装 Runtime 的 Host authority 不因此扩大或缩小
- **THEN** 用户仍可通过 Host-owned disable 和 uninstall 控制是否继续运行插件

### Requirement: 开放 Web 基线必须有目标 WebView 与 Host 可用性证据

系统 MUST 用确定性测试与目标 macOS WKWebView 证据同时验证开放 Web 成功路径、Host/跨插件负面路径、generation teardown 和 Launcher 响应性。模拟 DOM、源代码检查、浏览器正常加载或社区审查 MUST NOT 单独替代真实 Runtime 隔离与终止证据。

#### Scenario: 开放 Runtime focused gate 通过
- **WHEN** package/remote resource、Dedicated Worker、network、Blob/Data、replacement、close、disable 和恶意跨边界矩阵全部运行
- **THEN** 支持的 Web 行为成功，Host/跨插件访问失败，旧上下文完全终止
- **THEN** 证据不包含用户数据、完整 URL、origin token、scope、path、payload、nonce、Port 内容或原始异常

#### Scenario: WebView 无法证明隔离或 teardown
- **WHEN** 目标 WebView 不能证明开放上下文无法触达 Host/其他插件，或不能在页面终止时回收 Dedicated Worker 与旧 authority
- **THEN** 开放 Runtime capability 保持未完成
- **THEN** 实现不得用共享 origin、Tauri 暴露、忽略残留上下文或删除负面测试作为 fallback

