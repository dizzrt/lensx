# lensX Agent Guide

lensX is a lightweight, keyboard-first desktop productivity launcher built with
React, TypeScript, Rust, and Tauri. This file routes agents to project evidence
and operating rules; it does not replace architecture or capability specifications.

## Required Reading

Before judging project implementation or engineering conventions, or changing
the project:

1. Read this file.
2. Use the [documentation index](docs/en/index.md) to read relevant durable
   documentation.
3. Search the [stable specifications](openspec/specs/) for relevant requirements.
4. Read the artifacts for any active OpenSpec change in scope.
5. Inspect current source, tests, and executable configuration. In an indexed repository, use
   CodeGraph before text search or manual file traversal.

English documentation is canonical. Use the Simplified Chinese mirror only when
Chinese context is useful. Retrieve both documentation and stable specs when a
task spans implementation and observable contracts. Report missing, insufficient,
or conflicting evidence instead of guessing from general practices or similar
projects; source inspection does not replace documented rationale.

## Sources of Truth

Use the following precedence when sources disagree:

1. Current source code and tests describe implemented behavior.
2. Stable OpenSpec specs describe accepted capability requirements.
3. English documents under `docs/en/` describe maintained architecture,
   implementation guidance, and workflow.
4. Active OpenSpec changes describe proposed or in-progress work and must not be
   presented as shipped behavior.
5. README files provide human onboarding only.

Do not describe planned behavior as implemented. Resolve meaningful conflicts
instead of copying them into new artifacts.

## Repository Document Roles

- `README.md` is the canonical English human onboarding entry.
- `README-zh.md` is its Simplified Chinese mirror.
- `AGENTS.md` is the English agent onboarding and operating guide.
- [govern-spec.yaml](govern-spec.yaml) is the sole source of language-policy values.
- `openspec/config.yaml` contains English rules for creating, applying,
  validating, syncing, and archiving OpenSpec changes.
- `docs/en/` contains canonical English architecture, implementation, and
  workflow documentation.
- `docs/zh/` mirrors `docs/en/` in Simplified Chinese at identical relative
  paths.
- `docs/AGENTS.md` governs documentation maintenance.
- `openspec/specs/` contains stable capability requirements in English.
- `openspec/changes/` contains proposed or in-progress change artifacts.
- Project-root `.tmp/`, `.temp/`, `tmp/`, and `temp/` are untracked temporary inputs.

README files, this file, and `openspec/config.yaml` must stay focused on
onboarding and rules, without parallel detailed document or feature catalogs.
README navigation uses the language's documentation index and stable-spec entry
point; adjacent command or high-risk warning context links may remain. Put
implementation details in categorized docs or stable specs. Only `docs/AGENTS.md`
may be directly under `docs/`, and only `index.md` may be directly under each
language content root. Adding, moving, or deleting docs must update the indexes
and all affected inbound and outbound links, including references outside docs.

## Language And Mirroring

Read [govern-spec.yaml](govern-spec.yaml) before writing. The first language in
each ordered `readme` or `docs` list is that surface's semantic baseline. Every
later language must be synchronized in the same task, with matching meaning,
scope, examples, limitations, and navigation; missing or stale translations
cannot be deferred. Preserve corresponding document paths across language trees.

All scalar fields select one language tag, except `active_changes`, which also
accepts `auto`. Explicit artifact-language instructions take precedence. Otherwise
a fixed tag selects that language; `auto` resolves at writing time from the
current task's natural conversation language, excluding code, quotations, and
tool output. If unclear, use the relevant existing artifact's language, then ask
only if still unresolved. Do not substitute the driver or stable-spec language.

Apply this resolution only to new or substantively rewritten active prose,
including audit evidence. Checkbox-only edits do not require translation;
preserve untouched and archived content. Preserve machine-facing headings,
schema keys, identifiers, commands, paths, and protocol text. Synchronize accepted
content into `language_policy.stable_specs` before archiving; source artifacts
may retain their resolved language.

## Temporary Material

Material in project-root `.tmp/`, `.temp/`, `tmp/`, or `temp/` may be inspected for
examples and context, but is not a stable project source. Never:

- import or depend on code from these directories;
- link to or cite a file inside them from committed code, documentation,
  specs, tests, configuration, or generated artifacts;
- describe temporary material as a maintained project component.

Restate useful information as project-owned requirements, decisions, examples,
or documentation without preserving temporary provenance.
Keep all four directories ignored; report already tracked temporary files
without silently untracking them. Operating-system temporary APIs are unaffected.

## OpenSpec Workflow

Use OpenSpec for meaningful capability, contract, architecture, or
cross-cutting behavior changes.

