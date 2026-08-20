## Context

仓库当前用两个只读 macOS workflow 调用统一 Gate dispatcher。LensX CI 的主要阶段已经是静态检查、类型检查、单测和构建，但 clean checkout 会在 `plugin-contract` 输出尚未生成时直接构建 `plugin-cli`。Plugins CI 会按 `typecheck → test → check → build → test:e2e → visual` 执行，而多数 package 的 `check` 又递归调用 `typecheck` 和 `test`，造成重复工作。

Gate registry 还维护浏览器、视觉、真实 WKWebView、macOS 产品和性能 evidence，并通过独立 Evidence dispatcher 暴露七个写入或 harness target。稳定规范把这些环境路径写成多个能力的交付前提。本变更是一次有意的验证策略收缩：维护者接受不再自动证明真实桌面/WebView 行为，换取快速、确定、可在 clean checkout 重复执行的验证边界。

## Goals / Non-Goals

**Goals:**

- 让 PR、`main` push 和本地 CI 复现只运行确定性的单测、静态检查、构建、打包和纯命令行产物验证。
- 删除所有视觉、截图、像素基线、浏览器、真实 WKWebView、macOS 产品、原生 harness 和目标环境性能 evidence 的维护入口与资产。
- 删除 Evidence dispatcher；保留只服务于类型、Schema、包格式和确定性 fixture 的 Generate dispatcher。
- 保持两个只读、macOS-only workflow 和小型根命令接口，不增加 Change-specific 或测试子集 alias。
- 统一 package lifecycle 的非重叠语义，并通过 workspace 依赖闭包修复 clean-checkout 构建顺序。
- 使 stable specs、英文文档、中文镜像、Gate registry 和源代码对新的验证承诺保持一致。

**Non-Goals:**

- 不改变用户可见产品功能、Plugin 公共 API、Host/native 权限、Runtime 容器或安全策略。
- 不删除组件级可访问性、本地化、主题、焦点、状态转换和安全负向断言；这些继续由 Rstest、Rust 和静态边界测试覆盖。
- 不新增 Linux/Windows CI，不新增发布、签名、公证或自动上传能力。
- 不改写历史 OpenSpec archive 或伪造过去的完成证据。
- 不保留隐藏的手动视觉/浏览器/native Gate，也不通过另一套脚本或 workflow 建立兼容路径。

## Decisions

### 1. 维护中的验证只允许四类确定性工作

维护验证分为：Rstest/Cargo 单元与状态测试、Biome/TypeScript/Rust 静态检查、Rsbuild/Cargo/workspace 构建、纯命令行的 pack/inspect/tarball/产物 smoke。允许临时目录和临时 package consumer，但命令不得启动浏览器、WebView、GUI `.app`、Launch Services 或原生交互 harness，也不得读取或更新真实环境 evidence。

选择这一白名单，而不是只从 Plugins CI 删除 `visual`，因为稳定规范、Gate DAG 和完成声明仍会从其他入口要求相同环境能力。白名单同时为后续 Gate 新增提供清晰边界。

### 2. 彻底退役环境型验证基础设施

删除 active visual scripts、fixtures、baselines、committed environment evidence、producers、harnesses、对应 Gate/Generate/Evidence targets 和 maintained documentation references。根 `evidence` script、CLI 分支、registry `evidenceTargets` 与专用 runner/type/test 一并删除。`generate` 继续要求明确 target 与 `--write`，但只保留确定性生成物。

对于包含 Rstest、Cargo、build 与环境步骤的复合 Gate，先把仍受支持的步骤迁移到标准 lifecycle 或一个稳定的确定性 capability Gate，再删除旧 Gate。不会留下仅含空步骤或只转发其他 Gate 的壳。

备选方案是保留 environment Gate 但从 CI 取消调用；这与用户明确的“没有按需 Gate 需求”冲突，且继续产生维护、文档和规范成本，因此拒绝。

### 3. Gate registry 保留为确定性跨层 dispatcher，但移除环境安全模型

`gate` 继续承载 Cargo、构建、包消费者和跨层纯命令行检查，避免重新扩张根 `package.json`。因为 registry 中不再允许浏览器/native/evidence 步骤，`launchesBrowser`、`launchesNativeApp` 和 Evidence 专用结构不再作为可选能力保留；Rstest policy 通过命令和维护文件扫描拒绝重新引入 visual、browser、`.app` launch、WebView harness 或 evidence dispatcher。

