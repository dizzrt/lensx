# Spec Delta

## MODIFIED Requirements

### Requirement: Production Host MUST route requests through a closed Dispatcher bound to a trusted Session

生产 Host MUST 通过绑定可信当前 Runtime Session identity 的封闭 Dispatcher 路由 Host API `0.3.0` 请求。Dispatcher MUST 组合基础导航/Context、插件专属存储和公开的受控 HTTP provider；MUST NOT 组合权限服务、grant 来源、原生剪贴板、任意 Tauri 命令或普通浏览器 Worker/network 行为的隐式代理。`http.request` MUST 是显式公共方法，执行通用 HTTPS 传输，不包含翻译、签名或凭据管理业务。每个请求 MUST 经过严格 Contract 校验、identity/currentness、取消、deadline 及有界响应校验。

插件或 wire payload MUST NOT 选择或覆盖 plugin ID、Page ID、Registration revision、Runtime attempt、origin、provider、executor、Tauri command、storage namespace、路径或其他 Host 对象。未知或畸形方法 MUST 在 handler 前被拒绝；防御性直接 dispatch MUST 返回稳定 `method_not_found`，已声明但当前 provider 不可用的方法 MUST 返回稳定 `unavailable` 且无副作用。

#### Scenario: Current Session calls a non-privileged method
- **WHEN** 当前插件调用目录中且已实际组合的 navigation、Context、storage、HTTP 或 close 方法
- **THEN** Dispatcher 从 Session identity 与 Host 事实执行，并返回 Contract-valid 结果
- **THEN** 插件提供的 identity、source 或 Web 行为不能改变 Host target 或 HTTP 控制边界

#### Scenario: Plugin calls a removed or private method
- **WHEN** 插件调用 clipboard、permission mutation、Tauri、未知或 Host-private 方法
- **THEN** Dispatcher 在任何原生副作用前返回稳定的封闭契约失败
- **THEN** 安装、官方来源、network 或 Worker context 不产生绕过

#### Scenario: Plugin attempts to forge authority
- **WHEN** 请求、私有 frame 或插件代码尝试提交 plugin/Page identity、origin、Registration revision、provider、executor、Tauri command、storage namespace、路径或 Host 对象
- **THEN** 严格 Contract/transport 在 Dispatcher 前拒绝，或 Dispatcher 忽略非 Session lease 推导的 authority
- **THEN** 伪造值不能选择插件、Page、Registration、存储空间或 Host 服务

#### Scenario: Method is unknown or provider is unavailable
- **WHEN** 调用目录外方法，或在 provider 不可用时调用已声明方法
- **THEN** 分别返回稳定 `method_not_found` 或 `unavailable`
- **THEN** Dispatcher 不调用备用存储、浏览器 fetch、任意原生执行器或其他隐式 fallback

### Requirement: Runtime Context MUST derive from current Host facts and real provider availability

Dispatcher MUST 根据当前 Host API `0.3.0` 目录、Session identity、locale/theme 来源及实际组合的 provider 产生完整 Context。MUST NOT 读取 Manifest permission requests、持久化 grants、权限目录或剪贴板可用性；MUST NOT 将普通浏览器能力列作 Host API 方法。只有受控 HTTP provider 当前可用时，Context 才 MUST 列出独立的 `http.request`。

`runtime.get_context` MUST 接受严格 `{}` 并返回完整、Contract-valid、复制、冻结的 Context。同一 Session 中，实际 locale、theme 或 provider 可用性变化 MUST 发布一个完整 `runtime.context_changed` 替换；相同快照 MUST NOT 重复发布。identity、Registration revision、resource generation 或 Runtime attempt 失效 MUST 终止旧 Session，MUST NOT 通过事件重新授权。

#### Scenario: Only base and storage providers are available
- **WHEN** 当前 Session 只绑定 base 和 scoped-storage provider
- **THEN** Context 仅以排序去重顺序列出这些对应方法，不包含 `http.request`
- **THEN** clipboard、permission、普通浏览器 network 和 Worker 不出现在方法列表

