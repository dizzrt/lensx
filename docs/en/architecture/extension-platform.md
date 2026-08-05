# Extension Platform

## Document Status

This document separates the shipped static plugin Manifest contract, `.lxp`
package inspection and local installation, Plugin SDK foundation, Plugin
Testkit, optional Plugin UI package, Host-private Plugin surface projection and
Page navigation, Host-private lifecycle controls, local package replacement,
the Host-private scoped resource service, isolated iframe Runtime, and
process-local Runtime Session from the intended runtime
extension boundary. Public packaging CLI,
distribution, complete plugin execution lifecycle, complete permission decisions, iframe
transport, signing, the Host API, complete plugin-management UI, remote
updates, and user-initiated rollback history are not currently implemented.
Stable specs and source code define the shipped subset.

## Goals

The extension platform should let lensX expose local workflows without giving
untrusted code access to privileged application internals. It should provide:

- searchable launcher actions;
- pages opened through explicit actions;
- declared permissions;
- localized names and search aliases;
- versioned compatibility boundaries;
- predictable lifecycle and diagnostics.

## Conceptual Model

```text
Plugin
├── metadata and compatibility
├── pages
├── actions ───────────────▶ target pages
├── permissions
└── runtime
    ├── trusted Host module
    └── isolated external iframe
```

Ownership and references must be explicit. IDs used across plugins, pages,
actions, permissions, and other referenceable resources must be globally
unambiguous.

## Contract Layers

The platform separates:

1. author-controlled manifest input;
2. validated and normalized plugin metadata;
3. trusted Host registration metadata;
4. the runtime context exposed to an active plugin.

Plugin authors must not be able to declare trusted facts such as installation
source, granted permissions, or Host-owned lifecycle policy. The Host adds those
facts after validation.

Serialized contracts should have one versioned schema source and should be
validated consistently in TypeScript and Rust. Validation errors exposed across
boundaries must have stable machine-readable codes and locations.

## Shipped Public Contract And Static Manifest

lensX ships the publishable `@lensx/plugin-contract@0.1.0` workspace package.
Its root export provides `PLUGIN_MANIFEST_VERSION`,
`PLUGIN_HOST_API_VERSION`, generated author-input types, normalized types,
stable diagnostics, `validatePluginManifest`, `normalizePluginManifest`, and
the localized-text resolver. The only additional public entries are
`@lensx/plugin-contract/schema` and
`@lensx/plugin-contract/manifest.schema.json`; undeclared deep imports are not
supported.

The package owns the author-controlled `manifest_version: "0.1.0"` protocol as
a strict Draft 2020-12 JSON Schema. The Schema is the structural source of
truth for the wire format. The committed `PluginManifestInput` type is
generated deterministically from it. The package TypeScript implementation and
the explicit Rust model read the same package-owned valid, invalid, normalized,
and incompatible fixtures so validity, compatibility, normalized output, and
diagnostic `code`/`path` behavior stay aligned.

The complete project-owned example is
[examples/plugin-contract-consumer/manifest.json](../../../examples/plugin-contract-consumer/manifest.json).

### Field Model

| Field | Contract |
| --- | --- |
| `manifest_version` | Required and exactly `0.1.0`. |
| `plugin_id` and `version` | Required stable namespaced plugin ID and SemVer release version. |
| `display` | Required localized `name`; optional localized `description` and package-local asset `icon`. |
| `publisher` | Required author-declared `author`, HTTPS `homepage`, and HTTPS `repository`; none establish trust. |
| `compatibility` | Required half-open SemVer ranges for both `lensx` and `host_api`. |
| `runtime` | Required `kind: "iframe"` and package-local HTML `entry`; this is metadata and does not create an iframe. |
| `requested_permissions` | Optional unique permission requests with localized reasons; requests are not grants. |
| `contributes.pages` | One or more uniquely identified pages with localized titles, internal routes, optional parent/icon, and requested-permission dependencies. |
| `contributes.actions` | Optional unique actions with localized title/description, action-owned `default_keywords`, optional icon, and a Page-only target. |
| `contributes.launcher` | Optional `default_action_id` referencing one contributed action; it does not implement ranking or registration. |

User-visible localized text requires a non-empty `en-US` value after trimming
and may provide `zh-CN`; consumers fall back to English. Unknown locale keys and
unknown fields are rejected. Missing optional collections normalize to empty
collections, while explicit `null` remains invalid.

Page and Action IDs are plugin-local. The Host-private Plugin Action projection
derives the global Action ID as `<plugin_id>.<local_action_id>`; the public
validator itself does not perform that projection. Page parent references must exist and form an
acyclic graph. Every Action target must be
`{ "kind": "page", "page_id": "<local-page-id>" }`. Action keywords remain
owned by that Action and never become plugin-wide aliases. Page permission
dependencies must be a subset of top-level requests.

### Validation, Normalization, And Compatibility

`validatePluginManifest(unknown)` performs strict Schema and semantic checks
and returns either deterministic invalid diagnostics or an opaque successful
validation result. Only that successful result can be passed to
`normalizePluginManifest(result, currentVersions)`, which applies deterministic
trimming/defaults and returns `compatible` or `incompatible`. Neither function
mutates author input. Public diagnostics are serializable
`{code, path, message}` objects, use JSON Pointer paths, and are sorted by
`path` and then `code`.

Plugin version and compatibility bounds use SemVer, including prerelease
precedence. Each current version is compatible when
`min_version <= current < max_version_exclusive`. A structurally and
semantically valid Manifest outside either range is `incompatible`, not
`invalid`.

The normalized Manifest contains only author-declared data and deterministic
defaults. It cannot contain executors, functions, React or Tauri values, Rust
implementation objects, or Host-owned fields such as `source`, `lifecycle`,
`enabled`, installed paths, granted permissions, signature status, or runtime
status. Publisher metadata is unverified author input and must never be used
alone to grant trust or permission.

The Contract package version, Manifest protocol, Host API protocol, and lensX
application version all begin at `0.1.0` but evolve independently. Package
implementation fixes do not change a wire protocol; breaking Manifest or Host
API changes update their own version dimension. The current contract provides
no earlier Schema, deprecated symbol alias, compatibility adapter, or
migration branch.

Run `pnpm run generate:plugin-manifest-types` to regenerate the committed input
type and `pnpm run check:plugin-contract` for the complete drift gate. The gate
checks generated types, package tests, Host boundaries, shared Rust fixtures,
and a real tarball installed into an isolated external consumer. The tarball
contains runtime JavaScript, declarations, the two Schema entries, and package
metadata; it excludes tests, fixtures, generation scripts, and Host private
source.

### Capabilities Outside Static Validation

Static validation alone does not discover or install packages, create a
production registration or iframe, grant permissions, exchange Host API
messages, or run plugin code. The Host-private capabilities described below add
one selected compatible `.lxp` as an external registration, project current
Registration facts into Page and Action Registries, and create the isolated
iframe only while an eligible Plugin Page is active. Runtime Sessions, Host API
messages, and permission decisions are separate capabilities; the Host-private
process-local Runtime Session described below is now shipped.

