# Translation Official Plugin

## Identity And Scope

Translation is the direct workspace member
`plugins/translation`, with package name `@lensx/official-translation` and
plugin ID `dev.lensx.translation`. Its Manifest declares a `main` Page and an
`open` Action, localized as **Translation** and **翻译**, with a resizable
800 × 600 initial page size subject to Host workspace constraints.

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

The workspace places editable multiline source text above a selectable,
read-only multiline translation. Returned markup remains plain text. Labels,
language names, feedback, and settings support English and Simplified Chinese;
the plugin's own `PluginUiProvider` follows complete Runtime Context updates
for locale and light/dark theme. These presentation changes do not alter text,
language selections, or the number of translation requests.

Open **Settings** to configure the only available provider, Volcengine. Access
Key ID and Secret Access Key fields are masked by default. The panel stays in
the current document, preserves the source control and text, and separates
draft values from confirmed configuration. Save validates the draft and waits
for storage confirmation; Cancel discards it. Focus enters the panel and
returns to the settings trigger when the panel closes. Escape closes settings
unless an input method is using the key. Text editing and selection use the
focused native control without a global edit or clipboard handler.

Opening settings pauses pending translation and cancels in-flight local work.
Closing it resumes the current eligible input. An existing successful result
is retained when its request conditions are unchanged, including unchanged
configuration saves. Configuration commits prevent conflicting saves while
leaving source text editable.

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

Each new Runtime attempt starts with source language **Auto**, represented
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

Eligible text is dispatched 400 ms after the last actual edit. Repeated events
with the same value do not restart work. IME composition cancels older work,
keeps drafts local, and starts one new debounce after final composition.
Clearing the input or ending the attempt retires the composition so a late
composition-end event cannot restore text.

Whitespace-only input clears translation and feedback without requesting,
even above 5,000 characters. Otherwise the local limit is 5,000 Unicode code
points: a surrogate pair counts once, while combining characters count
separately. Over-limit input remains editable and is never truncated or split.
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
objects and provider messages are never displayed or logged. A RequestId is
displayable only when it is 1–128 ASCII characters matching
`[A-Za-z0-9._:-]+`. Host transport failures remain safe categories rather than
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

The Manifest uses `0.4.0` and supports Host API versions from `0.3.0` up to but
excluding `0.4.0`. Upgrade the Host and public SDK together; existing installed
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
signature vectors, and real DOM components. They do not call the translation
service, read actual credentials, launch a browser or WebView, or prove native
copy/IME delivery. An OPTIONS probe is not a signed POST or actual WebView
network acceptance. The reported CORS failure motivated the native transport
change; it did not prove that the user credentials were invalid. Builds and
packages do not publish or install the plugin;
installation and development reload remain explicit existing Host operations.
