# @lensx/plugin-testkit

Framework-neutral Manifest and Runtime context fixtures, cancellation and
deferred controls, and a semantic fake transport for testing the public lensX
Contract and SDK lifecycle.

`createPluginRuntimeContextFixture()` uses shared Contract method IDs.
`createInvalidPluginRuntimeContextFixture()` provides unknown, duplicate,
unsorted, and trusted-field negative inputs for exercising the real SDK
validator.

Import only `@lensx/plugin-testkit`. This package does not provide real Host API
execution, a Child WebView or bridge simulator, native source identity,
permission decisions, plugin execution, or a project template. The fake
implements only the public semantic `PluginSdkTransport` interface, so container
and security evidence must use the production Host gates. See the repository
Plugin Workspace documentation for lifecycle and release validation guidance.
