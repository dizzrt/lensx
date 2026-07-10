# Plugin Architecture

lensX uses one plugin contract for builtin and external plugins. A plugin
manifest declares its ID, source, lifecycle policy, UI runtime, pages, actions,
permissions, SDK compatibility, Host API compatibility, and reserved sidecar
metadata.

## Contract

`source` only describes where a plugin comes from:

- `builtin`: shipped with the application.
- `external`: installed from a `.lxplugin` package.

Uninstall and disable behavior is controlled only by `lifecycle.uninstallable`
and `lifecycle.disableable`. Do not infer lifecycle behavior from `source`.

All referenceable IDs must be globally unique strict three-part IDs:

```text
author.module.name
```

Use underscores inside the third segment for local names, for example
`lensx.core.settings_page_main`. Do not use fourth segments such as
`lensx.core.settings.page.main`; hierarchy must use explicit fields such as
`plugin_id`, `parent_page_id`, and `target_page_id`.

## Runtimes

Builtin plugins live under `src/plugins/builtin/**` and render as Vue dynamic
modules inside the main application. They share the app Vue runtime, Naive UI
providers, theme, i18n messages, Naive UI locale/dateLocale, UnoCSS utilities,
and Less theme variables.

External plugins render inside an iframe. lensX reads and validates external
manifest metadata during startup or install, but it does not keep external
iframes resident. The iframe is created only when the user opens an external
plugin page and is destroyed with the page container.

## Registry And Validation

The registry rejects invalid IDs, duplicate IDs, missing `plugin_id` references,
missing `target_page_id` references, undeclared permissions, and page parent
cycles. Missing references are never auto-created.

Rust owns external manifest reads, install-directory path checks, registry
validation, Host API dispatch, and sidecar rejection. Vue owns page outlets,
builtin dynamic loading, iframe lifecycle, and runtime context events.

## Host API Boundary

External plugins must call lensX through JSON-RPC 2.0 over `postMessage`, usually
through `@lensx/plugin-sdk`. The bridge validates plugin identity, message
source, method ID, declared permissions, granted permissions, and params before
dispatching.

External plugins must not directly access the main Vue store, Vue component
instances, internal modules, Tauri commands, Rust objects, or native rendering
surfaces.

## Sidecar Policy

Sidecar fields are reserved in the manifest for a future change. The first
plugin-system phase may read sidecar metadata, but it must not start or execute a
sidecar process. Host APIs return a diagnostic "not supported" state for sidecar
execution.
