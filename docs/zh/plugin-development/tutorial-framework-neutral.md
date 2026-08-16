# 框架无关插件教程

本路径创建一个无权限浏览器 DOM 插件，可独立完成，不需要 React 教程。

## 前置条件

使用 Node `>=24 <25`、pnpm `>=11 <12`、受支持的 macOS Host，以及由正在测试的 lensX build
产出的真实 `@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-testkit` 和
`@lensx/plugin-cli` tarball。这些 package 尚未发布到 npm。使用 consumer-owned dependency
override 指向 tarball，不得 link lensX workspace 或根模块。

## 创建与安装

在 lensX 仓库外运行真实 CLI，再于生成项目安装依赖。

```sh verify=command id=framework-create
lensx-plugin create ./my-plugin --template framework-neutral --plugin-id com.example.my-plugin --name MyPlugin
pnpm install
```

`create` 只写文件，不会下载依赖、初始化 Git、安装插件、启动 Host 或授予 authority。生成项目只使用
公共 package root 与普通 version range。

## Manifest 与资源

打开 `manifest.json`。保持 `manifest_version` 为 `0.2.0`，使用 namespaced `plugin_id` 与 SemVer
插件版本。compatibility 分别为 lensX 和 Host API 声明半开 range。publisher field 是未验证作者文本。

starter 不包含 permission 字段。它贡献一个 Page、一个指向该 Page 的 Action，以及 launcher
default action。WebView entry 与每个 icon/resource path 都必须是 package-relative 且存在于 `dist/`。
Page/Action ID 只在插件内有效。Contract validation 不会安装、注册、授权或执行这些声明。

## Runtime 生命周期

`src/runtime.ts` 通过 `createPluginWebviewTransport` 为每个 attempt 创建一个 SDK client，初始化，
发布 loading/ready/error，并监听完整 `runtime.context_changed` replacement。retry 先使旧 attempt
失效并 dispose，再创建 fresh client。

`src/view.ts` 根据 current `en-US`/`zh-CN`、light/dark 和 capability snapshot 渲染浏览器 DOM。
Empty capabilities 是合法 degraded state。disconnect 或 failure 时展示受限 feedback 与显式 retry。
cleanup 幂等，旧 attempt callback 无法恢复旧状态。

Testkit 为这些状态提供 semantic fake transport 与 context fixture。它不模拟真实 Host 安全边界，
也不会创建 Host authority。

## 测试与构建

运行全部生成 lifecycle，再使用 CLI 分类现有 self-contained payload。

```sh verify=command id=framework-validate
pnpm run test
pnpm run typecheck
pnpm run build
pnpm run check
lensx-plugin validate --project .
```

测试覆盖成功初始化、完整 context replacement、missing capability 降级、初始化失败、fresh attempt
显式 retry、late completion 拒绝与重复 cleanup。compatible 只是 payload acceptance，不是 Host authority。

## Development Mode

从 Host checkout 启动专用 build：

```sh verify=command id=framework-development-host
pnpm run dev:plugin-development-mode
```

在 Settings 显式注册项目 `dist/`。Host 复制一个已验证的 immutable process-local generation。
修改代码后重新 build 并选择手动 reload。Development registration 不是 `.lxp` 安装，不跨进程重启
持久化，也不会改变 Runtime isolation、deadline 或 session capability 规则。没有
watch/HMR 或自动 reload。

## 打包与安装

创建并检查 canonical package。输入不变时重复 pack 必须保持 package digest 与字节不变。

```sh verify=command id=framework-package
lensx-plugin pack --project .
lensx-plugin inspect ./artifacts/com.example.my-plugin-0.1.0.lxp
lensx-plugin pack --project .
```

在 Settings 选择 **从文件安装**，选择该 `.lxp`，检查未验证 publisher 与 open-Web trust notice，
然后确认。Host 对 exact candidate 重新 inspection，并通过 controlled preparation boundary commit。
从 launcher 打开 contributed Action，确认 loading、ready、locale/theme replacement 与干净 close。
CLI acceptance 不会授予 authority；此 starter 仍无权限。

## 负向路径

- 删除被引用资源：build 或 validate 必须在 packaging 前失败。
- 让 compatibility range 排除 current Host：结论应为 incompatible，而不是 invalid。
- 从 Testkit context 移除 capability：view 降级，不调用它。
- 初始化失败后 retry：第二个 attempt 是 fresh，首个 attempt 的 late work 为 inert。
- dispose 两次：listener 与 pending operation 保持已释放。
- 尝试不可用的 native/device API：处理浏览器 rejection；插件代码不能打开 Host 私有 authority。
- 重启 Host：Development Mode entry 消失；正式 installed entry 仍可管理。

添加受保护 feature 前阅读 [Host API](host-api.md)，gate 失败时阅读
[兼容与错误](compatibility-and-errors.md)。
