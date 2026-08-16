# Extension Platform

## Document Status

This document separates the shipped static plugin Manifest contract, `.lxp`
package inspection and local installation, Plugin SDK foundation, Plugin
Testkit, optional Plugin UI package, Host-private Plugin surface projection and
Page navigation, Host-private lifecycle controls, local package replacement,
the Host-private scoped resource service, isolated Child WebView Runtime,
process-local Runtime Session, public SDK WebView transport, Host-private bridge
adapter and public Host API semantic contract from the intended runtime
extension boundary. The former permission core and native clipboard provider
have been removed.
The public Plugin Developer CLI and project templates, complete foreground
plugin execution lifecycle, Host-private management surface,
and feature-gated Plugin Development Mode are also shipped. The repository
validates direct plugins through read-only macOS CI but does not provide an
automatic release pipeline. npm publication,
signing, Marketplace distribution, remote updates, decision history, and
user-initiated rollback history are not currently implemented. Stable specs
and source code define the shipped subset; external authors should start from
the [Plugin Development hub](../plugin-development/index.md).

## Goals

The extension platform should let lensX expose local workflows without giving
untrusted code access to privileged application internals. It should provide:

- searchable launcher actions;
- pages opened through explicit actions;
- open isolated Web execution;
- localized names and search aliases;
- versioned compatibility boundaries;
- predictable lifecycle and diagnostics.

## Conceptual Model

```text
Plugin
├── metadata and compatibility
├── pages
├── actions ───────────────▶ target pages
└── runtime
    ├── trusted Host module
    └── isolated external iframe
```

Ownership and references must be explicit. IDs used across plugins, pages,
actions and other referenceable resources must be globally
unambiguous.

## Contract Layers

The platform separates:

1. author-controlled manifest input;
2. validated and normalized plugin metadata;
3. trusted Host registration metadata;
4. the runtime context exposed to an active plugin.

Plugin authors must not be able to declare trusted facts such as installation
source or Host-owned lifecycle policy. The Host adds those facts after
validation.

Serialized contracts should have one versioned schema source and should be
validated consistently in TypeScript and Rust. Validation errors exposed across
boundaries must have stable machine-readable codes and locations.

## Shipped Public Contract And Static Manifest

lensX ships the publishable `@lensx/plugin-contract@0.2.0` workspace package.
Its root export provides Manifest and Host API versions, generated input types,
normalized values, stable diagnostics, catalogs, and pure validators. Manifest
Schema entries are `@lensx/plugin-contract/schema` and
`@lensx/plugin-contract/manifest.schema.json`; Host API Schema entries are
`@lensx/plugin-contract/host-api-schema` and
`@lensx/plugin-contract/host-api.schema.json`. Undeclared deep imports are not supported.

The package owns the author-controlled `manifest_version: "0.2.0"` protocol as
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
| `manifest_version` | Required and exactly `0.2.0`. |
| `plugin_id` and `version` | Required stable namespaced plugin ID and SemVer release version. |
| `display` | Required localized `name`; optional localized `description` and package-local asset `icon`. |
| `publisher` | Required author-declared `author`, HTTPS `homepage`, and HTTPS `repository`; none establish trust. |
| `compatibility` | Required half-open SemVer ranges for both `lensx` and `host_api`. |
| `runtime` | Required `kind: "iframe"` and package-local HTML `entry`; this is metadata and does not create an iframe. |
| `contributes.pages` | One or more uniquely identified pages with localized titles, internal routes, and optional parent/icon. |
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
owned by that Action and never become plugin-wide aliases.

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
`enabled`, installed paths, signature status, runtime status, CSP, sandbox,
network policy, native capability, permission, or grant state. Publisher
metadata is unverified author input and must never be used alone to establish
trust.

The Contract package version, Manifest protocol, Host API protocol, and lensX
application version evolve independently. Package
implementation fixes do not change a wire protocol; breaking Manifest or Host
API changes update their own version dimension. The current contract provides
no earlier Schema, deprecated symbol alias, compatibility adapter, or
migration branch.

Run `pnpm run generate:plugin-manifest-types` and
`pnpm run generate:plugin-host-api-types` to regenerate committed input types,
and `pnpm run check:plugin-contract` for the complete drift gate. The gate
checks generated types, package tests, Host boundaries, shared Rust fixtures,
and a real tarball installed into an isolated external consumer. The tarball
contains runtime JavaScript, declarations, the two public JSON Schemas, and package
metadata; it excludes tests, fixtures, generation scripts, and Host private
source.

### Capabilities Outside Static Validation

