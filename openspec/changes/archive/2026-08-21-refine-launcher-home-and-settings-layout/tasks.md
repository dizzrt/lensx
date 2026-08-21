## 1. Launcher Home 固定入口收敛

- [x] 1.1 更新 Launcher Home 的 Rstest/Testing Library 断言：已有固定 Action 按确认顺序只读展示并可执行主操作，Recent/Pinned 卡片均不存在固定、取消固定或菜单按钮，空集合使用中性文案，avatar 与 All 继续不进入焦点顺序。
- [x] 1.2 从 `ActionTile`、`LauncherHome` 与 `App` 移除卡片级 `pinAction`、`onSetPinned`、pending/乐观更新和仅服务于可见固定入口的反馈编排，同时保留集合读取、Recent 成功记录、Pinned 解析展示、typed `setPinned` client/Rust 合同及其底层测试。
- [x] 1.3 删除不再使用的固定按钮 Tooltip、`PinIcon` 与 `.launcher-action-pin` 状态样式；确认卡片仍保持连续 surface、单一主操作、可见键盘焦点和明暗主题状态。
- [x] 1.4 同步更新 `en-US` canonical 消息、`zh-CN` 镜像和 `messages.schema.json`：将 Pinned 空状态改为中性表达，移除或收敛已不可达的固定/取消固定、容量和写入 UI 文案，并通过完整键集与 schema 测试。

## 2. Host Settings 左右导航布局

- [x] 2.1 更新 Host Settings UI 测试，覆盖默认选中 Preferences、纵向导航的本地化可访问名称/选中状态、键盘与指针切换 Plugins、当前 section 单一呈现，以及关闭设置后恢复 Launcher input 焦点。
- [x] 2.2 使用受控 Semi Design vertical `Nav` 重组 `SettingsPage`：左侧只包含 Preferences 与 Plugins，右侧呈现当前 section，并保持偏好串行持久化、Plugin Management Service 所有权和 Page Error Boundary 不变。
- [x] 2.3 为解析后的 `lensx.core/settings` Host Page 增加专用 App Shell layout modifier；让设置 body edge-to-edge，并在共享 Header 下方和导航/内容之间分别建立横向、纵向语义边界，且不影响 Home、Search、其他 Host Page 或 Plugin Page。
- [x] 2.4 使用 UnoCSS 完成简单 flex/min-height/spacing，使用 `global.less` 与 Semi theme token 完成约 `152px` 侧栏、边框、选中/焦点状态和右侧独立滚动；补充确定性 DOM/样式语义断言，验证固定 `650×600` 下长 Preferences/Plugins 内容不会扩大原生窗口或破坏 Plugin Management 内部分栏。
- [x] 2.5 在英语和简体中文、light 和 dark 测试组合中验证导航 label、section 标题、边框 modifier、选中态、焦点态和错误/空状态；不得用截图、像素、浏览器、真实 WebView 或 GUI 验证替代确定性断言。
- [x] 2.6 将 color-theme 与 language 控件替换为受控 Semi Design 单选 `Select`，保留串行持久化、保存禁用、确认后应用与失败回滚；让语言选项在所有 locale 下固定显示 `English` 与 `简体中文`，并补充 combobox/option 语义测试。
- [x] 2.7 将 color-theme 与 language 的中英文说明收敛为直接、仅描述 lensX 用户可见用途的简短文案，且不出现 Host、Semi Design 或其他内部实现名称；补充消息资源回归测试。

## 3. 维护文档

- [x] 3.1 更新 canonical `docs/en/architecture/overview.md` 与对应 `docs/zh/architecture/overview.md`，说明 Pinned 当前为保留数据合同的只读展示，以及 Host Settings 的左侧导航/右侧内容信息架构。
- [x] 3.2 更新 canonical `docs/en/development/frontend-guidelines.md` 与对应 `docs/zh/development/frontend-guidelines.md`，记录设置专用 App Shell modifier、横纵主题边界、滚动链和固定入口延期约束，并验证两种语言镜像路径与语义一致。

## 4. 聚焦验证

- [x] 4.1 运行稳定 `ci-lensx-test` Gate（`pnpm run gate -- ci-lensx-test`），修复 Launcher Home、Host Settings、消息 schema 或 App Shell 回归后重跑至通过。
- [x] 4.2 单独运行稳定 `plugin-management-settings` Gate（`pnpm run gate -- plugin-management-settings`），确认设置导航重组未破坏插件列表/detail、安装、生命周期、键盘和焦点恢复合同；保持该聚焦 Gate 证据与完整验证分开。
- [x] 4.3 运行 `openspec validate refine-launcher-home-and-settings-layout --type change --strict`，确认 proposal、design、两份 delta specs 与 tasks 一致且所有可观察场景有效。

## 5. 最终验证

- [x] 5.1 运行完整前端/工作区验证：`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`；修复本变更引入的所有 warning/error，并重跑失败命令与本组完整命令。
- [x] 5.2 虽然本变更不修改 Rust 源码或 Tauri 合同，仍运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`，确认固定集合持久化和桌面边界无回归。
- [x] 5.3 运行完整稳定 `ci-lensx` Gate（`pnpm run gate -- ci-lensx`）和 `git diff --check`，修复后重跑至通过；不得添加或调用浏览器、真实 WebView、GUI、Launch Services、native harness、截图、像素、visual baseline 或性能环境阶段。
- [x] 5.4 在同步或归档前扫描 root manifest、CI、维护文档和 specs，确认不存在 Change ID/Change 专用根脚本、被移除别名、直接 Rstest 文件列表脚本、递归 check 链、旧 Evidence dispatcher 或其他 stale validation 入口；进入 stable specs 的内容必须先改写为 canonical English。
