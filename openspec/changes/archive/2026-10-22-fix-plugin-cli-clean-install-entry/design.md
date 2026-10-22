# Design

## Context

动机及范围见 [proposal.md](proposal.md)。本变更横跨公共包入口、安装顺序、发布包校验及插件验证调用方，因此需要设计说明；以下为拟实施方案，尚未修改实现。

当前证据：

- `packages/plugin-cli/package.json` 的 `bin.lensx-plugin` 指向 `./dist/src/bin.js`，`files` 只交付 `dist` 及包说明文件。`scripts/build.mjs` 生成并赋予该构建入口可执行权限，但不负责消费者的命令链接。
- `scripts/ci.ts` 已按工作区拓扑构建公共依赖；`scripts/validation/catalog.ts` 的 `plugin-host-http` 也准备 CLI 后运行 Translation E2E。两条路径均不重建消费者 `.bin`。
- `packages/plugin-cli/scripts/verify-package.mjs` 固定检查旧 bin 路径、tarball 文件白名单与可执行模式，需要随新入口原子更新。
- `scripts/check-plugin-developer-cli.ts` 已通过 `plugin-developer-cli` Gate 使用真实 tarball 和系统临时消费者验证两个模板。其先 build 再 pack 的顺序不能证明安装时缺少 `dist` 的工作区行为。
- `tests/ci.test.ts` 的干净输出测试模拟创建目录，只证明步骤顺序；Translation E2E 只检查 `spawnSync` 的 `status`，遗漏 `error` 与 `signal`。
- 稳定规范已有干净依赖准备和公共 CLI 隔离消费要求，但尚未明确构建前的入口链接与启动失败诊断。本变更补充这两个边界，不修改现有命令语义。

## Goals / Non-Goals

**Goals:**

- 将“安装时能链接入口”与“构建后能执行命令”分开，使同一入口跨越构建步骤保持有效。
- 让源码工作区与发布包共享一个薄入口，并保留同一 CLI runner、参数、工作目录、标准流和退出码行为。
- 建立不依赖本地残留输出的确定性回归；同时保留真实公共命令调用与包隔离证据。
- 只在验证调用方补充启动/退出/输出诊断，不改变 CLI 公共 JSON envelope。

**Non-Goals:**

- 不提供未构建源码工作区的完整 CLI 功能，不让入口自动 install、build 或执行 TypeScript 源码。
- 不通过二次安装、重链接、全局 CLI、内部路径 fallback 或新的工作流掩盖问题。
- 不调整 React 界面、翻译服务、Host/Tauri 权限、Rust 数据协议、包版本或依赖版本。

## Decisions

### 1. 使用已纳入源码的薄 Node 入口

新增 `packages/plugin-cli/bin/lensx-plugin.mjs`，保留 Node shebang，通过包内相对 ESM 导入转发至 `../dist/src/bin.js`。`package.json` 的 `bin.lensx-plugin` 指向该文件，`files` 精确加入该入口。入口不解析命令、不捕获并改写 runner 结果、不修改 cwd、argv、环境或标准流；既有构建入口继续设置进程退出码。

保留 `src/bin.ts` 及 `dist/src/bin.js`，避免扩大到现有内部工具调用迁移。`scripts/build.mjs` 仍只生成本包产物，不触发递归依赖构建或消费者链接。新文件在源码和 tarball 中均具备正确的入口内容与可执行模式，包校验同时检查新入口和原构建目标存在、文件白名单、依赖及 exports 边界。

取舍：构建后由 Gate 再次 install/rebuild/relink 虽可能减少某一处文本改动，却需同时维护两条 Gate 与本地调用路径，并保留首次安装警告。安装脚本自动构建与现有 `--ignore-scripts` 流程不兼容。直接调用 CLI 的内部文件或公开函数会改变 E2E 验证真实可执行入口的边界。薄入口集中修复包本身的安装契约，不增加运行时依赖。

### 2. 在现有 CLI Gate 增加独立的源码干净安装阶段

扩展 `scripts/check-plugin-developer-cli.ts`，复用其 `temporaryRoot` 和 `finally` 清理边界；如为可读性拆分辅助模块，该模块仍由同一 Gate 调用，不新增 root script 或独立 Gate ID。新增阶段与现有 tarball 两模板验证并列，后者不被替换。

该阶段按以下顺序验证：

1. 在系统临时目录创建源码工作区副本，复制当前待验证版本的真实根 manifest、锁文件、workspace 配置，以及锁文件所涉及成员的 manifest 和 Contract/CLI 构建所需源码、模板及模板校验输入。显式排除所有 `node_modules`、`dist`、`.build`、Cargo 输出、Git 元数据和缓存；纳入本次新建薄入口，不以只枚举已提交文件而遗漏待验证文件。
2. 在安装前断言 Contract/CLI 的 `dist` 与消费者 `.bin/lensx-plugin` 不存在。使用项目声明的 pnpm `11.17.0`，在临时工作区执行 frozen-lockfile、ignore-scripts 安装；沿用现有 consumer 阶段的 offline 策略和机器全局 store，缺少离线依赖时明确报安装阶段失败。
3. 安装后立即检查 Translation 消费者的 `lensx-plugin` shim/链接存在且指向副本内的源码薄入口，记录其内容或链接目标；检查安装日志没有该入口缺文件的警告，且安装未生成 Contract/CLI `dist`。
4. 只在副本内按 Contract → CLI 顺序执行既有 build，并确认入口未被替换。中间禁止再次安装、重链接或从原 checkout 复制产物。
5. 通过首次安装产生的消费者命令入口执行 `--help`、`--version`；用公共 `create` 生成 framework-neutral 项目并提供符合现有契约的最小静态产物，再通过同一入口执行 `validate --json`。该最小产物只用于 CLI validate，不替代现有两模板的真实构建、双次 pack 和 inspect。
6. 检查副本锁文件未改变、CLI/Contract 的 realpath 留在副本内，并清理继承的原 checkout `node_modules/.bin` 和 `NODE_PATH` 污染。测试不能靠全局 `lensx-plugin` 成功；支持直接调用初次安装 shim 或只暴露副本 `.bin` 的子进程 PATH。
7. 成功、安装失败、构建失败或调用失败都使用同一清理边界。当前 checkout 的源码、锁文件、根 `node_modules` 不可被该阶段删除、重建或改写。

