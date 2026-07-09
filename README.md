# lensX

lensX is a lightweight desktop productivity launcher built with Rust, Tauri 2,
Vue 3, TypeScript, and Rsbuild.

The project focuses on fast global activation, low resident resource usage,
keyboard-first interaction, and a clear foundation for local commands and future
extension points.

This English README and `README-zh.md` must stay aligned. Update both files when
project positioning, setup commands, current status, or documentation entry
points change.

## Current Status

The project is in an early initialization stage. It currently contains:

- a Tauri desktop shell;
- a borderless main window configured for a compact launcher surface;
- tray menu setup;
- global shortcut setup;
- a basic Vue input interface.

Command registry, search indexing, extension runtime, synchronization, and other
larger product capabilities must not be documented as shipped features unless
they are implemented in the codebase.

## Tech Stack

- Desktop runtime: Tauri 2
- System layer: Rust
- Frontend: Vue 3 and TypeScript
- Build tool: Rsbuild / Rspack
- UI: Naive UI
- Styling: UnoCSS, Less, and PostCSS
- Package manager: pnpm
- Formatting and linting: Biome
- Python environment management: uv
- Specification workflow: OpenSpec

## Setup

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm run dev
```

Build the frontend:

```bash
pnpm run build
```

Preview the production build:

```bash
pnpm run preview
```

## Project Layout

- `src/`: Vue frontend source.
- `src-tauri/`: Rust and Tauri desktop shell.
- `public/`: static frontend assets.
- `static/`: static project assets.
- `openspec/`: OpenSpec configuration, specs, and changes.
- `docs/`: mirrored English and Chinese project documentation.
- `tmp/`: temporary local reference material. It is not a stable source and must
  not be cited by committed docs or OpenSpec artifacts.

## Documentation

- `README.md`: English developer entry.
- `README-zh.md`: Chinese developer entry with matching content.
- `AGENTS.md`: agent operating guide.
- `docs/index.md`: documentation map.
- `openspec/config.yaml`: OpenSpec generation context and artifact rules.

## Development Constraints

- Keep Rust responsible for system integration, performance-sensitive work,
  persistence, and stable Tauri command boundaries.
- Keep Vue responsible for presentation, interaction state, and view composition.
- Use OpenSpec for meaningful behavior changes, architecture changes, and durable
  requirement changes.
- Run Python scripts and dependency operations through `uv`, for example
  `uv run ...` and `uv add ...`.
- Do not document planned capabilities as implemented behavior.
