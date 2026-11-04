# Spec Delta

## MODIFIED Requirements

### Requirement: Host MUST own effective plugin Page presentation

Host MUST 只通过 Registration detail、Page projection、Page resolution、可信 App Shell state 和原生校验边界传递已验证的 Page presentation，并把有效尺寸与 resizable 应用到当前实例实际所属窗口；插件不得选择窗口或提交 native facts。

#### Scenario: The Host applies a Page presentation to its native surface

- **WHEN** a plugin Page opens through the trusted presentation path or plugin code attempts to submit, override, or receive native presentation facts
- **THEN** 新 Page 打开时，Host MUST 在当前显示器 work area 内约束作者声明的 initial logical size，并保留 Contract hard minimum；目标尺寸、约束与 resizable MUST 应用到该实例所属完整 native Window。Launcher 打开目标为 main，独立窗口内合法导航目标为调用者窗口。
- **THEN** The plugin Runtime MUST NOT submit, override, or receive native bounds, Window handles, work-area facts, setter results, or transition errors.

#### Scenario: Valid custom Page opens on a sufficiently large monitor
- **WHEN** a plugin Page declares `800×600` and `resizable: true` and the current work area can contain it
- **THEN** Host 在该实例所属完整 Window 以 `800×600` logical size 打开 Page 并启用 native user resize；主 Launcher 打开时该窗口为 main
- **THEN** the same Page still runs through the ordinary public Child WebView, Session, SDK, and Host API boundaries

#### Scenario: Initial size exceeds current work area
- **WHEN** a valid declared initial size cannot fit inside the current monitor work area
- **THEN** the Host constrains the effective width and height to a fully operable in-work-area shape without changing the Manifest
- **THEN** the Page receives only the resulting ordinary Web viewport and no monitor or clamp diagnostic

#### Scenario: Plugin code requests native resize
- **WHEN** plugin code calls an undeclared Host method, Tauri command, bridge message, or Runtime payload to set size, resizable, position, constraints, maximize, or fullscreen
- **THEN** the normal Host/Runtime boundary rejects or ignores the request with zero native side effect
- **THEN** author-selected presentation remains static metadata rather than executable authority

#### Scenario: Detach a user-resized current Page
- **WHEN** 用户将当前 Page 调整尺寸后分离为独立窗口
- **THEN** Host 转移当前有效 logical size 与 resizable，并按目标显示器 work area 安全约束
- **THEN** 不重新应用 Manifest 初值，不改变同一 Page 的 Runtime、Session 或输入状态


#### Scenario: Fit a detached content size below native window decorations
- **WHEN** 分离目标将有效插件内容尺寸放入目标显示器工作区
- **THEN** Host MUST 把标题栏和系统边框计入外框可用空间。空间充足时保持原内容尺寸，空间不足时按剩余内容空间拟合。最小化、进入或退出原生全屏都保留同一实例。

#### Scenario: Confirm the actual macOS content size before publishing presentation
- **WHEN** 主窗或独立窗口切换到不同尺寸或尺寸约束的插件 Page
- **THEN** Host MUST 在当前 owner 有效且原生操作已经执行后，以相同坐标语义确认实际尺寸和约束才提交展示状态；迟到的旧操作 MUST NOT 修改新 owner 的窗口或覆盖当前 Page 的反馈

### Requirement: User resize MUST be opt-in, current-attempt-only, and non-persistent

只有当前窗口实例的 Page 声明 `resizable: true` 时，Host MUST 允许用户从原生边缘调整该窗口。`resizable: false`、Home、Search 与 Host Page MUST 保持不可调。调整 MUST 只影响该实例所属窗口与当前 attempt，MUST NOT 写入 Manifest、Registration、preferences、plugin/browser storage、package 或其他实例的展示状态。

#### Scenario: User resizes an opted-in Page
- **WHEN** a user drags the native boundary of a current `resizable: true` plugin Page within Host constraints
- **THEN** the native Window and Host-owned content slot converge on the new size without Runtime reload, Session replacement, or new authority
- **THEN** the plugin may observe only normal Web viewport and ResizeObserver changes

#### Scenario: User tries to resize a fixed surface
- **WHEN** Home, Search, a Host Page, or a `resizable: false` plugin Page is current
- **THEN** 用户无法通过拖动窗口边缘改变尺寸
- **THEN** 普通窗口模式下，该表面保留 Host 或 Manifest 确定的固定逻辑尺寸。独立窗口仍可通过系统绿色按钮切换全屏。

