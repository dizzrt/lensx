## 1. CI 命令基础

- [x] 1.1 为 LensX 前端和 Rust 增加可本地复现的 LensX-only CI scripts，覆盖格式/静态检查、类型检查、测试和构建，同时保持现有根级全 workspace lifecycle 语义不变。
- [x] 1.2 提取或扩展 workspace discovery，使 plugins-only 入口能够稳定枚举 `plugins/*` 的全部直接插件，并为全插件选择与空集合成功 no-op 增加测试。
- [x] 1.3 实现 plugins-only 依赖准备：从 workspace graph 计算插件需要的公共 package、按拓扑顺序生成公开 `dist`，且不依赖预热输出、源码别名或 Host/Tauri 私有源码；为依赖顺序、失败传播和 clean-output 场景增加测试。
- [x] 1.4 实现每个直接插件的阻塞式 `typecheck`、`test`、`check`、`build`、`test:e2e` 以及声明时的 `visual` 调度，并测试缺失必需 script、命令失败和视觉失败均使入口失败。

## 2. 两条 GitHub Actions workflow

- [x] 2.1 新增 `.github/workflows/lensx-ci.yml`，在 pull request 与 `main` push 的非纯插件改动上使用 macOS runner 运行 LensX 前端和 Rust 必需校验，并配置只读权限、固定 SHA action 与 concurrency。
- [x] 2.2 新增 `.github/workflows/plugins-ci.yml`，仅由 `plugins/**` 或自身 workflow 改动触发，在 macOS clean runner 上准备公共依赖并验证全部直接插件；视觉阶段必须无窗口运行、使用新临时 profile，并在成功或失败后优雅关闭和清理。
- [x] 2.3 增加新的 workflow policy 测试，精确断言两文件 inventory、pull request/`main` 路径矩阵、macOS runner、`contents: read`、固定 action SHA、必需 CI 入口及无发布 authority；覆盖非法第三条 workflow、写权限和发布步骤的失败用例。

## 3. 自动发布能力退役

- [x] 3.1 删除 `desktop-rust-check.yml`、`official-plugin-pr.yml`、`official-plugin-version.yml` 与 `official-plugin-candidate.yml`，不保留兼容 workflow、转发 job 或旧 check 名称。
- [x] 3.2 审计 `scripts/official-plugin-release*`、根 package scripts 及其测试，把仍被 Plugins CI 需要的纯验证逻辑迁移到中性 CI 入口，并删除只服务于 Changesets 版本 PR、candidate handoff、发布 environment、tag、GitHub Release API 和旧 workflow policy 的入口与断言。
- [x] 3.3 更新插件开发模式、无双 Runtime 和其他聚合 gate，使其检查新的两-workflow 模型而不要求旧发布文件存在；增加活动代码/测试扫描，禁止旧 workflow 名称和自动发布双路径回归。
- [x] 3.4 检查 roadmap、Changesets 配置和残留 release sidecar 引用，仅删除或修正把已退役 GitHub 发布自动化描述为现行能力的内容，不改变插件 Runtime、安装包或公开 Host 协议。

## 4. 文档与规格一致性

- [x] 4.1 新增 canonical English CI 维护文档，说明两条 workflow 的触发矩阵、完整校验集合、本地复现、clean dependency build、失败恢复、macOS-only 限制和不支持自动发布的边界。
- [x] 4.2 在相同相对路径新增简体中文镜像并同步更新 `docs/en/index.md` 与 `docs/zh/index.md`；删除或改写旧官方发布文档，确保两种语言语义一致且不再宣称版本 PR、candidate、tag 或 GitHub Release 自动化可用。
- [x] 4.3 核对本 change 的 proposal、design、`repository-continuous-integration` ADDED delta 与 `official-plugin-release-pipeline` REMOVED delta，确保实现后的命令、文件名和触发矩阵一致；为归档时新增新稳定 capability、删除旧稳定 capability 保留明确同步证据。

## 5. 聚焦验证

- [x] 5.1 运行 workspace discovery、依赖排序、plugins-only lifecycle 和 workflow policy 的聚焦测试，修复所有失败与新增 warning 后重跑聚焦集合。
- [x] 5.2 在不含预构建 `dist` 的新临时 checkout/worktree 中执行 frozen install 和完整 Plugins CI 入口，证明公共 package 按顺序生成、全部直接插件通过检查/测试/构建/E2E/适用视觉门禁，且不复用仓库根 `node_modules` 作为消费者环境。
- [x] 5.3 在批准的 macOS 执行上下文运行任何会直接或间接启动浏览器的门禁，使用全新临时 profile、headless/windowless 参数、优雅关闭和清理；若仅受 sandbox 阻止，保持命令不变在允许环境重跑，不弱化或跳过视觉证据。
- [x] 5.4 解析两条 workflow YAML 并运行可用的 actionlint/仓库策略检查，确认目录只剩目标两文件、所有 runner 为 macOS、第三方 action 固定 SHA、权限只读且无 release mutation。

## 6. 最终验证

- [x] 6.1 运行 LensX CI 的完整本地入口，并单独确认前端 `app:test`、`app:check`、`app:typecheck` 与 `app:build` 全部通过。
- [x] 6.2 运行 Rust `src-tauri:format:check`、`src-tauri:test`、`src-tauri:check` 和 workspace build，修复所有失败与 warning 后重跑 Rust 全集。
- [x] 6.3 运行 Plugins CI 的完整本地入口，确认每个 `plugins/*` 直接成员均通过必需 lifecycle、`test:e2e` 与适用视觉门禁。
- [x] 6.4 运行根级 `pnpm run test`、`pnpm run check`、`pnpm run typecheck` 与 `pnpm run build`，确认保留的全 workspace 开发入口没有回归。
- [x] 6.5 运行中英文文档镜像/链接检查、旧 workflow 与自动发布活动引用扫描，并执行 `openspec validate simplify-github-actions-to-project-and-plugin-ci --strict`。
- [x] 6.6 修复最终验证中出现的每个错误与 warning，先重跑失败命令，再重跑 6.1 至 6.5 的完整最终验证集合并记录结果。
