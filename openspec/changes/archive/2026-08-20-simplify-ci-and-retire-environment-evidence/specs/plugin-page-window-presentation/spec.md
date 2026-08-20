## REMOVED Requirements

### Requirement: Delivery MUST prove responsive native and Child WebView behavior

**Reason**: This requirement specifically demands visual validation, real target-macOS resize, restore and close behavior, and environment evidence. Those demands exceed the new deterministic validation boundary.

**Migration**: Retain requirements for the presentation Contract, Host effective bounds, work-area fitting, resize attempts, surface transitions, close and reopen behavior, and state isolation. Keep verifiable behavior in Contract, Rust, React, boundary, package, and Development Mode state tests, and remove the visual and native harness, evidence producer and records, and Gate.

## ADDED Requirements

### Requirement: Delivery MUST deterministically validate plugin Page presentation

Automated Contract, Rust, React, boundary, package, and Development Mode tests MUST cover default and explicit presentations, hard-bound rejection, modeled work-area fitting, fixed and resizable Pages, resize bursts, monitor/scale state changes, same-attempt hide/restore, close/reopen transitions, multi-plugin switching, failure rollback, and immediate Home restoration. Maintained validation MUST NOT launch a real Child WebView or native Window, capture visual output, or write target-environment evidence.

#### Scenario: Presentation state matrix passes

- **WHEN** deterministic Contract, Host-controller, React, boundary, and package tests execute the maintained presentation cases
- **THEN** effective bounds, revision convergence, reuse/close semantics, rollback, and non-persistence match the stable product requirements
- **THEN** public plugins expose no native setter, handle, monitor coordinate, or persistent user-size authority

#### Scenario: Native interaction proof is requested

- **WHEN** a completion path requires real resize, focus, hide/restore, close, screenshot, or target macOS evidence
- **THEN** validation governance rejects that path
- **THEN** the environment path is deleted rather than kept as an optional Gate
