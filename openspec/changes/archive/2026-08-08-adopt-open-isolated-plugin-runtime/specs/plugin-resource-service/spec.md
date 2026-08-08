## MODIFIED Requirements

### Requirement: Scope issuance MUST derive from a current and provably safe registration

Scope issuance MUST 只依赖 current healthy/enabled/compatible Registration、resource generation 与 provable installed/development payload ownership。Publisher、source、remote behavior、legacy permission/grant claim 或 Runtime `inactive` MUST NOT 单独 grant/deny resource access。

#### Scenario: current managed registration 获得 scope
- **WHEN** identity、payload、generation 与 ownership facts 完整匹配
- **THEN** Host 发放 current scoped URL，且不查询 permission service

### Requirement: Methods, MIME types, and response headers MUST be fixed and content sniffing MUST be prohibited

Current HTML response MUST 带 Host-owned open-isolation CSP、fixed MIME、length、`nosniff` 与 `no-store`。Author policy MAY 收窄内容，但 source、Publisher、Manifest 或 legacy grant claim MUST NOT 放宽 header isolation。

#### Scenario: current HTML GET
- **WHEN** GET 命中 current scoped HTML
- **THEN** open Web content classes 可按基线工作且 Host/跨插件隔离 header 保持权威

### Requirement: Task 4.1 MUST leave subsequent Runtime and UI capabilities unimplemented

Resource Service MUST 只交付 private resource URL/response/currentness boundary；它 MUST NOT 创建 iframe、Session、transport、Host API/native authority 或完整 UI。

#### Scenario: resource gate 独立通过
- **WHEN** focused resource validation 成功
- **THEN** scoped bytes 可安全读取但不产生 permission/grant 或 execution authority

