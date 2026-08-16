## ADDED Requirements

### Requirement: Launcher MUST separate native Window and Host WebView identities

系统 MUST 将 `main` 原生 Window、受信任 Host WebView 和插件 Child WebView 视为不同身份。原生尺寸、可见性、显示、隐藏、聚焦、窗口事件和 native-dialog parent 操作 MUST 始终作用于完整 `main` 原生 Window，并在 Child WebView 附加或移除前后保持可解析。Host activation event MUST 仅定向到受信任 Host WebView，MUST NOT 因 native Window 操作而广播给插件 Child WebView。

#### Scenario: Resolve the native parent after attaching a Child WebView

- **WHEN** `main` 原生 Window 同时包含 Host WebView 和当前插件 Child WebView
- **THEN** Launcher 的 native size、visibility、show、hide、focus 和 window-event 操作仍解析同一个完整原生 Window
- **THEN** Child WebView 的不同 label 不会使主窗口 lookup 失效

#### Scenario: Emit activation after restoring a plugin page

- **WHEN** Launcher 恢复包含当前插件 Child WebView 的隐藏原生 Window
- **THEN** typed activation event 仅发送给受信任 Host WebView
- **THEN** 插件 Child WebView 不会因该 native Window 恢复而收到 Host activation event 或新增 Host authority

#### Scenario: Open a native dialog from the Host

- **WHEN** Host 在允许的 Launcher surface 上打开 native dialog
- **THEN** dialog 使用完整 `main` 原生 Window 作为 parent
- **THEN** dialog guard 在 dialog 生命周期内继续抑制 focus-loss hide，而不改变 Child WebView authority

## MODIFIED Requirements

### Requirement: The launcher main window must use a compact native window shape

The system MUST configure the main window labeled `main` as a launcher window with a fixed width of 650px, an initial height of 320px, a minimum height of 180px, and a maximum height of 800px. The window MUST be undecorated, non-resizable, non-fullscreen, transparent, and always on top.

Through a Rust-validated typed boundary, the Host MUST use fixed discrete heights of 320px, 480px, and 600px for the App Shell's `home`, `search`, and `page` presentation states, respectively. The system MUST NOT accept arbitrary dimensions supplied by the frontend and MUST NOT change the native window height based on DOM measurements, home collection counts, or search-result counts. These fixed transitions MUST continue to address the complete native `main` Window while a plugin Child WebView is attached, and MUST NOT depend on asynchronous Child WebView teardown completing first.

#### Scenario: Start the desktop application

- **WHEN** lensX creates the main window and enters the `home` presentation state
- **THEN** the main window appears at a width of 650px and an initial height of 320px
- **THEN** the launcher input and shared Recent and Pinned content region are visible in the window
- **THEN** the main window is undecorated and remains always on top
- **THEN** the user cannot manually resize the main window or enter fullscreen

#### Scenario: Search Actions

- **WHEN** the App Shell moves from the `home` to the `search` presentation state
- **THEN** the Host requests a fixed main-window height of 480px
- **THEN** the search-result grid of at most eight items remains bounded within the window
- **THEN** the window height does not change with the number of results

#### Scenario: Open a Host page

- **WHEN** the App Shell enters the `page` presentation state
- **THEN** the Host requests a fixed main-window height of 600px
- **THEN** the page-context bar and shared page content region are visible together

#### Scenario: Close a Host page

- **WHEN** the App Shell closes the active page and returns to `home`
- **THEN** the Host requests restoration of the fixed 320px main-window height
- **THEN** the launcher input and shared Recent and Pinned content region remain visible

#### Scenario: Close a plugin page while its Child WebView is attached

- **WHEN** the App Shell closes an active plugin Page and returns to `home` while asynchronous Child WebView teardown is still pending
- **THEN** the complete native main Window restores to the fixed 320px height without waiting, polling, or retrying a single-WebView conversion
- **THEN** the Child WebView becomes hidden and terminal through its compare-current close path
- **THEN** Home does not retain the 600px `page` height

#### Scenario: Home collections change

- **WHEN** a Recent or Pinned collection changes from empty to non-empty or changes its item count while the App Shell is in `home`
- **THEN** the main window remains at its fixed height of 320px
- **THEN** the frontend does not measure the DOM or submit another height

#### Scenario: Submit an unsupported presentation mode

- **WHEN** the Tauri boundary receives a mode other than `home`, `search`, or `page`
- **THEN** Rust rejects the request
- **THEN** the frontend cannot use this boundary to submit arbitrary window dimensions

#### Scenario: Native height transition fails

- **WHEN** Rust cannot resolve the native main Window or set the fixed height for the requested mode
- **THEN** the command returns a serializable error containing a stable code, mode, operation, and safe message
- **THEN** the current App Shell state is not cleared

### Requirement: A recoverable launcher must hide on close and focus loss

After the default global shortcut is registered successfully, the system MUST prevent a main-window close request from terminating the application and MUST route the request to `hide`. On macOS, the system MUST provide exactly one application-local `Cmd+W` window-close shortcut entry point. When the undecorated main window cannot produce a close event through the native close command, that entry point MUST still route to `hide` through the unified action boundary. The system MUST NOT register `Cmd+W` as a system-wide global shortcut. The system MUST route main-window focus loss to `hide`. Window events emitted after a system-initiated hide MUST NOT cause an action loop or terminate the application.

The application-local macOS `Cmd+W` entry point MUST be enabled only after the default global shortcut is registered successfully. If menu-event installation or routing fails, or if the hide operation fails, the system MUST make failure information available for developer diagnosis, MUST NOT expose native error details to the user, and MUST NOT terminate the application process because of the failure.

