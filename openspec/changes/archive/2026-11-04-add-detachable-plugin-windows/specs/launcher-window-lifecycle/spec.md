## MODIFIED Requirements

### Requirement: Launcher MUST separate native Window and Host WebView identities

系统 MUST 区分原生 `main` Window、受信任 Host WebView 和插件 Child WebView。Launcher 主窗口操作 MUST 继续解析完整 `main` Window；独立窗口操作 MUST 解析该实例当前绑定的完整原生 Window。Host MUST 分别验证窗口、受信任 chrome、插件实例与真实原生来源，不得把全应用前台状态或相同 plugin/Page ID 当作所属窗口身份。

#### Scenario: Resolve the native parent after attaching a Child WebView

- **WHEN** the native `main` Window contains both the Host WebView and the
  current plugin Child WebView
- **THEN** Launcher native size, visibility, show, hide, focus, and window-event
  operations still resolve the same complete native Window
- **THEN** the Child WebView's distinct label does not invalidate the main
  Window lookup

#### Scenario: Emit activation after restoring a plugin page

- **WHEN** the Launcher restores a hidden native Window containing the current
  plugin Child WebView
- **THEN** the typed activation event is sent only to the trusted Host WebView
- **THEN** the plugin Child WebView receives neither the Host activation event
  nor additional Host authority as a consequence of the native Window restore

#### Scenario: Open a native dialog from the Host

- **WHEN** the Host opens a native dialog from an allowed Launcher surface
- **THEN** the dialog uses the complete native `main` Window as its parent
- **THEN** the dialog guard continues to suppress focus-loss hiding throughout
  the dialog lifecycle without changing Child WebView authority

#### Scenario: Route native operations and activation to distinct surfaces
- **WHEN** Host 为 Launcher 主窗口执行尺寸、显示、隐藏、聚焦或原生 dialog parenting，且可能附有 Child WebView
- **THEN** 这些 Launcher 主窗口操作 MUST 始终指向完整原生 `main` Window，并在 Child WebView 附加或移除前后保持可解析；独立窗口的同类操作 MUST 使用该实例自己的完整原生 Window，不得回退到 `main`。
- **THEN** Host activation events MUST target only the trusted Host WebView and MUST NOT be broadcast to plugin Child WebViews as a consequence of native Window operations.

#### Scenario: Route by actual owning window after detachment
- **WHEN** 插件实例已提交迁移到独立窗口，主窗口或该实例随后收到窗口事件或异步结果
- **THEN** Host MUST 仅改变事件所属窗口及其当前实例；旧主窗归属、旧 slot revision 或旧焦点请求不得控制已迁移实例
- **THEN** Host activation 事件 MUST 只定向发送给正确的受信任 Host 文档，不得广播到插件或另一窗口

### Requirement: Rust must execute launcher window actions through one boundary

系统 MUST 在 Rust 提供统一 Launcher 主窗口 action 边界，至少支持 `show`、`hide` 和 `toggle`。全局 Launcher/Action 快捷键和主窗口 lifecycle 入口 MUST 通过该边界操作 `main`；独立窗口的局部关闭、焦点与生命周期 MUST 通过可信所属窗口边界执行，不能被误路由为主窗 Hide。入口 MUST NOT 各自复制原生操作。失败 MUST 提供可诊断的 action 与失败阶段，并保持窗口归属可验证。

#### Scenario: Show a hidden launcher

- **WHEN** the system executes `show` for an invisible main window
- **THEN** the system restores the window if it is minimized and shows it
- **THEN** the system requests focus for the main window

#### Scenario: Hide the launcher

- **WHEN** the system executes `hide` for the main window
- **THEN** the system hides the main window
- **THEN** the lensX application process continues running

#### Scenario: Toggle a visible window

- **WHEN** the system executes `toggle` while the main window is visible
- **THEN** the system hides the main window through the unified action boundary

#### Scenario: Toggle an invisible window

- **WHEN** the system executes `toggle` while the main window is invisible
- **THEN** the system shows and focuses the main window through the unified
  action boundary

#### Scenario: A native window operation fails

- **WHEN** window lookup, visibility inspection, restoration, showing, hiding,
  or focus fails during a launcher action
- **THEN** the system returns a diagnosable error
- **THEN** the error identifies the launcher action and failed native operation
  stage

### Requirement: A recoverable launcher must hide on close and focus loss

已选择 Launcher 入口确认有效时，系统 MUST 阻止主窗口关闭请求终止应用，并通过统一边界 Hide。恢复无法确认、快捷键补偿降级或存在需保留 main 修复入口的 `recovery_required` 时，系统 MUST 保持可见修复和退出入口，停用主窗 close-to-hide、blur Hide、Toggle Hide 和局部 `Cmd+W` Hide。该恢复保护 MUST 仅约束主窗口；独立窗口 MUST 失焦保持可见，关闭请求和其焦点下的 `Cmd+W` MUST 仅终止对应实例。

