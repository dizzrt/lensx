# Host API Reference

## Authority model

Host API `0.1.0` has three separate layers:

1. The public catalog defines valid method, request, result, permission, and
   stable error shapes.
2. The current Host may compose a provider for a catalog method.
3. The latest complete `PluginRuntimeContext.capabilities` list decides whether
   that method is callable in this session.

A catalog entry is not provider availability or authority. A provider is not a
grant. Always read the latest complete context, degrade or hide unavailable
features, and never try to manufacture a request outside the SDK.

## Method reference

<!-- lensx-host-api-method {"method":"actions.open","permission":null,"provider":"base","version":"0.1.0","capability":"session"} -->
### `actions.open`

Params: `{ actionId: string }`. Result: `{ opened: true }`. The base provider
requires a current plugin action whose target can be opened. Expect
`invalid_params`, `not_found`, `conflict`, `unavailable`, `cancelled`, or a
bounded internal failure when current state changes.

<!-- lensx-host-api-method {"method":"clipboard.read","permission":"clipboard.read","provider":"clipboard","version":"0.1.0","capability":"session"} -->
### `clipboard.read`

Params: `{}`. Result: `{ text: string }`. The macOS text-clipboard provider,
Manifest request, current grant, and session capability must all be present.
Expect `permission_denied`, `unavailable`, `cancelled`, `timeout`, limit, or
bounded internal errors.

<!-- lensx-host-api-method {"method":"clipboard.write","permission":"clipboard.write","provider":"clipboard","version":"0.1.0","capability":"session"} -->
### `clipboard.write`

Params: `{ text: string }`. Result: `{ written: true }`. Availability requires
the matching request, grant, provider, and current capability. Invalid or
oversized text is rejected; revocation invalidates old authority immediately.

<!-- lensx-host-api-method {"method":"runtime.get_context","permission":null,"provider":"base","version":"0.1.0","capability":"session"} -->
### `runtime.get_context`

Params: `{}`. Result: the complete context containing `hostApiVersion`,
`locale`, `theme`, and sorted unique `capabilities`. Initialization uses this
base method; later context events are complete replacements, not patches.

<!-- lensx-host-api-method {"method":"storage.delete","permission":null,"provider":"storage","version":"0.1.0","capability":"session"} -->
### `storage.delete`

Params: `{ key: string }`. Result: `{ deleted: boolean }`. The scoped storage
provider binds data to the current plugin identity. Invalid keys, stale
sessions, provider failure, and current-state conflicts fail safely.

<!-- lensx-host-api-method {"method":"storage.get","permission":null,"provider":"storage","version":"0.1.0","capability":"session"} -->
### `storage.get`

Params: `{ key: string }`. Result: `{ found: false }` or
`{ found: true, value: JsonValue }`. Absence is a normal result; do not treat it
as an internal error.

<!-- lensx-host-api-method {"method":"storage.get_quota","permission":null,"provider":"storage","version":"0.1.0","capability":"session"} -->
### `storage.get_quota`

Params: `{}`. Result: `{ usedBytes: number, limitBytes: number }`. Check current
quota before a large write, but still handle a later `limit_exceeded` result.

<!-- lensx-host-api-method {"method":"storage.list","permission":null,"provider":"storage","version":"0.1.0","capability":"session"} -->
### `storage.list`

Params: optional `{ cursor, limit }`. Result: sorted `keys` and an optional
opaque `nextCursor`. Treat the cursor as opaque and restart listing after a
stale or invalid cursor.

<!-- lensx-host-api-method {"method":"storage.set","permission":null,"provider":"storage","version":"0.1.0","capability":"session"} -->
### `storage.set`

Params: `{ key: string, value: JsonValue }`. Result: `{ stored: true }`. Handle
invalid values, limits, cancellation, conflict, and unavailable storage without
assuming a partial write succeeded.

<!-- lensx-host-api-method {"method":"ui.close","permission":null,"provider":"base","version":"0.1.0","capability":"session"} -->
### `ui.close`

Params: `{}`. Result: `{ accepted: true }`. The base provider accepts close only
for the matching current page. A stale or replaced session cannot close a new
page generation.

## Stable errors

<!-- lensx-host-api-errors {"version":"0.1.0","codes":["cancelled","conflict","internal_error","invalid_params","invalid_request","limit_exceeded","method_not_found","not_found","permission_denied","timeout","unavailable"]} -->

| Code | Developer action |
| --- | --- |
| `cancelled` | Stop work quietly or let the user retry. |
| `conflict` | Refresh context/current state before retrying. |
| `internal_error` | Show a bounded failure; do not expose private details. |
| `invalid_params`, `invalid_request`, `method_not_found` | Fix the call or version assumption; blind retry will not help. |
| `limit_exceeded` | Reduce payload, batch, or stored data. |
| `not_found` | Refresh the resource or present an empty state. |
| `permission_denied` | Explain that the feature is unavailable; never auto-grant. |
| `timeout` | End the attempt and offer an explicit retry when safe. |
| `unavailable` | Degrade the feature and wait for a new context/provider state. |

SDK lifecycle errors such as disconnected, disposed, transport failure,
invalid context, and incompatible Host API are distinct from method results.

## Recovery

Cancel obsolete operations when the page or attempt changes. On a complete
context replacement, atomically replace locale, theme, and capabilities, then
stop work for capabilities that disappeared. On disconnect, reload, or
replacement, treat all old callbacks and pending work as inert. A retry creates
a fresh SDK, transport, and subscription set; it does not revive an old
session. Always dispose idempotently.

See [Runtime, permissions, and security](runtime-permissions-security.md) for
the full lifecycle and [Compatibility and errors](compatibility-and-errors.md)
for version recovery.

