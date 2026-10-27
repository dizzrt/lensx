# 翻译官方插件

## 身份与范围

翻译插件是直接 workspace 成员 `plugins/translation`，包名为
`@lensx/official-translation`，插件 ID 为 `dev.lensx.translation`。其 Manifest
声明一个 `main` Page 和一个 `open` Action，名称本地化为 **Translation** 和
**翻译**，初始页面尺寸为可调整的 800 × 480，实际呈现服从 Host 工作区约束。

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

卡片上方为紧凑居中的语言组：主色实心源语言胶囊、语言互换按钮、描边目标语言胶囊。
互换箭头使用明确 SVG 尺寸，在禁用时也保持可辨认。设置入口保留在右侧。源/目标文字标签视觉隐藏，同时保留完整本地化可访问名称和键盘操作。
插件视口宽度至少为 720px 时，原文与只读译文使用等宽双列，原文在左；更窄时按原文、
译文顺序堆叠，语言控件可以换行。可调整的 800 × 480 初始尺寸沿用现有 Host 呈现契约，
实际布局取决于 Host 约束后的宽度。

两张外层卡片共享中性主题表面。内部原文控件使用中性表面，内部译文控件使用轻微主色表面。
文本控件聚焦时不添加蓝色焦点大框，也不为卡片标题增加下划线或其他装饰；原生光标与选区保持有效，选择器和操作按钮保留键盘焦点提示。更紧凑的间距和约 140px 的文本区
最小高度减少初始工作区高度。正文保持可读，在控件内换行和滚动；短窗口、长反馈与设置内容
通过当前视图的纵向滚动保持其控件可达。CSS 重排同一组节点，不改变焦点、选择、组合输入或请求身份。

工作区不显示原文计数、清空按钮、译文空状态指引或底部服务发送行。用户通过原生编辑删除文本，
选中只读译文后使用原生复制。控制器仍执行 5,000 码点校验，超限时提供错误反馈但不截断文本。
自动翻译仍在最后一次有效编辑后 400 ms 执行；不提供手动翻译、一键复制、朗读或文档/图片/语音
翻译控件。语言互换只改变所选方向，规则见下文。

服务返回的标记内容按普通文本显示。标签、语言名称、禁用原因、反馈和设置通过插件自己的
`PluginUiProvider` 与完整 Runtime Context 更新支持英文和简体中文。locale、主题及布局变化
不改变文本、语言、请求时间或翻译与存储请求数量。

译文下方不显示可见状态或元信息区域，也不显示 RequestId 与检测语言文字。等待、翻译中、
成功和暂停通过视觉隐藏的礼貌 live region 向辅助技术提供状态，请求期间保留 busy 语义；
空译文保持空白且不播报。需要操作的输入限额、语向、HTTP 不可用及请求失败信息显示在
语言控件附近，符合条件的失败请求在此提供显式**重试翻译**，不使用 Toast 或重复播报。

缺少凭据时引导打开设置。语言栏附近的配置反馈为读取失败或无效记录提供**重新读取配置**；
不受支持的已保存目标通过选择有效目标修复。目标或互换保存失败保留已确认语向，错误显示在
语言控件附近。这些恢复操作与请求重试保持区别。缺少 Host HTTP 支持时保留升级 Host 的说明。

打开**设置**会进入同一插件文档与 Runtime 内的独立设置视图，不创建 Host Page、路由或
原生窗口。设置可见时，翻译工作区完全隐藏且不可交互；原文/译文控件和控制器保持挂载，
返回后保留文本、结果、语言、选区和编辑历史。设置页头提供**返回翻译**，并保留保存/取消流程。

设置配置唯一可用服务火山引擎，说明原文发送至该服务、凭据以未加密形式保存在本机。
Access Key ID 与 Secret Access Key 仍默认掩码显示。保存校验独立草稿并等待存储确认；
返回和取消丢弃未保存草稿。校验或明确保存失败时保持设置视图与草稿可见，最近确认配置不变。

进入设置时将视图滚动到顶部并聚焦第一个凭据输入。返回、取消、Escape 或保存成功后恢复
工作区；工作区可见之后再恢复原滚动位置和设置入口焦点。输入法使用的 Escape 保持默认行为。
文本编辑与选择继续使用原生控件，不增加全局处理器。

设置暂停等待中的翻译并取消在途本地工作。返回时按已确认请求条件恢复当前有效输入；
仍然有效的成功结果不会因视图切换而重复请求。保存期间可以先返回工作区并继续编辑原文，
冲突写入和翻译仍等待确认或核对完成。返回不会静默取消或回滚已经提交的写入。旧设置会话的
迟到响应不能关闭后来重新打开的设置视图。

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

