# 插件开发

外部插件是以 `.lxplugin` 归档发布的 Web 应用。推荐技术栈是 Vue 3 和 TypeScript，但宿主边界只依赖普通 HTML、JavaScript、manifest JSON 和 `@lensx/plugin-sdk`。

## 包结构

插件包至少包含：

```text
manifest.json
dist/index.html
assets/*
```

宿主会校验 `manifest.json`、注册元数据，并且只在页面被打开时加载 `dist/index.html`。

## Manifest

使用严格三段式 ID 和显式引用：

```json
{
  "id": "lensx.example.hello_world",
  "source": "external",
  "lifecycle": {
    "uninstallable": true,
    "disableable": true
  },
  "runtime": {
    "ui": "iframe",
    "entry": "dist"
  }
}
```

页面、行为和权限都在同一个 manifest 中声明。行为通过 `target_page_id` 打开页面；页面层级通过 `parent_page_id` 表达。

## SDK

本地示例使用 workspace SDK：

```bash
pnpm --filter lensx-plugin-hello-world install
```

使用 SDK，不要手写底层 bridge 消息：

```ts
import { createPluginClient } from '@lensx/plugin-sdk';

const client = createPluginClient();
const context = await client.getRuntimeContext();
```

SDK 封装 JSON-RPC request id、响应解析、标准错误、超时，以及 locale 和主题变化等运行时事件。

## Host API

Host API 方法由共享 schema 和 SDK 常量声明。调用链通过 JSON-RPC 2.0 over `postMessage`：

```text
iframe -> @lensx/plugin-sdk -> Plugin Bridge -> Host API Dispatcher -> Rust or Vue service
```

每次高权限调用都会校验插件 manifest、方法所需权限和当前授权状态。

## 限制

第一阶段不支持 sidecar 执行、外部 Rust 注入、外部原生渲染、直接访问 Tauri command、直接访问主 Vue store、后台常驻插件、插件间直接通信、流式 RPC 或大文件传输。

外部 iframe 资源必须解析到插件安装目录内。启动器主路径在用户打开插件页面前只加载插件元数据。
