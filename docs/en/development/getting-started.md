# Getting Started

## Prerequisites

- Node.js `>=24 <25`
- pnpm `>=11 <12`
- A current Rust toolchain
- Platform prerequisites for Tauri 2

Confirm the JavaScript toolchain:

```bash
node --version
pnpm --version
```

Confirm the Rust toolchain:

```bash
rustc --version
cargo --version
```

## Install

```bash
pnpm install
```

The repository uses the package manager version declared in `package.json`.
Avoid generating lockfile changes with another package manager.

## Development Modes

Start the frontend development server:

```bash
pnpm run dev
```

The configured development server listens on port `40755`.

Start the desktop application with the frontend development server:

```bash
pnpm exec tauri dev
```

Preview a production frontend build:

```bash
pnpm run build
pnpm run preview
```

Build a desktop bundle:

```bash
pnpm exec tauri build
```

## Repository Map

- `src/` — React and TypeScript frontend source.
- `tests/` — frontend and DOM-oriented tests.
- `src-tauri/` — Rust and Tauri desktop source and configuration.
- `packages/*` — public workspace packages when a package manifest is present.
- `plugins/official/*` — official plugin workspace packages when present.
- `examples/plugins/*` — example plugin workspace packages when present.
- `public/` and `static/` — frontend assets and HTML input.
- `docs/en/` — canonical English implementation and architecture documents.
- `docs/zh/` — matching Simplified Chinese documents.
- `openspec/specs/` — stable capability requirements, when present.
- `openspec/changes/` — proposed and in-progress changes.

The root application remains a private workspace package. See
[Plugin Workspace](plugin-workspace.md) before adding a package to one of the
supported member locations.

## First Contribution

1. Read `AGENTS.md`.
2. Start at `docs/en/index.md`.
3. Inspect relevant stable specs and active changes.
4. Verify the current code path and existing tests.
5. Use OpenSpec before implementing meaningful behavior, architecture, or
   contract changes.
6. Update tests and both documentation languages with the implementation.
7. Run the required validation described in `validation.md`.

## Environment Troubleshooting

If an installed executable is unavailable from `PATH`, load the interactive
shell configuration before retrying:

```bash
source ~/.zshrc
```

Do not replace the declared Node, pnpm, or Rust toolchain requirements with
machine-specific assumptions.
