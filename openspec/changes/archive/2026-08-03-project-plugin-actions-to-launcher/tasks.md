## 1. 扩展 Host Action Registry 生命周期

- [x] 1.1 为可信 provider complete-batch replacement/unregister 增加 Host 私有类型、provider owner 归属和确定性 diagnostic，保持现有单个/批量注册公共行为兼容。
- [x] 1.2 实现按 provider owner 原子替换完整 Action 批次和以空批次注销，确保非法、重复、跨 owner 或部分无效输入保留完整调用前状态，且不能触碰其他 provider executor。
- [x] 1.3 扩展 `tests/launcher-action-registry.test.ts`，覆盖成功替换、删除旧 Action、空批次注销、跨 owner 拒绝、重复/无效 replacement 回滚、built-in 隔离、冻结 snapshot 和 executor 不泄漏。

## 2. 实现 Plugin Action 确定性映射

- [x] 2.1 在 Host 私有 TypeScript application/domain 层增加纯 Plugin Action mapper，生成 `owner_id = plugin_id`、`action_id = <plugin_id>.<local_action_id>`、规范化本地化 metadata、`enabled = true` 和 Host-owned Page opener executor。
- [x] 2.2 明确省略 Manifest asset icon、Page target、route、permission facts、publisher/source 信任和 `default_action_id` 排名含义，并继续把生成 descriptor 交给现有 Launcher validation。
- [x] 2.3 为 mapper 和 Dispatcher 增加聚焦 Rstest，覆盖多 Action、零 Action、`en-US`/`zh-CN` metadata、Action 自有关键词、稳定全局 ID、generic icon fallback、无 target/executor 泄漏、正确 Page opener 参数及安全 execution failure。

## 3. 实现 revision-aware Plugin Action projection service

- [x] 3.1 增加可注入的 projection service，订阅现有 `PluginRegistrationDesktopAdapter` 完整 snapshot，按 entry 读取同 revision detail，并以 plugin owner 为单位提交完整 Registry replacement。
- [x] 3.2 实现 enabled/双维度 compatibility/quarantine/degraded/disappearance 资格过滤、未知或不合格 provider 注销、单插件 fail-closed 错误隔离，以及不包含路径、栈、原始异常或 Host 对象的安全诊断。
- [x] 3.3 实现串行收敛、snapshot/detail/最新观察 revision 比较、过期异步结果丢弃、重复 refresh 幂等处理，以及 unsubscribe/destroy 后不再提交 Registry 的生命周期语义。
- [x] 3.4 增加受控 fake Registration Adapter 集成测试，覆盖空 snapshot、健康 builtin/external 等价投影、disabled/incompatible/quarantine/degraded/消失、detail identity/revision 不匹配、读取失败、replacement 失败、快速连续 revision、listener 恢复、Launcher activation 和 destroy。
- [x] 3.5 为默认 Launcher Action service 提供 Task 2.4 可复用的窄 Page opener/projection 组合入口，但保持当前 production composition 不启动 Plugin Action publication，并以回归测试确认现有 `lensx.core` Action、搜索、Dispatcher 和 collections 行为不变。

## 4. 专用门禁与维护文档

- [x] 4.1 增加 `check:plugin-action-projection` 根级聚焦门禁，组合 Registry、projection、Registration Adapter、统一搜索/Dispatcher/collections 和 workspace boundary 相关测试，且不新增 Runtime dependency。
- [x] 4.2 更新 `docs/en/architecture/overview.md` 与 `docs/en/architecture/extension-platform.md`，说明已交付的 provider replacement、投影映射、revision/fail-closed 生命周期、fallback icon 和 Task 2.4 后生产激活边界。
- [x] 4.3 同步更新对应 `docs/zh/architecture/overview.md` 与 `docs/zh/architecture/extension-platform.md`，保持标题、语义、示例和未实现限制与英文文档一致；本 change 无新增 UI、主题样式或用户文案，因此无需新增 locale key 或视觉验收。

## 5. 最终验证

- [x] 5.1 顺序运行 `pnpm run check:plugin-action-projection`、`pnpm run check:plugin-registration-contract` 和 `pnpm run test`，确认聚焦边界、Registration/Rust drift gate 与完整 frontend/workspace 测试通过。
- [x] 5.2 运行 `pnpm run format` 后运行 `pnpm run check`，确认 frontend、共享 package、Biome 静态检查和 workspace boundary 无 warning 或 error。
- [x] 5.3 顺序运行 `pnpm run typecheck` 和 `pnpm run build`，确认根应用及全部 workspace member 类型检查和生产构建通过。
- [x] 5.4 运行 `pnpm run src-tauri:format:check`，确认 Rust 格式检查通过；本 change 不计划修改 Rust，但 Registration Contract 与跨层回归仍需要该门禁。
- [x] 5.5 顺序运行 `pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，确认完整 Rust workspace 测试与静态检查通过。
- [x] 5.6 运行 `openspec validate project-plugin-actions-to-launcher --type change`；修复本 change 引入的每个 warning/error 后，重新运行失败命令及 5.1–5.5 的完整最终验证集合，并记录全部结果。
