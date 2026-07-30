## Context

lensX 当前已经具备 Rust-owned launcher 窗口生命周期、类型化激活事件和 React 本地受控输入，但输入值没有可查询或执行的领域对象。架构文档把 launcher concepts 放在 application/domain 层，并要求 UI 只依赖 application services、特权操作通过 typed desktop adapter 进入 Rust；扩展平台方向又要求未来内建模块和外部插件共享可搜索 action 概念。

本 change 必须在三者之间建立一条不会反向依赖 React 组件、Tauri window 或尚未定义的插件 Manifest 的 action 核心。虽然首个 action 会调用原生窗口能力，但 registry 和 dispatcher 仍属于可信前端 Host application layer；Rust 只负责已有 privileged window operation 和稳定 command 边界。

## Goals / Non-Goals

**Goals:**

- 定义稳定、可序列化、可运行时验证的 launcher action descriptor。
- 让 action ID 和 owner 关系可长期用于搜索、历史、固定项及未来 provider adapter。
- 建立 Host-owned、确定性、不可由消费者篡改的 registry snapshot。
- 将 descriptor metadata 与 Host executor 分离，并通过 dispatcher 提供统一执行结果。
- 用 `lensx.core.hide_launcher` 验证 TypeScript registry/dispatcher 到 Rust window action 的真实路径。
- 保持 action core 不依赖 React 组件、Semi Design、Tauri window 或插件格式。

**Non-Goals:**

- 不把 action 展示在当前 App Shell。
- 不实现 query normalization、matching、ranking、结果列表或键盘导航。
- 不实现 history、pins、settings、偏好持久化或 shortcut customization。
- 不定义插件 Manifest、安装、权限或外部 runtime。
- 不实现 registry unregister、动态 provider reload 或 action 更新事件；这些由未来 provider lifecycle change 定义。
- 不支持 action 返回任意业务 payload、请求参数或 UI 导航指令；首版 action 是无参数副作用操作。

## Decisions

### Decision 1：Action core 位于可信 TypeScript application/domain 层

action contract、validator、registry 和 dispatcher 放在 `src/app/launcher/actions/**`，只依赖 TypeScript 领域类型和显式 adapter interface，不导入 React、Semi Design 或 `@tauri-apps/api`。Tauri invoke 封装位于独立 desktop adapter，内建 action source 通过接口注入该 adapter。

```text
future search UI / future plugin adapter
                 │
                 ▼
    LauncherActionRegistry snapshot
                 │
                 ▼
      LauncherActionDispatcher
                 │
       Host-only executor map
                 │
                 ▼
       typed desktop adapter
                 │
                 ▼
       Rust launcher window action
```

选择 TypeScript application layer 而不是 Rust registry，是因为当前可见 action metadata 必须与应用 locale 和 message resources 保持一致，未来搜索也在前端消费 snapshot。Rust 继续拥有特权执行，而不成为展示 metadata 的第二事实源。未来 Rust plugin manager 可以通过受验证的 provider adapter 向该 registry 投影 descriptor，但插件不能直接持有 registry 或 executor。

备选方案是由 React context 直接保存 action 数组；这会把领域状态绑到组件生命周期并妨碍非 UI 测试，因此不采用。另一方案是在 Rust 和 TypeScript 各维护完整 registry；这会产生双重注册和 ID 冲突事实源，也不采用。

### Decision 2：Descriptor 使用严格 namespaced ID 和本地化数据

公开 descriptor 采用 snake_case 字段，以便未来跨边界复用：

```text
LauncherActionDescriptor {
  action_id
  owner_id
  title
  description?
  default_keywords
  enabled
}

LocalizedActionText {
  en-US: string
  zh-CN?: string
}
```

`owner_id` 由至少两个点分隔 segment 组成；`action_id` 必须等于 `owner_id + "." + local_name`。每个 segment 必须以 ASCII 小写字母开头，只包含小写字母、数字、`_` 或 `-`，单个 segment 最多 64 字符，完整 ID 最多 255 字符。首个 owner 为 `lensx.core`，action 为 `lensx.core.hide_launcher`。稳定 ID 在发布后不得被复用于语义不同的 action。

