# 插件架构

lensX 对内建插件和外部插件使用同一套插件契约。插件 manifest 声明插件 ID、来源、生命周期策略、UI 运行时、页面、行为、权限、SDK 兼容信息、Host API 兼容信息和预留 sidecar 元数据。

## 契约

`source` 只描述插件来源：

- `builtin`：随应用打包发布。
- `external`：从 `.lxplugin` 包安装。

卸载和禁用行为只由 `lifecycle.uninstallable` 与 `lifecycle.disableable` 控制。不要从 `source` 推导生命周期行为。

所有可引用 ID 必须是全局唯一的严格三段式 ID：

```text
author.module.name
```

局部名称使用第三段内部的下划线表达，例如 `lensx.core.settings_page_main`。不要使用 `lensx.core.settings.page.main` 这类第四段层级；层级与归属必须使用 `plugin_id`、`parent_page_id`、`target_page_id` 等显式字段表达。

## 运行时

内建插件位于 `src/plugins/builtin/**`，以 Vue 动态模块在主应用内渲染。它们共享应用 Vue runtime、Naive UI Provider、主题、i18n message、Naive UI locale/dateLocale、UnoCSS 工具类和 Less 主题变量。

外部插件在 iframe 中渲染。lensX 在启动或安装阶段读取并校验外部 manifest 元数据，但不会常驻加载外部 iframe。只有用户打开外部插件页面时才创建 iframe，并随页面容器销毁。

## Registry 与校验

Registry 会拒绝非法 ID、重复 ID、缺失 `plugin_id` 引用、缺失 `target_page_id` 引用、未声明权限和页面父子循环。缺失引用不会被自动创建。

Rust 负责外部 manifest 读取、安装目录路径校验、registry 校验、Host API dispatch 和 sidecar 拒绝执行。Vue 负责页面出口、内建动态加载、iframe 生命周期和运行时上下文事件。

## Host API 边界

外部插件必须通过 JSON-RPC 2.0 over `postMessage` 调用 lensX，通常应使用 `@lensx/plugin-sdk`。Bridge 在 dispatch 前校验插件身份、消息来源、方法 ID、声明权限、授权状态和参数。

外部插件不得直接访问主 Vue store、Vue 组件实例、内部模块、Tauri command、Rust 对象或原生渲染入口。

## Sidecar 策略

sidecar 字段只为未来变更预留。插件系统第一阶段可以读取 sidecar 元数据，但不得启动或执行 sidecar 进程。Host API 对 sidecar 执行返回可诊断的“不支持”状态。