## Shipped Host-Private Plugin Package Inspection

lensX now implements package protocol `0.1.0`: a `.lxp` is one restricted
Zstandard frame containing a canonical ustar-compatible TAR stream. The
workspace-private TypeScript reference packer/inspector and Host-private Rust
inspector share committed valid, invalid, incompatible, and reproducible
fixtures. They agree on status, normalized Manifest, compatibility, bounded
file facts, safe diagnostics, and the SHA-256 digest of the complete `.lxp`.

The inspector verifies the single-frame Zstandard profile, canonical TAR
ordering and metadata, portable paths, hard resource limits, canonical
`checksums.json`, every file SHA-256, the existing Manifest Contract, and exact
Runtime/asset resource resolution. Invalid results fail closed without partial
Manifest, file map, trusted digest fact, raw error, absolute path, or Host
state. Publisher text and author-declared Host fields never create source,
signature, grant, lifecycle, or trust conclusions.

This is an inspection core, not an installer or plugin-facing API. It has no
Tauri command, Plugin Manager mutation, installation directory write, public
CLI, development-directory input, resource service, iframe, Runtime session,
permission decision, or signing behavior. See
[Plugin Package Format](plugin-package-format.md) for the exact layout, limits,
dependency review, diagnostics, and drift gate.

## Shipped Host-Private Plugin Manager

The Rust Host now ships one Plugin Manager instance initialized during Tauri
setup from `app_config_dir` and shared through Tauri managed state. It remains a
Host-private core. Its read projection is the private Registration Contract,
and its current production write callers are the local installation and
Host-private lifecycle coordinators described below. No general plugin-facing
lifecycle API, frontend management surface, or plugin execution path is
exposed.

Each healthy entry keeps four lifetimes separate:

- the validated normalized Manifest contains only author-controlled data and
  deterministic defaults;
- persisted Host registration facts contain the installation path, an
  algorithm-labelled package digest supplied by the Host, Host-controlled
  source, enabled intent, a sorted unique grant snapshot, and at most the 32
  most recent canonical safe diagnostics;
- compatibility is recomputed from the Manifest ranges and current lensX and
  Host API versions whenever a record is constructed or recovered;
- Runtime state is process-local and always recovers as `inactive` in this
  foundation.

The grant snapshot defaults to empty. Requested permissions never become
grants automatically. Host-controlled source, author-declared publisher data,
requested permissions, and an official provenance claim are storage or display
facts only; none establishes trust, grants a permission, or creates a lifecycle
exemption.

The dedicated Plugin Manager Store uses one version-1 JSON record per plugin.
A deterministic hex-encoded record key forms the safe filename. A transition
validates its complete next record, writes a unique same-directory temporary
file, flushes it, and atomically replaces only that plugin's target record.
The Manager publishes the new in-memory snapshot only after persistence
succeeds. Create, write, flush, or replace failure leaves the previous memory
and disk state intact, and incomplete temporary files are ignored on recovery.

Startup reads records independently. A syntactically damaged record, unknown
format version, record-key/Manifest identity mismatch, or inconsistent
registration becomes an in-memory quarantine stub with a stable safe recovery
diagnostic. The original file remains untouched and other healthy records keep
loading. If the Store directory as a whole cannot be read, the Manager starts
with an empty healthy set plus a manager-level degraded recovery report; Tauri
startup still completes and the unreadable data is not overwritten. Clearing a
quarantine requires a trusted Host caller to atomically replace it with a
complete valid record whose enabled intent is supplied explicitly.

This internal state records that the Host knows an installed registration. The
local installer can establish the package digest, payload, and first external
registration for one selected compatible package. The lifecycle coordinator
can atomically update enabled intent or remove one healthy or quarantined entry
through a revision-bound opaque identity. Manager records alone still do not
prove discovery provenance. Updates, permission decisions, Runtime sessions,
and a public plugin-facing registration API remain separate capabilities.

## Shipped Host-Private Plugin Installation From a Local File

The Plugins settings tab exposes one Host-owned **Install from file** action.
“Local” describes this installation source, not a distinct kind of plugin.
Its pathless `install_local_plugin` command opens the native file picker for one
`.lxp`; cancellation returns an ordinary cancelled result. The frontend sees
only strict installation contract `0.1.0` success, cancellation, or bounded
error values. It never supplies or receives the selected source path, package
digest, installation path, Store key, raw native error, or internal recovery
fact.

The Rust coordinator reads the selected regular file once into a capped
immutable byte buffer after checking source metadata, then checks that the file
did not grow, truncate, or change during the read. Only a `compatible`
inspection may proceed. Inspection and extraction reuse the same canonical
Zstandard/TAR traversal and limits. Extraction writes regular files with
`create_new` into a new Host-owned staging directory, verifies the entry facts
and checksums again, flushes files and directories, and never invokes a general
archive unpack operation.

Installer state lives under `app_local_data_dir()/plugins`, independently of
the Manager Store. One process mutex and the cross-process `.install.lock`
serialize recovery, installation, and lifecycle cleanup. Staging uses
`.staging/<random-id>`, a committed payload uses
`packages/<v1-plugin-id-utf8-lowercase-hex>/<package-sha256>`, on-demand plugin
data uses `data/<v1-plugin-id-utf8-lowercase-hex>`, and durable cleanup intent
uses `.cleanup/<v1-plugin-id-utf8-lowercase-hex>.json`. First installation does
not create a plugin data directory. This is a single-active-registration digest
layout. First installation still rejects an existing healthy or quarantined
identity; the separate replacement workflow below may commit a different
compatible digest for the same healthy identity without changing this
installation command's semantics.

After the flushed staging directory is atomically renamed on the same
filesystem, the coordinator registers the normalized Manifest with a complete
Host fact set: the committed absolute path, algorithm-labelled digest,
`source=external`, `enabled=true`, empty grants, and an `inactive` Runtime.
Existing healthy registrations and quarantined identities fail closed before
commit. Manager persistence failure rolls the payload back or leaves a
provable orphan for recovery; a changed-event emission failure does not undo a
successfully persisted and published registration.

Startup installer recovery runs only after Plugin Manager recovery and under
the same shared commit boundary. It resumes cleanup records before orphan
recovery, removes valid abandoned staging directories, and removes only
canonical digest payloads that are provably unowned. A cleanup record persists
before Manager removal and records whether plugin data must be retained or
deleted; retries are idempotent, and completed evidence is cleared only after a
same-identity reinstall commits successfully. Recovery preserves conflicting
or malformed cleanup evidence, healthy installation paths, quarantine-key
subtrees without a valid cleanup intent, unknown entries, symlinks, and
anything outside the installer root. Unreadable or inconsistent evidence makes
the installer unavailable or degraded rather than inviting speculative cleanup.

