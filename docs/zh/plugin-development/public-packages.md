# 公共插件 Package

## Package 矩阵

所有 package 当前版本均为 `0.2.0`。下列入口是完整的受支持 exports；即使某个文件存在于
tarball，只要没有声明为 export，就仍是私有路径。

| Package | 公共入口 | 角色 |
| --- | --- | --- |
| `@lensx/plugin-contract` | root、Manifest Schema、Host API Schema | 作者输入、normalized 类型、版本、catalog 和纯 validator。 |
| `@lensx/plugin-sdk` | root、`./iframe` | 框架无关 client 生命周期与 iframe transport constructor。 |
| `@lensx/plugin-ui` | root、`./styles.css` | 可选 React/Semi provider、page、feedback、公共样式和 token。 |
| `@lensx/plugin-testkit` | root | Contract/context fixture、fake semantic transport、cancellation 与 deferred helper。 |
| `@lensx/plugin-cli` | root 与 `lensx-plugin` bin | 可移植 authoring 命令，不是 Runtime API。 |

真实 tarball gate 会检查 package metadata、declaration、Runtime 文件、Schema 文件、CLI bin
和 export resolution。不支持 deep import。

## 依赖角色

framework-neutral Runtime 的最小依赖是 `@lensx/plugin-contract` 和
`@lensx/plugin-sdk`；只在测试中加入 `@lensx/plugin-testkit`。React/Semi 插件还必须自行拥有
`react`、`react-dom`、`@douyinfe/semi-ui` 和 `@lensx/plugin-ui`。Host 不会把自己的
React 或 Semi instance 借给插件 iframe。

Contract 可用于 authoring 和 Runtime。SDK 依赖 Contract。Testkit 只依赖公共 Contract/SDK
root。Plugin UI 以 SDK、React 和 React DOM 为 peer 边界，并拥有 Semi 依赖。CLI 是 Node
authoring 工具，不能进入浏览器 bundle。

## 生命周期边界

normalize 前先使用 `validatePluginManifest`。每个 Runtime attempt 创建一个
`createPluginSdk` client，初始化、订阅完整 context replacement，并执行幂等 dispose。
测试中 `FakePluginSdkTransport` 控制 semantic connect/request 结果；它不是真实 Host。

`PluginUiProvider` 消费最新 Runtime context 并适配 locale/theme。`PluginFeedback` 与
`PluginPage` 只提供呈现原语，不提供 Host authority。CLI 创建、构建、校验、打包和检查文件；
不会启动 Host、安装 package 或执行插件。

## 非目标

- Testkit 不是 Host、WebView 隔离边界或来源安全模拟器。
- Plugin UI 不是共享 Host React，也不会跨越 iframe 边界。
- Contract acceptance 不等于安装、注册、session ready、provider 可用或授权。
- CLI acceptance 不等于 Host acceptance；安装会在可信边界重新检查同一 canonical package 规则。
- Package 当前尚未发布到 npm。lensX build 产出的真实 tarball 是受支持的外部消费验证输入。

继续阅读[工具与安装](tooling-and-installation.md)或 [Host API 参考](host-api.md)。
