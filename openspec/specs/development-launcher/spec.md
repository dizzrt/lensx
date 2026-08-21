# Development Launcher Specification

## Purpose

Define the single Host-owned desktop development launcher, its authoritative
development App origin, mode composition, process lifecycle, and deterministic
validation boundary.

## Requirements

### Requirement: Maintained desktop development MUST use one Host-owned launcher

The system MUST provide one unified Host-owned launcher for complete desktop
development. The launcher MUST create and retain the Rsbuild development server
before starting Tauri, MUST use the actual loopback port returned by Rsbuild,
and MUST NOT establish authority by probing and then releasing a socket, parsing
human-oriented logs, or reading a temporary port file. A standalone frontend
development entry point MAY remain, but it MUST NOT be described as complete
desktop process orchestration.

#### Scenario: Preferred port is available

- **WHEN** a developer starts the application through the maintained ordinary
  desktop development entry point and the preferred port is available
- **THEN** the launcher first makes Rsbuild listen on that port and then starts
  Tauri with the actual port returned by Rsbuild
- **THEN** the run has exactly one Rsbuild server owned by the launcher

#### Scenario: Preferred port is occupied

- **WHEN** another process occupies the preferred port and Rsbuild resolves a
  different available loopback port
- **THEN** the launcher retains the actual server listener and starts Tauri
  with the resolved port
- **THEN** Tauri does not connect to the occupied preferred port or require the
  developer to modify committed configuration manually

#### Scenario: Rsbuild startup fails

- **WHEN** Rsbuild configuration, compilation, or listening fails before an
  actual port is returned
- **THEN** the launcher returns a stable nonzero result and does not spawn Tauri
- **THEN** it leaves no port reservation, temporary configuration, or background
  process owned by the run

### Requirement: One validated development App origin MUST bind every Host security consumer

The launcher MUST encode the actual port as the run's only
`http://localhost:<port>/` App target and pass it through Tauri runtime
configuration. The Rust Host MUST validate and obtain the exact target from that
configuration. The main-window navigation policy and the plugin Runtime
`frame-ancestors` directive MUST consume the same fact and MUST NOT derive it
from the Manifest, a plugin request, a frontend message, an HTTP header, logs,
or a separate port environment variable. Release builds MUST continue to use
`tauri://localhost` and MUST NOT start a local HTTP server.

#### Scenario: Dynamic origin is propagated completely

- **WHEN** Rsbuild listens on actual port `P` and the launcher prepares the
  Tauri child
- **THEN** the Tauri `devUrl`, the Host main-document navigation target, and the
  plugin Runtime CSP ancestor all use exactly `http://localhost:P`
- **THEN** every plugin CSP directive other than the trusted ancestor remains
  identical to the production profile

#### Scenario: Development App target is untrusted

- **WHEN** the development target in runtime configuration is missing or has a
  non-HTTP scheme, a host other than exact `localhost`, a missing or invalid
  port, credentials, a non-root path, a query, or a fragment
- **THEN** the Rust Host fails startup before creating trusted navigation or
  plugin resource authority
- **THEN** the system does not fall back to `40755`, a wildcard ancestor, the
  request Host, or a plugin-provided origin

#### Scenario: Release application starts

- **WHEN** a release build loads the bundled Host document
- **THEN** the App target and trusted plugin ancestor retain the existing
  `tauri://localhost` profile
- **THEN** the unified development launcher, dynamic port, and development
  `devUrl` do not enter release Runtime authority

### Requirement: Ordinary and Plugin Development modes MUST compose over the same launcher

Ordinary desktop development and the stable `dev:plugin-development-mode`
command MUST reuse the same server, Tauri configuration, child lifecycle, and
cleanup implementation. Ordinary mode MUST NOT enable the Plugin Development
Mode frontend composition, Rust feature, startup root, or process-local switch.
Plugin Development Mode MUST enable the existing build capability before
creating the Rsbuild configuration and Tauri child, MUST preserve the default
repository `plugins/` root and one `--plugins-root <path>` override, and MUST NOT
change existing bootstrap, snapshot, Registration, or Runtime semantics.

