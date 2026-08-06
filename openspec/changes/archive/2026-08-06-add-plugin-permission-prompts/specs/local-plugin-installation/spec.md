## MODIFIED Requirements

### Requirement: The installation command contract must be strict, private, and minimally disclosing

The local installation boundary MUST use an independently versioned Host-private strict contract `0.2.0` with separate `prepare`, `commit`, and `cancel` operations, and every result, cancellation, and error payload MUST carry that version and exact operation. This version MUST evolve independently from the Manifest, package protocol, Registration Contract, Plugin Manager Store, permission contract, and application version. Rust and TypeScript MUST reject an unknown contract version, unknown field, unknown variant, invalid value, or cross-operation payload.

`prepare` success MUST distinguish `cancelled | prepared`. `prepared` MUST contain one process-local opaque token and only a bounded safe candidate projection needed by the trusted Host UI: plugin ID, Manifest version, normalized localized display name, Publisher display facts, and requested permission IDs with bounded localized reasons. It MUST NOT contain a path, digest, package bytes, staging fact, complete Manifest, grant, source authority, raw exception, stack, environment text, file content, Rust/Tauri object, or public plugin type. `commit` MUST accept only the current opaque token and return `installed` with plugin ID, Manifest version, and Registration revision. `cancel` MUST invalidate the current token and report a strict cancelled/unchanged conclusion without creating Registration facts. Failure MUST use a finite code, operation, and stable safe message and MAY reuse logical package diagnostics.

The old select-and-immediately-install production operation MUST NOT remain as a trusted UI bypass. Each process MUST hold at most one preparation; a new prepare, explicit cancel, failed commit, service destruction, or process restart MUST invalidate the old token and make a best effort to clean its staging. Commit MUST reuse the exact inspected/staged candidate and MUST NOT reopen the user-selected source path. Before durable commit it MUST revalidate the token, staging, package facts, current Host compatibility, and that the candidate identity is still absent and not quarantined.

#### Scenario: Frontend receives a prepared candidate

- **WHEN** Rust completes inspection and staging for a valid compatible first-install candidate
- **THEN** the TypeScript adapter validates and freezes the `prepared` contract version, operation, opaque token and bounded display projection from `unknown`
- **THEN** the result contains no path, digest, package bytes, staging fact, complete Manifest, grant, raw error or private Host object, and no Registration has been created

#### Scenario: Frontend commits the current preparation

- **WHEN** the trusted management service submits the one current token and Rust revalidation plus durable installation succeeds
- **THEN** the adapter returns a strict `installed` result with plugin ID, version and Registration revision
- **THEN** the Registration is created with the existing explicit Host facts and empty grant snapshot, and the token can never be committed again

#### Scenario: Frontend cancels a preparation

- **WHEN** the user cancels after `prepared` or the trusted service is destroyed before commit
- **THEN** Host invalidates the token, makes a best effort to clean only its owned staging, and returns a strict cancellation conclusion
- **THEN** no payload, Manager record, revision, event or grant is committed

#### Scenario: Preparation becomes invalid before commit

- **WHEN** the same plugin identity is installed or quarantined, the token is stale, staging changes, or package/compatibility revalidation fails before commit
- **THEN** commit fails closed with a stable safe error and invalidates the preparation
- **THEN** the competing/current Registration, filesystem evidence, grants, revision and event remain unchanged

#### Scenario: Frontend receives a malformed payload

- **WHEN** Tauri returns an unknown status, operation mismatch, unknown field, invalid token/candidate value, invalid error type, or malformed error
- **THEN** the adapter rejects the entire value and produces a stable boundary error
- **THEN** the UI does not publish partial preparation/success or display raw untrusted text

#### Scenario: Low-level error contains sensitive information

- **WHEN** a dialog, read, codec, filesystem, staging, cleanup or persistence error contains an absolute path, environment text, package content or raw exception
- **THEN** the Rust boundary maps it to a stable safe code, operation, and message
- **THEN** sensitive content does not enter the Tauri payload, log assertions, UI, or shared fixtures

### Requirement: The settings installation entry point must be accessible, localized, and theme-compatible