Static validation alone does not discover or install packages, create a
production registration or iframe, exchange Host API
messages, or run plugin code. The Host-private capabilities described below add
one selected compatible `.lxp` as an external registration, project current
Registration facts into Page and Action Registries, and create the isolated
iframe only while an eligible Plugin Page is active. Runtime Sessions, Host API
execution is a separate capability; the Host-private process-local Runtime
Session and public semantic contract described below are now shipped.

## Shipped Public Host API Semantic Contract

`@lensx/plugin-contract` now owns Host API protocol `0.2.0` as a closed Draft
2020-12 Schema, generated TypeScript inputs, deeply frozen normalized values,
immutable catalogs, and pure `unknown` validators. TypeScript and test-only Rust
consumers read the same package-owned valid and invalid fixtures and agree on
validity plus sorted JSON Pointer diagnostic `code`/`path` values.

The catalog contains exactly these methods:

| Area | Methods |
| --- | --- |
| Runtime | `runtime.get_context` |
| Current Page and Action | `ui.close`, `actions.open` |
| Plugin-private storage | `storage.get`, `storage.set`, `storage.delete`, `storage.list`, `storage.get_quota` |

`PluginRuntimeContext` is shared by Contract and SDK. It contains only
`hostApiVersion`, locale, theme, and a sorted unique snapshot of currently
callable method IDs. Empty capabilities are valid. `runtime.context_changed`
carries a complete replacement Context, not a patch. Capabilities combine
current Host support and implementation availability. Plugin identity, Page,
source, Manifest data, paths, permission/grant facts, and executors are
rejected as author-controlled Context or method fields. Ordinary Worker,
network, remote-resource, Blob/Data, WASM, and browser-storage capabilities are
not Host API methods and do not appear in Context.

Host API errors have stable closed codes and a bounded safe English message.
They remain distinguishable from SDK lifecycle errors such as `disconnected`,
`disposed`, and `transport_failure`. Package, Manifest protocol, Host API
protocol, SDK, and application versions evolve independently. Compatible new
methods require a Host API minor version plus capability discovery; incompatible
shape or removal requires a major version, and deprecation must precede removal.

This delivery is an independently usable semantic contract, not an execution
path. It registers no Tauri command and implements no Runtime transport, private
RPC envelope, request ID, Dispatcher, Action/close side effect, storage
persistence, native call, or RPC resource limit. Clipboard and
`system.open_external` are deliberately
absent rather than published as placeholders.

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
  source, enabled intent, and at most the 32
  most recent canonical safe diagnostics;
- compatibility is recomputed from the Manifest ranges and current lensX and
  Host API versions whenever a record is constructed or recovered;
- Runtime state is process-local and always recovers as `inactive` in this
  foundation.

Host-controlled source, author-declared publisher data, and an official
provenance claim are storage or display facts only; none establishes trust or
creates a lifecycle exemption.

The dedicated Plugin Manager Store uses one version-2 JSON record per plugin.
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
prove discovery provenance. Updates, Runtime sessions,
and a public plugin-facing registration API remain separate capabilities.

## Shipped Host-Private Plugin Development Mode

The feature-gated Plugin Development Mode extends the same process-local Plugin
Manager snapshot with `source=development` entries while leaving the version-1
Store format unchanged. A dedicated build capability and native process switch
both default off. Production frontend and native artifacts do not register its
state, commands, picker, coordinator, or UI.

The native folder picker supplies a Host-private directory capability. A
bounded inspector accepts only a self-contained regular-file `dist/` payload,
then copies it through a flushed staging tree into a random immutable current
generation under `app_cache_dir()/plugin-development/<process-session>/`.
Manager facts retain the source capability privately for manual reload, while
Resource and Runtime use only the Host-owned current snapshot. The internal
domain-separated `sha256-development-tree-v1` identity is not a `.lxp` package
digest.

Register, reload, remove, and mode shutdown are serialized revision-bound
transactions. Manager commit advances Resource generation, old Resource URLs
fail immediately, and the macOS navigation policy revokes a matching current
plugin lease before old snapshot cleanup. Frontend surfaces quiesce before the
native transition and fully reread Registration state afterward, so lost events
do not become authority. Reload always publishes a new generation and does not
add watch or retry.

Development entries, diagnostics, source capabilities, snapshots, and
Runtime activity are process-local. Remove and mode shutdown retain plugin data
and Launcher collections, and do not alter installed packages, quarantine
records, or unrelated plugins. Bounded cleanup failure never restores revoked
authority. See [Plugin Development Mode](../development/plugin-development-mode.md)
for the operator workflow and limits.

## Shipped Host-Private Plugin Installation From a Local File

