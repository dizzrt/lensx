## 1. 固化 Host-private storage boundary

- [x] 1.1 定义 versioned、deny-unknown-fields 的 TypeScript/Rust Host-private storage request/result/error contract，覆盖 `get`、`set`、`delete`、`list`、`get_quota` 和可信 `entry_id` / `plugin_id` / `version` identity projection，确保真实路径、plugin key、cursor codec 与 Rust 对象不进入公共 package 或 Runtime wire。
- [x] 1.2 建立共享 valid/invalid fixtures，覆盖全部 operation、严格字段、identity、key/value、result/error、malformed cursor 与安全 bounded diagnostic，并让 TypeScript parser 和 Rust serde/validator 对 validity 与稳定错误结论一致。
- [x] 1.3 在不修改公共 Host API `0.1.0` payload/catalog 的前提下增加 focused contract gate，并用 export/dependency/boundary 测试证明公共 Contract、SDK 和 Testkit 没有新增 Host-private storage 导出或 Tauri 依赖。

## 2. 实现 Rust canonical storage core

- [x] 2.1 新增 App-managed `PluginScopedStorage` 和 `storage-v1.json` version-1 envelope，使用 canonical plugin-key、按需 data subtree、严格有序 entries、单调 namespace revision 和 bounded read，拒绝未知字段、重复/乱序 key、unsupported version、symlink、异常类型与 root escape。
- [x] 2.2 实现 `get`、`set`、`delete`、`get_quota` 的纯 domain 操作和 Rust 二次校验，固定 key 规则、32 层深度、256 KiB 单值、1024 entries、1 MiB logical usage，并准确处理 missing、replacement accounting 与 `invalid_params` / `limit_exceeded` 结论。
- [x] 2.3 实现稳定 Unicode code-point key 排序、默认 100/最大 1000 的 `list` 分页，以及绑定 namespace revision/position 并通过完整性校验的 opaque cursor；区分 malformed `invalid_params` 与 mutation 后 stale `conflict`。
- [x] 2.4 实现 create-new 临时文件、bounded deterministic serialization、flush、file `sync_all`、atomic rename 和 parent sync 的 durable mutation；增加 commit 前故障注入、owned temp cleanup、restart old-or-new recovery 和 commit 后不伪回滚测试。
- [x] 2.5 暴露一个窄、版本化 Tauri storage command 并注册 managed state；在 Rust serialization boundary 内核对 live Manager identity 和可用状态，把 domain conclusion 映射为不含 key、value、path、payload、raw exception 或 stack 的稳定私有边界错误。

## 3. 协调 Installer 生命周期与故障域

- [x] 3.1 从现有 Installer/lifecycle 边界提取或复用一个 Host-private data coordinator，使 storage、installation、replacement、uninstall、cleanup recovery 和 reinstall 共享进程内与跨进程序列化语义，而不建立第二个 data root 或独立 cleanup policy。
- [x] 3.2 验证并实现 upgrade/replacement 保持 store、disable 保留但撤销访问、`retain_data` 卸载后同 identity 重装恢复可见、`delete_data` 持久化 intent 后最终删除，以及 write/delete-data 竞争不重建已卸载 subtree。
- [x] 3.3 实现按 namespace 懒验证与 degraded state：missing 为 empty，安全 owned temp 可清理，oversized/malformed/non-canonical/symlink/异常 evidence 保留并仅令所属 namespace `unavailable`；Host 启动、其他插件、preferences 和非 storage Host API 保持可用。
- [x] 3.4 为 lifecycle/data coordinator 增加 Rust 并发、startup recovery、same-identity reinstall、unrelated-plugin isolation、quarantine/blocked ownership 和 fault-injection 回归测试，确保现有 package/cleanup 语义不回退。

## 4. 接入 TypeScript provider 与生产 Dispatcher

