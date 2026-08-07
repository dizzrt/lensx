## Context

Task 6.6 位于 Milestone 6 的末尾。当前仓库已经有两份正式项目模板、五个公共开发 package、canonical `.lxp` 管线、真实 iframe Runtime/Host API、Plugin Management Settings 与显式 Plugin Development Mode，也已经有架构文档和按能力拆分的开发文档。问题不是缺少单个事实，而是这些事实面向维护者分散书写，缺少外部开发者入口、完整学习顺序和跨文档一致性门禁；部分旧段落还把已经交付的能力描述为未来工作。

本 change 的读者包括第一次创建插件的仓库外开发者、需要查询 Host API/权限/错误的插件作者，以及维护公共契约和文档门禁的 lensX 贡献者。文档必须服从当前源码与测试、稳定规格、English canonical 文档的事实顺序，不能以 Roadmap checkbox 代替实现证据。

当前公共 package 尚未发布到 npm。仓库已经能构建真实 tarball，并在系统临时目录中以隔离 consumer 验证模板和 CLI；因此文档验收可以证明“只依赖可分发公共产物”，但不能把尚不存在的 registry 渠道写成已经发布。

## Goals / Non-Goals

**Goals:**

- 为外部插件作者建立 English canonical、简体中文同路径镜像的稳定入口和渐进式信息架构。
- 用 framework-neutral 与 React/Semi 两条教程覆盖从创建到可安装 `.lxp` 的完整路径，并解释开发 reload 与正式安装的区别。
- 为 Contract、SDK、UI、Testkit、CLI、Runtime 生命周期、Host API、权限、错误、兼容和安全边界提供可查询且不泄漏 Host 私有协议的参考。
- 让所有被当作可运行示例的代码和命令由真实公共 tarball、正式模板、公共 CLI 与 Host 安装准备边界自动验证。
- 让 Host API 方法、权限、错误、版本、当前 provider 可用性以及双语路径发生漂移时产生确定性失败。
- 在全部新门禁通过后准确更新 Roadmap Task 6.6 和 Plugin Developer Preview 状态。

**Non-Goals:**

- 不改变任何插件产品契约、Host provider、Tauri command、Runtime 安全策略、权限决策或持久化模型。
- 不增加 watch/HMR、自动 reload、签名、远程分发、Marketplace、更新或 rollback 产品能力。
- 不发布 npm package，也不为未来 registry、下载 URL 或 release artifact 作承诺。
- 不建立独立文档网站、搜索服务、代码生成站点或第二套 Manifest/Host API/`.lxp` 校验器。
- 不要求人工重放完整桌面流程作为 change 的完成证据；现有原生/Runtime 自动化证据与边界测试继续承担这部分验证。

## Decisions

### 1. 建立独立的外部开发者文档层，同时复用现有事实源

新增 `docs/en/plugin-development/` 及完全同构的 `docs/zh/plugin-development/`，至少包含：

- `index.md`：学习路径、能力状态和技术栈选择；
- `tutorial-framework-neutral.md` 与 `tutorial-react-semi.md`：两条完整教程；
- `public-packages.md`：Contract、SDK、UI、Testkit 的用途、exports 与依赖边界；
- `tooling-and-installation.md`：CLI、Development Mode、`.lxp` 和本地安装；
- `host-api.md`：方法、参数/结果、capability 与权限矩阵；
- `runtime-permissions-security.md`：初始化、context replacement、错误/重试/销毁、权限和隔离边界；
- `compatibility-and-errors.md`：版本维度、兼容判断、稳定错误和排障顺序。

双语顶层索引链接到新的 developer hub。现有 `docs/en/development/plugin-*` 和架构文档继续承载维护者细节与验证说明，但外部教程不得要求读者查看 `src/`、`src-tauri/`、内部脚本或私有 wire。重复事实应收敛到一个 canonical developer 页面，其他页面使用相对链接和简短上下文，避免复制完整表格。

**替代方案：**只扩写现有专题文档。该方案不能形成清晰的外部学习入口，而且会把维护者验证、Host 私有设计与插件作者操作继续混在一起，因此不采用。

### 2. 把“契约存在”“Host 已实现”“当前 session 可用”明确分层

