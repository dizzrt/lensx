## 1. 建立迁移基线

- [x] 1.1 生成并评审根 `package.json` scripts、递归 script/Gate 调用、Rstest 文件选择、Cargo filters、构建/pack/consumer、visual/macOS evidence、CI 和维护文档/spec 引用的完整清单，记录每个现有入口的调用方和验证阶段。
- [x] 1.2 为每个 maintained 入口分配标准 lifecycle、稳定 capability Gate、Generate 或 Evidence ID，明确应迁入 Rstest、保留为跨层 step 或删除为 Change-specific/转发/重复入口，并建立可自动比较的新旧覆盖映射。
- [x] 1.3 定义根 script policy 的初始允许集合和每个保留入口的长期仓库级理由，确认 policy 不使用任意数量阈值且不把历史脚本整体加入永久豁免。

## 2. 实现统一 Validation Dispatcher

- [x] 2.1 实现仓库私有的类型化 Gate registry，支持稳定 Gate/step ID、描述、结构化 executable/argv/cwd/environment、Gate 依赖和浏览器/平台/只读安全元数据，不引入新的产品运行时依赖。
- [x] 2.2 实现统一 Gate CLI 的 list、plan 和 execute 路径，在启动命令前验证未知/重复 ID、缺失依赖和循环，按确定性拓扑顺序展开 DAG、按 step ID 去重、默认串行执行并传播可定位的非零失败。
- [x] 2.3 实现受治理的 Generate 与 Evidence dispatcher，使目标可列举、写入必须显式请求、只读 Gate 永不覆盖 committed artifact，并保留现有 macOS/browser 超时、批准上下文、临时状态和清理边界。
- [x] 2.4 为 registry/runner/dispatcher 增加 Rstest 覆盖，包括空计划、正常拓扑、共享依赖去重、稳定顺序、未知依赖、重复 ID、循环、环境/cwd 传递、命令启动失败、非零退出和禁止隐式 evidence 写入。

## 3. 将测试和策略检查归位

- [x] 3.1 将无外部副作用且只读取仓库状态的 maintained `scripts/check-*.ts` 策略、文档和漂移断言迁入现有 Rstest discovery 范围，保留需要生成、构建、安装、浏览器、Cargo 或原生系统服务的逻辑为 registry steps。
- [x] 3.2 实现 root-script policy Rstest，用语义允许集合拒绝 Change-specific、纯测试子集、转发和未评审的长跨层 root scripts，并验证 active/archive OpenSpec Change 不与根入口同名。
- [x] 3.3 实现 Gate graph、no-dual-entry 和文档命令 Rstest，验证 Gate/step 唯一性与无环性、稳定 capability 命名、所有 maintained 文档 Gate ID 可解析、旧命令无残留且 policy tests 本身没有专用根 script。
- [x] 3.4 更新已有 workspace lifecycle/boundary 测试与 fixtures，证明所有成员仍声明并执行 `build`、`typecheck`、`test`、`check`，focused Gate 迁移不会跳过根应用或成员 lifecycle。

## 4. 迁移现有跨层验证和调用点

- [x] 4.1 按基线映射把 maintained Contract、SDK、Testkit、UI、安装、Runtime、Session、RPC、Development Mode、ConfigLens、CI、visual 和 macOS evidence 组合登记为稳定 capability Gates/steps，并用自动比较证明新计划未遗漏旧 Rstest、Cargo、构建、pack、consumer、visual 或 evidence 阶段。
- [x] 4.2 将根 manifest 收敛为标准 lifecycle、必要内部 lifecycle、稳定运维入口及单一 Gate/Generate/Evidence dispatchers，删除被替代的 `test:*`、`check:*`、`run:*`、`refresh:*`、Change-specific、转发和长 `&&` 编排，不保留兼容 alias。
- [x] 4.3 迁移 GitHub Actions、workspace/internal scripts、package consumer、开发命令和其他代码调用点到稳定 dispatcher ID，保持现有 macOS-only CI、pnpm global-store 和无用户浏览器会话规则。
- [x] 4.4 将 RPC focused validation 迁移到 `plugin-rpc-validation` Gate，并验证其 Contract、SDK、Host adapter、Dispatcher、storage、MessageChannel、workspace、tarball 和 bounded macOS evidence 覆盖及零意外 Handler/effect 语义不变。
- [x] 4.5 运行旧 root script、Change ID、直接 Rstest 文件列表、递归 `pnpm run check:*`、shell `&&` 和失效文档命令扫描，修复所有残留并确认只有统一 dispatcher 能启动 migrated validation。

