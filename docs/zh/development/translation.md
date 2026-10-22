# 翻译官方插件

## 身份与范围

翻译插件是直接 workspace 成员 `plugins/translation`，包名为
`@lensx/official-translation`，插件 ID 为 `dev.lensx.translation`。其 Manifest
声明一个 `main` Page 和一个 `open` Action，名称本地化为 **Translation** 和
**翻译**，初始页面尺寸为可调整的 800 × 600，实际呈现服从 Host 工作区约束。

本参考描述实现与已审核依赖。验证限定于确定性范围，不代表已发布、安装、
完成真实账户翻译或通过实际 WebView 网络验收。

插件拥有自己的 React/Semi 界面、翻译状态、语言目录、火山引擎适配器和配置界面。
它消费公共 Contract、SDK、Plugin UI 与 Testkit exports，并通过公共 CLI 制作插件包。
SDK 提供 Runtime Context、插件专属存储和公共 `http.request` 传输。Rust 执行受控 HTTPS；
翻译逻辑、凭据配置与签名仍留在插件。官方身份不授予私有 Host 或 Tauri API、文件系统、
进程、Node Runtime、剪贴板 API 或后台执行能力。

本次范围是使用用户提供的火山引擎 AK/SK 进行前台文本翻译，不包含其他服务、历史、
OCR、划词捕获、长文自动拆分或 Host 设置扩展。安装和手动开发重载沿用既有的
[工具与安装](../plugin-development/tooling-and-installation.md)及
[开放 Runtime](../plugin-development/runtime-permissions-security.md)边界。
成员与生命周期规则见[插件 Workspace](plugin-workspace.md)。

## 工作区与设置

工作区上方为可编辑多行原文，下方为可选择文本的只读多行译文。服务返回的标记内容
按普通文本显示。标签、语言名称、反馈和设置支持英文与简体中文；插件自己的
`PluginUiProvider` 根据完整 Runtime Context 更新界面语言及明暗主题。这些表现层变化
不改变文本、语言选择或翻译请求数量。

打开**设置**以配置唯一可选服务火山引擎。Access Key ID 和 Secret Access Key 字段
默认掩码显示。面板位于当前文档内，保留原文控件与文本，并将草稿值和已确认配置分开。
保存时校验草稿并等待存储确认；取消时丢弃草稿。打开时焦点进入面板，关闭后返回设置入口。
Escape 关闭设置，但输入法正在使用的按键优先保留。文本编辑与选择由当前聚焦的原生
控件处理，没有全局编辑或剪贴板处理器。

打开设置会暂停等待中的翻译并取消正在进行的本地工作；关闭后恢复当前符合条件的输入。
请求条件未变时保留已有成功译文，包括保存未修改配置的情形。配置提交期间阻止冲突保存，
原文仍可编辑。

## 配置与本机数据

公共 `storage.get` 和 `storage.set` 使用插件自己的单个 key `settings.v1`，
其带版本 JSON 结构如下：

| 字段 | 含义 |
| --- | --- |
| `version` | 固定为 `1`。 |
| `provider` | 固定为 `"volcengine"`。 |
| `targetLanguage` | 可选的受支持目标 code；缺省时保留按界面语言推导默认值的行为。 |
| `credentials.accessKeyId` | 与 `secretAccessKey` 同时可选；经过校验的 Access Key ID。 |
| `credentials.secretAccessKey` | 与 `accessKeyId` 同时可选；经过校验的 Secret Access Key。 |

表单提交先去除外围空白，再要求每个 key 包含 1–4,096 个从 `!` 到 `~` 的可打印
ASCII 字符；内部空格和控制字符会被拒绝，不会被改写。持久记录必须已满足该格式。
未知字段、不完整凭据对及其他 provider 在版本 1 中均为无效。

AK/SK 通过 Host 既有的插件专属 JSON 持久化，**以未加密形式保存在本机**。
命名空间隔离不等于加密、钥匙串或凭据保险库。插件不持久化原文、译文或历史，也不使用
浏览器 origin storage 跨 generation 恢复配置。符合条件的翻译执行时，原文会发送至火山引擎；
本地取消不能撤回已发送文本，也不保证服务尚未计费处理。

