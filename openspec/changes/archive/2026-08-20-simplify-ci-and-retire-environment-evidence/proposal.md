## Why

当前验证体系把截图、像素基线、浏览器渲染、真实 WKWebView 和 macOS 产品证据作为 CI 或能力完成条件，导致验证受 runner、浏览器、字体和桌面服务影响，执行缓慢且难以稳定复现。仓库当前只需要维护确定性的单元测试、静态检查、构建、打包和纯命令行产物验证，因此应立即收窄验证承诺并删除不再需要的环境型基础设施。

## What Changes

- **BREAKING** 自动 CI 仅保留格式/静态检查、TypeScript 与 Rust 类型/静态检查、Rstest 与 Cargo 单元测试、生产构建、确定性打包/检查和不启动浏览器的产物 smoke。
- **BREAKING** 退役所有截图、像素漂移、视觉 fixture、浏览器渲染、真实 WKWebView、真实 macOS 产品和性能 evidence 的维护要求；不保留按需 Gate、Generate/Evidence target、兼容入口或替代环境型工作流。
- 删除只服务于上述验证的脚本、基线、fixture、提交证据、Gate 步骤和文档入口；复合 Gate 中仍有价值的确定性断言迁入标准 Rstest、package lifecycle、Cargo 或纯命令行打包检查后再移除旧 Gate。
- 规范 workspace lifecycle：`check` 不再递归重复 `typecheck` 和 `test`，CI 中每个验证类别只运行一次；构建指定 workspace 包前按依赖拓扑准备其传递公共包输出，修复 clean-checkout 下 `plugin-contract` 晚于 `plugin-cli` 构建的问题。
- 同步修改稳定规范和英中双语文档，使完成声明只基于仓库维护的确定性证据，不再声称通过真实浏览器、WebView 或 macOS 产品路径完成验证。
- 保留产品 UI、可访问性、主题、本地化、Runtime 隔离、生命周期、CSP、RPC、Session、窗口行为以及可确定性验证的 bundle/资源预算；使用组件、状态机、契约、边界、构建和包检查覆盖可自动证明的部分，不再维护依赖真实目标环境的时延采样完成条件。
- 不删除或改写历史 OpenSpec archive；历史记录可继续描述当时实际执行过的环境证据。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `repository-continuous-integration`: 将 LensX 和 Plugins CI 收窄为确定性的检查、测试、构建、打包和产物验证，移除 visual 阶段。
- `validation-gate-governance`: 允许有意退役环境型 Gate/Evidence 覆盖，并禁止保留视觉、浏览器或真实 macOS 的兼容入口。
- `frame-aware-webview-navigation-policy`: 以确定性策略、Rust、契约和边界测试替代目标 WKWebView evidence 完成条件。
- `isolated-plugin-runtime-origin`: 以资源、模块图、来源分区和负向边界测试替代目标 WKWebView 模块图证据。
- `launcher-window-lifecycle`: 移除打包 `.app`、Launch Services、跨 Space 和全屏产品 evidence 的交付要求。
- `official-config-lens-plugin`: 移除视觉矩阵、真实 Runtime 生命周期和目标 macOS 性能 evidence，保留确定性产品、包和行为验证。
- `open-isolated-plugin-runtime`: 移除目标 WKWebView 与 Host 可用性 evidence 的强制完成条件。
- `plugin-child-webview-runtime`: 移除真实目标 macOS 的交互、性能采样和交付 evidence 要求。
- `plugin-development-mode`: 移除真实 WebView teardown evidence，保留目录、快照、原子 reload、生产排除和确定性生命周期验证。
- `plugin-host-api-dispatcher`: 移除真实 WKWebView wiring evidence，保留 Dispatcher、SDK、桥接、存储和负向权限测试。
- `plugin-management-settings`: 移除固定视口截图与 computed-style Gate 完成条件，保留组件、键盘、主题和边界断言。
- `plugin-page-window-presentation`: 移除视觉和真实 macOS resize/restore evidence，保留 Contract、Rust、React、边界和状态转换验证。
- `plugin-project-template`: 移除 React/Semi 模板的浏览器 visual Gate 和截图基线，保留可访问性、本地化、主题、测试和构建要求。
- `plugin-rpc-validation`: 移除目标 WKWebView evidence 前置条件，保留确定性恶意矩阵、MessageChannel、包和边界验证。
- `plugin-runtime-security-lifecycle`: 移除视觉 CSP 证明和真实 WebView teardown evidence，保留 CSP、竞态、终止清理和权限负向测试。
- `plugin-runtime-session`: 移除真实 WebView source-binding evidence，保留解析、状态、生命周期、恶意 fixture 和零特权命中验证。
- `plugin-sdk-webview-transport`: 移除真实 macOS Child WebView evidence，保留 SDK、codec、桥接、RPC、生命周期、tarball 和私有边界验证。
- `plugin-testkit`: 删除把真实 Runtime 完成声明委托给目标 macOS Gate 的要求，继续禁止 Testkit 模拟或声称原生隔离。
- `plugin-ui-package`: 移除独立浏览器 consumer、固定视口 visual fixture 和截图验收，保留公共导出、tarball、组件、主题、本地化、键盘和焦点测试。

## Impact

- CI 与验证编排：`.github/workflows/*`、`scripts/ci.ts`、`scripts/validation/*`、package lifecycle scripts 和相应 Rstest 治理测试。
- 退役资产：ConfigLens、Plugin UI、React/Semi 示例和模板、Plugin Management、Plugin Runtime presentation 的 visual scripts、fixtures、baselines 与环境 evidence producers/records。
- 稳定契约：上述 19 个 capability specs 以及进入稳定规范前的英文内容检查。
- 文档：`docs/en/**` 的 CI、验证、插件开发、Runtime、窗口和 ConfigLens 说明及对应 `docs/zh/**` 镜像；根 README 不承载实现细节。
- 用户可见产品行为和公共 Plugin API 不改变；变化仅影响仓库维护的验证范围、完成声明和开发者命令。