## 5. 固化 Agent、OpenSpec 和双语文档治理

- [x] 5.1 更新根 `AGENTS.md`，用简短强制规则声明根 package scripts 是受治理接口、禁止 per-test/per-Change 入口、优先 Rstest discovery、跨层验证必须进入稳定 Gate registry、归档前必须清理临时入口，并链接详细 validation 文档。
- [x] 5.2 更新 `openspec/config.yaml` 的 proposal/design/tasks/同步归档约束，要求复用或设计稳定 capability Gate、禁止 Change ID root script、记录适用完整验证，并在同步/归档前执行陈旧入口和文档引用检查。
- [x] 5.3 更新 `docs/en/development/validation.md` 与 `docs/zh/development/validation.md`，完整说明 test/check/Gate/Generate/Evidence 分工、CLI、DAG/去重/失败语义、只读与写入边界、focused 与完整验证关系及浏览器/macOS 安全。
- [x] 5.4 更新 `docs/en/development/plugin-workspace.md` 与 `docs/zh/development/plugin-workspace.md`，说明成员四 lifecycle scripts 与根稳定 script surface 的边界；同步迁移其他 English/Chinese maintained docs 中的旧 focused commands，保持路径、标题、索引和语义一致。
- [x] 5.5 核对 `validation-gate-governance`、`plugin-platform-workspace` 和 `plugin-rpc-validation` delta specs 与实现/文档一致，确保所有未来进入 stable specs 的内容在同步或归档前改写为 English。

## 6. Focused 验证

- [x] 6.1 运行 Gate registry/runner、root-script policy、workspace lifecycle/boundary、no-dual-entry 和文档引用的 focused Rstest，修复失败并重跑。
- [x] 6.2 运行统一 CLI 的 list/plan 和 validation governance Gate，核对输出稳定、共享 step 去重、只读语义、失败诊断和根 manifest policy。
- [x] 6.3 运行每个 migrated maintained Gate 至少一次并与基线阶段清单核对；任何直接或间接启动 Chrome/macOS `.app` 的 Gate 必须第一次就在批准的 headless/windowless 上下文中运行，使用全新临时 profile/state、正常关闭和清理，sandbox-only failure 必须原命令重跑且不能弱化证据。
- [x] 6.4 运行 Generate/Evidence dispatcher 的无写入拒绝、临时目标和适用 committed drift 检查；仅在评审 source/evidence 差异后显式更新，随后重跑相应只读 Gate。
- [x] 6.5 运行文档双语路径、标题、链接、Gate ID 和 OpenSpec Change-name/旧命令扫描，确认维护文档与 policy 全部通过。

## 7. 最终验证

- [x] 7.1 运行 `pnpm run test`，确认根应用和所有 workspace member 的 Rstest suites（含新增 governance regressions）通过。
- [x] 7.2 运行 `pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`，确认 frontend/workspace 类型、Biome/静态规则、Gate policy 和生产构建通过。
- [x] 7.3 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`；虽然不改变 Rust 产品行为，Gate 迁移重编排了 Cargo validation，因此必须验证完整 Rust workspace。
- [x] 7.4 运行所有受影响的稳定 capability Gates 和 CI policy validation，确认新 dispatcher 是唯一入口、现有验证强度不降低且 macOS-only runner/browser 安全策略保持不变。
- [x] 7.5 运行 English/Chinese documentation validation、`openspec validate consolidate-validation-gate-governance --type change --strict`、`openspec validate --all --strict --no-interactive` 和 `git diff --check`。
- [x] 7.6 修复本变更引入的每个 warning/error，重跑失败命令，再完整重跑 7.1–7.5；记录任何真正不适用项的理由和剩余限制后才能声明完成。
