## Context

lensX 当前只有 `home`、`search`、`page` 三个 App Shell presentation state。React 根据 query/active Page 派生 state，Rust 将它们映射为同一 `main` native Window 的固定 `650×320/480/600` logical size；Tauri 配置和稳定规格都把窗口描述为固定 650px 宽、全程不可调整。插件 Manifest `0.3.0` 的 Page 只有 identity、localized title、route、parent 和 icon，Page projection 不携带展示偏好，Plugin SDK/Host API 也没有窗口方法。

当前 Child WebView Runtime 已经提供需要的底层响应链路：React 声明 Host-owned slot，`ResizeObserver`、`window.resize` 和 scale factor 生成递增 presentation revision，Rust 只接受当前、合法、位于 native Window 内的 physical bounds。因而本 Change 不需要让插件获得 native API；只需让 Host 从严格 Manifest 得到 Page presentation，并在 native Window 上启用或禁止用户 resize。

这是一个跨 Contract、安装/Registration、React、Rust/Tauri、Child WebView、CLI/模板、ConfigLens 和文档的 breaking change。官方插件必须继续作为普通外部插件边界 consumer，不能因仓库位置获得硬编码尺寸、特殊 Runtime 或 Host trust。

## Goals / Non-Goals

**Goals:**

- 让每个插件 Page 独立声明期望 initial logical size 和是否允许用户调整。
- 让 Host 在 TypeScript、Rust、安装、Registration 和 native transition 每层严格验证同一 presentation 数据。
- 让 Home、Search、Host Page 保持 Host 固定、不可调整，并在插件 Page 关闭或切换时立即恢复。
- 让同一 current Page attempt 的 hide/restore 保留当前用户尺寸，让真实关闭后的 reopen 回到 Manifest initial size。
- 复用 revisioned slot 更新，使用户 resize、Retina scale 和显示器变化安全收敛到当前 Child WebView。
- 用 ConfigLens 的 `800×600`、`resizable: true` 和 `content/footer` 布局证明普通公共边界足够支持编辑器插件。
- 将当前严格 Manifest 升级到单一 `0.4.0`，并迁移所有维护 consumer、tooling、docs 和 evidence。

**Non-Goals:**

- 不提供 Plugin SDK/Host API 的 `setSize`、`resize`、`setResizable`、position、monitor、min/max、maximize、fullscreen、z-order 或 native handle 能力。
- 不允许插件 Runtime 消息、DOM 测量或内容数量成为 native Window presentation 输入。
- 第一版不把用户调整尺寸写入 Host preferences、plugin storage、browser storage、安装记录或任何持久化介质。
- 不支持 standalone plugin window、多插件窗口、多 Window ownership、后台隐藏 Runtime 或旧 iframe/Manifest 双路径。
- 不改变 ConfigLens 的单 Monaco model、Format、JSON-only Compact、Worker、安全限制或 ephemeral content 语义。
- 不新增依赖或组件库。

## Decisions

### 1. Page 使用严格 `presentation` 声明，Manifest 升级为单一 `0.4.0`

`contributes.pages[]` 增加可选对象：

```json
{
  "presentation": {
    "initial_size": {
      "width": 800,
      "height": 600
    },
    "resizable": true
  }
}
```

`presentation` 存在时必须同时包含 `initial_size` 和 boolean `resizable`，所有对象继续拒绝 unknown field 和 explicit `null`。尺寸是整数 logical pixels。Page 是声明位置，因为同一插件的不同 Page 可能有不同工作区，而插件级默认会丢失这种表达能力。

输入缺省时确定性规范化为 `initial_size: 650×600`、`resizable: false`。声明宽度的静态合法范围为 `320..=4096`，高度为 `180..=4096`；这些是协议 hard bounds，不是某个插件的预设尺寸。Host 打开 Page 时再把 initial size 和用户可调上限约束到当前显示器 work area，并在 monitor/scale 变化后重新建立安全约束。

Manifest 升级到 `0.4.0`，`0.3.x` 和更旧版本都分类为 incompatible，不做 alias、自动改写或 fallback。相同严格协议号不得代表“旧 Host 拒绝、新 Host 接受”的两套 Schema。仓库内 ConfigLens、示例、模板、fixture、CLI 和 Development Mode 同步迁移。

备选方案：

- 在 `0.3.0` 上增加 optional field。拒绝，因为 strict/versioned Contract 会让同一版本号对应不同 accepted inputs。
- 以 plugin ID 硬编码 ConfigLens `800×600`。拒绝，因为这会给官方来源创造不可复用的 Host special case。
- 让插件调用运行时 resize API。拒绝，因为会把 native Window authority、竞态和滥用面暴露给不受信任代码。

### 2. Presentation 从 author input 单向流入 Host-owned native transition

数据流固定为：

`Manifest input -> TS/Rust normalize -> installed Registration detail -> Page projection -> PageResolution -> trusted App Shell -> typed Tauri command -> native Window`

