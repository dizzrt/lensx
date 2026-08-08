# 插件 Workspace

## 范围

本仓库是一个 pnpm workspace，并将 `lensx` React/Tauri Host 保留为 private 根
package。workspace 为公共 package 和插件建立开发拓扑、lifecycle 聚合及依赖检查，并包含
可发布的 `@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-testkit`、可选
`@lensx/plugin-ui` 与 Node 作者工具 package `@lensx/plugin-cli`，但仓库验证不会执行 registry 发布操作。
Host 已能安装/注册并打开受支持的本地插件，SDK 也提供认证 iframe transport；production Host 私有
Dispatcher 已实现 `runtime.get_context`、`ui.close`、`actions.open` 与五个 plugin-scoped `storage.*` method。
只有 current Session 获得对应 grant 且 native provider 可用时，每个 clipboard method 才会独立进入 capabilities。
Contract package 独立交付完整十方法 Host API
语义 catalog 与 validator，不代表所有 provider 都可用。

已经交付的静态 Manifest 契约仍然只负责验证。package 位于本 workspace 内，并不代表它
获得 Host 信任、Tauri 访问权、权限或 Runtime 能力。

仓库维护的可运行起步模板及其隔离、package、Runtime 与 visual 门禁详见
[插件项目模板](plugin-project-template.md)。

## 受支持的成员位置

`pnpm-workspace.yaml` 只识别下列位置直接子目录中的 package manifest：

```text
packages/*
plugins/official/*
examples/plugins/*
```

`packages/*` 保留给公共 workspace package。官方插件和示例插件使用不同的成员区域，但遵守
相同的外部插件源码边界。位于这些模式之外或嵌套层级更深的 package 不是 workspace 成员。
`examples/plugin-contract-consumer`、`examples/plugin-sdk-consumer`、
`examples/plugin-testkit-consumer` 与 `examples/plugin-ui-consumer` 中的外部消费示例仍是普通项目
数据，不是 workspace package。

每个实际成员都必须声明全部四个 lifecycle scripts：

```json
{
  "scripts": {
    "build": "...",
    "typecheck": "...",
    "test": "...",
    "check": "..."
  }
}
```

这些 scripts 必须执行有效的 package 局部验证。不要使用占位命令，也不要省略 script，
因为根运行器会拒绝不完整的成员。

## Plugin Contract Package

`packages/plugin-contract` 持有公共 Manifest/Host API Schema、生成输入、规范化类型、协议
常量、诊断、不可变 catalog 和纯校验 API。受支持的 import 仅限：

```text
@lensx/plugin-contract
@lensx/plugin-contract/schema
@lensx/plugin-contract/manifest.schema.json
@lensx/plugin-contract/host-api-schema
@lensx/plugin-contract/host-api.schema.json
```

package 将 `ajv` 声明为直接 runtime 依赖，并复用现有 TypeScript 与 Rstest 工具链；其 runtime
表面不依赖 React、Semi Design、Tauri、DOM、Node filesystem 或 package bundler。使用以下
命令生成并验证契约：

```bash
pnpm run generate:plugin-manifest-types
pnpm run generate:plugin-host-api-types
pnpm run check:plugin-host-api-contract
pnpm run check:plugin-contract
```

完整检查会重建两组生成类型，运行 package 与 Host 边界测试，检查 Manifest/Host API 的
TypeScript/Rust 共享 fixtures，打出真实 Contract/SDK/Testkit tarball 并验证文件清单和 exports，
最后将其安装到隔离 no-DOM consumer 中执行 typecheck 与 Runtime smoke。它证明语义有效，
但不声称已经 dispatch 或执行副作用。

## Plugin Developer CLI 与 Package Core

`packages/plugin-cli` 提供公共 `@lensx/plugin-cli` package 和 `lensx-plugin` executable，支持
`create`、`build`、`validate`、`pack` 与 `inspect`。它是 Node 作者工具，不是 iframe Runtime
dependency。插件 package script 可以调用其 bin，但插件 `src/**` 不得 import CLI 或未声明 deep path。

