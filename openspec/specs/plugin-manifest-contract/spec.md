# Plugin Manifest Contract Specification

## Purpose

Define the accepted author-controlled external plugin Manifest protocol,
including strict structure, stable identity, localized metadata, package-local
resources, Page and Action contributions, compatibility
classification, deterministic normalization and diagnostics, and the boundary
between author data and Host-owned state.
## Requirements
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

### Requirement: Plugin identity and version must be stable and validatable

`plugin_id` MUST contain at least two dot-separated namespace segments. Each
segment MUST begin with an ASCII lowercase letter and MUST contain only ASCII
lowercase letters, digits, underscores, or hyphens. Each segment MUST NOT
exceed 64 characters, and the complete ID MUST NOT exceed 255 characters. The
plugin `version` MUST be valid SemVer. A published `plugin_id` MUST NOT be
reused for a plugin with different semantics, and the plugin version MUST NOT
become part of a Page or Action's stable identity.

#### Scenario: Accept a stable plugin identity

- **WHEN** a Manifest uses `com.acme.workspace` as its `plugin_id` and valid
  SemVer as its plugin version
- **THEN** the system accepts the plugin identity and version
- **THEN** later versions can continue to use the same `plugin_id`

#### Scenario: Reject an invalid plugin namespace

- **WHEN** `plugin_id` lacks namespace segments, contains an empty segment,
  begins a segment with an uppercase letter, contains an invalid character, or
  exceeds a length limit
- **THEN** the system rejects the Manifest
- **THEN** the diagnostic points to `/plugin_id`

#### Scenario: Reject an invalid plugin version

- **WHEN** `version` is not valid SemVer
- **THEN** the system rejects the Manifest
- **THEN** the diagnostic points to `/version`

### Requirement: Publisher metadata must be complete but must not establish trust

An external plugin Manifest's `publisher` MUST contain a non-empty `author`,
an absolute HTTPS `homepage`, and an absolute HTTPS `repository`. The URLs MUST
NOT contain a username or password. The system MUST treat Publisher metadata as
author-declared display metadata and MUST NOT determine author identity,
package provenance, signature status, or permission trust from these fields
alone.

#### Scenario: Accept complete Publisher metadata

- **WHEN** Publisher metadata provides a non-empty author name, HTTPS homepage,
  and HTTPS repository
- **THEN** the system accepts the Publisher structure
- **THEN** the normalized result preserves all three author declarations

#### Scenario: A Publisher field is missing

- **WHEN** Publisher metadata omits any of author, homepage, or repository
- **THEN** the system rejects the Manifest
- **THEN** the diagnostic points to the missing field

#### Scenario: Publisher metadata uses an unsafe URL

- **WHEN** the homepage or repository uses a relative URL, a non-HTTPS scheme,
  or contains credentials
- **THEN** the system rejects the Manifest
- **THEN** the Host does not expose the URL as a trusted navigation target

### Requirement: User-visible metadata must be localized with English fallback

The Plugin display name, Page title, Action title, and any description that is
present MUST provide a non-empty `en-US` value after
trimming. `zh-CN` MAY be absent and MUST fall back to `en-US` when absent.
Unknown locale fields in the first version MUST be rejected. A Plugin MUST NOT
declare `aliases` or `default_aliases`; Action search synonyms MUST be
expressed through locale-keyed `default_keywords`.

#### Scenario: Resolve text for the current locale

- **WHEN** a localized field provides both `en-US` and current `zh-CN` text
- **THEN** the consumer resolves the `zh-CN` text

#### Scenario: Current-locale text is absent

- **WHEN** a localized field provides only valid `en-US` text
- **THEN** the consumer falls back to `en-US` for a `zh-CN` request

#### Scenario: Canonical English text is absent

- **WHEN** a required localized field omits `en-US` or its value is empty after
  trimming
- **THEN** the system rejects the Manifest
- **THEN** the diagnostic points to the corresponding `/en-US` path

#### Scenario: A Plugin declares general aliases

- **WHEN** a Plugin display object or top-level object declares `aliases` or
  `default_aliases`
- **THEN** the system rejects the field as unknown
- **THEN** search synonyms do not spread to every Action contributed by the
  Plugin

### Requirement: Resource references must remain within the plugin package boundary

The runtime entry and icon asset paths MUST be package-relative paths separated
by forward slashes and MUST NOT begin with `/` or contain a backslash, an empty
segment, `.`, `..`, a URL scheme, a query, or a fragment. Pure Manifest
validation MUST validate path syntax. A future installation or loading
boundary MUST also verify file existence and ensure that resolved real paths
and symbolic links do not escape the plugin package.

