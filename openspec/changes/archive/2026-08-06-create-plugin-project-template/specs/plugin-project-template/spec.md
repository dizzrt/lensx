## ADDED Requirements

### Requirement: 系统 MUST 提供两套共享公共平台边界的正式插件项目模板

系统 MUST 在受支持的 example-plugin workspace 范围内提供一套 framework-neutral TypeScript 模板和一套 React/Semi 模板。两套模板 MUST 是可独立构建、类型检查、测试和静态检查的直接 workspace member，MUST 使用不同的 namespaced plugin ID，并 MUST 作为官方插件和第三方插件共同遵循的起点。模板 MUST NOT 因官方来源获得不同的 SDK、Runtime、CSP、权限、Host API 或 workspace dependency 规则。

#### Scenario: 开发者选择 framework-neutral 模板
- **WHEN** 开发者需要使用非 React 技术栈或直接操作浏览器 DOM
- **THEN** framework-neutral 模板可独立完成全部生命周期命令
- **THEN** 其 Runtime 和声明边界不依赖 React、React DOM、Semi Design 或 `@lensx/plugin-ui`

#### Scenario: 开发者选择 React/Semi 模板
- **WHEN** 开发者需要使用 React 和 lensX 的公共 UI 语言
- **THEN** React/Semi 模板可独立完成全部生命周期命令
- **THEN** 它通过 `@lensx/plugin-ui` 公共入口和插件自有 React、React DOM、Semi Design Runtime 组成页面，不消费 Host React Context、globals 或私有组件

#### Scenario: 根级生命周期覆盖两套模板
- **WHEN** 仓库执行标准 `build`、`typecheck`、`test` 或 `check`
- **THEN** 对应生命周期按 workspace dependency 顺序覆盖两套模板
- **THEN** 任一模板缺少脚本或验证失败会使根级命令失败

### Requirement: 每套模板 MUST 包含一个完整、最小、无权限的可运行插件

每套模板 MUST 包含一个由真实 Contract 接受的 Manifest、一个 Page、一个指向该 Page 的 Action、一个 package-local iframe Runtime entry，以及 Manifest 引用的全部构建资源。示例 MUST 省略或使用空的 requested-permission 集合，MUST NOT 调用需要授权的 Host API，并 MUST NOT 通过 publisher 文本或官方仓库位置声明可信来源。构建产物 MUST 是自包含的 package payload，不能依赖 remote script、inline script、eval、外部网络、Host bundle 或仓库源码。

#### Scenario: 最小 Manifest 与资源图有效
- **WHEN** 模板的实际 Manifest 经过公共 validator、normalizer 和 package resource resolution
- **THEN** Manifest、Page、Action target、Runtime entry 及全部资源均有效且兼容当前 lensX/Host API 范围
- **THEN** Action 可以通过当前 Host 投影打开模板贡献的 Page

#### Scenario: 示例不请求权限
- **WHEN** 模板插件安装并初始化 Runtime
- **THEN** 安装不会由示例产生待授权权限，示例不会调用 storage、clipboard 或其他需要授权的能力
- **THEN** 缺少权限不会阻止 Page、SDK 初始化、Runtime context 展示或本地纯前端交互

#### Scenario: Manifest 或资源发生错误
- **WHEN** 测试使 Page/Action 引用、Runtime entry、资源路径或 Manifest 契约无效
- **THEN** Contract 或 package inspection 以稳定诊断拒绝模板产物
- **THEN** 无效产物不会进入生产 Runtime smoke

### Requirement: 模板 Runtime MUST 展示真实 SDK 生命周期和 Runtime context 适配

两套模板 MUST 使用 `@lensx/plugin-sdk/iframe` 的官方 transport 和实例化 SDK client，MUST 在 ready 前等待并验证真实 Runtime context，并 MUST 处理完整 context replacement。模板 MUST 使用 `en-US` 作为默认文案并提供语义对齐的 `zh-CN`，MUST 响应 `light | dark` theme，MUST 对 loading、ready、error 和 retry 提供可访问状态，且 MUST 通过一个幂等终止路径取消订阅、卸载视图并 dispose 当前 client。

#### Scenario: English light context 初始化成功
- **WHEN** Runtime 返回有效 `en-US`、light 和空或无权限 capability snapshot
- **THEN** 模板进入 ready 并显示英文内容和 light 表现
- **THEN** 插件只观察公共 context，不获得 plugin identity、Page identity、grant、source、path、Host 对象或私有 wire

#### Scenario: Chinese dark context replacement 到达
- **WHEN** ready Session 收到有效 `zh-CN`、dark 的完整 context replacement
- **THEN** 当前视图更新为语义对齐的简体中文和 dark 表现
- **THEN** 模板不把旧 locale、theme 或 capability snapshot 与 replacement 合并

