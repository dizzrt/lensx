# Proposal

## Why

用户确认 lensX 自身搜索框的 `Cmd+A/C/V` 与 ConfigLens 正文／查找框的 `Cmd+C/V` 失效，而查找框右键复制粘贴可用；需要按 Host 与 Child 共用的平台编辑交付问题调查，优先核对共享原生边界，最终修改位置由断点证据确定。此前的 Child 原事件转发和确定性测试尚未证明标准编辑命令实际执行，不能继续用逐插件、逐快捷键补丁覆盖这一缺口。

## What Changes

- 后续实施先确认原生分派的具体断点：区分事件进入应用、应用保留键处理、当前原生焦点、WebView 接收／处理、原生菜单匹配／响应链、最终 DOM 编辑事件及内容结果；形成与实际依赖／构建身份相符的证据后，才选择和修改生产分派位置。`performKeyEquivalent` 返回值、fake 调用次数或“右键能用”均不能单独证明根因。
- 在 macOS Accessory Host 的共享边界统一交付 Select All、Copy、Cut、Paste、Undo、Redo，覆盖 Host 搜索框、普通外部插件的 `input`／`textarea`／`contenteditable` 和 Monaco 正文／Find 输入框。快捷键矩阵是验收样本，不生成新的 key-code 白名单。
- 沿用原生菜单的编辑命令语义与当前 first responder；保留 Web 文档自行处理／取消默认行为的能力、原始事件和修饰键、单次执行及未处理事件继续传播。保留 `Cmd+W/Q` 的前台应用保留语义和全局唤起键，避免额外拦截、重入或重复粘贴。
- Host 修复对官方、外部和开发插件一致；现有合规插件不需要修改 lensX 源码、更新 SDK、申请新剪贴板权限或添加平台补丁。插件自己的查找、格式化等业务命令仍由插件定义；标准输入行为由平台保障。
- 补充生产分派策略、原生适配接线、真实 DOM 编辑事件和实际编辑结果的分层回归，明确每层证据边界；不能再用单个 `perform_super` fake 的成功结果替代整条编辑链路。

目标是恢复当前焦点内正常的标准编辑行为，包括跨应用文本复制粘贴与编辑器撤销语义。非目标：显示应用菜单栏／Dock、改成 Regular 模式、增加系统全局编辑快捷键、统一替插件实现业务快捷键、引入程序化 Host 剪贴板 API、升级 Monaco／Tauri／Wry／Tao、调整 ConfigLens 布局或语言处理、增加浏览器／真实 WebView／GUI／原生 harness 验证入口。

上述为拟议行为。本阶段只创建本 Change 的规划文件，不修改实现、维护文档、stable specs、依赖或生成基线，不执行原生交互诊断、安装、发布或归档。当前只确认故障范围；具体原生失效分支尚未得到足够证据。

## Capabilities

### New Capabilities

无；复用现有窗口生命周期及插件 Runtime 能力所有者。

### Modified Capabilities

- `launcher-window-lifecycle`：补充 Accessory 模式下 Host 与 Child 共用的标准编辑命令交付、当前焦点、Web 处理优先及单次回退契约，保留无可见菜单栏与 W/Q 行为。
- `plugin-child-webview-runtime`：将现有普通编辑快捷键要求补全为端到端编辑结果、插件零适配、焦点／代次隔离和分层确定性验证要求。

## Impact

- 原生候选范围：`src-tauri/src/launcher_window.rs`、`src-tauri/src/macos_launcher.rs`，及断点证据确实指向的受审查 Tao/Wry macOS 事件／WebView 适配层。最终修改位置在诊断门槛通过后确定；不默认修改所有这些文件。
- 回归范围：Host 搜索框与根 `tests/`、普通外部插件输入 fixture、`plugins/config-lens/tests/` 的真实 Monaco、现有 Cargo 和 vendor policy 测试；前端只能修复已证明的错误事件拦截，不能代替原生编辑分派。
- 文档所有者：`docs/en/architecture/{overview,plugin-child-webview-runtime}.md`、`docs/en/development/{frontend-guidelines,config-lens,validation}.md` 中受影响内容及同路径 `docs/zh/` 镜像。原生修复由 Host 发布，插件仍走公开 Runtime，不新增 Manifest、SDK、Host API 或权限字段。
- 验证复用 `launcher-input-focus`、`plugin-child-webview-runtime`、`plugin-child-webview-window-lifecycle`、`frame-aware-webview-navigation-policy`、`frame-aware-navigation-dependency-drift`、`validation-governance`、`ci-lensx` 与 `ci-plugins`。有 vendor 源码变化时才履行现有审阅、显式 Generate 和完整性流程；不新增 Change 专用根脚本或可选环境 Gate。
