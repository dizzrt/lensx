> 归档状态：以下内容是原 change 的未交付产品验收目标，不代表当前 ConfigLens 已实现该行为。该 delta spec 仅作为诊断历史保留，归档时 MUST 使用 `--skip-specs`，不得同步到 stable specs；后续实施由 GitHub Issue [#1](https://github.com/dizzrt/lensx/issues/1) 重新建立范围。

## ADDED Requirements

### Requirement: ConfigLens MUST 证明可编辑 Monaco 表面中的 native pointer 行为稳定
canonical ConfigLens candidate MUST 通过外部插件使用的相同生产 Child WebView、Resource Service、bridge、SDK 和 Runtime Session 路径通过目标 macOS native cursor 证据。指针在一个未变化的可编辑 Monaco 文本区域内移动时，可见 native cursor MUST 保持 I-beam，且不得短暂 fallback 为默认箭头。证据 MUST 保留语义边界处的合法 cursor change，MUST 在相关语义等价 lifecycle 转换后运行，MUST NOT 改变单 editor 产品交互或授予 ConfigLens 特权 Runtime 路径。

#### Scenario: 可编辑文本区域内的持续移动保持稳定
- **WHEN** 目标 macOS gate 已通过真实 event delivery 与 native observation 确认 cursor 在 Monaco 报告为同一个可编辑文本区域内完成 I-beam 建立，并继续在维护 JSON 文本和 editor 空白处持续移动指针
- **THEN** native cursor 在完整样本中保持 I-beam，且没有非语义箭头 fallback
- **AND** 单一 Monaco editor、model、document、package generation、Child WebView attempt 和 Runtime Session 保持当前有效

#### Scenario: 首次建立延迟不冒充稳态闪烁
- **WHEN** production ConfigLens candidate 首次进入一个 Web 语义始终为 `text` 的区域
- **THEN** gate MUST 分别记录有界 establishment event sequence、首次 I-beam 时间和 establishment 后的 steady-state sequence
- **AND** 只有 establishment 已达到要求的连续 I-beam，随后发生的 arrow fallback 才能选择产品修复层
- **AND** 如果 Host 正常参与阻止 establishment，测试专用 seeded 对照 MAY 只在 establishment 隐藏 Host，但 MUST 在 steady-state 前恢复同一个 Host，并证明 Host delivery、Child、document、editor、Session、attempt、bounds 和 focus identity 未漂移
- **AND** 如果 seeded production steady-state 稳定、seeded establishment 未完成或 Host 未有效恢复，change MUST 保持未完成且不得用冷启动或隔离态样本声明已复现持续闪烁

#### Scenario: Monaco 与周边 UI 保留合法 cursor 转换
- **WHEN** 指针从可编辑文本跨越到 Monaco gutter 或 scrollbar、footer control、link 或 Host-owned resize edge
- **THEN** 每个区域保留其预期 pointer 行为和可访问交互
- **AND** ConfigLens MUST NOT 通过对非文本区域强制 `cursor: text` 来通过稳定文本门禁

#### Scenario: 稳定 pointer 经受 retained Page lifecycle
- **WHEN** 用户 resize 插件 Page，或在同一 ConfigLens entry、version、source、generation 与 Runtime attempt 保持有效时 hide 并 restore Launcher
- **THEN** Host 保留当前 Child WebView、Session、Monaco model 和内存 fixture
- **AND** 下一次可编辑区域指针样本仍保持稳定，且没有 document reload 或 editor recreation

#### Scenario: Reopen 启动干净的 cursor 证据状态
- **WHEN** ConfigLens 被 close、replace、disable、upgrade 或 uninstall，并在适用时稍后重新 open
- **THEN** 已销毁 attempt 不再输出后续 pointer evidence，新 attempt 创建全新的有界 cursor evidence state
- **AND** 旧 editor content 或 cursor sample 不会恢复到新 attempt

#### Scenario: Focused candidate gate 拒绝不完整 cursor 证据
- **WHEN** focused ConfigLens gate 仅使用 DOM cursor style、synthetic editor fixture、历史证据、人工视频，或绕过生产 Child WebView 和公开 SDK 的路径验证 release candidate
- **THEN** candidate 未通过 native cursor 要求
- **AND** 修正后相同不可变 candidate MUST 重新运行目标 macOS gate
