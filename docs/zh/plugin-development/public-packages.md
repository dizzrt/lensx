# 公共插件 Package

## Package 矩阵

`@lensx/plugin-sdk` 当前版本为 `0.3.0`，其余 package 仍为 `0.2.0`。下列入口是完整的受支持
exports；即使某个文件存在于 tarball，只要没有声明为 export，就仍是私有路径。

| Package | 公共入口 | 角色 |
| --- | --- | --- |
| `@lensx/plugin-contract` | root、Manifest Schema、Host API Schema | 作者输入、normalized 类型、版本、catalog 和纯 validator。 |
| `@lensx/plugin-sdk` | root、`./webview` | 框架无关 client 生命周期与 Child WebView transport constructor。 |
| `@lensx/plugin-ui` | root、`./styles.css` | 可选 React/Semi provider、page、feedback、公共样式和 token。 |
| `@lensx/plugin-testkit` | root | Contract/context fixture、fake semantic transport、cancellation 与 deferred helper。 |
| `@lensx/plugin-cli` | root 与 `lensx-plugin` bin | 可移植 authoring 命令，不是 Runtime API。 |

真实 tarball gate 会检查 package metadata、declaration、Runtime 文件、Schema 文件、CLI bin
和 export resolution。不支持 deep import。

## 依赖角色

framework-neutral Runtime 的最小依赖是 `@lensx/plugin-contract` 和
`@lensx/plugin-sdk`；只在测试中加入 `@lensx/plugin-testkit`。React/Semi 插件还必须自行拥有
`react`、`react-dom`、`@douyinfe/semi-ui` 和 `@lensx/plugin-ui`。Host 不会把自己的
React 或 Semi instance 借给插件 Child WebView。

Contract 可用于 authoring 和 Runtime。SDK 依赖 Contract。Testkit 只依赖公共 Contract/SDK
root。Plugin UI 以 SDK、React 和 React DOM 为 peer 边界，并拥有 Semi 依赖。CLI 是 Node
authoring 工具，不能进入浏览器 bundle。

## Action 发现元数据

Launcher 搜索只使用每个 Action 在全部已声明受支持语言（`en-US`、`zh-CN`）中的 `title`
和 `default_keywords`。界面语言只控制展示文本及反馈，Action 缺失当前语言文本时回退英文；
它不改变匹配、分数或结果顺序。某语言缺失文本或关键词列表为空，不会遮蔽另一语言的文本。
每个查询 token 都必须命中同一 Action，token 可以跨语言或字段分别匹配。重复译文或同时命中
多个字段不会额外加分：每个 token 及完整查询的标题奖励都只贡献最佳匹配一次，每个 Action
只返回一次。

`description` 继续作为可选展示 metadata 并由投影保留，但不再参与搜索或计分。只在描述中出现
的已有查询将不再返回该 Action。请把希望用户搜索的术语放入对应标题或 `default_keywords`；
插件名称、插件整体描述、Page 标题和 ID 不会自动成为可搜索文本。已有 Manifest 和包格式继续
有效，本次搜索行为不需要修改 Manifest、Host API 或 SDK 版本。

## 生命周期边界

normalize 前先使用 `validatePluginManifest`。每个 Runtime attempt 创建一个
`createPluginSdk` client，初始化、订阅完整 context replacement，并执行幂等 dispose。
测试中 `FakePluginSdkTransport` 控制 semantic connect/request 结果；它不是真实 Host。

`PluginUiProvider` 消费最新 Runtime context 并适配 locale/theme。`PluginFeedback` 与
`PluginPage` 只提供呈现原语，不提供 Host authority。CLI 创建、构建、校验、打包和检查文件；
不会启动 Host、安装 package 或执行插件。

## 非目标

- Testkit 不是 Host、WebView 隔离边界或来源安全模拟器。
- Plugin UI 仅作用于插件 document；它不会跨越或控制 native Child WebView 边界，
  也不会暴露 private bridge facts。
- Contract acceptance 不等于安装、注册、session ready、provider 可用或授权。
- CLI acceptance 不等于 Host acceptance；安装会在可信边界重新检查同一 canonical package 规则。
- Package 当前尚未发布到 npm。lensX build 产出的真实 tarball 是受支持的外部消费验证输入。

继续阅读[工具与安装](tooling-and-installation.md)或 [Host API 参考](host-api.md)。
