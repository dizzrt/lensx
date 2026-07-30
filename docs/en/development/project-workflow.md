# Project Workflow

## Sources Of Truth

When project sources disagree, use this order:

1. current source code and tests for implemented behavior;
2. stable specs for accepted capability requirements;
3. canonical English docs for maintained architecture and implementation
   guidance;
4. active OpenSpec changes for proposed or in-progress behavior;
5. README files for human onboarding.

Do not silently choose a convenient source. Resolve or explicitly document a
meaningful conflict.

## Documentation Governance

- `README.md` is the canonical English human entry.
- `README-zh.md` is its Simplified Chinese mirror.
- README files contain introduction, prerequisites, quick start, and contributor
  entry points—not concrete architecture or implementation design.
- `AGENTS.md` and `openspec/config.yaml` are English agent-facing rule files.
- `docs/en/` contains canonical implementation and architecture documents.
- `docs/zh/` mirrors the English documents at identical relative paths.
- `docs/AGENTS.md` contains documentation-specific agent rules.

Update both language versions in the same change. A translation must preserve
the same meaning, scope, examples, limitations, and navigation.

## OpenSpec Language

- Write active proposal, design, delta spec, and task artifacts in the language
  used in the agent conversation unless the user requests another language.
- Keep active artifacts internally consistent in that language.
- Main specs under `openspec/specs/` are always English.
- Before syncing or archiving a change, translate or rewrite the requirements
  entering main specs into English.
- Synchronize stable specs before archiving.

## Change Lifecycle

```text
explore
  -> propose
  -> review artifacts
  -> apply tasks
  -> validate
  -> sync English stable specs
  -> archive
```

- Exploration may inspect and reason about the repository but does not implement
  application code.
- A proposal must distinguish current behavior from proposed behavior and state
  non-goals.
- Design records architecture, data flow, alternatives, risks, and migration
  where relevant.
- Delta specs define normative behavior and observable scenarios.
- Tasks are dependency-ordered and independently verifiable.
- Implementation is complete only after final validation passes.

## Task Requirements

Every `tasks.md` must:

- include implementation, tests, and paired documentation updates;
- keep frontend and Rust work explicit when both are affected;
- end with a final validation section;
- include frontend tests, formatting and static checks, type checking, and
  production build;
- include Rust formatting, tests, and static checks;
- state why a validation area is unaffected rather than silently omitting it;
- require introduced warnings and errors to be fixed;
- require failed commands and the complete final validation set to be rerun.

## Temporary Material

Temporary inputs are not project sources. They may inform reasoning, but formal
code, tests, configuration, docs, specs, and generated artifacts must not link
to, cite, import, or depend on them.

When a temporary example contains useful information:

1. verify it against the current repository and accepted direction;
2. rewrite it as a project-owned requirement, decision, example, or
   implementation;
3. remove all temporary provenance and dependencies;
4. validate the resulting project artifact normally.

## Dependency Changes

- Prefer existing dependencies and platform capabilities.
- Use Semi Design before considering another UI component package.
- Explain the need, alternatives, bundle/runtime effect, maintenance ownership,
  and security implications of a new dependency.
- Add material dependency or component-library decisions to the relevant
  OpenSpec design.

## Completion

Do not claim a change is complete until:

- implementation matches approved artifacts;
- tests cover changed behavior;
- English docs and Chinese mirrors are aligned;
- required frontend and Rust validation has passed;
- introduced warnings and errors have been fixed;
- remaining limitations are reported explicitly.