The installer root is application-local data. On macOS it is separate from the
signed `lensX.app` bundle and normally resides in the application's Application
Support area; directly deleting `lensX.app` does not guarantee that this data
is removed. Host-private plugin uninstall and local replacement are shipped
below. A dedicated application uninstaller, remote update policy, and
user-initiated rollback history require later accepted changes.

## Shipped Host-Private Registration Contract

The Host now projects the managed Plugin Manager through Registration Contract
version `0.1.0`. This contract is private to Rust, Tauri, and the root
application TypeScript. It is not exported by `@lensx/plugin-contract`,
`@lensx/plugin-sdk`, or another plugin package, and workspace boundaries reject
official and example plugins that import its types, desktop adapter, or event
entry point.

The boundary keeps four layers distinct: author input, normalized Manifest,
Host-owned registration summary/detail, and process-local Runtime status.
`read_plugin_registration_snapshot` returns a deterministic list of strict
`registered | quarantined` summaries plus `available | degraded` Manager
availability. `read_plugin_registration_detail` accepts only an opaque entry
identity and returns a revision-bound registered or quarantine detail. Healthy
details contain the normalized Manifest, `builtin | external` source, enabled
intent, per-dimension compatibility, sorted unique grants, bounded safe
diagnostics, and only the current `inactive` Runtime variant. Quarantine details
contain only the opaque identity, an optional verified plugin ID, and one safe
diagnostic.

Every snapshot, detail response, and `plugin-registration://snapshot-changed`
event carries the independent Registration Contract version. Revisions are
monotonic decimal strings within the current process only; restart recovery
begins from a new revision sequence without changing the persisted Store
format. A real state transition increments revision only after its complete
record is persisted and the next in-memory state is published. Rejected,
failed, and no-op transitions do not create a revision or event. Changed events
carry only contract version and revision and act as invalidation hints, not
patches or history.

The private TypeScript adapter subscribes before its first full read, validates
all command and event values from `unknown`, deep-freezes accepted payloads,
coalesces concurrent notifications into serial refreshes, and invalidates its
snapshot and detail caches on revision changes. It performs a complete refresh
after listener recovery and Launcher activation, and re-reads when a detail and
snapshot revision differ. Stable query errors expose only `code`, `operation`,
and a safe English message.

The contract never exposes installation paths, package digests, Store keys or
filenames, damaged record contents, raw exceptions, stacks, functions, or Tauri
objects. Publisher, source, enabled intent, requested permissions, and an empty
or non-empty grant snapshot remain independent facts; none establishes trust
or automatic authorization. The Registration Contract itself remains read-only:
it does not install, update, uninstall, enable, disable, execute, or render
plugins. The downstream Host-private lifecycle and Action projection cores
consume it without changing that wire contract. Management UI, real Runtime
sessions, complete permission decisions, signatures, and Host API methods
remain unimplemented.

## Shipped Host-Private Plugin Lifecycle Controls

The root application ships Plugin Lifecycle Contract version `0.1.0` for
enable, disable, and uninstall operations. The contract remains private to
Rust, Tauri, and root application TypeScript; it is not exported by any public
plugin package. Requests accept only an opaque registration entry identity and
the exact snapshot revision observed by the caller. Unknown fields, stale
revisions, unmanaged entries, unavailable Manager state, and unsupported or
unsafe cleanup targets fail closed with bounded codes and messages that expose
no paths, record keys, damaged data, raw exceptions, or stacks.

Enable and disable update Host-owned enabled intent atomically without changing
source, grants, compatibility facts, or Runtime state. Compatible and
incompatible healthy registrations may preserve enabled intent independently
of effective availability; quarantine entries cannot be enabled. A real change
increments the Registration revision and emits the existing snapshot-changed
invalidation hint, while a no-op preserves the revision. Event emission failure
does not roll back persisted state.

Before disable or uninstall reaches Rust, the TypeScript lifecycle service
quiesces the provider's Action surface and then its Page surface. If either step
fails, no Rust command runs and the previous surface is restored in Page-then-
Action order. Closing an active plugin Page returns navigation to Home before
Page unregistration. If a Rust command fails, the same restoration is attempted;
after a successful command, the service actively refreshes through the shared
Registration adapter until the returned revision is observed. This makes event
loss a recoverable invalidation gap rather than a source of stale search,
Recent, Pinned, dispatch, or navigation state. Enable commits in Rust first and
then converges the provider surface from the returned revision.

Uninstall requires an explicit `retain_data` or `delete_data` policy. The Host
proves that program and optional data subtrees are canonical, real descendants
of their dedicated roots before persisting cleanup intent. It then removes the
Manager entry atomically and performs idempotent program/data cleanup. A cleanup
failure after logical removal returns success with `cleanup_pending=true` and
is resumed by a repeated operation or startup recovery under the same process
and cross-process commit boundary. Malformed, conflicting, symlinked, or
out-of-root evidence is preserved and blocks destructive cleanup.

Run `pnpm run check:plugin-lifecycle-controls` for the dedicated Rust,
TypeScript, surface-convergence, workspace-boundary, and packed-public-package
gate. These controls intentionally add no management UI, plugin Runtime,
permission decision workflow, public lifecycle API, application uninstall, or
replacement behavior; replacement is the separate private capability below.

## Shipped Host-Private Local Plugin Replacement

The root application now has an independent private Plugin Replacement
Contract `0.1.0`. Its pathless prepare command accepts only the current healthy
entry identity and observed Registration revision, opens one native `.lxp`
picker, and returns `cancelled`, `duplicate`, or a bounded `prepared` result.
Prepared results contain an opaque process-local token, from/to versions, an
`upgrade | downgrade | reinstall` classification, and sorted added/removed
permission IDs. They never contain the source or staging path, package digest,
Store key, package bytes, or a native error. The commit and cancel commands
accept only that token and its original entry/revision binding. The Contract,
desktop adapter, token, and service remain unavailable to public packages and
plugin code.

Prepare reuses the immutable capped source read, package inspection,
compatibility policy, and restricted extraction used by first installation.
An identical complete package digest is `duplicate` and creates no token.
Otherwise SemVer ordering classifies the explicit local choice but never blocks
a compatible downgrade or same-version reinstall. A mismatched plugin ID,
quarantine entry, noncanonical current path/digest, stale revision, or changed
staging evidence fails closed. At most one preparation exists in a Host process;
cancel, failed commit, service destruction, and startup recovery remove its
staging, and tokens do not survive restart.

Commit shares the installation/lifecycle process mutex and `.install.lock`. It
re-reads Manager and canonical filesystem facts, re-inspects the immutable
bytes, verifies every staged file, atomically renames the candidate to a sibling
digest directory, flushes that directory, and asks the Manager for one
revision-bound complete record replacement. The version-1 Manager record's
Manifest, installation path, and digest remain the only active pointer; there
is no second pointer, `previous` record, version history, or rollback catalog.
Manager persistence and in-memory publication are the durable commit point.