**交换语言**反转受支持语对，不将译文替换为原文。当前目标必须能作为源，当前源必须能作为目标，
反向语向也必须有效。Auto 模式仅使用仍有效的已确认结果中的检测语言。没有可用检测结果或语对
不能反转时，控件禁用并提供本地化说明；不会猜测 Auto 对应语言，也不额外请求检测。

互换先持久化反向目标。确认期间旧语对继续有效，语言编辑和重复互换禁用，翻译等待。
确认后源与目标共同反转，未改写的当前原文沿用 400 ms 调度。明确失败保留旧语对并显示保存错误。
结果不明时沿用既有存储重读核对流程，不提前使用未确认或半反转语向。旧 Runtime 回调不能将互换
应用到新页面。源语言仍仅在页面内存中保留，不增加存储字段。

内置语言目录是[官方语言支持表](https://docs.volcengine.com/docs/MachineTranslation/Languagesupport?lang=zh)
的带日期发布快照。2026-10-22 对该表的审核（页面更新日期：2023-11-03）记录了
129 个 provider code，不计 Auto 时有 128 个源语言选项和 123 个目标语言选项。
目录区分 `zh`、`zh-Hant`、`zh-Hant-hk` 和 `zh-Hant-tw`。
`sk` 仅作为目标；`bo`、`nan`、`wuu`、`yue`、`cmn` 和 `ug` 仅作为源，且只能翻译到 `zh`。
不支持的显式语向会被阻止，不改变已选择目标。自动识别可能收到服务错误 `-415`；
此时插件提示用户调整语向，不自动重试或选择其他语言。目录收录不证明支持自动识别，
也不证明每个语言对都经过真实联调。

## 输入、请求与错误

原文控件使用 `spellCheck=false`、`autoCorrect="off"`、`autoCapitalize="off"` 和
`autoComplete="off"` 请求关闭拼写及自动更正提示。这些局部属性不改写原文、不修改系统全局
偏好，也不禁止原生输入法候选窗口。DOM 属性存在属于确定性证据，实际系统输入 UI 行为
仍由平台负责。

符合条件的文本在最后一次实际编辑结束 400 ms 后提交。同值重复事件不重启工作。
IME 组合输入会取消旧工作、保持原生草稿可见，并保留完整最终中文。组合提交只启动一次新防抖；
其后的同值 input 事件不重复提交或重置计时。旧受控值不能覆盖当前草稿或最终提交字符。
原生删除至空或结束 attempt 会退休旧组合会话，迟到 composition-end 或 input 不能恢复文本。

带组合标记的临时空草稿保留同一有效会话和 token。例如，`compositionstart → input n →
input 空串 → input ni → compositionend 你` 必须保留 `你`；只有普通非组合清空才退休会话。
控制器仍使用一份文本快照，页面根据公开原生 `isComposing` 或 composition 类型的 `inputType`
标记调用 `input(text, { composing })`。原生 `input` 同时缺少两类元数据时，页面以当前有效
组合 token 与控制器会话作为回退；显式非组合 input 或普通 change 不使用此回退。
这修复了旧路径因输入法临时空草稿提前退休会话、
继而拒绝后续候选或提交的问题。

纯空白输入清空译文和反馈且不请求，即使超过 5,000 个字符也是如此。
其他输入的本地上限为 5,000 个 Unicode code points：一个代理对计数一次，
组合字符分别计数。超限文本保留可编辑状态，不截断、不拆分。
例如，`😀` 计为一个码点，`e` 后接 U+0301 计为两个码点。页面没有可见计数；超长纯空白
仍保持空状态，不显示输入超限错误。将非纯空白输入从 5,001 个码点修正
为 5,000 个后，满足其他翻译条件时恢复正常的 400 ms 调度。
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
Provider 仍只接受长度为 1–128 个 ASCII 字符且匹配 `[A-Za-z0-9._:-]+` 的诊断 RequestId；
工作区不渲染该值或检测语言元信息。
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

确定性检查使用受控 SDK 存储/HTTP、clock、服务响应、签名向量与真实 DOM 组件。
响应式布局检查覆盖声明的 CSS 断点、溢出、主题 token 与控件连续性；Happy DOM
不证明真实几何排版或像素外观。检查不调用翻译服务、不读取真实凭据、不启动浏览器
或 WebView，也不证明原生复制/IME 投递。
OPTIONS 探测不等于签名 POST 或真实 WebView 网络验收。已报告的 CORS 失败促成原生传输
修订，但不证明用户凭据无效。构建和打包不发布或安装插件；
安装与开发重载仍是显式的既有 Host 操作。