Host API 参考以公共 `HOST_API_METHOD_CATALOG`、permission catalog、公开请求/结果/错误类型和公开版本常量为契约事实源；以生产 Dispatcher 组合和现有 provider 测试为“当前 Host 已实现”的事实源；以 `PluginRuntimeContext.capabilities` 为单次 Runtime session 的最终可调用事实。每个方法条目必须说明：

- 公共 method id、参数、结果与相关稳定错误；
- 是否需要 Manifest permission，以及 declared/requested/granted/effective 的区别；
- 当前 Host provider 条件和 `capabilities` 检查方式；
- cancellation、timeout、session replacement 与 unavailable 时的恢复动作。

文档验证读取已有公开 catalog/Schema 和现有生产组合证据，检查文档覆盖集合与权限映射完全一致；它不复制或重新解释权限算法。私有 postMessage envelope、nonce、origin、Tauri payload 和 Host 路径不会进入开发者文档。

**替代方案：**手写一张不与代码关联的 API 表。它短期简单，但最容易把声明的方法误写为实际可用方法，因此不采用。

### 3. 两条教程共享同一生命周期，但保留技术栈差异

两条教程都执行以下可观察流程：

1. 说明 Node/pnpm、lensX build 和公共 tarball 前置条件及当前未发布 npm 的限制；
2. 使用真实 `lensx-plugin create` 生成独立项目；
3. 安装依赖并运行 test、typecheck、build、validate；
4. 解释 Manifest Page/Action/resource 与 SDK 初始化、完整 context replacement、失败/显式 retry、幂等 cleanup；
5. 使用专用 Host build 显式启用 Development Mode，对自包含 `dist/` 执行 register 和手动 reload；
6. 使用 CLI pack/inspect 得到 canonical `.lxp`；
7. 通过 Settings 的本地安装路径安装并运行，解释 requested/granted/effective permission 和诊断边界。

framework-neutral 教程只使用浏览器 DOM 和公共 SDK。React/Semi 教程额外使用 `PluginUiProvider`、公开样式入口、键盘/焦点语义、`en-US`/`zh-CN`、light/dark 和 loading/empty/error/recovery 状态。两个教程都以无权限示例作为基础，再在 Host API 章节单独解释权限能力，避免默认模板静默请求敏感权限。

**替代方案：**把 React 教程写成 framework-neutral 教程的少量差异补丁。这样读者无法独立完成任一路径，也难以自动验证，因此两条教程必须各自完整，但公共解释通过链接去重。

### 4. 可运行代码块必须绑定受维护源码或独立编译单元

Markdown fenced code block 使用文档门禁可识别的 metadata：

- `source=<project-relative-path>` 表示内容必须与正式模板或公共 package 中的完整文件/明确片段一致；
- `verify=<group>` 表示片段被抽取到对应 tutorial consumer 的编译单元并进入 typecheck/build；
- shell block 必须声明 `verify=command`，由门禁与 CLI `--help`、package scripts 和允许的 Host 启动命令核对。

JSON 示例必须通过对应公共 Schema 或 fixture validator。完整可复制示例不得标记为 illustrative；仅用于解释形状且不能执行的伪代码必须显式标记，并且不能承担教程步骤。检查器为 metadata 解析、缺失 source、错误 region、未覆盖 runnable block、失效命令、绝对路径和私有 import 提供单元测试。

**替代方案：**只运行 Markdown lint 或搜索固定 marker。它无法证明代码可编译、命令存在或示例没有引用 workspace 私有实现，因此不采用。

### 5. 使用真实 tarball 和临时 consumer 验证外部闭环

新增聚合门禁 `pnpm run check:plugin-development-documentation`，至少组合：

- 文档树、相对链接、锚点、English/Chinese 路径和必需章节检查；
- API/permission/error/version/availability coverage 检查；
- Markdown runnable block 提取与单元测试；
- Contract、SDK、UI、Testkit、CLI 真实 tarball 构建；
- 在系统临时目录中分别通过 CLI 创建两个项目，以 consumer-owned override 指向 tarball，使用机器配置的全局 pnpm store 安装并运行 test、typecheck、build、validate、repeat pack 与 inspect；
- 对生成的 `.lxp` 复用 canonical TypeScript/Rust inspector 和受控本地安装准备边界；
- 复用现有 Plugin Development Mode、Runtime、permission、template 与 CLI focused gates，证明文档没有扩大能力。

