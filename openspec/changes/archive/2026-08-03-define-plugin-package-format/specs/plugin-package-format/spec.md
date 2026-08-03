## ADDED Requirements

### Requirement: Plugin package 必须使用独立版本的 `.lxp` 内容协议

系统 MUST 将 lensX plugin package 的用户可见扩展名定义为 `.lxp`，并 MUST 将其内容识别为 package protocol `0.1.0` 的受限 canonical TAR over Zstandard profile。Package protocol MUST 独立于 npm package version、Manifest protocol、Host API、Registration Contract、Plugin Manager Store 和 lensX application version。系统 MUST 根据内容、required records 和 `checksums.json` 中的 package protocol version 判断格式，MUST NOT 仅根据文件名或扩展名接受输入，也 MUST NOT 为旧 ZIP 或 `.lensx-plugin` 输入提供隐式别名、fallback 或迁移路径。

#### Scenario: 接受当前 `.lxp` package protocol

- **WHEN** 输入具有 `.lxp` 名称、单一有效 Zstandard frame、canonical TAR payload 和 `package_format_version: "0.1.0"`
- **THEN** 系统继续执行 package 内容与 Manifest 校验
- **THEN** package version 不改变或替代 Manifest、Host API 或应用版本

#### Scenario: 文件后缀正确但内容不是 `.lxp`

- **WHEN** 一个名为 `example.lxp` 的输入不是受支持的 Zstandard/TAR package profile
- **THEN** 系统以稳定 package-format diagnostic 拒绝输入
- **THEN** 系统不尝试把它作为 ZIP、普通 TAR、目录或其他压缩格式解释

#### Scenario: Package protocol version 不受支持

- **WHEN** `checksums.json` 缺少 `package_format_version` 或声明任何非 `0.1.0` 值
- **THEN** TypeScript 与 Rust 检查器都将 package 判定为 `invalid`
- **THEN** 检查器不通过兼容别名或猜测继续解析为其他 package version

### Requirement: `.lxp` 必须包含受限且确定的 canonical TAR payload

Zstandard 解压结果 MUST 是 canonical ustar 可表达的 TAR 数据流。TAR MUST 仅包含普通文件，MUST NOT 包含显式目录、符号链接、硬链接、设备、FIFO、稀疏文件、PAX/GNU 扩展、xattr、ACL 或其他特殊 entry。第一项 MUST 是根 `manifest.json`，第二项 MUST 是根 `checksums.json`，其余 entries MUST 按 UTF-8 path bytes 严格升序且每个 path 只出现一次。所有 regular-file headers MUST 使用 `uid=0`、`gid=0`、空 owner/group name、`mtime=0` 和 mode `0644`，并 MUST NOT 保留源文件系统 metadata。

每个 entry path MUST 是 NFC UTF-8 相对路径，只使用 `/` 分隔；完整路径 MUST 不超过 100 UTF-8 bytes 和 16 个 segments。每个 segment MUST 只包含 ASCII 字母、数字、点、下划线或连字符，MUST 以字母或数字开头和结尾，并 MUST NOT 是空值、`.`、`..`、Windows reserved basename 或产生 ASCII case-insensitive collision 的名称。

#### Scenario: 接受 canonical TAR entries

- **WHEN** TAR 以 `manifest.json`、`checksums.json` 开始，其他普通文件按 path bytes 排序，并且所有 headers 与路径满足 canonical profile
- **THEN** 两个检查器以相同 entry identity 和顺序读取 payload
- **THEN** 源文件系统的时间、owner、group 或 permission 不影响 package 内容

#### Scenario: 拒绝特殊或重复 entry

- **WHEN** TAR 包含符号链接、目录、设备、扩展 header、重复 path 或大小写冲突 path
- **THEN** 检查器在写入安装目录或解析 Runtime entry 之前将整个 package 判定为 `invalid`
- **THEN** diagnostic 不暴露 Host 绝对路径或原始解析异常

#### Scenario: 拒绝非 canonical 顺序或 metadata

