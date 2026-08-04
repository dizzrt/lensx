## Why

lensX 已经能够持久化已安装插件并把符合条件的 Page/Action 投影到 Host Registry，但尚无受控的启用、禁用或卸载写入边界。Task 3.3 需要把用户的 enabled intent、当前应用表面的安全收敛、程序与数据清理以及崩溃恢复连接成一个 Host-owned 生命周期，而不是让调用方分别修改 Manager、Registry 和文件系统。

## What Changes

- 新增 Host-private Plugin Lifecycle Contract 与可信应用 service，提供带 revision 预条件的 `set enabled` 和 `uninstall` 操作、稳定结果/错误以及明确的幂等语义。
- 禁用或卸载时先 fail closed：按 Action 后 Page 的顺序撤销该 provider 的完整批次，由现有导航失效边界关闭活跃插件页面；持久化失败时从最后确认的完整 Registration snapshot 恢复投影。
- 启用时先原子提交 enabled intent，再从同一目标 revision 按 Page 后 Action 的顺序恢复合格表面；用户可见完成等待当前应用会话收敛。
- 保持 enabled intent、compatibility 和 quarantine 独立：不兼容插件可以保留启用意图但不能进入可执行投影，quarantine 不伪装成禁用或自动修复。
- 扩展 Plugin Manager，支持原子、可持久恢复的记录移除；no-op 不增加 revision，也不发布 changed event。
- 在现有 Host-owned 插件根下建立与不可变程序 payload 分离的按需数据边界，并为卸载定义显式 `retain_data | delete_data` 策略；默认保留数据。
- 让卸载与安装共享进程内及跨进程串行边界，并用 Host-private cleanup intent 恢复 Manager 已移除但程序或显式请求删除的数据尚未清理完成的状态。
- 卸载始终移除 Registration、grants 和 Manager diagnostics；Recent/Pinned 继续只保存 Action ID，禁用或卸载后隐藏而不自动删除。
- Publisher 文本、官方声明或 `source` 不自动创建生命周期豁免；生命周期能力取决于 Host 是否拥有可管理的安装记录和路径。
- **非目标**：不实现 Task 6.1 的完整插件管理列表/详情 UI，不实现 Runtime session 停止、升级/回滚/重装、权限授予或撤销、签名/可信 Publisher、Recent/Pinned 清理、公开插件 API 或通用事务平台。

## Capabilities

### New Capabilities

- `plugin-lifecycle-controls`: 定义 Host-private enable、disable、uninstall 命令与可信前端协调、revision/幂等语义、表面收敛、数据策略、cleanup recovery、诊断和范围边界。

### Modified Capabilities

- `plugin-manager`: 增加健康记录和可安全识别 quarantine 记录的原子移除、no-op/revision 规则以及移除失败后的原状态保留要求。
- `local-plugin-installation`: 扩展 Host-owned 安装根，增加独立插件数据边界、与生命周期共享的锁及 cleanup intent/orphan 恢复规则，同时保持 package payload 布局不变。

## Impact

- Rust/Tauri：Plugin Manager Store、Plugin Installer/lifecycle coordinator、共享锁、cleanup recovery、独立生命周期命令/错误/结果 contract、Registration changed event 发布与 setup/invoke wiring。
- React/TypeScript：Host-private lifecycle adapter/service、Registration revision 协调、Plugin surface projection 的显式 quiesce/recovery 接入及边界验证；不新增完整管理 UI。
- 持久化：现有 `packages/<plugin-key>/<digest>` 保持不变，新增独立 `data/<plugin-key>` 与受限 cleanup intent；所有真实路径继续只存在于 Rust Host。
- 测试：Rust 状态/故障注入/并发/重启恢复，TypeScript contract/projection/navigation/search/collections 协调测试，以及跨边界漂移 gate。
- 文档与规格：更新 extension platform、plugin package format 的英文文档及中文镜像，并同步受影响的稳定规格后再归档。
