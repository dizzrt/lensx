## 1. 扁平化官方插件 workspace

- [x] 1.1 使用版本控制 rename 将 `plugins/official/config-lens` 整体迁移到 `plugins/config-lens`，保留源码、测试、visual baselines、WKWebView harness assets、package identity、版本和 CHANGELOG 内容。
- [x] 1.2 将 `pnpm-workspace.yaml`、workspace lifecycle member patterns/classification 和 `pnpm-lock.yaml` importer 更新为直接 `plugins/*`，使用机器配置的全局 pnpm store 重新生成并验证 lockfile，且不保留旧 nested member pattern。
- [x] 1.3 更新 workspace dependency/boundary checker 及其 valid/invalid、reverse-dependency、empty、missing-script 和 member-failure fixtures，使全部直接 `plugins/*` 成员分类为 official plugin，并继续拒绝 Host/Tauri/private/deep/cross-plugin imports。
- [x] 1.4 更新 ConfigLens package-owned path scan、root focused scripts、no-dual-runtime gate、Rust/macOS WKWebView harness config 与路径解析，使所有维护入口只引用 `plugins/config-lens`。
- [x] 1.5 扩展 workspace lifecycle、workspace boundary 和 ConfigLens path tests，证明新直接成员被发现、旧 `plugins/official/<slug>` 不再是 member、Host 不直接导入产品插件源码且 ConfigLens 完整 gate 仍使用同一 package/runtime boundary。

## 2. 迁移官方插件发布与所有权契约

- [x] 2.1 将 official release contract 的 member discovery、relative path、CODEOWNERS 精确模式和 boundary filtering 迁移到 `plugins/<slug>`，并把 `.github/CODEOWNERS` 中 ConfigLens owner 更新为 `/plugins/config-lens/`。
- [x] 2.2 更新 official PR/version/candidate workflows 的 path filters、workflow policy assertions、Changeset impact planner 和 shared trigger rules，使 `plugins/<slug>/**` 只选择对应插件且 workspace/release 基础设施变化仍验证全部成员。
- [x] 2.3 更新 candidate、version、release、temporary dry-run、documentation drift 和 zero/one/two-member fixture helpers，确保临时 fixture 不进入产品 `plugins/*`，release tag/assets/audit schema 与 least-privilege authority 保持不变。
- [x] 2.4 更新 official release pipeline、workspace boundaries 和 ConfigLens release agreement tests，覆盖新路径的单成员选择、Changeset 缺失/错配、CODEOWNERS wildcard/duplicate/unknown、zero-member no-op、dual-member independence 和真实 ConfigLens candidate。

## 3. 增加专用插件开发启动入口

- [x] 3.1 增加只依赖 Node 内置模块的开发启动包装器，解析唯一可选参数 `--plugins-root <path>`、拒绝未知/重复/缺值参数、默认规范化到仓库 `plugins/`，并以现有 frontend flag、Rust feature 和 Host-private startup-root 环境启动 Tauri；将 `dev:plugin-development-mode` 切换到该包装器。
- [x] 3.2 为包装器增加确定性单元测试，覆盖默认/custom root、相对/绝对路径、空格路径、参数错误、child process exit/signal 传播，并证明 startup root 不进入 Rsbuild define 或普通 `pnpm run dev`。
- [x] 3.3 在 feature-gated Rust 层增加 typed startup config 和一次性 bootstrap 状态，使配置存在时在首次 capability read 前真实启用 `PluginDevelopmentModeState`，而无配置的 feature build、普通 build 和生产 build 保持现有关闭/排除语义。
- [x] 3.4 实现 Host-owned 一级成员发现：只枚举非隐藏直接子目录的 `dist/`、按可移植成员标签排序、忽略缺少 `dist/` 的成员，并对 root 缺失/为空/不可读产生不阻断启动的稳定有界 summary。
- [x] 3.5 将现有 directory inspection/snapshot 流程拆分或复用为未提交 candidate prepare，逐个清理并跳过 invalid、incompatible、source-changed、unsafe 和候选级读取失败，同时不读取 project metadata、不执行构建、不跟随 link 且不泄露绝对路径/文件内容。
- [x] 3.6 对所有已验证 candidates 及 Plugin Manager 当前 builtin/external/quarantine/development identities 执行提交前 ID 唯一性预检；任一重复都清理本批未提交 snapshots、返回稳定 conflict，并禁止 shadow、replace、disable 或 remove 既有 entry。
- [x] 3.7 在 ID preflight 成功后按确定顺序提交所有有效 development registrations；跟踪本批 entry/snapshot，在 Manager/cache/协调器系统失败时回滚已提交 authority、清理安全可归属资源并中止 Tauri setup，避免部分 bootstrap 对 UI 可见。
- [x] 3.8 调整 Tauri setup 顺序，在 Manager 与 Resource/installer/storage/lifecycle services 就绪而前端/Launcher 尚未装载时运行一次 bootstrap；注册结果保持 `source=development`、enabled、Runtime inactive，并仅向终端输出稳定成员标签/错误码及 loaded/skipped 汇总。
- [x] 3.9 保持 native picker、manual register/reload/remove/disable contract 不变；验证用户关闭自动启用的模式后本进程不会再次开启，下次专用启动创建全新 registrations，且 manual reload 仍推进 snapshot generation 并使用 production Child WebView teardown。

