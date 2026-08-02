## 1. 建立 pnpm Workspace

- [x] 1.1 增加仅包含 `packages/*`、`plugins/official/*` 与 `examples/plugins/*` 的 pnpm workspace 配置，确认根 `lensx` package 继续保持 private，且当前静态 Manifest 示例不被误识别为 workspace package。
- [x] 1.2 将根应用现有 build、typecheck、test 与 check 逻辑拆为不会递归的 app-only scripts，并让标准根命令聚合执行根应用和全部 workspace 成员；保留 dev、preview、Tauri 与 `src-tauri:*` 命令的现有语义。
- [x] 1.3 为聚合入口增加成员 script 完整性与失败传播验证，证明空成员区域仍验证根应用、缺少任一必需 lifecycle script 会失败，且成员命令失败不会被根命令吞掉。

## 2. 强制依赖边界

- [x] 2.1 使用现有 Node/TypeScript 工具链实现确定性的 workspace 边界检查，覆盖成员位置、package manifest 依赖、相对/alias 模块解析、Host 私有入口、内部样式、`@tauri-apps/*` 与跨成员相对源码导入，并输出文件、引用和稳定规则标识。
- [x] 2.2 增加仓库自有正反 fixtures 与测试，分别证明公共 package export 导入被接受，而 Host 私有导入、Tauri 导入、跨成员相对导入、非法 package 依赖和缺失 lifecycle script 被拒绝。
- [x] 2.3 暴露独立的 `check:workspace-boundaries` 和适用的测试命令，将边界检查接入标准根 `check`，并验证官方插件与示例插件使用同一规则集。

## 3. 安装状态与双语文档

- [x] 3.1 使用 `package.json` 声明的 pnpm 版本更新 lockfile workspace importer 状态，确认没有无关依赖升级，并验证全新 workspace 安装能够复现。
- [x] 3.2 更新适用的 `docs/en/` 工程文档，说明 workspace 布局、根聚合命令、四个成员 lifecycle scripts、允许依赖方向和禁止的 Host/Tauri 导入，同时明确 workspace 不代表插件 Runtime 已实现。
- [x] 3.3 更新 `docs/zh/` 相同相对路径的简体中文镜像，并检查英文与中文索引、标题和语义保持一致。

## 4. 最终验证

- [x] 4.1 运行 `pnpm install --frozen-lockfile`、workspace 边界检查及其正反测试、`pnpm run test`、`pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`，确认标准根命令覆盖根应用与全部实际 workspace 成员。
- [x] 4.2 虽然本 change 不修改 Rust 产品逻辑，仍因仓库级命令与安装结构变化运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，证明 Tauri/Rust 行为未回归。
- [x] 4.3 检查 `docs/en/` 与 `docs/zh/` 相对 Markdown 路径、索引链接和语义镜像，确认文档未把 workspace 基础描述成已交付的插件安装或 Runtime 能力。
- [x] 4.4 修复本 change 引入的每个 warning 或 error，重新运行失败命令，然后重新运行 4.1 至 4.3 的完整最终验证集并记录结果。
