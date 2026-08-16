## Why

当前 lensX 将 Home、Search 和所有 Page 都映射到 Host 固定且不可调整的 Launcher 尺寸，插件作者既不能为不同 Page 声明适合其内容的初始窗口大小，用户也不能为编辑器、面板等插件工作区临时拖动调整窗口。需要在不开放插件原生窗口权限的前提下，把“Page 的期望初始尺寸”和“是否允许用户调整”纳入严格的公共 Manifest 与 Host 生命周期。

## What Changes

- **BREAKING**：将严格 Plugin Manifest Contract 从 `0.3.0` 升级到 `0.4.0`，不保留旧版本 alias、回退解析或双协议路径；迁移 ConfigLens、维护模板、示例、CLI、安装/检查与开发模式到同一当前协议。
- 为每个插件 Page 增加可选 `presentation` 声明，包含 author-selected `initial_size.width`、`initial_size.height` 和 `resizable`。尺寸使用 logical pixels；缺省时仍为 `650×600` 且不可调整。
- 由 Contract 和 Host 对声明进行严格类型、范围与跨语言一致性校验；Host 再按当前显示器 work area 约束实际初始尺寸。声明只影响展示，不授予原生 Window、Tauri、位置、尺寸 API 或运行时 resize 权限。
- 插件 Page 进入时由 Host 原子应用已验证的初始尺寸、约束与 `resizable`；Home、Search 和 Host Page 始终使用 Host 固定尺寸并保持不可调整。
- `resizable: true` 时仅允许用户通过原生窗口边缘/角落拖动；现有 Host slot revision 链路把窗口变化同步到当前 Child WebView。插件 Runtime 只能通过普通 Web viewport/ResizeObserver 观察结果，不能提交 native bounds。
- 同一 Page attempt 的 hide/restore 保留用户当前调整后的尺寸和可调状态；真实关闭、导航离开、disable、replace、upgrade、uninstall、development reload、retry、Host reload 或进程重启不保留用户调整尺寸。再次打开从 Manifest 初始尺寸开始，第一版不增加任何尺寸持久化。
- 在插件 Page 关闭、失败退出或切换到 Home/Search/Host Page 时，Host 立即恢复目标固定尺寸和不可调状态，不等待异步 Child WebView teardown；插件 A 切换到插件 B 时必须完整应用 B 的声明，不能继承 A 的尺寸或 `resizable`。
- ConfigLens 作为普通公共边界 consumer 声明 `800×600`、`resizable: true`，并把插件工作区收敛为 Monaco 占满的 `content` 与承载语言、状态、Format、Compact、受限 diagnostics 的 `footer`；lensX Page Header 继续由 Host 提供。
- 增加 Contract/Rust/React、边界、视觉与真实 macOS 证据，覆盖固定/可调插件、多插件切换、用户拖动、Retina/显示器约束、hide/restore、异步 close teardown 和 Home `650×320` 恢复。
- 更新 canonical English 文档及路径一致的简体中文镜像，说明 Manifest `0.4.0`、Page presentation、用户调整语义、非持久化范围和关闭 Host/native authority 的边界。

**目标**：让不同插件 Page 能以公共、声明式、Host 校验的方式选择合理初始窗口大小，并可选择允许用户在当前 Page 生命周期内自由调整。

**非目标**：不提供插件程序化 `setSize`/`resize`/`setResizable` API，不允许插件控制位置、显示器、最小/最大约束、z-order、fullscreen 或 native handle；不持久化用户尺寸；不让 Home、Search 或 Host Page 可调整；不增加 standalone plugin window、多窗口、旧 iframe Runtime 或新依赖。

## Capabilities

### New Capabilities

- `plugin-page-window-presentation`: 定义插件 Page 初始 logical size、用户可调 opt-in、Host 安全约束、状态转换、同 attempt 临时保留与真实关闭后非持久化语义。

### Modified Capabilities

- `plugin-manifest-contract`: 升级到严格 `0.4.0`，为 Page 增加可选且有界的 `presentation`，并保持 TypeScript/Rust 确定性规范化及关闭 native authority。
- `launcher-window-lifecycle`: 从“所有 Page 固定 `650×600` 且全局不可调”改为 Home/Search/Host Page 固定不可调、插件 Page 按已验证声明转换，并保证关闭/切换原子恢复。
- `plugin-child-webview-runtime`: 明确用户 resize、scale/monitor 变化与 Page chrome 变化通过 Host revisioned slot 更新当前 Child WebView，插件消息永不成为 bounds 输入。
- `official-config-lens-plugin`: 迁移 Manifest `0.4.0`，声明 `800×600` 可调 Page，并采用 Host Header 加插件 `content/footer` 单编辑器布局及相应证据。
- `plugin-development-documentation`: 教授 Manifest `0.4.0` Page presentation、用户 resize、非持久化语义和无 native Runtime authority 的边界。
- `plugin-development-mode`: 使 Development Mode 使用相同 `0.4.0` 声明、尺寸约束和用户调整生命周期，不获得额外 bounds/native 权限。
- `plugin-developer-cli`: 让 create/validate/build/pack/inspect 使用 `0.4.0`，生成缺省 presentation 并确定性检查显式声明。
- `plugin-project-template`: 将维护模板和示例迁移到 `0.4.0`，演示固定缺省行为与可选 presentation，而不暴露运行时窗口 API。
- `plugin-package-format`: 让 `.lxp` pack/inspect/install 分类使用当前 `0.4.0` Manifest，同时保持包格式与可复现字节不变。

## Impact

- Public Contract：`packages/plugin-contract` Schema、generated input、normalization、fixtures、pack/API 类型与版本；Rust Manifest mirror、安装/检查/Registration detail 的严格 wire 一致性。
- Host frontend：Page descriptor/projection、App presentation 派生、Launcher surface controller、错误恢复、插件切换与测试；不向 Plugin SDK/Host API 新增窗口方法。
- Desktop Rust/Tauri：`main` Window 的 logical size、resizable、min/max/work-area 约束与安全错误；保持完整 native Window、Host WebView、Child WebView 身份分离。
- Runtime：复用并加强 PluginRuntimeSlot 的 resize/scale revision 链路、compare-current 生命周期与真实 macOS multi-webview 证据。
- ConfigLens：Manifest、`ConfigLensPage` 语义结构/Less、组件与视觉测试、`800×600` 初始尺寸和可调/恢复 E2E；格式化和 Worker 语义不变。
- Tooling/docs：CLI、模板、示例、Development Mode、package/install/release gates、canonical English 文档及简体中文镜像、相关稳定规格。
- Dependencies：不新增 runtime、frontend、Rust 或组件库依赖。
