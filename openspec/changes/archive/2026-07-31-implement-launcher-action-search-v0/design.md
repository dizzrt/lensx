## Context

当前 `src/app/launcher/actions/` 已提供框架无关的 `LauncherActionRegistry`、严格且可序列化的 Action Descriptor、Host-only executor 存储、`LauncherActionDispatcher`，以及默认的 `lensx.core.hide_launcher` 注册。Registry snapshot 已按 `action_id` 排序并与内部 executor 隔离；本地化 metadata resolver 已支持 `en-US`、可选 `zh-CN` 和英文 fallback。

当前 `App.tsx` 只通过 Semi Design `Input` 保存本地 `query`，负责初次挂载和 `launcher://activated` 后的输入聚焦。它不会创建默认 Action Service、读取 Registry snapshot、执行匹配、展示结果或调用 Dispatcher。Native Launcher 窗口仍为固定宽度和初始 180px 高度，本 change 不能根据结果数量改变其 Native 高度。

本 change 要建立从真实 Registry snapshot 到结果展示和统一 dispatch 的第一个端到端闭环，但不能把尚未实现的插件 Action 投影混入搜索算法。未来任何来源的 Action 只有先通过可信 Host 注册为同一 Descriptor，才能被同一搜索服务处理。

```text
                          descriptor snapshot only
┌──────────────────┐     ┌────────────────────────┐
│ Host Action      │────▶│ Launcher Action Search │
│ Registry         │     │ normalize/match/rank   │
└────────┬─────────┘     └───────────┬────────────┘
         │ Host-only executor                    │ serializable results
         ▼                                       ▼
┌──────────────────┐                  ┌───────────────────────┐
│ Action Dispatcher│◀── action_id ────│ React Launcher UI     │
└────────┬─────────┘                  │ query/select/feedback │
         │                            └───────────────────────┘
         ▼
 controlled Host behavior
```

## Goals / Non-Goals

**Goals:**

- 实现纯 TypeScript、框架无关、无副作用且确定性的 Action 搜索域服务。
- 让搜索对所有合法 Registry Descriptor 使用相同规则，不引入 built-in/plugin 分支。
- 对 query、locale、字段权重、全部 token 匹配、禁用过滤、结果上限和平分规则给出可测试定义。
- 让 React App Shell 通过键盘优先、可访问且本地化的界面展示并执行真实结果。
- 复用现有 Dispatcher 和 Rust `hide_launcher` 边界，维持 executor 的 Host-only 属性。
- 保持现有输入聚焦、主题、locale 和错误隔离能力。

**Non-Goals:**

- 不把 Manifest Action 转换或注册到 Host Registry，不实现 provider lifecycle、unregister、replace 或 Registry 订阅。
- 不按插件名称搜索，不消费 Plugin `display.name` 或 `default_action_id`，不扩展 Action Descriptor 来源字段。
- 不实现编辑距离、拼音、语义向量、个性化、使用频率、历史、最近使用、固定或持久化。
- 不新增后端搜索索引、Tauri command、Rust 搜索逻辑、远程调用或运行时依赖。
- 不自动修改 Native Launcher 窗口高度，不改动全局快捷键或焦点丢失隐藏语义。

## Decisions

### 1. 搜索是 Registry snapshot 的纯消费者

新增框架无关的搜索模块，核心函数接收 `query`、`locale`、只读 descriptor snapshot 和 `limit`，返回冻结的 `LauncherActionSearchResult[]`。结果包含 Action 身份、已解析展示 metadata 和 score，不包含 executor。搜索函数不持有 Registry、不注册 Action、不调用 Dispatcher，也不修改输入。

React 负责在 query 变化、locale 变化和 Launcher 激活时读取当前 snapshot 并调用搜索；执行时只把选中结果的 `action_id` 交给现有 Dispatcher。

选择该方案的原因：

- Registry 继续是运行中 Action 的唯一真源；
- 搜索可以用纯数据单元测试，不需要 React 或 Tauri；
- executor 不会因搜索或渲染越过 Host 信任边界；
- 未来 provider 只需先注册合法 Descriptor，无需修改搜索算法。

