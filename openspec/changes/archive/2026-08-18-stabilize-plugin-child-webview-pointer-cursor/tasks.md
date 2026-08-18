## 1. 诊断合同与安全边界

- [x] 1.1 固化 production ConfigLens 的 Child WebView、Resource Service、bridge、SDK、Session、native slot 与 Monaco 基线，并证明持续 mouse movement 不会重建 editor/model/document、Worker、attempt 或 bounds revision。
- [x] 1.2 实现版本化、强类型且有界的 pointer trajectory/evidence schema、非敏感 fixture、fail-closed native classification、归因决策表和相邻 TypeScript/Rust tests。
- [x] 1.3 实现批准 macOS 图形执行上下文的真实 CoreGraphics mouse-move stimulus、AppKit delivery/oracle、main-RunLoop heartbeat、临时 profile、指针恢复和有界 cleanup，且不读取或持久化用户内容、桌面 frame 或完整 DOM。
- [x] 1.4 将 Web semantic telemetry 与 native observation 限制在 test/harness 构建，并证明 release Host、public SDK、普通插件和 production ConfigLens 包无法访问诊断 hook。

## 2. 受控矩阵与最终归因

- [x] 2.1 实现并重复运行 D0 纯 AppKit oracle、D1 顶层普通 WKWebView、A 顶层 Monaco、纯原生 Window + 唯一 Child WKWebView、production normal/isolated/seeded ConfigLens 矩阵。
- [x] 2.2 将 establishment 与 steady-state 分离；每个 Web event 在 native sample 前完成 main-RunLoop heartbeat，steady-state 使用有界 multi-snapshot，并保留合法 gutter/link/control/scrollbar/resize cursor 转换。
- [x] 2.3 以 `0.7.0` evidence 证明 D0 10/10 delivery 与 cursor identity、全部 Web case establishment、276 个 Web event 零 delivery/heartbeat/cleanup failure，以及每轮 36 个稳态 text snapshot 中 6 个 arrow fallback。
- [x] 2.4 唯一选择 `shared_wkwebview_webkit`，排除 Monaco 特有内容、通用 Child/Wry construction、Host/Child sibling participation 和 Runtime identity/lifecycle 漂移，并记录当前公开边界没有安全 repo-local 产品修复。

## 3. 范围收口与后续移交

- [x] 3.1 撤回无效的公开 `invalidateCursorRectsForView` 试验，确认没有私有 WebKit API、blanket cursor override、ConfigLens/Publisher 特例、弱化 evidence 或 iframe 回退进入产品实现。
- [x] 3.2 创建 GitHub Issue [#1](https://github.com/dizzrt/lensx/issues/1)，记录症状、归因边界、公开上游上下文、禁止方案、恢复条件和未来 acceptance。
- [x] 3.3 将原 4–7 节未实施的产品修复、production release gate、英中维护文档、stable spec 更新和完整产品候选验证移交 Issue #1；这些工作没有被勾选为已实现。
- [x] 3.4 将 proposal、design 和两份 delta spec 收敛为“诊断 spike 已完成、产品修复未交付”；明确归档必须 `--skip-specs`，stable specs 和 canonical 文档保持不变。

## 4. 最终验证

- [x] 4.1 运行 evidence validator、focused cursor gate、相邻 Rstest 与 Rust example check，确认 `0.7.0` evidence、归因结果和 bounded cleanup 一致。
- [x] 4.2 运行 `pnpm run test`、`pnpm run check`、`pnpm run typecheck` 与 `pnpm run build`，修复本 change 引入的 warning/error 并重跑失败命令。
- [x] 4.3 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 与 `pnpm run src-tauri:check`，修复本 change 引入的 warning/error 并重跑失败命令。
- [x] 4.4 运行受影响的 ConfigLens/package gates；documentation checks 不适用，因为本次收口明确不修改 canonical 文档，browser/e2e visual gate 不适用，因为没有产品 UI 或 baseline 变更。
- [x] 4.5 运行 strict change validation 与 `git diff --check`，核对 archive target 不冲突且 stable spec 哈希保持归档前基线；归档操作本身由 OpenSpec archive workflow 以 `--skip-specs` 执行并在移动后单独验证。
