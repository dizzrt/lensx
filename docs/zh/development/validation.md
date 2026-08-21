# 验证

## 原则

维护中的验证是确定性的，仅支持四类工作：

1. Rstest 与 Cargo 单元、状态、策略和边界测试。
2. Biome、TypeScript、Rust 格式与静态检查。
3. Rsbuild、Cargo 与 workspace 生产构建。
4. pack、inspect、tarball、临时纯 CLI consumer 与确定性生成物检查。

仓库不再维护截图、像素、视觉基线、浏览器、真实 WebView、GUI 应用、原生交互或目标环境性能验证，也不存在可选、手动或兼容 Gate。

## 命令模型与稳定接口

完整本地验证使用标准 lifecycle：

```bash
pnpm run test
pnpm run typecheck
pnpm run check
pnpm run build
pnpm run src-tauri:format:check
pnpm run src-tauri:test
pnpm run src-tauri:check
pnpm run src-tauri:build
```

package lifecycle 语义不重叠：`typecheck` 只检查类型，`test` 只运行测试，`check` 只运行格式、lint、生成物漂移和源码策略，`build` 只构建。只有 build 后纯 Node 产物检查可以保留 `test:e2e`。

`gate` 是只读跨层 dispatcher。`generate` 仅用于可由源码重现的确定性产物，且必须提供一个 target 和 `--write`。

```bash
pnpm run gate -- --list
pnpm run generate -- --list
pnpm run generate -- plugin-manifest-types --write
```

不得为 Change、测试子集或 Gate 转发新增根 alias。

## 本机浏览器自动化

浏览器自动化不属于维护中的验证。package lifecycle、Gate、Generate target 与 CI 都不得加入浏览器启动、preview server、截图、像素比较、真实 WebView、原生 harness 或 GUI 应用命令。

## macOS Accessory Launcher 验证

Launcher policy、菜单路由、焦点状态、快捷键、恢复和 Child WebView 协同由确定性 Rust 与前端测试覆盖。不存在打包应用或 Launch Services 验证入口。

## 前端验证

使用 `pnpm run test`、`pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`。根 Rstest discovery 负责仓库内断言；lifecycle aggregator 按依赖顺序恰好覆盖一次根应用与每个直接 workspace member。

## Plugin Contract 验证

```bash
pnpm run gate -- plugin-contract
```

该 Gate 检查 Schema、生成物漂移、类型、测试、打包和 workspace 边界。

## Plugin Package Format 验证

```bash
pnpm run gate -- plugin-package-format
```

## Plugin Developer CLI 验证

```bash
pnpm run gate -- plugin-developer-cli
```

CLI consumer 与兼容 fixture 覆盖维护中的 6.5 和 8.1 行为，不启动产品环境。

## 持续集成验证

仓库恰好维护两个只读 macOS workflow：

- LensX CI 调用 `ci-lensx-frontend` 与 `ci-lensx-rust` Gate；完整本地入口为
  `pnpm run gate -- ci-lensx`。
- Plugins CI 调用 `pnpm run gate -- ci-plugins`。

本地使用相同命令复现。workflow 不发布、上传、签名、公证或更新生成物。

`ci-lensx-frontend` 负责 clean-checkout workspace preparation：它推导公共 package 的
传递构建闭包，在 consumer 前按拓扑顺序构建依赖，并对 frontend 阶段间完全相同的 step
去重；其中 Contract 必须早于 CLI 构建。验证不得依赖残留 `dist`、workflow-only
preparation、源码 alias 或递归 package build；阶段专用环境语义会让其他方面相似的 step
保持独立。

## 插件开发模式验证

```bash
pnpm run gate -- plugin-development-mode
pnpm run gate -- plugin-development-smoke-reload
```

确定性 Rust、TypeScript、React、package 和源码策略测试覆盖目录安全、不可变快照、原子 reload、production exclusion、generation revocation、UI 状态与清理。

## Plugin Resource Service 验证

```bash
pnpm run gate -- plugin-resource-service
```

## 隔离 Plugin Runtime Origin 验证

```bash
pnpm run gate -- isolated-plugin-runtime-origin
```

## macOS Frame-Aware WebView Navigation 验证

```bash
pnpm run gate -- frame-aware-webview-navigation-policy
```

该 Gate 通过确定性测试验证分类、allowlist、pre-commit policy、popup/download 拒绝、依赖固定和 Host bootstrap 隔离。

## 隔离 Plugin Child WebView Runtime 验证

```bash
pnpm run gate -- plugin-child-webview-runtime
```

这是确定性的 contract 与 lifecycle 验证，不能描述为原生隔离或真实 WebView 行为证明。

## Plugin Child WebView Session 验证

```bash
pnpm run gate -- plugin-child-webview-session
```

## Plugin SDK Transport 验证

```bash
pnpm run gate -- plugin-sdk-transport
```

该 Gate 在不启动浏览器的前提下检查 public exports、private codec、adapter 行为、lifecycle、tarball consumer 与 deep-import 拒绝。

## Plugin RPC 验证

```bash
pnpm run gate -- plugin-rpc-validation
```

## Plugin Host API Dispatcher 验证

```bash
pnpm run gate -- plugin-host-api-dispatcher
```

## Open Isolated Plugin Runtime 验证

```bash
pnpm run gate -- open-isolated-plugin-runtime
```

## ConfigLens 官方插件验证

运行 ConfigLens 的标准 package lifecycle。其 build 后纯 Node 检查约束初始 256 KiB JavaScript、64 KiB CSS、bootstrap 顺序、单一 SDK client、Monaco single-flight、Worker 闭包、package 边界和自包含输出。

## Plugin Scoped Storage 验证

```bash
pnpm run gate -- plugin-scoped-storage
```

## Plugin Management Settings 验证

```bash
pnpm run gate -- plugin-management-settings
```

组件和 service 测试覆盖 locale、theme、keyboard、focus recovery、loading/error 状态、破坏性确认、revision 竞态与 Host 私有组合。

## Open-Web Trust Confirmation 验证

使用 `pnpm run gate -- open-isolated-plugin-runtime`。确定性检查建立公共 capability 与 Host 边界不变量，不证明真实环境执行。

## Rust 验证

```bash
pnpm run src-tauri:format:check
pnpm run src-tauri:test
pnpm run src-tauri:check
pnpm run src-tauri:build
```

## 文档验证

`docs/en` 下英文文档是 canonical；保持相同路径的 `docs/zh` 语义一致，并保证 Gate 与 Generate identifier 可解析。

## 范围规则

- 确定性仓库断言使用 Rstest。
- 跨层确定性编排使用稳定 capability Gate。
- Generate 只处理可重现的源码派生产物，并要求显式写授权。
- 不得通过其他脚本、workflow、隐藏 flag 或手动 Gate 恢复已删除的环境验证。

## 最终检查清单

1. 在 clean-checkout 等价 workspace 运行两个 CI Gate。
2. 运行前端与 workspace 的 test、typecheck、check 和 build。
3. 运行 Rust format check、test、check 和 build。
4. 运行保留的 pack、inspect、tarball 与 CLI consumer Gate。
5. 严格验证 active OpenSpec Change 与全部 stable specs。
6. 运行 active-source stale scan 与 `git diff --check`。