替代方案是在 Registry 中增加 `search()`。这会把注册生命周期、存储和产品相关排序耦合到同一类，也让未来搜索策略难以独立演进，因此不采用。

替代方案是分别实现内置 Action Search 和 Plugin Action Search。它会产生不同匹配规则、重复索引和来源分支，与“所有结果都是 Action”的契约冲突，因此不采用。

### 2. v0 使用 NFKC、全部 token 匹配和固定权重

查询处理顺序固定为：

1. `String.prototype.normalize("NFKC")`；
2. 使用当前 `en-US` 或 `zh-CN` locale 执行大小写折叠；
3. 去除首尾空白并把连续 Unicode 空白折叠为单个 ASCII 空格；
4. 按空白拆成非空 token。

每个 token 必须在已解析标题、任一已解析关键词或描述中至少匹配一次。每个 token 只取最佳字段匹配分数，然后与完整查询标题 bonus 相加：

| 匹配 | 分数 |
|---|---:|
| 完整查询 = 标题 | 1200 |
| 标题以完整查询开头 | 800 |
| token = 标题 | 600 |
| token = 任一关键词 | 500 |
| 标题以 token 开头 | 400 |
| 关键词以 token 开头 | 350 |
| 标题包含 token | 250 |
| 关键词包含 token | 200 |
| 描述包含 token | 100 |

只支持 exact、prefix、substring。总分降序排列，平分时按 `action_id` 升序。完整查询 bonus 和 token 分数允许多词标题精确匹配稳定领先，同时让查询 token 可以跨标题与关键词组合匹配。

选择固定权重而不是模糊库，是因为当前数据量小、字段已结构化、结果必须容易解释，并且不需要新增依赖。拼音、编辑距离或语义搜索需要独立的质量样例、性能预算和排序契约，留给后续 change。

### 3. locale 解析复用 Action Core，空查询和禁用项不产生结果

搜索复用现有 `resolveLauncherActionMetadata` 语义：标题和描述按当前 locale 回退到 `en-US`，关键词优先当前 locale，否则回退英文。查询和可搜索字段使用同一 locale 规范化。

`enabled = false` 的 Descriptor 在评分前过滤。空查询直接返回空结果；不把 snapshot 的 `action_id` 顺序伪装成推荐、最近使用或固定排序。App Shell 使用固定上限 8，先完成全量确定性排序再截断。

替代方案是空查询展示全部 Action。当前没有推荐、历史或使用频率契约，而 Registry 的默认 `action_id` 顺序只是确定性存储顺序，不代表产品相关性，因此不采用。

### 4. 默认 Action Service 只创建一次并允许测试注入

生产环境增加一个由 `desktopLauncherActions` 创建的默认 `LauncherActionService` 实例，生命周期覆盖 App Shell。`App` 通过可选 prop 接收 Action Service，默认使用该生产实例，测试可以注入隔离 Registry 和 Dispatcher。

App 不在 render 中重复创建 Registry 或注册 built-in Action。查询搜索使用 memoized 派生结果；选中索引、dispatch pending 和安全错误反馈保留为 React 交互状态。未来 Registry 若需要动态 provider 变更通知，应由 provider lifecycle change 增加显式订阅机制，而不是在本 change 轮询。

### 5. 结果列表采用 Semi 视觉基础与原生 ARIA combobox/listbox 语义

继续使用 Semi Design `Input` 和 `Typography` 等视觉基础。搜索结果交互使用项目拥有的语义化结果组件，按照 ARIA combobox/listbox 模式设置 `aria-expanded`、`aria-controls`、`aria-activedescendant`、`role="listbox"`、`role="option"` 和 `aria-selected`。不假设通用展示型 List 组件自动提供键盘选择语义。

输入保持 DOM focus；方向键只改变 active option，避免频繁转移焦点。第一项默认选中，结果或 query 变化时重置到第一项；上下移动在首尾停止，不循环。Enter 和指针激活进入同一 dispatch handler，pending 期间忽略重复触发。Escape 清空 query、结果、错误和选中态并重新聚焦输入。

