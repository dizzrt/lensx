# 兼容与错误

## 版本维度

以下维度独立演进：

| 维度 | 当前基线 | 含义 |
| --- | --- | --- |
| 公共 package | `0.2.0` | Package exports 与实现 release。 |
| Manifest protocol | `0.2.0` | 作者输入与 normalized Manifest wire contract。 |
| Host API protocol | `0.2.0` | Semantic method、result、event、error 与 context。 |
| lensX application | `0.1.0` | Manifest 检查的 Host compatibility range。 |
| `.lxp` package format | `0.1.0` | Canonical archive 与 checksums profile。 |

Package patch 不会自动改变 protocol。Manifest 分别为 lensX 与 Host API 声明半开 compatibility
range。SDK 支持 Host API `>=0.2.0 <0.3.0`，并在 ready 前拒绝 incompatible context。

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
8. 在 Runtime 检查最新 context，区分 missing capability、`method_not_found`、unavailable provider、
   disconnect 与 timeout。

修复第一个失败边界并从 canonical input 重跑；不要复用上次失败 attempt 的 generated cache。

## 尚未交付

公共 package 尚未发布到 npm。当前没有公共下载 URL、watch/HMR、自动 Development Mode reload、
签名、Marketplace、远程分发、自动更新或用户选择的 rollback history。不得把这些缺失翻译成猜测
命令或 fallback import。