只有明确返回 `{ found: false }` 才按新配置处理。加载中、存储不可用、读取失败、
不支持的版本及结构损坏记录均阻止翻译，不会被默认值静默覆盖。显式重新加载可以重试读取。
若版本和其余字段合法、仅保存的目标语言不受支持，可以显式选择有效目标修复该字段，
同时保留已验证凭据。未知版本或结构损坏不能采用该修复路径。

写入基于最近已确认的完整记录串行执行。目标更新保留凭据，凭据保存保留目标。
明确失败保留旧值。若超时、取消或回复丢失使提交结果不明，翻译暂停并重新读取存储；
不会假设回滚或自动重复写入。重读核对失败时持续阻塞，直到显式重新加载成功。

禁用插件保留配置。清除插件数据或删除数据卸载沿用既有 Host 工作流。
保留数据的同 ID 重装可以恢复配置，但新页面仍从空原文和空译文开始。

## 语言选择

每个新的 Runtime attempt 都以**自动识别**作为源语言，此值仅存在于界面与 controller。
自动识别请求省略 `SourceLanguage`，不会把 `"auto"` 当作服务 code 发送。
手动源语言仅在当前页面内保留。

目标语言优先恢复有效的已保存选择。没有保存目标时，使用本页面首次有效 Context：
`en-US` 映射为 `en`，`zh-CN` 映射为 `zh`。推导默认值不写入存储，即使配置读取晚于
后续 Context 事件也是如此。显式选择目标会自动保存完整记录，确认后才生效；
保存失败保留上一有效目标。将当前推导目标保存为相同值不会使成功译文失效。
后续 Host locale 变化仅更新标签；没有持久目标的新页面可以推导不同默认值。

