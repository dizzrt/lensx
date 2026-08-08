# Plugin Development Mode

## Scope

Plugin Development Mode is a Host-private workflow for manually testing a
self-contained plugin `dist/` directory. It is available only in the dedicated
feature-enabled development build, starts disabled on every lensX process, and
does not persist registrations or the mode switch across restart.

It does not install a `.lxp`, sign or trust publisher claims, create Host authority,
watch files, run a build, or automatically reload a plugin.

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
`@lensx/plugin-sdk` iframe boundary.

## Start lensX

Build the plugin first, then start the dedicated Host build:

```bash
lensx-plugin build
lensx-plugin validate
pnpm run dev:plugin-development-mode
```

In **Settings → Plugins**, enable **Plugin Development Mode** and choose
**Register development directory**. Select the self-contained `dist/` root,
not the project root. Cancelling the native folder picker has no side effect.
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
generation even when bytes are unchanged. It terminates the old Resource and
Runtime authority and publishes a fresh current registration. It does not
create permission or grant state.

**Remove development entry** and disabling the mode remove process-local
development registrations and terminate their current authority. They retain
plugin data and Launcher collections. Installed packages, quarantined records,
and unrelated plugins are unchanged. Restarting lensX also forgets all
development registrations.

## Diagnostics

Errors are stable and pathless. `invalid` means the payload is incomplete or
violates directory rules; `incompatible` means its declared ranges exclude the
current Host; `source_changed` means files changed during capture; `conflict`
means the displayed revision is stale; `unsafe_state` means Host ownership
could not be proven. `cleanup_pending` means authority changed successfully but
old cache cleanup must be retried or completed on process exit.

The UI never receives the selected path, snapshot root or identity, file bytes,
operation tokens, raw native errors, or private Manager facts.

## Real Register To Disable Smoke

Use a fresh lensX process and keep its terminal open throughout this sequence.

1. Build and validate generation A with the commands above, then run
   `pnpm run dev:plugin-development-mode`.
2. Press `Ctrl+Shift+Space`, run **Open settings**, open **Plugins**, enable
   **Plugin Development Mode**, and register
   `examples/plugins/development-mode-smoke/dist` in the native folder picker.
   The entry must show version `0.1.0` and the text labels **Development**,
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
8. Stop and restart `pnpm run dev:plugin-development-mode`. The mode must start
   disabled and no development entry may recover. Finally run
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
