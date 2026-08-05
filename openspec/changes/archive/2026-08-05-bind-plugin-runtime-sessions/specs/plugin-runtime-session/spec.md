## ADDED Requirements

### Requirement: Host MUST derive every Runtime Session identity from current trusted facts

系统 MUST 只为当前可用、已启用且兼容的外部 Plugin Page iframe 建立 Host 私有 Runtime Session。Session identity MUST 从当前 Page resolution、Registration summary/detail、Resource/Runtime descriptor 和真实 iframe browsing context 推导，并至少绑定 opaque entry、plugin ID、version、Page ID、current resource generation/origin、Runtime attempt、实际 granted-permission ID snapshot 和真实 `contentWindow`。Session MUST NOT 接受 Manifest、插件消息或公共 UI payload 自报的 identity、source、version、Page、entry、generation、grant 或 Host lifecycle fact。

#### Scenario: 当前 iframe 建立可信身份

- **WHEN** 当前 Page、Registration detail、Resource descriptor、Runtime attempt 与 iframe browsing context 收敛到同一个已启用兼容插件
- **THEN** Host 创建只读 Session identity，并把真实 window/origin 和当前 entry、plugin、version、Page、generation、attempt 与 grants 绑定
- **THEN** identity 不包含安装路径、package digest、resource scope token、Tauri 对象、Host executor 或 author-controlled trust fact

#### Scenario: 插件自报另一个 identity

- **WHEN** iframe 的 bootstrap acknowledgement 或后续消息包含 `plugin_id`、entry、version、Page、grant 或其他自报 identity 字段
- **THEN** Host 不使用这些字段建立或覆盖 Session identity，并按 exact private contract 拒绝不允许的字段
- **THEN** 插件不能通过复制另一个插件的文本 identity 获得其 Session、资源或权限

#### Scenario: Manifest 只请求权限

- **WHEN** Manifest 声明 requested permissions，而 Registration detail 的实际 grant snapshot 为空或只包含子集
- **THEN** Session 只绑定排序去重的实际 `granted_permission_ids`
- **THEN** requested、enabled、external 或 publisher 文本均不自动产生 grant

### Requirement: Host MUST bootstrap one authenticated MessagePort with exact target and single-use nonce

iframe 报告 load completion 后，Host MUST 为本次 Runtime attempt 使用 cryptographically secure randomness 创建至少 128 bit 的一次性 nonce 和全新的 `MessageChannel`。Host MUST 只向记录的 `contentWindow`、使用从 current isolated `entry_url` 推导的精确 `targetOrigin` 发送版本化 bootstrap 并转移 child Port。Session MUST 只有在 Host Port 收到 exact、支持版本、携带同一 nonce 的首次 ready acknowledgement 后进入 `ready`。认证后的 Session 通信 MUST 使用该专用 Port，不得退回共享长期 window message 总线。

#### Scenario: 正常 bootstrap 成功

- **WHEN** 当前 iframe 在精确 isolated origin 加载，收到本次 bootstrap 和 transferred Port，并在该 Port 上返回有效的一次性 nonce acknowledgement
- **THEN** Host 把本次 Session 转为 `ready`，清除可重用 nonce 表示，并保留唯一已认证 Host Port lease
- **THEN** bootstrap 和 acknowledgement 不向插件提供 trusted identity、entry ID、grants、Registration revision、resource token 或 Host 对象

#### Scenario: 错误 window 或 origin 尝试建立 Session

- **WHEN** 其他 window、Host frame、另一个插件、旧 generation 或不匹配 origin 发送相同形状的 window message 或尝试接收 bootstrap
- **THEN** Host 不向其转移当前 Port，也不创建、替换或提升任何 Session
- **THEN** 拒绝行为不回显 expected window、origin、nonce、identity 或 private error

#### Scenario: nonce 被重放或 acknowledgement 畸形

- **WHEN** acknowledgement 缺失字段、包含额外字段、版本不支持、nonce 错误/过期/重复，或不是从本次 transferred Port 到达
- **THEN** 本次 Session fail closed，Host 关闭其可控 Port 并且不进入 `ready`
- **THEN** late acknowledgement 不得复活已断开或已销毁的 Session

### Requirement: Session lifecycle MUST distinguish loaded, Session ready, SDK ready, disconnect, and disposal

iframe `loaded` MUST 继续只表示浏览器 load completion，不得表示 Session 或 SDK ready。Host 私有 Session MUST 使用至少 `awaiting_handshake`、`ready`、`disconnected` 和 `disposed` 状态：合法首次 acknowledgement 才能从 `awaiting_handshake` 进入 `ready`；invalid acknowledgement、`messageerror`、Host reload 或可信身份失效 MUST 终止当前 Session；dispose MUST 幂等并清理该 Session 创建的 nonce、Port 和 listener。`disconnected` MUST 是 terminal，系统 MUST NOT 自动重新认证或复用旧 Port。

