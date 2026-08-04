## 1. Replacement Contract Foundation

- [x] 1.1 定义独立版本的 Rust Plugin Replacement Contract，覆盖 prepare/commit/cancel 请求、`cancelled | duplicate | prepared | committed` 结果、`upgrade | downgrade | reinstall` 分类、permission diff、cleanup conclusion 和稳定安全错误。
- [x] 1.2 增加对应 TypeScript readonly 类型、从 `unknown` 严格解析器和共享 contract fixtures，覆盖未知字段、错误版本、非法 token/revision/identity、敏感字段披露与 deep-freeze。
- [x] 1.3 扩展 workspace boundary 和 packed public-package 测试，证明 replacement contract、desktop adapter、token 和 Host-private实现不能从 Contract、SDK、UI、Testkit、官方插件或示例插件导入。

## 2. Plugin Manager Atomic Replacement

- [x] 2.1 为 Plugin Manager 增加绑定健康 `entry_id` 与 `expected_revision` 的内部完整 record replacement，要求相同 `plugin_id`、合法 next facts、重新计算 compatibility并保持 Runtime `inactive`。
- [x] 2.2 保持现有 `register` 重复 identity 拒绝和 record v1 wire shape 不变，并让成功 replacement只提交一个新 revision和一个现有 Registration invalidation event。
- [x] 2.3 增加 Manager focused tests，覆盖 stale revision、unknown/quarantine entry、跨 identity candidate、无效 facts，以及 create/write/sync/atomic-replace 故障下旧磁盘记录、内存 snapshot、revision 和其他插件完全不变。

## 3. Bounded Package Preparation

- [x] 3.1 在 Rust installer 中实现 pathless local-file prepare，复用 capped immutable read、package inspection、compatible-only policy、受限 extraction 和同 plugin ID 校验，不复制 Manifest/package 规则。
- [x] 3.2 实现 duplicate、upgrade、downgrade、reinstall 的确定性分类；允许任意 compatible SemVer 方向，并将异常 record/path/digest/identity evidence 映射为 fail-closed 安全错误。
- [x] 3.3 实现进程内最多一个 opaque preparation，绑定 entry、expected revision、staging 和已检查 facts；支持新 prepare、cancel、失败和 destroy 清理，且 token 不跨重启恢复。
- [x] 3.4 增加 preparation tests，覆盖用户取消、invalid/incompatible/cross-plugin/quarantine、完全重复、升版、降版、同版本不同 digest、permission diff、并发 busy、替换 preparation 和崩溃 staging recovery。

## 4. Commit, State Transfer, And Cleanup

- [x] 4.1 实现 commit 时在共享 installation/lifecycle lock 内重新读取 Manager 和 canonical filesystem facts、校验 token/revision/staging 内容，并将候选原子移动到 sibling digest 后 flush。
- [x] 4.2 构造 next registration：继承 source、enabled intent 和 bounded diagnostics，保持 data subtree 不变，将 grants 收缩为旧 grants 与新 requested permissions 的交集，再调用 Manager atomic replacement。
- [x] 4.3 将 Manager replacement 定义为 durable commit point；提交前失败清理候选并保持旧版本，提交后安全 no-follow 删除旧 payload，删除失败返回 committed + `cleanup_pending` 而不切回旧 record。
- [x] 4.4 扩展同进程和启动 orphan recovery，使其重试删除不再由 active record 引用的 canonical sibling，同时对 symlink、异常名称、root escape、quarantine 或 ownership 冲突保留证据并阻止不安全写入。
- [x] 4.5 增加 installer/Manager 集成和故障注入测试，覆盖 extraction/rename/parent-sync/Manager persistence/event/cleanup 故障、进程退出边界、并发 install/enable/uninstall/replacement，以及 current payload和 plugin data 永不被误删。

## 5. Tauri Commands And Desktop Adapter

- [x] 5.1 注册 Host-private prepare/commit/cancel Tauri commands，复用原生单文件 `.lxp` picker和现有 managed Plugin Installer/Manager实例，不向 IPC 暴露路径、digest、Store key、包 bytes 或原始错误。
- [x] 5.2 实现 TypeScript replacement desktop adapter，严格校验所有 invoke success/error payload并保持 contract version、operation 和 committed revision 语义。
- [x] 5.3 增加 Rust command 和 TypeScript adapter tests，覆盖取消、prepared/duplicate/committed、cleanup pending、稳定错误映射、未知 payload、Tauri rejection 和 changed-event delivery loss。

## 6. Trusted Surface Coordination

- [x] 6.1 实现 Host-private Plugin Replacement Service：从当前 snapshot 校验 entry/revision，prepare 后按 Action→Page quiesce，quiesce/commit失败时 cancel并按原 revision恢复 Page→Action。
- [x] 6.2 在 durable commit 后主动 refresh 并等待 committed revision 的 Page→Action projection；post-commit convergence failure必须返回带 committed revision 的安全诊断、保持新 record并让 surface fail closed。
- [x] 6.3 增加 service/surface tests，覆盖 enabled、disabled、活跃 Page、Action/Page quiesce失败、stale revision、Rust pre-commit失败、成功 replacement、event loss 和 committed-but-not-converged 恢复。
- [x] 6.4 保持设置页完整管理/确认 UI 不在本 change 范围；通过 service integration test 证明 Task 6.1 后续可以消费 from/to version、分类和 permission diff，且本 change 不新增硬编码产品文案、主题样式或焦点流程。

## 7. Documentation And Dedicated Gate

- [x] 7.1 更新 `docs/en/architecture/extension-platform.md` 与对应 `docs/zh/architecture/extension-platform.md`，记录两阶段 replacement、任意版本语义、single active pointer、permission grant交集、提交点、失败恢复与明确非目标。
- [x] 7.2 更新 `docs/en/architecture/plugin-package-format.md` 与中文镜像，说明 package digest 在 replacement classification/identity中的职责，以及 package protocol仍不拥有 active pointer、签名或更新策略。
- [x] 7.3 更新 `plugin-roadmap.md` 的过期当前基线；仅在实现和专用/完整验证全部通过后标记 Task 3.4 完成，并保持远程更新、Permission Management、签名和管理 UI 的后续依赖边界。
- [x] 7.4 新增 `check:plugin-upgrade-and-rollback` 专用门禁，组合 contract/adapter/service tests、workspace/public-package boundaries、package/registration/lifecycle相关回归和 Rust focused tests，不执行发布或 fixture baseline rewrite。

## 8. Final Validation

- [x] 8.1 顺序运行 `pnpm run check:plugin-upgrade-and-rollback`、`pnpm run test`，确认 frontend/shared tests 与专用 replacement scenarios 全部通过。
- [x] 8.2 顺序运行 `pnpm run check`、`pnpm run typecheck`、`pnpm run build`，覆盖 Biome formatting/static checks、workspace boundaries、TypeScript 和所有 workspace build。
- [x] 8.3 顺序运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，修复本 change 引入的所有 Rust formatting、test、warning 和 static-check 问题。
- [x] 8.4 对任何失败先修复并重跑对应命令，然后重新顺序运行 8.1–8.3 的完整最终验证集；最后运行 `openspec validate add-plugin-upgrade-and-rollback --type change` 并确认所有任务、英文文档/中文镜像和 scope/non-goals 保持一致。