Normalized Page 总是携带完整 presentation；Page projection 克隆已验证值，禁止从 Action、route、Runtime Context 或插件消息覆盖。React 根据 resolved provider/page 派生四类 Host state：

- `home`：`650×320`、不可调整；
- `search`：`650×480`、不可调整；
- `host_page`：`650×600`、不可调整；
- `plugin_page`：validated initial size、validated resizable、Page/attempt identity。

Tauri command 使用 tagged payload 而不是裸 width/height 参数。Rust 再验证 variant、hard bounds、当前 Page binding 和 work area，且只有 `plugin_page` variant 可携带 author size/resizable。Plugin SDK、Host API catalog、Runtime Context 和 bridge payload保持无窗口方法、无 native bounds。

备选方案是在 React 内直接调用 Tauri Window setters。拒绝，因为 privileged transition、work-area clamp、错误字段和 rollback 应由 Rust 统一拥有。

### 3. Rust 以可回滚状态机原子应用 size、constraints 和 resizable

Rust surface coordinator 维护最后一次成功的 Host-owned presentation snapshot，但不把用户尺寸持久化。每次目标状态变化都先解析完整 native `Window("main")`，计算 effective logical size 和 native constraints，再通过单一序列队列执行。

为避免旧 max constraint 阻止更大目标或失败留下半状态，转换按受控顺序执行：

1. 读取/保留最后成功 snapshot 用于 rollback；
2. 临时 `set_resizable(false)`，阻止转换中用户继续拖动；
3. 放宽到 Host hard bounds，应用 effective size，并安装目标 work-area constraints；
4. 仅当目标是 `plugin_page` 且声明 opt-in 时 `set_resizable(true)`；
5. 所有步骤成功后提交 snapshot，失败则按反向安全顺序恢复最后成功状态并返回 stable safe error。

Home/Search/Host Page 的目标 constraints 和 size 始终覆盖前一插件状态。插件 A 到插件 B 的 transition 比较完整 Page presentation key，必须应用 B 的 initial size/resizable；不能只比较通用 `page` 字符串。Page close 返回 Home 的 native transition不等待 Child destroy，沿用 compare-current teardown 协调。

Manifest initial size 超过当前 work area 时，Host 等比无关地分别 clamp width/height 到可用矩形，并保证不低于 hard minimum；这是有效声明在当前设备上的安全适配，不回写 Manifest。无法取得合法 work area、无法解析 Window 或 setter/rollback 失败时返回不含 monitor/native 细节的稳定阶段错误，并保持或恢复最后完整状态。

### 4. 用户 resize 只改变当前 attempt 的易失 native state

当当前插件 Page 为 `resizable: true`，Tauri native Window 允许用户从边缘/角落调整。Host 不提供页面内 resize control，也不把 mouse delta、native size 或 Window handle发给插件。

同一 Page attempt 被 `Cmd+W`、focus loss 或全局快捷键语义 hide/restore 时，App presentation key 不变，surface coordinator 不重放 initial size；当前 native size 和 `resizable` 保留。真实 Page close、导航离开、disable、replace、upgrade、uninstall、development reload、explicit retry、Session fatal、Host reload、App teardown 或进程退出都终止 attempt；后续 open 重新应用 Manifest initial size。

用户 resize 不写入 preferences、Registration detail、plugin storage、browser storage 或 evidence。未来若增加“记住尺寸”，必须是独立 Host preference change，具有用户控制、版本和清除语义；不能把第一版的内存状态当作隐式持久化。

### 5. 复用 Host slot revision 链路同步 Child WebView

PluginRuntimeSlot 已同时观察 DOM slot 和 `window.resize`。本 Change 保留这条路径并扩充证据：每次 user resize、work-area clamp、scale factor、Page chrome 或 locale/theme 布局变化都从可信 Host DOM 计算 physical bounds、递增 revision，并对当前 attempt 串行 `updateSlot`。Rust 继续拒绝 stale、negative、non-finite、out-of-window 和 wrong-attempt bounds。

resize burst 可以合并中间 revision，但最终 revision必须收敛到最新 native content slot；旧 attempt 的 late update 对 replacement inert。窗口尺寸变化不得 reload document、重建 Session/Worker/model 或把用户内容写入 evidence。

### 6. ConfigLens 通过普通 Manifest dogfood，并采用两区插件布局

ConfigLens 的 `main` Page 显式声明 `800×600`、`resizable: true`。Host Page Context/close/avatar Header 保持不变；插件 document 不重复主标题。

插件 `<main>` 改为两区：flex `content` 占据剩余空间并让单 Monaco surface `width/height: 100%`，语义 `<footer>` 承载显式 language selector、状态、Format、Compact。diagnostics 作为 footer 的条件第二行并保持 bounded scroll/live semantics，因而正常状态最大化编辑器空间，错误状态仍可访问。继续使用 Semi Design controls、UnoCSS 仅处理简单布局、Less 处理 footer、诊断、主题和响应式语义。

