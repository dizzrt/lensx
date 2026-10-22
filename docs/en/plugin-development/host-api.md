# Host API Reference

## Authority model

Host API `0.3.0` is a closed, Session-bound method catalog. The public
contract defines valid requests, results, events, and stable errors; the
current Host composes providers; and the latest complete
`PluginRuntimeContext.capabilities` list says which methods are callable in the
current session.

A catalog entry is not provider availability and never exposes Tauri, arbitrary
Rust commands, native clipboard, files, Shell, or process authority. Ordinary
browser Worker/network, remote resources, Blob/Data, WASM, and origin storage
remain Web Runtime capabilities. The separate `http.request` method provides
controlled Host HTTPS transport; it does not change browser CORS or CSP.

## Method reference

<!-- lensx-host-api-method {"method":"http.request","provider":"http","version":"0.3.0","capability":"session"} -->
### `http.request`

Params: `{ url, method, headers?, body?, timeoutMs? }`. A header is
`{ name: string, value: string }`; headers use an array. The result is
`{ status, headers, body }`, where `status` is 100–599 and `body` is UTF-8
text. Methods are `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, and
`OPTIONS`; GET/HEAD must omit the body. HTTP 3xx/4xx/5xx responses are normal
results for the plugin to interpret. The Host does not follow redirects or
require browser CORS response headers.

Only public Internet HTTPS on port 443 is supported. URLs are limited to
4,096 UTF-8 bytes and cannot contain user information or fragments. Local,
single-label, reserved, loopback, private, link-local, shared, multicast,
documentation, and special-use destinations are rejected. DNS must return
1–16 addresses within the deadline; one disallowed answer rejects the whole
request. Connections use only the validated addresses while TLS checks the
original hostname. System/environment proxies and TLS-verification bypasses
are unavailable. This method is not a route to local services or cloud
metadata.
The native transport uses HTTP/1 with a bounded header parser; HTTP/2-only
endpoints are not supported.

| Limit | Contract |
| --- | --- |
| Headers | At most 32 entries; each name at most 128 bytes, value at most 8,192 bytes, aggregate names/values at most 16 KiB. |
| Header syntax | ASCII HTTP-token names and ASCII U+0020–U+007E values; request names are unique ignoring case. |
| Request/response body | At most 1 MiB UTF-8 bytes each; invalid UTF-8 fails. |
| Serialized semantic result | At most 4 MiB, inside the existing 5 MiB carrier limit. |
| Request deadline | `timeoutMs` from 1 through 15,000; default 15,000, including DNS through response reading. |
| RPC deadline | HTTP deadline plus 1,000 ms, capped at 16,000; other methods retain 10,000 ms. |
| Concurrent requests | At most 4 per Runtime attempt and 16 globally; excess fails without queuing. |
| DNS workers | At most 16 globally, including an OS lookup still completing after its request was cancelled. |

The SDK's generic operation timeout still defaults to 10,000 ms. Set its
operation `timeoutMs` explicitly when allowing a longer HTTP request, for
example 16,000 ms around a 15,000 ms native request, or use a shorter local
deadline and abort signal for a complete business operation.

Request headers cannot set `Host`, `Content-Length`, `Connection`,
`Transfer-Encoding`, `Cookie`, `Cookie2`, `Origin`, `Referer`, `Accept-Encoding`,
`Upgrade`, `TE`, `Trailer`, or names beginning with `Proxy-`/`Sec-`.
Explicit service headers, including `Authorization`, remain plugin-owned;
the Host supplies no ambient credentials. Response headers obey the same
size limits, preserve ordinary duplicates, and omit Set-Cookie/Set-Cookie2
and hop-by-hop fields. The Host keeps no shared cookie jar or HTTP cache,
does not retry or decompress responses, and rejects non-identity
Content-Encoding. Oversized responses fail completely rather than truncate.
The 16 KiB header limit bounds accepted semantic headers before body reading;
it is not a promise that the HTTP parser allocates no additional bounded buffer.

Cancel through the SDK's existing operation signal. Cancellation, timeout,
disconnect, or Runtime termination stops request waiting, releases request
concurrency, and makes late results inert. An already-started OS DNS lookup
cannot be interrupted; it retains its separate bounded worker slot until it
finishes, then discards its result and never starts a connection for that
cancelled request. Hiding/restoring the same current Runtime does
not create another request. URL queries, headers, bodies, credentials,
signatures, and raw network exceptions must not enter logs or diagnostics.
Signing and service-specific response interpretation belong in the plugin.

<!-- lensx-host-api-method {"method":"actions.open","provider":"base","version":"0.3.0","capability":"session"} -->
### `actions.open`

Params: `{ actionId: string }`. Result: `{ opened: true }`. The action must
belong to the current plugin and still resolve to an available target.

<!-- lensx-host-api-method {"method":"runtime.get_context","provider":"base","version":"0.3.0","capability":"session"} -->
### `runtime.get_context`

Params: `{}`. Result: the complete context containing `hostApiVersion`,
`locale`, `theme`, and sorted unique `capabilities`. Context events are full
replacements, not patches.

<!-- lensx-host-api-method {"method":"storage.delete","provider":"storage","version":"0.3.0","capability":"session"} -->
### `storage.delete`

Params: `{ key: string }`. Result: `{ deleted: boolean }` in the current
plugin-scoped Host storage namespace.

<!-- lensx-host-api-method {"method":"storage.get","provider":"storage","version":"0.3.0","capability":"session"} -->
### `storage.get`

Params: `{ key: string }`. Result: `{ found: false }` or
`{ found: true, value: JsonValue }`.

<!-- lensx-host-api-method {"method":"storage.get_quota","provider":"storage","version":"0.3.0","capability":"session"} -->
### `storage.get_quota`

Params: `{}`. Result: `{ usedBytes: number, limitBytes: number }`. A later write
can still fail with `limit_exceeded`.

<!-- lensx-host-api-method {"method":"storage.list","provider":"storage","version":"0.3.0","capability":"session"} -->
### `storage.list`

Params: optional `{ cursor, limit }`. Result: sorted `keys` and an optional
opaque `nextCursor`.

<!-- lensx-host-api-method {"method":"storage.set","provider":"storage","version":"0.3.0","capability":"session"} -->
### `storage.set`

Params: `{ key: string, value: JsonValue }`. Result: `{ stored: true }`.

<!-- lensx-host-api-method {"method":"ui.close","provider":"base","version":"0.3.0","capability":"session"} -->
### `ui.close`

Params: `{}`. Result: `{ accepted: true }`. Only the matching current page may
close; a replaced session cannot close a newer attempt.

## Stable errors

<!-- lensx-host-api-errors {"version":"0.3.0","codes":["cancelled","conflict","internal_error","invalid_params","invalid_request","limit_exceeded","method_not_found","not_found","timeout","unavailable"]} -->

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

For HTTP, `invalid_params` covers rejected parameters or destinations;
`limit_exceeded` covers size/concurrency limits; `timeout` and `cancelled`
represent termination; and `unavailable` covers network, DNS, TLS, or an
unsupported response. These safe categories do not identify an underlying
network cause. A completed HTTP status remains a result, not a Host error.

## Recovery

Cancel obsolete operations when the page or attempt changes. Atomically replace
locale, theme, and capabilities on each context event. On disconnect, reload,
or replacement, treat old callbacks and pending work as inert. A retry creates
a fresh SDK and subscriptions; it never revives an old session.

See [Runtime and security](runtime-permissions-security.md) for the full
lifecycle and [Compatibility and errors](compatibility-and-errors.md) for
version recovery.