The next registration preserves source, enabled intent, bounded diagnostics,
and the independent plugin-data subtree; recomputes compatibility; and resets
Runtime to `inactive`. Grants become exactly the intersection of the old grants
and the candidate's requested permission IDs, so new requests are never granted
automatically and removed requests cannot retain grants. Before the Rust commit,
the trusted TypeScript service withdraws Action then Page surfaces. A pre-commit
failure restores the original Page then Action projection. After commit it
refreshes and waits for the committed revision in Page-then-Action order; a
convergence failure reports the committed revision and leaves surfaces fail
closed rather than rolling back durable state.

After the Manager commit, the old canonical payload is deleted without
following links. A deletion or changed-event failure cannot roll back the new
record: the result remains `committed` with cleanup `pending`, and a later
trusted operation or startup recovery retries only canonical non-active
siblings. Unsafe names, symlinks, root escapes, and healthy/quarantine ownership
conflicts are preserved as evidence and block unsafe writes. This capability
does not provide remote or automatic updates, user-initiated rollback,
multi-version retention, Runtime health rollback, data migration, a permission
or management UI, signature verification, or quarantine repair.

Run `pnpm run check:plugin-upgrade-and-rollback` for the private contract,
adapter/service, boundary, package/registration/lifecycle regression, packed
public-package, and focused Rust gate. The command never publishes packages or
rewrites fixture baselines.

## Shipped Host-Private Plugin Resource Service

The Rust Host registers one asynchronous `lensx-plugin` custom protocol and
manages one `PluginResourceService` beside the existing Plugin Manager and
Installer. Independent Resource Contract `0.1.0` exposes only
`resolve_plugin_resource_entry` to the trusted root application. Its exact
request is `{ contract_version, entry_id, expected_revision }`; success contains
only the current entry ID, revision, plugin ID, version, and opaque `entry_url`.
Paths, digests, record keys, installation roots, separate scope fields, Manager
objects, and raw native errors never cross this boundary. The TypeScript parser
and desktop adapter validate `unknown`, deep-freeze results, do not cache across
revisions, and remain unavailable to Manifest code, public packages, and
plugins.

The Manager owns a process-local `resource_generation` for each healthy entry.
It is absent from Store version 1, Registration snapshot/detail, and changed
events. Register, committed enable/disable, replacement, removal, and later
re-registration change only the target generation; idempotent no-ops,
diagnostics, failed transitions, and unrelated plugin revisions preserve it.
The scope map is never persisted, so restart invalidates every old URL.

Resolution requires a healthy, enabled plugin compatible with lensX and the
Host API. Source and Publisher text are not authorization. The service reuses
the Installer ownership proof for the exact
`packages/<plugin-key>/<sha256>` active pointer, matching record identity and
digest, a canonical real payload tree, and a regular non-link Runtime entry.
Each `(entry_id, resource_generation)` receives at most one 128-bit OS-CSPRNG
scope. Repeated resolution is idempotent. Disable/re-enable, replacement,
logical uninstall, incompatible or quarantine state, and restart permanently
invalidate prior scopes; unrelated global revision changes do not.

Every request rechecks the scope and current Manager facts. URL plugin key and
version fields are derived cross-checks, not authority. The native URL is
`lensx-plugin://<scope>.runtime.localhost/v1/<scope>/<plugin-key>/<version>/<path>`;
the supported translated shape is
`http(s)://lensx-plugin.<scope>.runtime.localhost/...`. Both preserve the same
32-character lowercase hexadecimal scope in the authority and path. Shared
hosts, lost translation keys, or authority/path mismatches fail before scope
lookup. Package-relative paths use the portable package grammar and reject
absolute or root-relative forms,
empty or dot segments, backslashes, percent encoding, NUL, query, excessive
length/depth, metadata records, directories, unknown files, and cross-payload
targets. Rust checks each component for links/reparse points, proves canonical
containment, opens one regular file, rechecks opened identity and size, and
performs one complete bounded read capped at 64 MiB. Validation/open/read races
return one consistent file or a complete safe failure. The service neither
lists directories nor rewrites HTML, so plugin HTML, CSS, and JavaScript must
use package-relative URLs.

Only `GET` and `HEAD` are supported. A fixed case-insensitive table covers
HTML, JavaScript/ES modules, CSS, JSON, Wasm, PNG, JPEG, GIF, WebP, AVIF, SVG,
ICO, and WOFF2; there is no sniffing or `application/octet-stream` fallback.
Success includes exact `Content-Type`/`Content-Length`, `nosniff`, and
`Cache-Control: no-store`; successful HTML also receives the exact Host-owned
Plugin Runtime CSP. `HEAD` has the same status and headers with no body.
Range, conditional requests, query routing, directory indexes, content
negotiation, wildcard CORS, and downloads are unsupported. Every success and
error is `no-store`.

Unknown/expired scopes, identity or generation mismatch, unsafe/missing paths,
metadata, unknown MIME, and unavailable registrations share one fixed `404`.
Non-GET/HEAD uses fixed `405` with `Allow: GET, HEAD`; unavailable managed state
or unclassified internal failure uses fixed `500`. Responses and logs contain
no scope, identity, version, digest, record key, absolute path, raw I/O, stack,
partial bytes, or existence detail.

Run `pnpm run check:plugin-resource-service` for the shared Rust/TypeScript
fixtures, desktop adapter, workspace boundary, Manager generation, Installer
ownership regressions, and protocol/path/MIME/lifecycle/race/oracle/platform URL
tests. This service does not create an iframe, execute plugin code, establish
Runtime Sessions or Host API transport, or grant permissions. It enforces the
document policy selected by the Host-private security profile; the iframe
container and downstream Runtime Session consume its validated `entry_url`.

## Shipped macOS Isolated Plugin Runtime Origin Prerequisite

Each current `(entry_id, resource_generation)` reuses its existing 128-bit
process-local Resource scope as both the browser-origin key and the path
authorization key. Repeated resolution within one generation is idempotent.
Disable/re-enable, replacement, uninstall, and restart revoke the old scope and
therefore move a future document to a different origin and storage partition;
an unrelated plugin change does not rotate the current scope. The mapping is
not persisted or exported separately from the opaque `entry_url`.

The Resource Contract, protocol handler, and frame-aware target normalizer all
parse one canonical tuple and require byte-for-byte authority/path scope,
plugin-key, and version agreement. The former shared
`lensx-plugin://localhost/...` and translated `lensx-plugin.localhost` hosts are
rejected. Requests do not use `Origin` or `Accept` as authorization and never
add wildcard or reflected-null CORS. Existing fixed 404/405/500 oracles,
`no-store`, bounded diagnostics, path/MIME checks, opened-file validation, and
lifecycle revocation remain in force.

