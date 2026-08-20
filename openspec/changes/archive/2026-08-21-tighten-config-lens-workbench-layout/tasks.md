## 1. 确定性布局契约测试

- [x] 1.1 扩展 Host React/Rstest 覆盖：普通外部插件与 ConfigLens 都按 plugin provider 进入同一个 edge-to-edge Page body 状态，Home、Search 和 Host Page 不进入该状态，且断言不依赖 plugin ID、Publisher 或官方来源。
- [x] 1.2 为 Host 样式契约增加确定性断言，证明 plugin Page body 清除 inline/bottom inset 与区域 gap、Runtime container 不叠加 inner radius，同时保留外层 Launcher surface 与非插件页面的既有布局。
- [x] 1.3 扩展 ConfigLens component tests，证明页面仍只有 `content` 和 semantic `footer` 两个顶层区域，Monaco 在前，语言/非诊断状态/Format/Compact 属于 Footer；invalid 状态不渲染诊断计数、错误摘要、列表或附加行，但诊断仍传给 editor surface，且双语、主题、键盘和恢复语义不回退。
- [x] 1.4 为 ConfigLens 增加确定性 source/compiled-CSS 布局契约检查：根节点无外层 padding/gap，editor 无独立卡片边框/圆角，正常 Footer 固定贴底为 40px 且 center-aligned，受限 Footer 只按断点固定为 72px，并且 source 与产物均不存在 diagnostics selector。

## 2. Host 插件 Page edge-to-edge slot

- [x] 2.1 在 `App` 中从可信的当前 Page provider kind 派生 plugin Page layout 状态并暴露稳定语义 attribute；不得读取 ConfigLens identity、官方 provenance 或 Runtime 内容决定布局。
- [x] 2.2 更新 Host Less，使 plugin Page 的 `launcher-body` 在 Header 下方清除 inline/bottom padding 与区域 gap，并移除 `plugin-runtime-container` 的重复圆角；Home、Search、Host Page 和最外层 Launcher 裁切保持不变。
- [x] 2.3 验证 `.plugin-runtime-slot` 继续通过既有 DOM measurement、ResizeObserver、scale conversion、latest-wins revision 和 Rust bounds validation 收敛，不新增 payload、Tauri command、native setter、Runtime reload 或 Session 替换路径。

## 3. ConfigLens 连续 Monaco 与紧凑 Footer

- [x] 3.1 更新 ConfigLens Less：根工作区保持 full-height column flex 但移除 page padding 和 content/footer gap，Monaco content 继续 `flex: 1`/`min-height: 0`，editor 移除独立卡片 border/radius 并完全填满 content。
- [x] 3.2 将 Footer 改为与 Monaco 直接相接、通过固定 flex basis 与 auto margin 留在 viewport 底边的控制区域；正常高度为 40 logical px，并让 language、非诊断 status、Format、Compact 按共同中心线垂直对齐且在长文案下不把操作按钮推出 viewport。
- [x] 3.3 删除 Footer diagnostics DOM/CSS 和诊断 status 分支；诊断继续传给 Monaco marker，出现、更新或清除时不得改变 Footer 子树、高度或底边位置；受限 viewport 只允许固定 72px 的两行 controls/status grid。
- [x] 3.4 确认 Monaco ResizeObserver、marker、单模型、Format/JSON-only Compact、focus、主题、locale、Worker 与 Runtime 生命周期测试在布局变化后保持原语义。

## 4. 文档与治理同步

- [x] 4.1 更新 canonical `docs/en/development/config-lens.md`，说明连续 content/footer、固定贴底 Footer、无 Footer 诊断提示、editor-local marker 和确定性验证边界，并同步 `docs/zh/development/config-lens.md` 的语义镜像。
- [x] 4.2 更新 canonical Child WebView Runtime 架构文档，说明 plugin-provider edge-to-edge Host slot、外层 chrome/裁切所有权和既有 revisioned bounds 路径，并同步对应 `docs/zh/architecture/` 镜像。
- [x] 4.3 核对 root manifest、CI、维护文档、稳定 specs 与 validation registry：不得新增 Change 专属 root script、直接 Rstest file-list/递归 check 链、ConfigLens Host 特例、Evidence dispatcher、视觉/截图/浏览器/真实 WebView/GUI/native harness/目标性能入口或过期别名。

## 5. Focused 稳定 Gate 验证

- [x] 5.1 运行 `pnpm run gate -- ci-plugins`，验证 ConfigLens package lifecycle、组件/样式契约、built-output、自包含资源和普通插件边界。
- [x] 5.2 运行 `pnpm run gate -- plugin-runtime-slot`，验证 Host slot DOM、状态、bounds input 与当前 Runtime presentation 行为。
- [x] 5.3 运行 `pnpm run gate -- plugin-child-webview-delivery`，验证通用 Child WebView authority、lifecycle、slot revision、外部/官方同路径与确定性交付边界。
- [x] 5.4 运行 `pnpm run gate -- validation-governance`，确认没有恢复任何被禁止的环境型验证、写入型 Gate 或未治理命令入口。

## 6. 最终验证

- [x] 6.1 运行 `pnpm run test`，修复本 Change 引入的全部测试失败和 warning。
- [x] 6.2 运行 `pnpm run format` 与 `pnpm run check`，确认 frontend/shared 格式化、Biome 静态检查和维护策略通过。
- [x] 6.3 运行 `pnpm run typecheck` 与 `pnpm run build`，确认完整 workspace 类型检查和构建通过。
- [x] 6.4 虽然预期无 Rust 实现修改，但 slot 是跨 React/Rust 边界；运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 与 `pnpm run src-tauri:check`，确认 native bounds 与 authority 边界未回退。
- [x] 6.5 运行 `openspec validate tighten-config-lens-workbench-layout --type change --strict --no-interactive`、`openspec validate --all --strict --no-interactive` 和 `git diff --check`；如任一命令失败，修复后重跑失败命令、全部 focused Gates 与本节完整最终集合，再勾选所有任务。
