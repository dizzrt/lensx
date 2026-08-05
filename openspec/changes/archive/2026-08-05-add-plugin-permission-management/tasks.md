## 1. 固化 Host-private permission contracts 与 catalog

- [x] 1.1 新增冻结的 TypeScript Host-private permission catalog 与 effective permission view，只覆盖 `clipboard.read` / `clipboard.write`，从公共 `HOST_API_METHOD_CATALOG` 派生 method requirement，固定 `standard | sensitive` risk 且将首版两项标为 `sensitive`；覆盖排序、闭集、official/external 一致性与 Contract drift 测试。
- [x] 1.2 定义 versioned、deny-unknown-fields 的 TypeScript/Rust Host-private grant mutation 与 clipboard request/result/error contract，覆盖可信 `entry_id` / `plugin_id` / `version` / `registration_revision`、单 permission target、read/write operation 和稳定安全错误；确保 grant、source、path、executor、native object 与 clipboard 内容不进入错误或公共 wire。
- [x] 1.3 建立共享 valid/invalid fixtures，让 TypeScript parser 与 Rust serde/validator 对严格字段、revision、identity、permission、operation、bounded text、result/error 和 canonical safe message 保持一致，并加入 focused contract gate。
- [x] 1.4 增加公共 export、package tarball、依赖方向和 workspace boundary 回归断言，证明 Contract/SDK/Testkit 不导出 permission coordinator、grant mutation command、AppKit/native provider 或 Host-private identity。

## 2. 实现 Rust grant authority 与原生剪贴板

- [x] 2.1 为 Plugin Manager 增加 revision-bound 的单 permission grant mutation：授予只接受当前 Manifest request 与 Host-supported ID，撤销可清除后来 undeclared/unsupported 的旧 grant，候选 snapshot 排序去重；幂等操作不写盘、不推进 revision，变化使用既有原子 record replacement。
- [x] 2.2 为 Manager mutation 增加 stale revision、degraded/quarantine、undeclared/unsupported grant、撤销残留、source independence、幂等、写入故障、restart recovery、unrelated-plugin isolation 与升级交集 Rust 测试。
- [x] 2.3 新增 App-managed `PluginPermissionState`、共享线性化 coordinator 与窄 grant mutation command；成功变化复用 Registration changed event，event 发送失败不回滚已提交状态，所有 result/error 均严格、版本化且不泄露敏感事实。
- [x] 2.4 新增可注入 `PluginTextClipboard` trait 和窄 clipboard command，在 coordinator 内重新核对当前 Manager revision、entry/plugin/version、enabled/compatibility、Manifest request、Host support 与真实 grant，再执行一次 read/write；覆盖 revoke/native race、旧 Session、cancel/late result 与无副作用失败。
- [x] 2.5 为 macOS target 声明 lockfile 已有的 `objc2-app-kit 0.3.2` 与 `objc2-foundation 0.3.2` 直接依赖，实现在主线程访问通用 pasteboard 纯文本的 provider；处理空/非文本、空写入、1,048,576 字符上限、超限与 native error，非 macOS 使用显式 unavailable provider，不注册通用 clipboard plugin。
- [x] 2.6 在 Tauri setup/invoke boundary 注册并注入 permission state，限制 grant mutation 为主 Host webview 的可信调用上下文；验证隔离 plugin iframe 没有 Tauri IPC、浏览器 Clipboard API、AppKit 或 arbitrary command 旁路。

## 3. 接入 TypeScript service 与 Host API Dispatcher

- [x] 3.1 新增严格 TypeScript desktop adapter/provider，注入可信 Session identity、解析 Rust grant/clipboard result/error、检查 AbortSignal/currentness，并将 domain conclusion 精确映射为 `permission_denied`、`unavailable`、`limit_exceeded`、`cancelled` 与 `internal_error`。
- [x] 3.2 实现 Host-private permission service 的 catalog/view 与 grant/revoke 调用，区分 `not_requested`、`unsupported`、`not_granted`、`granted`，保留 Manifest reason 仅作 author-controlled 展示事实；不增加 UI、决策历史或第二套持久化状态。
- [x] 3.3 扩展 Dispatcher dependency、closed switch 与 capability 计算：将两个 clipboard methods 独立路由到真实 provider，只在平台/provider/catalog/Session grant 全部满足时暴露对应 capability，并在每次调用进入 Rust authoritative check。
- [x] 3.4 在生产 App/`PluginRuntimeFrame` 组合中注入 permission/clipboard provider，复用 Registration refresh 与 compare-current lifecycle；grant 变化终止旧 Session/Port/pending calls，新 grant 只进入新 Session，不通过 `runtime.context_changed` 热授权。
- [x] 3.5 保持 storage、Navigation、Action、locale/theme 与其他 Runtime provider 行为不变；验证 permission provider dispose、Host reload、Page replacement、disable、uninstall 和无关插件 Registration 变化不会泄漏 listener、复活旧 binding 或错误撤销其他 Session。

