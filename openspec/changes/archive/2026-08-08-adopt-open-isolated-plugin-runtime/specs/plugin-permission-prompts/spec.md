## REMOVED Requirements

### Requirement: Host permission interactions MUST separate trusted risk facts, author reasons, and authorization state
**Reason**: Manifest permission、Host catalog 与 grant state 被删除，Settings 不再展示虚假的权限 authority。
**Migration**: 安装/替换只展示候选身份、版本、Publisher 与安装信任说明；删除 permission presentation model。

### Requirement: Sensitive permissions MUST default off and receive individual explicit decisions
**Reason**: 当前平台不再定义 lensX sensitive permission 或逐项决定。
**Migration**: 删除单 permission confirmation 与 transient selection；Host 原生敏感能力保持未公开而非默认允许。

### Requirement: Installation and replacement grants MUST reuse existing per-permission authority after durable commit
**Reason**: durable commit 后不再存在 grant sequence。
**Migration**: 安装/替换成功后只收敛 Registration，不调用 permission service。

### Requirement: Settings MUST provide current, revision-bound per-permission grant and revoke
**Reason**: Settings grant/revoke authority 被删除。
**Migration**: 删除 permission rows、Modal、mutation、partial failure 与 revision convergence 分支，保留 lifecycle、replacement 和 data controls。

### Requirement: Insufficient Runtime permission MUST remain a stable restricted experience without plugin-driven automatic prompts
**Reason**: Runtime 不再产生 permission-denied Web 行为或 plugin permission prompt。
**Migration**: 普通 Web API 由浏览器结果表达；未公开 Host API 通过 closed catalog/incompatible/unavailable 表达，插件仍不能打开 Host-private UI。

### Requirement: Permission interactions MUST support both locales, themes, keyboard use, focus, and the fixed viewport
**Reason**: 权限交互界面被删除。
**Migration**: 删除对应 copy、视觉状态与 focus 流程；安装信任说明及剩余 Settings 操作继续满足双语、主题、键盘和可访问要求。

### Requirement: Permission prompt capability MUST remain Host-private and have a focused delivery gate
**Reason**: permission prompt capability 与 focused gate 被删除，不再保留不可达 dead code。
**Migration**: 聚合验证改为证明 permission authority 已不存在且开放 Runtime/Host isolation focused gate 完整覆盖替代边界。

