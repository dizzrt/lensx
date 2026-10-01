# Tasks

本清单记录实施与验证进度；仅在完成对应实施和验证后勾选。按分组顺序实施。测试、构建和 Gate 均保持确定性，不启动浏览器、真实 WebView、GUI、Launch Services 或原生交互，不生成截图、像素基线或目标环境性能输出，也不增加 optional/manual 兼容入口。

## 1. 原生窗口配置与响应者保护

- [x] 1.1 将锁定同版本 `tao 0.35.3` 纳入 `vendor/frame-aware-navigation/tao`，保留原来源、package 元数据和许可证，更新 Cargo path patch 与 lockfile；验证 Cargo 解析只改变既有依赖来源、版本不升级且没有新增运行时依赖。
- [x] 1.2 为 Tao macOS `set_resizable` 增加私有的主线程幂等/响应者保护接线，正确写入内部状态，禁止无条件切向旧 Tao view；以无 AppKit 交互的纯策略/fake 单测验证 mask 不变、原 responder 未变、有效 responder 恢复、nil、移除目标、拒绝恢复及 fullscreen 状态，确认实际 native adapter 可编译且不修改其他平台或无关 setter。
- [x] 1.3 在 launcher surface 边界增加当前 resizable 状态读取和受控阶段去重，保持 guard、尺寸、约束、最终状态与 rollback 的顺序；扩展 FakeWindow 保存实际状态，并用 Rust 测试验证 fixed→fixed 无冗余 setter、必要 true/false 变更、重复目标和移动/缩放刷新。
- [x] 1.4 补齐原生状态读取、消息投递、guard、尺寸、约束、最终状态和 rollback 的故障注入；验证部分生效与排队执行不导致错误去重或混合状态，沿用既有安全错误，不把公开 setter 返回误当 AppKit responder 恢复确认。
- [x] 1.5 补齐 Host/Child 身份与焦点回归；以 Cargo 与现有 Rstest 边界测试验证 Child 仍附着时完整窗口配置、旧 Child 移除后不被恢复、真正失焦仍隐藏、显式激活/页面关闭仍由当前策略负责。
- [x] 1.6 扩展 vendored 版本/路径/补丁文件漂移检测及现有 Rstest 源策略断言，更新 `vendor/frame-aware-navigation/README.md` 和 `docs/en/architecture/overview.md` 的原生焦点说明及 `docs/zh/architecture/overview.md` 镜像；验证补丁文件范围、许可证、版本和两种语言的架构描述一致。
- [x] 1.7 审阅 Tao 同版本来源与全部补丁差异后，仅运行现有 `pnpm run generate -- frame-aware-navigation-dependency-drift --write` 更新完整性基线；以对应只读 drift Gate 和 Rstest 验证新包、补丁范围、未授权漂移与版本变化均可检测，再完成本组原生/来源测试，不把失败留待后续分组。

## 2. 搜索组合输入与按键优先级

- [x] 2.1 使用 Semi Input 的 `composition` 支持保留可见草稿，使应用 query 仅代表已提交完整值；以真实 Semi 组件的 Rstest 事件序列验证首页首字母/连续拼音不改变查询、结果、选择或 home target，已有查询开始组合时保留既有搜索状态。
- [x] 2.2 实现统一查询提交与等值通知去重，采用输入系统的最终完整值处理确认、取消、空值和无匹配文本；验证 compositionend 与尾随同值 change 只提交一次、至多产生一次必要 target 切换，取消丢弃草稿保留原查询，普通输入/粘贴/删除仍立即提交。
- [x] 2.3 把同步组合标记、`nativeEvent.isComposing` 和 IME 229 判定置于 Escape、Enter、方向键之前；验证组合按键不 preventDefault、不清空、不导航、不分派，组合结束先于被标记确认键的序列不误执行，随后独立普通键恢复原契约。
- [x] 2.4 将 clear、成功执行重置、页面切换和卸载接入组合会话失效及草稿收敛逻辑；以迟到 compositionend/change 与后续新会话测试验证旧查询不复活、页面不被切回且后续输入可继续。
- [x] 2.5 补齐中文提交后的 typed dispatch 失败恢复、同一输入 DOM/焦点、combobox/listbox、active descendant 和 live region 回归，参数化覆盖 `en-US`/`zh-CN` 及 light/dark；验证普通文本与无结果流程保留既有产品行为且草稿不误报最终搜索状态。
- [x] 2.6 更新 `docs/en/development/frontend-guidelines.md` 的已提交查询、组合草稿、键盘优先级和重置说明，并同步 `docs/zh/development/frontend-guidelines.md`；验证两种语言描述一致且具体实现文档没有进入根 README/AGENTS。

## 3. 稳定 Gate 与来源治理

