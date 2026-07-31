# Extension Platform

## Document Status

This document separates the shipped static plugin Manifest contract from the
intended runtime extension boundary. Installation, distribution, plugin
execution, permissions, search, and the Host API are not currently implemented.
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

## Shipped Static Manifest Contract

lensX implements the author-controlled Manifest protocol
`manifest_version: "1.0.0-dev"` as a strict Draft 2020-12 JSON Schema. The
Schema is the structural source of truth for the wire format. Generated
TypeScript author-input types, explicit Rust author-input models, and both
validators consume that contract. Shared valid, invalid, normalized, and
incompatible fixtures keep classification, normalized output, and diagnostic
`code`/`path` behavior aligned.

The complete project-owned example is
[examples/plugin-manifest-v0/manifest.json](../../../examples/plugin-manifest-v0/manifest.json).

### Field Model

| Field | Contract |
| --- | --- |
| `manifest_version` | Required and exactly `1.0.0-dev`. |
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

Validation proceeds through strict Schema checks, deterministic normalization,
semantic reference/path/graph checks, and compatibility classification. Public
diagnostics are serializable `{code, path, message}` objects, use JSON Pointer
paths, and are sorted by `path` and then `code`.

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

### Explicitly Unimplemented Capabilities

Static validation does not discover or install packages, register plugins,
create iframes, grant permissions, project plugin Actions into the launcher
registry, search those Actions, navigate Pages, exchange Host API messages, or
run plugin code. The current App Shell and its single built-in launcher Action
remain unchanged.

## Host Action Registry

The shipped launcher action core establishes a Host-owned TypeScript registry
for validated, serializable action descriptors. Descriptor metadata and
executors are separate: consumers can inspect immutable descriptor snapshots,
while only the trusted Host dispatcher can resolve and invoke executors.
External code must never place functions, React state, Tauri objects, or Rust
implementation values in a descriptor.

Future built-in modules and external plugins must project actions through a
validated provider adapter. That adapter is responsible for mapping provider
identity and metadata into the stable launcher descriptor contract before an
atomic Host registration. A provider cannot directly mutate the registry,
choose a trusted executor, invoke privileged desktop commands, or bypass the
Host dispatcher. Privileged behavior remains an explicit Host capability with
its own authorization and typed application or Rust boundary.

The current registry contains one Host built-in action. The static plugin
Manifest contract does not register contributed Actions and does not yet define
provider lifecycle, unregister or replacement semantics, permissions, search,
or external execution. Those capabilities require dedicated accepted
specifications rather than implicit expansion of the action descriptor.

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
