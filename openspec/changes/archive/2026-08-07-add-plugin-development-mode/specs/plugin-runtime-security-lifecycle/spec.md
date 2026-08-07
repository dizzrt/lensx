## MODIFIED Requirements

### Requirement: Every Runtime attempt MUST have one idempotent generation-aware terminal cleanup

Host MUST 为每次显式 open、retry 或成功 development reload 分配新的 process-local Runtime attempt，并 MUST 将 manual close、navigation away、retry、provider quiescence、disable、uninstall、replacement、development reload/remove/mode shutdown、relevant current-fact 或 grant change、resolution/load/handshake failure、unexpected Session disconnect、Host reload、App unmount 和 graceful application exit 统一路由到一个 terminal operation。该 operation MUST 拒绝新的 Runtime-owned work，取消可取消的 resolve/currentness/load/handshake work，使不可取消的 stale completion inert，清除 timers、unsubscribe listeners、dispose Session 与 Ports、remove iframe、compare-current release navigation lease，并丢弃 window/descriptor references。cleanup MUST idempotent，每个 late callback MUST 比较 attempt 后才能改变 current state。

#### Scenario: User closes a ready plugin Page

- **WHEN** 用户关闭当前 ready external 或 development Plugin Page
- **THEN** Host 恰好一次终止 attempt，删除其 iframe、Session、Ports、listeners、timers 和 navigation lease，并通过既有 Home/focus behavior 返回
- **THEN** 不保留 hidden Runtime、pending Runtime-owned work、window reference 或 reusable attempt

#### Scenario: Lifecycle events race with a new attempt

- **WHEN** close、retry、invalidation、replacement、development reload/remove 与旧 async completions 发生竞态，而后续 attempt 已成为 current
- **THEN** 旧 cleanup 与 late events 只能影响各自 attempt，不能 release、fail、load、authenticate 或 revive 当前 attempt
- **THEN** repeated cleanup 安全成功，不 double-close 或保留资源

#### Scenario: Application process terminates unexpectedly

- **WHEN** process 在 JavaScript 完成 best-effort cleanup 前退出/崩溃并稍后重启
- **THEN** operating-system teardown 移除 process resources，新进程不恢复 scope、Runtime attempt、breaker record、Session、nonce、Port、iframe、listener、timer 或 pending work
- **THEN** persistent installed Registration 继续以 Runtime `inactive` 恢复，development Registration 不恢复

#### Scenario: Development reload commits a new generation

- **WHEN** 当前 development Plugin Page 的手动 reload 成功提交新 resource generation
- **THEN** Host 先使旧 attempt terminal 并清除其全部 authority，再为仍然 current 的页面创建 fresh attempt、iframe、nonce、MessageChannel 和 Session
- **THEN** development source 不放宽 CSP、sandbox、Permissions Policy、deadline、breaker、single-iframe、Host API 或 permission boundary

#### Scenario: Development reload fails before commit

- **WHEN** 新 development snapshot 在 Manager commit 前 invalid、incompatible、unsafe、unreadable 或丢失 revision race
- **THEN** 当前 Runtime attempt 不因未提交输入而终止或切换 generation
- **THEN** 失败 staging、late callbacks 和 diagnostic 不获得 Resource、Session 或 handler authority
