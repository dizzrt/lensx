# Host API Reference

## Authority model

Host API `0.2.0` is a closed, non-privileged method catalog. The public
contract defines valid requests, results, events, and stable errors; the
current Host composes providers; and the latest complete
`PluginRuntimeContext.capabilities` list says which methods are callable in the
current session.

A catalog entry is not provider availability and never exposes Tauri, Rust
commands, native clipboard, files, Shell, or process authority. Worker,
network, remote resources, Blob/Data, WASM, and browser origin storage are
ordinary Web Runtime capabilities and therefore do not appear in this method
list.

## Method reference

<!-- lensx-host-api-method {"method":"actions.open","provider":"base","version":"0.2.0","capability":"session"} -->
### `actions.open`

Params: `{ actionId: string }`. Result: `{ opened: true }`. The action must
belong to the current plugin and still resolve to an available target.

<!-- lensx-host-api-method {"method":"runtime.get_context","provider":"base","version":"0.2.0","capability":"session"} -->
### `runtime.get_context`

Params: `{}`. Result: the complete context containing `hostApiVersion`,
`locale`, `theme`, and sorted unique `capabilities`. Context events are full
replacements, not patches.

<!-- lensx-host-api-method {"method":"storage.delete","provider":"storage","version":"0.2.0","capability":"session"} -->
### `storage.delete`

Params: `{ key: string }`. Result: `{ deleted: boolean }` in the current
plugin-scoped Host storage namespace.

<!-- lensx-host-api-method {"method":"storage.get","provider":"storage","version":"0.2.0","capability":"session"} -->
### `storage.get`

Params: `{ key: string }`. Result: `{ found: false }` or
`{ found: true, value: JsonValue }`.

<!-- lensx-host-api-method {"method":"storage.get_quota","provider":"storage","version":"0.2.0","capability":"session"} -->
### `storage.get_quota`

Params: `{}`. Result: `{ usedBytes: number, limitBytes: number }`. A later write
can still fail with `limit_exceeded`.

<!-- lensx-host-api-method {"method":"storage.list","provider":"storage","version":"0.2.0","capability":"session"} -->
### `storage.list`

Params: optional `{ cursor, limit }`. Result: sorted `keys` and an optional
opaque `nextCursor`.

<!-- lensx-host-api-method {"method":"storage.set","provider":"storage","version":"0.2.0","capability":"session"} -->
### `storage.set`

Params: `{ key: string, value: JsonValue }`. Result: `{ stored: true }`.

<!-- lensx-host-api-method {"method":"ui.close","provider":"base","version":"0.2.0","capability":"session"} -->
### `ui.close`

Params: `{}`. Result: `{ accepted: true }`. Only the matching current page may
close; a replaced session cannot close a newer attempt.

## Stable errors

<!-- lensx-host-api-errors {"version":"0.2.0","codes":["cancelled","conflict","internal_error","invalid_params","invalid_request","limit_exceeded","method_not_found","not_found","timeout","unavailable"]} -->

| Code | Developer action |
| --- | --- |
| `cancelled` | Stop obsolete work quietly or let the user retry. |
| `conflict` | Refresh current state before retrying. |
| `internal_error` | Show a bounded failure without private details. |
| `invalid_params`, `invalid_request`, `method_not_found` | Fix the call or Host API version assumption. Removed clipboard and unknown methods reach this path. |
| `limit_exceeded` | Reduce payload, batch, or stored data. |
| `not_found` | Refresh the resource or present an empty state. |
| `timeout` | End the attempt and offer an explicit retry when safe. |
| `unavailable` | Degrade the feature and wait for a current provider. |

## Recovery

Cancel obsolete operations when the page or attempt changes. Atomically replace
locale, theme, and capabilities on each context event. On disconnect, reload,
or replacement, treat old callbacks and pending work as inert. A retry creates
a fresh SDK and subscriptions; it never revives an old session.

See [Runtime and security](runtime-permissions-security.md) for the full
lifecycle and [Compatibility and errors](compatibility-and-errors.md) for
version recovery.