The Plugins settings tab exposes one Host-owned **Install from file** action.
“Local” describes this installation source, not a distinct kind of plugin.
Its pathless `install_local_plugin` command opens the native file picker for one
`.lxp`; cancellation returns an ordinary cancelled result. The frontend sees
only strict installation contract `0.3.0` success, cancellation, or bounded
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
`source=external`, `enabled=true`, and an `inactive` Runtime.
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
version `0.3.0`. This contract is private to Rust, Tauri, and the root
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
details contain the normalized Manifest, `builtin | external | development` source, enabled
intent, per-dimension compatibility, bounded safe
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
objects. Publisher, source, and enabled intent remain independent facts; none
establishes trust. The Registration Contract itself remains read-only:
it does not install, update, uninstall, enable, disable, execute, or render
plugins. The downstream Host-private lifecycle and Action projection cores
consume it without changing that wire contract. Management UI, real Runtime
sessions and Host API methods are delivered elsewhere in this document.
Decision history and signatures remain unimplemented.

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
source, compatibility facts, or Runtime state. Compatible and
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
Contract `0.2.0`. Its pathless prepare command accepts only the current healthy
entry identity and observed Registration revision, opens one native `.lxp`
picker, and returns `cancelled`, `duplicate`, or a bounded `prepared` result.
Prepared results contain an opaque process-local token, from/to versions, and
an `upgrade | downgrade | reinstall` classification. They never contain the
source or staging path, package digest,
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
revision-bound complete record replacement. The version-2 Manager record's
Manifest, installation path, and digest remain the only active pointer; there
is no second pointer, `previous` record, version history, or rollback catalog.
Manager persistence and in-memory publication are the durable commit point.

The next registration preserves source, enabled intent, bounded diagnostics,
and the independent plugin-data subtree; recomputes compatibility; and resets
Runtime to `inactive`. Before the Rust commit,
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

The service also owns a process-local verified byte cache bounded to 32 MiB and
256 entries. Its key is the exact entry, installed-package digest or Development
snapshot identity, Resource generation, and normalized path. Values contain
only immutable `Arc<[u8]>`, fixed MIME, and bounded length. A miss retains the
complete canonicalize/link/regular-file/size/opened-identity/read/final-current
proof before publication. A hit still performs pre/post scope, Manager,
payload-ownership, generation, current-attempt/source, and file-identity checks.
Development snapshots receive one complete tree proof and then a bounded
metadata seal; additions, removals, links, inode/mtime/size/readonly changes,
reload, retirement, or cleanup invalidate it. Generation revocation removes
stale cache eligibility before payload cleanup. Same-generation close/reopen
may reuse package bytes but never Session, authority, Worker, model, or content.

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
tests. This service does not create a Child WebView, execute plugin code, establish
Runtime Sessions or Host API transport. It enforces the
document policy selected by the Host-private security profile; the Child WebView
adapter and downstream Runtime Session consume its validated `entry_url`.

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

This is the macOS-only origin prerequisite consumed by the production Child
WebView described below. It does not itself create the WebView or deliver a
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
also consumes that lease without changing the native policy contract.

## Shipped macOS Isolated Plugin Child WebView Runtime

An available external Plugin Page owns one Host-managed Child WebView inside
the existing single-window Page surface. React renders trusted chrome and a
non-interactive `PluginRuntimeSlot`; Host-private presentation code reports its
physical bounds, visibility, and revision to Rust. The native service validates
the current Page, Registration, resource generation, route, attempt, window,
and slot revision before it creates or updates the Child WebView. Plugins cannot
choose native bounds, labels, configuration, navigation policy, or data stores.

Each attempt has an isolated origin and generation-bound resource authority.
The main Host WebView and plugin Child WebView use separate navigation policies:
the plugin document may load its exact package entry and current-origin
resources, but top-level escape, popup, download, and native authority remain
closed. Close, retry, replacement, navigation away, invalidation, App teardown,
and fatal bridge failure converge on compare-current terminal destruction.
Semantic-equivalent Launcher hide/restore retains the same attempt; at most one
external Plugin Page Child WebView exists.

The UI exposes localized resolving, loading, ready, and bounded failure states
with an accessible retry. Native load completion, private bridge readiness, and
SDK readiness are separate facts. The Host installs a per-WebView closed bridge
before document creation; native ingress supplies the actual WebView identity,
and the Host accepts only the current label, attempt, generation, nonce, and
strict transport frame. The bridge exposes no general Tauri command/event,
window, WebView, identity, origin, path, or native handle authority.

Run `pnpm run check:plugin-child-webview-runtime` for the slot, origin/resource
binding, open-Web capability baseline, navigation policy, terminal lifecycle,
ACL matrix, current fixtures, and workspace boundaries. Run
`pnpm run check:plugin-child-webview-session` for readiness, RPC, Host dispatch,
and cleanup. The real WKWebView evidence is macOS-only; no Windows or Linux
Runtime support is claimed.

