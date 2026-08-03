## 1. 建立 Plugin Manager 状态模型

- [x] 1.1 新增 Host 私有 Rust Plugin Manager 模块，定义 normalized Manifest、Host registration facts、derived compatibility、quarantine stub、瞬时 `inactive` Runtime 状态和 manager-level recovery report 的分层类型与不变量。
- [x] 1.2 定义 version 1 持久化 record、确定性安全 record key、带算法标签的包摘要、Host-controlled source、enabled intent、默认空且排序去重的 grant snapshot，以及稳定安全的诊断 code/phase/message。
- [x] 1.3 实现有界诊断保留和 Host 状态转换校验，保证第 33 条诊断淘汰最旧项、重复 identity 或无效 replacement 不改变已有状态。
- [x] 1.4 复用当前 Manifest 兼容性事实源，在构造和恢复健康记录时按当前 lensX/Host API 版本派生 compatibility，且不持久化旧 Runtime session 或 compatibility 结论。
- [x] 1.5 添加纯 Rust 状态模型测试，覆盖作者/Host 分层、空 grant、identity 冲突、诊断上限、Host 版本变化、enabled/quarantine 独立性和 Runtime 恢复为 `inactive`。

## 2. 实现逐插件持久化与恢复

- [x] 2.1 在 Tauri 应用配置目录下实现 Plugin Manager 专用 Store，使每个插件使用独立的 version 1 JSON 记录，并忽略不完整的临时文件。
- [x] 2.2 实现同目录唯一临时文件、完整写入、刷新和原子替换流程；只有持久化成功后才发布内存 next state，失败时清理临时文件并保留原状态。
- [x] 2.3 实现空 Store、健康记录和多记录启动恢复，校验 record key、format version、normalized identity 与 registration 不变量。
- [x] 2.4 将无法解析、未知版本、identity mismatch 和不一致的单条记录恢复为带稳定诊断的 quarantine stub，保留原文件并继续恢复其他健康记录。
- [x] 2.5 将 Store 目录整体不可读映射为 degraded 空健康集合和 manager-level 安全诊断，不 panic、不覆盖原数据。
- [x] 2.6 添加 Store 与恢复 Rust 测试，覆盖 round trip、两个插件隔离、原子替换、各写入阶段失败、残留临时文件、单条损坏、未知版本、identity mismatch、目录不可读和 quarantine replacement。

## 3. 接入 Tauri Host

- [x] 3.1 在 Tauri setup 中解析 `app_config_dir`、恢复线程安全 Plugin Manager 并通过 `app.manage(...)` 注册同一实例，同时保留恢复报告供 Host 内部后续消费。
- [x] 3.2 验证本 change 不新增 `invoke_handler` command、TypeScript registration payload、前端管理 UI、Action/Page 投影、安装流程或插件执行路径。
- [x] 3.3 添加 Tauri Host 初始化测试，覆盖首次空启动、恢复成功和 degraded 恢复均能完成 managed state 初始化。

## 4. 更新维护文档

- [x] 4.1 更新 `docs/en/architecture/extension-platform.md`，说明 shipped Plugin Manager 的分层状态、逐插件持久化、兼容性重算、quarantine 恢复和 Host 私有边界。
- [x] 4.2 同步更新 `docs/zh/architecture/extension-platform.md`，与英文规范语义一致，并继续明确 Registration Contract、安装、Runtime、权限和 UI 尚未交付。
- [x] 4.3 检查双语文档没有把 Host-owned source、publisher、requested permissions 或官方 provenance 描述为信任或自动授权依据。

## 5. 最终验证

- [x] 5.1 运行 `openspec validate add-persistent-plugin-manager --type change`，修复所有 change artifact 错误。
- [x] 5.2 运行 `pnpm run test`，验证完整前端与 workspace 测试；虽然没有新增前端功能，仍确认 Host 初始化未破坏现有行为。
- [x] 5.3 运行 `pnpm run check`，完成前端/workspace 格式与静态检查。
- [x] 5.4 依次运行 `pnpm run typecheck` 和 `pnpm run build`，验证完整前端与公共 package 类型和构建边界。
- [x] 5.5 运行 `pnpm run src-tauri:format:check`，验证 Rust 格式。
- [x] 5.6 运行 `pnpm run src-tauri:test`，验证 Plugin Manager、Store、恢复、Tauri 初始化和现有 Rust 测试。
- [x] 5.7 运行 `pnpm run src-tauri:check`，验证 Rust 静态检查且无新增 warning。
- [x] 5.8 修复本 change 引入的每个 warning 和 error，重跑失败命令，再依次重跑 5.1–5.7 的完整最终验证集。
