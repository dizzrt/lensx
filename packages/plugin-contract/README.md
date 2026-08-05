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
  // A future typed SDK may offer storage.get for this current Context.
}
```

Declared Schema entries are `/schema`, `/manifest.schema.json`,
`/host-api-schema`, and `/host-api.schema.json`. Other deep imports are private.
