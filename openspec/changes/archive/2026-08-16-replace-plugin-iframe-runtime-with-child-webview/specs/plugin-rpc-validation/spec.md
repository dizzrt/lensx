## ADDED Requirements

### Requirement: RPC validation MUST accept frames only from the current WebView bridge binding
The existing closed RPC budgets, validators, cancellation, deadline, exactly-once and egress rules MUST execute only after native bridge ingress proves the actual current Child WebView Session. Carrier decoding MUST treat input as `unknown`; a malformed, oversized, stale or wrong-source frame MUST NOT reach Dispatcher or reveal expected identity. Valid responses and events MUST be encoded and delivered only to the same current WebView.

#### Scenario: Current request passes carrier validation
- **WHEN** the current source sends a bounded frame containing a Contract-valid request
- **THEN** the existing RPC and semantic validators execute before Dispatcher and the result returns to that source only

#### Scenario: Wrong source sends a valid-shaped request
- **WHEN** a destroyed or unrelated WebView submits a frame within all structural budgets
- **THEN** source validation rejects it before in-flight state or a Host handler is created