## 4. 同步前端状态、交互与回归测试

- [x] 4.1 更新 development capability/service 与 App bootstrap 测试，证明前端首次读取原生 enabled snapshot 后设置 Switch 显示开启，无需调用前端 `setMode`，且空/全部跳过的 bootstrap 仍允许手动注册。
- [x] 4.2 更新 Settings 插件开发模式的 English-default 与 Simplified Chinese 文案，准确区分专用开发命令重启、普通启动和当前进程手动关闭；保持 Semi Design Switch、键盘操作、accessible name、light/dark theme 和现有确认/反馈行为。
- [x] 4.3 增加 Page/Action projection、Launcher navigation 和 Runtime slot 负向测试，证明 bootstrap 只投影有效 registrations，不 dispatch Action、不打开 Page、不创建 Child WebView，并由用户后续 Launcher 操作走现有 production Runtime 路径。
- [x] 4.4 扩展 development-mode Rust/TypeScript/React tests，覆盖多 valid candidates、缺失 dist、空/不可读 root、invalid/incompatible/source race 跳过、candidate/installed ID conflict、prepare cleanup、commit rollback、pathless diagnostics、disable convergence 和 process restart。

## 5. 更新双语维护文档和路径漂移门禁

- [x] 5.1 更新 `docs/en/development/plugin-development-mode.md` 及同路径 `docs/zh` 镜像，说明专用命令自动开启 Switch、默认/自定义 root、跳过与 ID conflict 语义、无自动 Page open、手动 reload/disable 和 production exclusion，并重写真实 smoke 步骤。
- [x] 5.2 更新 canonical English 的 getting-started、plugin-workspace、official-plugin-release、ConfigLens、validation 及相关 plugin developer instructions，并同步所有同路径 Simplified Chinese 镜像，把当前维护路径统一为 `plugins/*`/`plugins/config-lens`。
- [x] 5.3 更新 documentation、workspace、official release、ConfigLens 和 development-mode drift gates，要求当前源码/稳定规范/双语文档不再依赖 `plugins/official/*`，同时明确排除不可变的归档 OpenSpec 历史工件。

## 6. Focused 与真实开发流程验证

- [x] 6.1 运行并通过 `pnpm run test:workspace-lifecycle`、`pnpm run check:workspace-boundaries`、`pnpm run check:official-plugin-release-pipeline`、`pnpm run check:official-config-lens-plugin` 和 `pnpm run check:plugin-development-mode`，修复新路径或 bootstrap 引入的每个 warning/error 后重跑失败 gate。
- [x] 6.2 在支持的 macOS 环境构建至少两个 valid development `dist/` 和一个 invalid candidate，执行默认及 custom-root 专用启动，验证 Switch 初始开启、invalid 被跳过、valid Actions 可见、没有 Page 自动打开、Launcher 手动打开使用真实 Child WebView，并验证同批及已安装 ID conflict 会阻断启动。
- [x] 6.3 验证当前进程 disable 会 quiesce 自动注册的所有 entries，重新执行专用命令会重新发现但不恢复旧 snapshot/Runtime；运行 production artifact boundary gate，证明普通/生产构建仍无 development UI、commands、managed state 或 startup-root 字符串。

## 7. Final Validation

- [x] 7.1 运行完整 frontend/shared tests：`pnpm run test`；任何失败修复后先重跑失败测试，再重跑完整命令。
- [x] 7.2 运行 frontend formatting 和 static checks：`pnpm run format`、`pnpm run check` 与 `git diff --check`，修复所有 warning/error 后重跑完整集合。
- [x] 7.3 运行 frontend type checking 和 build：`pnpm run typecheck`、`pnpm run build`，确认 workspace rename、wrapper、ConfigLens 和 Host frontend 都使用新路径且 production bundle 不包含开发 bootstrap authority。
- [x] 7.4 运行 Rust formatting、tests 和 static checks：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，并确保 feature-gated development bootstrap tests 与普通 build 都通过。
- [x] 7.5 运行严格 OpenSpec validation、双语文档结构/链接检查以及维护路径 drift scan，确认四项 delta specs、proposal/design/tasks 一致、所有任务证据齐全、stable English sync 可安全执行且归档历史未被改写。
- [x] 7.6 若最终集合任一命令失败，修复后重跑该命令及 7.1–7.5 的完整最终集合；只有全部成功后才勾选所有任务并声明实现完成。
