# 持续集成

## 支持的 Workflow

仓库只有两条 GitHub Actions workflow，且均为只读、仅 macOS：

- `lensx-ci.yml` 验证 LensX 前端与 Rust desktop workspace。
- `plugins-ci.yml` 验证 `plugins/*` 下的每个直接插件。

两条 workflow 都只使用 `contents: read`，把第三方 action 固定到完整 commit SHA，
并取消同一 workflow/ref 上过时的运行。它们不使用发布 environment 或 secret，不能创建
版本 pull request、release candidate、上传的 release artifact、tag 或 GitHub Release。

## 触发矩阵

| Pull request 或 `main` push | LensX CI | Plugins CI |
| --- | --- | --- |
| 仅修改 `plugins/**` | 跳过 | 运行 |
| 修改非插件路径 | 运行 | 跳过 |
| 同时修改插件与非插件路径 | 运行 | 运行 |
| 修改 `.github/workflows/plugins-ci.yml` | 运行 | 运行 |

LensX CI 使用 `paths-ignore: [plugins/**]`。Plugins CI 的 `paths` 包含
`plugins/**` 与自身 workflow 文件。因此仅修改 `packages/*` 会运行 LensX CI，
但不会单独触发 Plugins CI。

## LensX CI

前端 job 运行格式/静态分析、TypeScript 检查、单元测试和生产构建。Rust job 运行格式检查、
workspace 测试、静态检查和 workspace 构建。在 macOS 本地复现：

```bash
pnpm run gate -- ci-lensx-frontend
pnpm run gate -- ci-lensx-rust
```

顺序运行两者：

```bash
pnpm run gate -- ci-lensx
```

这些命令只验证 LensX。标准根级 `build`、`typecheck`、`test` 与 `check` 仍保持全仓
lifecycle 语义。

`ci-lensx-frontend` Gate 会在第一个 consumer 运行前准备公共 workspace package 输出。
它发现 workspace member，推导完整的传递构建闭包并按拓扑顺序构建，其中
`@lensx/plugin-contract` 必须早于 `@lensx/plugin-cli`。typecheck 与 test 阶段共享且
完全相同的 Contract/CLI preparation 在一次 Gate invocation 中只执行一次；具有阶段专用
环境语义的模板 build 仍保持独立。

该 preparation 由 Gate registry 统一负责，因此 GitHub Actions 与本地复现使用同一入口。
它不信任预先存在的 `dist`，也不得由 workflow-only prebuild、源码 alias 或 package
lifecycle 内部的递归依赖构建替代。

## Plugins CI

任意匹配的插件改动都会验证全部直接 `plugins/*` member，而不只验证被修改的 member。
完整本地入口为：

```bash
pnpm run gate -- ci-plugins
```

入口会发现直接插件，计算其传递公共 `packages/*` 依赖，按拓扑顺序构建这些 package，
随后为每个插件依次运行 `typecheck`、`test`、`check`、`build` 和 `test:e2e`。
`test:e2e` 是可选阶段，只允许 build 后确定性的纯 Node 产物检查。每类 lifecycle 恰好运行一次；
递归 lifecycle 或环境型阶段会在执行前触发策略失败。没有直接插件时，命令会明确报告成功 no-op。

依赖准备不会信任已有 `dist`，也不会增加源码 alias。插件仍只能消费声明的公共 package
exports，不能消费 Host 或 Tauri 私有源码。

Plugins CI 不启动浏览器、真实 WebView、GUI 应用、Launch Services 或原生交互 harness，
也不维护截图、像素基线或目标环境性能输出。

## 策略与失败恢复

使用以下命令验证 workflow inventory、触发器、权限、runner、固定 action、必需入口和无发布 authority：

```bash
pnpm run gate -- ci-workflows
```

阶段失败后，先修复原因并重跑失败阶段，再重跑完整的对应 CI 入口。确定性 CI 通过后，
不存在需要跳过或恢复的可选环境验证路径。

仓库当前只支持 macOS CI，并有意不提供自动版本与发布 workflow。如果 branch protection 仍要求
已删除的 check 名称，需要在仓库设置中切换到 LensX CI 与 Plugins CI 的稳定 job 名称。
