## Context

Task 6.4 位于正式项目模板和 Development Mode 之间。当前仓库已经实现以下基础：`@lensx/plugin-contract` 负责 Manifest 与兼容性语义；`@lensx/plugin-testkit` 提供作者侧测试能力；两个 `examples/plugins/*` 项目证明 framework-neutral 与 React/Semi 插件可以在仓库外安装依赖、构建并进入真实 Runtime 主路径；`tools/plugin-package-format` 和 Rust inspector 通过同一 fixture corpus 实现 canonical `.lxp`；Host installer 在内容检查之外继续负责来源、受信任路径、持久化和生命周期。

缺口是这些能力只有仓库内部 gate，没有外部开发者可安装的统一命令面。尤其 `tools/plugin-package-format` 明确是 Host 私有根工具，workspace boundary 禁止公共 package 或插件导入。CLI 不能简单引用该路径，也不能复制一套将来与 Host 漂移的编码和诊断规则。

主要使用者包括本地插件作者、官方插件维护者、第三方 CI，以及以 `.lxp` 作为不可信输入的 Host 安装链。第一阶段只要求 workspace 和独立 tarball consumer 可用；真正发布 npm、Development Mode、签名和发行平台属于后续 change。

## Goals / Non-Goals

**Goals:**

- 交付可打包的 `@lensx/plugin-cli` 与 `lensx-plugin` bin，覆盖 `create`、`build`、`validate`、`pack`、`inspect`。
- 用一个 TypeScript 纯核心实现作者侧 canonical packing/inspection，并继续用跨语言 corpus 保证 Rust Host 的内容结论一致。
- 让 `pack` 成为新项目的一条命令交付入口：默认执行 build、validate、pack，并原子写入 `.lxp`。
- 同时服务交互终端和 CI：本地化人类输出、版本化 JSON envelope、稳定诊断排序与退出码。
- 保持生成项目、CLI tarball 和 `.lxp` 产物不依赖当前 lensX checkout、根 `node_modules`、Tauri 或 Host 私有源码。
- 保持 Host 安装时的独立复验和所有来源、权限、持久化、Runtime 与生命周期边界。

**Non-Goals:**

- 不提供开发目录安装、watch、hot reload、iframe session reload 或其他 Task 6.5 Development Mode 能力。
- 不提供插件安装、启用、授权、升级、卸载或 Plugin Manager mutation。
- 不提供签名、密钥、provenance、官方来源判定或远程发布；后续 Task 8.1 可以在同一 CLI 增加独立命令。
- 不支持任意脚手架、第三方模板、交互式问答、自动安装依赖或自动初始化 Git。
- 不改变 Manifest、Host API、package protocol `0.1.0` 或 Host installer 的既有接受规则。
- 不新增前端 UI，因此 Semi Design、light/dark theme 和浏览器可访问性交互不适用。

## Decisions

### 1. 一个公共 package、一个 bin、五个稳定命令

新增 `packages/plugin-cli`，npm package 名为 `@lensx/plugin-cli`，公开可执行文件名为 `lensx-plugin`。第一版命令面固定为：

- `lensx-plugin create <target> --template <framework-neutral|react-semi> --plugin-id <id> --name <name>`；
- `lensx-plugin build [--project <dir>]`；
- `lensx-plugin validate [--project <dir>]`；
- `lensx-plugin pack [--project <dir>] [--output <file>] [--no-build]`；
- `lensx-plugin inspect <file>`。

所有项目命令在未给出 `--project` 时使用当前工作目录。第一版不增加 CLI 配置文件或隐式多项目搜索，避免在 Task 6.4 内预建通用 workspace orchestration。

选择独立 bin 而不是在根 lensX CLI 上增加子命令，是因为插件作者必须能在仓库外只安装公共 package。选择五个显式命令而不是一个多态命令，可以让副作用边界清晰：只有 `create` 写项目、`build` 执行项目代码、`pack` 写产物；`validate` 和 `inspect` 保持只读。

`plugin-cli` 是运行在 Node 中的公共作者工具，不是运行在 iframe 中的插件 Runtime package。workspace boundary 因此为它增加窄化的 `public-authoring-tool` 分类：允许声明的 Node built-ins、Contract 和经过审查的 CLI runtime dependencies，但仍禁止 root Host package、`src/app/**`、`src-tauri/**`、Tauri adapter、其他 workspace source deep import 和反向依赖。官方/示例插件可以把 CLI 声明为开发依赖并从 package script 调用 bin，但插件 `src/**` 不得静态或动态 import CLI。这样不会为了 CLI 文件操作能力放宽所有公共 Runtime package 的浏览器边界。

### 2. `create` 打包受维护模板快照，不在运行时读取仓库 examples