#### Scenario: Accept package-local resource paths

- **WHEN** the WebView entry is `dist/plugin.html` and the icon path is
  `assets/icon.svg`
- **THEN** the system accepts the path syntax
- **THEN** the normalized result preserves the package-relative paths

#### Scenario: Reject parent traversal

- **WHEN** an entry or asset path contains a `..` segment
- **THEN** the system rejects the Manifest
- **THEN** the diagnostic points to the corresponding path field

#### Scenario: Reject an absolute or external resource

- **WHEN** an entry or asset path is absolute, is an external URL, uses
  backslashes, or contains a query or fragment
- **THEN** the system rejects the Manifest
- **THEN** the plugin cannot cross the package boundary through a static
  resource field

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

### Requirement: A plugin can contribute multiple Page-only Actions

`contributes.actions` MAY be absent or empty. Each Action MUST contain a local
`id` unique within the same plugin, a localized `title`, and a `target`. An
Action MAY contain a localized `description`, locale-keyed
`default_keywords`, and an asset icon. In the first version, `target.kind`
MUST allow only `page`, and `target.page_id` MUST reference a Page contributed
by the same plugin. An Action MUST NOT contain an executor, function, route,
URL, Command Target, or author-controlled `enabled` state.

#### Scenario: A plugin contributes multiple Actions

- **WHEN** a Manifest declares multiple unique Actions and each Action points
  to a declared Page
- **THEN** the system accepts every Action
- **THEN** each Action retains its independent title, description, keywords,
  and target

#### Scenario: A plugin contributes no Action

- **WHEN** `contributes.actions` is absent or an empty array but the Manifest
  contains at least one valid Page
- **THEN** the system still recognizes the Manifest as valid
- **THEN** the plugin does not automatically become a Launcher Action merely
  because it exists

#### Scenario: An Action targets a Page

- **WHEN** an Action target is `{ "kind": "page", "page_id": "home" }` and the
  `home` Page exists
- **THEN** the system accepts the target
- **THEN** the future Host can synthesize a controlled open-Page executor for
  the Action

#### Scenario: An Action uses an unsupported Target

- **WHEN** an Action target declares a Command, external URL, function, native
  operation, or other non-Page kind
- **THEN** the system rejects the Manifest
- **THEN** the plugin cannot inject an Action executor through the Manifest

#### Scenario: An Action references an unknown Page

- **WHEN** `target.page_id` is absent from the same plugin's Page collection
- **THEN** the system rejects the entire Manifest
- **THEN** the diagnostic points to the Action's Page reference

### Requirement: Action search keywords must be valid and belong to their Action

An Action's `default_keywords` MAY provide an array of strings for each locale.
Each keyword MUST be non-empty after trimming and MUST be unique within its
locale after locale-aware lowercasing. Keywords MUST remain on their owning
Action and MUST NOT become shared aliases for the Plugin or another Action
contributed by the same plugin.

#### Scenario: Accept localized Action keywords

- **WHEN** an Action provides non-empty, non-duplicated keywords for English
  and Simplified Chinese
- **THEN** the system preserves the keywords for each locale
- **THEN** the keywords are associated only with that Action

#### Scenario: Keywords are absent

- **WHEN** an Action omits `default_keywords`
- **THEN** the normalized result provides an empty keyword map for the Action
- **THEN** the Action can still participate in future search through its title

#### Scenario: A keyword is empty or duplicated

- **WHEN** a keyword is empty after trimming or two keywords in the same locale
  are equal after locale-aware lowercasing
- **THEN** the system rejects the Manifest
- **THEN** the diagnostic points to the specific keyword index

### Requirement: The Launcher default Action must reference a plugin-local Action

`contributes.launcher` MAY be absent. When present, it MUST contain
`default_action_id`, and that ID MUST reference an Action declared by the same
Manifest. The field only provides a future default candidate when the plugin
name matches. It MUST NOT make the Plugin itself an executable search result
and does not define a search ranking algorithm.

#### Scenario: Accept a default Action

- **WHEN** `default_action_id` points to an existing Action in the same plugin
- **THEN** the system preserves the reference
- **THEN** a future search capability can use that Action as the Plugin's
  default entry point

#### Scenario: The default Action does not exist

- **WHEN** `default_action_id` points to an unknown Action or the Action
  collection is empty
- **THEN** the system rejects the entire Manifest
- **THEN** the diagnostic points to the default Action reference

#### Scenario: Launcher configuration is absent

- **WHEN** a Manifest does not contain `contributes.launcher`
- **THEN** the system can still accept its Page and Action contributions
- **THEN** the system does not implicitly select any Action as the default entry
  point