这里允许的工作区链接只发生在隔离源码副本内部；后续发布包消费者继续使用真实 tarball，并禁止任何回指源码 checkout 的链接。两类证据分别报告，不能混为“发布包已在源码安装前构建”。根目录执行的 pnpm 命令不传 `--store-dir`；临时消费者如需显式 store，只能使用读取到的机器全局 store 路径。

### 3. 提取无副作用的 CLI 结果判定，保持真实执行

Translation E2E 保留 `spawnSync('lensx-plugin', [...args, '--json'], ...)`。将结果分类与 JSON 结果判定抽到 `plugins/translation/scripts/` 下一个不带顶层 I/O 的内部辅助模块，由现有 `tests/**/*.test.ts` 范围覆盖，不导入会扫描产物、创建目录或打包的 E2E 主文件。

判定顺序为：

1. 有 `error`：报告启动失败，保留 `code` 或错误名称；此时不读作正常退出结果。
2. 有 `signal`：报告信号终止；未知的 `status === null` 也必须作为独立失败，不能默认成功。
3. 非零 `status`：报告实际退出状态。
4. 成功退出后才解析 stdout，区分空输出、非法 JSON、错误结果形状或不符合当前子命令预期的状态。
5. 成功时返回既有结果，继续原有 validate、双次 pack、inspect、摘要与清理断言。

诊断标识 `lensx-plugin` 和子命令，将缺失 stdout/stderr 规范为明确占位。每路输出摘要最多保留 4 KiB 并标记截断，不输出整个环境对象或额外读取文件；错误细节仅服务工程验证，不新增产品文案或改写 CLI 的机器协议。

Rstest 用构造的结果覆盖 ENOENT、EACCES、无输出、信号、非零退出、未知 null 状态、空/非法 JSON、错误成功状态和 validate/pack/inspect 成功值；无需真的启动进程。真实子进程与安装/构建仍留在 Gate consumer 阶段。

### 4. 复用现有验证及文档所有权

复用 `plugin-developer-cli` 进行源码安装与发布包隔离验证，使用 `ci-plugins` 和 `plugin-host-http` 验证两条真实消费者路径；`ci-workflows`、`workspace-boundaries` 和 `workspace-lifecycle` 验证工作流与包边界。标准根 `test`、`typecheck`、`check`、`build` 及 Rust 验证仍单独记录，不以 focused Gate 替代完整验证。

在既有 `docs/en/development/plugin-developer-cli.md`、`continuous-integration.md`、`translation.md` 中说明入口、构建时机、回归范围及失败诊断，并同任务更新 `docs/zh/` 对应文件。计划不增加文档或改动索引、根规则、语言关系等治理表面；归档前仍按实际 diff 复核项目级审计触发条件，任何修复导致治理变更时扩大审计，而不是预先宣称无需审计。

## Risks / Trade-offs

- [薄入口遗漏打包或不可执行] → 同步精确文件白名单、manifest bin 和源码/tarball 模式检查，保留真实 tarball consumer 验证。
- [源码副本不完整或残留产物导致假通过] → 使用真实 workspace/lockfile 输入、显式排除输出、安装前负断言、首次 shim 身份检查与解析路径审计；不能仅把 `dist` 目录存在作为验收。
- [复制的测试工作区借用原 checkout 工具] → 隔离 PATH/NODE_PATH 并检查关键依赖 realpath；所有安装与构建在副本内执行。
- [干净安装增加 Gate 耗时和离线 store 前置条件] → 只新增一套源码安装阶段，按锁文件消费已安装依赖的机器全局 store；失败明确归到安装阶段，不重试成假成功。
- [入口已链接被误解为未构建也能运行] → 文档明确先安装再构建；未构建调用只保证失败且无隐式副作用，不增加另一套引导 CLI 协议。
- [诊断重构弱化已有断言] → 保留命令状态、JSON、双次打包字节、摘要和清理断言，并用纯结果测试覆盖成功与失败分支。

## Migration Plan

1. 在同一实现变更中交付薄入口、manifest 与包检查更新，再添加源码安装回归和结果诊断测试；不需要数据迁移。
2. 完成现有消费者 Gate、完整工作区/Rust 验证与双语文档更新。安装已有旧 shim 的工作区仍可使用保留的 `dist/src/bin.js`，无需强制清理用户依赖。
3. 合并/发布由另行授权处理，本变更不自动发布或改版本。需要回滚时整体回退入口、manifest、包检查及相关测试/文档，避免元数据与打包清单只回退一半；回滚会恢复原干净安装限制，不能以跳过 E2E 维持表面通过。
4. 归档前将接受的 delta 内容转为英文同步 stable specs，完成变更范围审计、按触发条件开展项目级审计，验证同步结果后才允许归档。