The Plugins settings section MUST use the existing application i18n and Semi Design theme to provide installation guidance, a clearly named accessible installation button, an explicit prepared-candidate confirmation, and asynchronous feedback. While prepare, confirm, commit, cancellation, Registration convergence, or composed post-commit permission work is pending, the UI MUST prevent incompatible reentry. Native picker cancellation MUST restore idle state without an error; cancelling a prepared candidate MUST invoke the typed cancel boundary and return focus to the installation entry point; success and failure MUST use live-status or alert semantics that do not rely only on color.

The confirmation MUST display bounded candidate name/version and compose the independently specified permission-prompt presentation before durable commit. It MUST allow installation with zero grants and MUST NOT treat the installation confirmation itself as permission authorization. All product text MUST have canonical English and a semantically aligned Simplified Chinese translation and MUST remain readable, scrollable and focusable in light and dark themes. When composed into `plugin-management-settings`, successful installation MUST converge through a current Registration snapshot, perform any separately confirmed grants only through the permission service, and select the newly installed plugin using current detail.

#### Scenario: User prepares installation with a keyboard

- **WHEN** a keyboard user focuses and activates the local installation button and selects a compatible package
- **THEN** the native file picker opens once, the button cannot be activated again while prepare is pending, and an accessible confirmation opens only after a strict `prepared` result
- **THEN** confirmation, cancellation and focus remain operable without a pointer and no durable Registration exists before explicit install confirmation

#### Scenario: User cancels prepared installation

- **WHEN** the user cancels or dismisses a prepared candidate before commit
- **THEN** the management service cancels the opaque preparation, clears transient permission choices, and announces cancellation without an error
- **THEN** focus returns to the installation entry point and no plugin or grant appears in current Registration state

#### Scenario: Installation succeeds in plugin management settings

- **WHEN** the adapter returns a valid `installed` result after explicit candidate confirmation
- **THEN** settings announces durable installation success with the plugin ID and version in the current locale
- **THEN** the management service refreshes through the shared Registration adapter, applies only separately confirmed grants through the independent permission service, and selects the matching current plugin only after snapshot/detail convergence
- **THEN** the installation capability itself does not fabricate details or perform enable, disable, replacement, uninstall, permission or data operations

#### Scenario: Installation or preparation fails

- **WHEN** the adapter returns a valid safe prepare/commit/cancel error or boundary validation fails
- **THEN** settings closes or preserves the interaction only as allowed by the typed result, displays localized actionable feedback, and allows a safe retry from a new preparation
- **THEN** the UI displays no source path, Host installation path, digest, staging fact, stack, package payload or raw error text

#### Scenario: Locale and theme change

- **WHEN** the installation entry point and prepared confirmation render in `en-US` or `zh-CN` with a light or dark theme
- **THEN** button, candidate facts, permission guidance, pending, cancellation, success, partial-permission and failure copy follow the application locale
- **THEN** controls use supported Semi theme and focus behavior and do not use hard-coded color as the only status signal

### Requirement: Local installation must not deliver later plugin capabilities early

This capability MUST deliver only preparation and first installation of a local compatible `.lxp`, its installation entry point, Registration notification, and recovery cleanup. It MUST NOT itself download a remote package, accept a development directory, upgrade, downgrade, reinstall, enable, disable, uninstall, delete or clear plugin data, grant permissions, verify signatures or official provenance, serve plugin resources, create an iframe or Runtime session, invoke the Host API, or execute plugin code. A trusted Host management page MAY compose this prepared installation entry point with independently specified lifecycle, replacement, permission-prompt, permission-mutation and data-management services, but MUST NOT broaden the installation command, pass a grant set into commit, or infer those authorities from preparation/installation success.

#### Scenario: A plugin finishes installation

- **WHEN** a local `.lxp` has been written and registered successfully
- **THEN** the existing Host metadata projection and management service can refresh from the current Registration and separately apply user-confirmed grants through the permission authority
- **THEN** this capability does not read the Runtime entry, load resources, create an iframe, execute code, grant requested permissions, or perform a later lifecycle operation

#### Scenario: User wants to replace, remove or change permissions for an installed plugin

- **WHEN** the user selects replacement, lifecycle or permission controls from the composed plugin management page
- **THEN** the replacement service, lifecycle service or permission service owns the operation through its independent typed and revision-bound contract
- **THEN** the local installation contract neither accepts the request nor gains update, uninstall, permission or data-management authority
