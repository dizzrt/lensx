## MODIFIED Requirements

### Requirement: Isolated iframe MUST use the exact Host-fixed capability policy

插件页面 MUST 继续运行在一个 Host-created iframe 中，使用精确、不可由 Manifest 或插件消息选择的 sandbox、referrer policy、Permissions Policy 和 isolated origin。sandbox MUST 允许当前 package document 执行脚本并使用其真实独立 origin，同时继续阻止顶层导航、popup、未授权 auxiliary context、Host document replacement 和跨插件 DOM/storage 访问。

iframe policy MUST NOT 表达 lensX permission request、grant 或 Publisher/source 特权，也 MUST NOT 阻止由 `open-isolated-plugin-runtime` 声明支持的普通 Worker、网络、remote resource、Blob/Data、WASM 和 origin storage。浏览器/OS 设备 API 若未纳入支持基线 MAY 保持不可用，但该不可用状态 MUST NOT 被描述为 lensX grant decision。

#### Scenario: 开放 Web 插件加载
- **WHEN** 当前插件 iframe 加载并使用支持的开放 Web 能力
- **THEN** iframe 在 Host-fixed sandbox 和独立 origin 内运行，不读取 lensX grant
- **THEN** 插件不能删除父文档 sandbox、访问 Host DOM/Tauri 或共享另一个插件 origin

#### Scenario: 插件声明 sandbox 或权限策略
- **WHEN** Manifest 或 plugin message 尝试增加 sandbox token、Host bridge、top navigation、popup、shared origin 或 device permission
- **THEN** Host 忽略或拒绝该输入，继续使用固定 iframe isolation policy
- **THEN** official、external 与 development source 得到相同结论

### Requirement: Runtime feedback MUST be accessible, localized, and theme-compatible
Feedback/log/evidence MUST 不泄漏 legacy grant facts、blocked target 或 private Runtime data，且保持双语、主题、键盘与 focus。

#### Scenario: Runtime failure feedback
- **WHEN** current Runtime load/handshake/security failure
- **THEN** UI 显示 bounded localized code 且不显示 grant/permission state

### Requirement: Exactly one active Plugin Page iframe MUST exist only for the current Page lifetime
Single iframe lifecycle MUST 只由 Page/Registration/resource/generation/current attempt 驱动；grant change 不再是 mount/unmount 或 reuse 条件。

#### Scenario: unrelated facts change
- **WHEN** another plugin changes 而 current Page facts 不变
- **THEN** current iframe 保持且不比较 grant snapshot

### Requirement: Task 4.2 MUST leave later Runtime and Host API capabilities unimplemented
该历史 capability MUST 不独立交付 Session、SDK transport、Host API/native authority 或 background work；permission decision 已删除而非待交付。

#### Scenario: iframe capability 独立成立
- **WHEN** iframe gate 通过
- **THEN** plugin 可加载但不能仅凭 iframe 获得 Host API/native authority

## ADDED Requirements

### Requirement: Iframe lifetime MUST own every supported child execution context

当前 iframe MUST 是其 Dedicated Worker、网络活动、Blob URL 和浏览器 origin state 的唯一页面执行所有者。Host MUST 在 iframe attempt 结束前撤销 Session、Port 与 navigation lease，并 MUST 证明旧 child context 不能影响下一 attempt、另一个插件或 Host。

#### Scenario: 插件切换发生在 Worker 活动期间
- **WHEN** 当前插件仍有活动 Worker 时用户切换到另一个插件 Page
- **THEN** Host 先使旧 attempt terminal 并移除旧 iframe，再创建新 iframe
- **THEN** 任意观察时刻最多一个插件 Page attempt 拥有当前 Session 和导航租约
