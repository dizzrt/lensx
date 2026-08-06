# Runtime dependency review

`@lensx/plugin-cli@0.1.0` intentionally has two runtime dependencies and no UI,
React, Semi Design, Tauri, Host, or Rust dependency.

- `@lensx/plugin-contract` is the project-owned MIT-licensed Manifest and
  compatibility authority. The workspace version is tested as a real tarball.
- `@structured-world/structured-zstd@0.0.49` is Apache-2.0 licensed, declares
  Node `>=18`, and ships a portable WebAssembly codec rather than native
  platform binaries. The same pinned version already backs the canonical
  package-format corpus on Node 24. Its installed files are approximately
  2 MiB before package compression; carrying the codec is necessary for
  deterministic `.lxp` creation and bounded inspection on macOS, Windows, and
  Linux without requiring a system `zstd` executable.

Command parsing uses package-owned TypeScript and Node built-ins, so no parser
dependency is added. Tarball validation records the final packed size and
runtime dependency closure.
