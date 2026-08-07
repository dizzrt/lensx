## 1. Documentation Validation Foundation

- [x] 1.1 定义 developer 文档目录、必需页面/标题、English/Chinese 同路径镜像、相对链接/锚点和状态分类的 typed validation model；添加路径缺失、broken link、额外镜像、绝对路径、未实现能力误标为 shipped 与 bounded diagnostic 单元测试。
- [x] 1.2 实现 Markdown fenced-block metadata parser 与 checker，支持 `source`、`verify` 和显式 non-runnable 分类；添加未分类 runnable block、错误 target/region、源码 drift、private import、无效 JSON、未知命令、失败清理和无缓存重跑测试。
- [x] 1.3 实现 Host API 文档 coverage checker，直接读取公共 method/permission/error/version catalog 与 Schema，并复用生产 Dispatcher/provider 证据校验 contract、Host implementation、permission 和 session capability 分类；覆盖缺失、额外、错误 permission/provider/version 以及私有 wire 泄漏负例。
- [x] 1.4 建立 `check:plugin-development-documentation:docs` focused command，组合文档树、双语镜像、链接/锚点、runnable blocks、package exports 和 API coverage checks，并以 Rstest 覆盖 parser/coverage 的成功、空集合、错误与修复后恢复路径。

## 2. External Developer Information Architecture

- [x] 2.1 新增 `docs/en/plugin-development/index.md`，提供能力状态、技术栈选择和从教程到参考/排障的渐进式学习路径；同步 `docs/zh/plugin-development/index.md` 语义镜像，并将两份顶层 `docs/*/index.md` 接入对应语言的 developer hub。
- [x] 2.2 编写 English canonical `public-packages.md` 及简体中文同路径镜像，覆盖 Contract、SDK、可选 UI、Testkit、CLI 的 package/version、公开 exports、依赖角色、生命周期和非目标；让文档 gate 对真实 tarball contents/declarations/metadata 验证全部示例 import。
- [x] 2.3 编写 English canonical `tooling-and-installation.md` 及简体中文镜像，准确连接 CLI build/validate/pack/inspect、Development Mode register/manual reload、canonical `.lxp` 与 Settings 本地安装，并明确未发布 npm、tarball 前置条件、Host 复验、来源/持久化/权限差异和无 watch/HMR 边界。
- [x] 2.4 编写 English canonical `host-api.md` 及简体中文镜像，为公共 catalog 每个 method 提供参数/结果、permission、稳定错误、版本、生产 provider 条件、session capability 与恢复建议；通过 coverage checker 证明没有遗漏、过度承诺或独立权限算法。
- [x] 2.5 编写 English canonical `runtime-permissions-security.md` 及简体中文镜像，覆盖 iframe → Session → SDK ready、完整 context replacement、request/cancel、loading/empty/error/retry/destroy、旧 generation inert、requested/granted/effective 权限、CSP/sandbox/source/deadline/breaker 和 production/development 同边界。
- [x] 2.6 编写 English canonical `compatibility-and-errors.md` 及简体中文镜像，区分 package/Manifest/Host API/app 版本、valid/incompatible/invalid、CLI/Host 结论、稳定错误码、用户可操作恢复和明确未交付能力；验证所有 identifier、命令、相对链接和中英文代码块一致。

## 3. End-To-End Tutorials

- [x] 3.1 编写完整的 English `tutorial-framework-neutral.md` 与简体中文镜像，使用真实 CLI create 和无权限正式模板覆盖前置 tarball、安装、Manifest/Page/Action/resource、SDK/Testkit lifecycle、test/typecheck/build/validate、Development Mode、pack/inspect、本地安装和运行；将全部 runnable code/command blocks 绑定源码或编译组。
- [x] 3.2 编写完整的 English `tutorial-react-semi.md` 与简体中文镜像，覆盖与 framework-neutral 相同的独立闭环，并增加 React/Semi 自有依赖、`PluginUiProvider`、公开 styles/tokens、keyboard/focus、loading/empty/error/recovery、`en-US`/`zh-CN` 和 light/dark 验证；禁止通过链接省略完成教程所需步骤。
- [x] 3.3 为两条教程增加 shared lifecycle 和 negative-path 自动断言，验证 Development Mode 与正式安装不会混淆、CLI acceptance 不授予 authority、permission 不自动 grant、capability 缺失时降级、retry 创建 fresh attempt、cleanup 幂等且示例不引用 workspace/private/Tauri 边界。

