# Proposal

## Why

lensX 需要可配置且不抢占关键操作的快捷键，并让插件在保留页面与输入的前提下，按需响应专属快捷键激活。初始实现已提供快捷键能力，但设置将组合键唤出和双击唤出分开，并使用独立编辑面板。2026-10-29 用户要求紧凑的行式配置，并明确唤出只保留当前选择的一种触发类型。

## What Changes

- 在现有 Host 设置页增加“快捷键”分区，管理唤出 lensX 和 Action 专属绑定；支持录制、修改、清除 Action 绑定、恢复默认及明确的错误反馈。
- 支持常规组合键，以及 `Cmd`、`Ctrl`、`Option`、`Shift` 单个修饰键的双击。三击、普通字符双击、组合键双击和宏不在范围内。
- 组合键采用实时按键预览录制；双击修饰键直接在键位下拉框选择，不启动录制或获取录制 lease。按下中的预览与可保存候选分离，松开后保留最后完整有效组合。
- 唤出只保留一个组合键或修饰键双击，默认 `Ctrl+Shift+Space`；单行依次显示“唤出lensX”、类型下拉框和当前快捷键。切换并保存后旧类型不再生效，不保留隐藏的恢复组合键。
- 操作快捷键每行依次提供类型、当前快捷键、Action 和删除按钮；底部新增按钮添加一条未保存草稿。完整候选经明确保存后生效，Esc 取消，Action 改绑原子更新且不覆盖其它行。每个 Action 仍最多一个绑定。
- 配置使用 v2 单一 launcher trigger；旧 v1 只有组合键时无损读取，双入口时保留文件和两个候选，要求用户明确选择后保存。唯一唤出入口失效时保持窗口可见，提供设置和退出，不暗中启用其它组合键。
- 将所有绑定置于同一个规范化与冲突检查范围；保护关闭、退出、通用编辑、应用切换、搜索、截图、锁屏和辅助功能等明确的关键组合。Rust 执行最终校验，原生注册或持久化失败不得显示为保存成功。
- 普通唤出保持 Toggle；Action 专属快捷键执行 Show + 统一 Action Dispatch。页面已打开时再次触发，保留当前 Runtime、页面和输入，并传递新的调用。
- 将 `normal | shortcut` 来源作为每次 Action 调用的 Host 可信信息；仅专属绑定产生 `shortcut`。插件只感知调用，不接收实际按键或原生监听权限。
- SDK 创建选项提供可选的 `onShortcutActivated` 回调，覆盖首次初始化和同页面后续激活。未提供回调仍照常打开页面；回调异常、SDK disposal 和 Session 失效均有明确边界。
- **BREAKING**：沿用项目现有单一当前协议策略，Host API 升级至 `0.4.0`，SDK 升级至 `0.5.0`，Contract 升级至 `0.4.0`。现有插件须升级 SDK、调整 Manifest 兼容范围并重新打包；升级后仍可不实现回调。不新增旧协议协商或兼容分支。

目标是提供可恢复、可诊断的用户绑定和统一的 Action 激活契约。本提案不改变翻译、格式化等插件业务逻辑，不自动读取剪贴板或选中文本，不增加插件后台执行、原生输入访问、云同步、远程分发或发布操作。修饰键双击首版面向当前 macOS 桌面运行时；不宣称其它平台已具备对应实现。

## Capabilities

### New Capabilities

- `launcher-shortcuts`: 快捷键配置、规范化、保留键、统一去重、组合键注册、修饰键双击、授权状态、持久化补偿及 Action 路由。

### Modified Capabilities

- `host-settings`: 增加快捷键导航与管理，复用现有 Host 所有权、布局、主题、本地化与键盘操作。
- `launcher-window-lifecycle`: 使用当前有效的单一唤出 trigger 作为恢复入口，并区分普通 Toggle 与 Action Show 的焦点和恢复语义。
- `launcher-action-core`: 扩展执行上下文、统一多入口调用协调，保留现有结果和信任边界。
- `plugin-action-projection`: 将 Host 确定的调用上下文传至当前有效 Page，不向插件暴露执行器或配置。
- `plugin-page-navigation`: 同页面重复 Action 激活保留 Runtime 和输入，独立更新本次调用信息。
- `plugin-host-api-contract`: 增加 Session 内 Action 激活快照、订阅和事件，保持 Runtime Context 原有四字段结构。
- `plugin-host-api-dispatcher`: 当前生产目录迁移至 0.4.0，按真实 Session/provider 状态提供激活方法并维护闭合验证。
- `plugin-manifest-contract`: 更新当前 Host API 版本和维护消费者兼容范围，不改变 Manifest 有效性与兼容性的区分。
- `plugin-sdk-foundation`: 新版本兼容范围、可选快捷键回调、冷启动交付、去重、清理和异常隔离。
- `plugin-contract-package`: 更新独立版本维度及公共激活类型、Schema、校验与打包契约。
- `plugin-project-template`: 模板和 CLI 快照使用新版本与兼容范围，并展示可省略且能正确清理的回调接入方式。
- `official-translation-plugin`: 更新明确写入规范的 Host API 兼容范围；不改变翻译请求或输入业务行为。

## Impact

- 原生：`src-tauri/src/launcher_window.rs`、原生组合键适配器，以及新增的 Rust 快捷键存储、事务协调、纯事件状态机和 macOS 被动监听适配器。配置独立于仅含主题和语言的 `AppPreferences`。
- 前端：`src/app/pages/SettingsPage.tsx`、`src/App.tsx`、Launcher Action 服务、页面导航、插件投影与 Runtime/Host API dispatcher，以及中英文资源和相关语义样式。
- 公共包：`packages/plugin-contract`、`packages/plugin-sdk`、Testkit 的当前契约消费者；同步官方插件、示例、模板和 CLI 模板快照，保留历史不兼容 fixture。
- 文档：同步 `docs/en` 与 `docs/zh` 对应的架构、前端指南、插件 SDK/Host API/迁移及验证说明。规划阶段不改稳定规范和产品文档，不把拟议能力写成已交付。
- 验证：在 typed Gate registry 新增稳定能力 ID `launcher-shortcuts`，组合现有 Action、窗口、Session、SDK、Contract 和 package-consumer Gates。只采用确定性测试、静态检查、编译与纯 CLI consumer；不新增根脚本别名或 GUI、真实 WebView、截图、目标环境性能验证入口。
- 平台限制：被动双击识别需要可用的系统输入监听授权；唯一入口不可用时保持窗口可见供修改或退出，不保留隐藏组合键。内部去重、保留表和 OS 注册错误可受控，不承诺枚举其它应用的全部组合键，也不承诺双击具有 OS 级独占性。