- **WHEN** required records 不在前两项、payload entries 未排序，或任一 header 携带非 canonical uid、gid、mtime、mode、owner/group name
- **THEN** 系统拒绝 package 而不是静默重排或规范化输入
- **THEN** 已读取的部分内容不形成安装或注册事实

### Requirement: `.lxp` 必须使用单一受限 Zstandard frame

`.lxp` MUST 包含恰好一个标准 Zstandard frame。Frame MUST 声明 decompressed content size，MUST 启用 frame checksum，MUST NOT 使用 dictionary、skippable frame、concatenated frame 或 trailing bytes，且声明的 window MUST 不超过 64 MiB。检查器 MUST 流式解码并按自己的授权上限限制内存和输出，MUST NOT 因不可信 frame header 一次性预分配全部声明空间。

#### Scenario: 接受受限单 frame 输入

- **WHEN** 输入包含一个携带 content size 与 checksum、window 不超过 64 MiB 且无尾随字节的标准 Zstandard frame
- **THEN** 检查器流式产生 TAR bytes 并继续 canonical payload 校验
- **THEN** Zstandard frame checksum 只作为传输损坏检查，不替代 SHA-256 package checks

#### Scenario: 拒绝多 frame、dictionary 或过大 window

- **WHEN** 输入使用 dictionary、skippable/concatenated frame、超过 64 MiB 的 window 或 frame 后 trailing bytes
- **THEN** 两个检查器都以稳定 diagnostic 将 package 判定为 `invalid`
- **THEN** 检查器不尝试降级到更宽松的 Zstandard mode

#### Scenario: 声明的解压大小不可信

- **WHEN** frame 声明的 content size 超过上限、实际输出超过上限或 checksum 失败
- **THEN** 检查器立即停止解码并拒绝 package
- **THEN** 失败不会创建 Plugin Manager record、安装目录或 Runtime state

### Requirement: `checksums.json` 必须完整描述 package 普通文件

根 `checksums.json` MUST 是无 BOM 的 UTF-8 canonical JSON，使用 LF 并以一个换行结束；MUST 只包含固定顺序的 `package_format_version`、`algorithm` 和 `files` 字段，MUST 声明 `package_format_version: "0.1.0"` 与 `algorithm: "sha256"`，并 MUST 拒绝未知、缺失、重复或类型错误字段。

`files` MUST 按 path bytes 严格升序，MUST 为除 `checksums.json` 自身外的每个 TAR 普通文件提供且只提供一个 `{ path, size, sha256 }` record。`size` MUST 等于实际解压字节数，`sha256` MUST 是对应 bytes 的小写 64 位十六进制 SHA-256。额外、遗漏、重复或不匹配的 checksum record MUST 使整个 package invalid。

#### Scenario: Checksums 与全部文件一致

- **WHEN** `files` 精确覆盖 `manifest.json` 和全部 payload files，并且每个 size 与 SHA-256 都匹配实际 bytes
- **THEN** 检查器接受逐文件完整性关系并继续 Manifest/resource validation
- **THEN** `checksums.json` 不为自己递归生成 checksum record

#### Scenario: 文件或 checksum 被改变

- **WHEN** 任一文件内容、路径或大小与其 checksum record 不一致，或 `files` 存在额外、遗漏或重复 record
- **THEN** 检查器将 package 判定为 `invalid`
- **THEN** 检查器不发布部分成功的 file map 或 normalized Manifest

#### Scenario: 区分 checksums、frame checksum 和 package digest

- **WHEN** 工具或 Host 对有效 `.lxp` 计算 package identity
- **THEN** package digest 是整个 `.lxp` bytes 的 algorithm-labelled SHA-256，而逐文件 checksums 只描述 TAR 普通文件
- **THEN** Zstandard frame checksum、逐文件 SHA-256 和 package digest 不被互相替代或写入 author Manifest

### Requirement: Package 检查必须强制执行一致的资源上限

