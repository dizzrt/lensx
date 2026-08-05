# @lensx/plugin-testkit

Framework-neutral Manifest and Runtime context fixtures, cancellation and
deferred controls, and a semantic fake transport for testing the public lensX
Contract and SDK lifecycle.

`createPluginRuntimeContextFixture()` uses shared Contract method IDs.
`createInvalidPluginRuntimeContextFixture()` provides unknown, duplicate,
unsorted, and trusted-field negative inputs for exercising the real SDK
validator.

Import only `@lensx/plugin-testkit`. This package does not provide real Host API
execution, permission decisions or a permission harness, iframe transport,
plugin execution, or a project template. See the repository Plugin Workspace
documentation for lifecycle and release validation guidance.