该 package 持有 package protocol 的唯一 TypeScript 实现：protocol constants、portable path、
canonical TAR/checksums、固定 Zstandard packing、有界 inspection 与安全 diagnostics。这些模块属于
internal；package export map 只暴露受支持的 CLI root，不提供 codec API。独立的 Host-private Rust
inspector 仍位于 `src-tauri` 并消费相同 committed corpus。

使用专项 drift gate：

```bash
pnpm run check:plugin-package-format
```

该命令先构建 CLI package，再检查精确 codec/crate inputs 与 constants，验证 committed fixtures 且不重写，
运行 package-owned TypeScript/reproducibility tests，并让 Rust 消费同一 expectations。Baseline
regeneration 是显式 review 操作：

```bash
pnpm run generate:plugin-package-format-fixtures
```

使用以下命令验证完整作者工具边界：

```bash
pnpm run check:plugin-developer-cli
```

该门禁会打包五个公共 package，在系统临时 consumer 中使用机器配置的全局 pnpm store 安装它们，生成两类
维护模板，运行 lifecycle 与 CLI flow，审计 lockfile 和 module realpath，逐字节重复打包，并把 `.lxp`
交给 Rust inspector 与 installer preparation boundary。

## Plugin SDK Package

`packages/plugin-sdk` 持有框架无关的 SDK client lifecycle、经过校验的 Runtime context、版本
兼容、稳定 SDK error、取消/超时行为、语义 transport interface 与官方 iframe transport。受支持的
import 是：

```text
@lensx/plugin-sdk
@lensx/plugin-sdk/iframe
```

package 只有一个直接 Runtime 依赖 `@lensx/plugin-contract`，并从该 package 导入
`PLUGIN_HOST_API_VERSION`、共享 `PluginRuntimeContext` shape 与 Context validator 作为当前 Host API
事实。它公开独立的 `PLUGIN_SDK_VERSION` 与
`PLUGIN_SDK_SUPPORTED_HOST_API_RANGE`，不会重新导出或复制当前 Host API 版本。

使用显式实例和注入的 transport：

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import { createPluginIframeTransport } from '@lensx/plugin-sdk/iframe';

const client = createPluginSdk({ transport: createPluginIframeTransport() });
const context = await client.initialize();
if (context.capabilities.includes('ui.close')) {
  await client.request({ method: 'ui.close', params: {} });
}
await client.dispose();
```

Context capability 是闭集 Contract method catalog 中排序去重的值，表示当前可调用 snapshot，
不是 grant。client 不提供任意 raw method 调用；typed request/event API 使用闭集 Contract，并让
Host API error 与 SDK lifecycle error 保持可判别。iframe factory 不暴露 identity、origin、nonce、
Port、wire 或 Host 配置；frame 与 Host lease adapter 仍为私有边界。package 内部白盒测试保留私有
fake；公共黑盒控制由 Plugin Testkit 提供。

使用以下命令验证 SDK：

```bash
pnpm --dir packages/plugin-sdk run build
pnpm --dir packages/plugin-sdk run typecheck
pnpm --dir packages/plugin-sdk run test
pnpm --dir packages/plugin-sdk run check
pnpm --dir packages/plugin-sdk run test:pack
pnpm run check:plugin-sdk
```

pack gate 会构建真实 Contract 与 SDK tarball，校验 SDK 文件清单、root/iframe exports、声明与 Runtime
依赖 metadata，并把两个 tarball 安装进隔离 external consumer。root consumer 使用
`lib: ["ES2022"]` 且不包含 DOM 类型完成 typecheck，运行 ESM lifecycle smoke，并证明未声明的
SDK deep import 会被拒绝。browser consumer 会 typecheck、bundle、在真实 browser 中加载 iframe
entry，并拒绝私有 transport deep import。tarball 排除 tests、fixtures、scripts、schema、Host
projection 与 Host 私有源码。完整跨边界门禁使用 `pnpm run check:plugin-sdk-transport`。运行
`pnpm run check:plugin-host-api-dispatcher` 可验证 production Dispatcher、response-before-close、
Action/Navigation/storage、Context replacement、MessageChannel、公共 tarball 与 workspace boundary。Dispatcher
保持为 Host 私有源码，不增加 Contract/SDK export 或 dependency。
`pnpm run check:plugin-scoped-storage` 可验证 Rust-backed scoped storage、Installer lifecycle coordination、
公共 Testkit consumer 与私有 storage boundary。

## Plugin Testkit Package

`packages/plugin-testkit` 持有面向公共 Contract 与 SDK lifecycle 的框架无关 fixture 和控制工具。
唯一受支持的 import 是：

```text
@lensx/plugin-testkit
```

package 的 Runtime dependency 只有 Contract 与 SDK 的公共根入口。它提供全新的 Manifest fixture、
显式 JSON Pointer mutation、冻结的有效 Runtime Context fixture、显式无效 Context fixture、取消 controller、deferred promise，
以及带不可变 observation 的语义 fake transport。fake 可以配置 connect/request handler、发送抽象
event、断开和销毁，但不会模拟 wire envelope、iframe、Host identity、permission decision 或真实
Host API method。

它应当与真实 SDK 一起使用，而不是替代 SDK 校验或 lifecycle：

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import {
  createPluginManifestFixture,
  FakePluginSdkTransport,
} from '@lensx/plugin-testkit';

const manifest = createPluginManifestFixture();
const transport = new FakePluginSdkTransport();
const client = createPluginSdk({ transport });
await client.initialize();
await client.dispose();
```

