# Plugin Development

This hub is the canonical external-developer entry for the plugin capabilities
that lensX can verify today. Start with one complete tutorial, then use the
reference pages when you need a contract detail or recovery path. You do not
need Host implementation details to author a plugin.

## Capability status

Status has a precise meaning:

- **Shipped**: a public artifact or Host workflow exists and is covered by a
  focused gate.
- **Conditional**: the capability exists only in an explicitly enabled Host
  build, with an available provider, or in the latest session capability list.
- **Not delivered**: do not build a release or workflow around it.

| Capability | Status | Meaning |
| --- | --- | --- |
| Contract, SDK, Testkit, CLI | Shipped | Public package boundaries and real tarballs are verified. |
| Optional Plugin UI | Shipped | The plugin owns React, React DOM, Semi Design, and the UI package. |
| Local `.lxp` installation | Shipped | Settings uses the canonical Host inspection and preparation boundary. |
| Development Mode | Conditional | A dedicated build and explicit process switch are required. |
| Host API | Conditional | A catalog entry is not authority; use the latest session capabilities. |
| npm publication | Not delivered | The repository can produce tarballs, but the packages are not on npm. |
| watch/HMR, signing, Marketplace, remote updates | Not delivered | These remain separate future capabilities. |

<!-- lensx-capability-status {"id":"contract-package","status":"shipped"} -->
<!-- lensx-capability-status {"id":"sdk-package","status":"shipped"} -->
<!-- lensx-capability-status {"id":"ui-package","status":"shipped"} -->
<!-- lensx-capability-status {"id":"testkit-package","status":"shipped"} -->
<!-- lensx-capability-status {"id":"cli-package","status":"shipped"} -->
<!-- lensx-capability-status {"id":"local-installation","status":"shipped"} -->
<!-- lensx-capability-status {"id":"development-mode","status":"conditional"} -->
<!-- lensx-capability-status {"id":"host-api-session","status":"conditional"} -->
<!-- lensx-capability-status {"id":"npm-publication","status":"not-delivered"} -->
<!-- lensx-capability-status {"id":"watch-hmr","status":"not-delivered"} -->
<!-- lensx-capability-status {"id":"signing","status":"not-delivered"} -->
<!-- lensx-capability-status {"id":"marketplace","status":"not-delivered"} -->
<!-- lensx-capability-status {"id":"remote-updates","status":"not-delivered"} -->

## Choose a tutorial

- Choose the [framework-neutral tutorial](tutorial-framework-neutral.md) for a
  browser DOM project with Contract, SDK, and Testkit only.
- Choose the [React and Semi tutorial](tutorial-react-semi.md) for a plugin that
  owns React, React DOM, Semi Design, and the optional Plugin UI package.

Both paths begin with the real CLI, create a permissionless project, validate a
self-contained `dist/`, use manual Development Mode reload, and finish with a
canonical `.lxp` accepted by the local installation preparation boundary.

## Reference path

Read these pages in the order that matches your question:

1. [Public packages](public-packages.md) for exports, dependency roles, and
   lifecycle ownership.
2. [Tooling and installation](tooling-and-installation.md) for CLI,
   Development Mode, packaging, and Settings installation.
3. [Host API](host-api.md) for methods, providers, permissions, capabilities,
   and stable errors.
4. [Runtime, permissions, and security](runtime-permissions-security.md) for
   initialization, replacement, retry, teardown, and isolation.
5. [Compatibility and errors](compatibility-and-errors.md) for version
   dimensions, validation outcomes, and troubleshooting order.

## Boundaries

The Manifest requests permissions; it never grants them. CLI validation proves
that author-controlled bytes satisfy public contracts; it never installs a
plugin or creates Host authority. Development Mode uses a process-local source
and manual reload; it does not install an `.lxp`. Production and development
sources use the same Runtime, session, capability, permission, deadline, and
isolation boundaries.

The repository currently verifies distributable tarballs, not a registry
channel. Obtain those tarballs from the lensX build you are testing. Do not
invent npm commands, download URLs, automatic reload, signing, Marketplace, or
update behavior.

