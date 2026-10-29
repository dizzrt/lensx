# Open Isolated Plugin Runtime Specification

## Purpose

Define the current open Web execution baseline for installed plugins while preserving strict separation from Host-native authority, other plugins, and obsolete Runtime generations.
## Requirements

### Requirement: Installation must be the sole current trust decision for plugin behavior

The system MUST interpret installing, replacing, or development-registering a plugin as the user's decision to allow that plugin to run inside its own isolated Web Runtime.

#### Scenario: Installation communicates the plugin trust boundary

- **WHEN** a plugin is installed, replaced, or registered for development
- **THEN** It MUST NOT create lensX permission requests, grants, or per-capability authorization interactions for Workers, network access, remote resources, `blob:`, `data:`, WASM, or browser origin storage.
- **THEN** Trusted Host installation UI MUST explain that lensX isolates the Host and other plugins but does not review, endorse, or continuously monitor how a plugin processes data the user deliberately gives it.

#### Scenario: User installs a plugin that uses network and Worker
- **WHEN** the user confirms installation of a valid compatible plugin whose Runtime creates a Dedicated Worker and accesses a remote service
- **THEN** the Host shows no lensX permission selection, creates no grant, and allows the behavior to enter the same isolated Web Runtime
- **THEN** installation confirmation is not described as a lensX security endorsement of the plugin's behavior or remote service

#### Scenario: User rejects installation
- **WHEN** the user cancels candidate installation before durable commit
- **THEN** the Host creates no Registration, Runtime, Web context, or persistent trust state
- **THEN** cancellation leaves no permission decision, grant, or denial history

### Requirement: The open Web Runtime must remain separate from Host-native authority

The plugin Runtime MUST support ordinary Web content and connections within the target WebView baseline, including page-lifetime Dedicated Workers, browser network requests, remote resources, `blob:`, `data:`, WASM, and browser origin storage.

#### Scenario: Ordinary Web capabilities remain unprivileged

- **WHEN** plugin content uses browser capabilities within the page lifetime
- **THEN** Ordinary Web capabilities MUST NOT expose Tauri IPC, Host DOM, arbitrary Rust commands, filesystem, Shell, process, or unpublished native providers, and MUST NOT promise SharedWorker, ServiceWorker, or background execution beyond the page lifetime.

#### Scenario: The SDK invokes controlled Host HTTP

- **WHEN** a current trusted Session invokes the published `http.request` method through the current Host API
- **THEN** The `http.request` method added in Host API `0.3.0` MUST be a separate, explicit, controlled public method invoked through the SDK and the current trusted Session.
- **THEN** It does not change browser fetch CORS/CSP behavior or provide arbitrary native APIs.
- **THEN** It MUST provide only restricted public Internet HTTPS transport on port 443, subject to the destination, DNS, header/body, deadline, concurrency, cancellation, and cleanup limits in the separate HTTP specification.
- **THEN** Translation business logic and service signing MUST remain in the plugin; all plugins use the same HTTP boundary.

#### Scenario: Plugin uses open Web capabilities
- **WHEN** a current plugin loads a remote subresource, creates a package, remote, or Blob Dedicated Worker, or uses a browser network connection
- **THEN** the WebView follows browser-standard behavior without consulting a lensX grant
- **THEN** the Worker or network context still cannot obtain Tauri, a Host-private command, another plugin Session, or cross-origin data prohibited by browser policy

#### Scenario: Plugin requests an unpublished native capability
- **WHEN** a plugin attempts to call Tauri, an arbitrary Rust command, Shell, filesystem, or a removed Host clipboard method
- **THEN** the Host boundary rejects the call or provides no entry
- **THEN** ordinary Web behavior, official or development provenance, and installation facts create no additional native authority

#### Scenario: Plugin uses the published HTTP capability
- **WHEN** the current Context includes `http.request` and the plugin sends a request satisfying the controlled HTTP contract through the public SDK
- **THEN** Host transport can return bounded HTTP status and content without depending on browser CORS response headers
- **THEN** the plugin cannot obtain Host cookies, files, private-network access, another Session, or general native execution

### Requirement: Every plugin and generation must remain an independent security domain

The Host MUST maintain an independent, author-unselectable origin, path scope, Session identity, storage namespace, and navigation lease for each current plugin resource generation. A plugin's package, remote content, Worker, Blob, network response, browser storage, or SDK message MUST NOT read, write, navigate to, or reuse protected state belonging to the Host, another plugin, or an old generation.

