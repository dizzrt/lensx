# Spec Delta

## MODIFIED Requirements

### Requirement: Double-tap availability MUST reflect native monitoring authorization

Double taps MUST execute only with native authorization and available passive monitoring. Settings MUST distinguish missing permission, unavailable monitoring and active monitoring. Lock, sleep or pending input recovery alone MUST NOT reveal a hidden window. The native Host owns this authorization independently of plugin permissions and the SDK. Monitoring MUST NOT store raw input content or transmit it to plugins.

#### Scenario: Monitoring is not authorized
- **WHEN** the user configures a double tap while monitoring authorization is unavailable
- **THEN** it may be saved as inactive with explicit authorization status and a user-initiated authorization entry
- **THEN** the system does not claim it is active or request monitoring authorization during ordinary startup or chord configuration
- **THEN** an unavailable Action double tap does not disable an otherwise active Launcher; if the selected Launcher is that unavailable double tap, the window stays visible for repair or quit without secretly enabling another chord

#### Scenario: Authorization revoked or monitoring interrupted
- **WHEN** monitoring fails, the system disables it, or current input cannot be observed reliably
- **THEN** all candidates are cleared, bindings show unavailable or suspended, and observation resumes from a new sequence
- **THEN** a confirmed failure of the sole Launcher double tap in an interactive session MUST reveal a hidden window and prevent unrecoverable hiding. During suspension or until monitoring can be retried, a hidden window MUST stay hidden pending recheck.
- **THEN** the system does not bypass Secure Input or disable another application's system protection

#### Scenario: An ordinary Launcher chord remains independent of a plugin double tap

- **WHEN** lock or sleep interrupts modifier double-tap monitoring for an Action such as Translation while the ordinary Launcher chord is registered
- **THEN** the Host MUST discard old gestures and MUST NOT treat the interrupted Action binding as a Launcher registration failure or a reason to show the window
- **THEN** after recovery a fresh valid Launcher chord MUST perform ordinary Toggle. Shortcut execution of the Action requires a fresh gesture for its own configured binding.

#### Scenario: Input spanning lock or sleep is discarded on recovery

- **WHEN** lock or sleep interrupts a candidate, a pending gesture confirmation, or a queued shortcut awaiting window dispatch, and the user returns
- **THEN** the Host MUST discard those candidates, confirmations and queued window actions. Unlocking, old key releases and stale callbacks MUST NOT trigger Toggle, Show or a plugin Action.
- **THEN** recognition MUST restart from the current physical input state. Each subsequent valid new gesture MUST execute once.

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

- **WHEN** a modifier double tap is the sole Launcher entry and an interactive session confirms monitor establishment failure, unexpected disablement or abnormal observer exit
- **THEN** Host MUST revoke monitoring availability and preserve accessible repair and quit through the existing recovery policy, preventing unrecoverable hiding
- **THEN** Host MUST NOT secretly register a default or historical fallback chord; failure limited to passive monitoring MUST NOT revoke confirmed ordinary chords while the shared shortcut service remains healthy

#### Scenario: Wake waits for an eligible monitoring recheck

- **WHEN** the sole Launcher entry is a double tap and the system wakes while still locked, Secure Input prevents observation, or the retry interval has yet to allow a rebuild attempt
- **THEN** monitoring eligibility MUST reflect the actual monitor state and a hidden window MUST stay hidden. Wake, entering or leaving Secure Input in a password field, and timer expiry alone MUST NOT trigger repair display.
- **THEN** the Host MUST actively recheck when eligible. Successful rebuilding preserves a hidden window. Confirmed permission revocation, an actual failure to rebuild while permitted, or observer termination MUST follow the main-window repair policy.

#### Scenario: A persistent failure can be repaired without a new monitor status event

- **WHEN** a fault affecting the sole Launcher entry was recorded during an interruption and the user returns to an interactive session with the same monitor status or a stopped observer
- **THEN** the Host MUST recheck the current entry without waiting for another monitor status change or for the user to press the failed shortcut. A recovered entry leaves a hidden window hidden. A persistent fault MUST make repair and quit accessible.
