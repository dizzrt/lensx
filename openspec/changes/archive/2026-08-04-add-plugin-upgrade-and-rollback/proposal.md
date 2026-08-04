## Why

当前本地安装器会安全完成首次 `.lxp` 安装，但相同 `plugin_id` 的任何后续包都会被统一拒绝，用户无法用本地包替换已经安装的插件。现在需要在不引入多版本管理、远程更新、签名系统或完整权限 UI 的前提下，补齐单活跃版本的安全替换事务，并保证提交前失败不会破坏当前可用版本。

## What Changes

- 新增 Host-private 的两阶段本地替换协议：先准备并检查候选包，再基于 opaque preparation token、目标 entry 和当前 revision 提交替换。
- 将同一 `plugin_id` 的候选包分类为重复安装、升级、降级或同版本重装；版本顺序只用于分类和展示，用户显式选择的兼容本地包可以替换为任意 SemVer 版本。
- 继续使用 `packages/<plugin-key>/<package-sha256>` sibling digest 目录，并将 Plugin Manager record 中的安装路径、digest 和 Manifest 作为唯一 active pointer。
- 在原子切换前撤销当前插件的 Action/Page surface；提交失败时恢复旧 surface，成功后按新 revision 收敛。
- 在替换时保留 Host source、enabled intent 和独立插件数据；grants 只保留仍被新 Manifest 请求的交集，新增权限不会自动授权。
- 将 Manager record 的原子替换定义为提交点：提交前失败删除候选并保持旧版本；提交成功后删除旧 payload，清理失败作为可恢复的 pending cleanup 处理而不回滚新版本。
- **目标**：提供单活跃版本、可并发防护、可崩溃恢复、最小披露且无需重启的本地包替换能力。
- **非目标**：不提供用户主动回滚、版本历史、多版本共存、远程更新、自动更新、Runtime 健康检测、插件数据迁移、完整管理 UI、权限授权交互、真实签名验证或 quarantine 修复。

## Capabilities

### New Capabilities

- `plugin-upgrade-and-rollback`: 定义任意版本本地包替换的分类、两阶段私有契约、原子 active pointer 切换、权限差异处理、surface 收敛、提交前失败恢复和成功后旧 payload 清理。

### Modified Capabilities

无。首次安装、现有 enable/disable/uninstall、Plugin Manager register 和 Registration read contract 的既有要求保持不变；新能力通过独立替换入口复用这些边界。

## Impact

- Rust：扩展本地安装器、Plugin Manager 原子 replacement、严格替换契约、Tauri setup/command、故障注入和启动恢复测试。
- TypeScript：新增 Host-private replacement adapter/service，复用 Registration revision 与现有 Plugin Surface Projection 的 quiesce/convergence 能力。
- 持久化：不升级 Plugin Manager record 形状；继续以单个 record 指向唯一 active digest，并让非 active canonical sibling 进入安全清理。
- 安全：不暴露源路径、安装路径、digest、Store key、包字节或原始错误；不把 Manifest 权限请求、Publisher 文本或本地来源转换为 grant、签名或可信 provenance。
- 文档与验证：更新中英文插件架构/包格式文档、Roadmap 当前基线和 Task 3.4 状态，并增加专用跨 Rust/TypeScript 验证门禁。