The committed real macOS 26.6 / WKWebView `605.1.15` evidence runs canonical
normal, malicious, and replacement `.lxp` packages through the real
`PluginResourceService`. With the downstream policy
`sandbox="allow-scripts allow-same-origin"`, each isolated authority serializes
as a stable non-opaque origin, loads HTML, CSS, image, classic script, and a
package-relative ES Module graph, and retains only its own same-key storage.
Host storage is unchanged; parent DOM, `frameElement`, and every Tauri surface
remain unavailable; the representative privileged handler receives zero hits.
Evidence is bounded and contains no raw URL, scope, path, storage value, or
invoke secret.

Run:

```bash
pnpm run check:isolated-plugin-runtime-origin
```

This is the macOS-only origin prerequisite consumed by the production iframe
container described below. It does not itself create the iframe or deliver a
Runtime Session, Host API, permissions, or select the CSP profile. Parser coverage for
translated URL shapes is not Windows or Linux Runtime support. The container
may consume only a validated isolated `entry_url`; it has no shared-origin,
opaque classic-only, or wildcard/null CORS fallback.

## Shipped macOS Frame-Aware WebView Navigation Prerequisite

The Rust Host installs one process-local navigation policy on the production
`main` WKWebView before its first document loads. The policy receives
`main | descendant | unknown` from a reviewed macOS-only Tauri/Wry patch:
Wry derives the fact from `WKNavigationAction.targetFrame` and `isMainFrame`,
then `tauri-runtime`, `tauri-runtime-wry`, and Tauri carry it to the application
callback without changing existing URL-only plugin hooks. Any unknown frame,
invalid URL, callback failure, or policy denial fails closed before commit.

The main-frame and descendant allowlists are disjoint. Main-frame navigation
matches only the configured development or production App document. Descendant
navigation is denied while the policy is idle; the trusted Host Runtime adapter
atomically activates one exact Plugin Resource entry plus a Host-derived
fragment through an opaque epoch lease. Replacement invalidates the previous
target, and only disposal of the current lease clears it. Native
isolated-authority and origin-key-preserving translated document URLs normalize
to one internal tuple, while shared hosts, lost translation keys,
authority/path mismatches, and ambiguous targets are rejected. Ordinary
subresources remain solely under the Resource Service.

Production installs this policy with no active plugin target. The Host Runtime
adapter activates it before mounting the current iframe and compare-current
disposes it on close, retry, replacement, invalidation, or App teardown. The
policy also denies every WebView new-window request and download, without
routing the target to the opener. Tauri initialization remains main-frame-only: the Host
retains `isTauri`, `__TAURI_INTERNALS__`, metadata, invoke initialization, and
IPC, while descendant documents receive none of those surfaces.

The committed 15-case real WKWebView evidence records macOS, WKWebView
`605.1.15`, Tauri `2.11.5`, Wry `0.55.1`, native custom-protocol shape, native
frame class, pre-commit outcome, bootstrap isolation, and bounded callback
counts without URLs or private identity. Each run also verifies activate,
replacement, late disposal, current disposal, and idle-to-reactivate lease
lifecycle before opening the selected document. Host, external, cross-plugin, stale,
fragment, and data document attempts reach the policy and are denied. WKWebView
preflight-blocks `file:`, no-op `javascript:`, and same-document `blob:` before
a navigation callback; evidence records `blocked_by_webview`, the retained
document, and unchanged callback count instead of claiming a policy denial.
Popup/targeted-context and blob-download cases reach their independent deny
hooks. Run:

```bash
pnpm run check:frame-aware-webview-navigation-policy
```

This capability is macOS-only and does not claim Windows or Linux support. The
Task 4.2 container consumes its exact target lease. The shipped Session below
also consumes that lease without changing the native policy contract; Host API
and permissions remain separate later capabilities.

## Shipped macOS Isolated Plugin iframe Runtime

An available external Plugin Page now renders one Host-owned
`PluginRuntimeFrame` in the existing single-window Page slot. A Host-private
resolver cross-checks the current Page identity, provider, eligible Registration
entry, Registration revision, Resource response identity, isolated-origin URL,
and Registry route. It derives the fragment target from the Host route and never
falls back to a Manifest path, shared host, stale URL, or plugin-supplied iframe
policy. Explicit retry refreshes the current projection and creates a new
attempt identity; there is no automatic retry or hidden iframe reuse.

The container fixes `sandbox="allow-scripts allow-same-origin"`,
`referrerPolicy="no-referrer"`, and a deny list for camera, microphone,
geolocation, fullscreen, clipboard, display capture, payment, USB, serial, HID,
Bluetooth, and screen wake lock. Native lease activation completes before the
iframe receives `src`. Close, Registry invalidation, replacement, retry, return
to home/search, and App teardown remove the iframe and compare-current dispose
its lease. At most one plugin iframe exists; Host Pages remain trusted React
surfaces.

The UI exposes localized `resolving`, `loading`, `loaded`, and bounded failure
states with an explicit accessible retry. `loaded` means only that the iframe
load event fired. It is not SDK or Session `ready`, and this capability adds no
readiness claim by itself. The downstream Session capability adds only its
private MessagePort bootstrap. The security lifecycle described below adds
deadlines, bounded crash-loop recovery, and CSP without introducing JSON-RPC,
Host API, or permission dispatch. Plugin Runtime resolver, Resource and
Registration adapters, iframe policy, native lease boundary, and origin facts
remain Host-private and are blocked from public packages and plugin workspaces.

Run `pnpm run check:plugin-iframe-runtime` for the resolver, component,
navigation lease, Page/lifecycle/replacement/resource regressions, real
normal/malicious/replacement `.lxp` evidence, both prerequisite gates, and
workspace boundary checks. The real WKWebView evidence is macOS-only; no
Windows or Linux Runtime support is claimed.

## Shipped Host-Private Plugin Runtime Session

After the current iframe reports `load`, `PluginRuntimeFrame` passes only its
actual `contentWindow` and the Host-derived descriptor to the process-local
`PluginRuntimeSessionService`. The resolver converges Registration summary and
detail, Page route, Resource entry, and current revision, then binds an immutable
identity containing the opaque entry, plugin/version/Page, isolated origin and
resource generation, Runtime attempt, and sorted actual grant snapshot.
Manifest requests, source, publisher text, enabled text, and plugin messages
cannot create or replace identity or grants.

For each attempt the Host creates a new 128-bit lowercase hexadecimal nonce and
`MessageChannel`, sends the exact private `0.1.0` bootstrap only to the recorded
window and exact isolated `targetOrigin`, and transfers the child Port once.
Only the first exact ready acknowledgement received on the Host Port with the
same nonce changes the Session from `awaiting_handshake` to `ready`. The
bootstrap and acknowledgement contain no plugin, entry, Page, grant, revision,
resource token, URL, or Host object. Invalid Port input, duplicate or late
acknowledgements, `messageerror`, Host reload, or current-fact loss disconnects
the Session without an oracle or automatic reconnect.

