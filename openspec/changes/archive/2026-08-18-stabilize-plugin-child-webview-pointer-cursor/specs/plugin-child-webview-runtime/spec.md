> 归档状态：以下内容是原 change 的未交付产品验收目标，不代表当前 Child WebView Runtime 已实现该行为。该 delta spec 仅作为诊断历史保留，归档时 MUST 使用 `--skip-specs`，不得同步到 stable specs；后续实施由 GitHub Issue [#1](https://github.com/dizzrt/lensx/issues/1) 重新建立范围。

## ADDED Requirements

### Requirement: 原生 Child WebView 指针语义在目标 macOS 上 MUST 保持稳定
生产原生 Child WebView Runtime MUST 在鼠标移动时使可见 macOS 指针与当前语义命中区域保持一致。交付证据 MUST 区分 Web 内容 cursor 语义和最终 native cursor，MUST 把首次 cursor establishment 与 establishment 后的 steady-state movement 分开，并 MUST 先在纯 AppKit 已知 cursor 面证明真实 mouse event delivery 与 native observation oracle 有效。改变产品行为前，证据 MUST 通过受控的顶层普通 WKWebView、顶层 WKWebView + Monaco、通用 Child WKWebView 和生产 Host/Child sibling case 对已复现的 steady-state 问题完成归因。证据 MUST 覆盖没有 Publisher 或插件身份特例的普通公共边界插件路径。语义等价的 activation、bounds 更新、focus 转换、hide 和 restore MUST 保持该行为，且不得替换当前有效的 Child WebView 或 Runtime Session。证据 MUST 使用仓库维护的非敏感 fixture，MUST NOT 保留用户内容或原始桌面画面。

#### Scenario: 指针在一个稳定文本区域内移动
- **WHEN** 目标 macOS harness 已确认 native cursor 在 Web 语义始终为 `text` 的 Child WebView 区域内完成 I-beam establishment，并继续移动指针且没有跨越 overlay、控件、滚动条、gutter、链接或 native resize 边缘
- **THEN** 可见 native cursor 在完整样本中保持 I-beam，任何短暂默认箭头 fallback 都不被接受
- **AND** 当前 document、Child WebView、Runtime Session、presentation attempt 和 bounds revision 保持不变

#### Scenario: Establishment 与 steady-state 证据严格分离
- **WHEN** 真实 mouse-move event 首次进入 Web 语义 cursor 始终为 `text` 的区域
- **THEN** harness 记录有界的 establishment event delivery、每点 native classification、首次 I-beam 时间以及达到连续 I-beam 的判定
- **AND** establishment 样本 MUST NOT 计入 steady-state fallback count
- **AND** establishment 未在有界窗口内成功时，该 case MUST 作为独立的 establishment failure 报告且不得选择 steady-state 产品修复层

#### Scenario: 指针跨越真实语义边界
- **WHEN** 目标 macOS harness 把指针从文本区域移动到 gutter、控件、链接、滚动条或 Host-owned resize 边缘
- **THEN** native cursor 按新的语义命中区域发生变化
- **AND** 如果 blanket cursor override 抑制该合法转换，门禁 MUST 失败

#### Scenario: Native observation oracle 先通过纯 AppKit 基准
- **WHEN** 目标 macOS harness 通过公开 mouse-move event 依次进入纯 AppKit 已知 text、arrow、link 与 resize cursor 区域
- **THEN** harness 证明每个 event 已送达目标 AppKit window，且 native classification 与已知区域一致
- **AND** 如果 event 未送达或 classification 不匹配，Web case 结果 MUST NOT 选择任何产品修复层

#### Scenario: 受控 case 唯一判别失败层
- **WHEN** AppKit oracle 已通过，所有必需 Web case 都先完成 I-beam establishment，且相同目标 macOS 版本、几何、device scale、真实 event 轨迹、fixture 和 steady-state sampling contract 分别运行于顶层 WKWebView + 普通 `cursor: text`、顶层 WKWebView + Monaco、没有第二个 Host WKWebView 的纯原生窗口 + 唯一 Child WKWebView + 普通 `cursor: text`，以及 production Host/Child sibling Runtime + Monaco
- **THEN** 完整 steady-state 结果通过受控组合把可重复失败唯一判别为共享 WKWebView/WebKit、Monaco 特有内容、通用 Child WKWebView/Wry 或 lensX Host/Child sibling 组合层
- **AND** 在一个层被可重复证据选中且未选中层被记录前，产品行为 MUST NOT 改变

#### Scenario: Host presence 对照区分 sibling 竞争
- **WHEN** production Host/Child case 在相同 Child、document、fixture、bounds、focus 和轨迹下，分别运行底层 Host WKWebView 全程正常参与、全程由公开 native 机制隔离，以及只在 establishment 隔离并在 steady-state 前恢复同一个 Host 的测试专用 seeded 对照
- **THEN** harness MUST 分阶段记录 Host 与 Child 的有界 move delivery 计数、Host 恢复状态和相同 steady-state native cursor 结果
- **AND** seeded steady-state 只有在 Host 已恢复、Host move delivery 已重新出现且 Child、document、Session、attempt、bounds 和 focus identity 没有漂移时才可计分
- **AND** 只有隔离 Host participation 能重复消除 production steady-state fallback 时，才可选择 lensX Host/Child sibling 层

#### Scenario: 归因缺失或含糊
- **WHEN** 纯 AppKit oracle 失败、D1/A/纯原生 B/seeded production 任一必需 Web case 无法完成 establishment、seeded production steady-state 稳定、Host 未在 steady-state 前有效恢复、受控 case 不能一致复现 production steady-state 症状，或完整结果不能唯一判别一个失败层
- **THEN** change 保持未完成，任何掩盖 cursor 的产品补丁都不被接受
- **AND** DOM computed style、synthetic controller test、历史摘要或单独人工观察 MUST NOT 被当作 native cursor 完成证据

#### Scenario: 语义等价 lifecycle 转换保持 cursor 稳定
- **WHEN** 当前有效插件 Page 收到用户 resize、focus change、Launcher hide 和 shortcut restore，或其他语义等价 activation
- **THEN** Host 通过当前 revisioned slot 收敛 bounds 和 focus，同时保留当前 Child WebView 与 Runtime Session
- **AND** 重复执行稳定区域指针样本仍满足 native cursor 要求

#### Scenario: 实际 teardown 释放 cursor 证据资源
- **WHEN** close、replacement、disable、uninstall、crash recovery 或 destroy 拆除当前 Child WebView attempt
- **THEN** 属于该 attempt 的所有 pointer observer、test hook、timer 和 native capture resource 被幂等停止
- **AND** 后续 open 不会收到来自已销毁 attempt 的 cursor event 或 evidence

#### Scenario: Native cursor 证据保持私密且有界
- **WHEN** 目标 macOS gate 输出诊断证据
- **THEN** 它只记录来自维护 fixture 的有界 case identifier、环境版本、语义区域、cursor classification、revision、count 和 timing
- **AND** 它 MUST NOT 持久化插件输入、用户配置、原始桌面 frame，或向插件代码暴露新的 Host capability
