## Context

当前桌面端使用 Tauri 2 的默认 800×600、有边框主窗口，Rust 启动入口只安装 opener 插件，React 根界面只展示产品身份和描述。应用已经具备统一的 React locale、theme、Semi Design locale 和 render error boundary，但没有 launcher 原生窗口动作、全局快捷键、关闭转隐藏、失焦隐藏或原生唤起后的输入聚焦机制。

本 change 同时影响 Tauri 配置、Rust 桌面生命周期和 React 根界面，因此需要先明确原生权限边界、跨边界激活信号和可测试结构。后续 action、搜索、偏好和插件能力会依赖这里建立的窗口承载面，但不得反向进入本次范围。

## Goals / Non-Goals

**Goals:**

- 建立紧凑、固定宽度、无边框、置顶的 launcher 主窗口。
- 由 Rust 统一拥有显示、隐藏和切换动作，并让快捷键与窗口事件复用同一动作边界。
- 使用 `Ctrl+Shift+Space` 在应用运行期间可靠切换 launcher。
- 在可恢复的前提下将关闭请求和失焦转换为隐藏。
- 让 React 最小 launcher 输入在首次渲染及原生再次显示后获得焦点。
- 复用现有 React/Semi Design、i18n、主题和错误边界，并保持跨平台实现可诊断、可测试。

**Non-Goals:**

- 不定义 launcher action、action registry 或执行协议。
- 不实现查询匹配、结果排序、键盘选择、结果列表或空结果业务状态。
- 不实现最近使用、固定项、设置页、主题或语言偏好持久化。
- 不实现托盘菜单、可编辑快捷键、多窗口、插件系统或外部运行时。
- 不实现内容驱动的原生窗口高度自适应；本次只建立固定初始高度及允许的高度边界。

## Decisions

### Decision 1：主窗口采用固定宽度和有界高度

主窗口在 Tauri 配置中使用 650px 宽度、180px 初始与最小高度、800px 最大高度，并关闭 decorations、用户 resize 和 fullscreen。窗口使用透明背景、保持置顶，并继续使用稳定标签 `main`。

650px 为后续双列 action 和设置页提供足够空间，180–800px 则为后续内容自适应保留边界，但本 change 不根据 DOM 内容修改原生高度。选择配置声明静态窗口属性，而不是在 React 首次渲染后再设置，可避免启动时出现普通窗口到 launcher 窗口的视觉跳变。

备选方案是保留 800×600 普通窗口，仅增加快捷键；这无法验证产品最核心的 launcher 形态，因此不采用。首版也不做当前显示器居中或跨屏位置记忆，避免把窗口定位策略和持久化带入本 change。

### Decision 2：Rust 提供统一的 launcher 窗口动作服务

Rust 定义稳定的 `Show`、`Hide`、`Toggle` 领域动作及单一执行入口。执行入口通过主窗口标签解析 Tauri window：

```text
shortcut / close event / focus event
              │
              ▼
    launcher window action service
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
      show   hide   toggle
```

`Show` 依次尝试恢复最小化、显示、请求焦点，然后发出 launcher 激活事件；`Hide` 只隐藏窗口，不退出进程；`Toggle` 根据可见状态路由到前两者。窗口操作错误必须保留动作和操作阶段等可诊断上下文。

快捷键回调和窗口事件不得各自复制 window API 调用。为单元测试，动作决策与 Tauri 适配应分层，使可见性判断、动作路由和失败传播可以通过 fake adapter 验证，真实 OS 行为通过桌面 smoke test 验证。

### Decision 3：使用 Tauri 官方全局快捷键插件并在恢复路径就绪后启用隐藏生命周期

增加与 Tauri 2 对齐的官方 global-shortcut Rust 插件，注册唯一默认绑定 `Ctrl+Shift+Space → Toggle`。快捷键 handler 只把按下事件映射为 launcher 动作；释放事件和未知绑定不执行动作。

初始化顺序为：

1. 创建动作服务需要的状态。
2. 安装并注册默认快捷键。
3. 快捷键成功后，为主窗口安装 close 和 focus lifecycle listener。
4. 将生命周期标记为 ready。

如果快捷键插件安装或默认绑定注册失败，应用必须输出可诊断错误并保持普通可关闭、可见的主窗口，不得启用会把窗口永久隐藏且无法恢复的 close/blur 行为。这样保留降级恢复路径，同时把快捷键冲突留给后续设置能力解决。