Currentness compares the affected entry, Page, version, origin/generation,
attempt, availability, and grants after each Registration invalidation. A
change to those facts revokes the old Session, Port, iframe, and navigation
lease. A global revision change caused only by another plugin retains all four;
the revision is a race detector, not a Session generation. Close, retry,
replacement, navigation to Home/Search/a Host Page, and App unmount perform
idempotent terminal cleanup. Sessions, nonces, Ports, window references, and
message state are never persisted, and Registration continues to report only
`inactive` after process recovery.

Three readiness layers remain distinct:

1. iframe `loaded` means only browser load completion;
2. Session `ready` means only that the current window/origin/nonce/Port binding
   authenticated;
3. future SDK `ready` requires a later public transport to connect and validate
   a Runtime context.

The Session contract, parser, adapters, identity, and Port lease remain private
to the root Host and are excluded from Contract, SDK, UI, Testkit, official,
example, and external plugin imports and tarballs. This capability defines no
public SDK iframe transport, JSON-RPC/request ID, Host API method, permission
decision or UI, privileged dispatch, plugin storage, background Runtime,
sidecar, or Windows/Linux support. The security lifecycle adds the private
handshake deadline and cleanup described next. Run `pnpm run check:plugin-runtime-session` for focused logic/React,
real package, boundary, prerequisite, and bounded real macOS WKWebView evidence.

## Shipped Plugin Runtime CSP And Security Lifecycle

The Host and external-plugin documents use separate immutable CSP profiles.
The production Host profile permits only bundled Host resources, the existing
Tauri IPC endpoints, and `lensx-plugin:` child frames. Its only style exception
is `style-src 'unsafe-inline'`, required by the current Semi Design runtime;
script inline, eval, wildcard, remote script, object, base, form, and ancestor
relaxations remain denied. Every successful current plugin HTML `GET` and
`HEAD` receives the same Plugin Runtime profile from the Resource Service. That
profile defaults to deny, permits only same-origin script, style, image, and
font resources, disables connect, worker, child frame, media, object, base, and
form destinations, and admits exactly the production Host ancestor. Manifest,
publisher, source, grant, query, request-header, and plugin-authored meta values
cannot change either profile.

CSP, isolated origin, iframe sandbox, Permissions Policy, native navigation,
and Runtime Session are complementary boundaries. CSP controls resource and
document destinations; the per-generation origin separates DOM and storage;
the sandbox and Permissions Policy constrain frame capabilities; the native
lease controls top-level and descendant navigation; and the Session authenticates
one current window and dedicated Port. None of these boundaries creates a Host
API grant.

A Host-private controller owns one Runtime attempt and one external-plugin
iframe globally. It starts the 10,000 ms load deadline only after the navigation
lease is active and `src` is committed. The Session starts its 5,000 ms
handshake deadline only after bootstrap transfer succeeds. Close, navigation,
quiescence, disable, uninstall, replacement, relevant fact or grant changes,
retry, timeout, Session failure, Host reload, and App teardown all converge on
one idempotent terminal operation: make work stale, cancel timers and
subscriptions, dispose Session and Ports, unbind and remove the iframe,
compare-current release the navigation lease, then discard references. Late
promise, load, acknowledgement, timer, and Port events therefore cannot affect
a newer attempt. There is no preload, hidden pool, background Runtime,
cross-Page reuse, automatic retry, or persisted Runtime state.

The process-local breaker is keyed by trusted entry identity and resource
generation. A third qualifying load, handshake, or unexpected-disconnect
failure in 60,000 ms opens a 30,000 ms cooldown before resolve, lease, iframe,
or Session creation. Cooldown expiry still requires an explicit user retry.
Close, navigation, invalidation, and graceful exit do not count; a generation
change or 30,000 ms continuously healthy `ready` state clears the record, and
process exit forgets it.

Visible failures use only `runtime_load_timeout`,
`runtime_handshake_timeout`, `runtime_session_disconnected`,
`runtime_security_policy_failure`, `runtime_crash_loop`, or
`runtime_unavailable`, with canonical English and equivalent Simplified
Chinese copy in the existing accessible feedback surface. Diagnostics and
evidence exclude full or blocked URLs, origin/scope values, paths, nonce/Port
content, grants, payloads, storage values, raw exceptions, and stacks; there is
no remote CSP reporting channel. The committed real WKWebView matrices are
macOS-only. Task 5.2 still owns the future public SDK iframe transport and does
not inherit these Host-private attempts, timers, breaker records, or failure
codes. Run `pnpm run check:plugin-runtime-security-lifecycle` for the focused
gate and its Resource, origin, navigation, iframe, Session, workspace, and
public-tarball prerequisites.

## Shipped Host-Private Plugin Surface Projection And Page Navigation

The trusted TypeScript application ships one production surface projection
coordinator between the Plugin Registration Desktop Adapter, unified Page
Registry, and only Launcher Action Registry. It consumes complete snapshots and
same-revision details rather than event patches. Only registered, enabled
plugins compatible with both lensX and the Host API are eligible; quarantine,
degraded availability, disappearance, or unverifiable facts unregister the
affected provider fail closed. Builtin and external source values follow the
same mapping and execution rules.

Production composition shares that Registration adapter with the lifecycle
service. The surface coordinator therefore exposes provider-scoped quiesce and
explicit revision reconciliation without creating a second subscription or
cache. Lifecycle controls can remove stale Action/Page projections immediately
and then reuse the normal complete-snapshot mapping for convergence.

Both Registries support trusted provider-scoped complete-batch replacement and
empty-batch unregistration. The Page Registry protects `lensx.core`, validates
Page identity, parent ownership, localized fields, private routes, sorted
permission IDs, and availability before committing, and returns isolated
deterministic lookups and snapshots. Invalid, duplicate, cross-owner, or
partially invalid input preserves the complete pre-call state and cannot remove
another provider's Page, descriptor, or executor.

The pure Page mapper keeps `(owner_id = plugin_id, page_id = local Page ID)` as
the only Page identity, preserves same-owner parent targets and private routes,
and derives localized provider/Page presentation. It marks a Page available
only when every required permission ID is present in the current Host-owned
grant snapshot. Empty requirements are available. This subset check neither
creates a grant nor claims a permission catalog, user decision, or session
enforcement.

The pure Action mapper sets `owner_id = plugin_id`, derives
`action_id = <plugin_id>.<local_action_id>`, preserves normalized localized
Action metadata and keywords, and sets `enabled = true`. A Host-owned executor
captures only the frozen plugin Page target and opening Action ID for an
injected narrow Page opener. Only Actions targeting a currently available Page
are published. Manifest route, permission, publisher, source, and
`default_action_id` facts do not enter the descriptor or affect search ranking.
Package-local asset icons are deliberately omitted and use the existing generic
Action fallback until a scoped resource service exists.

