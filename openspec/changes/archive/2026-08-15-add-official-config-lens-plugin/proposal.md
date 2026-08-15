## Why

lensX 已具备插件公开契约、开发工具、隔离 Runtime、安装管理和官方插件独立发布流水线，但仓库中还没有一款真实的官方产品插件来验证这些能力能否作为完整生态被共同使用。Task 7.2 现在应交付首款官方插件 `ConfigLens`，以常见配置文本的查看、编辑、格式化和校验这一高频且边界清晰的场景，完成从公开模板到可发布 `.lxp` 的首次真实闭环。当前工作树已经实现双模型预览、Diff 和 Apply result；本次修订将产品交互收敛为单编辑器直接操作，避免引入不属于配置内容查看器目标的变更比较与应用流程。

## What Changes

- 新增官方插件 `ConfigLens`，中英文均保留该品牌名；源码位于 `plugins/official/config-lens`，包名为 `@lensx/official-config-lens`，并作为独立 workspace 与独立 SemVer release unit 维护。
- 基于 React、Semi Design、`@lensx/plugin-ui` 和 Monaco Editor 提供一个 Page，并通过一个 Launcher Action 打开。Host Page chrome 已展示品牌，因此插件工作区不重复渲染主标题或副标题；单一可编辑 Monaco model 位于语言选择与 Format/Compact 操作区之前，且不提供只读预览、Diff Editor、Apply result 或 fresh/stale 结果状态。
- **BREAKING**：Format 对 JSON、YAML 1.2、TOML 1.0 和 XML 1.0 直接执行一次可撤销的编辑器内容替换；Compact 仅对 JSON 开放并采用相同替换语义。无效、超限、超时、失效或保真复验失败的结果不得改变当前内容。
- 首版支持显式选择 JSON、YAML 1.2、TOML 1.0 和 XML 1.0，提供语法高亮、基础语法校验和安全诊断；不提供自动语言识别或建议，所有处理始终使用用户当前选择的语言。
- 以插件自有 Dedicated Worker 和语言适配器执行解析、校验与格式化，保持编辑交互响应，并在关闭、禁用、替换、升级、卸载或 Runtime 重建时完整释放 Monaco model、监听器和 Worker。
- 将 Launcher 窗口的暂时隐藏与恢复同真正 Page 关闭区分开：当当前插件的 entry、Page、version、origin、resource generation 与 Runtime attempt 等相关事实均未改变时，重复快捷键唤出只刷新当前平台事实，不得重建 iframe、Runtime Session 或丢弃 ConfigLens 当前 Page 的内存输入；全局 Registration revision 仅作为 revalidation 提示，真正关闭、禁用、替换、升级、卸载或 development reload 仍必须终止旧 generation。
- 约束格式化语义：JSON 不得因普通数值解析丢失大整数词法、键顺序、重复键或转义信息；YAML 不得静默破坏注释、anchor、tag、标量和多文档语义；XML 按空白具有语义的严格模式处理；YAML、TOML、XML 不提供可能改变语义的通用压缩。
- 插件默认不持久化或上传用户输入，不访问远程 schema、DTD、XInclude 或外部实体，也不依赖 CDN、远程脚本或 Host-native API。这里是 `ConfigLens` 的产品与可复现发布约束，不新增 Host 权限控制；插件仍运行在现有开放且相互隔离的 Web Runtime 中。
- 为四种语言建立确定性语料、单元/集成/视觉/真实 WKWebView E2E 覆盖，并将真实 `ConfigLens` 成员接入现有 Changesets、CODEOWNERS、canonical `.lxp`、普通安装、Runtime 与官方候选发布验证链路。
- 更新中英文插件开发与官方发布文档以及 Roadmap，使 Task 7.2 只有在完整自动化验证通过后才标记完成。

### Goals

- 交付一款用户可以实际安装和使用的首个官方插件，而不为官方来源建立特殊信任或运行权限。
- 证明公开 Contract、SDK、UI、Testkit、CLI、安装、隔离 Runtime、生命周期和独立发布流水线能够承载包含 Monaco 与 Worker 的真实插件。
- 为后续官方与社区插件沉淀可复用的工程、测试、体积和生命周期证据。

### Non-goals

- 不做 JSON、YAML、TOML、XML 之间的相互转换，不承诺 schema 驱动补全、语义检查或语言服务器。
- 不做格式化前后变更比较、只读结果预览、Apply result 或其他变更应用工作流。
- 不新增网络服务、云同步、历史记录、默认持久化、原生文件系统、原生剪贴板或其他 Host API。
- 不新增插件权限请求、逐能力授权、官方专属 CSP、官方专属 Runtime 或 Host-private 导入例外。
- 不在本 change 内交付 Marketplace、签名/来源证明、自动更新、资源配额平台或跨平台 WebView 支持扩展。

## Capabilities

### New Capabilities

- `official-config-lens-plugin`: 定义 `ConfigLens` 的产品行为、四语言格式化与校验语义、Monaco/Worker 架构边界、可访问双语 UI、窗口隐藏/恢复期间的当前 Page 连续性、资源生命周期以及普通安装和 Runtime E2E 验收。

### Modified Capabilities

- `official-plugin-release-pipeline`: 从仅有零成员与模拟成员证据扩展为必须发现、选择、构建、重复打包、安装并执行首个真实官方产品插件，同时保持独立版本和无官方特权边界。
- `plugin-development-documentation`: 从“尚无产品官方插件”的当前状态更新为以 `ConfigLens` 作为公开插件边界的真实示例，并明确其能力、安装方式和非特权地位。

## Impact

- 新增 `plugins/official/config-lens` workspace、独立版本/CHANGELOG、workspace lockfile 更新、Monaco 与经审查的浏览器端语言处理依赖、插件测试与候选构建产物规则。
- 更新根 workspace 生命周期与边界验证、官方插件 release contract/candidate/E2E 和文档漂移门禁、`.github/CODEOWNERS`、Changeset 以及必要的 CI 选择证据。
- 修复 Host 对语义等价 Page resolution 的对象身份误判，以稳定执行身份决定 Runtime 是否延续，并增加“当前插件页打开时隐藏/快捷键恢复”的通用 React 集成回归；不得通过 ConfigLens 持久化绕过平台生命周期缺陷。
- 更新 `docs/en/**` 的规范说明及路径一致的 `docs/zh/**` 镜像，并在最终验证后更新 `plugin-roadmap.md` 的 Task 7.2 名称、范围、依赖和状态。
- 不修改公开 Host API、Manifest `0.2.0`、`.lxp` 协议或 Runtime 权限模型；任何必要的公共平台缺陷修复必须保持通用，并通过现有边界门禁证明不会只服务于 `ConfigLens`。