#### Scenario: HTTP provider is available
- **WHEN** 当前可信 Session 组合可用的受控 HTTP provider
- **THEN** 完整 Context 包含 `http.request`，所有插件来源使用相同判断
- **THEN** HTTP 不可用时省略该方法，不能降级为插件专属原生捷径

#### Scenario: Legacy permission facts remain in an isolated record
- **WHEN** 恢复隔离记录中的旧 permission/grant 字段或过时前端 payload
- **THEN** Dispatcher 忽略这些字段的 authority 并拒绝不兼容边界数据
- **THEN** Context 不投影旧 clipboard capability

#### Scenario: Unavailable capabilities are excluded from Context
- **WHEN** 某个已组合 provider 对当前 Session 不可用
- **THEN** Context 仅移除受影响的方法
- **THEN** 目录成员、Manifest 内容、官方来源和旧事实均不能使方法成为当前 capability

#### Scenario: Storage namespace becomes degraded
- **WHEN** Host 确认当前 identity 的存储空间损坏或受阻，但 Session 其余部分有效
- **THEN** Host 发布一个不含五个 storage capability 的完整 Context，不修改其他 capability
- **THEN** 相同 degraded 快照不重复发布，Context 不包含存储路径、值、用量或诊断

#### Scenario: Locale or theme changes
- **WHEN** 应用 locale/theme 改变且 Session identity 与 provider 可用性仍有效
- **THEN** Host 发送一个完整、Contract-valid、冻结的 Context 替换
- **THEN** SDK 在通知订阅者前替换完整 Context，插件看不到 Host-private 状态

#### Scenario: Session authority changes
- **WHEN** Registration revision、resource generation 或 Runtime attempt 变化导致旧 Session identity 失效
- **THEN** 旧 Session 终止，其旧 Context 不能授权后续 provider 调用
- **THEN** `runtime.context_changed` 不能赋予旧 Session 新 identity 或重新授权

### Requirement: Delivery MUST prove deterministic production composition without absorbing later capabilities

生产 `PluginRuntimeSlot` MUST 为当前 ready lease 安装真实 Session-scoped Dispatcher，而非固定 unavailable handler；测试仍保留显式 fake/unavailable binding 注入。交付 MUST 覆盖 Dispatcher、production composition、Navigation/Action 回归、五个 scoped storage 方法、受控 HTTP、SDK codec/bridge adapter、并发、取消、替换、清理、恶意/过时 identity、完整 Context、response-before-close、存储重启、有界诊断以及不受支持的 clipboard、permission mutation、任意 Tauri 和已移除/私有方法。HTTP 验证 MUST 使用确定性的 DNS/transport 假实现，覆盖控制策略和生命周期，不调用真实付费服务。公共 tarball 与 workspace boundary MUST 证明 Host-private 模块不可导入；维护验收 MUST NOT 要求浏览器、WebView、GUI 或环境证据。

#### Scenario: Production Dispatcher composition and storage loops pass
- **WHEN** 确定性 production-composition 测试连接公共 Contract/SDK 与当前 Dispatcher Session
- **THEN** Context、Page close、同插件 Action、scoped storage 和受控 HTTP 均经过可信当前 adapter
- **THEN** 公共插件边界无法导入 Host-private wire 类型、Tauri、存储路径、authority coordinator 或 executor

#### Scenario: Removed native and permission methods stay unavailable
- **WHEN** 当前或旧 fixture 请求 clipboard、permission mutation、任意 Tauri 或 Host API `0.3.0` 目录之外的方法
- **THEN** 封闭 Contract/Dispatcher 拒绝且无 provider 副作用或 capability 投影
- **THEN** 验证不把被移除方法描述为 permission-denied、可 grant 或已交付

#### Scenario: Real Runtime evidence is inferred from deterministic composition
- **WHEN** 只执行了确定性测试与包检查
- **THEN** 结论可以确认维护的 production composition 和边界覆盖
- **THEN** MUST NOT 声称执行了真实 WebView、真实账户 HTTP 或原生往返