## Shipped Plugin Runtime CSP And Security Lifecycle

The Host and external-plugin documents use separate immutable CSP profiles.
The production Host profile permits only bundled Host resources, the existing
Tauri IPC endpoints, and `lensx-plugin:` child frames. Its only style exception
is `style-src 'unsafe-inline'`, required by the current Semi Design runtime;
script inline, eval, wildcard, remote script, object, base, form, and ancestor
relaxations remain denied. Every successful current plugin HTML `GET` and
`HEAD` receives the same Plugin Runtime profile from the Resource Service. That
profile admits current-origin plus HTTPS/Data/Blob content, HTTPS/WSS
connections, page-lifetime Dedicated Workers, and WASM while continuing to
deny objects, base changes, forms, and untrusted ancestors. A production
application document admits exactly
`tauri://localhost` as its ancestor; `tauri dev` substitutes only its configured
`http://localhost:40755` application origin while retaining every other
directive byte-for-byte. Manifest, publisher, source, query,
request-header, and plugin-authored meta values cannot change either profile.

CSP, isolated origin, iframe sandbox, Permissions Policy, native navigation,
and Runtime Session are complementary boundaries. CSP controls resource and
document destinations; the per-generation origin separates DOM and storage;
the sandbox and Permissions Policy constrain frame capabilities; the native
lease controls top-level and descendant navigation; and the Session authenticates
one current window and dedicated Port. These boundaries do not mediate ordinary
Web behavior through Host API.

A Host-private controller owns one Runtime attempt and one external-plugin
iframe globally. A separate 10,000 ms resolution boundary covers convergence
of the previous terminal operation plus current Resource resolution and native
navigation activation; expiry fails closed without constructing another
iframe. It starts the 10,000 ms load deadline only after the navigation lease
is active and `src` is committed. The Session starts its 5,000 ms handshake
deadline only after bootstrap transfer succeeds. Close, navigation,
quiescence, disable, uninstall, replacement, relevant fact changes,
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
evidence exclude full or blocked URLs, origin/scope values, paths, nonce/bridge
content, payloads, storage values, raw exceptions, and stacks; there is
no remote CSP reporting channel. The committed real WKWebView matrices are
macOS-only. The public SDK WebView transport does not inherit these Host-private
attempts, timers, breaker records, or failure codes. Run
`pnpm run check:open-isolated-plugin-runtime` for the composed
gate and its Resource, origin, navigation, Child WebView, Session, workspace, and
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
Page identity, parent ownership, localized fields, private routes, and
availability before committing, and returns isolated
deterministic lookups and snapshots. Invalid, duplicate, cross-owner, or
partially invalid input preserves the complete pre-call state and cannot remove
another provider's Page, descriptor, or executor.

The pure Page mapper keeps `(owner_id = plugin_id, page_id = local Page ID)` as
the only Page identity, preserves same-owner parent targets and private routes,
and derives localized provider/Page presentation. Every Page of an otherwise
eligible registration is available; ordinary Web capabilities do not enter
Page availability calculation.

The pure Action mapper sets `owner_id = plugin_id`, derives
`action_id = <plugin_id>.<local_action_id>`, preserves normalized localized
Action metadata and keywords, and sets `enabled = true`. A Host-owned executor
captures only the frozen plugin Page target and opening Action ID for an
injected narrow Page opener. Only Actions targeting a currently available Page
are published. Manifest route, publisher, source, and
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
Host-private Child WebView Runtime resolver. Surface projection still does not expose
routes, entry IDs, revisions, origin facts, resource URLs, or native objects to
plugins. The Host-private management capability consumes these facts without
changing surface projection; decision history remains outside the platform.

## Shipped Public Plugin SDK And WebView Transport

lensX ships the framework-neutral `@lensx/plugin-sdk@0.3.0` workspace package.
The package has public root and `@lensx/plugin-sdk/webview` entries and depends only on
`@lensx/plugin-contract` at Runtime. Undeclared deep imports are unsupported,
and its public declarations do not require React, Semi Design, Tauri, DOM
globals, Node filesystem types, or Host-private modules.

The root entry exposes `createPluginSdk`, `PluginSdkError`, SDK lifecycle,
Runtime context, cancellation, and transport types, plus these independent
version facts:

| Export | Meaning |
| --- | --- |
| `PLUGIN_SDK_VERSION` | The SDK package and public API version, currently `0.3.0`. |
| `PLUGIN_SDK_SUPPORTED_HOST_API_RANGE` | The half-open supported Host API range, currently `>=0.2.0 <0.3.0`. |
| `PLUGIN_HOST_API_VERSION` | Not re-exported by the SDK; the current Host API version remains owned by `@lensx/plugin-contract`. |