- [x] 4.1 新增 Host-private TypeScript desktop adapter/provider，严格解析 Rust result/error，注入 Session identity，检查 AbortSignal/currentness，并把 domain failure 映射到现有 `invalid_params`、`limit_exceeded`、`conflict`、`cancelled`、`unavailable` 和 `internal_error`。
- [x] 4.2 扩展 Dispatcher 依赖和 closed switch，将五个 `storage.*` 方法路由到 scoped provider；继续拒绝 author-controlled identity/namespace/path，并在异步边界前后保持 cancellation/currentness 与 late-result 丢弃语义。
- [x] 4.3 扩展 Runtime Context capability 计算和 provider availability subscription：真实 provider 可用时稳定排序暴露五个 storage methods，确认 namespace degraded 后发送一次完整 replacement Context 并移除这些 methods，Clipboard 继续不暴露。
- [x] 4.4 在生产 App/`PluginRuntimeFrame` 组合中安装真实 provider，同时保留测试 fake/unavailable injection；验证 Session replacement、disable、uninstall、Host reload 和 dispose 不复活旧 binding 或泄漏 listener/pending work。

## 5. 建立端到端验证门禁

- [x] 5.1 扩展 Dispatcher 单元测试，覆盖五个成功方法、missing discriminant、配额、分页/cursor、稳定错误、capabilities/context_changed、伪造 identity/namespace/path、cancellation、stale Session 和非法 provider result。
- [x] 5.2 增加真实 SDK → MessageChannel → Host adapter → Dispatcher → Tauri storage service 集成测试，覆盖乱序并发、跨重启 persistence、两个插件相同 key 隔离、replacement、retain/delete-data 和单 namespace corruption。
- [x] 5.3 扩展独立 tarball/no-private-import consumer，只使用公共 Contract、SDK 和 Testkit 调用 storage；证明官方与第三方插件共享同一限制，且无法导入 private wire、cursor codec、Tauri command、path 或 Host executor。
- [x] 5.4 新增 `check:plugin-scoped-storage` focused gate，组合共享 contract、Rust storage/lifecycle、TypeScript adapter/Dispatcher、Runtime/MessageChannel、public consumer、dependency/export/workspace boundary 和必要的 bounded macOS WKWebView evidence；先单独通过该 gate。

## 6. 同步维护文档与路线图

- [x] 6.1 更新 canonical English extension-platform/validation 文档，说明已交付 storage 数据流、限制、quota、cursor、原子提交、生命周期、corruption 与 public/private boundary，并在 `docs/zh` 同路径提供语义一致的简体中文镜像和索引更新（如索引结构发生变化）。
- [x] 6.2 在实现和 focused/full validation 全部通过后，仅将 `plugin-roadmap.md` Task 5.4 标记完成并链接该 change；保持 Task 5.5、Task 5.6、Milestone 5、管理 UI、权限交互、模板、CLI 和开发模式未完成。
- [x] 6.3 审核所有新增诊断、测试 evidence 和文档，确认不记录或展示 key、value、path、plugin data、raw payload、exception/stack，且没有新增产品 UI copy、theme 或 accessibility surface；若无 UI 变更，在验证报告中明确其不适用原因。

## 7. 最终验证

- [x] 7.1 运行 `pnpm run format` 与 `pnpm run src-tauri:format`，修复本 change 引入的格式问题；随后运行 `pnpm run check:plugin-scoped-storage`，修复全部 warning/error 并重跑至通过。
- [x] 7.2 按顺序运行前端完整验证：`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`；任何失败都必须修复、重跑原命令，再重跑本组全部命令。
- [x] 7.3 按顺序运行 Rust 完整验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`；任何失败都必须修复、重跑原命令，再重跑本组全部命令。
- [x] 7.4 运行 `openspec validate add-plugin-scoped-storage --type change`，直接统计并核对 `tasks.md` checkbox，复查 proposal/design/specs/tasks、源代码、测试、英中文档和路线图状态一致；然后顺序重跑 7.1–7.3 的完整最终验证集，确认无 warning、error 或未报告限制。
