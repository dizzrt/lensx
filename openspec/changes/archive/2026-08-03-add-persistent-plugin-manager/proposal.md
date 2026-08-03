## Why

当前 lensX 已能在 TypeScript 与 Rust 中校验并规范化插件 Manifest，但 Host 还没有统一保存、恢复和诊断插件注册状态的可信核心。后续 Registration Contract、Action/Page 投影、本地安装、Runtime 与权限管理都需要先共享同一个 Rust Plugin Manager，且任一插件记录损坏时不能阻止应用启动。

## What Changes

### 目标

- 在 Rust 中新增由 Tauri managed state 持有的 Host 私有 Plugin Manager。
- 将已验证的 normalized Manifest 与安装位置、包摘要、来源、启用意图、权限授权快照、隔离状态和诊断等 Host-owned registration facts 分层保存。
- 采用版本化、逐插件隔离、原子替换的持久化记录，并在启动时独立恢复每条记录。
- 启动恢复时根据当前 lensX 与 Host API 版本重新计算兼容性；不把旧的兼容结论当作永久事实。
- 将损坏、未知版本或不一致的单条记录转为可诊断的 quarantine stub，同时继续恢复其他插件。
- 为注册、启用意图、隔离、恢复和失败原子性建立 Rust 状态转换测试。
- 更新英文插件架构文档及其简体中文镜像，说明已交付的 Plugin Manager 边界和仍未实现的能力。

### 非目标

- 不定义 Rust、Tauri 与 TypeScript 共享的 Plugin Registration Contract、命令 payload、事件或前端管理界面；这些属于 Task 2.2 及后续任务。
- 不投影插件 Action/Page，不改变 Launcher Registry、搜索、Dispatcher 或导航。
- 不发现、解包、安装、启用、禁用、卸载、升级或执行真实插件包。
- 不建立 iframe、Runtime Session、Host API、权限目录、授权决策或权限检查。
- 不根据 Manifest publisher 或官方来源推导信任、自动授权或生命周期豁免。

### 用户可见影响

- 本变更不新增直接面向用户的界面或可操作插件流程。
- 应用内部将具备可跨重启恢复、且单插件损坏不会阻止启动的注册状态基础，为后续插件能力提供一致事实源。

## Capabilities

### New Capabilities

- `plugin-manager`: 定义 Host 私有 Plugin Manager 的状态分层、逐插件持久化、启动恢复、兼容性重算、quarantine 容错、诊断保留和原子状态转换要求。

### Modified Capabilities

- 无。

## Impact

- Rust/Tauri：新增 Plugin Manager、持久化 store、版本化记录、恢复报告与 managed state 初始化；复用当前 Rust Manifest 规范化和兼容性事实源。
- 测试：新增纯 Rust store、恢复和状态转换测试；现有 Manifest 跨语言 fixture gate 保持不变。
- 文档：更新 `docs/en/architecture/extension-platform.md` 及对应的 `docs/zh/` 镜像。
- 公共边界：不新增前端 API、Tauri command、公共 package 或 Runtime 依赖；后续 Task 2.2 将在本核心之上定义稳定序列化边界。
