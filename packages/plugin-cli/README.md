# @lensx/plugin-cli

Public Node.js authoring tools for lensX plugins. The `lensx-plugin` binary
creates maintained project templates, runs their explicit build lifecycle,
validates existing build output, produces canonical `.lxp` packages, and
inspects packages without installing or executing them.

```bash
lensx-plugin --help
lensx-plugin create ./my-plugin --template framework-neutral --plugin-id com.example.my-plugin --name "My Plugin"
lensx-plugin build --project ./my-plugin
lensx-plugin validate --project ./my-plugin
lensx-plugin pack --project ./my-plugin
lensx-plugin inspect ./my-plugin/artifacts/com.example.my-plugin-0.1.0.lxp
```

`build` and default `pack` execute the project's declared `pnpm run build`
script. `validate`, `pack --no-build`, and `inspect` do not execute plugin code.
The Host independently revalidates every package before installation.

Only the root export and `lensx-plugin` binary are public. Package-format
implementation modules are intentionally private.
