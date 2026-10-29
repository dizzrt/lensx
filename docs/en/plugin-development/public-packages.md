# Public Plugin Packages

## Package matrix

`@lensx/plugin-contract` is version `0.4.0` and `@lensx/plugin-sdk` is version
`0.5.0`; Plugin UI, Testkit, and CLI are version `0.2.1`. The listed entries are the complete supported package exports; any
other path is private even if a file happens to exist in a tarball.

| Package | Public entries | Role |
| --- | --- | --- |
| `@lensx/plugin-contract` | root, Manifest Schema, Host API Schema | Author input, normalized types, versions, catalogs, and pure validators. |
| `@lensx/plugin-sdk` | root, `./webview` | Framework-neutral client lifecycle and the Child WebView transport constructor. |
| `@lensx/plugin-ui` | root, `./styles.css` | Optional React/Semi provider, page, feedback, public styles, and tokens. |
| `@lensx/plugin-testkit` | root | Contract fixtures, context fixtures, fake semantic transport, cancellation, and deferred helpers. |
| `@lensx/plugin-cli` | root plus `lensx-plugin` bin | Portable authoring commands; not a Runtime API. |

<!-- lensx-public-package {"name":"@lensx/plugin-contract","version":"0.4.0","exports":[".","./schema","./manifest.schema.json","./host-api-schema","./host-api.schema.json"]} -->
<!-- lensx-public-package {"name":"@lensx/plugin-sdk","version":"0.5.0","exports":[".","./webview"]} -->
<!-- lensx-public-package {"name":"@lensx/plugin-ui","version":"0.2.1","exports":[".","./styles.css"]} -->
<!-- lensx-public-package {"name":"@lensx/plugin-testkit","version":"0.2.1","exports":["."]} -->
<!-- lensx-public-package {"name":"@lensx/plugin-cli","version":"0.2.1","exports":["."]} -->

The real tarball gate checks package metadata, declarations, Runtime files,
Schema files, the CLI bin, and export resolution. Deep imports are unsupported.

## Dependency roles

The smallest framework-neutral Runtime dependencies are
`@lensx/plugin-contract` and `@lensx/plugin-sdk`; add
`@lensx/plugin-testkit` only for tests. A React/Semi plugin additionally owns
`react`, `react-dom`, `@douyinfe/semi-ui`, and `@lensx/plugin-ui`. The Host does
not lend its React or Semi instances to a plugin Child WebView.

The Contract is safe in authoring and Runtime code. The SDK depends on the
Contract. Testkit depends on the public Contract and SDK roots. Plugin UI has
SDK, React, and React DOM as peer boundaries and owns its Semi dependency. CLI
is a Node authoring tool and must not enter the browser bundle.

## Action discovery metadata

<a id="action-display-names"></a>

### Naming Action entries

An Action's `title` is its primary user-facing display name; the field remains
`title`, and a command-style sentence is not required. Name a Page or tool
entry after its destination, without adding `Open` merely because selecting
the entry opens it. Give multiple entries distinct destination names instead
of replacing every title with the plugin name. Actions that perform an
operation keep the verb needed to describe that operation, such as the Host's
`Hide launcher` / `隐藏启动器`.

This is an authoring convention, not a new Manifest validation rule. Valid
names such as `Open Studio` and existing third-party titles remain accepted;
normalization and Host projection preserve their wording. The existing
localized-string rules, including a non-empty English title, still apply.
Do not trim opening words at runtime or derive an alternative title from a
plugin name or Page title.

The maintained Settings, ConfigLens, and template title simplification keeps
existing functional keywords. It adds no replaced full titles, `Open` /
`打开` compatibility keywords, hidden aliases, or extra search sources. An old
full-title query may therefore stop matching, and relevance scores may change
with the new title. Action IDs and execution targets remain stable, so Recent
and Pinned entries continue to resolve the same Action with its current title.

### Search matching

Launcher search uses only each Action's `title` and `default_keywords` from
all declared supported languages (`en-US` and `zh-CN`). The interface language
controls display text and feedback, with English fallback for missing localized
Action text; it does not change matching, scores, or result order. Missing text
or an empty keyword list in one language does not hide another language's text.
Every query token must match the same Action, and tokens may span languages or
fields. Duplicate translations or hits in multiple fields do not add points:
each token and the complete-query title bonus contribute only their best match
once, and each Action appears once.

`description` remains optional display metadata and is preserved by projection,
but is no longer searchable or scored. Existing queries that occur only in a
description no longer return that Action. Put intended discovery terms in its
title or `default_keywords`; plugin names, plugin-wide descriptions, Page
titles, and IDs are not automatically searchable. Existing Manifest and package
formats remain valid, and this search behavior needs no Manifest, Host API, or
SDK version change.

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
- Plugin UI is document-local; it does not cross or control the native Child
  WebView boundary and exposes no private bridge facts.
- Contract acceptance is not installation, registration, session readiness,
  provider availability, or authorization.
- CLI acceptance is not Host acceptance; installation reinspects the same
  canonical package rules at the trusted boundary.
- The packages are not currently published to npm. Real tarballs produced by a
  lensX build are the supported external-consumer verification input.

Continue with [tooling and installation](tooling-and-installation.md) or the
[Host API reference](host-api.md).

## Optional shortcut callback

```ts verify=framework-neutral id=shortcut-activation
import { createPluginSdk } from '@lensx/plugin-sdk';
import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';

const sdk = createPluginSdk({
  transport: createPluginWebviewTransport(),
  onShortcutActivated: async (activation) => {
    // Already ready; use declared capabilities before making a request.
    if (sdk.context?.capabilities.includes('storage.get')) {
      await sdk.request({ method: 'storage.get', params: { key: activation.actionId } });
    }
  },
});
await sdk.initialize();
const currentActivation = sdk.activation;
// On teardown:
await sdk.dispose();
```

The callback is registered at creation and is optional. For an ordinary plugin,
`createPluginSdk({ transport: createPluginWebviewTransport() })` is sufficient:
the SDK still consumes activation events and keeps the readonly snapshot current.
Before ready and after termination the snapshot is `undefined`; ready without an
activation is `null`. Only `shortcut` invokes the callback, once per new ID; normal
calls update the snapshot. Calls are started in Host order without waiting for
previous business Promises. The plugin owns concurrency, cancellation and side
effects. Synchronous exceptions and Promise rejections are isolated and never
retried. Disposal stops pending callback starts but cannot undo external work
already started. Initialization failure after attempting activation subscription
is terminal; create a fresh Runtime attempt and SDK for explicit retry.
