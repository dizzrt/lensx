## 1. Public CLI Package Foundation

- [x] 1.1 创建 `packages/plugin-cli` workspace member，补齐 `@lensx/plugin-cli` metadata、MIT license、Node/pnpm engine、`lensx-plugin` bin、受限 files/exports、build/typecheck/test/check/test:pack lifecycle，并把它纳入根 workspace lifecycle。
- [x] 1.2 审查并固定 CLI 所需 runtime dependencies，记录 Zstandard codec、命令解析或其他新增依赖的许可证、维护性、Node 24 与 macOS/Windows/Linux 支持、tarball 体积理由；禁止新增 UI 或 Host/Tauri dependency。
- [x] 1.3 扩展 workspace boundary model 和 fixtures，将 CLI 定义为窄化的 public authoring tool：允许声明的 Node built-ins 和公共 Contract，禁止 Host 私有/跨成员源码 import，并禁止官方/示例插件 Runtime source import CLI。
- [x] 1.4 实现无副作用的命令解析入口、`--help`、`--version`、`--project`、`--json`、`--locale` 和五个子命令 skeleton，添加参数组合、未知命令和退出码单元测试。

## 2. Stable Output And Diagnostic Contract

- [x] 2.1 定义 schema version `1` 的 typed JSON envelope、command/status/result 类型以及 `0/1/2/3` 退出码映射，验证每次 JSON 调用 stdout 只有一个 document。
- [x] 2.2 定义 CLI diagnostic code、受限 path、message key、结构化 arguments、确定性排序/去重和异常映射，添加绝对路径、stack、文件内容、环境 secret 与 raw error 泄漏负例。
- [x] 2.3 建立 `en-US` canonical 与 `zh-CN` 语义镜像 message catalogs 和 human renderer，验证 locale 只改变文案而不改变 code、path、status、result facts 或退出码。
- [x] 2.4 实现 human/JSON 两种 build-process 输出策略：human 模式可流式展示作者日志，JSON 模式有界捕获且不污染 stdout，并覆盖日志超限和子进程失败。

## 3. Canonical Package Core Migration

- [x] 3.1 先冻结当前 package-format valid/invalid/incompatible/reproducible corpus、TypeScript 公开行为和 Rust facts/diagnostic 基线，增加防止迁移期间静默改动 protocol `0.1.0` 的 drift assertions。
- [x] 3.2 将 constants、portable path、checksums、canonical TAR、Zstandard、limits 和 digest 迁入 CLI 内部 package-format 模块，保留 fixed parameters、增量限制和逐字节 reproducibility 测试。
- [x] 3.3 将 Manifest/resource adapter、三态 inspector、safe diagnostics 与 canonical packer 迁入 CLI 内部，并让 package 自身测试覆盖 checksum、resource、compatibility、invalid partial-fact 和 size-limit 边界。
- [x] 3.4 逐个迁移 fixture generator、iframe/runtime fixture、project-template package gate 等根调用者，通过已构建 CLI 或允许的 wrapper dogfood 新核心，禁止跨 workspace import CLI source。
- [x] 3.5 删除 `tools/plugin-package-format` 旧实现、过渡 wrapper 和重复 constants，更新 boundary/drift tests 证明仓库中只剩一个 TypeScript codec 判断源，同时保持 Rust inspector 独立。
- [x] 3.6 扩展跨语言 corpus gate，逐项比较 CLI 与 Rust 的 status、normalized Manifest、compatibility、files/sizes、package digest 及排序 diagnostic code/path，并覆盖 Host 私有拒绝不改变内容 classification 的边界。

## 4. Maintained Template Scaffolding

- [x] 4.1 建立从两个 canonical `examples/plugins/*` 生成 CLI tarball 模板资产的 build step，并增加结构、依赖范围、公开 imports、lifecycle、无权限语义和无 checkout 路径的双向 drift gate。
- [x] 4.2 实现 `create` 参数与替换模型，只允许受验证的 target、template、plugin ID、package/display name 变更，并确保生成 Manifest 重新通过 Contract。
- [x] 4.3 实现同级 staging、完整生成校验和 atomic rename；覆盖目标不存在、空目录、非空目录、非法 ID、替换失败、中断和清理恢复，不覆盖用户文件。
- [x] 4.4 验证 create 不访问网络、不安装依赖、不初始化 Git、不执行项目代码，并分别快照/语义测试 framework-neutral 与 React/Semi 生成结果。

## 5. Project Build And Read-Only Validation

