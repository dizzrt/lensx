# Extension Platform

## Document Status

This document describes the intended extension boundary. It does not claim that
installation, distribution, plugin execution, or every Host API is currently
implemented. Stable specs and source code define the shipped subset.

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

## Runtime Boundaries

### Trusted Host Modules

Built-in surfaces may run as trusted React modules inside the application
providers. Their registration metadata should use the same conceptual pages,
actions, permissions, and compatibility model as external plugins, while their
module loading remains Host-controlled.

The contract name for a trusted module must stay framework-neutral so the
external contract does not depend on React implementation details.

### External Plugins

External plugin UI must run in an isolated iframe and communicate only through
a controlled Host bridge. External plugins must not directly access:

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

Each concrete capability—manifest format, registry, installation, permissions,
Host API methods, packaging, lifecycle, or sidecars—requires its own accepted
specification and implementation evidence. This architectural document defines
direction and boundaries, not a release checklist.