系统 MUST 在 TypeScript 与 Rust 中强制执行相同的首版硬上限：压缩 `.lxp` 不超过 64 MiB、Zstandard window 不超过 64 MiB、canonical TAR 解压数据流不超过 256 MiB、普通文件不超过 4096 个、单文件不超过 64 MiB、`manifest.json` 不超过 1 MiB、`checksums.json` 不超过 4 MiB、entry path 不超过 100 UTF-8 bytes 与 16 个 segments。达到或越过违反条件时，检查器 MUST 在继续分配、hash 或读取后续 payload 之前失败关闭。

#### Scenario: Package 位于所有上限内

- **WHEN** package 的压缩大小、window、解压数据流、文件数、单文件、metadata records 和 paths 均在首版上限内
- **THEN** 限额检查允许后续 package 与 Manifest 校验继续
- **THEN** 两种实现报告相同的 observable counts 和 sizes

#### Scenario: 任一上限被超过

- **WHEN** package 超过任一压缩、解压、window、文件数、单文件、metadata 或 path 上限
- **THEN** 检查器使用对应稳定 code 将 package 判定为 `invalid`
- **THEN** 检查器不依靠剩余磁盘空间、系统内存或平台默认值决定是否接受

#### Scenario: 空 package 或仅 metadata package

- **WHEN** payload 缺少 `manifest.json`、`checksums.json` 或 Manifest 声明所需的 Runtime entry/Page 资源
- **THEN** package 被判定为 `invalid`
- **THEN** 系统不生成空插件、placeholder plugin 或默认 Runtime 文件

### Requirement: Package 检查必须复用 Manifest Contract 并解析所有资源引用

Package 检查器 MUST 将 `manifest.json` bytes 作为 unknown author input 交给现有 Manifest validate/normalize API 或其 Rust 对等实现，MUST NOT 复制或放宽 Manifest Schema、语义、默认值、兼容算法或 diagnostics。只有 checksums 已验证的 Manifest 才能进入 Manifest validation。

Manifest 的 `runtime.entry` 以及 display、Page 和 Action 中每个 asset path MUST 按精确 package path 解析到 checksums 覆盖的普通 payload file；路径 MUST NOT 使用大小写替代、URL 解码、平台分隔符转换或 filesystem canonicalization 猜测。引用 metadata record、未知 path、目录或未被 checksums 覆盖的 bytes MUST 使 package invalid。

#### Scenario: Manifest 引用的资源都存在

- **WHEN** Manifest 通过现有 Contract，且 Runtime entry 与全部 assets 精确解析到 checksums 覆盖的普通文件
- **THEN** package inspection 返回 validated normalized Manifest 和 package file facts
- **THEN** 检查过程不加载 HTML、不创建 iframe，也不执行任何插件代码

#### Scenario: Runtime entry 或 asset 缺失

- **WHEN** Manifest 声明的 Runtime entry 或任一 asset path 在 canonical file map 中不存在、大小写不同或指向 metadata record
- **THEN** 两个检查器以相同 logical path diagnostic 将 package 判定为 `invalid`
- **THEN** Manifest 字符串本身通过静态 Contract 不能覆盖 package-level failure

#### Scenario: Manifest 有效但版本不兼容

- **WHEN** package 结构、checksums 与 resources 有效，但 normalized Manifest 的 lensX 或 Host API compatibility range 不包含当前版本
- **THEN** package inspection 返回 `incompatible` 而不是 `invalid`
- **THEN** 本 capability 不安装、启用、授权或执行该 package

### Requirement: Reference pack 与 package 检查必须可重复且跨语言一致

仓库 reference packer MUST 从相同 canonical file map、相同 package protocol/tool revision 和相同固定依赖/参数产生 byte-for-byte 相同的 `.lxp`。Reference packer MUST 使用固定的 Zstandard high-compression profile，初始 compression level MUST 是 19；参数、codec dependency 或 output bytes 的变化 MUST 作为显式 fixture digest drift 接受审查，MUST NOT 静默更新基线。

系统 MUST 提供 TypeScript 与 Rust 共同消费的 valid、invalid、incompatible 和 reproducible package fixtures。两种实现对每个 case 的 status、normalized Manifest、file/checksum facts、safe diagnostics 和 reference package digest MUST 一致。

#### Scenario: 相同输入被重复打包

