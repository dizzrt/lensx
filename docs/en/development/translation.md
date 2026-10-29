# Translation Official Plugin

## Identity And Scope

Translation is the direct workspace member
`plugins/translation`, with package name `@lensx/official-translation` and
plugin ID `dev.lensx.translation`. Its Manifest declares a `main` Page and an
`open` Action, localized as **Translation** and **翻译**, with a resizable
800 × 480 initial page size subject to Host workspace constraints.

This reference describes the implementation and reviewed dependencies.
Validation is deterministic; it does not establish publication, installation,
real-account translation, or actual WebView network acceptance.

The plugin owns its React/Semi interface, translation state, language catalog,
Volcengine adapter, and configuration UI. It consumes the public Contract, SDK,
Plugin UI, and Testkit exports and invokes the public CLI for package authoring.
The SDK supplies Runtime Context, plugin-scoped storage, and the public
`http.request` transport. Rust performs controlled HTTPS; the plugin retains
translation logic, credential configuration, and signing. Official status
grants no private Host or Tauri API, filesystem, process, Node Runtime,
clipboard API, or background execution.

The scope is foreground text translation with user-provided Volcengine AK/SK.
It excludes other providers, history, OCR, selected-text capture, automatic
long-text splitting, and Host settings extensions. Installation and manual
development reload retain the existing
[tooling and installation](../plugin-development/tooling-and-installation.md)
and [open Runtime](../plugin-development/runtime-permissions-security.md)
boundaries. See [Plugin Workspace](plugin-workspace.md) for member and lifecycle
rules.

## Workspace And Settings

A compact, centered language group sits above the cards: a filled primary-color
source selector, a language-swap button, and an outlined target selector.
The swap arrow has explicit SVG dimensions and remains recognizable when disabled.
Settings remains on the right. The source/target labels are visually hidden
while retaining complete localized accessible names and keyboard operation.
At a plugin viewport width of at least 720px, source and readonly translation
appear in equal-width columns, source on the left. Narrower viewports stack
source above translation and let the language controls wrap. The resizable
800 × 480 initial size uses the existing Host presentation contract; actual
Host-constrained width determines the layout.

Both outer cards use the same neutral theme surface. The inner source control
uses a neutral surface, while the inner translation control uses a light
primary tint. Text controls add neither a blue focus box nor an underline or other decoration
to their card labels when focused. Native caret and selection remain intact;
selectors and action buttons retain their keyboard-focus indicators. Compact spacing and roughly 140px minimum text-area
height reduce the initial workspace height. Text remains readable, wraps, and
scrolls inside its control; short windows, long feedback, and settings content
use vertical scrolling within the current view to keep its controls reachable. CSS rearranges
the same nodes without changing focus, selection, composition, or request identity.

The workspace has no source counter, clear button, translation-empty instruction,
or bottom service-sending line. Users clear text with native editing and select
the readonly translation for native copy. The 5,000-code-point validation still
runs in the controller and reports over-limit input without truncation. Automatic
translation remains 400 ms after the last eligible edit; there is no manual
translation, one-click copy, read-aloud, or document/image/audio translation
control. Language swap changes only the selected direction, as described below.

Returned markup remains plain text. Labels, language names, disabled reasons,
feedback, and settings support English and Simplified Chinese through the
plugin's own `PluginUiProvider` and complete Runtime Context updates. Locale,
theme, and layout changes do not alter text, languages, request timing, or the
number of translation or storage requests.

No visible status or metadata area appears below the translation, and neither
RequestId nor detected-language text is displayed. Waiting, translating, success,
and pause remain available through a visually hidden polite live region, with
a busy state during a request; empty output stays blank and unannounced.
Actionable input-limit, direction, unavailable-HTTP, and request-failure messages
appear near the language controls. A failed eligible request has an explicit
**Retry translation** action there, without a toast or duplicate announcement.

Missing credentials direct users to Settings. Configuration feedback near the
language bar provides **Reload configuration** for read failures or invalid
records; an unsupported saved target is repaired by selecting a valid target.
A failed target or swap save retains the confirmed direction and shows its
error near the language controls. These recovery actions remain distinct from
request retry. Missing Host HTTP support retains the Host-upgrade explanation.