#### Scenario: Close a ready launcher window

- **WHEN** the selected Launcher trigger is confirmed active
- **AND** the user requests that the main window close
- **THEN** the system prevents the default close behavior
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the application process continues running

#### Scenario: Press Cmd+W in a ready macOS launcher

- **WHEN** the selected Launcher trigger is confirmed active
- **AND** macOS `main` Window 可见且为实际 key Window，lensX 为前台应用
- **AND** the user presses `Cmd+W`
- **THEN** exactly one application-local menu shortcut entry point handles the
  key press
- **THEN** the system hides the main window through the unified action boundary
- **THEN** the main window is not destroyed and the application process
  continues running

#### Scenario: Press Cmd+W while a plugin Child WebView is visible

- **WHEN** 前台 macOS Launcher 的实际 key Window 是 `main`，其中包含可见的 current plugin Child WebView
- **AND** the user presses `Cmd+W`
- **THEN** the unified action resolves and hides the complete native Window and
  current Child WebView as one semantic transition
- **THEN** the Host page chrome and plugin content are both absent from the
  screen while the process and same Runtime attempt continue
- **THEN** the Launcher does not remain visible with an empty plugin content
  region

#### Scenario: Restore the launcher after Cmd+W

- **WHEN** the macOS main window has been hidden by `Cmd+W`
- **AND** the user triggers the currently valid ordinary Launcher entry
- **THEN** the system shows and focuses the main window through the unified
  action boundary
- **THEN** the existing typed activation event restores focus according to the
  Host-owned page/input policy

#### Scenario: Restore a plugin page after Cmd+W

- **WHEN** `Cmd+W` semantically hid a Launcher with an equivalent current
  plugin attempt
- **AND** the user restores the Launcher through the currently valid ordinary entry
- **THEN** the complete native Window is shown before the same Child WebView is
  shown and focused
- **THEN** the plugin document, Session, model, and Worker are reused without a
  fresh loading cycle

#### Scenario: Default recovery shortcut is unavailable on macOS

- **WHEN** the selected Launcher entry is unavailable because registration or monitoring fails
- **AND** 用户在实际 key Window 为 `main` 时按下 `Cmd+W`
- **THEN** the new application-local `Cmd+W` entry point does not hide the main
  window
- **THEN** the system does not produce a hidden window that cannot be restored
  through a configured path

#### Scenario: Cmd+W hide fails before Child presentation changes

- **WHEN** the application-local macOS `Cmd+W` entry point cannot resolve the
  complete native main Window
- **THEN** the system preserves both the Host and current Child WebView at their
  last successfully established visibility state
- **THEN** the failure identifies the requested action and `resolve_window`
  stage for developer diagnosis
- **THEN** no empty plugin content region is introduced

#### Scenario: Cmd+W native hide fails after Child WebView hides

- **WHEN** the application-local macOS `Cmd+W` entry point resolves the native
  main Window and hides the current Child WebView
- **AND** hiding the native parent fails
- **THEN** the system restores the equivalent current Child WebView or
  terminates it fail-closed if rollback cannot be proven current
- **THEN** the failure information identifies the requested action and failed
  native operation stage
- **THEN** the system does not expose native error details to the user or
  terminate the application process

#### Scenario: The launcher main window loses focus

- **WHEN** the selected Launcher trigger is confirmed active
- **AND** the visible main window loses focus
- **THEN** the system hides the complete native main Window and current Child
  WebView through the unified action boundary
- **THEN** the user can restore the complete window and the same equivalent Runtime attempt through the currently valid ordinary Launcher entry

#### Scenario: Route ready close and blur events to recoverable hide
- **WHEN** the selected Launcher entry is active and the main Window receives a close or focus-loss event
- **THEN** On macOS, the system MUST provide exactly one application-local `Cmd+W` window-close shortcut entry point.
- **THEN** When the undecorated main window cannot produce a close event through the native close command, that entry point MUST still route to `hide` through the unified action boundary.
- **THEN** The system MUST NOT register `Cmd+W` as a system-wide global shortcut.
- **THEN** The system MUST route main-window focus loss to `hide`.
- **THEN** Window events emitted after a system-initiated hide MUST NOT cause an action loop or terminate the application.

#### Scenario: Handle unavailable local close routing
- **WHEN** the Host installs or executes the application-local macOS close shortcut
- **THEN** the application-local macOS `Cmd+W` hide entry MUST be enabled only while the current selected Launcher trigger is confirmed active.
- **THEN** If menu-event installation or routing fails, or if the hide operation fails, the system MUST make failure information available for developer diagnosis, MUST NOT expose native error details to the user, and MUST NOT terminate the application process because of the failure.