Projection convergence is serialized by Registration revision and reads each
provider detail once per reconciled revision. New or replaced providers commit
the complete Page batch before the available-target Action batch. Invalidation,
removal, rollback, and destroy unregister Actions before Pages. Detail identity
and revision must match the current summary, stale asynchronous results are
discarded, repeated refreshes are idempotent, and destroy prevents later
Registry commits. A detail, mapping, or replacement failure unregisters only
that plugin and emits a bounded diagnostic without routes, installation paths,
stacks, raw errors, or Host objects. Successfully projected Actions reuse the
shared search, Dispatcher, and ID-only recent/pinned resolution.

`AppNavigationService` resolves the current available descriptor before sending
one flat `ActivePage` to the single App Shell handler. Registry replacement
invalidates an active Plugin Page only when the identity disappears or becomes
unavailable. Current locale presentation resolves provider name, Page title,
and opening Action from Registry facts, with `zh-CN` to `en-US` and missing
Action to Page-title fallback. The Plugin owner icon remains the generic
provider fallback.

Production composition initializes this coordinator, refreshes it on Launcher
activation and listener recovery, and destroys the same subscription on
cleanup. An available Plugin Page passes its current resolution to the shipped
Host-private iframe Runtime resolver. Surface projection still does not expose
routes, entry IDs, revisions, origin facts, resource URLs, or native objects to
plugins. Task 5.5 complete permission management remains unimplemented.

## Shipped Public Plugin SDK Foundation

lensX ships the framework-neutral `@lensx/plugin-sdk@0.1.0` workspace package.
The package has one public root entry and depends only on
`@lensx/plugin-contract` at Runtime. Undeclared deep imports are unsupported,
and its public declarations do not require React, Semi Design, Tauri, DOM
globals, Node filesystem types, or Host-private modules.

The root entry exposes `createPluginSdk`, `PluginSdkError`, SDK lifecycle,
Runtime context, cancellation, and transport types, plus these independent
version facts:

| Export | Meaning |
| --- | --- |
| `PLUGIN_SDK_VERSION` | The SDK package and public API version, currently `0.1.0`. |
| `PLUGIN_SDK_SUPPORTED_HOST_API_RANGE` | The half-open supported Host API range, currently `>=0.1.0 <0.2.0`. |
| `PLUGIN_HOST_API_VERSION` | Not re-exported by the SDK; the current Host API version remains owned by `@lensx/plugin-contract`. |

`createPluginSdk({ transport })` returns an isolated client rather than a
global singleton. A client moves through `idle`, `initializing`, `ready`,
`disconnected`, and `disposed`. Concurrent initialization calls share one
connection attempt. A cancelled, timed-out, or failed attempt returns to
`idle` for explicit retry; disconnect is terminal for that client and does not
automatically reconnect. Disposal is idempotent, cancels pending SDK-managed
operations, removes listeners, and disposes the transport at most once.

Before entering `ready`, the SDK validates, copies, and freezes a
`PluginRuntimeContext` containing a compatible `hostApiVersion`,
`en-US | zh-CN` locale, `light | dark` theme, and a unique readonly capability
ID snapshot. An empty capability list is valid and does not imply any Host API
method. Plugin identity, Page identity, granted permissions, installation
source, and Host lifecycle facts are not supported context inputs.

SDK-managed operations use a 10,000 millisecond default timeout with positive
finite integer overrides. Cancellation accepts a minimal structural signal
compatible with native `AbortSignal` without referring to the DOM type in
public declarations. Timeout, cancellation, disconnect, and disposal propagate
cancellation to the transport, clean up timers and listeners, and suppress late
results.

`PluginSdkError.code` provides stable SDK-level branches for `cancelled`,
`timeout`, `disconnected`, `disposed`, `incompatible_host_api`,
`invalid_runtime_context`, `invalid_argument`, and `transport_failure`.
Transport exceptions are mapped to safe SDK errors without exposing the raw
exception, private stack, Host object, or wire data. Permission, unknown-method,
and Host parameter errors remain future Host API contract work.

`PluginSdkTransport` is a semantic adapter injection boundary for connection,
abstract requests, abstract events, disconnect notification, and disposal. It
does not define request IDs, nonce, identity, origin, `Window`, `MessagePort`,
`postMessage`, or a JSON-RPC envelope. The public `PluginSdkClient` deliberately
does not expose an arbitrary string-based Host method call. The SDK package's
white-box test fake remains private; public black-box controls live in the
separate Testkit package.

## Shipped Public Plugin Testkit

lensX ships `@lensx/plugin-testkit@0.1.0` with one public root entry. Its Runtime
dependencies are the public roots of `@lensx/plugin-contract` and
`@lensx/plugin-sdk`; Contract and SDK do not depend on Testkit. Its Runtime and
declarations do not require a DOM, React, Semi Design, Tauri, Node filesystem,
Host-private modules, or a test runner.

The root entry provides:

- `createPluginManifestFixture()` for a fresh minimal current Contract input;
- `mutatePluginManifestFixture()` for ordered JSON Pointer `set` and `remove`
  operations that return a deep copy;
- `createPluginRuntimeContextFixture()` for copied and frozen locale, theme,
  Host API version, and capability snapshots;
- `PluginTestCancellationController` and `createDeferred()` for runner-neutral
  cancellation and pending-operation control;
- `FakePluginSdkTransport` for semantic connect/request handlers, abstract
  events, disconnect, disposal, and immutable observation snapshots.

Typical lifecycle tests inject the fake into the real SDK:

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import { FakePluginSdkTransport } from '@lensx/plugin-testkit';

const transport = new FakePluginSdkTransport();
const client = createPluginSdk({ transport });
const context = await client.initialize();
const observation = transport.observation;
await client.dispose();
```

Manifest fixtures are checked by the real Contract validator and normalizer;
Runtime context failures, cancellation, timeout, transport failure,
disconnect, retry, and late-result suppression remain real SDK behavior. The
fake transport does not define an RPC envelope, request identity, nonce,
origin, browser messaging object, or trusted Host identity. Its abstract
request hook is not a delivered Host API method client. Capability IDs remain
opaque context data and are not permission requests, grants, or decisions.

`pnpm run check:plugin-testkit` verifies package tests and declarations,
Contract -> SDK -> Testkit dependency direction, real tarball contents, and a
no-DOM ES2022 consumer installed outside the workspace. That consumer is a
release smoke fixture, not the formal plugin project template. Testkit does not
provide permission harnesses, iframe Runtime, plugin execution, or real Host API
methods or errors; later Host API, permission, and Runtime changes may extend
the package only after their contracts are accepted.

## Shipped Optional Plugin UI Package

lensX ships the optional `@lensx/plugin-ui@0.1.0` package for React plugins.
Its root export is constrained to `PluginUiProvider`, `PluginPage`,
`PluginFeedback`, and their public types. Its only other public entry is
`@lensx/plugin-ui/styles.css`. Undeclared deep imports, Host React context,
private application components, Tauri adapters, Host styles, and the complete
Semi Design API are not exported.

`PluginUiProvider` receives a read-only `PluginRuntimeContext` snapshot from the
SDK and adapts only its `locale` and `theme` fields inside the plugin document:

```text
validated PluginRuntimeContext snapshot
  -> PluginUiProvider
     -> Semi LocaleProvider (en-US or zh-CN)
     -> package-owned feedback messages
     -> document lang and color-scheme
     -> body[theme-mode="dark"]