consumer 不得解析到 repository root `node_modules`，不得使用 `workspace:`、`file:` 或 `link:` 依赖回指源码，也不得从根工作区执行 consumer 生命周期。临时目录在成功和失败时都清理。仓库根 pnpm 命令仍使用机器配置的全局 store，绝不通过 `--store-dir` 改写根 `node_modules/.modules.yaml`。

真实桌面文件选择器不进入文档 gate；Development Mode 的自动化 transaction、WKWebView Runtime evidence 和生产 build exclusion 已有 focused gates，聚合门禁复用这些证据而不是加入脆弱的人工步骤。

**替代方案：**只复用仓库内 workspace 模板构建。该方案可能通过 workspace linking 隐藏未声明依赖，不能证明外部开发者路径，因此不采用。

### 6. 状态更新是门禁后的原子收尾

实现先增加 developer 文档和验证，再校准已有专题文档/架构文档中的过时表述，最后更新 `plugin-roadmap.md`：勾选 Task 6.6、链接本 change，并把 Plugin Developer Preview 当前进度改为与源码、测试和稳定规格一致。Roadmap gate 必须拒绝“Task 已勾选但文档聚合门禁或双语索引未接入”的状态。

README、`AGENTS.md` 和 `openspec/config.yaml` 不承载具体开发教程。稳定 spec 在归档前转换为 English；active change 工件继续使用本次对话语言。

**替代方案：**先勾选 Roadmap、后补验证。这样会再次产生计划状态领先于交付证据的问题，因此不采用。

## Risks / Trade-offs

- **[外部文档与维护者文档重复]** → 明确 developer layer 的受众，完整表格只保留一个 canonical 位置，其他页面用相对链接。
- **[API availability 依赖运行时条件，静态表容易过度承诺]** → 表只记录 provider 条件；教程要求每次使用前检查 session `capabilities`，门禁分别验证 contract、production composition 与 permission 映射。
- **[未发布 npm 限制“开箱即用”]** → 明示真实 tarball 前置条件；测试用 tarball override 只证明隔离消费，不把它描述为公开 registry。npm 发布保留给独立 change。
- **[文档 metadata 增加写作成本]** → 只对可运行 code/command block 强制 metadata，并提供清晰诊断和小型 parser 单元测试。
- **[外部 consumer gate 较慢且依赖离线 store 内容]** → 复用现有已验证 tarball/consumer helper，保持一个聚合入口；sandbox 写权限失败时在允许写入系统临时目录的环境重跑，不能把环境问题判为代码失败。
- **[双语语义无法完全由机器翻译验证]** → 自动验证同路径、标题映射、链接、代码和标识符；人工语言评审仍属于内容 review，但完成证据不依赖人工 GUI replay。
- **[Roadmap 其他旧段落超出本 change]** → 只修正与 Milestone 6、当前公共开发能力和教程链接直接相关的漂移；无关路线规划不顺手重写。

## Migration Plan

1. 建立双语 developer 文档目录、索引和教程骨架，不改变现有文档入口。
2. 增加 code-block/API coverage/parser 单元测试和聚合门禁，使新内容可以增量通过。
3. 完成两条教程与参考文档，接入真实 tarball external consumer 和现有 Host focused gates。
4. 将双语顶层索引切换为推荐 developer hub，收敛或链接现有重复内容，并修正直接相关的状态漂移。
5. 运行完整 focused gate 与仓库最终验证；仅在全部通过后更新 Task 6.6 和 Plugin Developer Preview 状态。

本 change 没有数据或协议迁移。回滚时必须一起撤销新文档入口、文档门禁和 Roadmap 完成状态；公共 package、Runtime、已安装插件和用户数据不受影响。

## Open Questions

无。npm/package registry 发布、独立文档站点和远程分发均明确留给后续 change，不阻塞本 change 以真实 tarball 证明仓库外消费边界。