#### Scenario: Coordinate Child and native parent hide or restore
- **WHEN** Host 隐藏或恢复包含 current Child WebView 的 Launcher 主窗口
- **THEN** When a current Child WebView exists, the hide boundary MUST resolve the complete native main Window before changing Child presentation.
- **THEN** It MUST hide the Child WebView before the native parent to prevent overlay leakage, and MUST either hide both surfaces or restore the still-current Child presentation when native parent hide fails.
- **THEN** A failed hide MUST NOT leave the Host window visible with only the plugin content blank.
- **THEN** Restore MUST show and focus the native parent before restoring and focusing the same current Child WebView.

#### Scenario: Retain double-tap configuration while input monitoring is unavailable
- **WHEN** the selected Launcher is a double tap but input monitoring is unauthorized, invalid, or temporarily unavailable
- **THEN** that configuration alone does not establish safe recoverable hiding
- **THEN** the Host shows an already-hidden window and retains visible repair and exit paths; close/blur/local Cmd+W cannot hide it until the selected entry is active again
- **THEN** no former or default chord is silently registered as a fallback, and monitoring recovery starts with cleared gesture candidates

#### Scenario: A detached window loses focus or closes
- **WHEN** 独立插件窗口失去焦点，或用户请求关闭该窗口
- **THEN** 失焦 MUST 保留窗口、实例、输入和运行任务，不调用 Launcher Hide，不抢回焦点
- **THEN** 关闭 MUST 终止且只终止该窗口对应实例及其 Session/请求/Worker；主窗和兄弟窗口 MUST 保持其已有生命周期
- **THEN** 即使 Launcher 恢复快捷键不可用，独立窗口关闭也 MUST 不转为隐藏、不误关闭主窗口或退出整个进程

#### Scenario: Detachment commit interleaves with main-window focus loss
- **WHEN** 分离迁移提交、独立窗口获焦和主窗口 blur/Hide 事件发生交错
- **THEN** 主窗口 Hide MUST 仅作用于其仍拥有的内容，不得隐藏、销毁或重新聚焦已提交迁移的实例
- **THEN** 未提交迁移 MUST 仍由事务协调主窗可见性与失败回滚，不得由 blur 留下空壳、双重可见或无人拥有的实例

### Requirement: Launcher lifecycle MUST coordinate Host and Child WebView surfaces atomically

Hide、restore、resize、scale、focus、blur、shortcut、close 和 teardown MUST 通过实例当前所属窗口及 revisioned presentation binding 更新对应 Child WebView。主窗语义 Hide/restore MUST 保留原 attempt；独立窗口关闭 MUST 仅终止其实例；全应用退出 MUST 撤销并终止全部实例。迁移 MUST 保留同一实例和 Session，并使旧窗口的迟到操作失效。

#### Scenario: Launcher hides and restores
- **WHEN** the current plugin facts remain equivalent across temporary Launcher hide and restore
- **THEN** the same Child WebView and Session are hidden then shown without reload
- **THEN** launcher input focus and plugin focus follow the Host-owned activation policy
- **THEN** 已确认可见后暂时无法获得焦点 MUST 保留同一实例。仅当前 owner 和可见性 revision 可在 key-window 通知后重试，已过期的 slot 或焦点回复 MUST NOT 终止后续实例。

#### Scenario: Parent lookup fails before semantic hide

- **WHEN** the system cannot resolve the complete native parent before a
  semantic hide
- **THEN** the current Child WebView is not hidden independently
- **THEN** the action reports a bounded failure while preserving the last
  complete presentation state

#### Scenario: A stale rollback completes after replacement

- **WHEN** a failed hide starts Child presentation rollback and a newer Runtime
  attempt becomes current first
- **THEN** the old rollback is inert and cannot show, focus, resize, or destroy
  the replacement
- **THEN** the replacement follows only its own current presentation revision

#### Scenario: Window geometry changes
- **WHEN** resize or scale-factor change produces a new slot revision
- **THEN** Rust applies verified physical bounds to the current WebView without affecting a newer attempt

#### Scenario: Launcher terminates
- **WHEN** 应用整体 teardown 或进程退出
- **THEN** 全部主窗和独立窗口实例 MUST 加入应用级清理，不留下原生 surface、Session、未完成请求或 bridge binding

#### Scenario: Apply lifecycle changes to the current presentation binding
- **WHEN** 一个窗口的 lifecycle 事件更新其 current Child WebView
- **THEN** 主窗语义 Hide/restore MUST 保留同一 attempt；真实 Page close MUST 仅销毁该实例；应用 teardown MUST 销毁全部实例，成功分离 MUST 不被当作 Page close 或重开。
- **THEN** Host-owned overlay or unavailable slot MUST hide the Child WebView before trusted DOM interaction is exposed.

#### Scenario: Keep failed surface transitions compare-current
- **WHEN** an operation fails or completes rollback after the Child attempt may have changed
- **THEN** 普通窗口操作报告失败后，完整 native Window 与当前 Child WebView MUST 保留或恢复一致的安全呈现；分离补偿自身无法确认时 MUST 明确进入 `recovery_required`，保留原对象和最后确认事实、冻结普通呈现写入并保持可信修复入口，不能把不确定归属报告为正常稳定状态。
- **THEN** All rollback or teardown work MUST remain compare-current so an old attempt cannot reveal, focus, resize, or destroy a replacement.