`createPluginSdk({ transport })` returns an isolated client rather than a
global singleton. A client moves through `idle`, `initializing`, `ready`,
`disconnected`, and `disposed`. Concurrent initialization calls share one
connection attempt. A cancelled, timed-out, or failed attempt returns to
`idle` for explicit retry; disconnect is terminal for that client and does not
automatically reconnect. Disposal is idempotent, cancels pending SDK-managed
operations, removes listeners, and disposes the transport at most once.

Before entering `ready`, the SDK uses the Contract validator to copy and freeze
the shared `PluginRuntimeContext` containing a compatible `hostApiVersion`,
`en-US | zh-CN` locale, `light | dark` theme, and a sorted unique readonly
snapshot of declared Host API method IDs. An empty capability list is valid and
does not imply any method. Plugin identity, Page identity, installation
source, and Host lifecycle facts are not supported context inputs.
The Host API validators consumed by the SDK are generated as committed AJV
standalone functions at build time. They do not compile Schemas or use dynamic
evaluation inside the plugin document, so the SDK remains compatible with the
Runtime `script-src 'self'` policy without adding `unsafe-eval`.

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
exception, private stack, Host object, or wire data. Host method, parameter,
domain, and internal error types come from Contract and remain
discriminable from SDK lifecycle failures; the SDK still executes none of them.

`PluginSdkTransport` is a semantic adapter injection boundary for connection,
abstract requests, abstract events, disconnect notification, and disposal. It
does not define request IDs, nonce, identity, origin, `Window`, `MessagePort`,
`postMessage`, or a JSON-RPC envelope. The public `PluginSdkClient` deliberately
does not expose an arbitrary string-based Host method call. The SDK package's
white-box test fake remains private; public black-box controls live in the
separate Testkit package.

`PluginSdkClient.request()` accepts only the Contract `HostApiRequest`
discriminated union, validates and freezes it before transport, derives the
paired result payload type from its method, and rejects calls before `ready` or
when the current capability snapshot omits the method. `subscribe()` accepts
only `runtime.context_changed`; the complete validated and frozen replacement
becomes `client.context` before subscribers run. Contract-valid Host API errors
remain distinct from SDK cancellation, timeout, disconnect, disposal, invalid
argument, and transport failures.

`createPluginWebviewTransport()` has no trust configuration. It discovers only
the Host-installed current bridge and validates the closed `0.2.0` carrier
contract. The bridge uses exact ready, request, response, event, cancel, and
disconnect frames with transport-owned bounded request IDs. It contains no
plugin/Page identity, origin, path, executor, Tauri object, Host object, stack,
or raw exception. The package does not export bridge globals, frame codecs,
fixtures, Host projection, nonce policy, native labels, or a deep-import path.

The Host consumes each ready lease at most once. Its private adapter injects
the immutable Session identity and a Host-owned cancellation signal into a
narrow handler, validates every result/error/event, supports concurrent
out-of-order settlement, and converges Session/Page replacement and disposal
on idempotent cleanup. Production creates one Host-private Dispatcher binding
for every current ready Session. That binding implements
`runtime.get_context`, `ui.close`, `actions.open`, and the five `storage.*`
methods. Removed clipboard and unknown methods fail closed. A private
post-response outcome lets the adapter validate and
post a successful `ui.close` result before running the target-matched close
effect. It never crosses the wire or changes the public SDK transport.

### Shipped Host-Private RPC v1 Validation

The Host adapter now enforces one immutable RPC v1 policy before recursive
Contract validation and before every outbound delivery:

| Budget | Fixed v1 limit |
| --- | ---: |
| Canonical JSON-compatible cost per private frame | 5,242,880 bytes |
| Semantic payload nesting depth | 32 |
| Total private-frame nesting depth | 36 |
| Visited values and object keys | 16,384 |
| Requests per frame | 1 |
| In-flight Handlers per Runtime Session | 32 |
| Host execution deadline | 10,000 ms |

The analyzer walks JSON-compatible input iteratively, accounts for UTF-8 and
JSON escaping without first serializing the complete value, stops at the first
proven limit, rejects cycles, non-plain objects, non-finite numbers and other
non-JSON values, and does not mutate input. A Manifest, plugin source,
SDK option or payload cannot increase these limits.

Ingress is ordered as shallow exact envelope and request-ID classification,
bounded frame and semantic-payload analysis, public Contract validation, then
admission to the closed Host API Dispatcher. A safely correlated malformed
request returns `invalid_request`; invalid params return `invalid_params`; an
undeclared method returns `method_not_found`; and a byte, depth, node or
concurrency rejection returns `limit_exceeded`. These failures consume no
Handler slot and leave a healthy Session available. Unsupported versions,
unknown frame types, private envelope fields, non-JSON frames and replayed or
decreasing request IDs remain terminal protocol violations. A strictly
increasing request-sequence high-water mark rejects replay without an
ever-growing terminal-ID collection.

