# Proposal

## Why

ConfigLens 当前底部持续显示“输入有效”等状态，语言只能手选，四种语言仅注册名称而未加载高亮规则，Monaco 搜索模块也未加载；此外，实际构建使用的 macOS Child WebView 路径绕过了 WebKit 的组合键处理，与 `Cmd+A` 等编辑快捷键失效相符。需要把这五项收束为一次配置编辑体验改进，并在通用 Runtime 层修复原生按键交付，避免为官方插件建立特殊通道。

## What Changes

- 移除 Footer 的空内容、有效、处理中状态展示及其专用区域；Footer 仅保留语言选择器、Format 和 Compact，移除底部 Search 按钮。保留编辑器诊断、操作忙碌语义和恢复能力，维持连续编辑区、正常 40px／受限 72px Footer 布局。
- 在通用 macOS Child WebView 层恢复当前聚焦编辑目标的组合键处理，使 ConfigLens 的 `Cmd+A` 使用 Monaco 已有全选命令；外部、开发和官方插件共享该行为，保留 Host 的 `Cmd+W/Q` 单次执行语义。
- 将新页面语言选择默认值改为“自动”。识别 JSON、YAML 1.2、TOML 1.0、XML 1.0；用户手选后锁定，重新选择“自动”才恢复识别。识别只改变语言、高亮和校验，不改写或自动格式化输入。
- 精简语言选择器：手选项仅显示 `JSON`、`YAML`、`TOML`、`XML`；自动模式始终显示本地化 `Auto`／`自动`，不附加识别结果或未识别状态，并缩短控件宽度。内部识别、支持的语法版本和操作条件保持不变。
- 加载 Monaco 原生搜索面板，保留 `Cmd/Ctrl+F` 打开编辑器内搜索；查询、结果定位和关闭均限于当前编辑器。原生图标字体随插件包交付，CSS 资源相对于样式表正确解析；Host 资源 MIME 表补齐 `.ttf` 的 `font/ttf`，沿用既有 scope、路径、生命周期及响应头规则。按用户确认的取舍，Monaco 原生 UI 文案（搜索、配套菜单及诊断交互框架）使用本次打开时的界面语言，重开 ConfigLens 后采用新语言；ConfigLens 自有控件和提供的诊断消息仍即时切换。
- 仅在 ConfigLens 内修正原生 Find 按钮对齐与 widget 顶部位置：搜索或展开替换时，编辑器滚到顶部后首行不被遮挡，关闭后释放 Monaco 原生占位。沿用现有顶部占位机制，不修改共享 Plugin UI reset、编辑器 padding、Monaco 版本或 Host。
- 补齐四语言语法高亮，跟随自动识别或手选语言以及浅色／深色主题；JSON、YAML、XML 复用当前 Monaco 资源，TOML 使用项目维护的轻量规则。

目标是提供稳定的选择、搜索、语言判断和着色体验。非目标包括新语言、LSP、智能补全、文件导入导出、持久化、网络识别、编辑器替换、Host API 扩展、依赖升级、发布或原生交互测试设施。

当前稳定契约中的“默认 JSON、禁止识别”以及 Footer 状态／空内容可见提示要求将被本提案替换；四语言语法高亮则补齐已经要求但尚未实现的行为。上述均为拟议行为，本阶段只生成规划文件。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `official-config-lens-plugin`：修改语言选择、空内容和 Footer 反馈契约；增加自动识别、搜索、完整高亮及其状态／资源／本地化验收。
- `plugin-child-webview-runtime`：增加与插件身份无关、受当前原生焦点约束的编辑快捷键交付契约及确定性验证要求。
- `plugin-resource-service`：固定 MIME 表在 WOFF2 之外增加 TrueType，覆盖大小写扩展名及 GET／HEAD 一致性；不新增权限或放宽 CSP。

## Impact

- 插件：`plugins/config-lens/src/ConfigLensPage.tsx`、`catalog.ts`、`styles.less`、`editor/`、`language/` 及相应测试和纯 Node 产物检查。扩展插件内部 Worker 协议，不改变公开 Manifest、SDK 或 Host API。
- 原生：`vendor/frame-aware-navigation/wry` 中 macOS Child WebView 的 key-equivalent 策略，必要的 Host 适配与焦点判定；同步受审查 vendor 补丁清单、完整性基线和确定性校验。现有 `launcher-window-lifecycle` 的窗口／关闭／退出契约保持有效并作为回归约束。
- 资源服务：`src-tauri/src/plugin_resource_service.rs` 的固定 MIME 表增加 `ttf => font/ttf`，扩展已有 GET／HEAD 测试矩阵；不改 Host API、权限、CSP、资源授权或预算。字体内嵌 CSS 会使样式表超过既有 1 MiB 预算，因此采用包内独立字体资源。
- 依赖与构建：保持 Monaco `0.56.0` 及现有解析器版本，不增加运行时依赖；新增语言和搜索资源必须继续满足 bootstrap、chunk、Worker、完整包预算以及本地资源边界。
- 文档：实施时同步 `docs/en/` 与 `docs/zh/` 对应的 `development/config-lens.md`、`architecture/plugin-child-webview-runtime.md`、`architecture/extension-platform.md`、`development/validation.md`，并更新 vendor 所有者文档。
- 验证：复用 `ci-plugins`、`plugin-resource-service`、`plugin-child-webview-runtime`、`plugin-child-webview-window-lifecycle`、`launcher-input-focus`、`frame-aware-webview-navigation-policy`、`frame-aware-navigation-dependency-drift` 等现有 Gate 和完整前端／Rust 生命周期。仅在既有 typed registry 中补充所需步骤，不新增 Change 专用根脚本或 GUI／浏览器 Gate。