#### Scenario: One window's Host becomes invalid
- **WHEN** 一个独立窗口的受信任 Host surface 卸载或失效，而应用仍运行
- **THEN** 系统 MUST 仅按该窗口的终止策略撤销其实例和 authority，不将单个 Host 的卸载误判为全应用退出
- **THEN** 另一窗口的当前实例、revision、pending call 和焦点 MUST 不受该实例清理影响

### Requirement: Accessory Launcher MUST retain application-local close and quit shortcuts

macOS accessory policy 移除普通应用菜单栏时，系统 MUST 继续提供各一个 lensX 应用内 `Cmd+W` 和 `Cmd+Q` 入口。`Cmd+W` MUST 依据实际 key Window 路由为主窗可恢复 Hide 或独立窗口真实 Close；`Cmd+Q` MUST 清理全部实例并退出应用。两者 MUST 只处理前台 lensX 的合法原生事件，不得全局注册、误用缓存焦点或影响其他应用。

#### Scenario: Press Cmd+W without a visible application menu bar

- **WHEN** accessory lensX 的 `main` Window 可见且为实际 key Window，没有普通应用菜单栏
- **AND** the user presses `Cmd+W`
- **THEN** exactly one application-local entry point hides the complete Launcher
  through the unified Hide action
- **THEN** the process and currently confirmed effective selected Launcher trigger continue running

#### Scenario: Press Cmd+Q without a visible application menu bar

- **WHEN** accessory lensX 的主窗口或任一独立插件窗口可见且为实际 key Window，没有普通应用菜单栏
- **AND** the user presses `Cmd+Q`
- **THEN** exactly one application-local entry point requests lensX exit
- **THEN** 应用 teardown MUST 在进程结束前终止全部主窗与独立窗口实例及 Host 资源，并取消全部 Session、进行中的请求、订阅和 Worker

#### Scenario: Another application owns the foreground

- **WHEN** another application is the macOS foreground application
- **AND** the user presses `Cmd+W` or `Cmd+Q` in that application
- **THEN** lensX does not hide, exit, or consume the corresponding key event
- **THEN** the foreground application retains its own local shortcut behavior

#### Scenario: Recovery shortcut registration fails

- **WHEN** the selected Launcher entry is unavailable or effective recovery can no longer be confirmed
- **THEN** 系统 MUST 不启用会令 Launcher 无法恢复的主窗口 `Cmd+W` Hide 或 focus-loss Hide；独立窗口的真实 Close 和全应用 Quit MUST 仍可使用
- **THEN** the visible Window retains an exit path and the system does not leave
  a hidden process without a Dock tile or recovery entry point

#### Scenario: Dispatch local close and quit only for foreground lensX
- **WHEN** the user invokes Cmd+W or Cmd+Q while the accessory application has no ordinary visible menu bar
- **THEN** `Cmd+W` MUST 重新验证实际 key Window 和实例归属；主窗遵守可恢复 Hide，独立窗口仅关闭其对应实例，未知或无有效窗口目标不得被误路由为主窗 Hide。
- **THEN** `Cmd+Q` MUST 执行全应用 teardown，清理全部窗口实例后终止 lensX 进程。
- **THEN** Both entry points MUST handle keys only while lensX is the foreground application, MUST NOT be registered as system-wide global shortcuts, and MUST NOT intercept the corresponding commands for another foreground application.

#### Scenario: Cmd+W in a detached plugin window
- **WHEN** lensX 为前台应用，实际 key Window 为某个独立插件窗口，用户在其 Host chrome 或 Child 输入中按下 `Cmd+W`
- **THEN** 系统 MUST 只接纳一次该实例的真实关闭并销毁其窗口及 Runtime，不隐藏主窗，不终止其他实例或应用
- **THEN** 当前实例的 `ui.close` 和原生窗口关闭按钮 MUST 收敛到同一实例终止语义

#### Scenario: Native focus changes and duplicate local command delivery
- **WHEN** `Cmd+W/Q` 的原生投递、菜单路径、按键重复或排队处理与窗口切换交错
- **THEN** 每个已接纳原始手势 MUST 至多执行一次相应 Close/Hide/Quit，不因双入口或 key repeat 产生第二次操作
- **THEN** 命令 MUST 绑定接纳时可信的实际事件窗口和 key Window；目标失效后不得关闭新获焦窗口或隐藏主窗作为 fallback
- **THEN** lensX 不是前台应用时 MUST 保留原始事件，不执行任何本地 Close/Hide/Quit

### Requirement: Launcher presentation transitions MUST preserve the valid text input responder

窗口尺寸、约束和 resizable 配置 MUST 保留该窗口当前有效文本输入目标。主窗口继续遵守原有 Launcher 展示和焦点规则；分离迁移 MUST 将焦点连续性与实例真实所属窗口绑定，取消旧归属的延迟恢复，不得把已迁移实例的输入抢回主窗或另一个窗口。

