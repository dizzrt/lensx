# React 与 Semi 插件教程

本路径创建一个完整的无权限 React 插件，并在 iframe bundle 内自行拥有 UI Runtime。
它不依赖 framework-neutral 教程。

## 前置条件

使用 Node `>=24 <25`、pnpm `>=11 <12`、受支持的 macOS Host，以及正在测试的 lensX build
产出的真实 Contract、SDK、Plugin UI、Testkit 和 CLI tarball。Package 尚未发布到 npm。
consumer-owned override 可指向 tarball；禁止 workspace、source 和 root-module link。

项目自行拥有 `react`、`react-dom`、`@douyinfe/semi-ui` 和 `@lensx/plugin-ui`，不会使用 Host
的 React 或 Semi。

## 创建与安装

在 lensX 仓库外创建受维护的 React/Semi 项目并安装依赖。

```sh verify=command id=react-create
lensx-plugin create ./my-plugin --template react-semi --plugin-id com.example.my-plugin --name MyPlugin
pnpm install
```

CLI 写入完整项目，但不执行 dependency install、Host launch、plugin installation、Host authority
或 execution。

## Manifest 与资源

生成的 `manifest.json` 使用 Manifest `0.2.0`、独立 lensX/Host API compatibility range、未验证
publisher text、无 permission 字段、一个 Page、一个指向 Page 的 Action，以及 `index.html`
iframe entry。每个 Runtime/asset path 都必须存在于 build 后 `dist/`。

Worker/network 行为无需 Manifest 声明。Host policy 字段、native capability、sandbox 与 CSP override
仍是非法 Manifest input。

## Runtime 与 UI 生命周期

`src/runtime.ts` 每个 attempt 创建一个 SDK client，发布 loading、ready 或 error，应用完整 context
replacement，在显式 retry 时创建 fresh client，忽略旧 attempt completion，并幂等 dispose。

`src/App.tsx` 用 `PluginUiProvider` 包裹每个状态。loading/error/recovery 使用 `PluginFeedback`，
ready content 使用 `PluginPage`。从 `@lensx/plugin-ui/styles.css` 导入公共 Plugin UI 样式；使用受支持
组件和公共 token，不使用 Host style。Empty capabilities 呈现有意义的 unavailable state，而不是
触发猜测 method。

## 语言主题与可访问性

把最新 context 的 `en-US`/`zh-CN` 和 light/dark 视为一个原子 snapshot。`PluginUiProvider`
应用公共 locale/theme bridge 与 token。所有可见文案本地化，control 可用键盘访问，feedback 具有
semantic 表达，focus 行为可预测。error 时把 focus 移到 recovery action；恢复后回到有意义的逻辑目标。
不得用硬编码 Host color 表达 theme。

受维护 visual gate 渲染两种 locale 与两种 theme。component test 覆盖 loading、ready、error、
recovery、keyboard activation、semantic status 与 focus behavior。

## 测试与构建

运行完整生成 lifecycle，并分类现有 `dist/`。

```sh verify=command id=react-validate
pnpm run test
pnpm run typecheck
pnpm run build
pnpm run check
lensx-plugin validate --project .
```

这些测试使用真实公共 SDK 与 Testkit fake。它们证明 UI/client lifecycle，不证明真实 Host
source authentication 或 authorization。

## Development Mode

从 Host checkout 启动专用 build：

```sh verify=command id=react-development-host
pnpm run dev:plugin-development-mode
```

在 Settings 注册 self-contained `dist/`。编辑后重新 build，并用 manual reload 发布 fresh immutable
process-local generation。检查 loading、两种 locale、两种 theme、error/recovery 与 reload 后 focus。
Development source 不持久化、不安装 `.lxp`、不自动 reload、不创建 Host authority，也不会放宽 production
Runtime/session/security boundary。

## 打包与安装

打包并检查 production artifact 两次。

```sh verify=command id=react-package
lensx-plugin pack --project .
lensx-plugin inspect ./artifacts/com.example.my-plugin-0.1.0.lxp
lensx-plugin pack --project .
```

使用 Settings **从文件安装**，检查 publisher 与 open-Web trust notice 并确认 exact prepared candidate。
打开 launcher Action，验证 loading、ready、locale/theme replacement、keyboard control、
error/recovery 与 close。Host 会独立于 CLI 重新 inspection 与 authorize。

## 负向路径

- 破坏 import 或 visual state：typecheck、test、build 或 check 失败。
- 删除 resource：validate 在 `.lxp` acceptance 前失败。
- 提供 incompatible context：UI 展示 controlled recovery，不渲染 ready。
- 移除 optional capability：UI 降级，不发出 hidden call。
- failure 后 retry：fresh attempt 拥有 fresh subscription；旧 callback 为 inert。
- 重复 dispose：cleanup 保持幂等。
- 尝试不可用的 native/device API：React、Semi、Plugin UI、CLI 与插件 click 都不能创建 Host 私有 authority。
- restart 后比较 source：development 消失；formal installation 持久且可管理。

依赖所有权见[公共 package](public-packages.md)，method 见 [Host API](host-api.md)，authority 和
teardown 见 [Runtime 与安全](runtime-permissions-security.md)。
