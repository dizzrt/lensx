## Why

lensX 已经交付 Contract、SDK、可选 UI、Testkit、正式项目模板、Plugin Developer CLI、真实 Runtime/Host API 与 Plugin Development Mode，但这些能力仍分散在架构和专题文档中，且部分状态与限制已经发生漂移。仓库外开发者目前缺少一条不读取 Host 私有源码、可重复完成创建、开发、测试、调试、打包和本地安装的权威路径，因此 Milestone 6 还不能形成可验证的 Plugin Developer Preview 文档闭环。

## What Changes

### 目标

- 建立面向仓库外开发者的插件文档信息架构，以 English canonical 文档和同路径简体中文镜像提供清晰入口、概念说明、操作指南与参考资料。
- 分别提供 framework-neutral 与 React/Semi 两条端到端教程，覆盖创建项目、理解 Manifest、使用 SDK/可选 UI、使用 Testkit、构建与验证、Development Mode 手动 reload、打包 `.lxp`、本地安装和受控运行。
- 发布 Contract、SDK、UI、Testkit、CLI、Runtime 生命周期、Host API、权限、错误码、版本兼容和安全限制的开发者参考，并明确“公共契约已定义”“当前 Host 已提供”“需要授权”三种不同事实。
- 将教程和关键示例纳入自动化：在仓库外临时 consumer 中使用真实打包公共依赖执行代码提取、类型检查、构建、验证和打包，检查文档链接、双语镜像、标题/锚点、命令及受维护代码块不发生漂移。
- 校准现有英文文档、中文镜像、双语索引与 `plugin-roadmap.md` 中已经落后的实现状态和能力限制，完成 Task 6.6 与 Plugin Developer Preview 的准确状态更新。

### 非目标

- 不新增或放宽 Manifest、SDK、Host API、权限、iframe、Runtime Session、Development Mode 或本地安装能力。
- 不新增 watch/HMR、自动 reload、签名、远程发布、Catalog、Marketplace、自动更新或新的包分发协议。
- 不在本 change 中发布 npm package；外部教程只使用当前能够由仓库产出的真实公共 tarball，并将 npm 未发布状态写成显式限制。
- 不把 README、Agent 指南、Host 私有源码或内部 wire 当作插件开发者参考入口。
- 不引入新的文档站点框架、组件库或 Runtime 依赖。

### 用户可见影响

- 新开发者可以从双语索引选择技术栈，沿一条完整教程得到可由 Host 本地安装的 `.lxp`，不需要阅读或导入 lensX 私有源码。
- 开发者可以从稳定参考中判断某个 API 是否由当前 Host 实现、是否需要权限、会返回什么错误以及版本不兼容时如何处理。
- 文档示例或公共包边界发生漂移时，仓库验证会失败，而不是把错误留给文档读者发现。

## Capabilities

### New Capabilities

- `plugin-development-documentation`: 定义外部开发者双语信息架构、两条端到端教程、公共 API/权限/错误/兼容/安全参考、可执行示例与仓库外文档验证闭环。

### Modified Capabilities

- 无。现有插件能力的产品契约保持不变；本 change 只准确发布、连接和自动验证已经接受的公共能力与限制。

## Impact

- 主要影响 `docs/en/`、`docs/zh/`、两份文档索引和 `plugin-roadmap.md`。
- 将新增或扩展文档验证脚本、受维护示例/片段元数据、根 `package.json` 的聚合门禁，以及对应 TypeScript/Rstest 测试。
- 外部 consumer 验证会复用现有 Contract、SDK、UI、Testkit 与 CLI 的真实 tarball、两份正式模板、canonical `.lxp` 打包和 Host 本地安装准备边界；不会建立第二套校验或打包实现。
- 不改变公共 API、Tauri command、Rust payload、持久化格式、Runtime 权限模型、生产 bundle 或现有依赖方向。