context fixture 中的 capability ID 是共享 Contract method ID，不是 grant。Testkit 提供 unknown、
duplicate、unsorted 与 trusted-field 负向 fixture。无效或不兼容 context、取消、超时、transport
failure、重试、断开、状态发布与迟到完成由真实 SDK 判断。使用以下命令验证 Testkit：

```bash
pnpm --dir packages/plugin-testkit run build
pnpm --dir packages/plugin-testkit run typecheck
pnpm --dir packages/plugin-testkit run test
pnpm --dir packages/plugin-testkit run check
pnpm --dir packages/plugin-testkit run test:pack
pnpm run check:plugin-testkit
```

专用 gate 校验 Contract、SDK 与 Testkit tarball，以及 workspace dependency/lifecycle 规则。其无 DOM
ES2022 external consumer 覆盖 Manifest/context fixture、SDK 初始化、observation 与 dispose。它是发布
fixture，不是 roadmap Task 1.6 的正式插件项目模板，也不会执行插件或桌面 Host。

## Plugin UI Package

`packages/plugin-ui` 持有可选的 React/Semi Design UI foundation。受支持的 import 仅限：

```text
@lensx/plugin-ui
@lensx/plugin-ui/styles.css
```

根入口公开 `PluginUiProvider`、`PluginPage`、`PluginFeedback` 及其公共类型。它不会重新导出
通用 Semi 控件；插件需要 `Button`、`Input`、`Table`、`Form` 或 `Modal` 时，直接从 Semi
Design 导入。未声明的 package source、component、test、visual fixture 和 style deep import
都不是公共 API。

`PluginUiProvider` 接受 SDK 的只读 `PluginRuntimeContext` snapshot，将 `en-US` 与 `zh-CN`
映射到 Semi locale pack，提供 package 自有反馈文案，并同步插件 document 的 `lang`、CSS
`color-scheme` 与 `body[theme-mode="dark"]`。调用方传入新的 context snapshot 时，呈现会同步
更新。Provider 不订阅 transport、不轮询 Host、不定义 context event protocol，并在 unmount
时恢复此前的 document 状态。

React 插件 document 只需导入一次样式入口：

```tsx
import { PluginPage, PluginUiProvider } from '@lensx/plugin-ui';
import '@lensx/plugin-ui/styles.css';

<PluginUiProvider context={context}>
  <PluginPage title="插件页面">内容</PluginPage>
</PluginUiProvider>;
```

样式入口包含必要的 Semi 基础样式，并公开以下版本化 lensX 语义 token：

```text
--lensx-plugin-color-background
--lensx-plugin-color-surface
--lensx-plugin-color-text
--lensx-plugin-color-text-secondary
--lensx-plugin-color-border
--lensx-plugin-color-accent
--lensx-plugin-color-danger
--lensx-plugin-color-focus
--lensx-plugin-radius-page
--lensx-plugin-space-page
```

