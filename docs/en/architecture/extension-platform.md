# Extension Platform

## Document Status

This document separates the shipped static plugin Manifest contract and Plugin
SDK foundation from the intended runtime extension boundary. Installation,
distribution, plugin execution, permissions, plugin action projection and
search, iframe transport, and the Host API are not currently implemented.
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

Page and Action IDs are plugin-local. A future Host projection can derive the
global Action ID as `<plugin_id>.<local_action_id>`, but the shipped validator
does not perform that projection. Page parent references must exist and form an
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

### Explicitly Unimplemented Capabilities

Static validation does not discover or install packages, register plugins,
create iframes, grant permissions, project plugin Actions into the launcher
registry, search those Actions, navigate Pages, exchange Host API messages, or
run plugin code. The current App Shell can search Host built-in launcher
Actions, but static Manifest validation has no connection to that registry,
search path, Action collections, or Host icon projection.

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
does not expose an arbitrary string-based Host method call. The package test
fake is private; a public Plugin Testkit has not been delivered.

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

Future built-in modules and external plugins must project actions through a
validated provider adapter. That adapter is responsible for mapping provider
identity and metadata into the stable launcher descriptor contract before an
atomic Host registration. Once registered, a plugin Action will automatically
use the same search path as a built-in Action; search itself will not add a
provider-specific branch. A provider cannot directly mutate the registry,
choose a trusted executor, invoke privileged desktop commands, or bypass the
Host dispatcher. Privileged behavior remains an explicit Host capability with
its own authorization and typed application or Rust boundary.

The current registry contains the Host hide-launcher and open-settings built-in
Actions. The static plugin
Manifest contract does not register contributed Actions and does not yet define
provider lifecycle, unregister or replacement semantics, permissions, plugin
Action/icon projection, or external execution. The persisted recent and pinned
collections therefore resolve only currently registered Host Actions. Those
remaining capabilities require dedicated accepted specifications rather than
implicit expansion of the action descriptor.

## Runtime Boundaries

### Trusted Host Modules

Built-in surfaces may run as trusted React modules inside the application
providers. Their registration metadata should use the same conceptual pages,
actions, permissions, and compatibility model as external plugins, while their
module loading remains Host-controlled.

The contract name for a trusted module must stay framework-neutral so the
external contract does not depend on React implementation details.

### External Plugins

When external plugin execution is implemented, plugin UI must run in an
isolated iframe and communicate only through a controlled Host bridge. External
plugins must not directly access:

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
  -> typed Plugin SDK
  -> JSON-RPC over postMessage
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

The static Manifest format and validators are delivered. Each remaining
capability—provider projection, installation, permissions, Host API methods,
packaging, lifecycle, runtime execution, or sidecars—requires its own accepted
specification and implementation evidence. This architectural document defines
direction and boundaries, not a release checklist.