备选方案是删除整个 Gate registry 并把命令直接写回 workflows/root scripts；这会重新产生 shell chain 和 alias 膨胀，且不是本次问题的必要解法，因此不采用。

### 4. Package lifecycle 每类只执行一次

标准语义固定为：`typecheck` 只做类型检查，`test` 只做测试，`check` 只做格式/lint/生成物漂移/源码策略，`build` 只做构建。Plugins CI 明确按一次 `typecheck → test → check → build` 执行；`test:e2e` 仅在它是 build 后的纯 Node 产物检查时保留。任何启动浏览器或 native Runtime 的 `test:e2e` 必须删除或改写为确定性产物断言，不能仅改名逃避策略。

### 5. 构建准备使用 workspace 传递依赖闭包

CI 不在 workflow YAML 中硬编码 `plugin-contract`。验证层复用 workspace member 发现和拓扑排序，针对需要构建的 package 计算其传递 workspace 依赖，先构建依赖输出，再构建消费者。相同准备步骤在一次 Gate plan 中去重，且 clean checkout 测试不得依赖预存 `dist`。

备选方案是在 `plugin-cli` build script 内递归构建 Contract；这会把 monorepo 拓扑泄漏到包局部脚本，并在标准 workspace build 中重复执行，因此拒绝。

### 6. 规范删除验证证明，不删除产品语义

Delta specs 将真实目标环境、截图、视觉矩阵和环境性能采样改为确定性验证要求，或在整个 requirement 只描述已退役 proof 时明确删除。诸如“视觉顺序”“启动时无可见品牌”“窗口跨 Space 行为”“WebView 隔离”仍是产品语义，不进行机械关键词删除；只能删除其环境 evidence 完成前提。

同步稳定规范前，所有进入 `openspec/specs/` 的内容必须改写为英文。历史 archive 保持原状。维护扫描只覆盖 active source、tests、stable specs、docs、CI 和 registry，不把 archive 中的历史术语判为 stale。

## Risks / Trade-offs

- [真实 WKWebView、窗口、Space、CSP 或字体渲染回归不再被自动发现] → 这是本变更明确接受的验证能力损失；确定性状态、契约、Rust、组件和边界测试仍须覆盖可证明逻辑，完成报告不得再声称真实产品路径已验证。
- [删除复合 Gate 时误删仍有价值的确定性断言] → 先生成 inventory，将每个步骤分类为迁移、保留或删除；Rstest、Cargo、build、pack 和 Node consumer 必须有明确去向后才能删除原 Gate。
- [package `check` 语义调整导致根 lifecycle 覆盖变弱] → 为每个 workspace member 断言四个 lifecycle 均存在、无递归重复且完整 root lifecycle 仍覆盖所有成员。
- [稳定规范大量修改产生范围遗漏] → 以 active specs/docs/source 的环境术语与 dispatcher 引用扫描作为回归测试，并明确排除 archive。
- [未来再次需要真实环境验证] → 必须通过新的 OpenSpec change 重新设计，不恢复本次删除的 alias、baselines 或 Evidence dispatcher。

## Migration Plan

1. 建立受支持验证白名单和环境型资产/命令/spec/document inventory，记录每项迁移或删除去向。
2. 先迁移复合 Gate 中仍支持的 Rstest、Cargo、build、pack、tarball 和纯 Node 产物检查，并补充 clean-checkout 依赖闭包测试。
3. 规范 package lifecycle，更新 Plugins CI 与 LensX frontend Gate，使每类验证只运行一次且依赖输出先于消费者。
4. 删除 visual/browser/native/environment evidence scripts、fixtures、baselines、records、Gate/Generate/Evidence targets 和根 Evidence dispatcher。
5. 更新 19 个 delta capability、stable English specs 的同步准备、`docs/en` 及对应 `docs/zh`，清除 active stale references。
6. 在无预生成 workspace `dist` 的环境中执行精简 CI、完整标准 frontend/workspace lifecycle、Rust 验证、确定性 package consumers、文档和 strict OpenSpec 校验。

回滚应整体还原本 Change 的实现提交和稳定规范同步，不保留半迁移的双路径。如果环境验证需求未来重新出现，应创建新 change 并重新建立当前可维护的验证契约。

## Open Questions

无。视觉、浏览器、真实 WebView/macOS evidence 和目标环境性能采样均确定退役；历史 archive 保留，产品行为与公共 API 不变。
