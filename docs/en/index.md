# lensX Documentation

English documentation is the canonical source for maintained project
documentation. The [Simplified Chinese index](../zh/index.md) mirrors this
structure.

## Architecture

- [Architecture Overview](architecture/overview.md) — project goals, current
  foundation, system boundaries, and dependency direction.
- [Extension Platform](architecture/extension-platform.md) — shipped public
  Contract package plus the architectural direction for plugins and isolation.
- [Plugin Package Format](architecture/plugin-package-format.md) — shipped `.lxp`
  canonical `tar.zst` profile, inspection boundaries, limits, and validation.

## Development

- [Getting Started](development/getting-started.md) — environment setup,
  development commands, and repository map.
- [Plugin Workspace](development/plugin-workspace.md) — Contract package,
  member locations, lifecycle scripts, dependency boundaries, and pack checks.
- [Plugin Project Templates](development/plugin-project-template.md) — choose,
  run, adapt, isolate, package, and validate the maintained plugin starters.
- [Plugin Developer CLI](development/plugin-developer-cli.md) — scaffold,
  build, validate, package, and inspect plugins through the public CLI.
- [Plugin Development Mode](development/plugin-development-mode.md) — manually
  register, reload, and remove an unpacked `dist/` in a dedicated Host build.
- [Frontend Guidelines](development/frontend-guidelines.md) — React, Semi
  Design, styling, theme, localization, and accessibility rules.
- [Project Workflow](development/project-workflow.md) — sources of truth,
  documentation governance, OpenSpec, and temporary material rules.
- [Validation](development/validation.md) — required frontend and Rust
  validation and completion criteria.

## Requirements

Stable capability requirements live under `openspec/specs/`. Proposed and
in-progress work lives under `openspec/changes/`. Implemented behavior must
always be verified against current source code and tests.