#### Scenario: Enter the first ordinary search character

- **WHEN** the home input is focused, a user enters the first ordinary
  character, and the system switches to fixed search presentation
- **THEN** the Window changes to `650×480` under the existing contract and
  remains non-resizable
- **THEN** the original input target continues to accept text without being
  replaced by the original window view during configuration
- **THEN** subsequent Chinese composition can continue using that target

#### Scenario: Commit Chinese text from home

- **WHEN** a user commits a Chinese query from home and the system first enters
  search presentation
- **THEN** the necessary fixed-size change preserves the original valid input
  target
- **THEN** configuration itself neither triggers focus-loss hiding nor prevents
  subsequent input

#### Scenario: Apply an unchanged presentation or fixed resizable state

- **WHEN** the current presentation target arrives repeatedly, or transitions
  between home, search, and Host Page remain non-resizable
- **THEN** the system applies only window configuration that actually needs to
  change
- **THEN** it does not reassign focus through redundant unchanged resizable
  style changes

#### Scenario: Change the actual resizable state of a plugin Page

- **WHEN** 有效插件 Page 需要启用或禁用原生用户调整尺寸
- **THEN** 承载该实例的完整原生 Window MUST 应用所需状态及现有约束；主窗实例作用于 `main`，独立实例作用于自己的窗口
- **THEN** the valid text input target still belonging to the current Window is
  preserved
- **THEN** the current Child WebView input target is not unconditionally moved
  to the Host or original window view

#### Scenario: No valid responder is available

- **WHEN** no valid text responder exists during a window configuration change,
  or the previous target has left that Window
- **THEN** the system neither activates a hidden Window nor restores focus to
  an invalidated page
- **THEN** subsequent explicit show, page close, and Host activation remain
  governed by the existing focus policy

#### Scenario: Refresh work area constraints

- **WHEN** window movement or scale changes cause the Host to refresh effective
  constraints for the current presentation
- **THEN** the Host continues to use validated window configuration and work
  area boundaries
- **THEN** unchanged style settings do not repeatedly disturb the current valid
  input target

#### Scenario: A presentation change fails and rolls back

- **WHEN** native window-state reads or size, constraint, resizable-state, or
  rollback operations fail
- **THEN** the system provides a safe typed failure and preserves or restores
  the last complete safe presentation
- **THEN** rollback restores from the current actual window state without
  incorrectly skipping a partially applied resizable change
- **THEN** rollback neither replaces a valid input target with the original
  window view nor focuses an invalidated page

#### Scenario: A plugin Child WebView remains attached during return to home

- **WHEN** a plugin Page closes and returns to home while asynchronous
  destruction of the old Child WebView is still pending
- **THEN** the complete Window returns to fixed home dimensions and
  non-resizable state under the existing contract
- **THEN** configuration or rollback does not refocus or redisplay the old Child
- **THEN** the current Host page-close policy restores home input focus

#### Scenario: The native system rejects responder restoration

- **WHEN** the native system refuses restoration of the previous still-valid
  input responder after a necessary style change
- **THEN** the system neither unconditionally switches to the original window
  view, activates the Window, nor restores a removed page
- **THEN** developers receive bounded diagnostics without the ordinary
  interface exposing native objects or internal errors
- **THEN** the system does not represent successful message submission as
  successful native responder restoration

#### Scenario: The main window genuinely loses focus

- **WHEN** the main window truly loses focus and the current selected Launcher trigger is confirmed active
- **THEN** the system continues to hide the complete main Window and current
  Child WebView through the existing unified boundary
- **THEN** configuration focus preservation neither disables focus-loss hiding
  nor polls to reclaim foreground focus

#### Scenario: Avoid redundant configuration during text entry
- **WHEN** a fixed-size presentation transition applies unchanged native window configuration
- **THEN** Fixed-size transitions between home and search MUST NOT change the keyboard responder or interrupt continued input after committed text by reapplying unchanged window configuration.
- **THEN** When actual window configuration has not changed, the system MUST avoid redundant style changes that could disturb focus.

#### Scenario: Preserve only a valid responder during native style changes
- **WHEN** a necessary macOS window style change is applied
- **THEN** Necessary macOS window style changes MUST preserve the currently valid responder belonging to the complete Window within a controlled native boundary and MUST NOT unconditionally replace a WebView text responder with the original window view.
- **THEN** When no valid responder exists, configuration MUST NOT activate a Window, restore an invalidated responder, or force focus onto Host or plugin content.