- [x] 5.1 实现显式 `--project`/cwd 项目发现和 package metadata validator，要求受支持的 pnpm `packageManager`、普通 SemVer 公共依赖、必要 lifecycle，并拒绝隐式父目录搜索和不支持配置。
- [x] 5.2 实现非 shell 拼接的 `pnpm run build` orchestration、自递归检测和 `dist/manifest.json` 后置条件，覆盖成功、缺失脚本、非零进程、signal、中断及缺失/空输出。
- [x] 5.3 实现只接受普通文件且不跟随 symlink 的有界 `dist/` walker，校验可移植路径、case collision、文件数/大小和 Manifest/resource completeness。
- [x] 5.4 实现 `validate` 的项目 dependency/import boundary、Manifest Contract、compatibility 与内存 canonical pack/self-inspect 组合，保证不执行 build、不写 package 或修改项目。
- [x] 5.5 增加 validate 的 compatible、invalid、incompatible、missing/empty dist、Host-private import、非法资源、symlink/special file、超限和只读前后 byte snapshot 测试。

## 6. Transactional Pack And Read-Only Inspect

- [x] 6.1 实现默认 `pack` 的 `build → validate → canonical pack → self-inspect` 流程和 `--no-build` 分支，确保阶段 status/diagnostics 保持可区分。
- [x] 6.2 实现由 plugin ID/version 得出的默认 `artifacts/*.lxp`、安全显式 output、禁止写入 `dist/`、同目录临时文件、flush 与 atomic commit，并覆盖失败清理和既有目标保护。
- [x] 6.3 定义并实现版本化 build summary，包含 Manifest identity、package protocol、compatibility、file/size facts、完整包 digest 和调用方形式的输出路径，不声明签名、来源、权限或安装成功。
- [x] 6.4 增加重复 pack 的逐字节/digest 一致性测试，改变源枚举顺序、mtime、owner/mode 仍得到相同产物，并验证 checksums 只位于 canonical package 内。
- [x] 6.5 实现受压缩大小上限约束的只读 `inspect`，输出 compatible/incompatible/invalid 和允许 facts，覆盖损坏 frame、checksum/resource failure、超限、invalid partial-fact suppression 及零文件系统/Host/Runtime mutation。

## 7. Public Package And End-To-End Gates

- [x] 7.1 实现 CLI package validation，检查 bin 可执行性、exports、files allowlist、license、模板资产、runtime dependency closure 和 size baseline，阻止根 tools、Rust/Host source、test generator、workspace source 与绝对路径进入 tarball。
- [x] 7.2 在系统临时目录安装真实 Contract、SDK、UI、Testkit 与 CLI tarballs，审计 lockfile/realpath/module graph，证明 consumer 不回链 checkout、根 `node_modules` 或 repository-local store metadata。
- [x] 7.3 对两种模板分别运行 create、安装、test、typecheck、build、validate、两次 pack 和 inspect，并把真实 `.lxp` 交给 Rust inspector/installer preparation boundary；加入每个阶段的失败负例。
- [x] 7.4 新增根 `check:plugin-developer-cli` aggregate gate，组合 package checks、workspace boundaries、template drift、CLI fixtures、跨语言一致性、tarball consumer 和 Rust preparation，并接入正常 workspace validation。
- [x] 7.5 更新 `docs/en` 的插件 workspace、project template、package format、validation 与新 CLI 文档和 indexes，并维护 `docs/zh` 相同路径的语义镜像；明确 build 副作用、validate/inspect 只读、Host 复验、pnpm 限制及 6.5/8.1 非目标。

## 8. Final Validation

- [x] 8.1 顺序运行 focused gates：`pnpm run check:plugin-developer-cli`、`pnpm run check:plugin-package-format`、`pnpm run check:plugin-project-template`、`pnpm run check:plugin-contract`、`pnpm run check:plugin-testkit` 和 `pnpm run test:workspace-boundaries`，修复全部 warning/error 后重跑失败项。
- [x] 8.2 顺序运行完整 frontend/shared validation：`pnpm run test`、`pnpm run format`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`，确认格式化后的 diff 后重跑受影响检查。
- [x] 8.3 即使本 change 预期不修改 Rust 生产语义，也因跨语言 corpus 与 installer preparation 受影响，顺序运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`。
- [x] 8.4 修复所有引入的 warning/error，顺序重跑 8.1–8.3 的完整最终集合；然后运行 `openspec validate add-plugin-developer-cli --type change`，核对所有 task 证据，更新双语文档一致性，并仅在全部通过后标记 `plugin-roadmap.md` Task 6.4 完成。
