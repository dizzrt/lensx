## 1. 固化私有 Transport Contract

- [x] 1.1 基于现有 Runtime Session bootstrap、SDK transport interface 与 Host API Contract 记录当前边界，确认不新增 Dispatcher、权限决策、Rust command、真实副作用或运行时依赖，并为变更文件建立对应测试位置。
- [x] 1.2 在 `packages/plugin-sdk` 内建立不导出的 canonical transport contract，定义兼容现有 bootstrap/ready 的版本、request/response/event/cancel/disconnect 精确 frame、Session 内唯一且有界的 request ID，以及禁止 identity、grant、path、executor、Host object 与 raw error 的约束。
- [x] 1.3 从 canonical 定义生成或确定性检查插件侧 codec 与 Host 私有 projection，增加共享 valid/invalid fixtures 和 drift gate，覆盖错误版本、未知 type、额外键、非 JSON 值、identity 注入、method/result 错配和重复 terminal frame。
- [x] 1.4 为两端 `unknown` parser、冻结/复制行为和安全 bounded diagnostic 编写 focused 单元测试，证明非法 frame 不进入 handler、不会回显 payload/nonce/path/stack，且私有 codec/schema/fixture 不成为 package export。

## 2. 扩展公共 Plugin SDK 语义层

- [x] 2.1 使用 `@lensx/plugin-contract` 的 `HostApiRequest`、`HostApiResult` 与 validator 为 `PluginSdkClient` 增加 Contract-closed request 操作和 method/result 类型推导，复用现有 cancellation/timeout 选项，并在非 ready 状态或运行时非法 request 时保证零 transport request。
- [x] 2.2 增加只接受声明事件的类型化 SDK 订阅，验证 `runtime.context_changed` 完整 replacement，在通知订阅者前更新冻结 context，并拒绝 unknown、invalid、late 和 post-disposal event。
- [x] 2.3 调整 SDK error handoff，使 Contract-valid Host API error 保持判别类型，未知 transport/codec/handler failure 只映射为安全 SDK lifecycle error，不泄露 envelope、exception、stack、path、payload、grant 或 Host object。
- [x] 2.4 扩展 SDK 与 Testkit lifecycle 测试，使用现有 `FakePluginSdkTransport` 覆盖 declared request、invalid/mismatched request、乱序并发、取消、timeout、disconnect、dispose、late suppression、context event 和 Host API error 保真；保持 Testkit 不公开 wire/Port/origin/identity 配置。

## 3. 实现官方 iframe Transport

- [x] 3.1 新增 `@lensx/plugin-sdk/iframe` public subpath 和零信任配置的 `createPluginIframeTransport()`，保持 SDK root import 无浏览器副作用，所有公共 `.d.ts` 不引用 DOM global、Host-private 或私有 wire 类型。
- [x] 3.2 实现 package 内部 browser adapters 与单次 bootstrap consumer：校验 current parent、SDK-owned exact Host origin policy、精确 contract、nonce 和恰好一个 transferred Port，成功或失败后移除 window listener，并只通过该 Port 返回一次 ready acknowledgement。
- [x] 3.3 实现 Port request pipeline、内部 request ID、pending map、乱序 response 关联、Contract result/error 解析和 declared event 分发；bootstrap 完成后禁止回退到 window message bus。
- [x] 3.4 将 SDK cancellation/timeout 转成至多一次 cancel frame，并实现 message error、disconnect frame、codec failure 与 dispose 的统一幂等 terminal cleanup，拒绝新调用、清空 pending/subscription/listener 并抑制所有晚到 frame。
- [x] 3.5 为 iframe transport 添加 source/origin/version/Port/replay/second-bootstrap 攻击矩阵、并发乱序、duplicate ID/response、cancel race、invalid event/error/result、disconnect/dispose race 与零敏感泄漏测试。

## 4. 实现 Host 私有 Port Adapter 并接入 Runtime Session