#### Scenario: Ordinary desktop development starts

- **WHEN** a developer runs the maintained ordinary desktop development command
- **THEN** the unified launcher starts the application with the ordinary
  Rsbuild composition and ordinary Tauri feature set
- **THEN** Plugin Development Mode remains unavailable and no startup root is
  read or exposed

#### Scenario: Dedicated plugin development command starts

- **WHEN** a developer runs `dev:plugin-development-mode` with an optional valid
  `--plugins-root <path>`
- **THEN** the same launcher enables the frontend capability before resolving
  the Rsbuild configuration and adds the `plugin-development-mode` feature and
  normalized Host-private startup root for Tauri
- **THEN** the port, origin, and child lifecycle use the same implementation
  as ordinary mode, while existing Host bootstrap continues to own plugin
  registration

#### Scenario: Plugin development arguments are invalid

- **WHEN** the dedicated command receives an unknown or duplicate argument or
  an argument without its required value
- **THEN** the launcher returns a stable nonzero diagnostic before creating an
  Rsbuild server or Tauri child
- **THEN** the diagnostic does not disclose absolute plugin paths, environment
  contents, raw exception stacks, or private Host state

### Requirement: Launcher-owned processes MUST converge through one terminal lifecycle

The launcher MUST enforce a monotonic and idempotent terminal lifecycle for the
Rsbuild server and Tauri child. A Tauri spawn failure or exit, a supported
terminal signal received by the parent, and a server or child error MUST all
eventually close the server owned by the launcher. A signal MUST be forwarded
at most once to a still-live Tauri child. The final result MUST preserve the
primary nonzero Tauri exit code or signal semantics, and late events and repeated
cleanup MUST have no effect.

#### Scenario: Tauri exits successfully or with a failure

- **WHEN** the Tauri child terminates with a zero or nonzero exit code
- **THEN** the launcher closes Rsbuild, removes its own signal handlers, and
  terminates with the corresponding result
- **THEN** no server or child owned by the launcher remains in the background

#### Scenario: Parent receives a terminal signal

- **WHEN** the running launcher receives one or repeated `SIGINT` or `SIGTERM`
  signals
- **THEN** it forwards a terminal signal at most once to a still-live Tauri
  child, waits for terminal convergence, and closes Rsbuild
- **THEN** repeated signals, a late child exit, and a late server error do not
  close twice, spawn again, or overwrite the primary terminal result

#### Scenario: Tauri cannot spawn

- **WHEN** Rsbuild is listening but creation of the Tauri child fails
- **THEN** the launcher closes Rsbuild and returns a stable nonzero result
- **THEN** it does not automatically select another port, retry Tauri, or retain
  a partially started state

### Requirement: Delivery MUST use deterministic governed validation and bilingual documentation

Delivery MUST provide a stable `development-launcher` Gate in the typed Gate
registry. Rstest, Rust unit tests, static policy, and bilingual documentation
checks MUST cover port resolution and propagation, mode isolation,
configuration rejection, spawn, exit, and signal races, idempotent cleanup,
production invariance, and the public boundary. The Gate MUST be read-only and
MUST NOT add a Change-specific root alias or launch the Tauri GUI, an Rsbuild
listener, a browser, a real WebView, a native harness, screenshots, visual
baselines, or a target-environment performance flow.

#### Scenario: Stable Gate passes completely

- **WHEN** the `development-launcher` Gate and its dependencies run locally or
  in CI
- **THEN** the fake server and child model, Rust origin and CSP policy,
  source-and-configuration drift checks, and English and Simplified Chinese
  documentation assertions pass deterministically
- **THEN** the Gate ID resolves and no direct Rstest file list or root script
  named after the Change is added to the maintained interface

#### Scenario: Real-environment step is proposed as a completion condition

- **WHEN** validation attempts to start `tauri dev`, a real Rsbuild listener, a
  browser, a WebView, a GUI application, or retained optional or manual
  environment evidence
- **THEN** validation governance rejects the step
- **THEN** the missing assertion is redesigned as a pure function, fake
  lifecycle, Rust policy, static check, or a future independent Change