#### Scenario: Handle failed configuration and late responder restoration
- **WHEN** an ordinary transition, environment refresh, or rollback encounters a native failure or delayed restoration
- **THEN** This constraint MUST apply to ordinary presentation transitions, environment constraint refreshes, and failure rollback.
- **THEN** 既有普通窗口状态读取、消息提交、尺寸、约束或 rollback 失败 MUST 保留或恢复最后完整安全呈现并遵循 typed safe native error 边界；分离补偿本身无法确认的分支 MUST 保留原快照及实例进入 `recovery_required`，不伪称原 responder 或呈现已恢复。
- **THEN** When the native system refuses responder restoration, the system MUST retain a safe state and provide bounded developer diagnostics.
- **THEN** It MUST NOT unconditionally fall back to the original window view, activate the Window, or restore an invalidated page.
- **THEN** Successful message submission MUST NOT be interpreted as confirmed native responder restoration.
- **THEN** Late restoration MUST NOT focus a removed page or replace the current valid input target.

#### Scenario: Keep responder repair within existing Window boundaries
- **WHEN** the Host applies presentation configuration while a plugin Page or Child WebView may be current
- **THEN** The identity boundaries between the native Window, Host WebView, and Child WebView MUST remain distinct.
- **THEN** Actual resizable-state changes for valid plugin Pages MUST continue to take effect.
- **THEN** 展示配置 MUST NOT 广播 Host activation 事件、向插件授予原生 authority 或绕过 compare-current 生命周期；分离后的 compare-current MUST 同时核验实例和所属窗口。
- **THEN** Genuine main-window focus loss MUST continue to follow the existing recoverable-hide contract.

#### Scenario: A detached instance and delayed focus restoration from its old window
- **WHEN** 同一插件实例已迁移到独立窗口，而旧主窗配置、编辑或异步恢复结果随后完成
- **THEN** 旧结果 MUST 不聚焦、隐藏、调整或销毁该实例，不把新的有效输入替换成旧主窗 responder
- **THEN** 成功迁移 MUST 聚焦新窗口中该实例仍有效的输入；原有选择、文本、编辑历史与进行中的组合输入 MUST 不因重建文档或模拟按键而丢失
- **THEN** 无法证明 responder 仍有效时 MUST 保留安全窗口状态并报告有界诊断，不伪造焦点恢复成功或重放输入

### Requirement: Accessory Launcher MUST deliver standard editing commands through the current native focus

macOS 前台 lensX MUST 使用 Host 与 Child 共享的原生编辑分派边界，使实际 key Window 中当前有效文本焦点按控件及原生命令语义处理 Select All、Copy、Cut、Paste、Undo 和 Redo。该行为 MUST 覆盖主窗口和独立插件窗口，且不得向另一窗口、旧归属或失效实例重新投递编辑事件。

#### Scenario: Edit text in the Host without a visible application menu bar

- **WHEN** lensX is foreground, Host search or another ordinary input owns valid native focus, and the user invokes a standard editing shortcut
- **THEN** Select All, Copy, Cut, Paste, Undo, and Redo affect the current selection, text, and undo history according to that input's existing semantics
- **THEN** each gesture performs at most one edit, focus is preserved, and the application still has no Dock tile or ordinary visible menu bar

#### Scenario: The same command follows the focused Child input

- **WHEN** the current visible plugin's `input`, `textarea`, `contenteditable`, Monaco body, or Find input obtains native focus and receives a standard editing shortcut
- **THEN** the command affects only the current text target; editing a Find query does not select or change the Monaco body, and Child editing does not affect Host search
- **THEN** official, external, and Development Mode plugins share the same dispatch semantics without plugin-specific Host mappings or SDK changes

#### Scenario: Copy and paste exchange text with another application

- **WHEN** the user copies a copyable selection from the current valid text target and pastes it in another application, or copies text from another application and returns to a valid editable lensX target to paste
- **THEN** native text-clipboard semantics deliver the user-selected text, inserting it once per paste
- **THEN** a plugin-internal cache round trip does not replace this behavior, and the plugin gains no background clipboard-reading capability

#### Scenario: Web content already handled or cancelled the event

- **WHEN** the current Web document has handled the keyboard event or cancelled its default behavior under its editing rules
- **THEN** the Host respects that result without additionally invoking the corresponding editing command, duplicating copy/paste, or changing undo history again
- **THEN** the Page's existing business shortcuts, input, and composition semantics remain valid

#### Scenario: An unhandled event continues through native editing semantics

- **WHEN** the current target is confirmed not to have handled the event and the native menu and current responder chain provide an applicable standard editing command
- **THEN** that command executes at most once and retains its actual handling result, without the repair layer additionally synthesizing or resending the same keyboard event
- **THEN** when no handler is available or the command cannot handle the event, native propagation continues without marking it as a successful edit

#### Scenario: Pending native handling completes without duplicate editing

- **WHEN** the native WebView takes over an event while Web handling remains pending and later provides a result through legal completion or unhandled-event reentry
- **THEN** the synchronous takeover result does not trigger early menu execution, and legal reentry is not treated as a new user gesture
- **THEN** final handling or default cancellation does not edit again; only finally confirmed non-handling continues through the native menu and responder chain
- **THEN** any repair-owned delayed compensation is bound to the original Window/target/Child generation and cancelled after a focus or generation change, without editing an old target, restoring old focus, or redirecting the old operation to a new target

