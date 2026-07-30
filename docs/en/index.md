# lensX Documentation

English documentation is the canonical source for maintained project
documentation. The [Simplified Chinese index](../zh/index.md) mirrors this
structure.

## Architecture

- [Architecture Overview](architecture/overview.md) — project goals, current
  foundation, system boundaries, and dependency direction.
- [Extension Platform](architecture/extension-platform.md) — architectural
  direction for launcher actions, plugins, isolation, and Host contracts.

## Development

- [Getting Started](development/getting-started.md) — environment setup,
  development commands, and repository map.
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