React、React DOM 与 `@lensx/plugin-sdk` 是由插件项目持有并打包的 peer dependency；Semi
Design 是 UI package 的直接 Runtime dependency。最终 React 插件 browser bundle 包含插件
自有的单份 React Runtime、React DOM、Semi、Plugin UI JavaScript 与样式；Host 不提供
external、import map、global、私有 React Context 或私有 CSS。框架无关插件仍然只安装
Contract 与 SDK，不需要 UI、React 或 Semi。

使用以下命令验证 UI package：

```bash
pnpm --dir packages/plugin-ui run build
pnpm --dir packages/plugin-ui run typecheck
pnpm --dir packages/plugin-ui run test
pnpm --dir packages/plugin-ui run check
pnpm --dir packages/plugin-ui run test:pack
pnpm --dir packages/plugin-ui run test:visual
pnpm run check:plugin-ui
pnpm run check:plugin-developer-cli
```

pack gate 会把真实 Contract、SDK 与 UI tarball 安装到隔离的 Rsbuild browser consumer，
检查 package metadata 与 bundle module graph，并运行 browser Runtime smoke test。visual gate
在 `650×600` 下覆盖 `en-US`/`zh-CN` 与 light/dark，包括语义结构、live region、键盘恢复、
focus、computed token、长文本和截图。这些门禁不会实现或模拟 Host 安装与 iframe 执行。

## 官方插件 Release Unit

每个直接 `plugins/official/*` member 仍是普通公共边界插件，同时独立拥有 private package
version、Manifest version、CHANGELOG、测试、`test:e2e` 与明确 CODEOWNERS 条目。Host
不得导入官方插件源码。Changesets 表达 release 意图；仓库发布 canonical `.lxp`，而不是 npm
package。

路径规划、版本 PR、candidate gate、资产 schema、重试和非 authority release audit 边界见
[官方插件发布流水线](official-plugin-release.md)。

## 根命令

标准根命令是仓库级入口：

```bash
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run check
```

每个命令先验证根应用，再按 workspace 依赖顺序为每个成员运行对应 script。根应用或成员失败
都会返回给调用方。空成员区域不会跳过根应用验证，内部 `app:*` scripts 会避免递归调用根命令。

`dev`、`preview`、`tauri` 和 `src-tauri:*` 保持其 Host 专用语义。修改 workspace 工具时，
使用这些专项命令：

```bash
pnpm run check:workspace-boundaries
pnpm run test:workspace-boundaries
pnpm run test:workspace-lifecycle
pnpm run check:plugin-sdk
pnpm run check:plugin-testkit
pnpm run check:plugin-ui
pnpm run check:official-plugin-release-pipeline
```

## 依赖方向

仓库允许的依赖方向是：

```text
root Host              -> packages/* 公共 exports
packages/*             -> 更底层 packages/* 公共 exports
plugins/official/*     -> packages/* 公共 exports
examples/plugins/*     -> packages/* 公共 exports
```

消费方必须在自己的 `package.json` 中声明 workspace package 依赖，并通过对方声明的 package
名称和公共 export 导入。消费方不得通过相对源码路径读取另一个成员。

公共 package、官方插件和示例插件不得依赖 private 根 `lensx` package，也不得导入
`src/app/**` 或 `tools/**` 等 Host 私有路径、Host Tauri adapter 或 Host 内部样式。插件源码和
manifest 不得依赖或导入 `@tauri-apps/*`。官方插件不享有规则例外。

package 层级的依赖方向是 Contract -> SDK -> Testkit，以及 Contract -> SDK -> 可选 UI。CLI 消费 Contract
与经过审查的 Node/WASM codec。Testkit
只能消费 Contract 与 SDK 公共根入口；Contract 和 SDK 不得依赖或导入 Testkit。UI package 可以
消费 SDK 公共 context 类型；框架无关 SDK 不得依赖或导入 UI、React 或 Semi Design。

确定性的边界检查会解析 package manifest 和 TypeScript 模块引用，包括静态 import、export、
动态 import、相对路径和仓库 alias。发生违规时，检查返回非零状态，并报告规则标识、文件和
违规引用。
