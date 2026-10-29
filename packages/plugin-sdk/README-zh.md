# @lensx/plugin-sdk

[English](./README.md) · [插件开发](../../docs/zh/plugin-development/index.md)

为 lensX 插件提供框架无关的 lifecycle、Runtime Context、transport、版本、取消、超时和
错误基础。

Runtime Context 结构与校验来自 `@lensx/plugin-contract`；capabilities 是排序后的当前
Host API 方法 ID，不是 grant。Host API 错误类型与 SDK 生命周期错误保持可区分。

使用 root entry 导入 client 和 semantic types。插件 Child WebView 使用官方零配置
WebView entry：

```ts
import { createPluginSdk } from '@lensx/plugin-sdk';
import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';

const sdk = createPluginSdk({ transport: createPluginWebviewTransport() });
const context = await sdk.initialize();

if (context.capabilities.includes('ui.close')) {
  const result = await sdk.request({ method: 'ui.close', params: {} });
  console.log(result.accepted);
}

sdk.subscribe('runtime.context_changed', ({ payload }) => {
  console.log(payload.locale, payload.theme);
});
```

WebView entry 只发现当前文档中由 Host 安装的封闭 bridge，不接受 identity、origin、label、
handle、bridge adapter、wire codec、Tauri command 或 Host executor 配置。私有 request ID
和 frame 不是公共 API，也不是受支持的 deep import。

SDK `0.5.0` 支持 Host API `>=0.4.0 <0.5.0`。当前 Host API 为 `0.4.0`；旧插件包需要更新
SDK 和 Manifest 兼容范围，并重新构建/打包后才能使用新 Host。不会隐式协商协议或改写包。

当前 Host 仅在各 provider 可用时声明基础导航/Context、scoped storage、Action activation 与受控
`http.request`。HTTP 通过同一 typed operation 和取消接口执行公共 HTTPS 文本请求；
签名与服务逻辑仍归插件所有，不提供任意 Tauri/native API 或浏览器 fetch fallback。
通用 SDK operation timeout 仍为 10 秒；使用原生 HTTP 的 15 秒上限时，应显式选择更长
operation timeout。Clipboard 仍不可用。本包不暴露 Dispatcher、Host 服务、权限决定、
插件执行策略或公共 Testkit fake。