Every admitted request owns one AbortController and 10,000 millisecond Host
deadline. Completion, SDK cancellation, deadline, currentness loss and cleanup
compete through one settlement. A winning Host deadline releases the slot,
aborts the Handler and returns Contract-valid `timeout`; a winning SDK
lifecycle timeout remains the SDK's distinct lifecycle `timeout` and sends at
most one cancel.

Results, errors and events pass the same frame budget plus their paired public
Contract validator before `postMessage`. A Handler throw, invalid/oversized
value or method/result mismatch becomes one fixed safe `internal_error` and
does not disconnect an otherwise current Session. Invalid events are suppressed
without notifying subscribers. A post-response effect runs only after its
valid response is posted while the request and Session remain current.

Production observes failures through frozen Host-private diagnostic records
containing only trusted plugin ID, an already validated method when available,
`ingress | execution | egress`, a closed code and a fixed English message. The
record never contains request ID, payload, URL, path, origin, exception,
stack, Port, provider or Host object, and a throwing sink cannot affect
settlement. Diagnostics are not persisted or exposed to plugins.

This delivery does not add batch or streaming RPC, sustained call-rate limits,
iframe/CPU/memory monitoring, plugin suspension, isolation escalation,
automatic recovery, public policy configuration or diagnostic history. Those
Runtime resource controls remain Task 7.5 or later explicit changes.

Run `pnpm run check:plugin-sdk-transport` for codec drift, SDK/Testkit,
iframe/Host adapter, real tarball no-DOM and browser consumers, real
MessageChannel integration, Runtime lifecycle, and bounded macOS WKWebView
evidence. This delivery does not claim Windows/Linux Runtime transport support.
Run `pnpm run check:plugin-rpc-validation` for the RPC policy, malicious
fixtures, admission/egress races, Dispatcher/provider integration, private
boundaries, and real resource-rejection evidence.

## Shipped Host-Private Plugin Host API Dispatcher

The production App composes a Session-scoped Dispatcher from current locale and
theme state, the App Navigation Service, the Launcher Action Registry and
Dispatcher, and Runtime currentness. The authenticated lease is the only source
of plugin and Page identity. Requests cannot choose an owner, Page, provider,
executor, route, Tauri command, or other Host object.

`runtime.get_context` returns Host API `0.2.0`, the current `en-US | zh-CN`
locale, current `light | dark` theme, and the sorted frozen capability snapshot
`actions.open`, `runtime.get_context`, all five `storage.*` methods, and
`ui.close` while the scoped-storage provider is available. Complete
`runtime.context_changed` replacements are emitted only when the current
locale, theme, or capability snapshot actually changes. Identity, Registration
revision, Runtime attempt, source, Manifest data, paths, and
Host lifecycle state remain private.

`ui.close` accepts only `{}` and derives the target from the Session. The Host
posts and terminals `{ accepted: true }` before invoking an exactly-once
match-and-close effect, so a stale Session cannot close a replacement Page.
`actions.open` accepts only a plugin-local Action ID, derives
`<plugin_id>.<local_action_id>`, and performs a fresh lookup through the unified
Launcher Dispatcher. Core, cross-plugin, missing, disabled, incompatible, or
removed Actions fail closed without exposing the Registry or executor.

Storage calls use only the identity frozen in the authenticated Session lease.
The Dispatcher injects that identity into a Host-private desktop provider and
never accepts a plugin-selected namespace, path, plugin key, command, or
executor. A confirmed damaged or blocked namespace produces one complete
Context replacement without the five storage capabilities.

Run `pnpm run check:plugin-host-api-dispatcher` for the focused Dispatcher,
Navigation, Action, Runtime, MessageChannel, public-tarball, export, dependency,
and workspace-boundary gate. This capability adds no public export, wire frame,
or SDK dependency. Sustained Runtime resource isolation, project template,
CLI, and development mode remain separate capabilities.

## Removed Host Permission And Native Clipboard Authority

Host API `0.2.0` removes the permission catalog and native clipboard methods.
Manifest `0.2.0`, Manager record format `2`, Registration `0.3.0`, installation
`0.3.0`, and replacement `0.2.0` carry no request, grant, risk, or permission
facts. The Rust permission state, grant command, AppKit clipboard provider,
frontend service, prompts, settings mutations, and post-commit grant phase are
absent from production composition. Old records and wire fields fail closed.