## 4. 建立权限安全与端到端验证门禁

- [x] 4.1 扩展 Dispatcher/permission 单元测试，覆盖两个 clipboard 成功方法、只读/只写 grant、缺失 request、缺失 grant、unsupported platform/provider、official source、伪造 authority、invalid provider result、超限文本、cancellation、stale Session 与安全错误。
- [x] 4.2 增加真实 SDK → MessageChannel → Host adapter → Dispatcher → Rust permission/clipboard fake 的集成测试，覆盖 capability discovery、grant 后新 Session、revoke 后旧 Context/Port、pending call、event delivery failure、乱序并发和零 late native effect/result。
- [x] 4.3 增加 Rust coordinator 并发与 fault-injection 测试，证明 grant/revoke 与 clipboard effect 具有单一线性顺序，revoke 返回后后续调用不可使用旧 grant，持久化失败不改变内存/磁盘/revision，event failure 后逐调用检查仍 fail closed。
- [x] 4.4 增加 macOS bounded native smoke：使用受控测试文本验证真实 pasteboard read/write/empty restore 与主线程调用，并在测试结束恢复原剪贴板内容；任何环境限制必须明确报告，不能以 fake 测试冒充 native evidence。
- [x] 4.5 新增 `check:plugin-permission-management` focused gate，组合 shared contract/catalog drift、Manager/permission Rust、TypeScript adapter/Dispatcher、Runtime/MessageChannel、public tarball/boundary、official/external parity 与 macOS native evidence（可按环境单独执行），并先单独跑通非破坏性部分。

## 5. 同步维护文档与交付边界

- [x] 5.1 更新 canonical English extension-platform 与相关 development/validation 文档，说明 request、risk metadata、persisted grant、effective permission、Session capability、逐调用 Rust authorization、revoke linearization、macOS text provider 和非 macOS unavailable；在 `docs/zh` 相同路径维护语义一致镜像，索引结构变化时同步双语索引。
- [x] 5.2 审核文档、诊断、fixtures 与测试 evidence，确认不记录 clipboard text、Manifest reason、grant set、完整 identity、path、payload、native error 或 stack；明确本 change 无新 UI，因此产品 i18n、keyboard/focus、Semi theme 与 accessibility surface 不适用，Task 6.2 仍未交付。
- [x] 5.3 更新 package/workspace 验证说明与 shipped/planned 表述：只声明 Task 5.5 的权限内核和 clipboard provider，保持 Task 5.6、permission prompts/settings、模板、CLI、签名、Catalog/Marketplace 与 Milestone 5 未完成。

## 6. 最终验证

- [x] 6.1 运行 `pnpm run format` 与 `pnpm run src-tauri:format`，修复本 change 引入的格式问题；随后运行 `pnpm run check:plugin-permission-management` 的非破坏性 focused gate，修复全部 warning/error 并重跑至通过。
- [x] 6.2 按顺序运行前端完整验证：`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`；任何失败都必须修复、重跑原命令，再重跑本组全部命令。
- [x] 6.3 按顺序运行 Rust 完整验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`；任何失败都必须修复、重跑原命令，再重跑本组全部命令。
- [x] 6.4 在目标 macOS 环境运行 4.4 的受控 native smoke 与必要的真实 iframe/WKWebView permission loop，确认测试恢复原剪贴板且没有残留 Session、listener、pending call 或敏感日志；失败必须因实现问题修复或作为明确环境阻塞报告。
- [x] 6.5 运行 `openspec validate add-plugin-permission-management --type change`，直接统计并核对 `tasks.md` checkbox，复查 proposal/design/specs/tasks、源代码、测试和英中文档一致；只有 6.1–6.4 全部通过后，才将 `plugin-roadmap.md` Task 5.5 标为完成并链接 change，保持 Task 5.6 与 Milestone 5 未完成。
- [x] 6.6 路线图更新后重跑 `pnpm run check` 与 OpenSpec validation；对任何新失败先修复并重跑对应命令，再按 6.1–6.4 的顺序重跑完整最终验证集，确认无 warning、error、未恢复的剪贴板状态或未报告限制。
