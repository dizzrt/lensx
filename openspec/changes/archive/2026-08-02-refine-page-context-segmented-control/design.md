## Context

App Shell 当前在 `page` 展示状态中直接组合 Owner 名称、`/` 分隔符、打开页面的 Action 名称与 Semi Design 关闭按钮。关闭回调、Home 状态恢复、输入焦点恢复、固定窗口高度切换和窗口拖动排除均已实现并有测试覆盖；本变更不重建这些行为。

现有 `PageContext` 只提供 `owner_name` 与 `action_name`。它能够把 `lensx.core` 映射为 Host 名称，也能从不可变 Action Registry 快照中按当前语言解析 Action 名称，但不能表达 Owner 图标。视图中的 Action 文本同时占用剩余弹性空间，导致关闭按钮远离 Action；上下文栏又保持透明背景，因此 Owner、Action 与关闭操作在视觉上不是一个整体。

页面上下文仍位于统一的原生窗口拖动区域内。Owner 与 Action 只是描述当前页面来源的非交互信息，只有关闭按钮可以获得焦点和执行操作。任何视觉调整都必须兼容固定 `650×600px` Page 视口、英文与简体中文、浅色与深色主题，以及活动页面错误隔离状态。

## Goals / Non-Goals

**Goals:**

- 把 Owner、打开页面的 Action 和关闭按钮呈现为紧凑、连续、按内容收缩的分段胶囊。
- 为页面上下文建立 Host 解析的 Owner 图标模型，并为缺失或未知图标提供稳定 fallback。
- 使关闭按钮紧邻 Action，同时保持可访问名称、键盘操作、返回 Home、焦点恢复和窗口拖动排除。
- 通过 Semi Design 组件与主题 token、UnoCSS 布局工具和 Less 语义样式支持双语言与双主题。
- 在固定 Page 视口下以自动化测试、截图和计算样式共同验证视觉结果。

**Non-Goals:**

- 不实现插件发现、安装、生命周期、页面运行或 Manifest 到运行时 Owner 展示信息的投影。
- 不使 Owner 段或 Action 段具备导航、菜单、返回或面包屑交互。
- 不修改 Action Descriptor、Dispatcher、App Navigation Service、Rust/Tauri 命令或窗口尺寸协议。
- 不改变设置页的 Preferences、Plugins 内容或右侧非交互头像占位符。
- 不引入新的组件库、图标库或运行时依赖。

## Decisions

### 1. 将完整宽度的页面上下文槽位与按内容收缩的胶囊分离

App Shell 保留一个占据头像左侧剩余空间的页面上下文槽位，使槽位中的空白、Owner 和 Action 区域继续属于统一窗口拖动表面。槽位内部渲染一个 `inline-flex`、受最大宽度约束的页面上下文胶囊：Owner 段在左，Action 段和关闭按钮在右。

```text
完整拖动槽位
┌──────────────────────────────────────────────────────┐
│ ┌────────────────────────────┐                       │
│ │ [Owner icon + name] ╱ [Action + ×] │               │
│ └────────────────────────────┘                       │
└──────────────────────────────────────────────────────┘
```

Action 文本不再承担填充整行的职责；Owner 名称或 Action 名称过长时，文本可以收缩并省略，但关闭按钮始终可见且保持稳定点击目标。

替代方案是让胶囊本身继续 `flex: 1`。该方案会重复当前关闭按钮远离 Action 的问题，因此不采用。让头像通过自动外边距定位并移除完整宽度槽位也会缩小明确可用的拖动表面，因此不采用。

### 2. 抽取无业务分支的页面上下文视图组件

新增可复用的页面上下文视图组合，由 App Shell 传入已解析的 Owner 名称、Owner 图标、Action 名称、关闭按钮可访问名称和关闭回调。组件只负责结构、截断、Semi Button 组合和语义类名，不读取 Action Registry、不识别 `owner_id`、不执行导航服务。

数据流保持单向：

```text
ActivePage + Registry snapshot + locale + Host owner presentation
                              │
                              ▼
                    resolvePageContext
                              │
                 owner name/icon + action name
                              │
                              ▼
                    PageContext view component
                              │
                         onClose callback
                              │
                              ▼
                App Shell clears active page → Home
```

替代方案是在 `App.tsx` 中继续内联全部结构。它会让 App Shell 状态编排与复杂样式结构耦合，并使结构测试和 fallback 测试难以聚焦，因此不采用。

### 3. Owner 图标使用独立的 Host 展示 token，不复用 Action 图标语义

`PageContext` 增加可序列化、只读的 Owner 图标展示值。受信任的页面上下文解析层负责把已知 Host Owner 映射为受支持的 Host 展示 token；当前 `lensx.core` 使用 lensX Owner 图标。视图通过专用 Owner 图标解析器显示该 token；缺失或未知 token 显示通用提供方 fallback。

Owner 图标和 Action 图标可以复用底层 SVG/Semi `Icon` 构建方式，但必须保持不同的类型和 token 命名空间。插件 Manifest 的包内资源图标不会直接进入该 Host token 字段；未来插件运行时必须通过单独的受验证投影边界提供 Owner 展示信息。

