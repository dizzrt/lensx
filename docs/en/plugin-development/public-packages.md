# Public Plugin Packages

## Package matrix

Every package is currently version `0.2.0`. The listed entries are the complete
supported package exports; any other path is private even if a file happens to
exist in a tarball.

| Package | Public entries | Role |
| --- | --- | --- |
| `@lensx/plugin-contract` | root, Manifest Schema, Host API Schema | Author input, normalized types, versions, catalogs, and pure validators. |
| `@lensx/plugin-sdk` | root, `./iframe` | Framework-neutral client lifecycle and the iframe transport constructor. |
| `@lensx/plugin-ui` | root, `./styles.css` | Optional React/Semi provider, page, feedback, public styles, and tokens. |
| `@lensx/plugin-testkit` | root | Contract fixtures, context fixtures, fake semantic transport, cancellation, and deferred helpers. |
| `@lensx/plugin-cli` | root plus `lensx-plugin` bin | Portable authoring commands; not a Runtime API. |

<!-- lensx-public-package {"name":"@lensx/plugin-contract","version":"0.2.0","exports":[".","./schema","./manifest.schema.json","./host-api-schema","./host-api.schema.json"]} -->
<!-- lensx-public-package {"name":"@lensx/plugin-sdk","version":"0.2.0","exports":[".","./iframe"]} -->
<!-- lensx-public-package {"name":"@lensx/plugin-ui","version":"0.2.0","exports":[".","./styles.css"]} -->
<!-- lensx-public-package {"name":"@lensx/plugin-testkit","version":"0.2.0","exports":["."]} -->
<!-- lensx-public-package {"name":"@lensx/plugin-cli","version":"0.2.0","exports":["."]} -->

The real tarball gate checks package metadata, declarations, Runtime files,
Schema files, the CLI bin, and export resolution. Deep imports are unsupported.

## Dependency roles

The smallest framework-neutral Runtime dependencies are
`@lensx/plugin-contract` and `@lensx/plugin-sdk`; add
`@lensx/plugin-testkit` only for tests. A React/Semi plugin additionally owns
`react`, `react-dom`, `@douyinfe/semi-ui`, and `@lensx/plugin-ui`. The Host does
not lend its React or Semi instances to a plugin iframe.

The Contract is safe in authoring and Runtime code. The SDK depends on the
Contract. Testkit depends on the public Contract and SDK roots. Plugin UI has
SDK, React, and React DOM as peer boundaries and owns its Semi dependency. CLI
is a Node authoring tool and must not enter the browser bundle.

## Lifecycle boundaries

Use `validatePluginManifest` before normalization. Use `createPluginSdk` once
per Runtime attempt, initialize it, subscribe to full context replacements,
and dispose it idempotently. In tests, `FakePluginSdkTransport` controls
semantic connect/request outcomes; it is not a real Host.

`PluginUiProvider` consumes the latest Runtime context and adapts locale/theme.
`PluginFeedback` and `PluginPage` provide presentation primitives, not Host
authority. The CLI creates, builds, validates, packs, and inspects files; it
does not start the Host, install packages, or execute a
plugin.

## Non-goals

- Testkit is not a Host, WebView-isolation boundary, or source-security simulator.
- Plugin UI is not shared Host React and does not cross the iframe boundary.
- Contract acceptance is not installation, registration, session readiness,
  provider availability, or authorization.
- CLI acceptance is not Host acceptance; installation reinspects the same
  canonical package rules at the trusted boundary.
- The packages are not currently published to npm. Real tarballs produced by a
  lensX build are the supported external-consumer verification input.

Continue with [tooling and installation](tooling-and-installation.md) or the
[Host API reference](host-api.md).
