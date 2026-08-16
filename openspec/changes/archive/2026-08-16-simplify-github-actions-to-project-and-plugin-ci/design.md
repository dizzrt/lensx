## Context

仓库当前有四条 macOS GitHub Actions workflow：Rust 检查、官方插件 PR 门禁、Changesets 版本 PR，以及 candidate 构建/发布。它们把持续集成与自动发布耦合在一起，并要求发布 workflow、发布权限和 release sidecar 同时存在。

当前阶段的目标更窄：只需要持续证明 LensX 主项目与 `plugins/*` 下的插件能在干净的 macOS runner 上完成各自的检查、测试和构建。自动升版、候选物上传、tag 和 GitHub Release 均不属于当前目标。

现有根级 `build`、`typecheck`、`test` 和 `check` 命令会遍历 `packages/*`、`plugins/*` 与 `examples/plugins/*`。这对本地全仓验证仍有价值，但不能直接表达两个 CI 的独立职责。此外，插件消费的公共 workspace package 导出指向 `dist`；本地预热的 `dist` 会掩盖 clean runner 上未先构建依赖的问题。因此 Plugins CI 必须显式准备公共依赖，而不能依赖工作区软链接或历史产物恰好可用。

本变更只改变仓库自动化与维护文档，不改变产品 UI、可访问性、国际化、主题、插件 Runtime、Manifest、SDK 或 Host authority。

## Goals / Non-Goals

### Goals

- `.github/workflows/` 最终只有两条 workflow：LensX CI 与 Plugins CI。
- 两条 workflow 均仅在 macOS 上运行，只有读取仓库内容的权限，不具备发布能力。
- LensX CI 覆盖主项目前端与 Rust 的格式/静态检查、类型检查、测试和构建，并在纯插件改动时跳过。
- Plugins CI 只由插件目录或自身 workflow 的改动触发；任意一个直接插件变化都验证全部直接插件。
- Plugins CI 从 clean checkout 开始，按拓扑顺序构建插件所需的公共 workspace package，再执行每个插件的完整验证。
- 通过静态策略测试和中英文文档防止旧发布 workflow、写权限与双路径重新出现。

### Non-Goals

- 不设计替代性的手动发布或自动发布方案。
- 不改变根级全 workspace 命令原有的聚合语义。
- 不增加 Linux 或 Windows runner。
- 不改变插件公共协议、安装、运行时或权限模型。
- 不保证没有被两条 CI 使用的旧发布辅助命令继续作为稳定接口存在。

## Decisions

### 1. 用两个职责单一的 workflow 取代当前四条 workflow

新增 `lensx-ci.yml` 与 `plugins-ci.yml`，并删除四条旧 workflow；不保留兼容名称、转发 workflow 或隐藏的第三条发布 workflow。

LensX CI 的事件矩阵为：

| 事件 | 改动范围 | LensX CI | Plugins CI |
| --- | --- | --- | --- |
| pull request / `main` push | 仅 `plugins/**` | 跳过 | 运行 |
| pull request / `main` push | LensX、packages、docs 或其他非插件路径 | 运行 | 跳过 |
| pull request / `main` push | 插件与其他路径混合 | 运行 | 运行 |
| pull request / `main` push | `.github/workflows/plugins-ci.yml` | 运行 | 运行 |

LensX CI 使用 `paths-ignore: [plugins/**]`；Plugins CI 使用 `paths` 包含 `plugins/**` 与自身 workflow。workflow 自身改动是路径规则的显式例外，以保证 Plugins CI 的定义可以被自身验证。`packages/*` 的单独改动不会触发 Plugins CI，这是当前范围的有意取舍；它仍由 LensX CI 验证。

两条 workflow 都声明 workflow 级 `permissions: contents: read`，不配置发布 environment 或 release secret，并使用按 workflow/ref 分组的 concurrency 取消同一分支上的过期运行。第三方 action 固定到完整 commit SHA。

备选方案是保留四条 workflow 但禁用发布 job。该方案仍保留过时的状态检查名称、触发器和维护面，无法表达“仓库只有两个 CI”的约束，因此不采用。

### 2. LensX CI 使用显式的 LensX-only 入口，不改变根级全 workspace 命令

实现提供可本地复现的 `ci:lensx:frontend`、`ci:lensx:rust` 与组合
`ci:lensx` 入口。它覆盖：

- 前端格式/静态检查；
- TypeScript 类型检查；
- 前端单元测试；
- 前端生产构建；
- Rust `fmt --check`、`clippy/check`、测试和 workspace build。

入口可以由少量可组合的 package scripts 和现有脚本构成，但不得通过运行根级全 workspace lifecycle 后忽略插件结果来模拟 LensX-only。现有根级 `build`、`typecheck`、`test` 和 `check` 的全成员语义保持不变，避免破坏本地开发与稳定 workspace 约束。

前端与 Rust 可以拆成并行 job，以缩短反馈时间；任何必需 job 失败都会使 LensX CI 失败。

### 3. Plugins CI 枚举全部直接插件，而不是只检查变更插件

Plugins CI 通过 `ci:plugins` 复用仓库拥有的 workspace discovery，选择
`plugins/*` 下的直接插件成员。只要触发器命中，就对该集合进行全量验证，
避免一个插件变更影响共享约束时只得到局部证据。

