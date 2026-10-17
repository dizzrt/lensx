# Proposal

## Why

当前 macOS 桌面开发构建会输出来自本地 `tao 0.35.3` 的 18 条编译警告，掩盖后续真正需要关注的诊断。其中包含旧 macOS 文件拖放 API；需要在保留现有 WebView 隔离和输入焦点保护补丁的前提下，完成这批依赖维护。

## What Changes

- 消除已确认的 2 条未使用导入、4 条多余 `unsafe`、6 条未使用代码和 6 条弃用 API 警告；验收以真实 macOS 应用依赖图中 Tao 无编译警告为准，不固定未来警告总数。
- 删除确认没有消费者的残留代码；共享 `hit_test` 按实际 Windows、Linux 与 BSD 消费者设置编译条件。保留 `PlatformIcon` 的 RGBA 载荷和验证，仅允许附有理由的字段级 `dead_code` 例外。
- 替换旧键盘事件别名、删除无效的全屏按钮项，成套迁移文件拖放注册和读取。保留逐文件 Hover/Drop、文件顺序和退出单次 Cancel 的事件契约，并安全拒绝不可用的原生数据。
- 修正迁移涉及的 `draggingEntered:` 返回类型，显式声明所需绑定 feature；不依赖其他 crate 的 feature 合并。
- 保留五个 vendored crate 的版本、路径覆盖、Host/Child WebView 隔离以及 Tao resizable responder 保护；通过现有能力 Gate 回归这些边界。
- 补充确定性编译诊断、拖放策略测试、涉及文件的 vendored 格式检查，以及维护文档的英文和简体中文版本。审查 vendor diff 后通过现有 Generate 入口更新完整性基线。

### Goals and User Impact

开发者执行现有桌面开发命令时，这 18 条 Tao 警告不再出现；正常键盘、窗口、文件拖放和插件交互保留现有语义。异常文件拖放数据不再通过无检查解包或转换导致失败。本变更完成前，这些均为拟议结果。

### Non-Goals

- 不升级或移除 vendored 依赖，不重做 WebView、插件权限、窗口生命周期或输入焦点架构。
- 不增加产品级文件导入能力、公共 API、Manifest 字段、运行时依赖或新的 UI 文案。
- 不以全局或 crate 级屏蔽警告替代修复，不修改应用启动入口或追求消除正常启动进度提示。
- 不引入浏览器、真实 WebView、GUI、原生交互或性能验证；不提交、推送、同步或归档变更。

## Capabilities

### New Capabilities

无。本变更维护现有原生适配器和开发诊断，不新增产品能力。

### Modified Capabilities

无规范级契约变更。`frame-aware-webview-navigation-policy`、`plugin-child-webview-runtime` 和 `launcher-window-lifecycle` 的隔离、生命周期与 responder 要求继续作为回归约束。文件拖放维持 Tao 已有事件契约，异常系统输入的防御处理属于该适配器的修复。

因此 `.openspec.yaml` 显式设置 `skip_specs: true`，不为编译警告清理编造或重复稳定需求，也不创建 delta specs。

## Impact

- 实现主要涉及 `vendor/frame-aware-navigation/tao/src/platform_impl/macos/`、`tao/src/platform/macos.rs`、`tao/src/window.rs` 和 Tao 的绑定 feature 声明；不改变其他平台的已有消费者。
- 维护 `vendor/frame-aware-navigation/.lensx-integrity.json` 及既有依赖检查器的受审补丁文件清单，准确记录扩大的 Tao 补丁范围。
- 复用并扩展 `frame-aware-navigation-dependency-drift` Gate 的确定性维护检查；继续运行 `launcher-input-focus`、`frame-aware-webview-navigation-policy`、`plugin-child-webview-runtime` 和完整 CI/lifecycle。禁止新增 Change 专用根脚本或验证别名。
- 英文维护说明更新到 `docs/en/development/validation.md`，同步 `docs/zh/development/validation.md`；vendor 说明同步真实补丁范围。
- 风险集中于文件 URL 转换、原生回调类型和跨平台条件编译；通过纯策略测试、macOS 编译及现有安全/焦点 Gate 约束。确定性检查不作为真实 Finder 拖放或输入法交互已经通过的证明。