When a current Child WebView exists, the hide boundary MUST resolve the complete native main Window before changing Child presentation. It MUST hide the Child WebView before the native parent to prevent overlay leakage, and MUST either hide both surfaces or restore the still-current Child presentation when native parent hide fails. A failed hide MUST NOT leave the Host window visible with only the plugin content blank. Restore MUST show and focus the native parent before restoring and focusing the same current Child WebView.

#### Scenario: Close a ready launcher window

- **WHEN** the default global shortcut has been registered successfully
- **AND** the user requests that the main window close
- **THEN** the system prevents the default close behavior
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the application process continues running

#### Scenario: Press Cmd+W in a ready macOS launcher

- **WHEN** the default global shortcut has been registered successfully
- **AND** the macOS main window is visible and lensX is the foreground application
- **AND** the user presses `Cmd+W`
- **THEN** exactly one application-local menu shortcut entry point handles the key press
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the main window is not destroyed and the application process continues running

#### Scenario: Press Cmd+W while a plugin Child WebView is visible

- **WHEN** the foreground macOS Launcher contains a visible current plugin Child WebView
- **AND** the user presses `Cmd+W`
- **THEN** the unified action resolves and hides the complete native Window and current Child WebView as one semantic transition
- **THEN** the Host page chrome and plugin content are both absent from the screen while the process and same Runtime attempt continue
- **THEN** the Launcher does not remain visible with an empty plugin content region

#### Scenario: Restore the launcher after Cmd+W

- **WHEN** the macOS main window has been hidden by `Cmd+W`
- **AND** the user presses the default global shortcut
- **THEN** the system shows and focuses the main window through the unified action boundary
- **THEN** the existing typed activation event restores focus according to the Host-owned page/input policy

#### Scenario: Restore a plugin page after Cmd+W

- **WHEN** `Cmd+W` semantically hid a Launcher with an equivalent current plugin attempt
- **AND** the user restores Launcher with the default global shortcut
- **THEN** the complete native Window is shown before the same Child WebView is shown and focused
- **THEN** the plugin document, Session, model and Worker are reused without a fresh loading cycle

#### Scenario: Default recovery shortcut is unavailable on macOS

- **WHEN** the global-shortcut plugin is unavailable or registration of the default global shortcut fails
- **AND** the user presses `Cmd+W`
- **THEN** the new application-local `Cmd+W` entry point does not hide the main window
- **THEN** the system does not produce a hidden window that cannot be restored through a configured path

#### Scenario: Cmd+W hide fails before Child presentation changes

- **WHEN** the application-local macOS `Cmd+W` entry point cannot resolve the complete native main Window
- **THEN** the system preserves both the Host and current Child WebView at their last successfully established visibility state
- **THEN** the failure identifies the requested action and `resolve_window` stage for developer diagnosis
- **THEN** no empty plugin content region is introduced

#### Scenario: Cmd+W native hide fails after Child WebView hides

- **WHEN** the application-local macOS `Cmd+W` entry point resolves the native main Window and hides the current Child WebView
- **AND** hiding the native parent fails
- **THEN** the system restores the equivalent current Child WebView or terminates it fail-closed if rollback cannot be proven current
- **THEN** the failure information identifies the requested action and failed native operation stage
- **THEN** the system does not expose native error details to the user or terminate the application process

#### Scenario: The launcher main window loses focus

- **WHEN** the default global shortcut has been registered successfully
- **AND** the visible main window loses focus
- **THEN** the system hides the complete native main Window and current Child WebView through the unified action boundary
- **THEN** the user can restore the window and same equivalent attempt with the default global shortcut

### Requirement: Launcher lifecycle MUST coordinate Host and Child WebView surfaces atomically

Hide, restore, resize, scale-factor change, focus, blur, shortcut activation, close and application teardown MUST update the native Child WebView through the current revisioned presentation binding. Semantic hide/restore MUST preserve the same attempt; Page close or application teardown MUST destroy it. Host-owned overlay or unavailable slot MUST hide the Child WebView before trusted DOM interaction is exposed.

The complete native Window and current Child WebView MUST NOT settle in contradictory presentation states after an operation reports failure. All rollback or teardown work MUST remain compare-current so an old attempt cannot reveal, focus, resize or destroy a replacement.

#### Scenario: Launcher hides and restores

- **WHEN** the current plugin facts remain equivalent across temporary Launcher hide and restore
- **THEN** the same Child WebView and Session are hidden then shown without reload
- **THEN** launcher input focus and plugin focus follow the Host-owned activation policy

#### Scenario: Parent lookup fails before semantic hide

- **WHEN** the system cannot resolve the complete native parent before a semantic hide
- **THEN** the current Child WebView is not hidden independently
- **THEN** the action reports a bounded failure while preserving the last complete presentation state

#### Scenario: A stale rollback completes after replacement

- **WHEN** a failed hide starts Child presentation rollback and a newer Runtime attempt becomes current first
- **THEN** the old rollback is inert and cannot show, focus, resize or destroy the replacement
- **THEN** the replacement follows only its own current presentation revision

#### Scenario: Window geometry changes

- **WHEN** resize or scale-factor change produces a new slot revision
- **THEN** Rust applies verified physical bounds to the current WebView without affecting a newer attempt

#### Scenario: Launcher terminates

- **WHEN** the app unmounts or exits
- **THEN** Child WebView teardown joins the existing root lifecycle and leaves no native surface or bridge binding