#### Scenario: Read-only disabled or empty editing state retains native semantics

- **WHEN** the target is read-only or disabled, the selection or clipboard is empty, or no undo/redo content exists
- **THEN** the current control and native command determine available operations and results; dispatch does not forcibly change text or clear the clipboard
- **THEN** normal editing can continue after the user restores a valid selection, editable content, or available undo history

#### Scenario: Focus changes or the previous target becomes invalid

- **WHEN** focus moves from Host to Child or body to query, or the previous target is hidden, removed, replaced, or leaves the current Window
- **THEN** subsequent commands use only the still-valid current native target, without retaining the old target or forcibly returning focus
- **THEN** no valid target means no edit, hidden-window reveal, or invalidated-Page restoration

#### Scenario: Reserved and background application commands retain their ownership

- **WHEN** the user presses `Cmd+W/Q` while lensX is foreground, or uses editing, close, and quit shortcuts in another foreground application
- **THEN** 前者 MUST 按实际窗口保留单次主窗 Hide/独立窗口 Close 与全应用 Quit 及对应清理；lensX MUST 不消费另一前台应用的编辑、关闭或退出事件
- **THEN** the currently valid ordinary Launcher entry, selected Launcher trigger, and other non-editing window behavior preserve their respective contracts; ordinary editing combinations cancel modifier double-tap candidates without consuming the original event

#### Scenario: Standard command coverage does not become a per-key or per-plugin patch

- **WHEN** acceptance uses `Cmd+A/C/X/V/Z` and `Cmd+Shift+Z` samples across different native text targets
- **THEN** commands follow unified native editing semantics without production key-code allowlists, plugin identity, page-index, or DOM branches that redispatch them
- **THEN** compliant external plugins obtain this behavior through ordinary controls and the public Runtime, without new permissions, Host APIs, or script injection

#### Scenario: Deliver editing to supported native text controls
- **WHEN** the user invokes a standard editing command in the current foreground Host or plugin text control
- **THEN** This behavior MUST cover Host search and other ordinary inputs, external-plugin `input`/`textarea`/`contenteditable` controls, and the Monaco body and Find input.
- **THEN** User-initiated copy and paste MUST exchange text with other applications rather than only round-tripping through a plugin's private memory.
- **THEN** Plugin business commands remain defined by their owning Page.

#### Scenario: Complete handled and unhandled editing exactly once
- **WHEN** the original editing event enters dispatch, is processed by the Web document, and completes as handled or unhandled
- **THEN** Dispatch MUST preserve the original event, modifiers, current native focus, and single-execution semantics.
- **THEN** When the Web document has handled the event or cancelled its default behavior under its input rules, the Host MUST NOT execute the corresponding standard editing command again.
- **THEN** When handling is finally confirmed as unhandled, dispatch MUST continue native-menu and current-responder-chain semantics, execute an available command at most once, and continue propagating events that remain unhandled.
- **THEN** The repair layer MUST NOT additionally synthesize or resend the same keyboard event, recursively invoke the editing chain, or unconditionally perform another DOM edit.
- **THEN** WebKit's legal completion and unhandled-event reentry MUST be preserved and MUST NOT be treated as a new user gesture.

#### Scenario: Preserve asynchronous editing completion ownership
- **WHEN** native editing dispatch is awaiting WebKit completion or a delayed compensation path
- **THEN** While asynchronous handling is incomplete, the Host MUST preserve the native completion and reentry protocol.
- **THEN** It MUST NOT interpret the synchronous native takeover result as final handling or confirmed non-handling, and MUST NOT unconditionally execute a menu command immediately after invoking the superclass.
- **THEN** If the repair introduces delayed compensation, that compensation MUST be associated with the original gesture's initial Window, text target, and applicable Child generation, and MUST revalidate those identities and native focus before executing.
- **THEN** A focus change, invalid target, or generation change during the wait MUST cancel that event's compensation rather than read a new first responder and redirect the old event to a new target.
- **THEN** WebKit's own legal reentry MUST retain its existing mechanism.

#### Scenario: Reject stale or ineligible editing targets
- **WHEN** dispatch considers any candidate editing target, including a current, hidden, unfocused, removed, replaced, unverifiable, ineligible, or restored target
- **THEN** At dispatch time, the target MUST still belong to the current valid Window/WebView.
- **THEN** A hidden, unfocused, removed, replaced, or unverifiable target MUST NOT consume the event, steal focus, reveal itself, or affect another input target.
- **THEN** Read-only, disabled, empty-selection, empty-clipboard, and empty-undo states MUST retain the corresponding control and native-command semantics.
- **THEN** The dispatch layer MUST NOT forcibly change content, clear the clipboard, or fabricate successful editing.
- **THEN** Normal editing MUST resume when valid focus and input conditions are restored.

