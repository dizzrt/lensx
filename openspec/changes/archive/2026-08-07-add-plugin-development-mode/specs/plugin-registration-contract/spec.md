## MODIFIED Requirements

### Requirement: Registration wire payloads MUST use an independent explicit version

每个 registration snapshot、detail response 和 changed-event payload MUST 携带 Registration Contract version `0.2.0`。该版本 MUST 独立于 Manifest protocol、Host API、lensX application version 和 Plugin Manager Store format。Rust 与 TypeScript boundary MUST 拒绝缺失、旧 `0.1.0`、未知或类型错误的 version，MUST NOT 将 payload 静默解释为其他版本或对 `development` source 执行 fallback。

#### Scenario: Both boundaries read a current-version payload

- **WHEN** Rust serializer 与 TypeScript parser 读取 Registration Contract version `0.2.0` 的有效 shared fixture
- **THEN** 两端接受 payload 并产生相同 observable fields 和 values，包括 closed source enum

#### Scenario: Frontend receives an unknown version

- **WHEN** Tauri command 或 event 返回旧、未知、缺失或类型错误的 contract version
- **THEN** TypeScript adapter 拒绝 payload 并映射为 stable boundary error
- **THEN** adapter 不发布 partially parsed snapshot、detail 或 revision

### Requirement: Host MUST expose deterministic complete registration snapshots

Host MUST 提供只读 `read_plugin_registration_snapshot` Tauri command。成功响应 MUST 包含 Registration Contract version、当前 process-local revision、Manager availability/recovery summary，以及每个 current healthy registration 与 quarantine stub 的 summary。entries MUST 按 Host-generated opaque entry identity 确定性排序。healthy 与 quarantine summary MUST 是严格 discriminated variants。空 Manager MUST 返回有效空 snapshot，而不是 error 或 placeholder plugin。

healthy summary MUST 至少包含 opaque entry identity、plugin ID、plugin version、normalized localized display data、Host-controlled `builtin | external | development` source、enabled intent、两维 compatibility 和当前 `inactive` Runtime status。quarantine summary MUST 至少包含 opaque entry identity、可选 plugin ID 和安全 quarantine diagnostic，并 MUST NOT 猜测缺失的 Manifest display data。`development` source MUST 只表示当前进程中的 Host-owned开发注册；它 MUST NOT 表示 installed、official、verified、signed、trusted 或额外 authorization。

#### Scenario: Read an empty Plugin Manager

- **WHEN** Plugin Manager 没有 healthy records、process-local development entries 或 quarantine stubs
- **THEN** snapshot 返回空 entries、当前 contract version、有效 revision 和真实 Manager availability
- **THEN** Host 不创建 example、placeholder 或 default plugin

#### Scenario: Healthy and quarantine records coexist

- **WHEN** Manager snapshot 同时包含 installed/development healthy registrations 和一个 damaged-record quarantine stub
- **THEN** command 在同一 snapshot 中返回严格不同 variants
- **THEN** entries 按 opaque entry identity 确定性排序，healthy 与 quarantine fields 不混合

#### Scenario: Store recovery is degraded

- **WHEN** Plugin Manager 因 Store directory 整体不可读而以 degraded recovery report 启动
- **THEN** snapshot 明确返回 degraded availability 和安全 Manager recovery diagnostic
- **THEN** degraded empty collection 不被报告为普通 healthy empty collection，且不暴露底层 path/error object

#### Scenario: A development registration is projected

- **WHEN** 当前进程包含有效 development registration
- **THEN** summary/detail 使用 `source=development`，同时继续隐藏 source directory、snapshot root/identity、operation token、package digest 和 raw errors
- **THEN** frontend 不能从 publisher、source 或其他 display facts 推导 signature、official provenance、grants 或 Runtime exception
