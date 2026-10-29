# Spec Delta

## MODIFIED Requirements

### Requirement: Production Host MUST route requests through a closed Dispatcher bound to a trusted Session

The production Host MUST route Host API `0.4.0` requests through a closed Dispatcher bound to the current trusted Runtime Session, including Action activation methods whose real providers are available.

#### Scenario: Current Session calls a non-privileged method
- **WHEN** the current plugin invokes a navigation, Context, storage, HTTP, close, or Action activation method in the current catalog with a composed provider
- **THEN** the Dispatcher executes from Session identity and Host facts and returns a Contract-valid result
- **THEN** plugin-provided identity, source, or Web behavior cannot change the Host target or HTTP control boundary

#### Scenario: Plugin calls a removed or private method
- **WHEN** a plugin invokes clipboard, permission mutation, Tauri, unknown, or Host-private methods
- **THEN** the Dispatcher returns a stable closed-contract failure before native side effects
- **THEN** installation, official source, network, or Worker context creates no bypass

#### Scenario: Plugin attempts to forge authority
- **WHEN** a request, private frame, or plugin code attempts to submit plugin/Page identity, origin, Registration revision, provider, executor, Tauri command, storage namespace, paths, or Host objects
- **THEN** exact Contract/transport validation rejects it before the Dispatcher, or the Dispatcher ignores authority not derived from the Session lease
- **THEN** forged values cannot select plugins, Pages, Registrations, storage namespaces, or Host services

#### Scenario: Method is unknown or provider is unavailable
- **WHEN** a method outside the catalog is invoked or a declared method is invoked without its provider available
- **THEN** stable `method_not_found` or `unavailable` is returned respectively
- **THEN** the Dispatcher invokes no fallback storage, browser fetch, arbitrary native executor, or other implicit fallback

#### Scenario: Compose only current public providers in production
- **WHEN** a ready trusted Runtime Session receives a Host API request
- **THEN** the Dispatcher MUST compose base navigation/Context, plugin-scoped storage, public controlled HTTP, and Session-owned Action activation providers; it MUST NOT compose permission/grant, native clipboard, arbitrary Tauri commands, or implicit proxies for ordinary Web behavior.
- **THEN** `http.request` MUST be an explicit public method executing generic HTTPS transport without translation, signing, or credential-management business logic.
- **THEN** Every request MUST pass strict Contract validation, identity/currentness checks, cancellation, deadlines, and bounded response validation.

#### Scenario: Reject wire-selected Host identities and targets
- **WHEN** a plugin sends an unknown, malformed, unavailable, or identity-overriding request
- **THEN** Plugins or wire payloads MUST NOT choose or override plugin ID, Page ID, Registration revision, Runtime attempt, origin, provider, executor, Tauri command, storage namespace, paths, or other Host objects.
- **THEN** Unknown or malformed methods MUST be rejected before a handler; defensive direct dispatch MUST return stable `method_not_found`, while declared methods without an available current provider MUST return stable `unavailable` without side effects.

#### Scenario: Activation requests cannot select another source
- **WHEN** the current plugin calls actions.get_activation or actions.subscribe_activations
- **THEN** the Dispatcher derives activation state from the current Session and Page attempt and accepts no plugin-supplied source, owner, Page, or native binding
- **THEN** actions.open creates a new normal invocation without inheriting earlier shortcut provenance

### Requirement: Runtime Context MUST derive from current Host facts and real provider availability

The Dispatcher MUST derive complete Context from the current Host API `0.4.0` catalog, trusted Session, locale/theme, and actually composed providers; a missing activation provider does not invalidate other capabilities or empty-capability Context.

#### Scenario: Only base and storage providers are available
- **WHEN** the current Session binds only base and scoped-storage providers
- **THEN** Context lists only their corresponding methods in sorted, unique order, excluding `http.request`
- **THEN** clipboard, permissions, ordinary browser network, and Worker do not appear in the method list

#### Scenario: HTTP provider is available
- **WHEN** the current trusted Session composes an available controlled HTTP provider
- **THEN** complete Context includes `http.request`, with the same decision for every plugin source
- **THEN** HTTP unavailability omits the method without falling back to plugin-specific native shortcuts

#### Scenario: Legacy permission facts remain in an isolated record
- **WHEN** recovery encounters old permission/grant fields in isolated records or stale frontend payloads
- **THEN** the Dispatcher ignores their authority and rejects incompatible boundary data
- **THEN** Context does not project old clipboard capabilities

#### Scenario: Unavailable capabilities are excluded from Context
- **WHEN** a composed provider is unavailable to the current Session
- **THEN** Context removes only the affected methods
- **THEN** catalog membership, Manifest content, official source, and old facts cannot make a method a current capability

