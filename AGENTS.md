# lensX Agent Guide

This file helps coding agents understand the repository, choose the correct
source of truth, and follow the project workflow. It is not a substitute for
architecture documentation or capability specifications.

## Required Reading

Before changing the project:

1. Read this file.
2. Read `docs/en/index.md` and the English documents relevant to the task.
3. Read stable requirements under `openspec/specs/`, when present.
4. Read the artifacts for any active OpenSpec change in scope.
5. Inspect the current source code and tests. In an indexed repository, use
   CodeGraph before text search or manual file traversal.

English documentation is canonical. Use the Simplified Chinese mirror only when
Chinese context is useful.

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
- `openspec/config.yaml` contains English rules for creating, applying,
  validating, syncing, and archiving OpenSpec changes.
- `docs/en/` contains canonical English architecture, implementation, and
  workflow documentation.
- `docs/zh/` mirrors `docs/en/` in Simplified Chinese at identical relative
  paths.
- `docs/AGENTS.md` governs documentation maintenance.
- `openspec/specs/` contains stable capability requirements in English.
- `openspec/changes/` contains proposed or in-progress change artifacts.
- `.tmp/` is untracked, temporary input only.

README files, this file, and `openspec/config.yaml` must stay focused on
onboarding and rules. Put concrete architecture and implementation details in
`docs/` or stable specs.

## Language And Mirroring

- Write `README.md`, `AGENTS.md`, `docs/AGENTS.md`, `openspec/config.yaml`, and
  stable specs in English.
- Treat `README.md` as canonical and keep `README-zh.md` semantically aligned.
- Treat every `docs/en/**/*.md` file as canonical and maintain a matching
  `docs/zh/**/*.md` file with the same relative path.
- Keep both language indexes current when documents are added, moved, renamed,
  or removed.
- Write active OpenSpec change artifacts in the language used in the
  agent conversation unless the user requests another language.
- Before syncing or archiving a change, ensure all content entering
  `openspec/specs/` is English. Active change artifacts may remain in the
  conversation language.

## Temporary Material

Material in `.tmp/` may be inspected for examples and context, but it is not a
stable project source. Never:

- import or depend on code from `.tmp/`;
- link to or cite a file inside `.tmp/` from committed code, documentation,
  specs, tests, configuration, or generated artifacts;
- describe temporary material as a maintained project component.

Restate useful information as project-owned requirements, decisions, examples,
or documentation without preserving temporary provenance.

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
- Archive only after implementation and required validation are complete.
- Follow all artifact-specific rules in `openspec/config.yaml`.

Every `tasks.md` must end with validation tasks. Validation must cover the
affected frontend and Rust layers and include tests, formatting, static
analysis, and builds where relevant. Fix every warning and error introduced by
the change, then rerun the failed and final validation commands.

## Validation Command Governance

Root `package.json` scripts are a governed repository interface. Do not add a
root script for an individual test, test subset, OpenSpec Change, forwarding
alias, or multi-stage `&&` validation graph. Put deterministic repository-only
assertions in the existing Rstest discovery range. Register cross-layer
acceptance under a stable capability ID in the validation Gate registry and use
the single `gate`, `generate`, or `evidence` dispatcher. Before archiving a
Change, remove temporary entry points and verify that maintained code,
documentation, CI, and specs contain no stale aliases. See
`docs/en/development/validation.md` for command categories, planning, write
boundaries, and browser/macOS execution safety.

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

## macOS Browser Automation Safety

Browser automation must remain invisible to the user's normal desktop and
browser session.

- Before running a validation command, determine whether it directly or
  transitively launches Chrome, Chromium, or another macOS `.app` process.
- When a local browser process is required on macOS, make the first launch in
  an approved execution context that can access the required macOS application
  services. Never probe-launch the browser inside a restricted sandbox and
  then retry after it aborts.
- Prefer automatic approval or review with the narrowest reusable command
  scope. Request user-facing approval only when the required execution cannot
  be approved automatically.
- Run browser validation headlessly, without opening a window, and with a fresh
  temporary user-data directory. Never use the default browser profile,
  connect to an existing user browser, or reuse its remote-debugging endpoint.
- Preserve the repository's selected browser and rendering baseline unless a
  reviewed change intentionally migrates them. A dedicated test browser is
  acceptable only after compatibility and visual-baseline evidence is updated.
- Close browser processes gracefully and remove their temporary profiles.
  Reserve forced termination for a bounded timeout fallback, not normal
  cleanup.
- Treat a restricted-sandbox browser launch failure as an environment failure,
  not a product failure. Rerun the unchanged gate in the approved headless
  context; do not weaken assertions or skip visual validation.

Detailed execution guidance lives in
`docs/en/development/validation.md`.

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