#### Scenario: Keep editing repair independent of plugin implementation
- **WHEN** the Host supplies standard editing support to an existing compliant plugin
- **THEN** `Cmd+A/C/X/V/Z` and `Cmd+Shift+Z` MUST be standard-editing acceptance samples rather than a production key-code allowlist.
- **THEN** The Host MUST NOT select patches by plugin identity, Publisher, page index, DOM structure/selector, or editor type, and MUST NOT require existing compliant plugins to modify lensX source, update the SDK, or add platform adapters.
- **THEN** The repair MUST NOT inject scripts, call `eval`, generate synthetic keyboard events, or add a programmatic Host clipboard API, plugin permission, generic Tauri capability, native handle, or global editing shortcut.

#### Scenario: Preserve accessory activation and local lifecycle shortcuts
- **WHEN** editing dispatch runs while lensX or another application owns foreground focus
- **THEN** the system MUST preserve Accessory policy, the absence of a Dock icon and ordinary application menu bar, current valid ordinary activation and recovery entries, and existing window lifecycle behavior.
- **THEN** `Cmd+W/Q` MUST 仅在前台 lensX 中执行一次按窗口路由的主窗可恢复 Hide/独立窗口 Close，以及清理所有实例的 Quit。
- **THEN** When another application is foreground, lensX MUST NOT intercept that application's editing, close, or quit commands.
- **THEN** Repairing the standard editing chain MUST NOT change unrelated non-editing behavior.

#### Scenario: Use standard editing commands during double-tap confirmation
- **WHEN** a standard editing combination occurs during a modifier double-tap candidate or its 300ms confirmation period
- **THEN** the system cancels the candidate and the original event continues to the system or current valid input in the foreground application
- **THEN** it does not activate lensX, execute an extra edit, retain a delayed gesture, or synthesize or replay keyboard events

## ADDED Requirements

### Requirement: Detachment commit MUST release the Launcher and preserve detached-window usability

成功分离 MUST 在新窗口获得该实例和有效焦点后，使 Launcher 返回固定 Home 并隐藏。隐藏主窗 MUST 以现有可恢复边界为前提；无法确认恢复入口时，分离 MUST 不提交会令用户失去主窗访问的状态。前向失败且补偿成功时 MUST 保留或恢复原实例的唯一有效归属及可用主窗；仅补偿无法确认时 MUST 保留原对象及事务进入 `recovery_required`，冻结受影响归属变更并保持 main 修复与退出入口可见。两者均不得通过重新打开插件替代恢复，也不得伪报成功。

#### Scenario: Summon the Launcher after successful detachment
- **WHEN** 主窗口已就绪插件完成无损分离，且 Launcher 恢复入口保持有效
- **THEN** 新窗口 MUST 获得焦点，Launcher MUST 返回 `650×320`、不可调整的 Home 并隐藏，原实例 MUST 继续在新窗口运行
- **THEN** 用户再次调用普通 Launcher 入口 MUST 仅恢复主窗口 Home，不复用、抢占、重开或隐藏独立窗口中的实例
- **THEN** 全局 Action 快捷键 MUST 继续按既有主窗口 Show 和 Action 执行语义工作，不自动查找并复用独立窗口的同插件/Page 实例

#### Scenario: Recovery becomes unavailable before detachment commits
- **WHEN** 分离请求期间 Launcher 恢复入口失效或主窗口安全隐藏无法确认
- **THEN** 事务 MUST 不提交不可恢复的隐藏状态，保留或回滚唯一有效插件归属；补偿无法确认时 MUST 进入 `recovery_required`，保留原实例和恢复上下文并提供有界失败反馈
- **THEN** 主窗口 MUST 保持可见的修复和退出入口，不启用隐藏 fallback 快捷键、不留空白插件区或孤立窗口

#### Scenario: The Launcher remains available after a detached window closes
- **WHEN** 用户关闭最后一个独立插件窗口，而 lensX 进程仍运行
- **THEN** 主窗口状态和全局恢复入口 MUST 保持已有确认状态，不因独立窗口数量归零退出应用或恢复旧插件实例
- **THEN** 关闭窗口中 pending 请求和迟到结果 MUST 不影响下一次主窗口召唤或新建实例

#### Scenario: Recovery-required state keeps the main-window repair entry visible
- **WHEN** 分离补偿无法确认并进入 `recovery_required`，随后发生 main blur、close-to-hide、Toggle、局部 `Cmd+W` 或旧 Hide completion
- **THEN** Host MUST 保持 main 中可信恢复和退出入口可见，不执行会隐藏该入口的操作；旧 owner/revision completion MUST 无副作用
- **THEN** 明确重试恢复仍绑定原 attempt/token，明确关闭只终止该实例，前台 Quit 清理全部实例和恢复上下文；其他有效窗口不被自动隐藏或终止
- **THEN** 清理目标窗口前 MUST 确认它不再承载原 WebView，不能借主窗隐藏或窗口销毁把补偿失败伪装为完成
