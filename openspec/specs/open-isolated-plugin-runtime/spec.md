# Open Isolated Plugin Runtime Specification

## Purpose

Define the current open Web execution baseline for installed plugins while preserving strict separation from Host-native authority, other plugins, and obsolete Runtime generations.
## Requirements
### Requirement: Installation must be the sole current trust decision for plugin behavior

The system MUST interpret installing, replacing, or development-registering a plugin as the user's decision to allow that plugin to run inside its own isolated Web Runtime. It MUST NOT create lensX permission requests, grants, or per-capability authorization interactions for Workers, network access, remote resources, `blob:`, `data:`, WASM, or browser origin storage. Trusted Host installation UI MUST explain that lensX isolates the Host and other plugins but does not review, endorse, or continuously monitor how a plugin processes data the user deliberately gives it.

#### Scenario: User installs a plugin that uses network and Worker
- **WHEN** the user confirms installation of a valid compatible plugin whose Runtime creates a Dedicated Worker and accesses a remote service
- **THEN** the Host shows no lensX permission selection, creates no grant, and allows the behavior to enter the same isolated Web Runtime
- **THEN** installation confirmation is not described as a lensX security endorsement of the plugin's behavior or remote service

#### Scenario: User rejects installation
- **WHEN** the user cancels candidate installation before durable commit
- **THEN** the Host creates no Registration, Runtime, Web context, or persistent trust state
- **THEN** cancellation leaves no permission decision, grant, or denial history

### Requirement: The open Web Runtime must remain separate from Host-native authority

The plugin Runtime MUST support ordinary Web content and connection capabilities within the target WebView baseline, including page-lifetime Dedicated Workers, network requests, remote resources, `blob:`, `data:`, WASM, and browser origin storage. These capabilities MUST NOT expose Tauri IPC, Host DOM, arbitrary Rust commands, filesystem, Shell, process, or an unpublished native provider, and MUST NOT promise SharedWorker, ServiceWorker, or background execution that outlives the current page lifecycle.

#### Scenario: Plugin uses open Web capabilities
- **WHEN** a current plugin page loads a remote subresource, creates a package, remote, or Blob Dedicated Worker, or opens a browser network connection
- **THEN** the target WebView follows browser-standard behavior without consulting a lensX grant
- **THEN** the Worker or network context still cannot obtain Tauri, a Host-private command, another plugin Session, or cross-origin data

#### Scenario: Plugin requests an unpublished native capability
- **WHEN** a plugin attempts to call Tauri, an arbitrary Rust command, Shell, filesystem, or a removed Host clipboard method
- **THEN** the Host boundary rejects the call or provides no such call surface
- **THEN** open Web behavior, official source, development source, and installation facts create no native authority

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

Official, external, and development plugins MUST use the same Web Runtime, Host isolation, Session, resource, and lifecycle boundaries. Publisher, repository, release digest, future scans, ratings, and community labels MAY inform display and selection, but MUST NOT relax Host isolation, grant native capability, or change cross-plugin conclusions.

#### Scenario: Official and external plugins perform the same behavior
- **WHEN** official and external plugins each load the same kind of Worker, network, or remote resource
- **THEN** the Runtime reaches the same allowed or failed conclusion from the current WebView and isolation baseline
- **THEN** official source receives no Tauri, Host API, cross-plugin, or persistent-background exception

#### Scenario: Community information is absent or changes
- **WHEN** a plugin has no rating, scan, or signature, or its community information changes later
- **THEN** the installed Runtime's Host authority neither expands nor contracts because of that information
- **THEN** the user can still control whether the plugin continues to run through Host-owned disable and uninstall operations

### Requirement: The open Web baseline must have target-WebView and Host-availability evidence

The system MUST verify the open Web success path, Host and cross-plugin negative paths, generation teardown, and Launcher responsiveness through both deterministic tests and target macOS WKWebView evidence. Simulated DOM behavior, source inspection, ordinary browser loading, and community review MUST NOT individually substitute for evidence of real Runtime isolation and termination.

#### Scenario: Focused open Runtime gate passes
- **WHEN** the package and remote resource, Dedicated Worker, network, Blob and Data, replacement, close, disable, and malicious cross-boundary matrix all run
- **THEN** supported Web behavior succeeds, Host and cross-plugin access fails, and old contexts terminate completely
- **THEN** evidence contains no user data, complete URL, origin token, scope, path, payload, nonce, Port content, or raw exception

#### Scenario: WebView cannot prove isolation or teardown
- **WHEN** the target WebView cannot prove that an open context cannot reach the Host or other plugins, or cannot reclaim a Dedicated Worker and old authority when the page terminates
- **THEN** the open Runtime capability remains incomplete
- **THEN** the implementation does not use a shared origin, Tauri exposure, ignored residual context, or removal of negative tests as a fallback

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