`title.en-US` 必填且 trim 后非空，`description` 若存在则英文值同样必填。`zh-CN` 缺失时使用英文回退。`default_keywords` 按 locale 存储数组，允许空数组；每个关键词 trim 后必须非空，并在同一 locale 下按 locale-aware lowercase 保持唯一。

所有用户可见内建 title/description 继续来自应用 message resources；内建 source 在注册时从 canonical English 和对应 Chinese resource 建立 localized descriptor。关键词不是用户可见 copy，但仍按 locale 显式维护。未来插件 adapter 必须先把插件 metadata 转换为同一 descriptor，不得让 action core 依赖插件类型。

备选方案是让 descriptor 保存 React i18n message key。该方案适合内建 action，却无法表达外部 provider 自带的本地化 metadata，因此不采用。直接只保存当前 locale 的字符串也会让 locale 切换需要重建 registry，故不采用。

### Decision 3：运行时验证返回稳定结构化诊断和规范化副本

registry 接受 `unknown` descriptor input，通过单一 validation/normalization boundary 返回：

```text
ActionValidationResult {
  descriptor?: LauncherActionDescriptor
  diagnostics: ActionDiagnostic[]
}

ActionDiagnostic {
  code
  path
  message
}
```

公开 `code` 至少覆盖 `invalid_type`、`unknown_field`、`invalid_id`、`invalid_owner`、`missing_localized_text`、`invalid_keyword` 和 `duplicate_keyword`；`path` 使用 JSON Pointer，多条诊断按 `path`、`code` 排序。validator 拒绝未知字段和非序列化数据，不把 executor、函数或 class instance 放入 descriptor。

规范化只 trim 本地化文本和关键词，并生成新的 plain object；它不静默修复 ID、owner 或重复关键词。选择手写轻量 validator 而不是增加 JSON Schema/runtime validation 依赖，是因为首版 descriptor 规模小、只由可信 Host source 注册，且项目要求优先复用现有依赖。若未来该格式成为外部 wire contract，应通过单独 change 引入版本化 schema。

### Decision 4：Registry 原子注册并输出按 ID 排序的不可变 snapshot

registry 内部维护 `action_id → { descriptor, executor }`。提供单个注册和批量注册入口；批量注册必须先完成全部验证、owner 检查和现有/批内重复检查，任一失败时不得留下部分注册结果。

公开查询只返回 descriptor：

- `get(action_id)` 返回不可变 descriptor 或无值；
- `snapshot()` 返回按 `action_id` 升序排列的深度不可变 descriptor 数组；
- snapshot 和 descriptor 与 caller 输入断开引用，调用方修改原始对象不得影响 registry。

executor 只能通过 dispatcher 的内部 registry lookup 取得，永远不进入 snapshot 或序列化。首版不提供 unregister 或 replace，避免在尚无 provider lifecycle 时定义不完整的动态一致性语义。

注册顺序不作为稳定顺序，因为未来插件加载顺序可能变化。按 ID 排序可以让测试、日志和后续搜索的默认 tie-break 稳定；搜索 change 仍可在该基础上定义自己的 ranking。

### Decision 5：Dispatcher 返回显式 result union，不向调用方抛出 executor 异常

dispatcher 接收无参数 `action_id`，在执行时重新读取当前 registration：

```text
LauncherActionDispatchResult =
  { ok: true, action_id }
  | {
      ok: false,
      action_id,
      error: {
        code: action_not_found | action_unavailable | action_execution_failed
        message: string
      }
    }
```

未知 action 返回 `action_not_found`；`enabled = false` 返回 `action_unavailable` 且不调用 executor；executor reject、throw 或返回无效结果时统一映射为 `action_execution_failed`。每次 dispatch 至多调用 executor 一次。公开 message 面向诊断但调用方只能依赖 code；内部异常对象、stack、Tauri window 和 Rust 类型不得进入公开结果。

成功结果不携带任意 payload，也不隐式隐藏 launcher。具体副作用由 action executor 拥有；因此 `hide_launcher` 自己执行隐藏，未来打开页面的 action 可以保留窗口。搜索 UI 是否在成功后清空 query 或改变选择留给后续 change。

