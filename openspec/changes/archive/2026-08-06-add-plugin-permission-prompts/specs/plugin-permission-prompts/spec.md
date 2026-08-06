## ADDED Requirements

### Requirement: Host 权限交互 MUST 分开展示可信风险事实、作者原因和授权状态

系统 MUST 从当前 Host permission catalog、normalized Manifest request、Registration detail 和真实 grant snapshot 派生冻结的权限展示模型。每项 MUST 显示稳定 permission ID、Host-owned 本地化名称与风险说明、`standard | sensitive` 风险等级、当前平台支持状态、effective 状态，以及 Manifest 提供并明确标识为作者内容的本地化 reason。Publisher 文本和 Host source MUST 与风险和 grant 分开展示；未具备真实签名证据的 Publisher MUST 标记为未经验证，且 official/external 来源 MUST NOT 改变权限风险、默认选择或授权规则。

展示模型 MUST NOT 包含路径、digest、package bytes、staging、完整 Manifest、完整 grant set、原始错误、stack、Rust/Tauri object 或插件 payload。未知 permission MUST 显示为不支持且不可授权，而不是由文案、命名或 Publisher claim 创建 catalog entry。

#### Scenario: 本地插件请求首批敏感权限

- **WHEN** 一个本地 external 插件请求 `clipboard.read` 和 `clipboard.write`
- **THEN** Host 分别显示两项权限、各自 Host 风险说明、当前支持状态和 Manifest reason，并将两项标记为 `sensitive`
- **THEN** Publisher 文本被标记为未经验证，且任一权限都不因请求、reason、source 或名称而成为 granted

#### Scenario: 插件请求未知权限

- **WHEN** candidate Manifest 包含当前 Host catalog 之外的 permission ID
- **THEN** Host 将其显示为 unsupported 且不提供授权动作
- **THEN** 未知 ID 不进入 grant mutation、Runtime capability 或 native effect

#### Scenario: 作者原因缺少当前语言

- **WHEN** 当前 locale 的 Manifest permission reason 缺失但既有 Manifest locale fallback 可提供安全文本
- **THEN** Host 按同一 fallback 规则显示作者原因并保持“插件提供”标识
- **THEN** fallback 内容仍不影响风险、支持或 grant 结论

### Requirement: 敏感权限 MUST 默认关闭并逐项获得明确决定

安装、替换和设置中的每个 `sensitive` 权限 MUST 默认未选择。授权 MUST 由 Host-owned 单权限确认中的明确用户动作触发；安装、替换、启用插件、选择“继续”或确认另一个 permission MUST NOT 隐含授权当前 permission。系统 MUST NOT 提供默认全选、全局敏感权限一次确认、官方来源 bypass 或由插件发起的 grant。

用户 MUST 能在不授予任何权限的情况下继续兼容插件的首次安装或替换。明确拒绝一个 permission 或选择稍后决定 MUST 都不调用 grant mutation、不新增持久 decision/history，并保持真实状态为 `not_granted`。以后从设置页再次授予 MUST 仍然可用。

#### Scenario: 用户零授权安装插件

- **WHEN** compatible candidate 请求一个或多个敏感权限，而用户保持所有选择关闭并确认安装
- **THEN** Host 允许安装继续并以空 grant snapshot 创建 Registration
- **THEN** 插件对应 capability 不可用，且安装确认不被解释为授权

#### Scenario: 用户逐项授予两个敏感权限

- **WHEN** 用户依次选择 `clipboard.read` 和 `clipboard.write`
- **THEN** Host 为每项显示独立确认并只记录已明确确认的短暂选择
- **THEN** 一个 permission 的确认不会选择、授权或暗示另一个 permission

#### Scenario: 用户拒绝或稍后决定

- **WHEN** 用户在单权限确认中选择拒绝，或关闭权限选择并选择稍后决定
- **THEN** 对应 permission 保持 `not_granted` 且没有 grant mutation
- **THEN** Host 不持久化 denied/deferred 区分、时间戳或 actor，并在以后设置中继续提供明确授权入口

### Requirement: 安装与替换授权 MUST 在 durable commit 后复用现有逐项 grant authority

首次安装 MUST 以空 grant snapshot durable commit；replacement MUST 继续只保留旧 grants 与 candidate requested permissions 的交集。安装或替换确认中的 permission selections MUST 仅作为当前 Host 交互的短暂意图，MUST NOT 在 durable commit 前修改 Manager、Registration revision、active Runtime 或 grant snapshot。

durable commit 与当前 Registration snapshot 收敛后，可信 management service MUST 以稳定 permission ID 顺序逐项调用现有 revision-bound grant authority，并使用每次结果的 current revision 作为下一次 expected revision。只有 candidate 当前请求、Host 当前支持且用户单独确认的 permission 才可进入该序列。新增 replacement permission MUST 默认不进入序列；retained grant MUST NOT 重复确认，removed request MUST NOT 保留 grant。

