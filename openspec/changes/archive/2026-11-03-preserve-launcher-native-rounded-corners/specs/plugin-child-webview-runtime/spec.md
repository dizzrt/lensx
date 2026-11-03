# Spec Delta

## MODIFIED Requirements

### Requirement: Host MUST provide an edge-to-edge content slot below plugin Page chrome

当前 Page 由插件提供时，可信 Host MUST 将 Page chrome 保持在插件内容矩形之外，并将 chrome 下方剩余 Launcher body 空间全部分配给 Child WebView slot。在 macOS 上，铺满的插件内容 MUST 同时受完整 Launcher 外圆角裁剪；插件不承担窗口轮廓适配责任。

#### Scenario: Ordinary plugin Page enters its content slot

- **WHEN** an external or Development Mode plugin Page becomes current below the trusted Host Page chrome
- **THEN** its Host-owned Runtime slot begins directly after the chrome and extends to the remaining inline and bottom edges without Host body inset, inter-region gap or inner card radius
- **THEN** the plugin remains confined to that slot and cannot cover, replace or measure Host chrome through privileged APIs

#### Scenario: Official ConfigLens uses the ordinary slot

- **WHEN** the official ConfigLens Page and an equivalent external plugin Page resolve through the same provider and Runtime path
- **THEN** the Host selects the same edge-to-edge body layout from provider kind rather than official provenance
- **THEN** ConfigLens receives no special Host import, Runtime branch, native authority or bounds input

#### Scenario: Non-plugin surfaces retain their layouts

- **WHEN** the Launcher presents Home, Search or a Host-owned Page
- **THEN** the plugin edge-to-edge body state is absent and those surfaces retain their maintained padding, gap and resizable behavior
- **THEN** no hidden or stale plugin slot affects their layout or focus

#### Scenario: Plugin Page geometry changes

- **WHEN** Window size, scale, locale, theme or Host Page chrome changes the edge-to-edge content rectangle
- **THEN** the trusted Host advances the current slot revision and converges the same modeled Child WebView attempt on the newest valid physical bounds
- **THEN** the change causes no document reload, Session replacement, plugin-supplied geometry, native setter exposure or stale-attempt mutation

#### Scenario: Assign the ordinary plugin content rectangle

- **WHEN** the trusted Host lays out a current plugin Page
- **THEN** The plugin Page body MUST add no Host-owned inline padding, bottom padding, inter-region gap, or inner card radius around the Runtime slot.
- **THEN** macOS Host MUST 按 `frontend-foundation` 的共享外轮廓裁剪完整原生内容，包括插件 Child WebView；该裁剪 MUST NOT 将插件 slot 的上边缘改为带内圆角的卡片。
- **THEN** This layout MUST be selected from the trusted Page provider kind and MUST apply identically to official, external, and Development Mode plugins; plugin identity, Publisher, repository location, release metadata, or Runtime content MUST NOT select a special layout path.

#### Scenario: Measure and publish slot changes

- **WHEN** Window, scale, locale, theme, or Page chrome changes the Host-owned slot
- **THEN** React MUST continue to declare and measure only the Host-owned slot.
- **THEN** Slot changes caused by Window resize, scale, locale, theme, or Page chrome MUST continue through the current revisioned physical-bounds path and Rust validation without a plugin-supplied bounds input, Runtime reload, Session replacement, new native setter, or public contract change.

#### Scenario: Render a non-plugin Host surface

- **WHEN** the Host presents Home, Search, or a Host-owned Page
- **THEN** Home, Search and Host Pages MUST retain their own Host layouts.

#### Scenario: Present any plugin without a rounding adaptation

- **WHEN** 官方、外部或 Development Mode 插件在 macOS 当前 slot 中呈现不透明或透明内容，且未提供任何窗口圆角样式
- **THEN** Host MUST 对所有插件采用相同外轮廓裁剪，插件 MUST 无需升级 SDK、修改 Manifest、重建包或注册额外消息
- **THEN** 插件 MUST 仅观察原有矩形 Web viewport，MUST NOT 获得窗口圆角配置、原生对象或新的几何设置权限

#### Scenario: Reveal or restore a clipped Child

- **WHEN** macOS Host 首次显示已就绪 Child，或恢复语义等价的当前 Child
- **THEN** 被显示的 Child MUST 已受当前窗口外轮廓裁剪，原有 load、bridge 和 SDK readiness 条件 MUST 继续成立
- **THEN** 同一 attempt 的恢复 MUST 保持现有文档、Session、Worker、model、用户尺寸和焦点恢复语义，裁剪 MUST NOT 触发新一轮创建或加载

#### Scenario: Clipping cannot be established for presentation

- **WHEN** macOS Host 无法确认待呈现内容受当前窗口外轮廓裁剪
- **THEN** Host MUST NOT 显示未裁剪的 Child 或将该次显示报告为成功
- **THEN** 已有有效裁剪和安全呈现 MUST 在可保留时继续保留；无法保留时 MUST 隐藏受影响内容并沿现有初始化错误或 Runtime 失败路径处理
- **THEN** 插件或产品错误文案 MUST NOT 暴露原生指针、对象标签、平台异常或内部诊断；Host 仍可安全呈现时，其既有导航、重试与关闭行为 MUST 保持可操作
- **THEN** 初始裁剪无法建立时，窗口 MUST 保持未呈现并沿既有初始化错误路径处理

#### Scenario: Old attempts cannot undo the current outline

- **WHEN** 插件 A 被关闭、失效或替换为 B，且 A 的 slot 更新、ready、hide 或 destroy 异步操作稍后完成
- **THEN** A 的晚到操作 MUST NOT 清除共同窗口外轮廓、改动 B 的裁剪或让 A 再次可见
- **THEN** 当前 Child slot MUST 继续遵循既有 revision 与 compare-current 规则，外轮廓 MUST 跟随当前完整窗口边界