- [x] 3.1 在 typed registry 注册稳定 `launcher-input-focus` Gate，组合已有 discovery 范围的输入/源策略 Rstest、launcher surface/window Cargo 测试和显式的 Tao 纯策略测试，复用 `frame-aware-navigation-dependency-drift` 与 `plugin-child-webview-window-lifecycle`；通过 registry tests 与 Gate plan 验证结构化 argv、平台、安全元数据、无环及共享步骤去重，不新增根脚本或把非测试编排塞入 Rstest。
- [x] 3.2 为聚焦 Gate 接入必要的清洁工作区依赖准备，沿用 workspace build graph 构建 public Contract；验证从缺失构建输出的状态也能正常加载 UI 测试，不依赖残留 dist、不用源码 alias、不重建根 node_modules，使用全局 pnpm store。
- [x] 3.3 验证新 Gate 只读检查第 1 组已审阅的完整性基线，且拒绝 committed-write 和环境步骤；通过 registry 安全测试及执行前后状态比较证明 Gate 不重新生成基线，所有来源更新仍由既有显式 Generate target 管理。
- [x] 3.4 更新 `docs/en/development/validation.md` 与 `docs/zh/development/validation.md`，说明 `launcher-input-focus`、复用 Gate、Generate 的显式写边界及纯策略验证限制；通过仓库文档/registry 测试验证命令 ID 可解析、镜像一致，未引入环境验证或兼容入口。

## 4. 最终验证

已完成验收：完整 frontend/workspace 898 项测试与全部 9 个 direct member 生命周期通过；Rust 231 项测试、格式、静态检查和构建通过；Tao 纯策略 11 项测试及两个补丁文件的独立格式检查通过。`launcher-input-focus` 在 Contract 输出缺失时通过，完整性基线、Git 状态与根 `node_modules` 身份不变。`ci-lensx` 和 `ci-plugins` 分别从移除 workspace `dist` 的清洁等价状态通过；Change 与全部 42 个稳定 specs strict validation、23 对文档镜像与相对链接检查通过。

Tao 原始 crates.io archive 的 SHA-256 与原 lockfile checksum 一致；除审阅的 `macos/window.rs` 修改和新增私有 `macos/resizable.rs` 外，release 文件保持逐字节一致。Cargo path dependency 显示 18 条未修改上游源码中的既有警告，补丁与应用代码无新增警告。确定性测试不证明真实输入法候选框行为；本次未执行实机候选框验证，也未同步或归档 Change。

- [x] 4.1 运行 `pnpm run gate -- launcher-input-focus`，确认其 `frame-aware-navigation-dependency-drift` 和 `plugin-child-webview-window-lifecycle` 依赖及 Tao 纯策略测试通过；单独记录聚焦证据、补丁文件的 Rust 格式检查与真实 adapter 编译结果，不以该 Gate 代替完整验证。
- [x] 4.2 运行完整 frontend/workspace `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`；确认组件/契约测试、Biome 格式与静态分析、类型和生产构建通过，没有遗漏直接 workspace member。
- [x] 4.3 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`，并显式检查标准 workspace 格式/测试不会自动覆盖的 Tao 补丁文件及纯策略测试；确认实际 macOS 依赖接线、Rust 格式、测试、静态检查和构建通过。
- [x] 4.4 从清洁工作区等价状态运行既有 `ci-lensx` 和 `ci-plugins` Gate，验证直接插件与应用使用相同已治理生命周期；不增加环境执行、发布、根脚本或重复兼容路径。
- [x] 4.5 执行 `openspec validate fix-launcher-ime-focus --strict` 和全部稳定 specs 的 strict validation、文档相对链接/双语镜像检查及 `git diff --check`；扫描根 manifest、CI、维护文档和 specs，确认无本 Change 的根命令别名、direct Rstest 文件列表脚本、递归 check 脚本或过时 dispatcher 引用。以后 sync/archive 前将 delta 正文转换为英文并保留 MODIFIED 标题和完整场景；本次实施完成并不自动授权归档。
- [x] 4.6 修复本 Change 引入的每项 warning/error，重跑失败命令及本组完整最终验证集；核对 proposal/design/deltas/已完成任务与最终源码一致，并在完成报告中区分确定性状态/调用边界验证与未实机验证的输入法候选框行为。

### 归档复核（2026-10-02）

根据用户显式归档请求，已复核全部规划产物完成、23/23 任务完成及上述实施验收记录。将两份 delta 正文转换为英文后，先同步 `launcher-action-search` 和 `launcher-window-lifecycle`：修改两项要求、新增两项要求，完整保留 34 个增量场景及未受影响的稳定要求；重复合并结果不变。

归档复核重跑 `pnpm run gate -- launcher-input-focus` 通过，包含依赖漂移、Child WebView 生命周期、UI 交互、Rust surface/window、实际 macOS adapter 编译以及 11 项 Tao 纯策略测试。Change、两个受影响的稳定 specs 和全部 42 个稳定 specs 的 strict validation 均通过；23 对文档镜像、维护的 Gate/Generate 引用、相对链接和 `git diff --check` 通过，未发现临时入口或过时命令别名。

已归档至 `openspec/changes/archive/2026-10-02-fix-launcher-ime-focus/`，保留 `.openspec.yaml` 并修正移动后的设计文档相对链接。此前完整实施验证记录中的“未同步或归档”描述对应实施验收阶段；本次同步与归档现已完成。真实 macOS 输入法候选框仍未实机验证，既有未修改上游 Tao 源码的 18 条警告仍按原验收记录保留。