#### Scenario: iframe loaded 但没有合法 acknowledgement

- **WHEN** iframe 已触发 load event，但尚未通过本次 nonce/Port acknowledgement
- **THEN** 现有容器仍只报告 `loaded`，Session 保持 `awaiting_handshake`
- **THEN** UI、日志、状态和文档不得把该状态称为 Session ready、SDK ready 或 Host API available

#### Scenario: Session 认证完成

- **WHEN** awaiting Session 收到唯一合法 acknowledgement
- **THEN** Session 进入 `ready`，但不因此创建 SDK Runtime context、RPC method 或 Host API capability

#### Scenario: Host reload 或 Port 错误

- **WHEN** Host JavaScript realm reload、Port 发生 `messageerror` 或当前 Session 无法继续证明其 identity
- **THEN** 旧 Session 进入 terminal disconnect/dispose，旧 nonce 和 Port 不得由新 realm 恢复
- **THEN** 新的 document/iframe 必须以新 nonce、Port 和 current facts 建立新 Session，且系统不自动重连旧 Session

#### Scenario: 重复清理或 late event

- **WHEN** close、retry、invalidation 和 App teardown 竞争调用 dispose，随后旧 acknowledgement 或 Port event 到达
- **THEN** 资源只被安全地清理一次，Session 保持 `disposed`
- **THEN** late event 不改变当前 iframe、Session 或 Registration 状态

### Requirement: Relevant current-fact changes MUST revoke only the affected Session

Host MUST 在 Registration invalidation 后刷新并比较当前插件相关事实。当前 entry 消失、disabled、quarantined、incompatible、identity/Page 不匹配、resource origin/generation 改变、Runtime attempt/retry/replacement 改变或 grant snapshot 改变 MUST 撤销受影响 Session。全局 Registration revision 只作为竞态和失效提示；如果变化仅来自其他插件，且当前 Session 的 entry、Page、version、origin/generation、attempt 和 grants 保持相同，Host MUST 保留当前 iframe 和 Session。Host 无法证明相关事实仍当前时 MUST fail closed。

#### Scenario: 同版本插件被替换

- **WHEN** 当前插件以相同 plugin ID 和 version 完成 replacement，但 resource generation、entry facts 或 Runtime attempt 已改变
- **THEN** 旧 Session 和旧 Port 立即失效，新 Runtime 不得继承旧 nonce、Port 或 Session identity
- **THEN** version 文本相同不能使旧 Session 保持 current

#### Scenario: 插件被禁用或 grants 改变

- **WHEN** 当前插件变为 disabled/incompatible/quarantined/removed，或其实际 grant snapshot 发生变化
- **THEN** Host 撤销当前 Session 并拒绝来自旧 Port 的后续消息
- **THEN** requested permissions 或旧 grant snapshot 不得覆盖当前 Host facts

#### Scenario: 无关插件发生 Registration 变化

- **WHEN** 另一个插件安装、禁用、替换或改变 grants，导致全局 Registration revision 变化，而当前 Session 的相关 facts 全部未改变
- **THEN** Host 保留当前 iframe、navigation lease 和 Session，不创建新的 nonce/Port
- **THEN** 全局 revision 数值本身不被当作当前插件 generation 或 Session identity

#### Scenario: current facts 读取发生竞态

- **WHEN** Session 创建或刷新期间 summary、detail、Page/Resource descriptor 的 revision 或相关 identity 无法收敛
- **THEN** Host 不建立或继续该 Session，并返回有界的 Host 私有失败
- **THEN** 系统不回退到 cached detail、旧 descriptor、author identity 或宽松 origin

### Requirement: Runtime Session MUST remain Host-private and process-local

Runtime Session contract、parser、window/Port adapter、identity 和状态 MUST 保持在可信 lensX Host frontend 内，不得成为 Manifest input、Plugin Registration payload、`@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-ui`、`@lensx/plugin-testkit` 或插件 workspace 可导入的公共 API。Session、nonce、Port、window reference 和 call state MUST NOT 持久化；应用恢复后 Plugin Manager 和 Registration Contract MUST 继续从 `inactive` 开始，不得猜测或恢复前一进程 Session。

#### Scenario: 应用在 ready Session 后重启

- **WHEN** 应用在一个 ready Session 存在时退出、崩溃或重启
- **THEN** 下一进程只恢复持久 Manifest/registration/grant facts，并报告既有 Registration Contract 的 `inactive`
- **THEN** 旧 Session identity、nonce、Port、window、Page 和 message state 不被反序列化或复用

#### Scenario: 插件尝试导入 Session internals

