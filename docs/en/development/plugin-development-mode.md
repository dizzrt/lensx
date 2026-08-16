# Plugin Development Mode

## Scope

Plugin Development Mode is a Host-private workflow for testing self-contained
plugin `dist/` directories. It is available only in a feature-enabled
development build. The dedicated `pnpm run dev:plugin-development-mode`
command is an explicit per-process opt-in: it starts the native mode enabled
and discovers already-built repository plugins before the frontend loads.
Other feature builds start disabled. No registration, snapshot, source scope,
Runtime, or switch value persists across processes.

It does not install a `.lxp`, sign or trust publisher claims, create extra Host
authority, watch files, run a build, automatically reload a plugin, or open a
Page. A discovered Action becomes visible in the Launcher, but only a later
user action opens its production Child WebView Runtime.

## Canonical Smoke Plugin

The repository includes `examples/plugins/development-mode-smoke`, a real
public-SDK plugin with two deterministic build phases. Both phases use the same
plugin ID and output directory so that they exercise the actual development
reload transaction:

- `initial` builds version `0.1.0`, generation A;
- `reload` builds version `0.2.0`, generation B with the same open-Web Runtime boundary.

Build and validate generation A from the repository root:

```bash
pnpm run build:plugin-development-smoke:initial
pnpm run validate:plugin-development-smoke
```

The native picker target is the absolute path to
`examples/plugins/development-mode-smoke/dist`, not the plugin project root.
The build output is self-contained and the Runtime imports only the public
`@lensx/plugin-sdk/webview` boundary.

## Start lensX

Build the repository plugins first, then start the dedicated Host build:

```bash
lensx-plugin build
lensx-plugin validate
pnpm run dev:plugin-development-mode
```

The command defaults to direct members under `plugins/` and inspects only each
existing `plugins/<member>/dist`. Hidden members and members without `dist/`
are ignored. To use another root, pass exactly one override:

```bash
pnpm run dev:plugin-development-mode -- --plugins-root /absolute/plugin-projects
```

The custom root replaces the default; it is not scanned in addition to
`plugins/`. Each non-hidden direct member is treated as a project container,
and only its `dist/` child is a candidate. The wrapper normalizes the root and
keeps it in a Host-private startup environment value; it never enters the
frontend bundle, event payloads, Registration Contract, or plugin Runtime.

In **Settings → Plugins**, **Plugin Development Mode** is already enabled.
**Register development directory** remains available for an additional manual
selection, including when the root is missing, empty, unreadable, or every
candidate was skipped. Select the self-contained `dist/` root, not the project
root. Cancelling the native folder picker has no side effect.
While a Host-owned native picker is open, lensX keeps its parent window visible
and suppresses shortcut/focus-loss hiding; normal hide-on-blur resumes as soon
as the picker returns or is cancelled.

The Host accepts only regular files beneath the selected root. It rejects
links, special files, non-portable or case-colliding paths, oversized trees,
source changes during capture, invalid Manifests, missing referenced resources,
and incompatible versions. It does not read `package.json`, inspect project
imports, execute build scripts, or require `checksums.json`.

## Snapshots, Reload, And Removal

lensX copies an accepted directory into an immutable Host-owned snapshot under
the application cache. Plugin Manager, Resource, and Runtime authority refers
only to that snapshot; author files are never a serving fallback. The snapshot
tree identity uses the internal `sha256-development-tree-v1` domain and is not
a `.lxp` package digest.

After editing source, run the plugin build and validation again, then choose
**Reload from directory**. Every successful manual reload creates a fresh
generation even when bytes are unchanged. Native staging validates and publishes
the replacement registration before presentation teardown; rejected staging
leaves the current Child WebView and Session untouched. After a successful
commit, lensX destroys the old Child WebView attempt before projecting the new
generation. Development and installed plugins use the same Child WebView
registry, origin/resource binding, top-level navigation, private bridge,
Session, RPC, Host API, and terminal teardown. Source provenance adds no Host
authority and reload does not create permission or grant state.

