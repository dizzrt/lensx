# Proposal

## Why

用户在搜索框使用中文输入法时，输入第一个拼音字母后失焦，无法正常选词。当前实现会把尚未确认的组合文本立即用于搜索和原生窗口呈现切换；该切换重复设置不可调整大小，而所用 macOS 底层实现会请求把键盘响应者改成原始窗口视图，形成与现象高度吻合的焦点中断链路。

源码调用链和 Semi 输入通知时序已经确认；实际 macOS 输入法会话与候选框尚未实测。本 Change 将修复组合输入与原生焦点保持的契约，并用确定性测试覆盖可验证的事件、策略和调用边界。

## What Changes

- 将正在组合的输入草稿与已提交的搜索查询分开：组合过程中保持可编辑输入、上一次已提交的结果和窗口呈现，确认或结束组合后再采用最终输入值。
- 在普通文本输入、首页与搜索切换、必要的原生窗口样式变更及回滚中保持当前有效键盘响应者；省略未变化的可调整大小设置，避免原始窗口视图接管 WebView 文本输入。
- 在组合输入期间及浏览器标记为 IME 的确认按键上，优先保留输入法的 Enter、Escape 和方向键处理；组合结束后的独立按键恢复原有搜索导航与执行行为。
- 补充中文组合输入、取消、重复结束通知、普通文本、空查询、无结果、失败恢复、可访问性、双语及主题回归；补充 Rust 原生操作顺序、焦点保持与回滚的确定性覆盖。
- 在现有 typed Gate registry 中新增稳定的 `launcher-input-focus` Gate，并同步相关英文文档及其简体中文镜像。

### Goals

用户能够连续输入拼音并确认中文，首次输入和提交后继续输入不会因窗口呈现配置而失去键盘输入目标；选词按键不会意外清空查询、移动 Action 选择或执行 Action。普通文本搜索、固定窗口尺寸和插件页面的合法可调整大小行为继续遵循既有契约。

### Non-goals

不改变搜索匹配、排序、结果上限、页面导航或插件权限；不更换输入组件、引入运行时依赖或扩大公共 Tauri/Host API；不关闭真正的窗口失焦隐藏行为，不增加轮询抢焦点；不建立浏览器、真实 WebView、GUI、截图或原生输入交互验证入口。

## Capabilities

### New Capabilities

无新增产品能力。

### Modified Capabilities

- `launcher-action-search`: 明确已提交查询与组合输入的关系，以及 IME 优先的搜索按键、取消和重复通知行为。
- `launcher-window-lifecycle`: 增加呈现切换保持有效文本输入响应者、避免无效重复样式设置，以及必要样式变更与回滚的焦点边界。

## Impact

- 前端：`src/App.tsx`、搜索输入交互及其 Rstest 测试；保持现有 Semi Design、i18n、combobox/listbox 与 light/dark 集成。
- Rust/native：`src-tauri/src/launcher_surface.rs`、相关策略测试及 Cargo path patch；将当前锁定的 `tao 0.35.3` 纳入 `vendor/frame-aware-navigation/tao`，仅对 macOS 可调整大小设置增加有界焦点保护，维持 Tao 内部状态与 AppKit 状态一致。这替换已有传递依赖的来源，不增加运行时依赖或升级版本。
- 验证：`scripts/validation/catalog.ts` 注册 `launcher-input-focus`，复用必要的现有 Child WebView/依赖漂移 Gate；不新增根 package script。
- 文档：更新 `docs/en/architecture/overview.md`、`docs/en/development/frontend-guidelines.md`、`docs/en/development/validation.md` 及对应 `docs/zh/` 文件；同步 vendored 补丁范围、原始许可证和源漂移断言，并通过现有 `frame-aware-navigation-dependency-drift` Generate target 显式更新已审阅基线。
- 兼容性：已有 tagged surface payload、窗口固定尺寸、搜索算法和公共插件契约保持兼容。实施与确定性验收进度见 `tasks.md`；已根据用户显式请求于 2026-10-02 先同步英文稳定 specs，再归档。