备选方案是让 dispatcher throw exception；这会迫使每个 UI 消费者重复分类错误，因此不采用。把执行函数放进 descriptor 虽然简单，但会破坏序列化和扩展边界，也不采用。

### Decision 6：首个内建 action 复用现有 Rust `Hide`

默认 action source 注册：

```text
owner_id = lensx.core
action_id = lensx.core.hide_launcher
enabled = true
executor = desktopLauncherActions.hide()
```

Rust 新增最小 typed Tauri command `hide_launcher`。该 command 从 managed `LauncherWindowActions` 取得统一动作边界并 dispatch `LauncherWindowAction::Hide`，不得直接调用 `window.hide()`。失败映射为可序列化错误 `{ code, action, operation, message }`，字段使用 snake_case；TypeScript desktop adapter 将 invoke 成功/失败转换为 executor 的统一成功或失败。

command 不接收 caller 提供的 action ID，因此 Rust 不需要复制 TypeScript registry，也不会形成“任意字符串即可执行原生能力”的通用后门。未来新增 privileged action 必须显式增加或扩展受控 Host API，而不是自动信任 descriptor。

### Decision 7：默认 action service 有显式 composition factory，当前 UI 不消费

提供 `createDefaultLauncherActionService(desktopAdapter)`，在一个 factory 中创建 registry、注册内建 actions 并返回只读 registry/dispatcher interface。未来搜索 change 从 application composition root 注入该 service；当前 `App` 不读取 snapshot，也不显示 action。

这样可以通过 fake desktop adapter 完整测试 registry → dispatcher → executor 映射，同时保持本次没有表现层变化。Rust command 路由另由 Rust 单元测试验证，TypeScript Tauri adapter 由 mock invoke 测试验证；两层共同锁定跨边界 contract。

## Risks / Trade-offs

- [Risk] 在插件 Contract 之前定义 ID 规则可能与未来 provider ID 冲突。→ Mitigation：只定义通用 owner 前缀关系和可扩展 segment 数；插件 adapter 必须映射到该规则，插件 Manifest 细节留给独立 change。
- [Risk] TypeScript registry 与未来 Rust plugin manager 之间可能出现状态漂移。→ Mitigation：Rust manager 只作为 provider metadata 来源，唯一运行中 launcher registry 仍由 Host application service 持有；同步协议和 lifecycle 由后续 change 明确。
- [Risk] Descriptor 本地化数据可能与 message resources 漂移。→ Mitigation：内建 source 直接读取 canonical locale resources，locale schema/key parity 测试继续作为门禁。
- [Risk] `enabled` 是静态 snapshot，无法表达权限或上下文动态变化。→ Mitigation：首版只支持静态内建 action；未来 availability provider 需要独立设计，dispatcher 已保留执行时重新读取 registration 的边界。
- [Risk] 当前没有用户可见入口触发真实 action。→ Mitigation：以领域测试、adapter contract 测试和 Rust command 测试验证链路；搜索 UI 由下一 change 接入，不添加隐藏或 mock UI。
- [Trade-off] 首版没有 unregister/replace。→ 这避免提前定义插件热加载语义，但未来 provider lifecycle 必须扩展 registry API。

## Migration Plan

1. 建立 action descriptor、ID、localization、diagnostic 和 validation/normalization 模块。
2. 实现 atomic registry、immutable snapshot 和 dispatcher。
3. 添加内建 action locale messages、default source 和 service factory。
4. 在 Rust 暴露最小 `hide_launcher` command，并实现 TypeScript desktop adapter。
5. 补齐 TypeScript、Rust 和跨边界 contract 测试。
6. 更新英中文档镜像并执行完整验证。

本 change 不迁移用户数据、不改变现有 UI，也不改变窗口生命周期。如果实现尚未归档，可删除 action core 模块和 command 注册并恢复 locale resources；现有 launcher 输入和快捷键行为保持不变。

## Open Questions

无。action core 所有权、ID 规则、localized descriptor、registry 顺序、dispatcher 结果、首个内建 action 和本次非目标均已确定。