**Remove development entry** and disabling the mode remove process-local
development registrations and terminate their current authority. They retain
plugin data and Launcher collections. Installed packages, quarantined records,
and unrelated plugins are unchanged. Restarting lensX also forgets all
development registrations.

## Diagnostics

Startup candidates use the same directory inspection and immutable snapshot
preparation as manual registration. `invalid`, `incompatible`,
`source_changed`, `unsafe`, and candidate-level read failures skip only that
member; the terminal reports its portable member label, stable code, and the
final loaded/skipped counts. Before any candidate commits, lensX checks IDs
across the whole prepared batch and current builtin, external, quarantine, and
development identities. Any duplicate is a startup-blocking `conflict`; lensX
cleans all uncommitted snapshots and never shadows or replaces an entry. A
Manager or cache coordination failure rolls back this bootstrap batch and
stops setup rather than exposing a partial initial projection.

Errors are stable and pathless. `invalid` means the payload is incomplete or
violates directory rules; `incompatible` means its declared ranges exclude the
current Host or it uses the legacy Manifest `0.2.x`/iframe Runtime protocol;
`source_changed` means files changed during capture; `conflict`
means the displayed revision is stale; `unsafe_state` means Host ownership
could not be proven. `cleanup_pending` means authority changed successfully but
old cache cleanup must be retried or completed on process exit.

The UI never receives the selected path, snapshot root or identity, file bytes,
operation tokens, raw native errors, or private Manager facts.

## Real Register To Disable Smoke

Use a fresh lensX process and keep its terminal open throughout this sequence.

1. Build and validate generation A with the commands above. Place it beneath a
   direct custom-root member as `<root>/smoke/dist`, then run
   `pnpm run dev:plugin-development-mode -- --plugins-root <root>`.
2. Press `Ctrl+Shift+Space`, run **Open settings**, and open **Plugins**. The
   **Plugin Development Mode** Switch must already be on, and the discovered
   entry must show version `0.1.0` and the text labels **Development**,
   **Unpacked**, and **Unsigned**. Its publisher remains unverified author text,
   and no permission or grant facts are present.
3. Open the Launcher again and run **Open development-mode smoke A**. The real
   plugin WebView must report generation A and Host API `0.2.0` capabilities.
4. Without closing lensX, build and validate generation B in another terminal:

   ```bash
   pnpm run build:plugin-development-smoke:reload
   pnpm run validate:plugin-development-smoke
   ```

   The already-open page must remain generation A before manual reload, proving
   that the Host serves its immutable snapshot rather than changed author files.
5. Return to **Settings → Plugins**, select the development entry, and choose
   **Reload from directory**. The current entry must become version `0.2.0` and
   generation B. No permission/grant state may appear, and the refreshed page
   must use the same open isolated Runtime profile. The Launcher action must change to **Open development-mode smoke
   B**.
6. Choose **Remove development entry** and confirm. The entry and its Launcher
   action must disappear, and any open plugin Page must terminate. The result
   must state that plugin data and Launcher collections were retained.
7. Register the same generation-B `dist/` once more, open it, then disable
   **Plugin Development Mode**. Confirm the shutdown. The Host must quiesce the
   live Page and remove every development entry before the UI reports the mode
   disabled.
8. Stop and restart `pnpm run dev:plugin-development-mode` with the same root.
   The mode must start enabled and rediscover fresh registrations without
   recovering the prior process's snapshot, Runtime, or registration state.
   An ordinary build still starts without Development Mode. Finally run
   `pnpm run check:plugin-development-mode-boundaries` to verify that the normal
   production artifacts still exclude the feature.

For a real unsafe-directory rejection without changing the fixture source,
build generation A, add a symbolic link inside its `dist/`, and attempt a
register or reload. The Host must reject it without replacing the current
generation. Rebuilding generation A removes the test link because Rsbuild
cleans `dist/` before emitting output.

## Validation

Run the focused gate after changing this workflow:

```bash
pnpm run check:plugin-development-mode
```

The gate covers build exclusion, contracts, directory corpus, Rust transactions,
Resource/Runtime invalidation, frontend convergence, accessibility, bilingual
messages and docs, fixed-viewport visual evidence, and production artifacts.
