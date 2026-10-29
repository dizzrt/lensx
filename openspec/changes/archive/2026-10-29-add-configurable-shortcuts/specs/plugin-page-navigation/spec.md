# Spec Delta

## MODIFIED Requirements

### Requirement: Plugin Page navigation must remain framework-neutral and Host-controlled

Plugin Page opening MUST use framework-neutral Host navigation and current Registry availability, and associate the trusted current Action invocation. Failures MUST reject safely; plugins gain no renderer, setter, route, or native authority.

#### Scenario: Open an available Plugin Page

- **WHEN** the Dispatcher executes a Host-synthesized Plugin Action executor
  whose target is currently available in the Page Registry
- **THEN** the navigation service sends the App Shell a flat `ActivePage` with
  the correct owner ID, Page ID, and opening Action ID
- **THEN** the Dispatcher preserves its existing typed success semantics
- **THEN** neither the React result component nor the plugin receives an
  executor or setter

#### Scenario: Reject an unavailable target

- **WHEN** a target is unknown, unavailable, removed, or the navigation handler
  is unavailable
- **THEN** the navigation service does not change the current App Shell
  presentation
- **THEN** the unified Dispatcher still reduces Plugin Action failure to
  `action_execution_failed`
- **THEN** the public result does not distinguish internal failure causes that
  could enumerate plugin state

#### Scenario: Resolve a navigation request through the current Page Registry
- **WHEN** an Action requests opening a Plugin Page by structured target identity
- **THEN** The system MUST use the unified framework-neutral application navigation
  service to accept `{ owner_id, page_id }` and an opening Action ID.
- **THEN** navigation MUST also accept independent Host invocation context and associate it with the current Page attempt; ActivePage retains only owner/page/opened_by_action_id identity fields and never uses invocation IDs as Page identity.
- **THEN** before notifying the sole App Shell handler, navigation MUST query the current available Page descriptor; unknown, unavailable, or removed Pages MUST reject with safe `page_unavailable` semantics.
- **THEN** plugins, Manifests, Action descriptors, and projection payloads MUST NOT obtain React setters, navigation handlers, route executors, Registry mutation APIs, Tauri APIs, or Page renderers.

#### Scenario: Deliver a new invocation to the same Page
- **WHEN** the current Action or another Action opens the same owner/page with a new invocation while Runtime facts remain equivalent
- **THEN** the Host preserves the existing Page, Child WebView, input, selection, and business state while updating the opening Action display and independent activation
- **THEN** shortcut provenance delivers the activation to the current plugin when it has supplied a callback, while normal provenance only updates activation facts
- **THEN** invocationId changes do not rebuild the Page or input, and the launcher input does not steal focus

#### Scenario: Terminate old invocations on Page navigation or invalidation
- **WHEN** a Page closes, is replaced, is navigated away from, or becomes unavailable while an invocation awaits initialization or delivery
- **THEN** the invocation belongs only to its original Page attempt, and undelivered work terminates and is cleaned up
- **THEN** late results cannot reopen the old Page, contaminate the new Page provenance, or execute in a replacement Session