内置语言目录是[官方语言支持表](https://docs.volcengine.com/docs/MachineTranslation/Languagesupport?lang=zh)
的带日期发布快照。2026-10-22 对该表的审核（页面更新日期：2023-11-03）记录了
129 个 provider code，不计 Auto 时有 128 个源语言选项和 123 个目标语言选项。
目录区分 `zh`、`zh-Hant`、`zh-Hant-hk` 和 `zh-Hant-tw`。
`sk` 仅作为目标；`bo`、`nan`、`wuu`、`yue`、`cmn` 和 `ug` 仅作为源，且只能翻译到 `zh`。
不支持的显式语向会被阻止，不改变已选择目标。自动识别可能收到服务错误 `-415`；
此时插件提示用户调整语向，不自动重试或选择其他语言。目录收录不证明支持自动识别，
也不证明每个语言对都经过真实联调。

## 输入、请求与错误

符合条件的文本在最后一次实际编辑结束 400 ms 后提交。同值重复事件不重启工作。
IME 组合输入会取消旧工作、仅在本地保留草稿，并在最终组合提交后启动一次新防抖。
清空输入或结束 attempt 会退休旧组合会话，迟到的 composition-end 不能恢复文本。

纯空白输入清空译文和反馈且不请求，即使超过 5,000 个字符也是如此。
其他输入的本地上限为 5,000 个 Unicode code points：一个代理对计数一次，
组合字符分别计数。超限文本保留可编辑状态，不截断、不拆分。
符合条件的请求保留全部原始空格、换行和 Unicode 字节，`TextList` 恰有一项。

| 请求字段 | 固定契约 |
| --- | --- |
| Endpoint | `https://translate.volcengineapi.com/` |
| Method 和 query | `POST`，`Action=TranslateText&Version=2020-06-01` |
| 签名 scope | UTC 日期 / `cn-north-1` / `translate` / `request` |
| Body | `TargetLanguage`、`TextList: [source]`，仅手动源模式携带 `SourceLanguage`。 |
| Host HTTP 策略 | 公共 `http.request`；不共享 Cookie/系统凭据、不重定向、不重试，endpoint 不可配置。 |
| 截止时间 | 15 秒，覆盖签名至响应读取。 |
| 响应边界 | 响应字节最多 1 MiB。 |

JSON body 仅序列化一次，签名和发送使用相同字节。请求携带 `Content-Type`、
`X-Date`、`X-Content-Sha256` 和 `Authorization`；签名 headers 为
`host;x-content-sha256;x-date`，实际 Host header 由 Rust HTTP transport 根据已校验 URL 提供。
参见[文本 API](https://docs.volcengine.com/docs/4640/65067)及
[签名契约](https://docs.volcengine.com/docs/APISignatureCallGuide/Signaturemethod-9?lang=zh)。

响应展示前受到大小限制。非 2xx 正文仍会检查可识别的 `ResponseMetadata.Error`；
含服务错误的 HTTP 200 也按失败处理。成功要求 `TranslationList` 恰有一项，且
`Translation` 为字符串。畸形 JSON、缺字段、多条结果或超大正文均不会产生部分或猜测译文。

本地英文/中文反馈区分配置、输入超限、语向/参数、凭据/签名、权限/账户、时钟、限流/配额、
Host capability/策略/payload 限制、网络/不可用、超时、服务、协议和存储失败。原始异常对象和服务消息不直接展示或记录。
RequestId 只有在长度为 1–128 个 ASCII 字符且匹配 `[A-Za-z0-9._:-]+` 时可以显示。
Host 传输失败保留安全类别，不猜测具体 DNS、TLS 或连接原因。原生 HTTP 不受浏览器
CORS 响应过滤限制，因此可以读取服务错误而不修改 WebView 安全设置。
失败保留原文并要求显式重试；同一请求进行中重复激活重试不会增加并行调用。

## 结果身份与生命周期

文本、源语言、有效目标或已确认请求配置变化时，立即使旧工作和不匹配的结果失效。
请求 generation 和 Runtime attempt 守卫每个成功、失败、超时与完成回调，
不依赖 abort 是否阻止了远端调用。持久化确认本身不代表配置语义发生变化。

在同一当前 attempt 内隐藏并恢复 Launcher，会保留原文、译文、语言选择、设置草稿与
请求状态，不因恢复显示单独发起请求。真实关闭、导航、禁用、替换、卸载、开发重载、
断线或 SDK 重试会取消计时器和本地请求、移除订阅并使旧回调失效。
新 attempt 重新加载配置，并从空文本开始。

## 已审核的签名依赖

`@noble/hashes@2.4.0` 是精确固定的插件私有 runtime dependency。
2026-10-22 的审核检查了[已发布 npm tarball](https://registry.npmjs.org/@noble/hashes/-/hashes-2.4.0.tgz) 的 SHA-512 integrity、package export map、
MIT 许可证（Copyright 2022 Paul Miller）、ESM 元数据及零 runtime dependency 的依赖图。
实现使用公开的 `sha2.js`、`hmac.js` 和 `utils.js` 路径；SHA-256/HMAC 依赖闭包是纯
JavaScript/TypedArray 代码。签名路径不需要 Node builtin、Buffer shim、Web Crypto、
随机数或远程代码。生产模块清单另行检查，不将这份源码审核等同于产物依赖图证明。

已审核 tarball 的 integrity 为
`sha512-X5XaVWZIBCT7HHZGm5I7ZQXDwLG+bGXuSrMQAW+7Zvl87h1kmc1ZB1VSRJcpUfoUrGQp4Fkoxm5kZ+Ms+aW+eA==`。

固定签名向量使用虚构凭据，以及独立执行的
[官方 signer commit `157b31f`](https://github.com/volcengine/volcengine-nodejs-sdk/blob/157b31fea2922fcbcf5192b6c954eabd583e28d6/packages/sdk-core/src/utils/signer.ts)。
该参考文件的 SHA-256 为
`3e3fb9f5185a87ca859d92f1b208b707d297bbb9db1a13d37104412e20559c3e`。
向量保留 Unicode、空格、换行、UTC 日期，以及省略和显式提交源语言字段的区别；
期望值不由被测 signer 生成。插件不打包官方 Node SDK：它使用 Node 设施，且其
[2025 翻译客户端](https://github.com/volcengine/volcengine-nodejs-sdk/blob/157b31fea2922fcbcf5192b6c954eabd583e28d6/service/translate20250301/src/api.ts)
使用 API `2025-03-01`、默认 region `cn-beijing`，不能替换本插件的
`2020-06-01` / `cn-north-1` 契约。

## 构建与交付证据

Manifest 使用 `0.4.0`，支持 Host API 从 `0.3.0` 到不含 `0.4.0` 的版本范围。
需要同时升级 Host 和公共 SDK；已安装插件快照不可变，需要重新构建并显式重载或替换
插件包才能使用新传输。不提供 `http.request` 的旧 Host 会保持 unavailable，插件不会
静默退回 WebView fetch。
插件自行拥有 React、Semi 和签名依赖，不导入其他插件、Host 源码或 Tauri 实现。

现有聚合命令准备公共 workspace 依赖，并运行每个直接插件的 lifecycle 和纯 Node
构建后检查：

```bash
pnpm run gate -- ci-plugins
```

依赖准备完成后，包内命令为：

```bash
pnpm --dir plugins/translation run typecheck
pnpm --dir plugins/translation run test
pnpm --dir plugins/translation run check
pnpm --dir plugins/translation run build
pnpm --dir plugins/translation run test:e2e
```

生产产物在 `dist/` 内自包含，使用本地脚本、样式及 `connect-src 'none'` 文档 CSP。
生产翻译使用公共 SDK，不提供浏览器网络 fallback。仅构建使用的模块清单位于 `dist/` 外的 `.build/modules.json` 和
`.build/chunk-modules.json`，本地源码路径不会进入插件包。
构建后检查在操作系统临时目录中执行公共 CLI `validate`、两次
`pack --no-build` 和 `inspect`，验证包与资源闭包、重复打包字节，并在成功或失败后
清理临时产物。它不使用 CLI 私有模块或仓库本地 pnpm store。

检查仍调用真实的 `lensx-plugin` 命令。在尝试解析 JSON 之前，先报告
`ENOENT`、`EACCES` 等启动错误、信号终止、缺少退出状态和非零退出。
零退出但 JSON 为空或非法、envelope 结构错误、命令状态不符合预期，属于单独的
输出协议失败。每条诊断包含可执行命令、子命令以及可用的错误标识、退出状态或信号。
stdout/stderr 每路摘要包含截断标记在内最多 4 KiB；缺失输出显示为 `<empty>`。
这些是工程诊断，不修改公共 CLI JSON 协议或产品文案。现有包内测试使用构造的
进程结果覆盖纯结果辅助模块，不启动子进程，也不导入 E2E 入口。

遇到启动失败时，先检查消费者命令入口和安装结果；遇到构建产物缺失时，检查既有
公共依赖准备步骤。独立源码安装回归通过 `pnpm run gate -- plugin-developer-cli`
运行；已有本地命令入口或预构建 tarball 消费者成功不能证明干净安装有效。
修复失败后，重新运行失败阶段及受影响的 Gate。

focused `plugin-host-http`、`workspace-boundaries`、`workspace-lifecycle` 和
`plugin-developer-cli` Gate
补充完整根前端/工作区与 Rust 验证，不替代完整 lifecycle。不需要翻译专用根脚本、
Gate 或 workflow。参见[验证](validation.md)和[持续集成](continuous-integration.md)。

确定性检查使用受控 SDK 存储/HTTP、clock、服务响应、签名向量与真实 DOM 组件，
不调用翻译服务、不读取真实凭据、不启动浏览器或 WebView，也不证明原生复制/IME 投递。
OPTIONS 探测不等于签名 POST 或真实 WebView 网络验收。已报告的 CORS 失败促成原生传输
修订，但不证明用户凭据无效。构建和打包不发布或安装插件；
安装与开发重载仍是显式的既有 Host 操作。
