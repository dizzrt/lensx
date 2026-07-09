# Agent Guide For lensX

This repository contains lensX, a lightweight desktop productivity launcher built
with Rust, Tauri 2, Vue 3, TypeScript, and Rsbuild. Treat this file as the
project-level operating guide for agents.

Keep root-level guidance concise. Detailed architecture, workflow, and durable
decisions belong in `docs/`; proposed or in-progress requirement changes belong
in `openspec/`.

## Project Snapshot

- Desktop runtime: Tauri 2.
- System layer: Rust.
- Frontend: Vue 3 and TypeScript.
- Build tool: Rsbuild / Rspack.
- UI and styles: Naive UI, UnoCSS, Less, and PostCSS.
- Package manager: pnpm.
- Formatting and linting: Biome.
- Python environment management: uv.
- Specification workflow: OpenSpec.

The current codebase is an early launcher scaffold. Do not document command
registry, search indexing, extension runtime, synchronization, or other larger
capabilities as shipped features unless they are implemented in the repository.

## Language Rules

- `AGENTS.md` files must be written in English.
- `openspec/config.yaml` must be written in English.
- `README.md` must be written in English.
- `README-zh.md` must be written in Simplified Chinese and must stay aligned
  with `README.md`.
- `docs/index.md` may be bilingual because it is the single documentation entry
  index.
- `docs/en/**` must be written in English.
- `docs/zh/**` must be written in Simplified Chinese.
- OpenSpec changes, including proposals, designs, tasks, and spec deltas, should
  be written in Chinese unless the user explicitly requests another language.
- Code comments should follow the dominant language of the surrounding file.
  Prefer clear naming over comments.

## Source Layout

- `src/`: Vue frontend source.
- `src-tauri/src/`: Rust application shell, Tauri setup, tray, shortcuts, and
  desktop integration.
- `src-tauri/tauri.conf.json`: Tauri application configuration.
- `public/` and `static/`: static assets.
- `openspec/`: OpenSpec configuration, specs, and changes.
- `docs/`: mirrored English and Chinese stable documentation.
- `tmp/`: Git-ignored temporary reference material.

## Commands

- `pnpm install` - Install frontend dependencies.
- `pnpm run dev` - Start the Rsbuild dev server.
- `pnpm run build` - Build the frontend for production.
- `pnpm run preview` - Preview the production build locally.
- `pnpm run check` - Run Biome check with autofix.
- `pnpm run format` - Format supported files with Biome.

## Python Environment Rules

- This project uses `uv` for Python environment and dependency management.
- Run Python commands through `uv run ...`, for example `uv run python
  <script>`.
- Add Python dependencies through `uv add ...`.
- Agents may install missing Python dependencies directly with `uv add` when
  they are needed for project work.
- Do not use direct `python`, `pip`, or `pip install` commands unless the user
  explicitly approves an exception.

## Temporary Reference Rules

- `tmp/` may contain temporary documents, examples, cases, or notes supplied to
  help agents understand intent.
- Agents may read `tmp/` material for context.
- Committed documentation, OpenSpec artifacts, code comments, and specs must not
  directly cite `tmp/` file names, local paths, or document identities.
- When temporary material contains useful information, restate it as
  project-owned requirements, constraints, or decisions.

## Documentation Rules

- Keep `README.md` and `README-zh.md` semantically aligned.
- Keep `docs/en/` and `docs/zh/` fully mirrored.
- Every Markdown document under `docs/en/` must have a matching Simplified
  Chinese document under `docs/zh/` with the same relative path.
- Every Markdown document under `docs/zh/` must have a matching English document
  under `docs/en/` with the same relative path.
- `docs/index.md` is the only documentation entry index.
- Do not create `docs/en/index.md` or `docs/zh/index.md` unless the mirrored
  structure changes through an explicit project decision.
- Do not create placeholder category index files under `docs/en/**` or
  `docs/zh/**`; route categories and topic links from `docs/index.md`.
- Update `docs/index.md` when adding, moving, or removing stable documentation.
- Do not document planned capabilities as implemented behavior.

## Architecture Rules

- Keep Tauri commands thin, typed, and stable.
- Put system integration, window lifecycle behavior, shortcuts, persistence,
  file/process access, indexing, and performance-sensitive work in Rust when
  practical.
- Keep Vue responsible for presentation, interaction state, and view
  composition.
- Avoid putting durable product behavior only inside Vue components.
- Keep business orchestration separate from outbound system adapters.
- Prefer gateway-suffixed names for outbound ports and adapters.
- Prefer business-oriented names and explicit data contracts.
- Use `snake_case` for API payload fields crossing the frontend/Rust boundary.
- Avoid hidden global state unless the lifecycle and ownership are explicit.

## Tauri And Desktop Rules

- Do not silently change global shortcut behavior.
- Do not silently change window visibility, close-to-hide behavior,
  always-on-top behavior, tray behavior, or window sizing strategy.
- Treat Tauri security configuration, permissions, shell/process execution,
  filesystem access, network access, and future extension execution as high-risk
  changes.
- Keep Rust APIs explicit and typed.
- Handle platform-specific behavior deliberately; do not assume macOS, Windows,
  and Linux behave the same.

## Frontend Rules

- Use Vue SFCs with `<script setup lang="ts">` for new components unless there is
  a clear reason not to.
- Prefer Naive UI primitives before custom widgets.
- Prefer UnoCSS for static layout, spacing, sizing, display, flex/grid, and
  repeated page skeletons.
- Use Less for longer semantic style blocks, pseudo classes, media queries,
  theme binding, and component-specific styling that is not cleanly expressed
  with utilities.
- Keep `src/index.css` limited to global base styles and the UnoCSS entry.
- Preserve accessibility basics: semantic elements, labels, keyboard behavior,
  visible focus states, and accessible names for icon-only controls.
- Avoid introducing dependencies unless the need is clear and not already
  covered by the stack.

## OpenSpec Workflow

- Use OpenSpec for meaningful behavior changes, architecture changes, and durable
  requirement changes.
- Keep `openspec/config.yaml` focused on agent-facing project context and
  artifact rules.
- Exploration alone must not turn into implementation. Convert clarified intent
  into an OpenSpec change before implementation when the change affects behavior
  or architecture.
- Project documentation maintenance can be performed directly when the user asks
  for it and no application behavior changes are involved.

## Validation

- After substantive frontend edits, run `pnpm run build`.
- After formatting-sensitive edits, run `pnpm run check` or `pnpm run format` as
  appropriate.
- After project-level documentation edits, review Markdown links and verify the
  English/Chinese document mirror manually.
- After Tauri or Rust edits, add Rust/Tauri validation appropriate to the changed
  area before marking the work complete.

## Reference Docs

- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt
