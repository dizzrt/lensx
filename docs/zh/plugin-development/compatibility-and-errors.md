# 兼容与错误

## 版本维度

以下维度独立演进：

| 维度 | 当前基线 | 含义 |
| --- | --- | --- |
| Contract package | `0.4.0` | 公共 Manifest 与 Host API semantic contract。 |
| UI/Testkit/CLI package | `0.2.1` | UI、测试 helper 与作者工具。 |
| SDK package | `0.5.0` | root semantic client 与 `/webview` production transport。 |
| Manifest protocol | `0.4.0` | 作者输入与 normalized WebView Manifest wire contract。 |
| Host API protocol | `0.4.0` | Semantic method、result、event、error 与 context。 |
| Private bridge carrier | `0.2.0` | closed Host/native-to-plugin transport frame；不是 Host API。 |
| lensX application | `0.1.0` | Manifest 检查的 Host compatibility range。 |
| `.lxp` package format | `0.1.0` | Canonical archive 与 checksums profile。 |

Package patch 不会自动改变协议。SDK `0.5.0` 支持 Host API `>=0.4.0 <0.5.0`，
在 ready 前拒绝旧版本或不兼容的 Context。当前模板、ConfigLens 与 Translation 均声明该范围。
已有 SDK `0.3.0` 和 `0.4.0` 包不理解当前激活目录；必须升级公共依赖、修改 Manifest 范围、
重新构建与打包。Host 不协商旧目录或改写安装包。迁移后仍可省略可选回调。
UI、Testkit 与 CLI 的 patch 版本承载更新后的依赖元数据和模板；Manifest、carrier、应用和包格式版本不变。

只有 Context 声明 `actions.subscribe_activations` 时，SDK 才在初始化期间开启激活订阅。
开流前失败可以回到 idle，允许显式重试；尝试订阅后初始化失败则终止 SDK、transport 和 Session attempt。
重试必须建立新的 Runtime attempt 和 SDK，不重放旧激活。

## 校验结论

- **compatible**：结构、语义、资源、package profile 与 current version range 被该 checker 接受。
- **incompatible**：输入结构合法，但 current lensX 或 Host API version 位于 range 外。
- **invalid**：Schema、semantic、path、resource、checksum、limit 或 canonical package 要求失败。

CLI `validate` 和 `inspect` 是只读分类。`pack` 默认 build，然后 validate、transactional write 与
self-inspect；`--no-build` 时跳过 build。Host 会执行自己的可信 inspection 和 preparation；CLI
compatible 不承诺安装或执行。

## 错误分类

Manifest 与 package diagnostic 使用稳定 machine-readable code/path。CLI envelope 区分 usage error、
operational failure、invalid、incompatible 与 success，不会把任意 child output 混入 JSON。
Host API method error 见 [Host API](host-api.md#稳定错误)。SDK lifecycle error 覆盖 cancellation、
timeout、transport failure、disconnection、disposal、invalid context 与 incompatible Host API。

Manifest `0.3.x` 与更早 package（包括旧 iframe package）仅作为迁移期不兼容输入。
Host 与 CLI 不会改写它，也不存在 fallback Runtime；请从当前 template 重新构建并迁移到
`@lensx/plugin-sdk/webview`。

不得按 English message 分支。使用稳定 code 和受限 public location，再展示本地化 recovery 文案。
不要记录 package content、所选 path、stored value 或私有 failure detail。

## 排障顺序

1. 确认 Node/pnpm range，且真实 package tarball 与 Host build 匹配。
2. 运行项目 test 与 typecheck。
3. build 并确认 `dist/manifest.json` 及所有引用资源存在。
4. 运行 CLI validate；先修复 invalid，再考虑 compatibility。
5. pack 两次并 inspect；相同输入必须产生相同字节。
6. 对 Development Mode 确认专用 build、显式 opt-in、current registration 与 manual reload 结果。
7. 对正式 package 使用 Settings 本地安装，并遵循 Host 受限 preparation result 与 trust confirmation。
8. Runtime 阶段区分 native load、bridge ready、SDK Context、disconnect 与 timeout。一直停留在
   loading 且没有 bridge ready 通常指向 document 或 transport startup；Context failure 指向
   Host API compatibility。
9. presentation 问题运行 `pnpm run gate -- plugin-child-webview-runtime` 与
   `pnpm run gate -- plugin-child-webview-session`；它们诊断确定性的 contract 与 lifecycle 边界，
   不声称原生渲染证明。

修复第一个失败边界并从 canonical input 重跑；不要复用上次失败 attempt 的 generated cache。

## 尚未交付

公共 package 尚未发布到 npm。当前没有公共下载 URL、watch/HMR、自动 Development Mode reload、
签名、Marketplace、远程分发、自动更新或用户选择的 rollback history。不得把这些缺失翻译成猜测
命令或 fallback import。
