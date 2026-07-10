# Example Plugins

`.lxplugin` packages are zip archives with this minimum structure:

```text
manifest.json
dist/index.html
assets/*
```

The host reads `manifest.json` at startup or install time, validates the plugin contract, and registers only metadata. The iframe entry is loaded lazily when a plugin page is opened.

Build the hello-world example:

```bash
pnpm --filter lensx-plugin-hello-world run build
```

Create a local package:

```bash
pnpm --filter lensx-plugin-hello-world run package
```
