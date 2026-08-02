# 插件 Workspace

## 范围

本仓库是一个 pnpm workspace，并将 `lensx` React/Tauri Host 保留为 private 根
package。workspace 为公共 package 和插件建立开发拓扑、lifecycle 聚合及依赖检查，并包含
可发布的 `@lensx/plugin-contract` 与 `@lensx/plugin-sdk` package，但仓库验证不会执行 registry
发布操作。workspace 尚未提供 UI library、公共 Testkit 或 CLI，也不会发现、安装、注册或执行
插件。SDK package 是 client/transport foundation，不是可工作的 iframe Runtime 或 Host API。

已经交付的静态 Manifest 契约仍然只负责验证。package 位于本 workspace 内，并不代表它
获得 Host 信任、Tauri 访问权、权限或 Runtime 能力。

## 受支持的成员位置

`pnpm-workspace.yaml` 只识别下列位置直接子目录中的 package manifest：

```text
packages/*
plugins/official/*
examples/plugins/*
```

`packages/*` 保留给公共 workspace package。官方插件和示例插件使用不同的成员区域，但遵守
相同的外部插件源码边界。位于这些模式之外或嵌套层级更深的 package 不是 workspace 成员。
`examples/plugin-contract-consumer` 与 `examples/plugin-sdk-consumer` 中的外部 Contract/SDK
消费示例仍是普通项目数据，不是 workspace package。

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

`packages/plugin-contract` 持有公共 Manifest Schema、生成的 `PluginManifestInput`、规范化
类型、协议常量、诊断和纯两阶段校验 API。受支持的 import 仅限：

```text
@lensx/plugin-contract
@lensx/plugin-contract/schema
@lensx/plugin-contract/manifest.schema.json
```

package 将 `ajv` 声明为直接 runtime 依赖，并复用现有 TypeScript 与 Rstest 工具链；其 runtime
表面不依赖 React、Semi Design、Tauri、DOM、Node filesystem 或 package bundler。使用以下
命令生成并验证契约：

```bash
pnpm run generate:plugin-manifest-types
pnpm run check:plugin-contract
```

完整检查会重建生成类型，运行 package 与 Host 边界测试，检查 TypeScript/Rust 共享 fixtures，
打出真实 tarball 并验证文件清单和 exports，最后将其安装到隔离消费者中执行 typecheck 和 runtime
smoke test。

## Plugin SDK Package

`packages/plugin-sdk` 持有框架无关的 SDK client lifecycle、经过校验的 Runtime context、版本
兼容、稳定 SDK error、取消/超时行为与语义 transport interface。唯一受支持的 import 是：

```text
@lensx/plugin-sdk
```

package 只有一个直接 Runtime 依赖 `@lensx/plugin-contract`，并从该 package 导入
`PLUGIN_HOST_API_VERSION` 作为当前 Host API 事实。它公开独立的 `PLUGIN_SDK_VERSION` 与
`PLUGIN_SDK_SUPPORTED_HOST_API_RANGE`，不会重新导出或复制当前 Host API 版本。

使用显式实例和注入的 transport：

```ts
import { createPluginSdk, type PluginSdkTransport } from '@lensx/plugin-sdk';

declare const transport: PluginSdkTransport;
const client = createPluginSdk({ transport });
const context = await client.initialize();
await client.dispose();
```

client 不提供任意 raw Host method 调用。transport interface 用于未来可信 adapter 和测试，不是
iframe 实现或公共 wire protocol。package 内部测试使用私有 fake；公共 Testkit 仍是后续工作。

使用以下命令验证 SDK：

```bash
pnpm --dir packages/plugin-sdk run build
pnpm --dir packages/plugin-sdk run typecheck
pnpm --dir packages/plugin-sdk run test
pnpm --dir packages/plugin-sdk run check
pnpm --dir packages/plugin-sdk run test:pack
pnpm run check:plugin-sdk
```

pack gate 会构建真实 Contract 与 SDK tarball，校验 SDK 文件清单、仅根 exports、声明与 Runtime
依赖 metadata，并把两个 tarball 安装进隔离 external consumer。consumer 使用
`lib: ["ES2022"]` 且不包含 DOM 类型完成 typecheck，运行 ESM lifecycle smoke，并证明未声明的
SDK deep import 会被拒绝。tarball 排除 tests、fixtures、scripts 和 Host 私有源码。

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
`src/app/**` 等 Host 私有路径、Host Tauri adapter 或 Host 内部样式。插件源码和 manifest
不得依赖或导入 `@tauri-apps/*`。官方插件不享有规则例外。

确定性的边界检查会解析 package manifest 和 TypeScript 模块引用，包括静态 import、export、
动态 import、相对路径和仓库 alias。发生违规时，检查返回非零状态，并报告规则标识、文件和
违规引用。