如果 durable operation 成功而后续 grant 部分失败，系统 MUST 保留已提交安装/替换和实际较窄 grant state，停止剩余 grant 序列，完整刷新并提供可恢复反馈；系统 MUST NOT 回滚 payload、伪造完整授权成功或自动重试旧选择。

#### Scenario: 首次安装后应用一个明确 grant

- **WHEN** 用户在首次安装确认中只明确允许 `clipboard.read`，安装 durable commit 以空 grant 成功且 snapshot 收敛
- **THEN** management service 通过现有 `setGrant` authority 为 current entry/revision 提交一次 `clipboard.read` grant
- **THEN** `clipboard.write` 保持 `not_granted`，新 authority 只通过新的 Registration revision 和 Runtime identity 生效

#### Scenario: 替换增加权限

- **WHEN** candidate replacement 保留一个已有 grant、删除一个旧请求并新增一个敏感 permission request
- **THEN** 确认显示 retained、removed 和 added 三类事实，新增项默认关闭且 durable replacement 前不发生 grant mutation
- **THEN** replacement commit 保留交集、删除 removed grant，只有用户对新增项单独确认后才在 committed revision 上调用现有 grant authority

#### Scenario: durable operation 后 grant 失败

- **WHEN** 安装或替换已经 durable success，而第一项或后续 grant 因 conflict、persistence、unsupported 或 convergence 问题失败
- **THEN** Host 停止剩余 grant、完整重读当前 detail，并明确说明 durable operation 已成功但权限未全部应用
- **THEN** 实际已提交 grants 保持有效，未提交项保持未授权，系统不回滚版本或自动重放旧决定

### Requirement: 设置页 MUST 提供 current、revision-bound 的逐项 grant 与 revoke

健康插件的权限详情 MUST 分别显示 requested、supported、persisted grant 和 effective 状态。对 current、requested、supported 且 `not_granted` 的 permission，设置页 MUST 提供单项 grant 动作；对真实 persisted grant，设置页 MUST 提供单项 revoke 动作。grant/revoke MUST 经由 root-private management facade 和 typed permission service，绑定当前 opaque `entry_id` 与 exact Registration revision；React MUST NOT 直接 invoke Tauri、提交完整 grant array、optimistically 修改 authority 或复制 Manager transition。

permission mutation MUST 与安装、替换、生命周期和数据 mutation 使用同一页面级串行边界。成功后 UI MUST 等待 returned revision 的完整 snapshot/detail 收敛；conflict MUST 关闭 stale confirmation、清除短暂选择、刷新并要求重新决定。revoke 成功 MUST 沿用现有 Runtime invalidation 立即收窄 authority，并向用户说明活动插件页面或 pending call 可能已终止。

#### Scenario: 在设置中授予敏感权限

- **WHEN** 用户对 current healthy plugin 的 supported、requested、not-granted permission 打开单项确认并明确允许
- **THEN** management facade 提交 exact entry/revision 的单 permission grant 并等待新 revision 收敛
- **THEN** 页面只在 current detail 证明 granted 后显示成功，新 Runtime capability 只能来自新 identity

#### Scenario: 撤销活动插件的权限

- **WHEN** 用户明确确认撤销 current persisted grant
- **THEN** Host 提交单 permission revoke、等待 snapshot 收敛，并立即使受影响旧 Session/Port/pending calls 失去 authority
- **THEN** 页面宣布权限已撤销和可能的活动页面关闭，不自动重开页面且不影响无关插件

#### Scenario: 权限确认后 revision 已变化

- **WHEN** 用户确认 grant/revoke 前后目标 Registration revision 发生变化
- **THEN** stale mutation 被拒绝，旧 modal 与短暂选择被清除，页面完整刷新
- **THEN** Host 不把旧决定自动应用到新版本、不同 entry 或不同 permission state

#### Scenario: 不可授权状态

- **WHEN** entry quarantined、Manager degraded、permission 未请求或 unsupported、detail 与 snapshot revision 不一致，或另一 mutation 正在进行
- **THEN** grant 动作不可用且 Host 显示安全可恢复状态
- **THEN** UI 不伪造可用性，底层 authority 仍对防御性请求 fail closed

### Requirement: Runtime 权限不足 MUST 保持稳定受限体验且不得触发插件驱动自动弹窗

缺失或撤销 grant 时，系统 MUST 继续通过现有 Page/Action availability、Runtime capability 和稳定 Host API error 表达受限状态。iframe RPC、Manifest、SDK payload、插件 source、Publisher 或插件自报 user activation MUST NOT 自动打开 Host permission modal、导航到授权页面或创建 grant。用户只能在 Host-owned 安装、替换或设置交互中明确授予。

