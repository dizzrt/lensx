## 1. Native main-window identity boundary

- [x] 1.1 Add failing Rust and source-contract tests proving post-creation Launcher resize/lifecycle/native-dialog paths resolve `Window("main")`, while Host activation events target only `Webview("main")` and never the plugin Child WebView.
- [x] 1.2 Refactor the Launcher native adapter/resolver to separate complete native Window operations from the trusted Host WebView event emitter, preserving stable action and operation-stage errors.
- [x] 1.3 Migrate Launcher surface sizing, visibility checks, show/hide/focus, window lifecycle listeners and native-dialog parent lookup to the complete native Window boundary.
- [x] 1.4 Audit every remaining `get_webview_window(MAIN_WINDOW_LABEL)` use; retain it only where a pre-creation Host WebView operation genuinely requires it, and record negative source-contract coverage for all post-creation Launcher paths.

## 2. Atomic Host and Child WebView lifecycle

- [x] 2.1 Add failing Rust tests for resolve-before-mutation, dialog-guard suppression, Child-first/native-parent-second hide ordering, native hide failure rollback, rollback failure teardown and stale rollback inertness.
- [x] 2.2 Refactor unified `show`, `hide` and `toggle` dispatch so it resolves all required native/Host targets before mutating Child presentation and restores or fails closed the compare-current Child when native parent hide fails.
- [x] 2.3 Preserve restore ordering by showing/focusing the native parent before showing/focusing the same equivalent Child WebView; verify that semantic `Cmd+W` and focus-loss hide retain the attempt while Page close still destroys it.
- [x] 2.4 Extend the Child WebView window-lifecycle gate to reject the known single-WebviewWindow lookup regression and to verify atomic failure handling rather than only the normal hide/show call order.

## 3. Page-close and frontend composition regressions

- [x] 3.1 Add a deferred-teardown React/Rstest case proving plugin Page close requests `home` immediately, restores input focus and does not require Child WebView destroy completion before native resize.
- [x] 3.2 Add adapter/contract coverage that `home`, `search` and `page` remain the only frontend-submitted surface modes and that native Window resolution does not expose label, dimensions or Tauri authority to plugin code.
- [x] 3.3 Run and pass the focused Launcher/Runtime composition gate with page-close, same-attempt shortcut activation, failure rollback and no-empty-surface assertions.

## 4. Target macOS ConfigLens evidence

- [x] 4.1 Extend the real macOS ConfigLens lifecycle producer to measure `650×320` Home → `650×600` Page → close → `650×320` Home while teardown is still allowed to complete asynchronously.
- [x] 4.2 Add real application-local `Cmd+W` and focus-loss scenarios proving the complete native window hides, the process remains alive, and no Host-visible/plugin-hidden blank state remains.
- [x] 4.3 Prove global-shortcut restore reuses the same current ConfigLens WebView, Session, Monaco model and Worker without a fresh loading cycle, then prove real Page close destroys the attempt and leaves zero native/bridge/resource authority.
- [x] 4.4 Run `pnpm run evidence:plugin-child-webview-macos`, review privacy and bounded-result fields, and update committed positive evidence only through the maintained explicit update path after every new scenario passes.

## 5. Documentation

- [x] 5.1 Update `docs/en/architecture/plugin-child-webview-runtime.md` with the native Window/Host WebView identity split, atomic hide failure recovery, page-close resize independence and troubleshooting guidance.
- [x] 5.2 Apply a semantically aligned Simplified Chinese update to `docs/zh/architecture/plugin-child-webview-runtime.md` and keep both documentation indexes unchanged unless their link structure changes.
- [x] 5.3 Update maintained validation documentation or gate descriptions to name the multi-webview ConfigLens close/`Cmd+W` regression coverage without changing README or agent onboarding files.

## 6. Final validation

- [x] 6.1 Run `source ~/.zshrc; openspec validate fix-launcher-multi-webview-window-lifecycle --type change --strict --no-interactive` and fix every proposal/design/spec/tasks validation error.
- [x] 6.2 Run focused frontend and composition validation with `pnpm run check:plugin-child-webview-window-lifecycle`, `pnpm run check:plugin-child-webview-slot-contract`, and the affected ConfigLens evidence checks; fix every failure and rerun the complete focused set.
- [x] 6.3 Run frontend/shared tests with `pnpm run test`; fix every failure and rerun the complete command.
- [x] 6.4 Run frontend formatting and static analysis with `pnpm run check`; fix every warning/error introduced by the Change and rerun the complete command.
- [x] 6.5 Run frontend type checking and production builds with `pnpm run typecheck` and `pnpm run build`; fix every failure and rerun both commands.
- [x] 6.6 Run Rust formatting with `pnpm run src-tauri:format:check`; if it fails, run `pnpm run src-tauri:format`, review the diff, and rerun the format check.
- [x] 6.7 Run Rust tests and static checks with `pnpm run src-tauri:test` and `pnpm run src-tauri:check`; fix every warning/error and rerun both commands.
- [x] 6.8 Rerun the real macOS ConfigLens lifecycle evidence and the complete final validation set after the last fix, confirm every task above has evidence, and record any remaining limitation instead of marking the Change complete prematurely.