#### Scenario: 初始化失败后显式重试
- **WHEN** SDK 初始化以安全的 lifecycle 或 Host API 错误失败
- **THEN** 模板显示有界且可访问的错误状态，并提供键盘可操作的显式 retry
- **THEN** retry 先终止旧尝试，再创建新的 transport/client，且不自动无限重试

#### Scenario: Page 关闭或组件卸载
- **WHEN** 当前 Page 关闭、document 生命周期终止、React root 卸载或 retry 替换当前尝试
- **THEN** 模板移除 context subscription、停止接受旧回调并幂等 dispose 当前 SDK client
- **THEN** 重复或迟到的 cleanup 不会恢复旧视图、复用 transport 或影响新尝试

### Requirement: 模板 MUST 只消费公共 package 和可移植项目依赖

模板源码和 package metadata MUST 只通过已声明的公共 package exports 消费 Plugin Contract、SDK、可选 UI 和 Testkit。模板 MUST NOT 依赖 lensX 私有 root package、`src/app/**`、`tools/**`、Tauri package/adapter、Host styles、cross-member source path 或未导出的深层路径。模板中的 lensX package 依赖 MUST 使用可发布的普通 SemVer 范围；源模板 MUST NOT 包含 `workspace:`、`file:`、`link:`、绝对路径或仓库相对依赖。

#### Scenario: 模板在仓库外安装
- **WHEN** 模板被复制到 workspace 之外并通过真实 public package tarball 解析其普通 SemVer 依赖
- **THEN** 安装、测试、类型检查、构建和检查均不读取 lensX 源码、root `node_modules` 或仓库本地路径
- **THEN** 安装不会在 lensX 仓库根写入 store metadata 或重建根 `node_modules`

#### Scenario: 模板尝试导入私有能力
- **WHEN** 任一模板声明或导入 Host root、Tauri、Host style、private transport codec、package-format tool、cross-member source 或未导出子路径
- **THEN** workspace boundary 或 external project gate 以稳定诊断失败
- **THEN** 模板的官方示例身份不会豁免该错误

#### Scenario: framework-neutral 模板意外获得 UI 依赖
- **WHEN** framework-neutral 模板的 package graph、声明或 bundle 出现 React、React DOM、Semi Design 或 Plugin UI
- **THEN** template gate 失败并识别不允许的依赖
- **THEN** React/Semi 模板的可选技术栈不会成为 framework-neutral 模板的传递要求

### Requirement: 模板测试 MUST 使用真实 Contract 与 SDK 且保持 Testkit 为作者侧测试边界

每套模板 MUST 使用真实 Contract validator 校验自己的 Manifest，并 MUST 使用真实 SDK client 加 Testkit semantic transport 覆盖初始化、context、错误、retry、replacement 和 dispose。测试 MUST NOT 复制 Contract/SDK 算法，MUST NOT 把 FakePluginSdkTransport 表述为真实 iframe wire、Runtime Session、Host API、权限决定或插件执行。

#### Scenario: 作者侧 lifecycle 测试成功
- **WHEN** Testkit 提供有效 Runtime context 并观察模板创建的真实 SDK client
- **THEN** 测试证明模板依次进入 loading/ready/terminal 状态并执行预期的订阅与幂等 dispose
- **THEN** 观察值来自 Testkit 公共 API，而不是 Host 私有实现

#### Scenario: Testkit transport 返回失败或断开
- **WHEN** semantic transport 在初始化或 ready 后产生失败、断开或迟到结果
- **THEN** 模板进入有界错误或 terminal 状态且忽略迟到结果
- **THEN** 测试不构造私有 nonce、origin、request ID、MessagePort frame 或 grant state

### Requirement: 模板门禁 MUST 证明 canonical 打包和隔离外部消费

系统 MUST 提供一个根级模板验证入口，使用当前公共 package 的真实 tarball 在系统临时目录分别验证两套模板。门禁 MUST 从构建后的自包含 payload 通过 Host 私有 reference packer 产生 canonical `.lxp`，MUST 重新检查为 compatible，并 MUST 证明相同输入的重复打包 byte-for-byte 一致。模板自身 MUST NOT 导入该 packer、公开 package-format API 或在 Task 6.4 前声称提供公共 `pack` CLI。

#### Scenario: 两套外部模板通过完整门禁
- **WHEN** 根级模板 gate 在干净的仓库外临时 consumer 中运行
- **THEN** 两套模板分别通过依赖安装、测试、类型检查、构建、静态检查、两次 deterministic pack 和 compatible inspection
- **THEN** 每个 `.lxp` 的 Manifest、checksums、Runtime entry、Page/Action assets 和全部普通文件满足当前 package-format 要求

#### Scenario: 外部 consumer 回链仓库
- **WHEN** 解析后的依赖、symlink、bundle module 或构建产物回链 lensX workspace、root `node_modules` 或私有源码
- **THEN** external project gate 失败
- **THEN** 临时 consumer 不会因能访问当前 checkout 而产生假阳性

