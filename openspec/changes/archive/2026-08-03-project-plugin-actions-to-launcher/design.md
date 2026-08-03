## Context

当前系统已经有三段彼此独立的能力：Rust Plugin Manager 持有 Host-owned 注册事实；Plugin Registration Desktop Adapter 通过完整 snapshot、按 entry detail 和 revision 失效通知向可信根应用提供只读恢复边界；Launcher Action Core 持有唯一运行时 Registry、统一搜索和 Dispatcher。当前没有把前两段连接到 Launcher 的 provider，也没有 provider 批量替换或注销语义。

规范化 Manifest Action 是纯作者数据，只包含插件本地 ID、本地化元数据、可选 package-local asset icon 和 Page-only target。Host 必须独立决定插件是否可投影、全局身份、enabled 状态和 executor。Task 2.3 发生在 Plugin Page Registry、安全资源服务、iframe Runtime 和权限系统之前，因此不能把这些后续能力隐式塞入本 change。

数据流如下：

```text
Plugin Manager
      │ Host-owned registration facts
      ▼
Registration snapshot + revision ──► eligibility / removal
      │
      └── read eligible entry detail at the same revision
                         │
                         ▼
              pure Plugin Action projection
                         │
                         ▼
        provider-scoped atomic Registry replacement
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       existing search       existing Dispatcher
                                      │
                                      ▼
                         injected Host Page opener
                         (production activation in Task 2.4)
```

## Goals / Non-Goals

**Goals:**

- 复用 Registration Adapter 作为唯一插件注册事实来源，不建立第二份可写插件状态。
- 将合格插件的全部 Manifest Action 确定性转换为现有 `LauncherActionDescriptor` 和 Host-owned executor。
- 为 Registry 增加 provider owner 受限、批次原子、可替换和可注销的生命周期能力。
- 对 disabled、incompatible、quarantined、消失、degraded 或无法验证的插件 fail closed，同时隔离单插件失败。
- 丢弃过期 revision 结果，使异步 detail 读取不能覆盖更新的注册状态。
- 保持现有搜索、Dispatcher、recent/pinned、i18n fallback 和 descriptor 校验语义不分叉。
- 为 Task 2.4 提供窄的 Page 打开依赖，同时在该依赖真正可用前不激活生产投影。

**Non-Goals:**

- 不增加 Plugin Manager 写 command，不实现 install、enable、disable、uninstall 或 upgrade。
- 不建立 Plugin Page Registry、动态 Page catalog、页面渲染或 iframe Runtime。
- 不提供插件资源 origin，也不把 package-local asset path 暴露为 URL、文件路径或 Host icon token。
- 不进行 permission grant/decision，不根据 `required_permissions` 或 `granted_permission_ids` 改变 Action 搜索可见性。
- 不改变 Manifest Schema、Registration wire contract、Plugin SDK、搜索评分、结果 UI 或 collections 持久化格式。
- 不赋予 official/builtin source 额外投影权限，也不消费 publisher 声明作为信任证据。

## Decisions

### 1. 投影层是可信 TypeScript application service

新增 Host 私有 Plugin Action projection service，依赖现有 `PluginRegistrationDesktopAdapter`、`LauncherActionRegistry` 和一个窄的可注入 Page opener。它不进入 `@lensx/plugin-contract`、`@lensx/plugin-sdk` 或插件 workspace，也不直接调用 Tauri 或持有 React state。

选择这一层是因为 Registration Adapter 已完成 Rust/Tauri payload 的 unknown 校验、revision 恢复和 detail cache 管理，而 Launcher Registry 本身也位于 framework-neutral TypeScript domain。另一个方案是在 Rust 中直接生成 Launcher descriptor，但会复制 TypeScript Registry 校验并引入新的跨边界 Action wire contract，予以拒绝。

### 2. snapshot 决定资格，detail 提供 Manifest，二者必须属于同一 revision

每次接收完整 snapshot 时，service 只把 `kind = registered`、`enabled = true`、`compatibility.lensx = true` 且 `compatibility.host_api = true` 的 entry 视为候选。quarantine、disabled、任一维度 incompatible、degraded availability 和已消失 entry 不读取 Manifest，并注销已知的对应 provider batch。

候选 entry 通过 adapter 的 `readDetail(entry_id)` 获取完整规范化 Manifest。detail 必须仍为 registered variant、entry identity 与 plugin ID 必须匹配候选 summary，并且 response revision 必须等于正在处理的 snapshot revision。service 记录最近观察到的 revision；任何 detail 返回前若出现更新 revision，旧结果直接丢弃，由较新完整 snapshot 重新收敛。

不用增量 event 内容构建投影，因为 Registration Contract 已将 event 定义为失效提示。另一个方案是维护 entry patch/tombstone，但会制造第二套顺序和恢复协议，予以拒绝。

### 3. 以单个 plugin owner 为原子与故障隔离单位

Registry 增加受信任的 provider-scoped complete-batch 操作。内部注册记录保存 Host-private provider owner；输入批次中的每个 descriptor 都必须满足 `descriptor.owner_id = provider_owner` 和既有 `action_id` 所有权规则。成功替换时，一次提交移除该 provider 旧批次并加入新批次；空批次表示注销。操作不得触碰其他 provider owner 的 Action。

Registry 对非法 replacement 保持整个调用前状态并返回确定性 diagnostics，这是原子 Registry 的一般保证。Projection service 收到 projection/registration 失败后，再以空批次注销该插件，从系统层面 fail closed。这样既不会留下半批新 Action，也不会在来源已无法验证时继续保留旧的可执行 Action。

