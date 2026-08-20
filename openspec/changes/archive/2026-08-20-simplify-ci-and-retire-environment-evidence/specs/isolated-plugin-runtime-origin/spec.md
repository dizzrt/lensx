## MODIFIED Requirements

### Requirement: Isolated origin MUST enable the representative module graph without CORS relaxation

The isolated-origin resource and bundle contract MUST support canonical package HTML, CSS, images, classic scripts, the ES Module entry, and its module dependencies under the production Child WebView policy. Resource responses MUST retain `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` and MUST NOT add wildcard `Access-Control-Allow-Origin`, authorize `Origin: null`, or treat the request Origin as authorization. A classic-only or inline-only bundle, or a test that removes the module case, MUST NOT satisfy completion. Maintained validation SHALL use deterministic resource-response, package, module-graph, URL grammar, MIME, header, and negative-boundary tests and SHALL NOT require target-WebView execution.

#### Scenario: Validate a same-origin module dependency graph

- **WHEN** a normal canonical `.lxp` fixture resolves its entry module and at least one package-relative dependency from the current isolated origin
- **THEN** every resource in the modeled module graph remains bound to the same current origin, scope, and generation
- **THEN** validation does not depend on wildcard or null CORS, network fallback, or an inlined dependency

#### Scenario: Module graph contract is invalid

- **WHEN** the graph becomes opaque-origin or shared-origin, omits a dependency request, resolves an invalid MIME/path, or requires relaxed CORS
- **THEN** deterministic validation fails and the capability remains incomplete
- **THEN** the team updates the OpenSpec origin mechanism rather than weakening the public bundle contract

#### Scenario: Validation attempts to require target WebView proof

- **WHEN** a maintained completion path requires a real WebView module execution record
- **THEN** validation governance rejects that path
- **THEN** the product contract remains while the environment evidence is not retained as an optional Gate
