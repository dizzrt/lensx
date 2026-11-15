# Spec Delta

## ADDED Requirements

### Requirement: macOS passive input monitor resources MUST be bounded and fully retired

Host MUST own at most one passive shortcut-monitor registration at a time. Replacement, stop, loss of observability or demand, and partial initialization MUST fully unregister and release retired resources before replacement. Repeated cleanup MUST be safe and MUST leave no retained resource or invalid callback access.

#### Scenario: Normal observation retains only the current monitor

- **WHEN** Host has established an available passive monitor and processes input or idle polls
- **THEN** live system registrations belonging to that shortcut observer MUST never exceed one
- **THEN** ordinary polling MUST create no additional registration, and original input events MUST continue to propagate under the existing passive-monitor contract

#### Scenario: Replacement fully retires the old monitor first

- **WHEN** a disabled monitor, observation interruption, or anomalous observation interval requires replacement
- **THEN** Host MUST revoke old-monitor availability, clear old candidates, and fully unregister and release old resources before creating a replacement
- **THEN** retired monitors MUST receive no further input or access invalid state through callbacks; old input MUST NOT participate in the replacement monitor's gesture confirmation

#### Scenario: Partial initialization fails

- **WHEN** system-monitor creation fails, or the associated input-receiving resource fails after monitor creation
- **THEN** Host MUST reclaim every resource acquired by that attempt and MUST leave no partially initialized registration
- **THEN** monitoring MUST remain unavailable rather than Active, and later permitted retries MUST NOT inherit candidates from the failed attempt

#### Scenario: Observation becomes unnecessary or impossible

- **WHEN** authorization is lost, Secure Input becomes active, the system sleeps, or neither configuration nor recording requires passive observation
- **THEN** Host MUST fully unregister and release the current monitor and MUST create no monitor while observation is impossible or unnecessary
- **THEN** existing authorization, input protection, candidate clearing, and Launcher recovery contracts MUST remain effective

#### Scenario: Stop and repeated cleanup

- **WHEN** Host stops passive observation and completes observer-thread teardown, or cleans an already retired or unsuccessfully initialized monitor again
- **THEN** that observer's system registrations and associated resources MUST all reach zero, and released resources MUST NOT be released again
- **THEN** polls, recovery-condition changes, or pending retries while stopped MUST NOT create a monitor or execute old gestures

#### Scenario: Repeated failures and recoveries do not accumulate resources

- **WHEN** monitoring repeatedly encounters disablement, lost observability, creation failure, and successful recovery
- **THEN** live registrations MUST never exceed one, and residual resources of retired monitors MUST NOT grow with recovery count
- **THEN** final stop MUST release all resources; additional recoveries MUST NOT cause extra executions or replay old candidates

### Requirement: macOS passive input monitor recovery MUST preserve healthy resources and limit retries

Host MUST preserve a healthy, authorized and still-needed monitor across recognition-only resets, throttle creation attempts with monotonic time at least one second apart, and publish Active only after complete, enabled establishment. Recovery MUST begin from current physical state and retain existing safe degradation while unavailable.

#### Scenario: Recognition resets preserve a healthy monitor

- **WHEN** configuration, recording, hiding, or gesture state changes require only candidate clearing, and the current monitor remains healthy, authorized, and needed
- **THEN** Host MUST retain the same system registration without unregistering or replacing it for that reset
- **THEN** without an actual monitoring failure, Host MUST NOT introduce an unavailable interval or interrupt the sole Launcher double-tap recovery entry

#### Scenario: Continuous creation failures remain rate limited

- **WHEN** observation is permitted and needed but monitor or associated-resource creation repeatedly fails
- **THEN** Host MUST allow the first eligible attempt and keep subsequent creation attempts at least one second apart, without busy waiting or accumulating queued retries
- **THEN** idle polling or polling without an input source MUST retain the existing bounded wait, and authorization requests MUST remain explicit user actions

#### Scenario: Successful recovery accepts only a new input sequence

- **WHEN** interruption conditions clear and a replacement monitor and its associated resources are completely established and confirmed enabled
- **THEN** Host MUST restart observation from current physical key state before publishing Active, and MUST recognize subsequent input only as a new sequence
- **THEN** pre-interruption candidates, timers, and old callbacks MUST NOT cause delayed or duplicate execution

#### Scenario: Failed recovery retains accessible repair and quit

- **WHEN** the sole Launcher entry is a modifier double tap and its monitor cannot be completely established, becomes disabled, or its observer thread exits abnormally
- **THEN** Host MUST revoke monitoring availability and preserve accessible repair and quit through the existing recovery policy, preventing unrecoverable hiding
- **THEN** Host MUST NOT secretly register a default or historical fallback chord; failure limited to passive monitoring MUST NOT revoke confirmed ordinary chords while the shared shortcut service remains healthy
