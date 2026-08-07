# Runtime Permissions And Security

## Runtime lifecycle

An iframe document being visible is not SDK-ready. The Host first creates one
isolated iframe for the active plugin page, establishes a current authenticated
session, and connects the public SDK transport. The SDK then obtains
`runtime.get_context`; only a compatible, valid complete context moves the
attempt to ready.

Model UI state explicitly as loading, ready, empty capability, error, and
recovery. A page close, navigation, manual reload, permission change, package
replacement, Host reload, disconnect, deadline, or breaker transition can end
the attempt. Cleanup must unsubscribe listeners, cancel pending work, dispose
the SDK, and remain safe when repeated.

## Context replacement

`runtime.context_changed` carries the whole context. Replace the prior snapshot
atomically; never merge it as a patch. Update `en-US`/`zh-CN`, light/dark, and
the complete capability set together. Capabilities removed by the replacement
are unavailable immediately, even if an earlier call or UI render assumed
otherwise.

Empty capabilities are valid. Render a useful empty or degraded state instead
of guessing that the public catalog is callable. An invalid or incompatible
context ends the current attempt with a controlled error.

## Permissions

Permission facts form a narrowing chain:

- **requested**: the Manifest asks for a known permission and explains why;
- **granted**: the Host records an explicit user decision for the current
  registration revision;
- **effective**: the request, grant, supported provider, and current facts all
  agree;
- **capability**: the current session exposes the method now.

Only `clipboard.read` and `clipboard.write` require explicit permissions in
Host API `0.1.0`. Installation begins with no grants. CLI acceptance, publisher
metadata, development source, a click inside the plugin, or a requested reason
cannot grant authority. Revocation and a reload permission delta invalidate
affected current sessions and pending calls.

## Failure and recovery

Map initialization, invalid/incompatible context, transport failure, timeout,
cancellation, disconnect, permission denial, provider unavailable, and bounded
internal failure to user-readable states. Do not display private exceptions or
untrusted payloads. Offer retry only when it is meaningful and user initiated.

Each retry creates a fresh attempt. Increment an attempt marker before
releasing old resources, ignore late completion from older attempts, and make
teardown idempotent. A disconnected or replaced generation never becomes
ready again through a late callback.

## Security boundary

Production and development sources share the same iframe sandbox, restrictive
content policy, exact source validation, single-iframe ownership, authenticated
session, semantic SDK, provider checks, permissions, request limits, deadlines,
failure breaker, and teardown. Development Mode changes source provenance and
refresh ergonomics only.

Plugin code must use public package entries and the latest session context. It
must not import Host implementation, invoke native commands, depend on internal
transport fields, loosen content policy, bypass the SDK, or treat Testkit as a
real security boundary. Read [Host API](host-api.md) for method-level recovery.

