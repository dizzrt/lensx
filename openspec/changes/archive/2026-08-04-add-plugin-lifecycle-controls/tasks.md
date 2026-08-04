## 1. Plugin Manager Removal Foundation

- [x] 1.1 Add internal current-revision/entry resolution for healthy and quarantine records without exposing Store keys or paths through Tauri.
- [x] 1.2 Implement atomic healthy/quarantine record removal with parent-directory sync, one post-persistence revision commit, and fault-injection coverage that preserves the prior disk/memory snapshot on every failure stage.
- [x] 1.3 Tighten `set_enabled` around explicit no-op, stale/degraded/invalid-state rejection, and one-revision semantics while preserving compatibility, grants, Runtime, diagnostics, and other plugin records.
- [x] 1.4 Add focused Rust tests for healthy removal, quarantine removal, no-op enable/disable, stale identity/revision, degraded Store, independent records, restart persistence, and safe diagnostics.

## 2. Installer-Owned Lifecycle Storage And Recovery

- [x] 2.1 Refactor the existing installer process mutex and `.install.lock` into one reusable Host-private commit boundary shared by installation, lifecycle operations, and startup cleanup recovery.
- [x] 2.2 Add canonical, no-follow validation for the unchanged `packages/<plugin-key>/<digest>` payload layout plus the separate on-demand `data/<plugin-key>` and restricted cleanup-record roots; keep all real paths Rust-private.
- [x] 2.3 Implement the versioned per-plugin cleanup record with atomic writes, bounded safe diagnostics, explicit `retain_data | delete_data`, program/data completion facts, and completed-operation idempotency.
- [x] 2.4 Extend startup recovery to resume only provable pending package/data cleanup after Manager recovery, preserve active/quarantine/unknown/symlink/out-of-root evidence, and degrade conflicting writes without blocking unrelated Host startup.
- [x] 2.5 Update first installation and same-identity reinstallation handling to reject pending cleanup, retain preserved data, reset grants/diagnostics/enabled intent from current installation rules, and clear an old completed cleanup record only after new registration succeeds.
- [x] 2.6 Add Rust failure, crash-recovery, cross-process-lock, concurrent install/uninstall, retain-data, delete-data, quarantine, orphan, symlink, malformed-record, and reinstall tests for the shared storage boundary.

## 3. Rust Lifecycle Contract And Coordinator

- [x] 3.1 Define an independent lifecycle contract version and strict serializable request/result/error models for `set_plugin_enabled` and `uninstall_plugin`, including opaque entry identity, expected revision, changed/unchanged outcome, effective availability, cleanup conclusion, and stable safe operations/codes.
- [x] 3.2 Implement `set_plugin_enabled` coordination for healthy entries with revision preconditions, source-independent policy, incompatible enabled intent, no-op behavior, post-commit Registration event publication, and event-failure tolerance.
- [x] 3.3 Implement `uninstall_plugin` coordination for managed healthy/quarantine entries: persist cleanup intent, atomically remove Manager state before destructive cleanup, apply explicit data policy, preserve completed idempotency evidence, and return logical-uninstall plus pending-cleanup conclusions without reviving records.
- [x] 3.4 Reject quarantine enable/disable, unverifiable managed-payload uninstall, stale/degraded/busy/conflicting requests, and unsafe cleanup evidence without leaking Manifest content, paths, digests, Store keys, raw errors, stacks, or Host objects.
- [x] 3.5 Register lifecycle managed state and both commands in Tauri setup/invoke wiring while keeping Registration read-only and preventing public workspace/plugin imports.
- [x] 3.6 Add Rust contract serialization, command, event, no-op, conflict, provenance-independence, unavailable-target, cleanup-pending, and private-field rejection tests.

## 4. Trusted TypeScript Lifecycle Boundary And Surface Convergence

- [x] 4.1 Add Host-private TypeScript lifecycle types, unknown-value parsers, frozen outputs, Tauri adapter, stable error mapping, and shared valid/invalid drift fixtures without exporting them from public plugin packages.
- [x] 4.2 Add explicit provider quiesce/reconcile operations to the production surface coordinator so disable/uninstall withdraw complete Action then Page batches, close an active Page through existing navigation invalidation, and can restore Page then Action from a complete current Registration snapshot.
- [x] 4.3 Implement `PluginLifecycleService` to validate the current snapshot/revision, quiesce before disable/uninstall, avoid Rust calls after quiesce failure, refresh/reproject after Rust failure or conflict, actively observe the returned revision after event loss, and wait for projection idle before user-visible completion.
- [x] 4.4 Implement enable convergence so durable intent commits before same-revision Page then Action publication; preserve enabled intent and fail closed with bounded diagnostics when projection cannot converge.
- [x] 4.5 Wire the lifecycle service only into trusted production composition as infrastructure for Task 6.1; do not add a plugin list/detail surface or final enable/disable/uninstall controls in this change.
- [x] 4.6 Add Rstest/Testing Library coverage for quiesce order, active-page close/Home/focus recovery, search disappearance, stale displayed-result dispatch failure, Recent/Pinned ID preservation, re-enable restoration, revision conflicts, no-op, event loss, projection failure, destroy/late work, and bounded diagnostics.

## 5. Drift Gates And Maintained Documentation

- [x] 5.1 Add a `check:plugin-lifecycle-controls` root gate covering TypeScript fixtures/adapters/services, surface/search/collections regressions, workspace boundaries, Rust lifecycle/Manager/installer tests, and packed public packages to prove the private contract is not shipped.
- [x] 5.2 Update canonical `docs/en/architecture/extension-platform.md` and `docs/en/architecture/plugin-package-format.md` with the shipped lifecycle, data/cleanup ownership, failure recovery, current UI/Runtime limitations, and exact validation command.
- [x] 5.3 Mirror the architecture changes semantically in `docs/zh/` at identical paths and verify both language indexes/links remain aligned without presenting Task 6.1, Runtime, permissions, or upgrade/rollback as shipped.
- [x] 5.4 Review proposal, design, delta specs, implementation, tests, and docs for the settled non-goals and remove any accidental public lifecycle export, generic transaction/runtime platform, provenance shortcut, Recent/Pinned deletion, or full management UI scope.

## 6. Final Validation

- [x] 6.1 Run `pnpm run check:plugin-lifecycle-controls`, `pnpm run check:plugin-registration-contract`, `pnpm run check:local-plugin-installation`, and `pnpm run check:plugin-action-projection`; fix every failure and rerun the failed gate.
- [x] 6.2 Run frontend/workspace validation sequentially with `pnpm run test`, `pnpm run typecheck`, `pnpm run check`, and `pnpm run build`; fix every warning/error and rerun the failed command.
- [x] 6.3 Run Rust validation sequentially with `pnpm run src-tauri:format:check`, `pnpm run src-tauri:test`, and `pnpm run src-tauri:check`; fix every warning/error and rerun the failed command.
- [x] 6.4 Verify English/Simplified Chinese document path and semantic parity, relative links, private/public package boundaries, and absence of planned-as-shipped claims.
- [x] 6.5 Run `openspec validate add-plugin-lifecycle-controls --type change` and the complete final frontend, Rust, dedicated-gate, and documentation validation sets again after the last fix; record remaining limitations or unverified assumptions before requesting archive.
