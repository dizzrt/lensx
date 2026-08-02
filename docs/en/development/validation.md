# Validation

## Principle

Validation is part of implementation, not a follow-up. Every OpenSpec task list
must end with explicit final validation tasks, and every completed change must
have reproducible evidence for the affected frontend and Rust layers.

Fix warnings and errors introduced by the change. After a fix, rerun the failed
command and then rerun the complete final validation set.

## Frontend Validation

Run unit and component tests:

```bash
pnpm run test
```

Run TypeScript static checking for source and tests:

```bash
pnpm run typecheck
```

Run Biome formatting and lint checks:

```bash
pnpm run check
```

Build the production frontend:

```bash
pnpm run build
```

These four standard commands validate the root application and every actual
workspace member. A member that omits the corresponding lifecycle script or
returns a non-zero status fails the root command. Run workspace-specific
regressions directly when changing the aggregation or dependency rules:

```bash
pnpm run test:workspace-lifecycle
pnpm run test:workspace-boundaries
pnpm run check:workspace-boundaries
```

Use `pnpm run test:watch` only during development. Final evidence must use the
non-watch command.

## Plugin Contract Validation

Changes to `@lensx/plugin-contract`, its Schema, Host consumer, or Rust model
must run:

```bash
pnpm run check:plugin-contract
```

This gate verifies generated-type drift, package tests, Host boundaries,
TypeScript/Rust shared fixtures, the packed file list and exports, and an
isolated external consumer installed from the real tarball. The tarball smoke
test is required because workspace links can hide missing declarations,
Schema files, export targets, or runtime dependencies.

## Rust Validation

Check Rust formatting:

```bash
pnpm run src-tauri:format:check
```

Run Rust tests:

```bash
pnpm run src-tauri:test
```

Run Rust static compilation checks:

```bash
pnpm run src-tauri:check
```

When a change introduces stricter Rust tooling such as Clippy, record and run
the exact command in the OpenSpec task list.

## Documentation Validation

For documentation changes:

- compare `docs/en/` and `docs/zh/` relative Markdown paths;
- verify both language indexes link to every maintained topic;
- verify relative Markdown links resolve;
- verify English and Simplified Chinese headings and semantics align;
- verify README files contain matching onboarding content;
- verify no formal artifact cites or depends on temporary material;
- verify planned features are not presented as implemented.

## Scope Rules

- A frontend-only change still runs the frontend test, typecheck, check, and
  build set.
- A Rust-only change still runs Rust format, test, and check.
- A cross-boundary or repository-wide change runs both complete sets.
- Every OpenSpec task list records both frontend and Rust validation. If one
  side is genuinely unaffected, record the reason rather than omitting it.
- Documentation-only changes must run documentation validation and any
  repository checks affected by formatted or generated files.

## Final Checklist

- [ ] Changed behavior has meaningful tests.
- [ ] Frontend validation passed or an unaffected reason is recorded.
- [ ] Rust validation passed or an unaffected reason is recorded.
- [ ] English documentation and Simplified Chinese mirrors are aligned.
- [ ] OpenSpec artifacts and stable specs are coherent.
- [ ] No introduced warning or error remains.
- [ ] Failed commands and the complete final validation set were rerun.
- [ ] Remaining limitations and unverified assumptions are reported.
