## MODIFIED Requirements

### Requirement: Host MUST derive every Runtime Session identity from current trusted facts

Session identity MUST 绑定 current entry/plugin/version/Page/resource generation/origin/Runtime attempt/real contentWindow，MUST 不含 grant snapshot，也 MUST 不接受 Manifest、message 或 UI 自报 identity/authority。

#### Scenario: current iframe 建立 Session
- **WHEN** Page、Registration、Resource、attempt 与 browsing context 完整收敛
- **THEN** Host 创建 permissionless read-only identity 且无旧 grant authority

### Requirement: Relevant current-fact changes MUST revoke only the affected Session

Missing、disabled、quarantined、incompatible、identity/Page/resource/origin/generation/attempt/replacement change MUST revoke affected Session；grant mutation 不再是 current fact 或 invalidation source。

#### Scenario: current plugin 变为不可用
- **WHEN** plugin disabled、removed、replaced 或 generation changes
- **THEN** old Session/Port 立即失效，legacy grant fields 不得保持 authority

### Requirement: Delivery MUST prove source binding on focused and real WebView paths

Delivery MUST 证明 exact source/origin、nonce、Port、current-fact invalidation、unrelated-plugin stability 与 zero privileged hits，不得再要求 grant invalidation evidence。

#### Scenario: WebView Session matrix 通过
- **WHEN** normal/malicious/replacement/retry matrix 执行
- **THEN** only current iframe ready，旧 Port 与 legacy permission claims fail closed

### Requirement: Task 4.3 MUST leave SDK transport, Host API, permission decisions, and complete lifecycle unimplemented

该历史 capability boundary MUST 不创建 SDK transport、Host API/native authority、storage、management UI 或 background Runtime；当前 permission system 已删除而不是等待后续交付。

#### Scenario: Session capability 独立成立
- **WHEN** Session gate 通过
- **THEN** plugin 仍不能仅凭 Session 获得 Host API 或 native authority