### Requirement: Compatibility status must be separate from Manifest validity

The current LensX version MUST be `0.1.0` and the current Host API protocol
version MUST be `0.2.0`.
Their compatibility ranges MUST each contain valid SemVer
`min_version` and `max_version_exclusive` values, and the minimum version MUST
be strictly less than the exclusive maximum version. A dimension is compatible
when its current version satisfies
`min_version <= current_version < max_version_exclusive`. A structurally and
semantically valid Manifest for which either current version is outside its
range MUST return `incompatible` status rather than `invalid`. Compatibility
MUST depend only on the declared ranges and current LensX `0.1.0` and Host API
`0.2.0` baselines; the system MUST NOT recognize or convert an earlier
experimental Host API version.

#### Scenario: Initial current versions are within both ranges

- **WHEN** the current LensX `0.1.0` and Host API `0.2.0` versions are each
  within their declared half-open ranges
- **THEN** the system classifies the valid Manifest as `compatible`

#### Scenario: A current version is outside its range

- **WHEN** the current LensX `0.1.0` or Host API `0.2.0` is outside its
  declared half-open range
- **THEN** the system classifies the valid Manifest as `incompatible`
- **THEN** the system does not use an alias or migration rule to satisfy the
  range

#### Scenario: A current version equals its exclusive upper bound

- **WHEN** the current LensX or Host API version equals its corresponding
  `max_version_exclusive`
- **THEN** the system classifies the valid Manifest as `incompatible`
- **THEN** the system does not misreport the Manifest as structurally corrupt

#### Scenario: A compatibility range is empty or inverted

- **WHEN** either range satisfies
  `min_version >= max_version_exclusive`
- **THEN** the system classifies the Manifest as `invalid`
- **THEN** the diagnostic points to the invalid compatibility range

### Requirement: Normalization and diagnostics must be deterministic and cross-language consistent

The system MUST normalize absent `contributes.actions` and Action
`default_keywords` to empty collections while preserving the non-empty
constraint for required `contributes.pages`. Legacy `requested_permissions`
and Page `required_permissions` MUST be rejected rather than normalized. Public diagnostics MUST use a
stable `{code, path, message}` structure, and `path` MUST be a JSON Pointer.
Diagnostics that can be aggregated safely MUST be returned together and sorted
by `path` and then by `code`. The Schema, TypeScript, and Rust MUST maintain the
same classification, normalized values, and diagnostic codes and paths for
shared valid, invalid, normalized, and incompatible fixtures.

#### Scenario: Normalize absent collections

- **WHEN** a valid Manifest omits collections that may be absent
- **THEN** TypeScript and Rust return normalized Manifests containing the same
  empty collections
- **THEN** the original author input is not modified in place

#### Scenario: One Manifest contains multiple errors

- **WHEN** input contains multiple structural or semantic errors that can be
  aggregated safely
- **THEN** validation returns every safely aggregatable diagnostic
- **THEN** diagnostics are deterministically sorted by JSON Pointer path and
  stable code

#### Scenario: TypeScript and Rust validate the same fixture

- **WHEN** both validators read the same shared fixture and the same current
  LensX and Host API versions
- **THEN** both validators return the same valid/invalid and
  compatible/incompatible classifications
- **THEN** normalized results and diagnostic codes and paths are identical

### Requirement: Author Manifests, normalized Manifests, and Host registration state must be layered

The system MUST model raw author input, a validated normalized Manifest, and
future Host registration state as distinct boundaries. A normalized Manifest
MUST contain only author-declarable contract data and deterministic defaults.
Host-owned source, lifecycle, enabled state, installation information,
compatibility results, Runtime state, signature facts,
and update information MUST be composed separately by the trusted Host and
MUST NOT be written back or presented as author declarations.

#### Scenario: Read a normalized Manifest

- **WHEN** a caller reads a validated normalized Manifest
- **THEN** the result contains only author contract data and normalized
  defaults
- **THEN** the result contains no implication that the plugin is installed,
  enabled, or authorized

#### Scenario: The Host registers a plugin

- **WHEN** the Host registers a normalized Manifest
- **THEN** the Host injects source, lifecycle, compatibility, and Runtime facts
  from the trusted installation and runtime environment
- **THEN** author input cannot override those fields

#### Scenario: Only this change is complete

- **WHEN** the Manifest contract, validators, and shared fixtures are complete
- **THEN** the current App Shell does not automatically discover, load,
  display, or execute any external plugin
- **THEN** the current Launcher Action Registry does not automatically contain
  plugin Actions

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
