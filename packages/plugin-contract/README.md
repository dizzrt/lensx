# @lensx/plugin-contract

Public lensX plugin Manifest and Host API semantic Schemas, generated input
types, version constants, immutable catalogs, diagnostics, and deterministic
pure validators.

The package validates static author input only. It does not discover, install,
register, authorize, render, dispatch, or execute plugins. Host API capability
checks are discovery branches, not proof that a transport or handler exists:

```ts
import { validatePluginRuntimeContext } from '@lensx/plugin-contract';

declare const unknownContext: unknown;
const result = validatePluginRuntimeContext(unknownContext);
if (result.status === 'valid' && result.value.capabilities.includes('storage.get')) {
  // The typed SDK may call storage.get while this current Context declares it.
}
```

Declared Schema entries are `/schema`, `/manifest.schema.json`,
`/host-api-schema`, and `/host-api.schema.json`. Other deep imports are private.

Contract `0.3.0` owns Manifest `0.4.0` and Host API `0.3.0`, including the
bounded `http.request` semantic contract. It performs no network I/O. A
current capability snapshot and compatible SDK/Manifest are still required
before a plugin may call a real Host provider.