- Explore and inspect before proposing.
- Keep each change cohesive and explicitly state goals and non-goals.
- Distinguish current behavior from proposed behavior.
- Keep proposal, design, delta specs, and tasks coherent.
- Do not implement while using an exploration-only workflow.
- Apply tasks in order and update task checkboxes as work is verified.
- Synchronize stable specs before archiving.
- Before every archive, audit the final accepted change's governance and
  documentation under the [project procedure](docs/en/development/project-workflow.md#governance-and-archive-readiness).
  Add a project-level audit only when governance surfaces are affected, including
  by repairs. Record scope, inspected paths, trigger decision, conclusions,
  rationale, updated paths, and actual validation in `tasks.md`; reconfirm earlier
  audits and record evidence even when no update is needed.
- Archive only after implementation, synchronization, applicable audits, and
  validation of synchronized specs and docs are complete. Missing, stale, or
  unresolved in-scope documentation or governance blocks readiness.
- Follow all artifact-specific rules in `openspec/config.yaml`.

Reconcile governance when requested, when governance surfaces change, or when
drift is found. Governance work does not authorize feature implementation,
archiving, staging, committing, pushing, publishing, or global configuration
changes. Preserve generated integrations; update them through their owning tool.

Every new `tasks.md` must end with validation and archive-readiness tasks that
reserve the audits above. Older changes append missing audit evidence before
archive. Validation must cover the
affected frontend and Rust layers and include tests, formatting, static
analysis, and builds where relevant. Fix every warning and error introduced by
the change, then rerun the failed and final validation commands.

## Validation Command Governance

Root `package.json` scripts are a governed repository interface. Do not add a
root script for an individual test, test subset, OpenSpec Change, forwarding
alias, or multi-stage `&&` validation graph. Put deterministic repository-only
assertions in the existing Rstest discovery range. Register cross-layer
acceptance under a stable capability ID in the validation Gate registry and use
the single read-only `gate` dispatcher. Use `generate` only for deterministic,
source-derived artifacts with an explicit target and `--write`. The repository
does not maintain an Evidence dispatcher or visual, browser, real WebView,
native harness, GUI application, or target-environment performance validation.
Before archiving a Change, remove temporary entry points and verify that
maintained code, documentation, CI, and specs contain no stale aliases. See
[validation documentation](docs/en/development/validation.md) for command categories, planning, and write
boundaries.

## Frontend Rules

- Use React and TypeScript for the frontend.
- Prefer Semi Design components and patterns before creating custom UI.
- Consult the repository Semi Design skill when selecting or integrating
  non-trivial components.
- Do not introduce another component library or a new dependency when Semi
  Design or the existing stack can satisfy the requirement.
- Use UnoCSS for simple, local layout, spacing, sizing, and utility styling.
- Use Less for complex, semantic, stateful, theme-aware, or reusable styles.
- Use Semi Design's supported theming and localization mechanisms for light and
  dark modes and application locale integration.
- Support English and Simplified Chinese. English is the default and canonical
  source locale.
- Put all user-visible product text behind the application internationalization
  layer. Do not hard-code product copy in components.
- Preserve accessibility, keyboard interaction, and focus behavior.

Detailed frontend guidance lives in
`docs/en/development/frontend-guidelines.md`.

## Architecture Boundaries

- Rust owns native desktop integration, privileged operations, persistence,
  and stable Tauri command boundaries.
- React owns presentation, interaction state, and view composition.
- Cross-boundary payloads must be typed, serializable, stable, and validated.
- Keep domain logic independent of UI components and native transport details
  whenever practical.
- Extensions must use explicit contracts and controlled Host boundaries; they
  must not gain direct access to internal application state or privileged
  native APIs.

Detailed architecture belongs under `docs/en/architecture/` and stable
capability requirements belong under `openspec/specs/`.

## Commands

Frontend and shared validation:

```bash
pnpm run dev
pnpm run test
pnpm run typecheck
pnpm run check
pnpm run build
```

Rust and desktop validation:

```bash
pnpm run src-tauri:format:check
pnpm run src-tauri:test
pnpm run src-tauri:check
```

Formatting:

```bash
pnpm run format
pnpm run src-tauri:format
```

If an executable is unavailable from `PATH`, run `source ~/.zshrc` before
retrying it.

## Deterministic Validation Boundary

Maintained validation must not launch Chrome, Chromium, another macOS `.app`,
Launch Services, a real WebView, or an interactive native harness. Do not add
screenshots, pixel comparison, visual baselines, or target-environment
performance output to package lifecycles, Gates, Generate targets, or CI. There
is no optional or manual compatibility Gate for these retired paths. Preserve
product semantics through deterministic Rstest, Cargo, static, build, package,
and pure CLI consumer checks.

## pnpm Store Policy

- Use the machine-configured global pnpm store for commands executed from the
  repository root.
- Never pass `--store-dir` to pnpm commands executed from the repository root.
- Never use the repository-local `.pnpm-store` as the store for the root
  workspace.
- Package-consumer smoke tests must run inside their temporary consumer
  directory and must not recreate the repository root `node_modules`.

## Completion Standard

Before claiming completion:

- confirm the implementation matches the approved scope and stable specs;
- add or update tests for changed behavior;
- update English documentation and its Simplified Chinese mirror;
- run all validation required by the change;
- fix introduced warnings and errors and rerun validation;
- report any remaining limitation or unverified assumption explicitly.

## Docs

- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt
- Rstest: https://rstest.rs/llms.txt
