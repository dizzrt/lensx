# Spec Delta

## MODIFIED Requirements

### Requirement: Plugin Page navigation must remain framework-neutral and Host-controlled

插件 Page 打开 MUST 使用框架无关的 Host 导航和当前 Registry 可用性，并关联可信 Action invocation 与所属 surface。Launcher/全局 Action 入口 MUST 进入 main，插件 `actions.open` MUST 在调用 Session 所属窗口导航。失败 MUST 安全拒绝，插件不得获得 renderer、setter、路由执行器、窗口选择或 native authority。

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
- **THEN** 通知可信来源所选 surface 的唯一呈现 handler 前，导航 MUST 查询当前可用 Page descriptor；未知、不可用或已移除 Page MUST 以安全的 `page_unavailable` 语义拒绝。
- **THEN** plugins, Manifests, Action descriptors, and projection payloads MUST NOT obtain React setters, navigation handlers, route executors, Registry mutation APIs, Tauri APIs, or Page renderers.

#### Scenario: Deliver a new invocation to the same Page
- **WHEN** 同一 surface 的当前 Action 或另一个 Action 以新 invocation 打开相同 owner/page，且 Runtime facts 保持等价
- **THEN** Host 保留该 surface 的既有 Page、Child WebView、输入、选区及业务状态，并更新 opening Action 展示与独立 activation；其他 surface 中相同 owner/page 的实例不参与复用
- **THEN** shortcut provenance delivers the activation to the current plugin when it has supplied a callback, while normal provenance only updates activation facts
- **THEN** invocationId changes do not rebuild the Page or input, and the launcher input does not steal focus

#### Scenario: Terminate old invocations on Page navigation or invalidation
- **WHEN** a Page closes, is replaced, is navigated away from, or becomes unavailable while an invocation awaits initialization or delivery
- **THEN** the invocation belongs only to its original Page attempt, and undelivered work terminates and is cleaned up
- **THEN** late results cannot reopen the old Page, contaminate the new Page provenance, or execute in a replacement Session

#### Scenario: Open a new main instance while the same Page is detached
- **WHEN** A₁ 已分离且 main 为 Home，用户在 Launcher 打开同一 owner/page
- **THEN** main 创建独立 A₂ 及 activation channel，不聚焦或替换 A₁
- **THEN** main 后续相同 Page 激活仅复用 A₂

#### Scenario: Transfer navigation ownership without closing the Page
- **WHEN** 已就绪实例完成分离，main 返回 Home
- **THEN** 原实例与 activation channel 移交目标 surface，main 清除旧呈现关联而不执行该实例的 close
- **THEN** 分离不产生新的 invocation、不重放 Action，迟到的旧 main 导航完成不能操作移交实例

#### Scenario: Navigate from a detached Session
- **WHEN** detached A₁ 调用本插件合法 Page Action
- **THEN** 相同 Page 更新 A₁ 的 opening Action/activation；不同 Page 只在该独立窗口替换实例
- **THEN** main 和其他同插件窗口不被聚焦、替换或导航


#### Scenario: Recovery-required state freezes ownership-sensitive navigation
- **WHEN** 某实例进入 `recovery_required`，而其 source/target surface 收到普通 Page 替换、全局 Action 导航或该实例 `actions.open`
- **THEN** Host MUST 保留原 ActivePage/activation 关联及事务上下文，不替换、复制或重放该实例；受影响导航 MUST 有界失败，插件 `actions.open` 使用现有 `unavailable`
- **THEN** 明确重试恢复成功后才按确认归属解除冻结；明确关闭或插件/应用终止仍可清理原实例，其他无关 surface 的有效导航不受影响

### Requirement: Active Plugin Pages must close when their descriptor becomes unavailable

Page Registry replacement 后，Host MUST 重新验证每个 surface 的活动插件 Page。目标不可用时 MUST 只终止匹配实例：main 返回 Home，独立窗口完成安全关闭；插件级失效覆盖其全部匹配实例。仅 title、Owner presentation、parent 或 route 元数据变化而身份与可用性未变时 MUST 保持原有导航行为，Runtime 的独立 current-fact 校验仍然生效。插件 MUST NOT 取得 invalidation handler。

#### Scenario: An active Page loses availability

- **WHEN** a new Registration revision removes the active Page or makes its
  provider ineligible
- **THEN** Host 只关闭匹配实例：main 返回 Home，独立窗口完成安全关闭；无关 surface 不改变
- **THEN** unregistered plugin code receives no execution opportunity, and
  other providers' active and registered state is unaffected

#### Scenario: Active Page metadata changes without losing availability

- **WHEN** the title, parent, or other descriptor metadata changes for the same
  `{ owner_id, page_id }` while the Page remains available
- **THEN** the active Page identity remains open and uses the latest resolvable
  presentation
- **THEN** the system creates no second Page state or navigation history entry

#### Scenario: Disable a plugin with several active windows
- **WHEN** 当前 Registry 将某插件全部 Page 标记为不可用
- **THEN** Host 关闭 main 与独立窗口中所有匹配实例，不遗漏后台未聚焦的窗口
- **THEN** 其他插件的实例与 main 的无关 Page 保持可用

