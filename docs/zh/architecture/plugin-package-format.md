# 插件包格式

## 已交付范围

lensX 已定义并实现用于单文件插件交付的 package protocol `0.1.0`。可见扩展名为 `.lxp`；其字节必须
恰好是一个受限 Zstandard frame，内部包含 canonical、ustar-compatible TAR 流。workspace-private
TypeScript reference implementation 与 Host-private Rust inspector 消费同一份已提交 corpus，并返回一致的
`invalid | compatible | incompatible` 结果、inspection facts、安全 diagnostics 和整包 digest。

Package protocol 本身只描述并检查字节；它不拥有 source path、installation layout、Plugin Manager
mutation、lifecycle、公共 CLI 或 development-directory input。Host 私有本地安装器是该协议的独立消费方：
它可以把一个选中的兼容包复制到 Host-owned application data，并创建首条 external registration，但不会
改变有效 `.lxp` 的定义。

## Canonical Layout

解压后的 TAR entries 顺序如下：

1. `manifest.json`；
2. `checksums.json`；
3. 其余文件按 UTF-8 path bytes 升序排列。

只允许普通文件。Header 使用 mode `0644`、`uid=0`、`gid=0`、`mtime=0`、空 owner/group name 以及 ustar
magic/version，并且不保留源文件系统 metadata。流必须以恰好两个 zero blocks 结束。目录、link、device、FIFO、
sparse data、PAX/GNU extensions、xattr、ACL、重复 path 和 ASCII 大小写不敏感冲突都无效。

Path 是使用 `/` 分隔的 NFC UTF-8 相对路径，最多 100 UTF-8 bytes 和 16 segments。Segment 只使用 ASCII
字母、数字、`.`、`_`、`-`，首尾必须是字母或数字，且不能使用 Windows reserved basename。这些 package
可移植性规则有意严于 Manifest 字符串 schema。

## 完整性与身份

`checksums.json` 是无 BOM 的 canonical UTF-8 JSON，使用 LF、恰好一个末尾换行、固定字段顺序且没有未知
字段。它声明：

```json
{"package_format_version":"0.1.0","algorithm":"sha256","files":[]}
```

`files` 包含除 `checksums.json` 自身之外的每个普通文件，并按 path bytes 排序。每条 record 只包含 `path`、
准确的解压 `size` 和小写 SHA-256。遗漏、额外、重复、乱序、非 canonical 或不匹配的 record 都会使包无效。

三个完整性值承担不同职责：

- Zstandard frame checksum 用于快速发现传输损坏；
- 每文件 SHA-256 records 建立内部文件/checksum 一致性；
- algorithm-labelled package digest 是完整 `.lxp` 每个字节的 SHA-256，并建立后续可信 Host workflow 消费的
  package identity。

Author Manifest 不能声明 package digest、安装来源/路径、enabled state、grant、lifecycle、Runtime state、
signature status 或 official/verified provenance。Publisher 文本仍是不可信 author data。

## Zstandard Profile 与 Limits

可接受的 `.lxp` 恰好包含一个带 content size 和 content checksum 的标准 frame。Dictionary、skippable 或
concatenated frame、trailing bytes 以及大于 64 MiB 的 window 会在解压前被拒绝。两个 inspector 都增量解码、
设置自己的 limits，并将 codec/TAR/I/O failure 映射为稳定 diagnostics，而不会返回 raw error 或 Host path。

| Limit | Protocol `0.1.0` 值 |
| --- | ---: |
| 压缩 `.lxp` | 64 MiB |
| Zstandard window | 64 MiB |
| 包含 header 与 padding 的解压 TAR 流 | 256 MiB |
| 包含 metadata record 的普通文件数 | 4096 |
| 单个 payload 文件 | 64 MiB |
| `manifest.json` | 1 MiB |
| `checksums.json` | 4 MiB |
| Entry path | 100 UTF-8 bytes / 16 segments |

Reference packer 使用 compression level 19、启用 content size 和 checksum，并且从不使用 dictionary。格式可
接受其他满足 frame profile 的编码，但只有固定 reference dependency 和参数定义已提交的逐字节 reproducibility
baseline。

## Manifest 与资源检查