#### Scenario: Page is closed and reopened
- **WHEN** the user resizes an opted-in Page, truly closes it, and later opens the same Page again
- **THEN** the new attempt starts from the current Manifest initial size fitted to the current work area
- **THEN** the old user-adjusted size is not restored from any persistent or hidden state

#### Scenario: Resize one of two identical plugin Pages
- **WHEN** 同插件同 Page 的 A₁ 与 A₂ 分别位于两个窗口，用户调整 A₁
- **THEN** 仅 A₁ 的 native size 与 slot 更新，A₂ 以及 main 保持各自尺寸
- **THEN** A₁ 分离后仍可保留其当前尺寸；A₁ 真实关闭后新开从 Manifest 初值开始


### Requirement: Presentation transitions MUST not leak state across surfaces

同一有效实例的 hide/restore 以及 Host 窗口分离 MUST 保留当前 native size 与 resizable。展示状态 MUST 按实例及当前窗口归属隔离，main 返回 Home 不得重置已分离实例。

#### Scenario: The active surface changes or its attempt terminates

- **WHEN** a plugin Page closes, is invalidated, or transitions to another surface
- **THEN** 真实 Page close、所属窗口内 navigation away、retry 或 fatal failure MUST 终止该实例临时尺寸；disable、replacement、upgrade、uninstall、已提交 development reload MUST 终止受影响插件实例状态；应用级 Host reload、App teardown 或进程重启 MUST 清理全部。成功分离及 main 的旧呈现卸载 MUST NOT 终止移交实例的临时状态。
- **THEN** main 转到 Home、Search 或 Host Page 时 MUST 立即应用对应固定尺寸与 `resizable: false`，不等待旧 Child 异步清理，也不修改已分离实例的所属窗口。
- **THEN** 同一 surface 在不同插件 Page 间切换时 MUST 应用目标 Page 声明，MUST NOT 继承上一个实例的用户尺寸或 resizable；成功分离保留同一实例，不属于这种替换。

#### Scenario: Hidden resized Page is restored
- **WHEN** main 中允许调整的 Page 已被用户调整尺寸，随后通过主窗 `Cmd+W`、失焦及 Launcher 入口隐藏/恢复，且 attempt 保持有效
- **THEN** the Host restores the same Page attempt at its current user size with the same resizable state
- **THEN** no Manifest default is replayed and no size is persisted

#### Scenario: Resizable plugin Page closes to Home
- **WHEN** main 中已调整尺寸的插件 Page 真实关闭且 Child WebView destroy 尚未完成
- **THEN** the complete native Window becomes non-resizable and returns to `650×320` without waiting for destroy completion
- **THEN** Home cannot be resized and does not retain the plugin width, height, constraints, or presentation state
- **THEN** 独立窗口的真实关闭 MUST 终止该窗口实例并关闭该窗口，不转换为独立 Home，也不重置 main

#### Scenario: One plugin Page replaces another
- **WHEN** plugin Page A is user-resized and navigation opens plugin Page B with a different initial size or resizable value
- **THEN** the Host applies B's current validated presentation as a complete transition
- **THEN** A's size and resizable state are terminal and cannot affect B or a later replacement

#### Scenario: Native presentation transition fails
- **WHEN** Window resolution, work-area resolution, size, constraints, resizable, or rollback fails during a transition
- **THEN** 普通呈现转换中，Host MUST 保留或恢复最后完整安全呈现并返回稳定有界阶段错误；分离的补偿操作自身无法确认时 MUST 保留同一实例和原始快照进入 `recovery_required`，不把未确认恢复报告为安全稳定呈现
- **THEN** it does not leave a resizable Home, a mixed previous/target plugin state, an exposed Child surface, or native diagnostic details

#### Scenario: Reset main after successful detachment
- **WHEN** 已调整尺寸的 A₁ 成功分离，main 回到 Home
- **THEN** main 立即恢复 `650×320`、不可调整并隐藏，A₁ 的独立窗口保留其有效尺寸
- **THEN** main 的延迟尺寸回滚与 resize 结果不能修改 A₁ 或新实例 A₂

#### Scenario: Recovery-required state retains the original size snapshot without applying ordinary updates
- **WHEN** 原生分离补偿无法确认，实例以 `recovery_required` 保留原始尺寸、slot、responder 和窗口快照
- **THEN** Host MUST 冻结该事务 source/target 的普通尺寸、可见性与焦点更新，仅允许同一 attempt/token 的明确恢复或终止路径；旧更新不能覆盖恢复快照或作用于替代实例
- **THEN** 明确重试恢复 MUST 使用原快照而非 Manifest 初值，并在实际恢复确认后才清理安全目标和解除冻结；再次失败继续保留状态及可见主窗修复入口