备选方案是在注册失败时中止整个应用；这会把非核心系统冲突升级为完全不可用，因此不采用。自行接入平台快捷键 API 会增加跨平台维护成本，也不采用。

### Decision 4：Rust 通过类型化激活事件通知 React 恢复焦点

主窗口完成 `Show` 后向自身发出稳定事件 `launcher://activated`，载荷至少包含：

```text
LauncherActivationPayload {
  reason: startup | global_shortcut | programmatic
}
```

序列化字段使用 `snake_case`。Rust 不向 React 暴露原生窗口对象；React 通过一个桌面事件 adapter 订阅载荷并调用输入元素的 `focus()`。组件卸载时必须释放监听器，重复激活不得累积 listener。

首次启动不依赖事件到达时序：输入组件在首次挂载时主动聚焦；事件负责处理后续从隐藏状态恢复。浏览器和组件测试通过可注入的 activation source 或 hook adapter 模拟事件，不直接依赖真实 Tauri runtime。

备选方案是 Rust 注入 JavaScript 或由前端轮询窗口状态；前者破坏边界，后者增加延迟和后台开销，因此不采用。

### Decision 5：React 根界面只提供最小输入承载面

`App` 继续位于现有 `AppProviders` 下，并使用 Semi Design 输入组件渲染一个语义化 launcher 搜索输入。查询值只保存在组件本地并允许正常编辑；本 change 不根据查询产生 action、结果或模拟数据。

输入的 accessible label、placeholder、产品身份和必要说明全部来自现有应用 i18n 资源，英文为默认，简体中文保持相同 key 和语义。布局和间距使用 UnoCSS，只有 launcher 面板的复杂视觉、状态或主题 token 桥接使用 Less。亮暗主题继续由现有全局主题机制驱动，不创建新的 locale 或 theme 状态。

### Decision 6：测试按纯逻辑、跨边界和真实桌面行为分层

- Rust 单元测试覆盖动作 ID/路由、Toggle 可见性分支、操作顺序、错误传播、快捷键按下过滤和初始化失败降级。
- Rstest/Testing Library 覆盖最小 launcher 界面、受控输入、英文/中文文案、首次聚焦、激活事件再次聚焦及 listener 清理。
- 桌面 smoke test 覆盖真实全局快捷键、显示/隐藏、关闭转隐藏、失焦隐藏、置顶和输入焦点。
- 文档更新维护 English canonical 与简体中文镜像，不将规划行为提前描述为已实现。

## Risks / Trade-offs

- [Risk] `Ctrl+Shift+Space` 可能被操作系统或其他应用占用。→ Mitigation：注册失败时保留可见、可正常关闭的降级窗口并输出诊断；自定义快捷键留给独立 change。
- [Risk] 失焦自动隐藏会干扰开发者工具、权限提示或系统对话框。→ Mitigation：只监听主窗口 focus 事件；真实桌面验证覆盖开发和生产构建，后续特权流程需要显式暂停策略时另建 change。
- [Risk] 无边框透明窗口在不同平台的阴影和圆角表现不同。→ Mitigation：本次只保证语义形态和可读性，不承诺平台像素完全一致；使用现有主题 token 并执行跨平台可用性检查。
- [Risk] Rust 显示窗口与前端订阅完成存在事件竞态。→ Mitigation：首次挂载主动聚焦，激活事件只负责后续恢复。
- [Risk] 最小输入暂不产生搜索结果，用户可能误认为搜索已完整实现。→ Mitigation：不展示模拟结果、快捷操作或插件入口，文案不宣称搜索和执行已经可用。
- [Trade-off] 本次不做内容高度自适应，窗口只使用 180px 初始高度。→ 后续 launcher 结果 change 在有真实内容和测试基准后增加受限自适应。

## Migration Plan

1. 添加官方 global-shortcut 依赖并建立 Rust launcher window action 与初始化状态。
2. 更新 Tauri 主窗口静态配置，再接入快捷键和窗口生命周期 listener。
3. 增加类型化激活事件及前端 adapter。
4. 将最小身份页迁移为最小 launcher 输入界面，补齐双语资源和测试。
5. 更新英中文档镜像并执行完整前端、Rust 和桌面 smoke validation。

实现尚未归档时可整体回退本 change 的配置、Rust 模块、React 界面和依赖。回退后恢复普通窗口与身份展示页，不迁移或删除任何用户数据，因为本 change 不引入持久化。

## Open Questions

无。窗口尺寸、默认快捷键、失败降级、激活事件边界和本次非目标均已确定。