Open **Settings** to enter a dedicated settings view inside the same plugin
document and Runtime. It does not create a Host Page, route, or native window.
The translation workspace is fully hidden and noninteractive while settings is
visible; its source/output controls and controller remain mounted so returning
retains text, results, languages, selection, and editing history. The settings
header provides **Back to translation**, alongside the existing Save/Cancel flow.

Settings configures Volcengine, the only available provider, and explains that
source text is sent there and credentials are stored locally without encryption.
Access Key ID and Secret Access Key remain masked by default. Save validates the
separate draft and waits for storage confirmation; Back and Cancel discard an
unsaved draft. Validation or a definite save failure keeps the settings view
and draft visible with the latest confirmed configuration unchanged.

Entering settings resets the view scroll position to the top and focuses the
first credential input. Back, Cancel, Escape, or successful save restores the
workspace; after it is visible, its prior scroll position and settings-trigger
focus are restored. Escape used by an input method keeps its normal behavior.
Native text editing and selection remain unchanged without global handlers.

Settings pauses pending translation and cancels in-flight local work. Returning
resumes eligible current input under confirmed request conditions; a still-valid
successful result survives without a duplicate request. While saving, users can
return to the workspace and continue editing source text. Conflicting writes
and translation remain blocked until confirmation or reconciliation finishes.
Returning does not silently cancel or roll back an already submitted write. A
late response from an older settings session cannot close a newly reopened view.

## Configuration And Local Data

The public `storage.get` and `storage.set` methods use one plugin-owned key,
`settings.v1`, with the following versioned JSON shape:

| Field | Meaning |
| --- | --- |
| `version` | Exactly `1`. |
| `provider` | Exactly `"volcengine"`. |
| `targetLanguage` | Optional supported target code; absence preserves locale-derived defaults. |
| `credentials.accessKeyId` | Optional together with `secretAccessKey`; validated Access Key ID. |
| `credentials.secretAccessKey` | Optional together with `accessKeyId`; validated Secret Access Key. |

Form submission trims surrounding whitespace, then requires each key to
contain 1–4,096 printable ASCII characters from `!` through `~`; internal
spaces and control characters are rejected rather than rewritten. Persisted
records must already satisfy that grammar. Unknown fields, partial credential
pairs, and other providers are invalid for version 1.

AK/SK are stored **unencrypted on this machine**, using the Host's existing
plugin-specific JSON persistence. Namespace isolation is not encryption, a
keychain, or a credential vault. The plugin does not persist source text,
translations, or history and does not use browser origin storage to restore
configuration across generations. Source text is sent to Volcengine when an
eligible translation runs; local cancellation cannot retract already sent
text or guarantee that the service did not charge for processing it.

Only an explicit `{ found: false }` starts fresh configuration. Loading,
unavailable storage, read failures, unsupported versions, and malformed
records block translation and are never silently overwritten with defaults.
An explicit reload can retry the read. If the version and all other fields
are valid but only the saved target is unsupported, an explicit valid target
selection can repair that field while preserving validated credentials.
Unknown versions or malformed records cannot use this repair path.

Writes are serialized from the latest confirmed complete record. A target
update preserves credentials, and a credential save preserves the target.
Confirmed failures retain prior values. If a timeout, cancellation, or lost
reply leaves a write's outcome uncertain, translation pauses while storage
is read again; there is no assumed rollback or automatic repeat write. A
failed reconciliation stays blocked until an explicit reload succeeds.

Disabling the plugin preserves its configuration. Clearing plugin data or
uninstalling with data deletion follows the existing Host workflow. A same-ID
reinstallation with retained data can recover configuration, while a new page
still begins with empty source and translation.

## Language Selection

Each new Runtime attempt starts with source language **Auto detect**, represented
only in the UI and controller. A request in Auto mode omits `SourceLanguage`;
it never sends `"auto"` as a provider code. A manual source choice lasts only
for the current page.

The target first restores a valid saved selection. With no saved target it
uses the first valid Context of that page: `en-US` maps to `en`, and `zh-CN`
maps to `zh`. Deriving this default performs no storage write, even if storage
finishes after a later Context event. Explicit target selection automatically
saves the whole record and takes effect only after confirmation. Failed saves
retain the previous effective target. Saving the current inferred target as
the same value does not invalidate a successful translation. Later Host
locale changes affect labels only; a new page without a persisted target can
derive a different default.