ConfigLens 视觉证据以 `800×600` 为主要矩阵，并增加 Host hard-min、较大 user-resized、英文/中文、light/dark、长文案、focus、diagnostic 和 footer overflow 代表性案例。真实 macOS evidence证明边缘 resize、Monaco layout、same-attempt hide/restore size retention、close 后 `650×320` 且不可调整、reopen 回到 `800×600`。

### 7. 文档、模板和 CLI 显示默认与 opt-in，而不制造权限错觉

Framework-neutral 与 React/Semi 模板默认省略 `presentation`，得到 `650×600` fixed Page；至少一个维护示例展示显式 presentation。CLI `create` 生成 `0.4.0`，`validate/build/pack/inspect` 使用相同 Contract，machine output 只报告 bounded presentation classification，不输出 monitor、position 或 native error。

Canonical English developer docs 和路径一致的简体中文镜像解释 logical pixels、缺省行为、hard/work-area bounds、user-only resize、hide/restore 与 close/reopen 差异、无持久化、无 SDK/native authority。Development Mode 与 installed package 使用完全相同路径。

## Risks / Trade-offs

- [风险] Manifest `0.4.0` 使现有 `0.3.x` 包不兼容 → [缓解] 一次性迁移所有维护 consumer、fixtures、templates、ConfigLens 和 docs；诊断明确要求 rebuild/repack，不提供双协议隐式迁移。
- [风险] 较小窗口使 Host Header/关闭按钮或插件 footer 不可用 → [缓解] 使用 `320×180` hard minimum、work-area constraints、Header truncation/close accessibility 和 min-size visual/real macOS gates。
- [风险] 多显示器、Retina 或 work-area 变化使 logical/physical bounds漂移 → [缓解] Rust 使用 current monitor logical work area，Host slot用当前 scale factor生成 physical bounds，monitor/scale 变化重新约束并递增 revision。
- [风险] 快速 user resize 产生大量 native/slot 更新 → [缓解] 保持串行、revisioned、可合并中间状态的更新队列，并要求最终 latest-wins；不 reload Runtime。
- [风险] size、constraints、resizable 某一步失败留下可调 Home 或继承前一插件状态 → [缓解] 单一 Rust coordinator、最后成功 snapshot、阶段化 safe error、rollback 和多插件/close failure tests。
- [风险] 用户误以为拖动尺寸会永久保存 → [缓解] 文档明确 Page-attempt-only；reopen/restart 自动回到 Manifest initial size，不创建任何存储键。
- [权衡] 对大于当前屏幕的合法声明进行 runtime clamp，实际大小可能不同于作者请求 → [收益] 保证 Host Header和关闭路径可达，并支持不同显示器而不让作者控制 monitor。
- [权衡] ConfigLens error footer 可能在诊断状态减少 Monaco 高度 → [收益] 保留完整 accessible diagnostics，同时正常状态只有紧凑单行 footer。

## Migration Plan

1. 先建立 Manifest `0.4.0` TypeScript/Rust Schema、normalization、fixtures 和 incompatible `0.3.x` classification，迁移 Registration/package mirrors，不保留双路径。
2. 迁移 CLI、templates、examples、Development Mode、ConfigLens 和维护测试包，使仓库内不再产生或接受当前用途的 `0.3.x` Manifest。
3. 将 Page presentation 贯穿 projection/App，并实现 Rust surface coordinator、work-area constraints、resizable transition、rollback 与 frontend sequencing。
4. 扩充 Child WebView resize/scale/attempt tests，然后调整 ConfigLens `content/footer`、Manifest 和视觉矩阵。
5. 更新 canonical English docs、简体中文镜像和 stable-spec wording，清除旧 `0.2.0/0.3.0` 当前协议表述。
6. 运行 package/install/Development/Runtime/ConfigLens 和真实 macOS gates，再运行完整前端、Rust 与严格 OpenSpec validation。

升级后已安装的 `0.3.x` 包保持不可变字节但被分类为 incompatible，必须由作者使用 `0.4.0` rebuild/repack 后走普通 replacement；不自动修改包。既有 plugin-scoped user data 遵循当前 replacement policy，窗口尺寸本身没有迁移数据。

若实现阶段回滚整个 Change，必须同时回滚 Contract、所有维护 `0.4.0` consumer 和 native presentation coordinator；不能让 `0.3.0`/`0.4.0` 部分混用。已经生成的 `0.4.0` 包在旧 Host 上自然 incompatible，需要重新使用旧 Contract build，不做运行时降级。

## Open Questions

无。第一版已确定 Page-scoped declaration、`0.4.0` 单协议、`320×180` hard minimum、`4096` declared maximum、current-work-area runtime clamp、same-attempt transient retention、真实关闭后 reset，以及不持久化用户尺寸。