#### Scenario: Storage namespace becomes degraded
- **WHEN** the Host confirms that the current identity's storage namespace is damaged or blocked while the rest of the Session remains valid
- **THEN** the Host publishes complete Context without the five storage capabilities, leaving other capabilities unchanged
- **THEN** identical degraded snapshots are not repeated, and Context contains no storage paths, values, usage, or diagnostics

#### Scenario: Locale or theme changes
- **WHEN** application locale/theme changes while Session identity and provider availability remain valid
- **THEN** the Host sends one complete, Contract-valid, frozen Context replacement
- **THEN** the SDK replaces all Context before notifying subscribers, and plugins see no Host-private state

#### Scenario: Session authority changes
- **WHEN** Registration revision, resource generation, or Runtime attempt changes invalidate old Session identity
- **THEN** the old Session terminates and its old Context cannot authorize subsequent provider calls
- **THEN** `runtime.context_changed` cannot grant new identity to or reauthorize the old Session

#### Scenario: Derive available methods from actually composed providers
- **WHEN** the Dispatcher constructs Context for a current Session
- **THEN** It MUST NOT read Manifest permission requests, persisted grants, permission catalogs, or clipboard availability, and MUST NOT list ordinary browser capabilities as Host API methods.
- **THEN** Context MUST list the separate `http.request` method only when the controlled HTTP provider is currently available.

#### Scenario: Publish complete Context replacements and retire invalid identities
- **WHEN** a runtime.get_context call or Host fact change occurs
- **THEN** `runtime.get_context` MUST accept exact `{}` and return complete, Contract-valid, copied, frozen Context.
- **THEN** Real locale, theme, or provider-availability changes in the same Session MUST publish one complete `runtime.context_changed` replacement; identical snapshots MUST NOT be published repeatedly.
- **THEN** Invalidation of identity, Registration revision, resource generation, or Runtime attempt MUST terminate the old Session and MUST NOT reauthorize it through events.

#### Scenario: Compose or omit an activation provider
- **WHEN** the current Session has a valid composed activation provider or that provider is absent
- **THEN** the former Context advertises the available actions.get_activation and actions.subscribe_activations methods, while the latter omits unavailable methods
- **THEN** Context retains its four-field shape, and independent queries and events provide activation facts without inventing plugin permissions or native input-monitoring capabilities

### Requirement: Delivery MUST prove deterministic production composition without absorbing later capabilities

Production `PluginRuntimeSlot` MUST install a real Session-scoped Dispatcher for the current ready lease instead of a fixed unavailable handler; tests retain explicit fake/unavailable binding injection.

#### Scenario: Production Dispatcher composition and storage loops pass
- **WHEN** deterministic production-composition tests connect public Contract/SDK to the current Dispatcher Session
- **THEN** Context, Page close, same-plugin Actions, independent activation, scoped storage, and controlled HTTP all use current trusted adapters
- **THEN** public plugins cannot import Host-private wire types, Tauri, storage paths, authority coordinators, or executors

#### Scenario: Removed native and permission methods stay unavailable
- **WHEN** current or old fixtures request clipboard, permission mutation, arbitrary Tauri, or methods outside the current Host API `0.4.0` catalog
- **THEN** the closed Contract/Dispatcher rejects them without provider side effects or capability projection
- **THEN** validation does not describe removed methods as permission-denied, grantable, or delivered

#### Scenario: Real Runtime evidence is inferred from deterministic composition
- **WHEN** only deterministic tests and package checks have run
- **THEN** conclusions may confirm maintained production composition and boundary coverage
- **THEN** they MUST NOT claim real WebView, real-account HTTP, or native roundtrips were executed

#### Scenario: Validate real production composition with controlled providers
- **WHEN** deterministic delivery checks exercise the production Runtime Dispatcher and public package boundaries
- **THEN** Delivery MUST cover Dispatcher, production composition, Navigation/Action regressions, five scoped-storage methods, controlled HTTP, SDK codec/bridge adapters, concurrency, cancellation, replacement, cleanup, malicious/stale identity, complete Context, response-before-close, storage restart, bounded diagnostics, and unsupported clipboard, permission mutation, arbitrary Tauri, and removed/private methods.
- **THEN** HTTP validation MUST use deterministic DNS/transport fakes covering control policies and lifecycle without invoking real paid services.
- **THEN** Public tarballs and workspace-boundary checks MUST prove Host-private modules cannot be imported; maintained acceptance MUST NOT require browser, WebView, GUI, or environment evidence.

#### Scenario: Validate activation delivery and termination deterministically
- **WHEN** production-composition tests connect the activation channel through the current Contract, SDK, bridge, and Dispatcher
- **THEN** coverage includes initial batches, early events, repeated subscriptions, absent callbacks, source-identity forgery, currentness, stream-opening failure termination, and cleanup
- **THEN** old catalog assertions do not incorrectly reject new methods, while old, unknown, or removed private methods continue to reject without side effects
- **THEN** these tests do not claim execution of real keyboard monitoring, WebViews, or system authorization flows