## 4. Real-Tarball External Consumer Gate

- [x] 4.1 提取或复用现有 tarball/temporary-consumer helper，在系统临时目录打包真实 Contract、SDK、UI、Testkit 与 CLI，通过真实 CLI 分别生成两种项目，并以 consumer-owned override 和机器配置的全局 pnpm store 隔离安装；增加成功/失败清理和环境错误分类测试。
- [x] 4.2 对两个 consumer 运行教程声明的 test、typecheck、build、validate、两次 pack 和 inspect，审计 lockfile、module realpath、bundle、public imports、dependency protocols 与 package bytes；验证不回链 repository root `node_modules`、源码或 repository-local store metadata。
- [x] 4.3 将两个真实 `.lxp` 复用现有 TypeScript/Rust inspector 与 controlled installer preparation boundary，并组合 Plugin Development Mode、Runtime Session/security lifecycle、permission、project template 与 CLI focused evidence，证明文档流程不建立第二套打包/安装判断且不扩大正式安全边界。
- [x] 4.4 新增根 `check:plugin-development-documentation:external` 和 `check:plugin-development-documentation` 聚合命令，接入正常 workspace validation；添加 gate composition 测试，证明遗漏任一双语、tutorial、API coverage、external consumer 或 Host boundary 阶段都会失败。

## 5. Existing Documentation And Roadmap Convergence

- [x] 5.1 逐项对照当前源码/测试、稳定 specs 和新 developer 文档，修正 `docs/en` 现有 architecture/development 页面中与 Milestone 6 直接相关的过时状态、重复表格和限制，维护 `docs/zh` 同路径语义镜像并使用相对链接收敛到单一 canonical developer reference。
- [x] 5.2 扩展 Roadmap/documentation drift gate：在 focused 和最终验证均未通过时保持 Task 6.6 未完成；全部证据通过后才将 `plugin-roadmap.md` Task 6.6 链接到本 change、标记完成，并把当前基线、Milestone 6 和 Plugin Developer Preview 进度改为与已验证能力一致。
- [x] 5.3 检查 README、`AGENTS.md`、`openspec/config.yaml`、公共 package 和生产 artifacts，证明具体教程没有泄漏到 onboarding/rules、没有新增 Runtime dependency/API/Tauri command、没有 npm/远程发布承诺，并记录签名、Marketplace、更新、watch/HMR 仍为非目标。

## 6. Final Validation

- [x] 6.1 顺序运行 focused gates：`pnpm run check:plugin-development-documentation`、`pnpm run check:plugin-project-template`、`pnpm run check:plugin-developer-cli`、`pnpm run check:plugin-development-mode`、`pnpm run check:plugin-runtime-security-lifecycle`、`pnpm run check:plugin-permission-prompts`、`pnpm run check:plugin-contract`、`pnpm run check:plugin-testkit` 和 `pnpm run test:workspace-boundaries`；修复全部 warning/error 后重跑失败项。
- [x] 6.2 顺序运行完整 frontend/shared test 与 formatting/static validation：`pnpm run test`、`pnpm run format`、检查格式化 diff、`pnpm run check`；修复全部 warning/error 后重跑受影响检查。
- [x] 6.3 顺序运行完整 frontend/shared static/build validation：`pnpm run typecheck`、`pnpm run build`；确认新文档 tooling 不进入生产 frontend bundle，修复全部 warning/error 后重跑失败项。
- [x] 6.4 即使本 change 不修改 Rust 生产语义，也因 external tutorial 必须通过 Rust inspector/installer preparation，顺序运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，修复全部 warning/error 后重跑失败项。
- [x] 6.5 运行 `openspec validate publish-plugin-development-documentation --type change`，核对 proposal/design/spec/tasks 一致、双语路径和索引完整、active delta spec 在同步/归档前转换为 English，并确认所有完成 checkbox 都有自动化证据而非人工 GUI replay。
- [x] 6.6 修复所有引入或暴露的 warning/error，顺序重跑 6.1–6.5 的完整最终集合；仅在最终重跑全部成功后完成 Roadmap 状态更新并勾选本 tasks 的验证项。
