## MODIFIED Requirements

### Requirement: The launcher main window must use a compact native window shape

The system MUST configure the main window labeled `main` as an undecorated, non-fullscreen, transparent, always-on-top Launcher Window with initial logical size `650×320`. Home, Search, and Host Page states MUST remain non-resizable and use fixed logical sizes `650×320`, `650×480`, and `650×600`, respectively. A plugin Page MUST use its current validated Page presentation, whose effective initial size is bounded by Contract hard limits and the current monitor work area and whose native user resizing is enabled only when `resizable: true`.

Through a Rust-validated tagged boundary, the Host MUST distinguish `home`, `search`, `host_page`, and identity-bound `plugin_page` targets. Only `plugin_page` MAY carry validated initial size and resizable data. The system MUST NOT accept dimensions from plugin Runtime messages, Host API, DOM measurement, collection/result counts, or arbitrary unbound frontend input. Every transition MUST address the complete native `main` Window while a plugin Child WebView is attached and MUST NOT depend on asynchronous Child WebView teardown completing first.

#### Scenario: Start the desktop application
- **WHEN** lensX creates the main Window and enters `home`
- **THEN** it appears at `650×320` logical pixels with native user resizing disabled
- **THEN** the launcher input and shared Recent and Pinned content region are visible, and the Window remains undecorated, always on top, and non-fullscreen

#### Scenario: Search Actions
- **WHEN** the App Shell moves from `home` to `search`
- **THEN** the Host requests fixed `650×480` and keeps native user resizing disabled
- **THEN** the size does not change with result count or DOM measurement

#### Scenario: Open a Host page
- **WHEN** the App Shell opens a Host Page
- **THEN** the Host requests fixed `650×600` and keeps native user resizing disabled
- **THEN** Page Context and shared content remain visible together

#### Scenario: Open a fixed custom plugin Page
- **WHEN** a resolved plugin Page declares a valid custom initial size and `resizable: false`
- **THEN** the Host applies its effective work-area-bounded initial size to the complete native Window
- **THEN** the user cannot resize it and the plugin receives no native setter authority

#### Scenario: Open a resizable plugin Page
- **WHEN** a resolved plugin Page declares a valid initial size and `resizable: true`
- **THEN** the Host applies its effective initial size and enables native edge/corner user resizing within Host constraints
- **THEN** Home, Search, Host Pages, and other plugin Pages remain unaffected by that opt-in

#### Scenario: Close a Host page
- **WHEN** the App Shell closes a Host Page and returns to `home`
- **THEN** the Host restores `650×320` and `resizable: false`
- **THEN** the launcher input and shared Recent and Pinned content region remain visible

#### Scenario: Close a plugin page while its Child WebView is attached
- **WHEN** the App Shell closes an active fixed or user-resized plugin Page while asynchronous Child WebView teardown is pending
- **THEN** the complete native Window restores to `650×320` and `resizable: false` without waiting, polling, or retrying a single-WebView conversion
- **THEN** the Child WebView becomes hidden and terminal through its compare-current close path and Home retains no plugin presentation state

#### Scenario: Switch between plugin Pages
- **WHEN** plugin Page A transitions directly to plugin Page B with a different validated presentation
- **THEN** the Host applies B's complete effective initial size, constraints, and resizable state
- **THEN** no user-resized size or resizable state from A is inherited

#### Scenario: Home collections change
- **WHEN** a Recent or Pinned collection changes while the App Shell is in `home`
- **THEN** the Window remains fixed `650×320` and non-resizable
- **THEN** the frontend does not measure the DOM or submit another size

#### Scenario: Submit an unsupported presentation
- **WHEN** the Tauri boundary receives an unknown variant, unbound plugin identity, invalid size, or author-disallowed native field
- **THEN** Rust rejects the request
- **THEN** the caller cannot use the boundary to submit arbitrary native Window operations

#### Scenario: Native presentation transition fails
- **WHEN** Rust cannot resolve the native Window, work area, size, constraints, resizable setter, or rollback stage
- **THEN** the command returns a serializable error containing a stable code, target kind, operation, and safe message
- **THEN** the Host retains or restores the last complete safe presentation rather than leaving mixed target/previous state

