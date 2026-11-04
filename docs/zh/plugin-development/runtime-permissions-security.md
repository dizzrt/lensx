# Runtime 与安全

## Runtime 生命周期

每个 eligible plugin Page 实例都在 Host 管理的 native Child WebView 中运行。每个所属窗口
至多承载一个实例，同一插件可以有多个独立实例。有效 generation scope 可以共用 origin
字符串，但每个 attempt 都有独立的非持久化 data store、来源租约和 Session；持久化插件
配置应使用 Host `storage.*`。Host 分别等待 native load、
bridge ready 和 `runtime.get_context`，并拥有 deadline、retry、breaker、navigation、
presentation 与最终 teardown。

close、窗口内 Page 替换、retry 与 disconnect 只终止受影响实例。已提交 disable、uninstall、
replacement 或 development reload 撤销全部受影响插件 generation 的实例；拒绝 staging
保留这些实例。Host reload 与应用退出终止全部实例。终止清理使对应实例的 Worker、连接、
timer、listener、bridge、Session 和来源权限失效，不撤销健康兄弟实例的租约。

暂时隐藏和恢复 Launcher 窗口不等于关闭 Page 或 teardown Runtime。每次恢复时的
activation 都会刷新并重新验证当前 Registration 与 Resource 事实。如果当前插件的
entry、Page、version、origin、resource generation 和 Runtime attempt 没有改变，Host
会保留同一 Child WebView、Session 与 Page 内存。全局 Registration revision
只是 invalidation 提示；其他插件的无关变化不会替换当前 Runtime。

Host 分离也保留同一 document、Session、SDK、Worker、请求序列与临时状态，只改变 Host
管理的呈现归属。main 返回 Home 不会关闭已移交实例；从 Launcher 再次打开同一 Page，只
创建或复用 main 自己的实例。独立窗口失焦保持显示，关闭仅终止自身；应用退出后，下次
启动不会恢复窗口布局或临时状态。

插件共享的 `storage.*` 配置与浏览器存储、内存工作状态保持独立。并发实例通过正常读写
观察共享配置；不自动同步输入/结果，也不新增多窗口 Manifest 声明或权限。

## Context replacement

每个 Child WebView attempt 只初始化一次 SDK。`runtime.get_context` 与后续 Context event 提供完整
Host API 状态：版本、locale、theme 和当前 Session-bound method capabilities。一次状态变更中替换
整个 Context。普通浏览器 Worker/network 不是 Host API method；独立受控的 `http.request`
只在对应 Host provider 可用时出现在 capability 列表中。

## 开放 Web 能力

当前 macOS WKWebView 基线无需 Manifest 字段或 lensX grant 即允许页面生命周期内的
Dedicated Worker、package/HTTPS/Data/Blob 内容、HTTPS/WSS 连接、WASM 和浏览器 origin
storage。插件可在自身 HTML 中添加更严格的 CSP；浏览器会把它与 Host response policy 取交集，
因此只能收窄行为，不能削弱 Host 隔离。

SharedWorker、ServiceWorker、脱离页面的后台执行和设备/原生 API 不在承诺范围内。相机、
麦克风、定位、全屏和浏览器剪贴板可能因 WebView、Permissions Policy 或 OS 行为不可用。
lensX 不会把浏览器结果重新解释为 grant 决策。

## 受控 Host HTTP

公共 `http.request` method 经 Rust 向公网 HTTPS 目的地发送有界 UTF-8 请求。它独立于浏览器
Fetch，不以 CORS 响应头为条件，不关闭浏览器安全、不共享 Cookie 或系统凭据，也不允许访问
本地/私有网络。DNS 校验及连接固定、TLS 校验、payload 限制、期限、并发、取消和 Runtime
清理由 Host 负责。所有插件来源使用相同策略；服务签名和业务解释仍留在插件。详见
[HTTP 参考](host-api.md#httprequest)。

## 失败与恢复

通过标准 feature detection 与 rejection 处理不可用的浏览器能力。对 Host API
`method_not_found`、`unavailable`、取消、超时、限制、disconnect 和不兼容 Context 做降级，
不要盲目重试。replacement 或 reload 后创建新的 Worker、连接、SDK 状态和订阅。绝不把上一
generation 的 URL、port、cursor 或浏览器状态复用为 Host authority。

分离恢复重试的是原实例补偿，不是 Runtime Retry。原生补偿无法确认时，Host 以明确恢复态
保留该实例，并提供可信的恢复、关闭和退出控件，不重载或重放工作。恢复解决前，依赖归属
的 `actions.open` 有界返回 `unavailable`；真实来源与 Session 校验持续生效，`ui.close` 仍可
请求明确终止。

## 安全边界

开放 Web 基线不会暴露 Host DOM、Tauri globals/IPC、Rust command、文件系统、Shell、进程、
原生剪贴板、另一个插件 origin 或旧 generation。Host 将主 WebView 与插件 WebView 保持为
native sibling，派生精确 origin/generation/source binding，限制 resource path，只允许 closed
lensX bridge carrier，约束 RPC，并拥有确定性 teardown。Publisher、仓库位置、provenance 与
release metadata 都不会改变该 authority。

因此安装是关于代码在该隔离 Web Runtime 中运行的信任决定。lensX 不审查、批准或持续监控插件
如何使用用户交给它的数据，也不对普通 Web 行为逐项授权。

Host/native ownership、lifecycle 顺序、evidence budget 与维护者排障参见
[Plugin Child WebView Runtime](../architecture/plugin-child-webview-runtime.md)。
