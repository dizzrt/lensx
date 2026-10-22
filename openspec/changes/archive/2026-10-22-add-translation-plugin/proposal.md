# Proposal

## Why

lensX 在本变更前没有可随输入自动更新结果的翻译插件，用户需要离开 Launcher 才能完成短文本翻译。本变更新增独立的“翻译 / Translation”插件，使用用户配置的火山引擎服务，在现有隔离 Web Runtime 和插件存储边界内完成输入、翻译、语言选择与配置。

## What Changes

- 新增官方插件 `plugins/translation`，包名 `@lensx/official-translation`、插件 ID `dev.lensx.translation`，提供一个 `main` Page 和一个 `open` Action，名称为 `Translation` / `翻译`。
- 提供上下排列的多行文本区域：上方输入原文，下方只读显示译文。编辑停止 400ms 后自动翻译；处理中文输入法组合输入、清空、超限、超时、失败重试及旧请求晚到，保证只展示当前输入对应的结果。
- 源语言默认自动识别，并允许手动选择；目标语言可选。没有已保存的目标语言时，按首次就绪的 Host Context 映射 `en-US → en`、`zh-CN → zh`；用户选择后持久保存，后续 Host 语言变化不覆盖该选择。
- 在插件自身的设置面板配置服务及对应凭据，首版仅提供火山引擎。AK/SK 与设置通过现有 `storage.*` 保存在本机未加密的插件专属存储中；这是用户已接受的保存方式，不承诺钥匙串或加密保护。
- 接入用户指定的 `TranslateText` / `2020-06-01` API，在插件内使用浏览器兼容签名，通过公共 `http.request` 委托 Rust Host 执行受控 HTTPS 请求；将服务请求、响应和错误映射隔离在插件内的 provider 适配器中。
- 新增所有插件共用的 `http.request` Host API：仅访问公网 HTTPS/443，绑定当前 Runtime，限制 DNS、请求/响应、并发、期限、重定向与敏感日志。Host API 升至 `0.3.0`，Contract 包升至 `0.3.0`，SDK 升至 `0.4.0`；Manifest `0.4.0` 和 WebView wire `0.2.0` 不变。
- 支持英文、简体中文界面和明暗主题，沿用公共 SDK、Plugin UI、原生文本编辑和插件生命周期契约。原文、译文及请求状态只保留在当前页面内存中。
- 增加确定性组件、状态机、存储与 HTTP 假实现、签名向量及包产物验证，并同步英文维护文档和同路径中文镜像。

本次不增加其他翻译服务、翻译历史、长文自动拆分、OCR、划词翻译、后台翻译、程序化系统剪贴板、Host 主设置扩展、凭据 API、任意原生执行或 Node 运行时；不关闭浏览器安全检查，不改变安装信任模型，不进行发布。通用 Host HTTP 已由用户于 2026-10-22 明确授权纳入本变更。

## Capabilities

### New Capabilities

- `official-translation-plugin`：独立翻译插件的上下文本工作区、语言默认值与记忆、插件内服务设置、本机凭据保存、火山引擎请求、异步一致性、错误恢复、生命周期和确定性交付要求。

- `plugin-host-http`：通用、受控、绑定当前 Runtime 的 Rust HTTPS 文本请求能力；翻译业务和签名不进入 Host。

### Modified Capabilities

- `plugin-host-api-contract`、`plugin-host-api-dispatcher`：增加闭合的 `http.request` 契约、原生 provider 与准确能力发现。
- `plugin-sdk-foundation`、`plugin-contract-package`、`plugin-manifest-contract`：版本演进与维护消费者兼容范围，明确旧包升级边界。
- `open-isolated-plugin-runtime`：区分普通浏览器联网与受控公共 Host HTTP，保留隔离、可信来源与生命周期要求。

## Impact

- 翻译业务实现与测试集中在新增的 `plugins/translation/`，依赖公共 Contract、SDK、UI、Testkit、CLI 及现有 React/Semi/Rsbuild/Rstest 工具链；Host 不导入插件源码。平台传输扩展涉及 Contract/SDK/Testkit、Host capability projection、Rust 原生 dispatcher/provider、兼容夹具与维护模板。
- 签名需要浏览器可执行的 SHA-256/HMAC 实现。依赖选择、精确版本、许可证、浏览器依赖图和固定向量校验属于本插件的实现验收，不直接引入官方 Node.js SDK 或为其添加 Node polyfill。
- `pnpm-workspace.yaml` 已覆盖 `plugins/*`；复用现有 `ci-plugins`、`workspace-boundaries`、`workspace-lifecycle`、`plugin-developer-cli` Gate 与包内生命周期，不新增 root script 或 Change 专用 Gate。
- 新增 `docs/en/development/translation.md` 及 `docs/zh/development/translation.md`，同步两语言索引与受影响的插件工作区、开发入口、CI/验证说明；归档前执行变更级和文档导航触发的项目级治理审计。
- 用户后续已授权 apply，实施与确定性验证记录见 [tasks.md](tasks.md)；本轮先修订 active design/specs/tasks，再实施 Host HTTP；稳定规范同步和归档仍按任务保留后续流程，未提交、发布或安装插件。
