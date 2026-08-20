## Why

当前 ConfigLens 虽然采用了 `content` 加 `footer` 的两段式结构，但插件页面内外仍叠加页面 padding、区域 gap 和卡片圆角，导致 Monaco 没有占满 Host Header 以下、Footer 以上的完整工作区；Footer 也因底部对齐和宽松高度显得松散。需要把已接受的“Monaco fills all space above the footer”要求收紧为可确定验证的无缝工作区布局，并避免只为官方插件增加 Host 特例。

## What Changes

- 让所有插件 Page 的 Host-owned content slot 占满 Host Page chrome 以下的剩余页面区域，不再叠加 Page 模式专属的左右或底部内缩，也不在 slot 容器上重复卡片圆角。
- 让 ConfigLens 在其完整 Child WebView viewport 中只保留连续的 Monaco content 和 semantic footer：移除页面外层 padding、content/footer gap 与 Monaco 卡片圆角，Monaco 直接连接 Host Header 边界和 Footer 分隔线。
- 将 ConfigLens Footer 收敛为贴住 viewport 底边的固定控制区域：正常视口为 40 logical px 单行，语言选择、非诊断状态、Format 与 Compact 控件垂直居中；受限视口只按固定响应式断点切换高度，不得被诊断或其他动态内容顶起。
- 移除 Footer 主行中的诊断计数文案和 Footer 下方的错误详情列表；校验结果仍可驱动 Monaco 内部 marker，但不再生成 Footer 诊断 UI。
- 用确定性的组件、样式契约、构建产物和现有稳定 Gate 验证布局结构、固定贴底 Footer、无诊断提示、响应式降级以及 Host slot 边界，不恢复截图、像素比较、浏览器、真实 WebView 或 GUI 验证。
- 保留 Monaco 单模型、四语言处理、JSON-only Compact、Runtime/Session 生命周期、窗口 presentation、主题、双语、键盘和编辑器内诊断 marker 行为。
- **非目标**：不复制参考界面的标签页、图标工具栏、过滤器或其他 JSON 工具；不改变 Host Header 的信息架构；不增加 ConfigLens 专属 Host 权限、窗口 API 或 Runtime 分支；不改变 Manifest 初始尺寸及用户 resize 语义。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `official-config-lens-plugin`：明确 Monaco 必须无外层留白地填满完整 content 区域，Footer 固定贴底且不显示诊断计数或错误列表，编辑器 marker 不得改变 Footer 几何，并通过确定性验证覆盖。
- `plugin-child-webview-runtime`：明确 Host 为普通插件 Page 提供 chrome 以下的 edge-to-edge content slot，不使用官方插件特例，slot 几何变化仍通过既有 Host-owned revision/bounds 路径收敛。

## Impact

- ConfigLens：`plugins/config-lens/src/ConfigLensPage.tsx`、`plugins/config-lens/src/styles.less`、页面结构相关组件测试、样式/构建产物确定性检查以及中英文 ConfigLens 文档。
- Host frontend：`src/App.tsx` 的 Page 模式容器布局、`src/styles/global.less` 的 Runtime slot 外观和对应 React/Rstest 断言。
- 规格：`official-config-lens-plugin` 与 `plugin-child-webview-runtime`；不修改公开 Contract、SDK、Host API、Manifest schema 或 Rust/Tauri authority boundary。
- 验证：复用现有 `pnpm run gate` 稳定能力和工作区测试发现范围，不新增 Change 专属 root script、截图/视觉基线、Chrome、真实 WebView 或 Evidence 路径。
