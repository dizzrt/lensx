## Why

lensX 已经交付 Plugin Contract、SDK、Testkit、可选 UI、`.lxp` 包格式，以及真实 iframe Runtime、Host API Dispatcher 与 RPC 校验，但仓库内现有 consumer 仍是各公共包的隔离发布夹具，不能作为一个完整、可复制、可在真实 Host 路径中运行的插件工程。现在 Task 6.3 的全部前置能力已经具备，需要把这些边界组合成官方插件和第三方插件共同使用的最小正确起点，并持续证明外部项目不依赖 lensX 私有源码。

## What Changes

- 新增两套正式 Plugin Project Template：一套 framework-neutral TypeScript 模板，以及一套 React/Semi 模板；二者遵守相同 Manifest、Runtime 和 Host 安全边界。
- 每套模板提供一个无权限、纯前端的最小插件，包含合法 Manifest、一个 Page、一个打开该 Page 的 Action、官方 iframe SDK 初始化、Runtime context 使用和幂等销毁示例。
- 为模板提供完整的 `build`、`typecheck`、`test` 与 `check` 生命周期；测试使用真实 Contract 与 SDK，并通过 Testkit 验证初始化、context、失败和销毁行为。
- 新增模板专用验证门禁：从真实公共 package tarball 在仓库外临时目录安装依赖，执行两套模板的测试、类型检查和构建，将构建产物按现有 canonical `.lxp` 格式打包并重新检查。
- 增加分层的生产边界 smoke，使用模板构建产物证明 Host 可以接受该包、解析并打开其 Page、完成真实 SDK/Runtime Session/Dispatcher context 握手，并在关闭后清理当前 Runtime；该验证不以 Testkit fake 代替生产路径。
- 更新 canonical English 插件开发文档及对应简体中文镜像，说明两套模板的用途、公共依赖边界、验证命令与当前限制。
- 完成并验证本 change 后，将路线图 Task 6.3 标记为完成。

### Goals

- 让仓库内外开发者从一个可构建、可测试、可打包且可运行的最小工程开始，而不是自行拼接分散的 package consumer。
- 让官方插件与第三方插件共同消费公开 Contract、SDK、可选 UI 和 Testkit，不建立 Host 私有捷径。
- 用自动化门禁证明模板不会依赖工作区链接、Host 私有模块、Tauri API、未导出的 package 子路径或仓库本地 store。
- 以无权限示例覆盖真实插件执行主链，同时保持模板容易理解和扩展。

### Non-goals

- 不交付 `create`、`validate`、`inspect`、`build` 或 `pack` 公共 CLI；这些属于 Task 6.4。
- 不交付开发目录安装、watch、hot reload 或 Development Mode；这些属于 Task 6.5。
- 不在本 change 中新增 Host API、权限能力、permission harness、签名、Catalog、Marketplace 或发布流水线。
- 不提供剪贴板、存储等带权限或 Host 状态的入门示例，也不允许“官方插件”绕过来源、权限、CSP、Runtime 或 RPC 校验。
- 不把当前 Host 私有 reference packer 变成公共插件 API，也不要求模板直接导入 `tools/**`。

### User-visible impact

- 插件开发者可以选择适合自身技术栈的官方最小工程，并在不读取 lensX 源码的外部目录中验证项目。
- React 插件获得正确的 Semi Design、主题、语言和可访问性接入示例；非 React 插件不被迫安装 React、Semi Design 或 Plugin UI。
- 本 change 不改变普通 lensX 用户现有的插件安装、权限、Launcher 或 Runtime 交互。

## Capabilities

### New Capabilities

- `plugin-project-template`: 定义 framework-neutral 与 React/Semi 两套正式模板的内容、公共依赖、Runtime 行为、隔离消费、canonical 打包、生产边界 smoke、文档和验证要求。

### Modified Capabilities

无。现有 Plugin Contract、SDK、UI、Testkit、package format、Runtime、Host API、权限和 workspace 要求保持不变；本 change 只按这些已接受边界组合模板与验证。

## Impact

- **Workspace**：在现有 `examples/plugins/*` 支持范围内增加两套模板 workspace member，并纳入根级生命周期和 workspace boundary 检查。
- **Tooling and tests**：增加模板构建、隔离 tarball consumer、canonical `.lxp` 打包/检查和生产边界 smoke 的专用脚本与测试；复用现有 Host 私有 package-format 工具，不新增公共 CLI。
- **Public packages**：消费 `@lensx/plugin-contract`、`@lensx/plugin-sdk`、`@lensx/plugin-testkit`，React 模板额外消费 `@lensx/plugin-ui`、React、React DOM 与 Semi Design；不新增公共导出或反向依赖。
- **Host and Rust**：生产行为和命令契约不变；Rust/Host 层只需要为模板产物补充验证证据，不增加新的特权能力。
- **Documentation**：更新 `docs/en/development/plugin-workspace.md` 及其 `docs/zh/` 镜像；如新增独立模板文档，则同步更新两种语言的索引。
- **Compatibility**：无 breaking change；现有 Manifest、Host API、SDK、package format 与 Runtime 协议版本保持不变。
