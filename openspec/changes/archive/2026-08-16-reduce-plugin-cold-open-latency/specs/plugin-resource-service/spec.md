## ADDED Requirements

### Requirement: Host resource byte caching MUST remain bounded, generation-bound and revocable
The Resource Service MUST provide a Host-owned byte cache and MAY reuse only immutable plugin package bytes that already passed the complete path, regular-file, size, file-identity, payload-ownership and final revalidation rules. The Host byte cache MUST be process-local, MUST retain at most 32 MiB and 256 entries, and MUST keep the existing per-file size limit. A cache key MUST include entry identity, installed-or-development payload variant identity, resource generation and normalized relative resource path; plugin ID, version, digest or path alone MUST NOT identify a reusable value.

Before every cache lookup and before delivering cached bytes, the Host MUST validate the opaque scope, current Manager projection, payload ownership, resource generation, Runtime attempt and actual current Child WebView source. Replacement, reload, disable, uninstall, development retirement and shutdown MUST revoke cache eligibility before payload cleanup and MUST make in-flight old-generation lookup results unusable. Browser responses MUST retain `Cache-Control: no-store`; a Host memory cache MUST NOT create browser authority or allow an old URL or WebView to avoid a new current-source check. Cached values MUST contain only immutable package bytes, fixed MIME and bounded length and MUST NOT contain user content, URL, scope, attempt, WebView label, nonce, raw error or Host-private token.

#### Scenario: Current generation reopens after a real Page close
- **WHEN** a new Runtime attempt for the same still-current resource generation requests a previously verified package resource
- **THEN** the Host MAY reuse immutable cached bytes after validating the new attempt and actual current Child WebView source
- **THEN** byte reuse restores no prior Session, Worker, model, user content or Runtime authority

#### Scenario: Current request misses the byte cache
- **WHEN** no exact entry, payload variant, generation and normalized resource-path value exists
- **THEN** the Host performs the complete existing filesystem and identity validation before publishing and returning an immutable cache value
- **THEN** a partial read, unknown MIME, linked path, changed file or failed final validation publishes no value

#### Scenario: Generation changes during a cache hit
- **WHEN** replacement, reload, disable, uninstall or development retirement changes currentness while an old-generation cache lookup is in flight
- **THEN** the final compare-current validation rejects the result and no cached bytes reach the old or replacement WebView
- **THEN** payload cleanup cannot make the revoked value current again

#### Scenario: Cache reaches a capacity bound
- **WHEN** inserting a value would exceed 32 MiB or 256 entries
- **THEN** the Host evicts bounded existing values or serves the current request without caching while preserving functional and security behavior
- **THEN** capacity pressure never relaxes file limits, currentness validation or revocation

#### Scenario: Old WebView relies on browser cache
- **WHEN** a destroyed or replaced WebView reuses an old URL after generation or attempt revocation
- **THEN** browser `no-store` requires a new protocol request and the actual-source/currentness check rejects it
- **THEN** the existence of an equivalent Host byte-cache value grants no access
