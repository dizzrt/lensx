## MODIFIED Requirements

### Requirement: Plugin author Manifests must be strict and versioned inputs

Plugin author Manifests MUST be strict, versioned, JSON Schema-driven inputs, with current version `0.4.0`. The Schema MUST reject unknown fields, including legacy `requested_permissions`, Page `required_permissions`, Host source, grants, trust, signatures, lifecycle, sandbox, CSP, Host bridge configuration, and native Window configuration outside the bounded Page presentation contract. Manifest, Host API, package protocol, and application versions MUST evolve independently.

The Manifest MUST contain `plugin_id`, `version`, `display`, `publisher`, `compatibility`, `runtime`, and `contributes` at the top level. Every explicit `null` MUST be rejected. The system MUST NOT accept another Manifest protocol through a compatibility alias, fallback Schema, or implicit migration path.

#### Scenario: Accept current Manifest
- **WHEN** author input declares `manifest_version: "0.4.0"` and satisfies the current strict Schema
- **THEN** the Contract validates and normalizes the input without creating permission or Host authority
- **THEN** absent optional ordinary collections and Page presentation normalize to their current deterministic defaults

#### Scenario: Legacy Manifest requests permissions
- **WHEN** author input declares an older Manifest protocol, `requested_permissions`, or Page `required_permissions`
- **THEN** the current Contract classifies it as an unsupported version or unknown field
- **THEN** the Host does not silently ignore, migrate, or interpret the legacy declaration as open Web or native authority

#### Scenario: Author attempts to declare Host Web policy
- **WHEN** a Manifest declares CSP, sandbox, network allowlist, Worker policy, Tauri bridge, Host command, or native Window option outside bounded Page presentation
- **THEN** the Schema rejects the unknown field
- **THEN** the current Runtime Contract continues to define open Web behavior and Host isolation

#### Scenario: Reject unsupported Manifest protocol version
- **WHEN** author input contains any `manifest_version` other than `0.4.0`
- **THEN** the system rejects the Manifest with a diagnostic at `/manifest_version`
- **THEN** the system does not translate or retry the input through another protocol contract

#### Scenario: Reject unknown field
- **WHEN** author input contains a field not declared by the Schema in any strict object
- **THEN** the system rejects the Manifest
- **THEN** the diagnostic points to the JSON Pointer for the unknown field

#### Scenario: Reject explicit null value
- **WHEN** an author explicitly sets a required or optional field to `null`
- **THEN** the system rejects the Manifest
- **THEN** the system does not treat `null` as an absent field or default empty collection

#### Scenario: Reject author-declared Host state
- **WHEN** an author Manifest contains `source`, `lifecycle`, `enabled`, `granted_permissions`, persisted user size, or other Host-owned state
- **THEN** the system rejects the corresponding field as unknown
- **THEN** the author cannot obtain trusted state or Host authority through the Manifest

### Requirement: Page contributions must form a valid plugin-local navigation graph

Every external plugin MUST contribute at least one Page. Each Page MUST contain a unique local `id`, localized `title`, and plugin-internal `route`, MAY contain `parent_page_id`, an asset icon, and one bounded `presentation`, and MUST NOT contain `required_permissions` or another grant gate. Local IDs, routes, parent references, the acyclic graph, and presentation values MUST continue to satisfy the current plugin-local rules.

A local ID MUST be one segment that satisfies Launcher Action local-segment character and length rules. A route MUST begin with exactly one `/` and MUST NOT be an external URL or contain a backslash, parent traversal, query, or fragment. A parent Page reference MUST point to a different Page in the same plugin, and the Page parent graph MUST be acyclic. If present, `presentation` MUST contain exactly integer logical `initial_size.width` in `320..=4096`, integer logical `initial_size.height` in `180..=4096`, and boolean `resizable`; if absent, it MUST normalize to `650×600` and `resizable: false`.

#### Scenario: Accept multiple permissionless Pages
- **WHEN** a Manifest declares `home` and `settings` Pages, makes `home` the parent of `settings`, and gives them different valid presentations
- **THEN** the system accepts the collection, parent relationship, and independent Page presentation values
- **THEN** availability and presentation of each Page do not depend on a lensX permission request or grant

#### Scenario: Page declares legacy permission gate
- **WHEN** a Page contains `required_permissions`
- **THEN** the system rejects the field as unknown
- **THEN** the Page cannot become superficially present while controlled by a removed grant

#### Scenario: Page graph is invalid
- **WHEN** Pages are missing, an ID is duplicated, a route is external, a parent is absent, or the parent graph is cyclic
- **THEN** the system rejects the entire Manifest with a stable JSON Pointer diagnostic
- **THEN** presentation support does not relax Page identity or internal navigation rules

#### Scenario: No Page is contributed
- **WHEN** `contributes.pages` is absent or an empty array
- **THEN** the system rejects the current external plugin Manifest
- **THEN** a plugin with no reachable UI surface does not enter a later Runtime flow

#### Scenario: Page ID is duplicated
- **WHEN** two Pages in the same plugin use the same local ID
- **THEN** the system rejects the entire Manifest
- **THEN** the diagnostic points to the duplicated Page ID

#### Scenario: Page parent is absent or cyclic
- **WHEN** `parent_page_id` points to an unknown Page, points to the Page itself, or multiple Pages form a parent cycle
- **THEN** the system rejects the entire Manifest
- **THEN** the diagnostic identifies the invalid parent reference or cycle member

#### Scenario: Page route is not internal
- **WHEN** a Page route does not begin with exactly one `/` or contains an external URL, backslash, parent traversal, query, or fragment
- **THEN** the system rejects the Manifest
- **THEN** an Action cannot use the Page route to open an arbitrary external target

#### Scenario: Page presentation is absent
- **WHEN** a valid Page contains no `presentation`
- **THEN** TypeScript and Rust normalize it to `650×600` logical initial size and `resizable: false`
- **THEN** normalized output contains no position, monitor, constraint, native handle, or Runtime setter

#### Scenario: Page presentation is invalid
- **WHEN** a presentation contains a missing, null, non-integer, out-of-bounds, unknown, or native Window field
- **THEN** the system rejects the whole Manifest with a stable diagnostic at the exact Page presentation JSON Pointer
- **THEN** no partial/default presentation is substituted for that invalid author input

### Requirement: External Runtime authoring MUST use the WebView protocol exclusively
Manifest Contract `0.4.0` MUST accept exactly `runtime.kind: "webview"` for an external Page Runtime and MUST keep `runtime.entry` as a safe package-relative HTML reference. It MUST reject `runtime.kind: "iframe"`, Manifest `0.3.x` or older, unknown Runtime kinds, native labels, bridge configuration, WebView options and permissions. Bounded Page presentation MUST remain declarative Host input and MUST NOT become Runtime configuration. Validation MUST remain deterministic across TypeScript and Rust.

#### Scenario: A current WebView Manifest is normalized
- **WHEN** an author Manifest declares protocol `0.4.0`, `runtime.kind: "webview"` and a valid package-relative entry
- **THEN** Contract and Host normalize the same bounded Runtime and Page presentation descriptors
- **THEN** the Runtime descriptor contains no Child WebView, Tauri, bridge, origin or native configuration

#### Scenario: An older or iframe Manifest is inspected
- **WHEN** an author Manifest uses protocol `0.3.x` or older or declares `runtime.kind: "iframe"`
- **THEN** validation returns the stable incompatible-protocol diagnostic
- **THEN** no alias, rewrite or fallback Runtime is created

