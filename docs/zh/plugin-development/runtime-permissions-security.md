# Runtime、权限与安全

## Runtime 生命周期

iframe document 可见不代表 SDK ready。Host 先为 active plugin page 创建一个 isolated iframe，
建立 current authenticated session，再连接公共 SDK transport。SDK 随后取得
`runtime.get_context`；只有 compatible、valid 的完整 context 才会让 attempt 进入 ready。

UI 应显式建模 loading、ready、empty capability、error 和 recovery。page close、navigation、
manual reload、permission change、package replacement、Host reload、disconnect、deadline 或
breaker transition 都可能结束 attempt。cleanup 必须 unsubscribe listener、cancel pending work、
dispose SDK，并保证重复执行安全。

## Context replacement

`runtime.context_changed` 携带完整 context。原子替换旧 snapshot，绝不能按 patch merge。
同时更新 `en-US`/`zh-CN`、light/dark 和完整 capability set。replacement 移除的 capability
立即不可用，即使早先的 call 或 UI render 曾经依赖它。

Empty capabilities 合法。应呈现有意义的 empty/degraded state，不能猜测公共 catalog 可调用。
invalid 或 incompatible context 会以受控 error 结束当前 attempt。

## 权限

权限 facts 按以下链路逐层收窄：

- **requested**：Manifest 请求已知 permission 并解释原因；
- **granted**：Host 为 current registration revision 记录显式用户决定；
- **effective**：request、grant、supported provider 和 current facts 同时成立；
- **capability**：current session 当前暴露对应 method。

Host API `0.1.0` 只有 `clipboard.read` 和 `clipboard.write` 需要显式 permission。安装从空 grant
开始。CLI acceptance、publisher metadata、development source、插件内 click 或 requested reason
均不能授予 authority。撤销与 reload permission delta 会让受影响的 current session 和 pending
call 失效。

## 失败与恢复

将 initialization、invalid/incompatible context、transport failure、timeout、cancellation、
disconnect、permission denial、provider unavailable 和受限 internal failure 映射为用户可理解状态。
不得展示私有 exception 或不可信 payload。只有在有意义且由用户发起时提供 retry。

每次 retry 创建 fresh attempt。释放旧资源前先推进 attempt marker，忽略旧 attempt 的 late completion，
并保证 teardown 幂等。disconnected 或 replaced generation 绝不能被 late callback 恢复为 ready。

## 安全边界

production 与 development source 共享相同 iframe sandbox、严格内容策略、精确 source validation、
single-iframe ownership、authenticated session、semantic SDK、provider check、permission、request
limit、deadline、failure breaker 与 teardown。Development Mode 只改变 source provenance 和刷新体验。

插件代码必须使用公共 package entry 与最新 session context。不得导入 Host 实现、调用 native
command、依赖内部 transport field、放宽内容策略、绕过 SDK，或把 Testkit 当作真实安全边界。
method 级恢复见 [Host API](host-api.md)。

