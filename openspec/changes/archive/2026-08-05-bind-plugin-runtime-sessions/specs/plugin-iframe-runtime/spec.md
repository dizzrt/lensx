## MODIFIED Requirements

### Requirement: Exactly one active Plugin Page iframe MUST exist only for the current Page lifetime

The system MUST continue to use the existing single-window Page surface and
MUST create at most one current external Plugin Page iframe at a time. Host
Pages MUST continue to render as trusted React modules. The iframe MUST exist
only while `presentationState === "page"`, the current target still resolves as
an available Plugin Page, and the descriptor remains current. Manual close,
provider quiescence, disable, uninstall, replacement, a relevant change to the
current entry, Page, version, resource generation, origin URL, or Runtime
attempt, Home or Search navigation, or App unmount MUST remove the old iframe.
Registration invalidation MUST trigger a refresh and comparison of current
plugin facts, but a process-local global revision change caused only by another
plugin MUST NOT remove or recreate the current iframe, navigation lease, or
Runtime Session. If the Host cannot prove that the current plugin facts remain
unchanged, it MUST fail closed. The system MUST NOT retain a hidden iframe,
background Runtime, second Page state, Router, history, tab, iframe pool, or
cross-Page reuse.

#### Scenario: Open and close one Plugin Page

- **WHEN** a user opens an available external Plugin Page from a unified Launcher Action
- **THEN** the existing surface creates exactly one current iframe
- **WHEN** the user activates the shared close control
- **THEN** the iframe is removed, the App returns Home, query and selection are cleared, and focus returns to the Launcher input

#### Scenario: Active plugin facts change

- **WHEN** Page invalidation, provider quiescence, disable, uninstall,
  replacement, or a relevant entry, Page, version, resource generation, origin
  URL, or Runtime attempt change occurs
- **THEN** the old iframe, navigation lease, and any bound Runtime Session are
  revoked without retaining a second active Runtime
- **THEN** Home, Search, and a `lensx.core` Host Page still create no external
  plugin iframe

#### Scenario: Unrelated registration facts change

- **WHEN** another plugin changes the global Registration revision while the
  current Plugin Page's entry, Page, version, resource generation, origin URL,
  Runtime attempt, availability, and grants remain unchanged
- **THEN** the current iframe, navigation lease, and bound Runtime Session remain
  active and are not recreated solely because the global revision changed
- **THEN** the Host still refreshes and compares relevant current facts rather
  than ignoring the invalidation event