两个 Task 6.3 模板仍是项目拥有的 canonical 示例。`@lensx/plugin-cli` 构建时把经过审计的模板资产复制进自身 tarball，并用 drift gate 比较脚手架资产与 canonical examples 的结构、依赖范围、公共 imports、生命周期脚本和无权限示例语义。运行 `create` 不访问网络，不读取 lensX checkout，也不安装依赖；它只校验参数、替换允许的 package name、plugin ID 和 display name 字段，并写入一个新的目标目录。

目标存在且非空、输入 ID 非法或替换后模板不再通过 Contract 时，命令在 commit 前失败。文件先写入目标同级 staging 目录，完成校验后原子 rename；中断或失败清理 staging，不覆盖现有用户文件。

未选择直接从 GitHub 下载模板，因为这会引入网络、版本漂移和供应链面；未选择把 `examples/plugins/*` 作为运行时文件路径，因为发布后的 npm package 不存在仓库布局。

### 3. `build` 只执行显式项目生命周期，`validate` 与 `inspect` 永不执行代码

生成项目声明受支持的 pnpm `packageManager` 和普通 `build` script。`build` 解析项目根 `package.json`，拒绝缺失、自递归或不受支持的生命周期，然后以参数数组而非 shell 字符串在项目根执行 `pnpm run build`。项目构建脚本本身是作者代码，因此人类输出在执行前明确提示该副作用；JSON 模式捕获并限制子进程输出，保证 stdout 仍是单个 JSON document。

成功构建必须产生项目根下的自包含 `dist/`，包含 `manifest.json` 和所有 Manifest 引用资源。`validate` 不隐式运行 build：它校验 package metadata、公共依赖/import 边界、Manifest、`dist/` 文件类型和路径、资源完整性、兼容性，并在内存中执行一次 canonical pack/inspect 以证明该 payload 可打包，但不写 `.lxp`。`inspect` 只读取一个受大小上限约束的 `.lxp`，不解压到磁盘、不安装、不执行脚本、不创建 Runtime session。

未选择让 `validate` 自动构建，因为 CI 和编辑器需要一个可证明只读的检查入口，也需要区分“构建失败”和“产物无效”。

### 4. `pack` 是一条命令交付入口，并以事务方式产出结果

`pack` 默认按 `build → validate → canonical pack → self-inspect → atomic output` 执行；`--no-build` 只允许对已经存在的 `dist/` 执行后四步。输入树只接受普通文件，不跟随 symlink，不保留来源权限、时间、owner 或目录 metadata，也不使用 ignore 文件隐式遗漏资源。

默认输出位于项目 `artifacts/` 下，文件名由已验证的 plugin ID 与 Manifest version 确定；显式 `--output` 不能位于 `dist/` 内。CLI 在目标同目录创建唯一临时文件，flush 后原子替换本次命令允许写入的目标；任何失败都不留下半成品。重复打包相同 payload 必须产生相同 bytes 和 digest。

成功结果包含版本化 build summary：plugin ID、Manifest version、package protocol、兼容性、文件数、压缩/解压大小、完整包 SHA-256、以调用方输入形式表示的输出路径。`checksums.json` 只存在于 `.lxp` 内，summary 不冒充签名或来源证明。

### 5. 把 package-format 纯核心迁入 CLI 内部，其他仓库消费者 dogfood CLI

将 `tools/plugin-package-format` 中不涉及 Host 状态的 constants、path、checksums、canonical TAR、Zstandard、Manifest adapter、diagnostics、pack 和 inspect 迁入 `packages/plugin-cli` 的内部模块。该模块服务 bin 与 package 自身测试，但第一版不声明独立公共 JavaScript API；`package.json#exports` 只公开 CLI package 的受支持入口和 bin，阻止插件依赖未承诺的 codec 深路径。

现有根 fixture generator、模板 package gate 和 Runtime fixture 生成器不再跨 workspace import CLI 源文件：能够以进程验证的路径改为调用已构建/已打包的 `lensx-plugin`，底层 corpus 测试迁入 package 自身。迁移期可以保留一个根私有 wrapper，但 change 完成前删除旧实现和重复常量。

未选择新增 `@lensx/plugin-package-format`，因为路线图没有把 codec 定义为插件 Runtime API，额外 package 会扩大版本与支持面；未选择把 codec 放进 `plugin-contract`，因为 package protocol 与 Manifest/Host API contract 独立版本；未选择复制实现，因为那会破坏同一 TypeScript 判断源。

Rust inspector 保持独立实现和 Host 私有边界。两种语言继续消费同一 committed corpus，比较三态 status、normalized Manifest、compatibility、文件事实、package digest 以及排序后的 diagnostic code/path。Host installer 可在内容结论之后因来源竞态、文件身份、持久化或 Manager 状态额外拒绝；这不属于 CLI/Host 内容不一致。

### 6. 机器输出是稳定协议，人类输出是可本地化视图

