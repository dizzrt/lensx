# 插件 Workspace

## 范围

本仓库是一个 pnpm workspace，并将 `lensx` React/Tauri Host 保留为 private 根
package。workspace 为公共 package 和插件建立开发拓扑、lifecycle 聚合及依赖检查，并包含
可发布的 `@lensx/plugin-contract` package，但仓库验证不会执行 registry 发布操作。workspace
尚未提供 SDK、UI library、Testkit 或 CLI，也不会发现、安装、注册或执行插件。

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
`examples/plugin-contract-consumer` 中的外部 Contract 消费示例仍是普通项目数据，不是
workspace package。

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