#### Scenario: Remote code attempts cross-plugin access
- **WHEN** remote code loaded by a plugin attempts to access the Host origin, another plugin origin, an old-generation URL, DOM, storage, or MessagePort
- **THEN** origin, sandbox, Session, and Resource boundaries prevent access
- **THEN** failure discloses no target URL, scope, path, nonce, Port content, or Host-private error

#### Scenario: Current generation is replaced
- **WHEN** a plugin is closed, disabled, uninstalled, replaced, or commits a new generation through development reload
- **THEN** the Host terminates the old iframe, Dedicated Workers, Session, Port, requests, and leases
- **THEN** old Web contexts cannot recover authority in a new page or process

### Requirement: Source and community information must not change Runtime authority

Official, external, and development plugins MUST use the same Web Runtime, Host isolation, Session, resource, and lifecycle boundaries.

#### Scenario: Source labels accompany public HTTP and Runtime behavior

- **WHEN** plugins from any source execute Web Runtime or public HTTP behavior, or provenance or community information is displayed or changes
- **THEN** Availability and control policies for public `http.request` MUST apply equally to every plugin source and MUST NOT be bound to the Translation ID or official provenance.
- **THEN** Publisher, repository, release digest, future scan, rating, or community labels MAY inform display and selection, but MUST NOT relax Host isolation, grant additional native capabilities, or change cross-plugin conclusions.

#### Scenario: Official and external plugins perform the same behavior
- **WHEN** official and external plugins load the same Worker, network connection, or remote resource, or invoke the same public HTTP method
- **THEN** they follow the same browser baseline or the same controlled HTTP provider policy respectively
- **THEN** official provenance receives no Tauri, private Host API, cross-plugin, or persistent-background exception

#### Scenario: Community information is absent or changes
- **WHEN** a plugin has no rating, scan, or signature, or its community information changes later
- **THEN** the installed Runtime's Host authority neither expands nor contracts because of that information
- **THEN** users can still control whether the plugin continues running through Host disable and uninstall

### Requirement: Open Web baseline MUST execute in a top-level Child WebView context
Dedicated Worker, package/remote HTTPS resources, WSS/HTTPS connections, Blob/Data, WASM and browser origin storage MUST be tested as ordinary Web capabilities of the current top-level Child WebView, without permission prompts. None MUST grant Host DOM, general Tauri, native command, another plugin, old generation or persistent background authority. Official, development and community sources MUST share this exact boundary.

#### Scenario: Plugin uses ordinary Web capabilities
- **WHEN** a current Child WebView uses each supported Web baseline category
- **THEN** supported behavior succeeds without lensX grants while Host-native negative paths remain blocked

#### Scenario: Source metadata changes
- **WHEN** the same package is labeled official, local, development or community
- **THEN** its Child WebView and bridge authority remain identical

### Requirement: Open execution MUST not rely on OS process separation
Isolation claims MUST derive from current WebView identity, origin/data store, resource source binding, navigation, bridge ACL and terminal lifecycle. Tests and documentation MUST NOT claim that one Child WebView always receives a distinct WebContent process.

#### Scenario: WebKit reuses a content process
- **WHEN** platform diagnostics show process reuse
- **THEN** security acceptance remains based on enforced logical boundaries and must still pass all escape tests

### Requirement: The open Web baseline MUST have deterministic capability and Host-boundary validation

Maintained validation MUST cover package and remote resource policy, Dedicated Worker and browser-capability classification, Host and cross-plugin denial, generation teardown state, and Launcher lifecycle non-interference through deterministic Contract, resource, CSP, Session, state-machine, and malicious-fixture tests. It MUST NOT claim real browser execution or retain target-WebView, responsiveness, or environment-evidence prerequisites.

#### Scenario: Deterministic open Runtime matrix passes

- **WHEN** supported Web categories and malicious cross-boundary fixtures run through the maintained deterministic tests
- **THEN** browser-standard capabilities remain permissionless in the public contract while Host, Tauri, cross-plugin, and stale-generation authority remain denied
- **THEN** terminal state tests prove modeled resources and authority are revoked

#### Scenario: Environment proof is proposed as completion evidence

- **WHEN** a maintained caller requires a browser, WebView, GUI, native harness, timing sample, or committed environment record
- **THEN** validation governance rejects that caller
- **THEN** the open Web product boundary remains unchanged without an optional environment Gate