所有命令支持 `--json` 和 `--locale <en-US|zh-CN>`。人类输出默认 `en-US`，可以显式选择简体中文；所有可见 CLI 自有文案进入 package-local message catalog。JSON 不随 locale 改变，stdout 恰好输出一个 envelope：

```json
{
  "schema_version": "1",
  "command": "pack",
  "status": "success",
  "result": {},
  "diagnostics": []
}
```

诊断使用稳定的 `{code, path, message_key, arguments}`，按 code/path/arguments 确定性排序并去重。`path` 是 Manifest JSON Pointer、package 内路径或调用方提供的相对项目路径；不得包含绝对 Host 路径、文件内容、stack、nonce、grant 或原始异常。人类 renderer 根据 `message_key` 和 arguments 产生本地化文本。

退出码固定为：`0` 成功且 compatible；`1` 确定性的 invalid/incompatible；`2` 命令用法或不支持的项目配置；`3` 构建、I/O 或其他受控操作失败。`--help` 与 `--version` 返回 `0`。在 JSON 模式，即使退出非零也尽可能输出合法 envelope；CLI 无法启动等进程级失败不伪造业务结果。

### 7. package tarball 与外部消费者是公共边界证明

CLI package 遵循其他公共 plugin packages 的 license、metadata、Node engine、`files` allowlist、普通 SemVer dependency、build/typecheck/test/check/test:pack 生命周期。tarball gate 检查 bin 可执行入口、exports、模板资产、许可证和依赖闭包，不得包含 `src-tauri/**`、根 `tools/**`、测试 fixture generator、其他 workspace source 或绝对路径。

外部 consumer 在系统临时目录安装真实 Contract、SDK、UI、Testkit 与 CLI tarball，分别创建两类项目，运行 build/validate/pack/inspect，重复打包并把结果交给 Rust inspector/installer preparation boundary。consumer 必须审计 lockfile 和模块解析，证明没有回链到 lensX checkout 或根 `node_modules`。

## Risks / Trade-offs

- [迁移 package-format 核心可能破坏现有 fixture 和模板 gate] → 先冻结 corpus 与公开行为，逐个迁移调用者；旧 wrapper 只在迁移期间存在，最终 drift gate 检查没有重复实现或旧路径 import。
- [CLI build 会执行插件项目代码] → 仅 `build` 和默认 `pack` 执行明确 lifecycle；执行前在人类模式提示，`validate`/`inspect` 保持只读，`pack --no-build` 支持已隔离构建的 CI。
- [捕获构建日志可能造成内存或敏感信息泄漏] → JSON 模式使用有界 stdout/stderr，诊断只给安全摘要；人类模式允许直接流式显示作者自己的构建输出。
- [模板快照与 examples 漂移] → package build 和根 aggregate gate 比较结构与语义，任何单边修改都失败。
- [CLI 与 Rust 对兼容性或诊断漂移] → 同一 corpus 双向验证并把差异视为 release blocker；不通过消息文本比较本地化输出。
- [原子替换会覆盖已有同名 `.lxp`] → 只覆盖用户显式指定或确定性默认目标，且在所有检查成功后替换；不删除其他 artifact。
- [仅支持 pnpm 限制早期采用] → 两个正式模板和仓库政策均使用 pnpm，先保持可验证窄范围；未来可在独立 change 增加 npm/yarn/bun adapter。
- [package 体积因 Zstandard codec 与模板资产增加] → 记录精确依赖与 tarball size baseline；仅打包运行时必需文件，不携带测试/Host 实现。

## Migration Plan

1. 建立空的公共 CLI package、命令解析/输出协议和 package/tarball boundary gate，不改变现有 package-format 调用者。
2. 将 TypeScript package-format 纯核心及其测试迁入 CLI package，通过原 corpus 后逐个切换根 fixture/template 调用者，随后删除旧私有实现与重复常量。
3. 将两类 canonical templates 变成受 drift gate 保护的 CLI 资产，实现事务式 `create`。
4. 实现项目发现、受控 `build`、只读 `validate`、事务式 `pack` 和只读 `inspect`，再接入 JSON/locale/exit-code 合同。
5. 运行独立 tarball consumer、跨语言 corpus、Rust installer preparation 和全仓验证，更新双语文档，最后标记 Task 6.4。

回滚不涉及持久数据 schema：移除新 package 与根脚本接线，并恢复迁移前的私有 TypeScript tool 即可。CLI 生成的项目仍是普通模板项目；已经生成的 `.lxp` 仍按独立 package protocol 由 Host 判断，不依赖 CLI 安装状态。npm 发布不在本 change 内，因此无需远程撤回步骤。

## Open Questions

- 第一次真正 npm 发布的版本、tag 与 release automation 由后续发布工作决定；本 change 只需真实 tarball 外部消费通过。
- Task 8.1 后续是直接扩展 `lensx-plugin sign`，还是引入独立签名工具，需结合密钥与 provenance 设计决定；本 change 不预留私钥或签名抽象。
