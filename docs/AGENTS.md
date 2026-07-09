# Documentation Agent Guide

This file helps agents navigate and maintain project documentation under
`docs/`.

## Language Rules

- This `AGENTS.md` file must be written in English.
- `docs/index.md` is the only documentation entry index and may be bilingual.
- Markdown documents under `docs/en/` must be written in English.
- Markdown documents under `docs/zh/` must be written in Simplified Chinese.
- OpenSpec changes and specs are outside this directory, but they should be
  written in Chinese unless the user explicitly requests another language.

## Mirror Rules

- `docs/en/` and `docs/zh/` must remain fully mirrored.
- Every Markdown document under `docs/en/` must have a matching Simplified
  Chinese document under `docs/zh/` with the same relative path.
- Every Markdown document under `docs/zh/` must have a matching English document
  under `docs/en/` with the same relative path.
- Do not create `docs/en/index.md` or `docs/zh/index.md` unless the mirrored
  structure changes through an explicit project decision.
- Do not create placeholder category index files such as
  `docs/en/architecture/index.md` or `docs/zh/architecture/index.md`.
- Category directories should contain actual topic documents only; route and
  summarize them from `docs/index.md`.
- When adding, moving, renaming, or deleting a document in one language tree,
  apply the matching change in the other language tree.

## Navigation Order

When looking for project knowledge, read documents in this order:

1. `docs/index.md` for the documentation map.
2. Topic documents under `docs/en/architecture/` or `docs/zh/architecture/` for
   architecture, layering, and module boundaries.
3. Topic documents under `docs/en/workflow/` or `docs/zh/workflow/` for
   development workflow, OpenSpec workflow, and collaboration conventions.
4. Topic documents under `docs/en/decisions/` or `docs/zh/decisions/` for
   durable decisions and trade-offs.
5. `openspec/specs/` for stable capability requirements.
6. `openspec/changes/` for proposed or in-progress changes.

## Directory Roles

- `architecture/`: Long-lived technical architecture, project structure,
  dependency direction, module boundaries, and desktop runtime constraints.
- `workflow/`: Development workflow, OpenSpec workflow, documentation
  conventions, validation expectations, and collaboration rules.
- `decisions/`: Architecture decision records and durable design trade-offs.

## Writing Rules

- Keep documentation stable and useful.
- Prefer linking to the source document over copying large sections.
- Keep root-level documents short; put detailed explanations in the appropriate
  subdirectory.
- Do not document planned capabilities as implemented behavior.
- Do not directly cite temporary reference file names, paths, or document
  identities from `tmp/` in committed documentation.
- If temporary material contains useful information, restate it as project-owned
  requirements, constraints, or decisions.
- Use repository-relative paths in documentation.

## Maintenance Rules

- Update `docs/index.md` when adding, moving, or removing stable documentation.
- Verify that `docs/en/` and `docs/zh/` remain mirrored after documentation
  changes.
- Add new documents under the most specific stable category.
- Do not add empty or placeholder `index.md` files under category directories;
  update `docs/index.md` instead.
- Use `docs/decisions/` for decisions that explain why an approach was chosen.
- Use OpenSpec, not docs alone, for proposed behavioral changes that still need
  review.