**Swap languages** reverses a supported language pair without replacing the
source text with the translation. The current target must support the source
role, the current source must support the target role, and the reversed direction
must be valid. In Auto mode, swap uses only the detected language from a still-valid
confirmed result. Without such a detection, or for a pair that cannot be reversed,
the control is disabled with a localized explanation; it never guesses Auto or
sends an extra detection request.

Swap persists the reversed target first. While confirmation is pending, the old
pair remains effective, language editing and repeated swap are disabled, and
translation waits. After confirmation, source and target reverse together and
the unchanged current text follows the usual 400 ms scheduling. A definite
failure retains the old pair and displays the save error. An uncertain outcome
uses the existing storage reread/reconciliation path before any unconfirmed or
partly reversed direction can be used. Old Runtime callbacks cannot apply a swap
to a new page. Source language remains page-local; no storage fields are added.

The bundled language catalog is a dated release snapshot of the
[official language support table](https://docs.volcengine.com/docs/MachineTranslation/Languagesupport?lang=zh).
The 2026-10-22 review of that table (page update: 2023-11-03) records 129
provider codes, with 128 source choices and 123 target choices before Auto.
It distinguishes `zh`, `zh-Hant`, `zh-Hant-hk`, and `zh-Hant-tw`. `sk` is
target-only; `bo`, `nan`, `wuu`, `yue`, `cmn`, and `ug` are source-only and
can translate only to `zh`. Unsupported explicit directions are blocked
without changing the selected target. Auto detection can receive service
error `-415`; the plugin then asks the user to change the direction instead
of retrying or choosing another language. Catalog inclusion does not prove
automatic detection or a live test of every language pair.

## Input, Requests, And Errors

The source control requests editing without spelling or automatic-correction
prompts through `spellCheck=false`, `autoCorrect="off"`, `autoCapitalize="off"`,
and `autoComplete="off"`. These per-control attributes do not rewrite source
text, change system-wide preferences, or suppress native IME candidate windows.
Their DOM presence is deterministic evidence; actual system UI behavior remains
a platform responsibility.

Eligible text is dispatched 400 ms after the last actual edit. Repeated events
with the same value do not restart work. IME composition cancels older work,
keeps native drafts visible, and preserves the complete final Chinese text.
A committed composition starts one new debounce; an ensuing same-value input
event neither submits again nor resets the timer. Older controlled values must
not overwrite an active draft or its final committed characters. Native deletion
to empty or ending the attempt retires the composition, so late composition-end
or input events cannot restore text.

A composition-marked temporary empty draft keeps the same active session and
token. For example, `compositionstart → input n → input empty → input ni →
compositionend 你` must retain `你`; only an ordinary non-composing clear retires
the session. The controller keeps one text snapshot and receives
`input(text, { composing })` from public native `isComposing` or composition
`inputType` markers. If a native `input` event omits both metadata fields, the
page uses its active composition token and controller session as a fallback.
An explicit non-composing input or ordinary change does not use that fallback.
This fixes the earlier path that retired the session on
an IME's temporary empty draft and rejected its later candidate or commit.

Whitespace-only input clears translation and feedback without requesting,
even above 5,000 characters. Otherwise the local limit is 5,000 Unicode code
points: a surrogate pair counts once, while combining characters count
separately. Over-limit input remains editable and is never truncated or split.
For example, `😀` counts as one code point and `e` followed by U+0301 counts
as two. There is no visible counter; oversized whitespace still stays empty
rather than producing an input-limit error.
Correcting non-whitespace input from 5,001 to 5,000 code points restores normal
400 ms scheduling when the other translation conditions are met.
Eligible requests preserve all original spaces, newlines, and Unicode bytes
and send exactly one `TextList` item.

| Request field | Fixed contract |
| --- | --- |
| Endpoint | `https://translate.volcengineapi.com/` |
| Method and query | `POST`, `Action=TranslateText&Version=2020-06-01` |
| Signing scope | UTC date / `cn-north-1` / `translate` / `request` |
| Body | `TargetLanguage`, `TextList: [source]`, and `SourceLanguage` only for a manual source. |
| Host HTTP policy | Public `http.request`; no shared cookies/system credentials, redirects, retries, or configurable endpoint. |
| Deadline | 15 seconds, covering signing through response reading. |
| Response bound | At most 1 MiB of response bytes. |

The JSON body is serialized once and those exact bytes are signed and sent.
The request carries `Content-Type`, `X-Date`, `X-Content-Sha256`, and
`Authorization`; signed headers are `host;x-content-sha256;x-date`, and the
Rust HTTP transport supplies the actual Host header from the validated URL. See the
[text API](https://docs.volcengine.com/docs/4640/65067) and
[signature contract](https://docs.volcengine.com/docs/APISignatureCallGuide/Signaturemethod-9?lang=zh).

Responses are bounded before presentation. Non-2xx bodies are still checked
for a recognizable `ResponseMetadata.Error`; an HTTP 200 containing a service
error is also a failure. Success requires exactly one `TranslationList` item
whose `Translation` is a string. Malformed JSON, missing fields, extra result
items, and oversized bodies do not yield partial or guessed translations.

Local English/Chinese feedback distinguishes configuration, input limit,
direction/parameters, credential/signature, permission/account, clock, rate/quota,
Host capability/policy/payload-limit, network/unavailability, timeout, service,
protocol, and storage failures. Raw exception
objects and provider messages are never displayed or logged. The provider still accepts diagnostic RequestId values only when they are
1–128 ASCII characters matching `[A-Za-z0-9._:-]+`; the workspace does not render
those values or detected-language metadata. Host transport failures remain safe categories rather than
guessed DNS, TLS, or connection causes. Native HTTP is not subject to browser
CORS response filtering, so service errors can be read without changing
WebView security settings.
Failures preserve source text and require explicit retry. Repeated retry
activation while one request is running does not add parallel calls.

## Result Identity And Lifecycle

Changes to text, source, effective target, or confirmed request configuration
immediately invalidate older work and any mismatched result. The request
generation and Runtime attempt guard every success, error, timeout, and
completion callback, independently of whether abort stopped the remote call.
Persistence confirmation alone is not a semantic configuration change.

Hiding and restoring Launcher within the same current attempt preserves
source, result, language selection, settings drafts, and request state without
issuing a request just for restoration. Real close, navigation, disable,
replacement, unload, development reload, disconnect, or SDK retry cancels
timers and local requests, removes subscriptions, and invalidates old
callbacks. A new attempt reloads configuration and starts with empty text.

## Reviewed Signing Dependency

`@noble/hashes@2.4.0` is an exact plugin-private runtime dependency. The
2026-10-22 review checked the [published npm tarball](https://registry.npmjs.org/@noble/hashes/-/hashes-2.4.0.tgz) against its SHA-512
integrity, package export map, MIT license (Copyright 2022 Paul Miller), ESM
metadata, and zero-runtime-dependency graph. The implementation uses the
public `sha2.js`, `hmac.js`, and `utils.js` paths; the SHA-256/HMAC dependency
closure is pure JavaScript/TypedArray code. No Node builtin, Buffer shim,
Web Crypto, randomness, or remote code is needed on the signing path. The
production module inventory is checked separately rather than treating this
source review as proof of the emitted graph.

The reviewed tarball integrity is
`sha512-X5XaVWZIBCT7HHZGm5I7ZQXDwLG+bGXuSrMQAW+7Zvl87h1kmc1ZB1VSRJcpUfoUrGQp4Fkoxm5kZ+Ms+aW+eA==`.

Fixed signing vectors use synthetic credentials and the independently executed
[official signer at commit `157b31f`](https://github.com/volcengine/volcengine-nodejs-sdk/blob/157b31fea2922fcbcf5192b6c954eabd583e28d6/packages/sdk-core/src/utils/signer.ts).
That reference file's SHA-256 is
`3e3fb9f5185a87ca859d92f1b208b707d297bbb9db1a13d37104412e20559c3e`.
Vectors preserve Unicode, spaces, newlines, UTC dates, and omitted versus
explicit source fields; expected values are not generated by the tested
signer. The official Node SDK is not bundled: it uses Node facilities, and
its [2025 translation client](https://github.com/volcengine/volcengine-nodejs-sdk/blob/157b31fea2922fcbcf5192b6c954eabd583e28d6/service/translate20250301/src/api.ts)
uses API `2025-03-01` and default region `cn-beijing`, which must not replace
this plugin's `2020-06-01` / `cn-north-1` contract.

## Building And Delivery Evidence

The Manifest uses `0.4.0` and supports Host API versions from `0.4.0` up to but
excluding `0.5.0`. Upgrade the Host and public SDK together; existing installed
plugin snapshots are immutable, so rebuild and explicitly reload or replace
the package to use the new transport. An old Host without `http.request` stays
unavailable; the plugin never silently falls back to WebView fetch. The plugin owns its React, Semi, and signing dependencies;
it does not import another plugin, Host source, or Tauri implementation.

The existing aggregate command prepares public workspace dependencies and
runs each direct plugin's lifecycle and pure Node post-build check:

```bash
pnpm run gate -- ci-plugins
```

After dependency preparation, the package-local commands are:

```bash
pnpm --dir plugins/translation run typecheck
pnpm --dir plugins/translation run test
pnpm --dir plugins/translation run check
pnpm --dir plugins/translation run build
pnpm --dir plugins/translation run test:e2e
```

Production output is self-contained under `dist/`, with local scripts and
styles and a document CSP using `connect-src 'none'`. Production translation
uses the public SDK, with no direct browser network fallback. Build-only module inventories remain in
`.build/modules.json` and `.build/chunk-modules.json`, outside `dist/`, so local
source paths are excluded from the package. The post-build check uses public CLI `validate`, two
`pack --no-build` operations, and `inspect` in an operating-system temporary
directory. It checks package/resource closure and repeatable bytes and cleans
temporary output after success or failure. It uses neither private CLI modules
nor a repository-local pnpm store.

The check still invokes the real `lensx-plugin` command. It reports startup
errors such as `ENOENT` or `EACCES`, signal termination, missing exit status,
and nonzero exits before attempting to parse JSON. A zero exit with empty or
invalid JSON, an invalid envelope, or an unexpected command status is a
separate output-protocol failure. Every diagnostic names the executable and
subcommand and includes the available error identifier, exit status, or
signal. Each stdout/stderr summary is limited to 4 KiB including its truncation
marker; missing output is shown as `<empty>`. These are engineering diagnostics,
not changes to the public CLI JSON protocol or product copy. The pure result
helper is covered by the existing package tests using constructed process
results without spawning child processes or importing the E2E entry point.

For a startup failure, first check the consumer command entry and installation
result; for a missing build output, check the existing public dependency
preparation. The separate source-install regression runs through
`pnpm run gate -- plugin-developer-cli`; an existing local command entry or a
successful prebuilt-tarball consumer does not prove clean installation works.
After correcting a failure, rerun the failed stage and the affected Gate.

The focused `plugin-host-http`, `workspace-boundaries`, `workspace-lifecycle`,
and `plugin-developer-cli` Gates supplement complete root frontend/workspace and
Rust validation; they do not replace that lifecycle. No Translation-specific
root script, Gate, or workflow is required. See [Validation](validation.md) and
[Continuous Integration](continuous-integration.md).

Deterministic checks use controlled SDK storage/HTTP, clocks, service responses,
signature vectors, and real DOM components. Responsive layout checks cover
declared CSS breakpoints, overflow, theme tokens, and control continuity;
Happy DOM does not establish actual geometry or pixel appearance. Checks do
not call the translation service, read actual credentials, launch a browser or
WebView, or prove native copy/IME delivery. An OPTIONS probe is not a signed POST or actual WebView
network acceptance. The reported CORS failure motivated the native transport
change; it did not prove that the user credentials were invalid. Builds and
packages do not publish or install the plugin;
installation and development reload remain explicit existing Host operations.

Translation uses SDK `0.5.0` and omits the optional shortcut callback. Repeated
shortcut activation only opens or focuses the existing Page; it does not start
a translation, read the clipboard, reset input, or cancel existing work.
