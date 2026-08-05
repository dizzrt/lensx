# @lensx/plugin-sdk

Framework-neutral lifecycle, Runtime context, transport, version, cancellation,
timeout, and error foundations for lensX plugins.

Runtime Context shape and validation come from `@lensx/plugin-contract`; its
capabilities are sorted current Host API method IDs, not grants. Host API error
types remain distinct from SDK lifecycle errors.

This package does not provide a real iframe transport, concrete Host API
methods, permission enforcement, plugin execution, or a public Testkit fake.
Import only the package root; internal modules are not public API.