```

Passing a new snapshot updates every mapped presentation value. The provider
does not read Host providers or preferences, subscribe to SDK transport, poll,
or define a context-update event. It records document state at mount and
restores it at unmount; the intended future execution environment is the
plugin's own isolated document.

`PluginPage` provides only the stable page semantics: one `main`, an accessible
heading, optional description and actions, and a content region.
`PluginFeedback` provides localized `loading`, `empty`, and `error` states with
busy/status/alert/live-region semantics and an optional plugin-owned recovery
handler. General controls remain direct Semi Design imports rather than lensX
wrappers.

The styles entry includes required Semi base styles and stabilizes exactly ten
lensX semantic custom properties:

```text
--lensx-plugin-color-background
--lensx-plugin-color-surface
--lensx-plugin-color-text
--lensx-plugin-color-text-secondary
--lensx-plugin-color-border
--lensx-plugin-color-accent
--lensx-plugin-color-danger
--lensx-plugin-color-focus
--lensx-plugin-radius-page
--lensx-plugin-space-page
```

Those properties map to supported Semi theme tokens and the package's page
spacing/radius. Other Semi tokens may be used by plugin code but are not lensX
compatibility promises. The published CSS has no Host global-style or UnoCSS
scan dependency.

React, React DOM, and Plugin SDK are UI peer dependencies. Semi Design is the
UI package's direct Runtime dependency. A React plugin installs the peers and
builds one self-contained browser bundle containing its own single React
Runtime, React DOM, Semi, Plugin UI JavaScript, and styles. It does not receive
Host externals, import maps, window globals, React instances, or private CSS.
A non-React plugin can ignore UI entirely and continue to consume only Contract
and SDK.

Package tests, a real-tarball Rsbuild consumer, module-graph and bundle checks,
and a `650×600` browser visual matrix cover public boundaries, locale/theme,
accessibility, keyboard recovery, focus, and long bilingual content. This
delivery does not create an iframe, Runtime session, Host API, installer,
registry, template, or plugin execution path.

## Host Action Registry

The shipped launcher action core establishes a Host-owned TypeScript registry
for validated, serializable action descriptors. Descriptor metadata and
executors are separate: consumers can inspect immutable descriptor snapshots,
while only the trusted Host dispatcher can resolve and invoke executors.
External code must never place functions, React state, Tauri objects, or Rust
implementation values in a descriptor.

A launcher descriptor may carry a validated plain-data Host icon token. The
Host resolver maps supported tokens to application icon components and uses a
generic Action fallback for missing or unresolved tokens. A Manifest
package-local asset icon is a different contract and is not projected into this
Host token field by the shipped runtime.

The launcher search service consumes only immutable descriptor snapshots from
that registry. It applies the same deterministic locale resolution, token
matching, scoring, sorting, and enabled filtering to every registered
descriptor. It does not read a plugin display name, Manifest-private data, or
provider source, and it does not boost a Manifest
`contributes.launcher.default_action_id`. Optional icon metadata and the
recent/pinned collections do not affect matching, scoring, or sorting.

Built-in modules and external plugins project actions through the validated
Host-private provider adapter described above. It maps provider identity and
metadata into the stable launcher descriptor contract before atomic Host
registration. Once registered, a plugin Action automatically
use the same search path as a built-in Action; search itself will not add a
provider-specific branch. A provider cannot directly mutate the registry,
choose a trusted executor, invoke privileged desktop commands, or bypass the
Host dispatcher. Privileged behavior remains an explicit Host capability with
its own authorization and typed application or Rust boundary.

Production registers Host hide-launcher and open-settings Actions and publishes
eligible Plugin Actions through the shipped surface coordinator after their
available Page targets commit. The static Manifest contract still does not
register Actions by itself. Safe plugin icon resolution, complete
permission decisions, lifecycle writes, and external Runtime execution remain
separate capabilities. Recent and pinned collections continue to store only
Action IDs, so a projected Action hides while its provider is absent and
resolves again if the same stable ID returns.

## Runtime Boundaries

### Trusted Host Modules

Built-in surfaces may run as trusted React modules inside the application
providers. Their registration metadata should use the same conceptual pages,
actions, permissions, and compatibility model as external plugins, while their
module loading remains Host-controlled.

The contract name for a trusted module must stay framework-neutral so the
external contract does not depend on React implementation details.

### External Plugins

External plugin UI runs in the shipped isolated iframe. The shipped private
Runtime Session authenticates one dedicated Port through a controlled Host
bootstrap; plugins still have no public transport or Host API. External plugins
must not directly access:

- application React state or component instances;
- private frontend modules;
- Tauri commands;
- Rust objects;
- the local filesystem or operating-system APIs outside granted Host methods.

External runtime resources must resolve inside the installed plugin boundary.

## Host API

The intended communication flow is:

```text
iframe
  -> future typed Plugin SDK transport over the authenticated Port
  -> future JSON-RPC/request protocol
  -> source, identity, method, params, and permission validation
  -> Host API dispatcher
  -> application service or Rust command
```

The bridge must validate the actual message source and a restricted origin. A
declared permission is not the same as a granted permission. Privileged methods
must check current authorization before dispatch.

Host API methods should be small, typed, versioned, and independently testable.
Plugins must not handcraft private transport messages when an official SDK
method exists.

## Loading And Performance

- Register metadata without loading inactive external UI.
- Create an iframe only when the corresponding page is opened.
- Dispose listeners, pending calls, and runtime resources when a page closes.
- Keep background-resident behavior and sidecar execution outside the initial
  runtime unless accepted by dedicated specs.
- Reject unsupported or incompatible capabilities with diagnosable errors.

## Security Principles

- Validate structure before semantic references and permissions.
- Treat plugin packages and messages as untrusted input.
- Resolve package paths without allowing absolute paths or parent traversal.
- Separate declared, requested, and granted permissions.
- Use deny-by-default behavior for unknown methods and capabilities.
- Never expose internal Tauri or native objects to an iframe.

## Capability Delivery

The static Manifest format, validators, Host-private local installation and
same-identity replacement, revision-bound enable/disable/uninstall
infrastructure, scoped package-relative resources, Plugin surface projection,
production Action activation, Page Registry/navigation, and the macOS isolated
iframe Runtime and Host-private process-local Runtime Session are delivered. Each remaining capability—complete plugin-management
UI, complete permissions, Host API methods, public packaging, remote/automatic updates,
user-initiated rollback history, or sidecars—requires
its own accepted specification and implementation evidence. This architectural
document defines direction and boundaries, not a release checklist.