- [x] 4.1 定义只接收冻结 Session identity、Contract-valid request 和 Host-owned cancellation signal 的窄 handler boundary，以及 production `unavailable` handler；禁止 handler 接收 origin、window、Port、envelope、plugin-supplied identity 或 executor。
- [x] 4.2 实现 Host Port adapter 的精确 frame parser、一次性 lease attachment、pending handler 管理、乱序 response、Contract result/error 验证、event emission、cancel propagation 和统一幂等 terminal cleanup。
- [x] 4.3 将 Runtime Session ready 后的 Port 读取权一次性交给 Host adapter，并把 Session/Runtime attempt 的 disconnect、dispose、Page close/navigation、disable、uninstall、replacement 与 Host reload 连接到 adapter cleanup；旧 adapter 不得终止或复活 replacement Session。
- [x] 4.4 在 `PluginRuntimeFrame` 生产路径安装 `unavailable` handler，确认 transport 可建立但 `runtime.get_context`、`ui.close`、`actions.open`、storage、clipboard 和权限均无真实副作用，且不新增插件可调用 Tauri command。
- [x] 4.5 添加 Host adapter 与 Runtime integration 测试，覆盖可信 identity 注入、wire identity 覆盖失败、stale/cross-plugin Port、invalid frame 零 handler hit、handler throw/invalid output、event、cancel race、Page replacement、重复 cleanup 和 late callback 隔离。

## 5. 建立真实消费与 WebView 证据

- [x] 5.1 更新 SDK build、exports、release allowlist 和 package verification，使真实 tarball 只发布 root 与 iframe entry 所需文件，不发布 source/test/fixture/schema/Host projection/deep import，并保持明确 SemVer 依赖且不新增运行时 dependency。
- [x] 5.2 扩展隔离 tarball consumer：一个 no-DOM ES2022 consumer 继续只用 SDK root，另一个 browser consumer 只用声明的 root/iframe entry 完成 typecheck、bundle/Runtime smoke 和 private deep-import rejection；consumer 安装必须在临时目录并使用机器全局 pnpm store，不触碰仓库根 `node_modules`。
- [x] 5.3 增加真实 `MessageChannel`/iframe integration fixture，使用真实 SDK transport、Host adapter 和仅测试 handler完成 context 初始化、Contract request/result/error/event、并发乱序、cancel、disconnect 和 terminal cleanup，不调用生产 application service。
- [x] 5.4 扩展目标 macOS WKWebView evidence，覆盖精确 parent/origin/Port、nonce 单次使用、正常 round-trip、malicious/stale Port、页面替换/关闭、pending 终止和 cleanup 后零 handler hit；证据不得记录 URL、nonce、Port 内容、payload、token、路径或私有错误。
- [x] 5.5 新增根命令 `pnpm run check:plugin-sdk-transport`，按确定顺序组合 SDK/codec/Host adapter/Runtime tests、drift gate、tarball consumers、browser fixture 和 WKWebView evidence，并确保根 workspace test/check/build 覆盖新增 package entry 与 Host 代码。

## 6. 同步双语文档

- [x] 6.1 更新 canonical English `docs/en/architecture/extension-platform.md`、`docs/en/development/plugin-workspace.md` 与 `docs/en/development/validation.md`，说明 iframe entry、typed request/event、私有 wire、Host lease identity、错误与 cleanup，以及 Session ready、SDK ready、transport round-trip 和 Task 5.3 真实执行的区别。
- [x] 6.2 在 `docs/zh/` 相同相对路径维护语义一致的简体中文镜像，核对索引无需新增条目，并明确 production `unavailable`、无权限决策、无真实副作用和无 Windows/Linux Runtime 交付。
- [x] 6.3 更新 package-owned SDK 文档与示例，只展示公共 Contract、SDK root 和 iframe entry 用法；所有示例进入类型检查或构建，且不公开私有 frame、origin/nonce/identity 配置、Host adapter 或深层导入。

## 7. 最终验证

- [x] 7.1 运行 `pnpm run check:plugin-sdk-transport`，修复所有新增 warning/error、安全矩阵、tarball/browser/WebView 或 drift 失败，并重跑该 focused gate。
- [x] 7.2 顺序运行 frontend/shared 验证：`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`；修复每个 warning/error 后重跑失败命令，并从头重跑完整 frontend/shared 集合。
- [x] 7.3 虽然本 change 不新增 Rust command 或 Rust 实现，仍顺序运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，修复所有受共享 fixture/构建影响的 warning/error 后重跑失败命令和完整 Rust 集合。
- [x] 7.4 运行文档镜像/链接检查、`git diff --check` 与 `openspec validate implement-plugin-sdk-transport --type change --strict`，直接核对所有 task checkbox、公开 exports、production 零真实 handler 副作用和 Roadmap 非目标；任何失败修复后重跑相应检查及 7.1–7.3 完整最终验证。
