## Why

macOS plugin WKWebView 文本区域存在 native cursor 从 I-beam 短暂回退为默认箭头的现象。该 change 最初计划在完成归因后直接交付产品修复，但 `0.7.0` 受控矩阵已把责任层收敛到共享 WKWebView/WebKit，而当前公开 Wry/WebKit 边界没有可验证且符合项目约束的 repo-local 修复。

因此本 change 重划为已完成的诊断 spike：保留可重复证据、唯一归因、被排除层和安全边界，把未来产品修复转交 GitHub Issue [#1](https://github.com/dizzrt/lensx/issues/1)，不再为了保持 change 打开而把未交付行为描述为已实现。

## What Changes

- 保留版本化、无用户内容且有界的 macOS native cursor evidence contract、AppKit oracle、D1/A/纯原生 B/production normal-isolated-seeded 矩阵及其 fail-closed 聚合测试。
- 记录最终归因 `shared_wkwebview_webkit`：普通顶层 WKWebView、Monaco 顶层 WKWebView、无第二个 WKWebView 的纯 Child、production ConfigLens 及 Host 隔离/恢复控制都复现同一 steady-state fallback。
- 记录被排除层：Monaco 特有内容、通用 Child/Wry construction、lensX Host/Child sibling participation、Runtime Session/attempt/bounds/focus/document/editor 重建。
- 记录当前无安全 repo-local 产品修复：不采用私有 WebKit API、blanket cursor override、ConfigLens/Publisher 特例、已失败的 cursor-rect invalidation 或 iframe 回退。
- 将原先尚未实施的产品修复、production candidate gate、维护文档和完整发布验证工作转交 GitHub Issue [#1](https://github.com/dizzrt/lensx/issues/1)，只在出现可复核的公开 WebKit/Wry 修复、窄版本上游 patch 或经单独审阅的约束变化后恢复。
- 归档时使用 `--skip-specs`：两份 delta spec 只作为原始未交付验收目标的历史记录，MUST NOT 同步到稳定 specs。
- **Goals**：完成可靠诊断与唯一责任层归因；保存可重复的恢复实施门槛；明确已交付诊断与未交付产品行为之间的边界。
- **Non-goals**：本 change 不消除用户可见 cursor fallback，不新增 release gate 或维护文档，不修改稳定 capability，不升级或 patch WebKit/Tauri/Wry，也不改变 Runtime authority、SDK、Manifest、包格式或插件权限。
- 本次重划没有新的用户可见产品行为；诊断源码与 evidence 仅用于复现、归因和未来候选验证。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `plugin-child-webview-runtime`：原 delta spec 保留未交付的 native cursor 稳定性目标，仅作为历史验收条件；本次归档不修改稳定 requirement。
- `official-config-lens-plugin`：原 delta spec 保留未交付的 ConfigLens candidate 稳定性目标，仅作为历史验收条件；本次归档不修改稳定 requirement。

## Impact

- 保留诊断/测试资产：`fixtures/plugin-pointer-cursor/`、`tools/plugin-pointer-cursor-harness/`、相关 TypeScript/Rust harness、聚合器、focused gate 与 tests。
- 产品 Runtime 行为保持不变；不存在 cursor 产品补丁、ConfigLens 身份特例、私有 API 或新的插件 Host capability。
- 稳定 specs 和 canonical 英中维护文档保持不变；未来产品工作由 GitHub Issue [#1](https://github.com/dizzrt/lensx/issues/1) 重新建立独立、可实施的范围。
