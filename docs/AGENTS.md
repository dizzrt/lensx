# Documentation Agent Guide

This file governs all documentation under `docs/`.

## Canonical Language

- English documents under `docs/en/` are canonical.
- Simplified Chinese documents under `docs/zh/` are translations of the
  matching English documents.
- This file must remain in English.
- Do not use a Chinese document to introduce requirements or decisions that do
  not exist in its English counterpart.

## Mirrored Structure

- Every `docs/en/**/*.md` file must have a matching `docs/zh/**/*.md` file with
  the same relative path.
- Every `docs/zh/**/*.md` file must have a matching `docs/en/**/*.md` file with
  the same relative path.
- Both language roots must contain an `index.md`.
- Organize documents into specific category directories such as
  `architecture/` and `development/`.
- When adding, moving, renaming, or removing a document, update both language
  trees and both indexes in the same change.

## Reading Order

Agents must:

1. Start at `docs/en/index.md`.
2. Read the English topic documents relevant to the task.
3. Check stable specs under `openspec/specs/`.
4. Check active change artifacts when work is proposed or in progress.
5. Inspect source code and tests before making claims about implemented
   behavior.

## Content Boundaries

- Keep README files focused on human introduction and quick onboarding.
- Keep root `AGENTS.md` focused on agent onboarding and repository rules.
- Put maintained architecture, implementation details, workflows, and
  trade-offs in the appropriate English topic document and mirror it in
  Simplified Chinese.
- Put accepted capability requirements in stable OpenSpec specs.
- Use active OpenSpec changes for proposed or in-progress behavior.
- Clearly label architectural direction that is not yet implemented.
- Never document planned behavior as shipped behavior.

## Temporary Material

Temporary material may be inspected as input, but committed documentation must
not link to, cite, depend on, or name individual temporary files or sources.
Restate useful information as project-owned goals, constraints, examples,
architecture, or decisions.

## Writing And Linking

- Use descriptive headings and concise sections.
- Prefer one maintained source over duplicated explanations.
- Use relative Markdown links within `docs/`.
- Keep code and command examples executable and current.
- Keep terminology consistent between language versions.
- Preserve code identifiers, file paths, commands, and protocol names when
  translating.

## Review Checklist

Before completing a documentation change:

- verify the English content is accurate against current code, tests, specs,
  and approved decisions;
- verify the Chinese document has the same headings, meaning, examples, and
  limitations;
- verify relative paths are identical across the two language trees;
- verify both indexes contain working relative links;
- verify no temporary source is cited or linked;
- verify planned and implemented behavior are clearly distinguished.
