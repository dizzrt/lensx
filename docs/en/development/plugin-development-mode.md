# Plugin Development Mode

## Scope

Plugin Development Mode is a Host-private workflow for using self-contained
plugin `dist/` directories during development. It is available only in a feature-enabled
development build. The dedicated `pnpm run dev:plugin-development-mode`
command is an explicit per-process opt-in: it starts the native mode enabled
and discovers already-built repository plugins before the frontend loads.
Other feature builds start disabled. No registration, snapshot, source scope,
Runtime, or switch value persists across processes.

The command delegates to the Host-private `development-launcher`, so its actual
local App origin, Tauri child lifecycle, signal forwarding, and cleanup are
identical to `pnpm run app:dev`; only its frontend capability, Rust feature, and
startup root differ.

It does not install a `.lxp`, sign or trust publisher claims, create extra Host
authority, watch files, run a build, automatically reload a plugin, or open a
Page. A discovered Action becomes visible in the Launcher, but only a later
user action opens its production Child WebView Runtime.

That plugin reload boundary is separate from Host frontend hot module
replacement. In `dev`, Rsbuild resolves `@lensx/plugin-contract` from its
workspace source so rebuilding the package `dist/` during validation cannot
interrupt the running frontend module graph. Production builds continue to
resolve the package's published `dist/` entry. Plugin author files remain
snapshot-based and still require **Reload from directory** after rebuilding.

## Canonical Smoke Plugin

The repository includes `examples/plugins/development-mode-smoke`, a public-SDK
plugin with two deterministic build phases. Both phases use the same plugin ID
and output directory for the development reload workflow:

- `initial` builds version `0.1.0`, generation A;
- `reload` builds version `0.2.0`, generation B with the same open-Web Runtime boundary.

Build and validate generation A from the repository root:

```bash
pnpm run gate -- plugin-development-smoke-initial
pnpm run gate -- plugin-development-smoke-validation
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
current Host or it uses Manifest `0.3.x` or an older/iframe Runtime protocol;
`source_changed` means files changed during capture; `conflict`
means the displayed revision is stale; `unsafe_state` means Host ownership
could not be proven. `cleanup_pending` means authority changed successfully but
old cache cleanup must be retried or completed on process exit.

The UI never receives the selected path, snapshot root or identity, file bytes,
operation tokens, raw native errors, or private Manager facts.

## Register, Reload, And Stop Development Plugins

The following walkthrough describes product operation with the example plugin.
Repository acceptance is covered by the deterministic Gates in
[Validation](#validation).

1. Build generation A with the commands above. Place it beneath a direct
   custom-root member as `<root>/smoke/dist`, then run
   `pnpm run dev:plugin-development-mode -- --plugins-root <root>`.
2. Use the configured Launcher shortcut (default `Ctrl+Shift+Space`), run
   **Settings**, and open **Plugins**. The dedicated command enables
   **Plugin Development Mode**. The discovered entry displays version `0.1.0`
   and the labels **Development**, **Unpacked**, and **Unsigned**. Publisher
   text is an author declaration and adds no permission or grant authority.
3. Open the Launcher and run **Open development-mode smoke A**. The example
   Page displays generation A and Host API `0.4.0` capabilities, including Action
   activation methods when their current Session provider is available.
   Development Mode grants no native input-monitoring or shortcut-configuration
   authority.
4. To change the example to generation B, build it in another terminal:

   ```bash
   pnpm run gate -- plugin-development-smoke-reload
   pnpm run gate -- plugin-development-smoke-validation
   ```

   The open Page continues using its generation-A snapshot until you reload it.
   Editing or rebuilding author files does not automatically replace that snapshot.
5. In **Settings → Plugins**, select the development entry and choose
   **Reload from directory**. Successful reload updates the entry to version
   `0.2.0`, generation B, and the **Open development-mode smoke B** Action.
   It creates a fresh Page attempt and applies that generation's Manifest
   presentation, using the same open isolated Runtime boundary. If staging is
   rejected, the current Page attempt and transient user-resized size remain.
6. To remove this plugin from the current process, choose
   **Remove development entry** and confirm. The entry and its Action are removed
   and its open Page closes; plugin data and Launcher collections are retained.
   To stop all development plugins, turn off **Plugin Development Mode** and
   confirm. The Host closes their Pages and removes the process-local entries.

Restarting the dedicated command with the same root discovers fresh entries;
it does not restore the previous process's snapshots or Runtime state. Ordinary
builds continue to start without Development Mode.

Directories containing symbolic links or other unsafe members are rejected
without replacing the current generation. The directory corpus and transaction
checks in `pnpm run gate -- plugin-development-mode` cover these rejection
paths deterministically.

## Validation

Repository acceptance uses deterministic checks. Run the focused Gate after
changing this workflow, and use the [validation guide](validation.md) for the
complete required validation set:

```bash
pnpm run gate -- plugin-development-mode
```

The gate covers build exclusion, contracts, directory corpus, Rust transactions,
Resource/Runtime invalidation, frontend convergence, accessibility, bilingual
messages and docs, deterministic presentation reset/retention assertions, and
production artifacts. Development entries use the same work-area-aware native
coordinator as installed plugins; no author-selected or user-resized size is
persisted across replacement, process restart, or rediscovery.

These Gates do not launch a real WebView, GUI application, or native interaction
harness. The product walkthrough above is not a repository acceptance step;
there is no manual or optional compatibility Gate for it. Gate results establish
the deterministic boundaries they exercise, not operating-system input delivery
or a real WebView run.
