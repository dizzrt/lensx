## Why

lensX 已经能够把兼容的 `.lxp` 安全安装到 Host-owned payload 目录，并由 Plugin Manager 维护唯一活跃指针，但当前 Host 页面仍不会读取插件 entry 或任何 package-local asset。若后续 iframe 直接接收普通文件路径或宽泛文件协议，插件资源请求将可能越过当前注册身份、版本目录与生命周期边界，因此需要先建立一个 Rust 控制的最小安全资源服务。

## What Changes

- 新增 Host-private 插件资源服务，通过单一 Tauri 自定义协议与不可猜测的 resource scope 提供当前已注册插件的资源，不暴露普通文件路径、安装根、包 digest 或通用文件读取能力。
- 由 Host 根据当前 Plugin Manager/Registry 事实派生插件身份、版本、runtime entry、registration revision 与唯一活跃 payload；调用方不能提交任意绝对路径、plugin ID、version 或安装目录作为授权事实。
- 对每个请求执行严格 URL/path 语法检查、逐段 no-follow 检查、canonical containment 验证与固定 MIME 白名单，拒绝绝对路径、父目录、编码逃逸、反斜杠、符号链接、跨插件资源和未知类型。
- 提供窄的 Host-private entry URL 查询契约及 TypeScript desktop adapter，供后续隔离 iframe Runtime 消费；该边界只返回当前 entry 的 scoped URL 与安全版本/修订事实。
- 第一版所有资源与错误响应使用不可持久缓存策略，并在 disable、incompatible/quarantine、replacement、uninstall 与进程重启后使旧 scope 失效；同 SemVer 不同 digest 的 reinstall 必须获得新 scope。
- 为成功读取、身份隔离、路径攻击、MIME/method、生命周期失效、请求竞态与信息泄漏建立 Rust 集成测试，并补充边界测试和英中双语架构文档。

### Goals

- 为 Task 4.2 提供可消费、可撤销、版本安全的插件 entry URL。
- 保证一个 resource scope 只能解析到它所绑定的当前 Host-owned payload 内。
- 让资源服务的错误、缓存和生命周期语义可测试、可恢复且不泄露 Host 私有事实。

### Non-goals

- 不创建或渲染 iframe，不执行插件代码，也不替换当前 Host-owned Plugin Page placeholder。
- 不建立 Runtime Session、`contentWindow`/origin/nonce 绑定、iframe transport、RPC 或 Host API。
- 不实现完整 CSP、权限授予/撤销、网络策略、插件间消息或签名信任。
- 不把 package-local icon 接入 Host UI，不内联或解析插件 SVG，也不提供通用文件、目录、Range、媒体流或下载服务。
- 不修改 `.lxp` package protocol、安装布局、Plugin Manager 持久化格式或现有 lifecycle/replacement 事务语义。

### User-visible impact

本 change 不会让插件 UI 立即可见；当前 Plugin Page 仍显示 Host-owned placeholder。用户可观察到的现有安装、启用、禁用、卸载和替换流程保持不变，本 change 为下一步隔离 iframe 加载提供安全基础。

## Capabilities

### New Capabilities

- `plugin-resource-service`: 定义 Host-private scoped URL 签发、受限插件资源响应、MIME/method 策略、生命周期失效、错误保密与集成验证要求。

### Modified Capabilities

- 无。现有安装、注册、页面导航、生命周期和替换规格保持原有要求；新资源服务只消费这些能力的当前事实。

## Impact

- **Rust/Tauri**：新增由 Tauri setup 管理的插件资源服务、自定义协议 handler、窄 entry URL command/contract，以及与 Plugin Manager 和现有 revision/lifecycle 事实的只读集成。
- **TypeScript**：新增 Host-private 资源 entry 查询类型、严格响应校验和 desktop adapter；不导出到 `@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-ui` 或 `@lensx/plugin-testkit`。
- **安全边界**：新增 opaque bearer resource scope；其权限仅限一个当前 payload 的只读资源，不能表示 Runtime 身份、权限 grant 或 Host API 会话。
- **依赖**：优先使用现有 Tauri、HTTP、路径与标准库能力；若需要新增 MIME 辅助依赖，必须固定版本、说明必要性并纳入依赖检查。
- **文档与验证**：更新 `docs/en/architecture/` 的 canonical 文档及对应 `docs/zh/` 镜像，并增加 focused gate 与完整前端/Rust 验证。