撤销必须继续立即终止旧 Runtime authority；若撤销由当前设置交互发起，Host MUST 在该可信 surface 提供可操作反馈。插件 MAY 在自己的 UI 中根据 capability/error 解释功能不可用并通过既有 Host Action 打开普通设置入口，但该行为 MUST NOT 携带 permission decision、绕过 Host confirmation 或使 Host 相信插件已证明用户手势。

#### Scenario: 插件反复调用未授权方法

- **WHEN** iframe 反复调用当前未授权的 permission-backed Host API
- **THEN** 每次调用按现有 contract 返回 `permission_denied`、`unavailable` 或终止状态
- **THEN** Host 不显示权限 modal、不导航、不保存决定且不扩大 capability

#### Scenario: 插件声称请求来自用户点击

- **WHEN** 插件 payload、Manifest reason 或 SDK 调用声称 permission request 来自用户手势
- **THEN** Host 忽略该声明作为 authority，且不会直接 grant 或显示可信确认
- **THEN** 用户必须在 Host-owned surface 对 exact current permission 再次明确操作

### Requirement: 权限交互 MUST 支持双语、主题、键盘、焦点和固定视口

所有 Host-owned 产品文案 MUST 以 canonical English locale 为源并提供语义一致的 Simplified Chinese translation，使用现有应用 i18n、message schema、Semi Design locale/theme 和 supported tokens。安装/替换/单权限 grant/revoke 的全部信息和动作 MUST 只用键盘完成，具有可访问名称、风险说明、visible focus、pending 防重入和 live status/alert；状态 MUST NOT 仅由颜色、icon 或 permission ID 表达。

Modal 取消、拒绝、成功或失败后 MUST 将焦点恢复到仍存在的触发器或确定性相邻入口；prepared install/replacement 被取消或 stale 时 MUST 清理 interaction state 并恢复对应入口。固定 `650×600` native page viewport 下，`en-US | zh-CN` × `light | dark` 的长名称、长 reason、unsupported、全部未授权、部分授权、conflict 和 partial-grant feedback MUST 无关键截断、重叠、失焦或不可读对比度。

#### Scenario: 键盘用户拒绝敏感权限

- **WHEN** 键盘用户从权限行打开 sensitive confirmation 并选择拒绝或取消
- **THEN** Modal 的标题、说明和动作可感知，permission 保持未授权且没有重复提交
- **THEN** 焦点返回原权限行的有效控制，live region 不宣布虚假成功

#### Scenario: 切换语言和主题

- **WHEN** permission prompt 在英文/中文和 light/dark 之间切换
- **THEN** Host 风险、作者 reason 标签、Publisher 未验证、状态、按钮和反馈使用当前 locale 与 supported theme tokens
- **THEN** permission semantics、默认关闭和 grant state 不因 locale/theme 改变

#### Scenario: prepared target 变成 stale

- **WHEN** 确认打开期间 preparation 或 Registration target 失效
- **THEN** Modal 关闭、短暂选择清除并显示安全 conflict/retry 反馈
- **THEN** 焦点返回新的有效入口而不是已移除 DOM、背景内容或不可交互 placeholder

### Requirement: 权限提示能力 MUST 保持 Host-private 并具有聚焦交付门禁

permission prompt contract、candidate projection、management mutations、confirmation state 和 installation preparation MUST 只存在于 Rust Host、strict private Tauri boundary 和 trusted root application。它们 MUST NOT 通过 `@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-ui`、`@lensx/plugin-testkit`、official/example plugin 或 iframe Runtime 导出或调用。public packages MUST 保持现有 permission IDs、methods 和 error semantics，不新增 permission-request 或 grant API。

交付 MUST 提供 focused validation，覆盖 local installation preparation Rust/TypeScript drift、token/staging recovery、permission display derivation、安装/替换/settings orchestration、逐项 grant/revoke、partial failure、conflict、Runtime invalidation、public boundaries、双语 schema、keyboard/focus、fixed-viewport screenshots 和 computed styles；focused gate MUST NOT 替代完整 frontend 与 Rust validation。

#### Scenario: 插件代码尝试导入权限交互 authority

- **WHEN** official、example 或 external plugin consumer 尝试导入 prompt model、installation token、management permission mutation 或 grant adapter
- **THEN** workspace/public-package boundary gate 拒绝该依赖
- **THEN** 插件不能打开可信 Host modal、提交 grant、读取其他插件状态或伪造 candidate

#### Scenario: 运行聚焦门禁

- **WHEN** maintainer 运行 plugin-permission-prompts focused validation
- **THEN** strict contracts、services、UI、recovery、security、i18n、theme、keyboard、focus 和视觉证据全部通过
- **THEN** 门禁确认没有路径、digest、payload、grant set、raw error、stack、Host object 或未验证 authority 进入 UI、日志或 public packages
