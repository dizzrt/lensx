# lensX

[简体中文](./README-zh.md)

lensX is a lightweight desktop productivity launcher for fast, keyboard-first
access to local workflows and extensible tools.

The project is currently establishing its application foundation. Features are
documented as available only when they are backed by the current source code and
tests.

## Project Goals

- Open quickly from anywhere and keep common workflows close to the keyboard.
- Maintain a small, responsive desktop footprint.
- Provide clear and safe boundaries for local tools and future extensions.
- Keep development conventions, architecture, and behavior discoverable through
  maintained documentation and specifications.

## Prerequisites

- Node.js 24
- pnpm 11
- A Rust toolchain
- The platform prerequisites required by Tauri 2

## Quick Start

Install dependencies:

```bash
pnpm install
```

Start the frontend development server:

```bash
pnpm run dev
```

Start the desktop application in development mode:

```bash
pnpm run app:dev
```

The unified launcher owns the frontend server, forwards its actual local port
to Tauri, and cleans up both processes together. Use `pnpm run dev` only when
you need the standalone frontend server.

## Common Commands

```bash
pnpm run test
pnpm run typecheck
pnpm run check
pnpm run build
pnpm run src-tauri:test
pnpm run src-tauri:check
```

## Start Contributing

1. Read the [documentation index](docs/en/index.md).
2. Read [AGENTS.md](AGENTS.md) when working with an AI coding agent.
3. Use the OpenSpec workflow for meaningful behavior, architecture, or contract
   changes.
4. Keep tests and both documentation languages aligned with every relevant
   change.

## License

See [LICENSE](LICENSE).