Checksums 验证成功后，`manifest.json` 才会进入现有 `@lensx/plugin-contract` validation/normalization API
或其 Rust counterpart。Package inspection 不复制 Manifest schema、语义、默认值或 compatibility 逻辑。结构有效但
不在当前 lensX 或 Host API range 内的 Manifest 返回 `incompatible`；package、checksum、Manifest 或 resource
failure 返回 `invalid`。

规范化后的 `runtime.entry` 以及每个 display、Page、Action asset path 必须精确解析到被 checksums 覆盖的普通
payload 文件。匹配不会折叠大小写、URL decode、替换 separator、canonicalize filesystem path，也不允许指向
metadata record。Inspection 会读取 metadata bytes，但不会加载 HTML/assets 或执行代码。

Invalid 结果只暴露排序、去重后的 `{ code, path, message }` diagnostics。它不包含 partial Manifest、file map、
可信 digest fact、Host state、绝对路径、raw exception、stack 或文件内容。

## Installer 消费边界

Host 私有 installer 会执行 source metadata 检查和一次 capped read，之后把得到的 `.lxp` bytes 视为不可变
输入。它先 inspection，并且只 extraction 一个 `compatible` 结果。Extraction 复用相同的 canonical
Zstandard/TAR traversal、header 检查、path rules、entry facts、checksums 与 hard limits；不会重新打开所选
source，也不会调用宽松 archive unpack API。文件通过 `create_new` 创建在新的 Host-owned staging directory
内，并在同文件系统原子 commit 前完成刷新。

Source-file race 检查、staging 与 digest-directory layout、Manager registration、locks、rollback 和 recovery
由 installer 拥有，而不是 package protocol `0.1.0`。Package bytes 不能声明 source、installed path、enabled
intent、grants、Runtime state 或 lifecycle operation。Application-local installer store 也与已签名 application
bundle 分离：在 macOS 上，删除 `lensX.app` 并不能保证 Application Support 数据被清理。应用卸载清理、
plugin uninstall 和 upgrade/rollback 仍是后续 lifecycle change。

## 已审查依赖

依赖版本是精确的仓库输入，而不是 wire-format facts：

| 层 | 依赖 | License 与平台/维护依据 | 所需能力 |
| --- | --- | --- | --- |
| TypeScript | `@structured-world/structured-zstd@0.0.49` | Apache-2.0；纯 Rust/WASM ESM；Node >=18；SIMD 与 scalar payload 可在 macOS、Windows、Linux 的 Node 24 上运行；实现 protocol `0.1.0` 时已审查当前 package source 与 release metadata。 | 带 content size/checksum 的 level 19 one-shot encoding，以及验证 checksum 的 streaming decode；不使用 Node experimental API、native addon、system executable 或 dictionary。 |
| TypeScript | Node `crypto` 与仓库 canonical TAR implementation | Node 24 built-ins 和项目自有受限 writer/parser。 | 增量 SHA-256、精确 ustar bytes 和 fail-closed profile checks，不接受通用 archive extensions。 |
| Rust | `zstd = 0.13.3` | MIT；维护中的 zstd `1.5.7` Rust bindings，在受支持桌面 target 上提供 streaming decoder 和显式 maximum window 参数。 | 验证 checksum 的单 frame streaming decode。 |
| Rust | `tar = 0.4.45` | MIT/Apache-2.0；维护中的跨平台 Rust crate。 | 只解析 header；项目代码仍逐字节比较受限 canonical header 并拒绝 extensions。 |
| Rust | `sha2 = 0.10.9` | MIT/Apache-2.0；用于受支持桌面 target 的 RustCrypto implementation。 | 文件与 package identity 的增量 SHA-256。 |

任何 dependency、encoder parameter、constant、fixture byte 或 digest 变化都必须显式审查。Drift gate 不会重写 baseline。

## 验证

从仓库根目录运行专项门禁：

```bash
pnpm run check:plugin-package-format
```

它检查固定依赖和跨语言重复 constants，验证 committed fixture bytes 且不重写，运行 focused TypeScript 与
reproducibility tests，并运行 Rust shared-fixture 和 boundary tests。只有有意更新 baseline 时才使用：

```bash
pnpm run generate:plugin-package-format-fixtures
```

Corpus 持有 `valid`、`invalid`、`incompatible`、`reproducible` cases，以及明确的 expected normalized Manifest、
inspection facts、diagnostics、file/checksum facts 和 reference `.lxp` digest。