简单 flex、spacing、sizing 使用 UnoCSS；滚动容器、选中/hover/pending 状态、主题 token 和可复用结果行使用 Less。颜色使用 Semi Design token，所有状态文案进入 `en-US` 和 `zh-CN` i18n 资源。

### 6. 执行继续由 Dispatcher 负责，UI 只处理 typed result

UI 不从搜索结果获得 executor。Enter 或指针激活时调用 `actionService.dispatcher.dispatch(action_id)`：

- 成功：清空 query、结果、选中态和错误；具体 Action executor 决定受控行为，例如 `hide_launcher` 隐藏窗口。
- `action_not_found`：保留 query，显示本地化“Action 已不存在”。
- `action_unavailable`：保留 query，显示本地化“Action 当前不可用”。
- `action_execution_failed`：保留 query，显示安全通用错误。

错误反馈不呈现内部 message、stack、Native payload 或 executor 细节。状态通过 `aria-live` 区域播报。下一次 query 变化清除旧执行错误，输入保持可恢复。

### 7. Activation 重新聚焦并刷新搜索，不隐式改变产品状态

现有 `useLauncherActivation` 继续负责每次成功 show 后聚焦输入。Activation callback 同时从当前 query 和最新 Registry snapshot 重新派生结果，但不自动填充查询或执行 Action。成功 dispatch 已清空 query；普通 hide/show 保留尚未执行的 query，避免窗口生命周期事件暗中丢弃用户输入。

该选择维持当前 activation 契约，并为未来 provider 在窗口隐藏期间完成注册后提供一次显式 snapshot 刷新点。持续 Registry 订阅仍不属于本 change。

### 8. 不修改 Native 窗口尺寸

结果区域在现有 Launcher surface 内使用有界滚动，不调用 Tauri resize，也不修改 `launcher-window-lifecycle` 稳定规格。这样可以让搜索与 Native 窗口布局策略解耦。若后续体验验证认为需要按结果展开窗口，应通过独立 change 修改 Window Lifecycle capability。

## Risks / Trade-offs

- [固定 exact/prefix/substring 对拼写错误和拼音不友好] → 用中英文标题与 `default_keywords` 提升召回；模糊或拼音匹配通过后续有质量基准的 change 引入。
- [固定 180px Native 高度限制同时可见结果数量] → v0 使用上限 8 和内部滚动，保持窗口生命周期不变；后续单独评估程序化 resize。
- [Registry 没有变更订阅，窗口可见期间新注册 Action 不会自动刷新] → 当前只有启动时注册的 built-in；query、locale 和 activation 会读取新 snapshot，动态 provider lifecycle 后续增加正式订阅。
- [分数常量成为产品行为契约，未来调整可能影响排序] → 将评分表集中定义并用行为 fixture 覆盖；任何可观察排序变更通过 OpenSpec 修改。
- [dispatch 时 Action 可能已移除或禁用] → 以 Dispatcher typed failure 为最终权威，UI 保留 query 并提供可恢复反馈。
- [自定义 listbox 容易遗漏无障碍细节] → 按 combobox/listbox 模式建立交互测试，覆盖 active descendant、选中态、键盘边界和 live region。

## Migration Plan

1. 先增加独立搜索类型、规范化、评分与排序服务及完整 fixture，不接入 UI。
2. 增加默认 Action Service 生产实例和 App 测试注入边界。
3. 将现有受控输入接入真实 snapshot，添加结果、空状态、选择和 dispatch。
4. 更新 i18n、Less/UnoCSS、英文架构文档及简体中文镜像。
5. 运行全部前端、Rust 和 OpenSpec 验证；Rust 层预期无行为变更，但仍执行回归验证。

回滚时可移除 App Shell 的搜索消费和新增搜索模块，恢复仅保存 query 的输入；现有 Registry、Dispatcher、built-in Action、Rust command 和窗口生命周期不需要数据迁移或回滚。

## Open Questions

无。插件名称匹配、`default_action_id` 提升、动态 Registry 订阅、模糊/拼音匹配和 Native 窗口自动伸缩已明确留给后续 change。
