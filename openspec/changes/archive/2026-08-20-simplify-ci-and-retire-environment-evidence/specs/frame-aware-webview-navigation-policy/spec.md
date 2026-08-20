## MODIFIED Requirements

### Requirement: Trusted Tauri initialization MUST execute only in the Host main frame

The system MUST enforce Tauri `for_main_frame_only` initialization semantics on macOS WKWebView. The Host App main frame MUST retain its existing `isTauri`, `__TAURI_INTERNALS__`, metadata, invoke initialization, and IPC bootstrap. All descendant frames MUST lack those surfaces before the earliest author script executes, and a representative descendant invoke MUST NOT reach the Rust handler. A sandbox, an opaque origin, an author's choice not to import an API, or a stored but unverified main-frame-only flag MUST NOT count as isolation. Maintained validation SHALL cover configuration, dependency behavior, policy classification, bridge denial, and zero-handler-hit semantics through deterministic source, unit, integration, and boundary tests without requiring a real WebView evidence run.

#### Scenario: Host main frame retains its bootstrap

- **WHEN** deterministic Host initialization and bridge tests exercise the frame-aware policy
- **THEN** the existing Tauri bootstrap, trusted invoke path, and App lifecycle remain configured for the Host main frame
- **THEN** the implementation cannot obtain the descendant negative result by removing initialization scripts globally

#### Scenario: Descendant cannot observe Tauri internals

- **WHEN** a normal or malicious descendant fixture inspects the modeled Tauri surfaces at the earliest author-script stage
- **THEN** `isTauri`, `__TAURI_INTERNALS__`, metadata, the invoke key, and IPC bootstrap are absent or unavailable
- **THEN** the check does not depend on whether the descendant and parent are same-origin or on cooperation from the plugin author

#### Scenario: Descendant invoke is stopped before the Host handler

- **WHEN** a descendant fixture attempts a representative invoke or forged bridge message
- **THEN** the policy and bridge boundaries reject it before the Rust handler and the bounded handler-hit count remains zero
- **THEN** diagnostics contain no invoke key, raw payload, bootstrap script, URL, or underlying system error

#### Scenario: Deterministic validation cannot establish the invariant

- **WHEN** dependency configuration, policy logic, or boundary tests cannot establish main-frame-only bootstrap and zero descendant handler hits
- **THEN** the capability remains incomplete
- **THEN** the team updates the native dependency patch or platform design rather than bypassing the invariant through DOM cleanup, author scripts, or removal of a negative case

## REMOVED Requirements

### Requirement: Delivery MUST prove pre-commit enforcement on every supported desktop WebView

**Reason**: This requirement exists only to make the real macOS WKWebView matrix and committed evidence a delivery threshold. That target-environment proof is explicitly retired by this change.

**Migration**: Retain product requirements for frame classification, allowlisting, pre-commit decisions, popup and download denial, and Host bootstrap isolation. Move deterministically provable behavior into Rust, TypeScript, dependency-pinning, and boundary tests, and remove the WebView harness, producer, records, and Gate.

## ADDED Requirements

### Requirement: Delivery MUST deterministically validate frame-aware navigation boundaries

Delivery MUST combine Rust policy and integration tests, TypeScript contract and source-policy tests, fixed dependency revision checks, and canonical normal and malicious navigation fixtures. Validation MUST cover main-frame and descendant classification, current target and lifecycle state, Host, external and cross-plugin rejection, dangerous schemes, popup/download denial, retained Host bootstrap, absent descendant bootstrap, and zero privileged handler hits. It MUST NOT claim that these deterministic checks constitute a real target-WebView run.

#### Scenario: Deterministic navigation matrix passes

- **WHEN** the maintained policy, dependency, fixture, and bridge-boundary tests run
- **THEN** allowed Host/current-plugin cases and rejected descendant, external, cross-plugin, popup, download, and dangerous-scheme cases match the stable policy
- **THEN** validation records no capability URL, invoke key, raw bootstrap, payload, local path, or sensitive identity

#### Scenario: A target-environment prerequisite is reintroduced

- **WHEN** completion requires a browser, real WebView, GUI application, native harness, or committed environment evidence
- **THEN** validation governance rejects the prerequisite
- **THEN** the requirement must be redesigned through a future OpenSpec change rather than restored as an optional Gate