The trusted installation and replacement confirmations instead explain the
open isolated Web Runtime trust decision. lensX isolates Host and other-plugin
authority but does not inspect or individually authorize ordinary Worker,
network, remote-resource, Blob/Data, WASM, or browser-origin storage behavior.
Device/native capabilities remain unavailable unless a future explicit public
Host boundary is designed. Run `pnpm run check:open-isolated-plugin-runtime`
for the negative authority scan and composed Runtime validation.

## Shipped Plugin-Scoped Storage

The Host-private Rust `PluginScopedStorage` service persists one canonical
`storage-v1.json` beneath the Installer-owned
`app_local_data_dir()/plugins/data/<plugin-key>` namespace. The plugin key and
real path are derived and revalidated from the live Manager identity while
holding the Installer's shared process and cross-process commit boundary. Reads
of a missing namespace do not create it; the first successful `storage.set`
creates the data subtree on demand.

Keys contain 1–256 Unicode code points without C0 or DEL controls. JSON values
have a maximum nesting depth of 32 and compact UTF-8 size of 256 KiB. A
namespace contains at most 1,024 entries and 1 MiB of logical usage, calculated
as key UTF-8 bytes plus compact value bytes. `storage.list` uses Unicode
code-point ordering, a default page size of 100 and maximum of 1,000, with an
integrity-protected cursor bound to the namespace revision and next position.
Mutation after a page yields `conflict`; malformed or forged cursors yield
`invalid_params`.

Mutations serialize deterministic JSON, write a create-new owned temporary
file, flush and sync it, atomically rename it at the commit point, then sync the
parent directory. Pre-commit failures preserve the old store and clean only the
owned temporary file. A result that becomes late after commit is dropped by the
Session transport without attempting a false rollback.

Compatible replacement and disable preserve data. Disable revokes access;
`retain_data` uninstall permits a later same-identity reinstall to see the
store, while persisted `delete_data` cleanup deletes the complete owned data
subtree under the same coordinator. Bounded lazy validation degrades only a
namespace with oversized, malformed, non-canonical, symlinked, or abnormal
evidence. Diagnostics contain only stable codes, operations, and messages—no
key, value, plugin identity, payload, path, exception, or stack.

Run `pnpm run check:plugin-scoped-storage` for shared TypeScript/Rust fixtures,
Rust persistence and lifecycle tests, desktop provider and Dispatcher tests,
the real SDK/MessageChannel loop, public tarball consumers, private-boundary
checks, and the existing bounded macOS WKWebView transport evidence. This
delivery adds no management UI, product copy, theme or accessibility surface,
general RPC limit, template, CLI, or development mode.

## Shipped Host-Private Plugin Management Settings

The trusted Settings page now consumes one root-private
`PluginManagementService`. The facade observes complete immutable Registration
snapshots, loads detail only against the same revision, projects bounded
diagnostics and lifecycle/source facts, and serializes prepared installation,
enable/disable, replacement, uninstall, and data-clear mutations. React
receives typed operation availability and safe outcomes; it does not invoke
Tauri or reproduce Manager transition rules.

The root plugin composition is the sole lifecycle owner for the shared
management, plugin lifecycle, Runtime lifecycle, replacement, and
Registration-projection services. Each React effect setup creates and
initializes one composition generation, and its paired cleanup destroys only
that generation. `App`, `PluginRuntimeSlot`, and the Settings component consume
injected services without terminally disposing them. This keeps development
`StrictMode` setup-cleanup-setup cycles from reusing a destroyed service and
leaving either management in `loading` or Runtime resolution permanently in
`resolving` before a Child WebView exists.

Replacement remains a prepare/confirm/commit flow. Its confirmation exposes
the version classification and trust boundary, and becomes
invalid when the Registration revision changes. Uninstall defaults to
`retain_data`; `delete_data` is explicit. Clearing data is available only for a
current disabled registered entry and uses the Host-private Plugin Data
Management Contract `0.1.0`. Rust revalidates the opaque entry identity,
expected revision, disabled state, canonical ownership, and safe filesystem
evidence while holding the Installer data boundary, then atomically commits an
empty canonical `storage-v1.json`. Missing or already-empty storage is
idempotent, while ambiguous, linked, escaped, stale, enabled, quarantined, or
degraded evidence fails closed.

The management surface does not expose raw paths or errors, Publisher trust, Registry
patch/history protocols, a public management API, or any management export
through Contract, SDK, Testkit, or Plugin UI. Run
`pnpm run check:plugin-management-settings` for the private boundary, facade/UI
regressions, public-package checks, and fixed `650×600` bilingual light/dark
screenshots and computed styles.

## Shipped Public Plugin Testkit

lensX ships `@lensx/plugin-testkit@0.2.0` with one public root entry. Its Runtime
dependencies are the public roots of `@lensx/plugin-contract` and
`@lensx/plugin-sdk`; Contract and SDK do not depend on Testkit. Its Runtime and
declarations do not require a DOM, React, Semi Design, Tauri, Node filesystem,
Host-private modules, or a test runner.

