## MODIFIED Requirements

### Requirement: Methods, MIME types, and response headers MUST be fixed and content sniffing MUST be prohibited

Protocol v0 MUST support only `GET` and `HEAD`, and MUST NOT support Range,
conditional requests, content negotiation, directory indexes, or arbitrary
downloads. Based only on a fixed ASCII case-insensitive table keyed by the final
extension, the Host MUST return exact MIME types for HTML, JavaScript or ES
modules, CSS, JSON, Wasm, PNG, JPEG, GIF, WebP, AVIF, SVG, ICO, and WOFF2. An
unknown extension MUST NOT fall back to `application/octet-stream`. A successful
response MUST contain accurate `Content-Type` and `Content-Length`,
`X-Content-Type-Options: nosniff`, and `Cache-Control: no-store`, and MUST NOT
add wildcard CORS. Every successful current scoped HTML response MUST also
contain the exact Host-owned Plugin Runtime Content Security Policy; GET and
HEAD MUST return identical security headers. Non-HTML resources, failures,
stale scopes, author metadata, request headers, query input, source and
publisher facts MUST NOT select, omit or relax that policy. The handler MUST
serve the validated bytes unchanged and MUST NOT rewrite HTML to inject CSP.

#### Scenario: GET returns a known resource type

- **WHEN** a GET request targets a valid resource with an allowed extension
- **THEN** the response uses the fixed MIME type, accurate length, `nosniff`,
  `no-store`, and the complete body
- **THEN** the Host does not inspect the content to guess another MIME type

#### Scenario: GET returns a current scoped HTML document

- **WHEN** a GET request targets a valid HTML resource for the current scope
- **THEN** the response includes the exact Host-owned Plugin Runtime CSP in
  addition to the fixed MIME, length, `nosniff`, and `no-store` headers
- **THEN** the returned body remains the validated package bytes and no author
  meta policy, request input, source, publisher, or grant widens the Header

#### Scenario: HEAD requests a valid resource

- **WHEN** a HEAD request targets the same URL as a successful GET
- **THEN** the status, `Content-Type`, `Content-Length`, and security headers are
  identical, including the Plugin Runtime CSP for HTML, and the body is empty
- **THEN** the handler still performs the same scope, path, lifecycle, and MIME
  validation

#### Scenario: A request targets an unknown extension

- **WHEN** the final extension of a valid payload path is not in the fixed
  allowlist
- **THEN** the handler rejects it as an ordinary unavailable resource and
  returns no bytes
- **THEN** the response does not use `application/octet-stream` or browser MIME
  sniffing

#### Scenario: A request uses an unsupported method or Range

- **WHEN** a request uses POST, PUT, DELETE, Range, or a conditional header
- **THEN** methods other than GET and HEAD receive `405` with the fixed
  `Allow: GET, HEAD` header, and unsupported read variants fail safely
- **THEN** the handler writes no file, returns no partial content, and changes no
  Host state

#### Scenario: A stale or failed request attempts to obtain policy-dependent content

- **WHEN** an old generation, mismatched scope, unsafe path, unavailable entry,
  unsupported method, or other failed request targets HTML
- **THEN** the existing fixed failure response returns no plugin body and cannot
  be transformed into a usable relaxed Runtime document
- **THEN** response differences reveal no current scope, policy exception,
  plugin identity, path or existence detail