- **WHEN** reference packer 在相同 tool revision 下两次读取字节相同但源 metadata 或枚举顺序不同的 canonical input file map
- **THEN** 两次输出的 `.lxp` bytes 和 package SHA-256 完全相同
- **THEN** 源 mtime、uid、gid、permissions 和目录枚举顺序不进入输出

#### Scenario: Rust 与 TypeScript 检查同一 fixture

- **WHEN** 两种实现检查共享 corpus 中的任一 committed `.lxp` case
- **THEN** 两者返回相同 status、facts 与排序后的 diagnostics
- **THEN** 任一实现、fixture 或 format constant drift 都使 dedicated package-format gate 失败

#### Scenario: 不同合规编码具有相同 payload

- **WHEN** 非 reference producer 创建满足单 frame profile且解压为同一 canonical TAR/checksum file map 的 `.lxp`
- **THEN** 检查器可以接受其内容为相同 package payload
- **THEN** 该文件仍具有自身整个 `.lxp` bytes 对应的 package digest，且不冒充 reference output digest

### Requirement: Package diagnostics 必须稳定、安全且确定

失败结果 MUST 只包含稳定的 `{ code, path, message }` diagnostics。`code` MUST 对应 package protocol 定义的有限集合，`path` MUST 使用 package logical path 或 reserved frame/archive location，`message` MUST 是稳定安全的英文文本。Diagnostics MUST 按 `path`、`code` 排序，MUST NOT 包含 Host 绝对路径、临时目录、原始异常、stack、环境文本、Manifest/file contents 或其他敏感值。检查器 MUST 在 invalid 时不返回部分 Manifest、file map 或可信 package facts。

#### Scenario: 多个独立问题同时存在

- **WHEN** 一个可安全继续检查的 package 同时包含多个 checksum、path 或 resource reference 问题
- **THEN** 检查器返回去重且确定排序的稳定 diagnostics
- **THEN** TypeScript 与 Rust 对可观察 diagnostics 集合达成一致

#### Scenario: 底层 codec 或 I/O 错误包含私有信息

- **WHEN** TAR、Zstandard、hash 或读取实现产生包含路径或底层错误文本的失败
- **THEN** boundary 将其映射为 package protocol 的稳定 code、logical path 和 canonical message
- **THEN** 私有文本不进入 fixture、serialized result 或应用日志断言

### Requirement: Package 格式不得声明 Host 来源、签名、权限或生命周期事实

`.lxp` Manifest、checksums 和 payload MUST NOT 声明 Host-owned source、installed path、package digest、enabled state、permission grants、signature status、verified/official provenance、lifecycle 或 Runtime session。开发来源与未签名本地来源 MUST 使用同一 canonical package payload，且来源 MUST 由 Host 在包外注入。首版 package validation MUST NOT 因 publisher 文本、文件名或预期官方来源跳过任何结构、checksum、Manifest、resource 或 limit check。

未来签名能力 MUST 覆盖整个 canonical `.lxp` package digest，或使用独立外层/sidecar 封装签名和 provenance；MUST NOT 将签名事实写入 author Manifest，也 MUST NOT 改变本 capability 的本地 validation 或权限结果。

#### Scenario: Publisher 声称官方来源

- **WHEN** Manifest publisher 文本声称 package 由 lensX 官方发布
- **THEN** package 仍经过与第三方输入相同的完整检查
- **THEN** package inspection 不生成 official、verified、signed、trusted 或 automatically-authorized 事实

#### Scenario: 开发来源与未签名来源内容相同

- **WHEN** Host 以后从开发流程和本地未签名流程接收字节相同的有效 `.lxp`
- **THEN** 两者共享相同 package payload facts 与 digest
- **THEN** 不同来源只存在于独立 Host facts，而不改变 Manifest 或 checksums

#### Scenario: 检查有效 package 不产生下游能力

- **WHEN** `.lxp` 通过 package-format inspection
- **THEN** 本 capability 不创建安装目录、Plugin Manager record、Tauri command、Action/Page、iframe、Runtime session、Host API、grant 或签名结论
- **THEN** 后续安装、执行、权限和签名任务必须显式消费并重新约束这些 package facts