原子单位不扩大到所有插件的整份 snapshot。单插件失败只撤下该插件，其他健康插件和 `lensx.core` Action 继续可用；首阶段插件变更频率低，不需要跨插件事务。

### 4. descriptor 映射保持纯数据和确定性

每个规范化 Manifest Action 按以下规则映射：

- `owner_id = manifest.plugin_id`；
- `action_id = manifest.plugin_id + "." + action.id`；
- `title`、可选 `description` 和 `default_keywords` 使用规范化值并保持 Action 所有权；
- `enabled = true`，因为只有当前合格插件会被注册；不合格插件通过注销表达不可用；
- Manifest `icon` 不进入 descriptor，UI 使用既有 generic Action fallback；
- Manifest target 仅用于 Host executor 闭包，不进入 descriptor、snapshot 或搜索结果。

投影函数消费已验证的 `NormalizedPluginManifest`，但仍把生成 descriptor 交给现有 Registry validation；这同时防止未来 Contract 与 Launcher identity 限制 drift。`contributes.launcher.default_action_id` 不改变注册集合、enabled、排序、搜索评分、recent 或 pinned。

另一个方案是把 package asset path 改写为 `{ kind: "host", token }`，但 Host token 表示应用内建图标，不能承载未建立 scoped origin 的插件资源，予以拒绝。

### 5. executor 由 Host 合成并只调用窄 Page opener

每个 Action executor 捕获冻结的 `{ owner_id: plugin_id, page_id: target.page_id }` 和全局 opening Action ID，并调用注入的 Host Page opener。Manifest 不能提供函数、route、URL 或 executor，Registry snapshot 继续只暴露 descriptor。

Task 2.3 通过 fake Page opener 验证 Dispatcher 对正确 target 的统一调用和失败收敛，但不扩展当前静态 `HostPageCatalog`。生产组合在 Task 2.4 提供能够预检 Plugin Page 的实现后才启动 Registration subscription 和 Action publication；在此之前默认 Launcher service 行为保持不变。

另一个方案是让 Task 2.3 同时增加动态 Page catalog，会越过 Task 2.4 的身份、父子关系、权限预检和错误 fallback 范围，予以拒绝。提前发布一个必然 `page_unavailable` 的 Action 也会制造已知失败体验，同样拒绝。

### 6. 统一搜索和 collections 无需 provider 分支

Projection 成功后，插件 Action 只存在于唯一 Registry snapshot 中。现有搜索自然应用同一 locale fallback、匹配、评分、排序和 result limit；Dispatcher 只按 `action_id` 查找 Host executor。recent/pinned 仍只存全局 Action ID，provider 注销后隐藏但不删除该 ID，重新投影同一稳定 Action ID 后可自然恢复。

不增加插件名称权重、source 分区、Marketplace 区块、默认 Action boost 或插件专用错误类型。投影 service 的初始化/刷新错误只产生安全 Host 诊断并撤下受影响 provider，不新增本 change 的用户可见文案或 UI。

### 7. 不新增依赖或跨语言协议

实现复用当前 TypeScript、Rstest、Contract types 和 Registration Adapter。Rust Plugin Manager、Tauri commands/events、fixtures 与 Store format 不改变；Rust 验证仍作为全量回归门禁执行。没有新 Runtime dependency、组件库、主题样式或 locale message key。

## Risks / Trade-offs

- **[普通 revision 刷新期间旧 eligible Action 短暂保留]** → snapshot 一旦表明插件不合格或消失就立即注销；仍合格的旧批次只保留到同 revision detail 成功替换，detail 失败则 fail closed。
- **[detail 异步返回覆盖新状态]** → 比较 snapshot/detail/latest revision，任何过期结果不得提交。
- **[单插件投影异常影响全局 Launcher]** → 以 plugin owner 为原子单位，失败只注销该 provider，保留其他 provider 和 Host built-ins。
- **[asset icon 暂时退化为通用图标]** → 明确省略不安全路径；Task 4.1 建立 scoped resource contract 后再单独扩展安全 icon 类型与 resolver。
- **[Task 2.3 完成后生产 UI 暂无可见变化]** → 保持生产激活依赖 Task 2.4，当前 change 交付可验证投影核心和 Registry 生命周期，不虚假宣称 Page 已可打开。
- **[Registry provider API 被可信代码误用]** → 校验 provider owner 与每个 descriptor 的 owner/action identity，拒绝跨 owner replacement，并以测试固定 `lensx.core` 隔离。

## Migration Plan

1. 在保持现有 `register`、`registerBatch`、snapshot 和 Dispatcher 行为的前提下，为 Registry 增加 provider complete-batch replacement/unregister，并补齐兼容回归测试。
2. 增加纯 Manifest Action mapper 和注入式 Page opener executor，验证 ID、metadata、fallback icon、无泄漏与 Dispatcher 行为。
3. 增加 revision-aware projection service，接入可注入的 Registration Adapter，覆盖 eligibility、refresh、stale result、fail-closed 和 destroy。
4. 暂不在 production service 启动 projection；更新英文架构文档及中文镜像，标明 Task 2.4 的激活条件。
5. Task 2.4 提供 Plugin Page Registry/navigation 后，复用本 service 完成 production composition，不修改搜索算法。

Rollback 时停止或不创建 projection service，并注销所有 plugin provider batch；现有 `lensx.core` Action、搜索、Dispatcher 和 persisted collections 无需迁移。新增 Registry API 没有持久化状态或 wire format，代码回滚不会遗留数据迁移。

## Open Questions

无。本 change 明确选择通用 fallback icon、Task 2.4 后生产激活、单插件原子批次和 fail-closed 刷新语义；安全资源 icon、Page 导航与权限决策留给各自后续 change。