替代方案包括复用打开设置 Action 的齿轮图标，或在视图组件中按 `lensx.core` 硬编码 lensX 图标。前者混淆 Owner 与 Action 语义，后者把信任和解析规则泄漏到展示层，因此均不采用。

### 4. 使用语义化 Less 实现分段外观，保留 Semi Button 行为

胶囊高度与现有 40px 顶部槽位协调，使用完全圆角外轮廓。Owner 段与 Action 段使用不同层级的 Semi fill token。分隔不得实现为覆盖在直边分段上的独立斜杠或斜带；Owner 的右边缘与 Action 的左边缘本身形成两条同向、平行的 `/` 形斜边，并在两条斜边之间露出窄幅胶囊底色。两个分段的内容分别在斜边内侧保留 padding，使文本和图标不会贴住边界。该几何分隔不参与可访问树和点击命中。关闭按钮继续使用 Semi Design borderless `Button` 和现有关闭图标，通过 Less 定义稳定尺寸、hover、active 与 `:focus-visible` 状态。按钮保持完整的 `32×32px` 指针与键盘命中区域，但 hover/active 填充由按钮内部居中的较小圆形视觉层承载，不让状态背景铺满整个按钮或贴住胶囊上下边缘。

复杂的分段背景、伪元素、截断和状态组合放在 `global.less`；简单的 flex、最小宽度和间距继续使用 UnoCSS。颜色、焦点边框和表面背景全部使用 Semi token，不硬编码浅色值。

不使用 Breadcrumb、Steps、Tag 或额外组件库：这些组件分别表达导航历史、流程或状态，与“当前 Owner + 打开 Action + 关闭当前页面”的语义不符。

### 5. 保持现有文本来源与可访问语义

Owner 名称继续由页面上下文解析层按当前 locale 生成；Action 文本继续使用打开页面的 Action 名称，不改为页面标题。现有关闭按钮国际化文案继续作为按钮可访问名称，不增加可见文本。视觉斜切符号标记为装饰，不进入区域的可访问名称。

Owner 与 Action 段不得获得 `button`、`link`、菜单触发器或 `tabIndex`。关闭按钮继续携带窗口拖动排除标记。页面上下文区域的可访问名称继续包含 Owner 与 Action，避免视觉结构变化破坏现有辅助技术路径。

### 6. 视觉验收与行为测试同等必要

组件和集成测试覆盖 Owner/Action/关闭结构、Owner 图标 token 与 fallback、文本省略容器、按钮可访问名称、拖动排除、返回 Home 和焦点恢复。固定 `650×600px` Page 视口下至少检查英文浅色、简体中文浅色和一种深色组合的截图，并核对胶囊尺寸、背景 token 结果、关闭按钮位置、焦点状态和长文本约束的计算样式。

DOM 测试不能替代视觉验收，因为斜切分隔、相邻关系、主题对比度和固定视口下的比例无法仅由元素存在性证明。

## Risks / Trade-offs

- [Owner 展示 token 先于插件运行时建立，未来投影合同可能不同] → 将 token 限定为内部 Host 页面上下文展示类型，不修改 Manifest 或公共 Action 合同；未来通过显式适配器转换。
- [平行斜边可能遮挡文本或压缩 Action] → 为 Owner 右侧和 Action 左侧保留固定内容 padding，以窄幅胶囊底色形成间隔，并以英文和简体中文长文本用例检查布局。
- [内容收缩后 Owner 或 Action 文本可能过早省略] → Owner 与 Action 分别设置合理的收缩优先级和最大宽度，始终优先保留完整关闭按钮。
- [持久分段填充可能被误认为可点击控件] → Owner 与 Action 不提供 hover、focus 或按压反馈；只有关闭按钮具备交互状态，辅助语义也只暴露一个按钮。
- [视觉填充与“连续表面”原则产生冲突] → 填充只用于表达单一页面上下文复合控件，不扩散到顶部拖动区域、页面内容或普通 Action Tile；完整槽位仍保持透明。
- [自定义图标与主题对比不足] → 图标继承 Semi 文本 token，并在浅色、深色和键盘焦点截图中检查计算颜色与对比。

## Migration Plan

1. 先扩展页面上下文展示模型与 Owner 图标解析测试，不改变 App Shell 行为。
2. 引入页面上下文视图组件并迁移现有 Owner、Action 和关闭按钮组合。
3. 应用分段 Less 样式，更新导航、拖动、设置 UI 与视觉测试。
4. 更新英文前端指南及对应简体中文镜像，记录共享页面上下文的展示与交互边界。
5. 运行完整前端与 Rust 验证，并完成固定 Page 视口视觉验收。

回滚时可以恢复旧的 App Shell 内联结构和透明样式，同时保留原有 `closeActivePage`、导航服务、固定窗口状态和测试基线；本变更没有持久化迁移或原生协议迁移。

## Open Questions

无阻塞问题。具体尺寸在实现时以现有 40px 顶部槽位、Semi token 和固定 `650×600px` 视觉验收共同校准，不在合同中固化不必要的像素值。