- **WHEN** 官方、示例或外部插件尝试从 workspace/package exports 导入 private Session types、wire constants、window adapter 或 Host Port lease
- **THEN** workspace/package-boundary gate 拒绝依赖，真实公共 tarball 不包含这些入口
- **THEN** 公共 SDK transport interface 仍不暴露 nonce、identity、origin、Window、MessagePort 或 private envelope

### Requirement: Invalid Session input and diagnostics MUST fail closed without becoming an oracle

所有跨 iframe Session payload MUST 从 `unknown` 开始按 exact versioned shape、字段类型、长度和允许值验证。错误来源的无关 window message MUST 被忽略；当前 transferred Port 上的畸形或未知版本 input MUST 断开本次 Session。用户 UI、插件响应、日志 fixture 和测试 evidence MUST NOT 暴露 nonce、Port 内容、expected origin token、完整 capability URL、entry ID、grants、raw plugin payload、private exception、stack、Tauri 或 Rust 对象。

#### Scenario: 跨插件发送伪造消息

- **WHEN** 插件 B 或旧 iframe 发送与插件 A acknowledgement 相同的 shape，或猜测 plugin/version/Page 文本
- **THEN** 插件 A 的 Session 和状态不改变，伪造发送方得不到 expected nonce/origin/identity 反馈
- **THEN** Host 不执行 Host API、Registration mutation 或 privileged Tauri command

#### Scenario: 当前 Port 收到未知版本或非法值

- **WHEN** 当前 transferred Port 收到未知 contract version、额外字段、超界字符串、非 plain structured-clone data 或其他非法 acknowledgement
- **THEN** Host 产生稳定、有界的私有失败并关闭该 Session
- **THEN** 底层异常和不可信内容不进入用户可见反馈或后续 Session

### Requirement: Delivery MUST prove source binding on focused and real WebView paths

交付 MUST 使用纯 TypeScript state/parser tests、React iframe lifecycle tests、canonical normal/malicious `.lxp` fixtures 和目标 macOS WKWebView 验证 exact source/origin、cryptographic single-use nonce、MessagePort transfer、ready/disconnect/dispose、cross-plugin forgery、replay、retry/replacement、old Port invalidation、grant/current-fact invalidation、unrelated Registration change stability 和零 privileged Tauri hits。模拟 DOM、source inspection 或 Rust unit tests MUST NOT 取代真实 WebView 证据。本 capability MUST NOT 声明 Windows 或 Linux 支持。

#### Scenario: macOS Session security matrix 通过

- **WHEN** focused gate 在目标 macOS WKWebView 中运行正常和恶意插件 fixture
- **THEN** 只有当前 isolated-origin iframe 通过本次 nonce/Port 建立 ready Session，错误 source/origin、跨插件、重放和旧 Port 尝试稳定失败
- **THEN** evidence 只记录有界 boolean/version/platform 事实，不记录 URL/token/nonce/Port 内容、路径、插件 payload 或私有错误

#### Scenario: 目标 WebView 无法证明设计

- **WHEN** 目标 WebView 不能可靠证明 exact window/origin、MessagePort transfer、nonce acknowledgement 或 teardown 后旧 Port 失效
- **THEN** change 不得声明完成或勾选 Task 4.3
- **THEN** 系统不得通过 wildcard origin、共享长期 window message 总线、仅 bearer identity 或删除 negative case 降级

### Requirement: Task 4.3 MUST leave SDK transport, Host API, permission decisions, and complete lifecycle unimplemented

本 capability MUST 只交付 Host 私有 Session identity/currentness、一次性 bootstrap/ready、已认证 Port lease、Session 自身的 disconnect/dispose、安全 tests、真实 WebView evidence 和维护文档。它 MUST NOT 定义公共 SDK iframe transport、JSON-RPC/request ID、Host API method/result/event/error Schema、permission grant decision/UI、privileged dispatch、插件存储、完整 CSP、通用 handshake timeout/crash loop/自动恢复、后台 Runtime、sidecar、管理 UI 或 Windows/Linux Runtime。

#### Scenario: Task 4.3 独立完成

- **WHEN** 本 change 的 focused gate、文档和完整验证全部通过，而 Task 4.4 与 Milestone 5 尚未交付
- **THEN** 当前外部 Plugin Page iframe 可以建立可信 Host 私有 Session，Host 能稳定拒绝伪造或过期来源
- **THEN** 插件仍不能通过公共 SDK 调用真实 Host API、获得新的 permission decision、运行后台工作或宣称完整 CSP/lifecycle 已交付

#### Scenario: locale 或 theme 在 Session 生命周期中改变

- **WHEN** 当前应用 locale 或 light/dark theme 在 Session awaiting、ready 或 disconnected 期间改变
- **THEN** 现有 Host Page/iframe presentation 继续使用当前本地化和主题行为，Session 不注入或复制新的用户可见文案/样式
- **THEN** locale/theme 变化本身不授予能力、改变 trusted identity 或把 iframe `loaded` 命名为 ready
