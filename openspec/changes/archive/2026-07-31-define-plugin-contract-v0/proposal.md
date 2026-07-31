## Why

当前 lensX 已有 Host-owned Launcher Action Core，但还没有项目自有、可验证的插件作者 Manifest 契约。若直接实现搜索或插件运行时，插件身份、Page、Action、权限、兼容性和 Host 信任边界会被临时结构反向固化，因此需要先定义一个范围受控的首版契约。

## What Changes

- 定义外部插件作者输入 Manifest `1.0.0-dev`，覆盖稳定插件身份、发布版本、本地化展示信息、作者/主页/仓库信息、LensX 与 Host API 兼容范围、iframe 入口、权限请求以及 Page 和 Action 贡献。
- 规定一个插件可以贡献多个 Page 和多个 Action；贡献项使用插件内本地 ID，Host 以 `plugin_id` 派生全局身份。
- 规定 Launcher 的搜索和执行实体是 Action：搜索同义词由 Action 的 locale-keyed `default_keywords` 表达，Plugin 不声明通用别名。
- 规定首版 Action Target 只能引用同一插件贡献的 Page；不支持 Command、任意 URL、函数、Native 入口、Sidecar 或后台进程目标。
- 规定 `publisher` 必须包含作者、主页和仓库地址；这些字段是作者声明的展示元数据，不代表 Host 已验证身份或来源。
- 建立严格结构校验、跨字段语义校验、缺失集合归一化、兼容性判定和确定性 `{code, path, message}` 诊断契约，并要求 TypeScript 与 Rust 对共享样例给出一致结果。
- 区分作者 Manifest、规范化 Manifest 与 Host 注册状态；作者不得声明 `source`、`lifecycle`、`enabled`、已授予权限、安装路径或其他可信运行时事实。
- 记录完整英文架构契约并维护对应简体中文镜像。
- 不实现插件发现、安装、启停/卸载、签名、更新、iframe 实例化、Host API 通信、权限授予、Action 注册投影、Launcher 搜索或插件管理界面。

## Capabilities

### New Capabilities

- `plugin-manifest-contract`: 定义外部插件 Manifest v0 的作者输入格式、规范化结果、Page-only Action Target、引用与权限约束、兼容性状态、诊断格式以及 Host-owned 信任边界。

### Modified Capabilities

- 无。

## Impact

- 新增插件 Manifest 的版本化 Schema、共享有效/无效/规范化/不兼容样例，以及 Schema 驱动的 TypeScript 作者输入类型。
- 新增 TypeScript 和 Rust 的 Manifest 解析、规范化、语义校验、兼容性判定及一致性测试边界。
- 后续插件提供者适配器、Page 运行时和 Launcher Action Search 将依赖该契约，但本 change 不将插件 Action 注册进现有 Action Registry。
- 更新 `docs/en/architecture/` 中的规范说明及 `docs/zh/architecture/` 对应镜像；不在 README 或 Agent 指南中放置实现细节。
- 预期不增加 UI 组件库；若实现校验需要新增运行时依赖，必须单独说明必要性并保持 TypeScript/Rust 行为一致。