The root entry provides:

- `createPluginManifestFixture()` for a fresh minimal current Contract input;
- `mutatePluginManifestFixture()` for ordered JSON Pointer `set` and `remove`
  operations that return a deep copy;
- `createPluginRuntimeContextFixture()` for copied and frozen locale, theme,
  Host API version, and known-method capability snapshots;
- `createInvalidPluginRuntimeContextFixture()` for explicit unknown,
  duplicate, unsorted, and trusted-field negative Context cases;
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
request hook is not a delivered Host API method client. Capability IDs use the
shared closed method type and are not ordinary Web capability declarations.

`pnpm run check:plugin-testkit` verifies package tests and declarations,
Contract -> SDK -> Testkit dependency direction, real tarball contents, and a
no-DOM ES2022 consumer installed outside the workspace. That consumer is a
release smoke fixture, not the formal plugin project template. Testkit does not
provide a native Runtime container, plugin execution, or real Host API execution; later
transport and Runtime changes may extend
the package only after their contracts are accepted.

## Shipped Optional Plugin UI Package

lensX ships the optional `@lensx/plugin-ui@0.2.0` package for React plugins.
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
delivery does not create an iframe, Runtime session, executable Host API, installer,
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
register Actions by itself. Safe plugin icon resolution and lifecycle writes
remain separate capabilities. Recent and pinned collections continue to store only
Action IDs, so a projected Action hides while its provider is absent and
resolves again if the same stable ID returns.

## Runtime Boundaries

### Trusted Host Modules

Built-in surfaces may run as trusted React modules inside the application
providers. Their registration metadata should use the same conceptual pages,
actions, and compatibility model as external plugins, while their
module loading remains Host-controlled.

The contract name for a trusted module must stay framework-neutral so the
external contract does not depend on React implementation details.

### External Plugins

External plugin UI runs in the shipped isolated iframe. The shipped private
Runtime Session authenticates one dedicated Port through a controlled Host
bootstrap, and the public iframe SDK consumes it through the private closed
wire. Production exposes only the three Host-private Dispatcher methods
described above. External plugins
must not directly access:

- application React state or component instances;
- private frontend modules;
- Tauri commands;
- Rust objects;
- the local filesystem or operating-system APIs.

External runtime resources must resolve inside the installed plugin boundary.

## Host API

The shipped public semantic contract defines the eight method IDs, exact
params/results, `runtime.context_changed`, `PluginRuntimeContext`,
errors, and capability/version rules described above. Contract validation alone
does not send or execute a request. The public SDK client now exposes one
Contract-closed typed request operation, not a raw string method or a concrete
side-effect provider.

The intended communication flow is:

```text
Child WebView
  -> typed Plugin SDK over the source-bound bridge
  -> private closed request/response/event/cancel wire
  -> Host bridge adapter with Session-derived identity
  -> Session-scoped Host-private Dispatcher
  -> Context / matching Page close / current plugin Action / scoped storage
```

The bridge validates the actual message source and restricted origin. The
public Host API has no native capability method; unknown or removed methods
fail closed before dispatch.

Host API methods remain small, typed, versioned, and independently testable.
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

- Validate structure before semantic references.
- Treat plugin packages and messages as untrusted input.
- Resolve package paths without allowing absolute paths or parent traversal.
- Keep ordinary Web capabilities out of Host-private authority models.
- Use deny-by-default behavior for unknown methods and capabilities.
- Never expose internal Tauri or native objects to an iframe.

## Capability Delivery

The static Manifest format, validators, Host-private local installation and
same-identity replacement, revision-bound enable/disable/uninstall
infrastructure, scoped package-relative resources, Plugin surface projection,
production Action activation, Page Registry/navigation, the macOS isolated
Child WebView Runtime, Host-private process-local Runtime Session, public SDK WebView
transport/Host bridge adapter, public Host API semantic contract, and the
Host-private RPC v1 validation boundary, Dispatcher, plugin-scoped storage
provider, open isolated Web Runtime, Plugin Management Settings, public project
templates and CLI, feature-gated
Plugin Development Mode, the bilingual external-developer documentation, and
read-only LensX/Plugins CI are delivered. Each remaining capability—automatic
versioning or publication, npm publication, signing,
Marketplace distribution, remote/automatic updates, decision or
user-initiated rollback history, background Runtime, or executable/trusted sidecars—requires its
own accepted specification and implementation evidence. This architectural
document defines direction and boundaries, not a release checklist. External
package, API, tutorial, and troubleshooting details live in the
[canonical Plugin Development reference](../plugin-development/index.md).