每个直接插件必须完成其声明的 `typecheck`、`test`、`check` 与 `build`，并运行官方插件要求的 `test:e2e`。声明了 `visual` 的插件还必须执行该视觉门禁；视觉运行使用现有的无窗口/临时 profile 约束并在结束后清理。任何成员或任何必需阶段失败都会使 workflow 失败，不能降级成 warning 或跳过剩余失败结果。

如果未来 `plugins/*` 没有直接插件，CI 入口应给出明确的成功 no-op 结果；日常 GitHub 事件通常不会在没有 `plugins/**` 改动时触发该 workflow。

只验证变更插件的备选方案运行更快，但会遗漏共享脚本、公共约束和跨插件一致性问题，不符合“任意插件改动验证所有插件”的要求。

### 4. Plugins CI 必须从干净环境显式准备公共依赖

Plugins CI 在标准依赖安装后，使用 workspace dependency graph 计算被插件消费的公共 package，并按拓扑顺序构建其公开导出。至少覆盖当前插件链路实际需要的 `plugin-contract`、`plugin-sdk`、`plugin-ui`、`plugin-testkit` 与 `plugin-cli`，但实现依据依赖图而不是把 ConfigLens 或固定列表作为唯一发现机制。

插件随后只通过公开 package exports 消费这些构建结果；CI 不添加指向 package `src` 的别名，也不复制 Host/Tauri 私有源码。入口在执行前不得把已有 `dist` 当作前置条件，从而确保 clean runner 与本地复现具有相同语义。

备选方案是在 checkout 后直接运行插件命令，依靠 pnpm workspace 软链接。由于软链接仍会解析到 package exports 指向的 `dist`，这会重现当前 clean runner 失败，因此不采用。

### 5. 自动发布 capability 完整退役，校验能力迁移而非保留双路径

删除 Changesets 版本 PR、candidate artifact handoff、受保护发布 environment、tag 与 GitHub Release 发布的 workflow 和强制策略。新的 Plugins CI 只保留检查、测试和构建证据，不上传可发布候选物，也不调用有写权限的 GitHub API。

实现阶段将审计 `scripts/official-plugin-release*` 及其测试：

- 被 Plugins CI 复用的纯验证能力迁移到中性的 CI/插件校验入口；
- 只服务于版本 PR、candidate handoff、release API 或旧 workflow policy 的入口、断言和文档删除；
- 不保留要求旧 workflow 存在的聚合 gate 或兼容命令。

稳定的 `official-plugin-release-pipeline` capability 在归档时删除；其历史要求保留在本 change 的 REMOVED delta 中。直接插件的公共边界和运行验证由新的 `repository-continuous-integration` capability 承接。

保留完整发布脚本但仅从 Actions 移除的备选方案会留下看似受支持、实际未维护的发布接口，也容易让旧双路径回归，因此不采用。

### 6. 用策略测试和双语文档锁定最终状态

新增 `check:ci-workflows` 静态策略入口并调整策略测试，至少验证：

- workflow 目录只含两个目标文件；
- runner、事件路径、最小权限、固定 action SHA 与所需命令符合规格；
- Plugins CI 没有发布 environment、写权限、artifact handoff、version PR、tag 或 GitHub Release 行为；
- 已移除 workflow 名称和自动发布术语不再被活动脚本、文档或稳定规格当作现行能力引用。

新增/更新 canonical English CI 文档及相同路径的简体中文镜像，并更新两个文档索引。文档说明触发矩阵、本地复现入口、失败恢复方式和有意不提供的自动发布能力。

## Risks / Trade-offs

- **公共 package 改动不会单独触发 Plugins CI。** 这是用户指定的目录触发边界。LensX CI 仍验证 package 自身；若未来需要消费者级回归，再单独扩展 Plugins CI 的 paths，而不在本变更中暗中扩大范围。
- **全插件验证会随插件数量增长。** 当前优先完整证据；通过公共依赖只构建一次、插件阶段复用安装结果和 concurrency 取消旧运行控制成本。
- **旧 branch protection 可能仍要求已删除的 check 名称。** 仓库代码无法自动修改 GitHub 设置；合并前后需将 required checks 更新为两条新 CI 的稳定 job 名称。
- **移除发布自动化后仓库不再提供受支持的官方发布路径。** 这是明确目标，而不是回归；未来发布需求应通过新的独立 OpenSpec change 重新设计。
- **视觉测试可能受 macOS runner 图形环境影响。** 沿用现有 headless、临时 profile 和失败诊断，并在实现验证中用 clean macOS 环境确认。

## Migration Plan

1. 增加 LensX-only 与 plugins-only 的可复现 CI 入口，并用单元/策略测试验证成员选择、依赖顺序和失败传播。
2. 添加两条新 workflow 和双语 CI 文档，在本地完成 YAML、策略、脚本及相关项目验证。
3. 删除四条旧 workflow，以及只服务于自动版本/发布的 gate、脚本入口、测试和文档引用；执行无双路径扫描。
4. 同步稳定规格时新增 `repository-continuous-integration`，并删除退役的 `official-plugin-release-pipeline` 稳定 capability。
5. 合并时在 GitHub branch protection 中把 required checks 切换到新 LensX CI / Plugins CI job 名称；这是仓库外的人工迁移步骤。

回滚只需恢复上一版 workflow、脚本、文档和稳定规格；本变更不发布 artifact、不改版本、不写 tag，因此没有外部发布数据需要回滚。

## Open Questions

无。发布能力是否重新引入、是否让公共 package 变化触发插件消费者 CI，均明确留给后续独立变更。
