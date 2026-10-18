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

Before judging implementation or engineering conventions, use the
[documentation index](../index.md) to retrieve relevant durable documents and
search [stable specifications](../../../openspec/specs/). Inspect both when the
question spans implementation and observable contracts. Check current source,
tests, and executable configuration; report missing, insufficient, or conflicting
evidence rather than assuming facts from similar projects.

The root `plugin-roadmap.md` is retained as historical planning by explicit
maintainer choice. Its language reconciliation is outside this governance run;
it is not a synchronized documentation baseline or evidence of shipped behavior.

## Documentation Governance

- `README.md` is the canonical English human entry.
- `README-zh.md` is its Simplified Chinese mirror.
- README files contain introduction, prerequisites, quick start, and contributor
  entry points—not concrete architecture or implementation design.
- `AGENTS.md` and `openspec/config.yaml` are English agent-facing rule files.
- `docs/en/` contains canonical implementation and architecture documents.
- `docs/zh/` mirrors the English documents at identical relative paths.
- `docs/AGENTS.md` contains documentation-specific agent rules.

The sole source of language-policy values is
[govern-spec.yaml](../../../govern-spec.yaml); the
[root agent instructions](../../../AGENTS.md#language-and-mirroring) explain its
execution semantics. The first declared README or docs language is its semantic
baseline. Synchronize every declared translation in the same task, preserving
meaning, scope, examples, limitations, and navigation. Missing or stale declared
translations cannot be deferred.

Only `docs/AGENTS.md` may be directly under `docs/`; each language root contains
only `index.md` as a direct file. Other durable docs belong in existing topic
categories. Each language's root index is its sole categorized catalog; topic
hubs guide readers within their category. README, root agent instructions, and
driver configuration must not duplicate detailed document or feature catalogs.
README navigation links its language's index and the stable-spec entry point;
adjacent command or high-risk warning context links may remain.

When adding, moving, or deleting documents, update corresponding indexes and all
affected inbound and outbound links, including references outside docs. Validate
links against final paths and preserve matching language-tree structure.
Root-level maintained contributor or roadmap docs also follow the docs language
policy; historical material is not a maintained baseline.

## OpenSpec Language

- Resolve new or substantively rewritten proposal, design, delta-spec, and task
  prose using the root instructions and `language_policy.active_changes` at
  writing time. Explicit artifact-language requests take precedence; fixed tags
  select that language, while `auto` follows the current task's natural
  conversation, then the relevant existing artifact if unclear, then a question.
- Code, quotations, and tool output are not conversation-language evidence;
  the driver or stable-spec language is not the fallback.
- Apply this to audit prose too. Preserve untouched and archived content;
  checkbox-only updates do not trigger translation. Preserve machine-facing
  headings, schema keys, identifiers, commands, paths, and protocol text.
- Translate and reconcile accepted content entering stable specs into
  `language_policy.stable_specs`; source change artifacts may retain their language.
- Synchronize stable specs before archiving.

## Change Lifecycle

Explore, propose, review artifacts, apply tasks, validate, synchronize stable
specifications, audit governance and documentation, validate the synchronized
result, then archive when separately requested.

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
- end with a final validation and archive-readiness section reserving the
  change-scope audit and project-level trigger decision below;
- include frontend tests, formatting and static checks, type checking, and
  production build;
- include Rust formatting, tests, and static checks;
- state why a validation area is unaffected rather than silently omitting it;
- require introduced warnings and errors to be fixed;
- require failed commands and the complete final validation set to be rerun.

## Governance And Archive Readiness

Reconcile governance when requested, when governance surfaces change, or when
drift is found. This procedure does not authorize feature work, archiving,
staging, committing, pushing, publishing, or global configuration changes.
Preserve tool-owned integrations and use their generator for authorized updates;
mandatory project rules must remain discoverable without generated integrations
or an installed skill.

### Required Change-Scope Audit

Every archive reviews the final accepted artifacts, affected implementation and
tests, relevant stable specs, durable documentation categories, indexes, declared
languages, links, and applicable governance constraints. Repair violations
introduced or touched by the change; touched pre-existing issues are not exempt.
Reconfirm an earlier apply-time audit against the final accepted scope, including
for standalone archive requests.

Assign durable findings to existing documentation owners: architecture and
interfaces, business or requirement workflows, critical constraints and decisions,
and reusable development conventions where affected. Checked tasks, an unchanged
docs tree, or passing spec validation alone do not establish current coverage.

### Conditional Project-Level Audit

Add project-level review when a change affects any governance surface:

- `govern-spec.yaml` or root/directory-local agent instructions;
- README variants or documentation indexes;
- documentation language sets, directory structure, or synchronization relationships;
- spec-driver project configuration;
- temporary-directory rules;
- generated integrations or their generation configuration.

Consider meaning, organization, and generation changes as well as direct edits.
Adding/removing a document and updating its index triggers review; editing
ordinary categorized prose alone does not. Evaluate the trigger before the audit
and again after repairs, which may introduce governance impact.

Review canonical ownership, navigation, category boundaries, language parity,
temporary paths, and lifecycle rules across these surfaces. This is not a full
product implementation or historical-change audit. Changes without governance
impact need only the change-scope audit and a recorded reason for not triggering
project-level review. Record unrelated existing issues for follow-up without
expanding scope; required in-scope constraints and failed checks cannot be
deferred to bypass readiness.

### Sequence And Durable Evidence

Synchronize accepted deltas into the configured stable-spec language before
archive, recording no applicable deltas when appropriate. Then complete the
change-scope audit and any triggered project-level audit, synchronize affected
docs, indexes, links, and declared languages, and validate the synchronized result
before moving the change. Missing, stale, or unresolved in-scope documentation
and governance block readiness.

New task lists reserve this work in their final validation/archive-readiness
group. Older changes without evidence append it before archive. Record the audit
in the change's `tasks.md` using the active language resolved when writing; check
the item only after completion. Each record includes:

| Evidence | Required content |
| --- | --- |
| Reviewed scope | Accepted artifacts and affected implementation/test paths or modules. |
| Objects checked | Relevant specs, documentation categories and paths, indexes, languages, links, and governance constraints. |
| Project-level audit | Trigger decision and reason; extra scope, findings, and repairs when triggered. |
| Result and rationale | Updated, no update required, or not ready, with reasons for coverage and compliance. |
| Updated paths | Actual changed specs, docs, indexes, and governance files, or none with a reason. |
| Validation | Actual commands/checks, results, and applicable paths, including synchronization, links, parity, and spec validation. |

A no-update conclusion still needs evidence. Planned commands are not passing
results. Keep the procedure here and audit facts in `tasks.md`; chat and pull
request summaries cannot replace that record. Readiness does not execute or
authorize archive. After moving an authorized change, verify final relative links
and archived artifacts again.

## Temporary Material

Project-root `.tmp/`, `.temp/`, `tmp/`, and `temp/` are ignored, non-authoritative
inputs. Keep all four ignored; report tracked temporary files without silently
untracking them. Operating-system temporary APIs are unaffected.
Temporary inputs may inform reasoning, but formal
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
