# Plugin Developer CLI

## 范围

`@lensx/plugin-cli` 是用于 lensX 插件的公共 Node 24 作者工具 package。其 `lensx-plugin` bin 在本地终端
与 CI 中支持 `create`、`build`、`validate`、`pack` 和 `inspect`。该 package 会以真实 tarball 验证，
但本仓库尚未将其发布到 npm。

CLI 不要求运行中的 Host、Tauri、Rust、lensX checkout 或根 `node_modules`。它不是插件 Runtime dependency，
其 package-format modules 属于 internal，不是公共 JavaScript API。

## 命令表面

```bash
lensx-plugin create <target> --template <framework-neutral|react-semi> --plugin-id <id> --name <name>
lensx-plugin build [--project <dir>]
lensx-plugin validate [--project <dir>]
lensx-plugin pack [--project <dir>] [--output <file>] [--no-build]
lensx-plugin inspect <file>
```

每个命令都接受 `--json` 和 `--locale <en-US|zh-CN>`。`--help` 与 `--version` 成功返回。项目命令未显式
提供 `--project` 时只使用当前目录，绝不搜索父目录。

## 副作用与项目契约

`create` 事务式写入一个新项目。`build` 执行项目显式声明的 `pnpm run build`。默认 `pack` 会执行该 build
并写入一个 `.lxp`；`pack --no-build` 不执行项目代码但仍会写包。`validate` 与 `inspect` 保持只读。

项目必须声明 `pnpm@11`、普通 SemVer dependencies，以及有效的 `build`、`typecheck`、`test`、`check`
scripts。构建必须生成自包含 `dist/manifest.json` 与全部引用资源。CLI 会拒绝递归 CLI build script、Host 私有
import、Tauri import、未声明公共 import、symlink、特殊文件、不可移植/冲突 path，以及协议 size/count 违规。

当前 authoring 仅支持 WebView：Manifest `0.4.0`、`runtime.kind: "webview"` 与
`@lensx/plugin-sdk/webview`。Manifest `0.3.x` 或更早版本、iframe Runtime 或 SDK `/iframe` import 会返回稳定的
`CLI_LEGACY_IFRAME_RUNTIME` incompatible diagnostic 与迁移说明；CLI 绝不会改写旧项目。

## Create

`create` 打包两个 canonical `examples/plugins/*` 项目的 byte-checked snapshot。它只替换经过验证的项目名称、
package 名称、plugin ID 与对应 display/test placeholder，然后重新运行 Manifest Contract。它不访问网络、
不安装依赖、不初始化 Git、不运行项目代码，也不覆盖非空目标。

文件先写入唯一的同级 staging directory，完整验证后才用 atomic rename 提交。失败和中断会清理 staging。
生成项目不请求权限，machine output 会报告 `runtime_kind: "webview"`。其 Page 省略
`presentation`，因此规范化为固定 `650×600`。作者可显式声明精确的
`presentation.initial_size` 和 `presentation.resizable`，但这仍是元数据，不会增加 Runtime resize method。

## Build 与 Validate

`build` 在执行项目代码前验证 package metadata、imports 与已有 author Manifest，并通过参数数组而非 shell
command composition 启动 `pnpm`。
human 模式流式显示作者自有 build log；JSON 模式只进行有界捕获，因此 child output 不会污染单一 JSON document。
非零退出、signal 或缺失/空 `dist/manifest.json` 都属于 operational failure。

`validate` 永不运行 build。它验证 metadata/imports，不跟随 link 地遍历既有 `dist/`，检查 Manifest 与资源，
并完全在内存中执行 canonical pack 与 self-inspection。它区分 `compatible`、`incompatible`、`invalid`，且不修改
项目或 artifact directory。

成功的 `build`、`validate`、`pack` 与 `inspect` machine result 都会报告
`runtime_kind: "webview"` 与有界 `page_presentations` summary；summary 只包含 Page ID、声明的初始
逻辑尺寸和 `resizable`，不包含 monitor/work-area、有效 clamp、当前用户尺寸、native handle
或转换错误。legacy incompatible result 不暴露 partial Manifest identity 或 package facts。

## Pack 与 Inspect

默认 `pack` 执行 `build -> validate -> canonical pack -> self-inspect`；`--no-build` 只跳过第一阶段。默认输出是
`artifacts/<plugin-id>-<version>.lxp`，显式 output 不得位于 `dist/`。字节先写入目标同目录唯一临时文件并 flush，
所有阶段成功后才 atomic rename。相同 payload bytes 的重复打包会得到相同 checksums、package bytes 与 SHA-256。

版本化 build summary 报告 Manifest identity、package protocol、compatibility、file/size facts、整包 digest 与调用方
形式的 output path；它不声称签名、provenance、信任、权限、安装或授权。

`inspect` 对一个 `.lxp` 执行有界只读 classification。它不会解压到磁盘、安装、执行 payload、修改 Plugin Manager、
授予权限或创建 Runtime Session。invalid 结果不会返回 partial Manifest、file 或 digest facts。

## 输出与退出码

human 输出默认 `en-US`，通过 package-local message catalogs 支持 `zh-CN`。JSON 与 locale 无关，且恰好输出一个
schema version `1` document：

```json
{"schema_version":"1","command":"validate","status":"compatible","result":{},"diagnostics":[]}
```

Diagnostics 使用稳定 code、受限 path、message key 与结构化 arguments，并排除绝对 Host path、文件内容、raw error、
stack、环境 secret、nonce 和 grant。退出码是：成功/compatible 为 `0`，invalid/incompatible 为 `1`，用法或不支持
项目配置为 `2`，受控 build/I/O failure 为 `3`。

## Host 权威与当前限制

CLI 接受只表示 package 内容兼容当前公共 contract。Host 会独立重新读取并复验不可信 bytes，仍可因 source identity
race、存储 failure、冲突、Manager state 或 lifecycle condition 拒绝，且不改变内容 classification。

Host 的独立 Development Mode（插件开发模式）可以使用已构建的 `dist/`，但它不是 CLI command 或公共 CLI API。
CLI 仍不会启用 Host 模式、注册、安装、reload、移除、授予权限或创建 Runtime authority。
Host directory inspection 只在双方共有的自包含 `dist/` payload 语义上与 `validate` 对齐；
CLI 的项目 metadata 与 import 检查仍是 CLI-only 结论。watch mode、签名、provenance、远程发布、
registry release automation 与自动更新仍不属于当前 CLI 版本。

## 验证

运行 package 专项门禁与完整外部 consumer 门禁：

```bash
pnpm --dir packages/plugin-cli run check
pnpm --dir packages/plugin-cli run test:pack
pnpm run gate -- plugin-developer-cli
```

根门禁会打包 Contract、SDK、UI、Testkit 与 CLI tarball，在系统临时 consumer 中使用机器配置的全局 pnpm store
安装它们，生成两类模板，运行 install、test、typecheck、build、validate、重复 pack 与 inspect，审计 lockfile 与
module realpath，并把两个包交给 Rust inspector 和 installer preparation boundary。
