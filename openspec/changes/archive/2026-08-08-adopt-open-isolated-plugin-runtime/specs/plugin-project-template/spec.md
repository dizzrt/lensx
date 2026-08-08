## MODIFIED Requirements

### Requirement: Each template MUST contain a complete, minimal, permissionless runnable plugin

每个 template MUST 使用 Manifest `0.2.0`、一个 Page、指向该 Page 的 Action、package-local Runtime entry 与完整 resources。它 MUST 不包含 legacy permission fields，不调用 unpublished native Host API，并 MAY 演示 open Runtime 支持的 Worker/network/Blob/Data 等 ordinary Web behavior。

#### Scenario: template 在真实 Runtime 初始化
- **WHEN** template plugin 安装并初始化 SDK
- **THEN** 无 permission/grant workflow，Page 与 Runtime Context 正常工作且 native Host authority 仍封闭

### Requirement: The template capability MUST have narrowly scoped bilingual documentation and complete validation

双语文档与 gate MUST 将 template 描述为 open-Web/closed-Host runnable baseline，而不是 permission 或 native-authority tutorial，并 MUST 保持 external consumer、package、accessibility、locale 与 theme evidence。

#### Scenario: external developer 阅读模板文档
- **WHEN** developer 从 English 或 Chinese index 打开文档
- **THEN** 两种语言都不指导 requested permissions、grant 或 clipboard Host API