#### Scenario: 模板尝试提前提供公共 pack 命令
- **WHEN** 模板 package scripts 或源码直接暴露 Host 私有 reference packer，或把该工具声明成外部插件依赖
- **THEN** template boundary gate 失败
- **THEN** 公共 create/validate/inspect/build/pack 工作流继续归属于 Task 6.4

### Requirement: 生产边界 smoke MUST 使用模板产物接入真实 Host 主链

模板 gate MUST 使用构建并检查通过的真实模板 payload 覆盖当前 Host 的 package acceptance、Registration/Page/Action projection、resource/Runtime resolution、Runtime Session、公共 SDK iframe transport、Host transport adapter、RPC validation、Dispatcher `runtime.get_context` 和 terminal cleanup。该 smoke MUST NOT 注入 FakePluginSdkTransport 或把作者侧 Testkit 当作生产 Host。现有 macOS WKWebView CSP、custom-protocol 和隔离证据 MUST 继续作为目标浏览器安全前置，不需要由本 smoke 建立第二套 GUI runner。

#### Scenario: framework-neutral 模板经过生产主链
- **WHEN** compatible framework-neutral 模板 package 被 Host 测试边界接受并打开其贡献的 Action/Page
- **THEN** current iframe transport 与 Runtime Session 完成一次认证连接，SDK 通过 Dispatcher 获得 Contract-valid Runtime context
- **THEN** 关闭后 current Session、Port、pending request、subscription、Runtime attempt 和 Page 资源均进入现有 terminal cleanup

#### Scenario: React/Semi 模板经过生产主链
- **WHEN** compatible React/Semi 模板 package 被相同 Host 测试边界接受并打开其贡献的 Action/Page
- **THEN** 它使用同一 Session、transport、Dispatcher、RPC 和 cleanup 路径，不获得 React、Semi、官方来源或 UI package 特权
- **THEN** Host 不为该模板注入 React Runtime、Host Context、私有样式或绕过 CSP 的资源

#### Scenario: 作者侧 fake 被误用于生产 smoke
- **WHEN** production-boundary smoke 依赖 Testkit、FakePluginSdkTransport 或手工伪造的 ready context 来代替生产 adapter/Dispatcher
- **THEN** 专用门禁失败
- **THEN** 模板不能仅凭编译和作者侧单元测试被声明为真实 Host 可运行

### Requirement: React/Semi 模板 MUST 通过可访问性、locale、theme 和视觉验证

React/Semi 模板 MUST 使用 Plugin UI 与 Semi Design 支持的 locale/theme 机制，并 MUST 在固定插件视口对 `en-US`/`zh-CN`、light/dark、loading/error/ready、长文本、键盘 retry、焦点可见性和关键语义 theme token 进行自动化及视觉验证。模板自有用户可见文案 MUST 同时提供英语和语义对齐的简体中文，且英语 MUST 是缺省和回退语言。

#### Scenario: 四种 locale/theme 组合渲染
- **WHEN** visual gate 分别渲染 English/light、English/dark、Chinese/light 和 Chinese/dark
- **THEN** Page 内容、反馈、Semi 控件和 document theme 在固定视口内可读且不溢出关键区域
- **THEN** computed styles 使用公共 Plugin UI theme contract，而不是 Host 私有 CSS

#### Scenario: 用户用键盘从错误状态重试
- **WHEN** React 模板处于初始化错误状态且用户仅使用键盘操作 retry
- **THEN** retry 控件具有可见焦点并触发一个新尝试
- **THEN** loading、error 与 ready 状态通过适当语义或 live region 对辅助技术可理解

### Requirement: 模板能力 MUST 具有窄范围双语文档和完整验证

系统 MUST 在 canonical English 工程文档中说明两套模板的选择、公共依赖、Manifest/Page/Action/Runtime 结构、生命周期命令、隔离验证与当前限制，并 MUST 在相同相对路径提供语义对齐的简体中文镜像。文档 MUST 明确模板不是公共 CLI、Development Mode、权限教程或完整插件开发教程。专用 gate、标准 frontend gate 和 Rust gate MUST 共同覆盖本能力，任何引入的 warning 或 error MUST 被修复后重新运行失败命令和最终验证集。

#### Scenario: 外部开发者阅读模板文档
- **WHEN** 开发者从英文或简体中文索引进入模板文档
- **THEN** 两种语言说明相同的模板选择、命令、公共边界、无权限示例和 Task 6.4/6.5 限制
- **THEN** 文档不会把仓库内 reference packer、production-component smoke 或 Testkit fake 描述成已发布 CLI 或完整 GUI E2E

#### Scenario: 模板 change 完成验证
- **WHEN** change 准备被标记完成
- **THEN** template 专用 gate、frontend tests、format/static checks、typecheck/build、Rust format、Rust tests 和 Rust static checks 全部通过或对确实不受影响的区域记录可审计理由
- **THEN** 路线图 Task 6.3 仅在上述验证和双语文档完成后标记为完成
