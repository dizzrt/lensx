## Context

当前 `@lensx/plugin-contract` 已定义严格的 `manifest_version: "0.1.0"`、包内相对路径以及 iframe HTML entry，但它只验证 author JSON，不能证明所引用文件存在，也不解析归档。Rust Plugin Manager 已能保存 Host 提供的安装路径和 algorithm-labelled package digest，但尚无真实包摄入、安装或执行路径。Task 3.1 必须在不提前交付 Task 3.2 安装器、Task 4 Runtime、Task 6.4 CLI 或 Task 8.1 签名系统的前提下，建立双方后续可共同消费的格式事实源。

`.lxp` 面向官方和第三方插件使用同一格式。包是一次性交付和安装输入；后续 Runtime 从安装后目录读取 Host 授权的资源，因此格式不需要为运行时提供归档内随机访问。输入是不可信数据，所有解析都必须流式、受限、失败关闭并输出稳定安全诊断。

## Goals / Non-Goals

**Goals:**

- 定义独立 `0.1.0` 版本的 `.lxp` package protocol。
- 采用规范化 TAR payload 和单一受限 Zstandard frame，在高压缩率、快速解压、跨语言实现和可重复构建之间取得平衡。
- 固定 Manifest/checksums 位置、顺序、元数据、路径 profile、文件类型和资源上限。
- 复用现有 Manifest Contract，并证明所有 Manifest 引用的 Runtime entry 和 assets 对应包内普通文件。
- 区分逐文件 SHA-256 checksums、Zstandard frame checksum 与整个 `.lxp` package digest。
- 以同一 fixture corpus 和稳定诊断约束 TypeScript 参考实现与 Rust Host 私有检查核心。
- 保持 payload 对开发来源、未签名本地来源和未来签名来源一致。

**Non-Goals:**

- 不创建安装、升级、卸载、启用/禁用或 Plugin Manager 写入流程。
- 不创建 Tauri command、前端管理 UI、Plugin CLI 命令、正式项目模板或开发目录 watcher。
- 不提供插件资源 URL、iframe、Runtime session、RPC、Host API 或权限决策。
- 不定义密钥、签名 record、provenance、远程下载、Catalog、更新或 Marketplace。
- 不修改 Manifest author schema，不把包格式、来源、digest 或签名事实写入 Manifest。

## Decisions

### 1. `.lxp` 是内容识别的 canonical `tar.zst` profile

外部文件名使用短扩展名 `.lxp`。其内容必须是恰好一个 Zstandard frame，解压后必须是一个受限 canonical TAR 数据流。Host 和工具必须先检查内容结构与 package protocol version，不能仅凭扩展名接受输入。

选择 TAR 后整体 Zstandard 压缩，是因为插件构建输出以 JS、CSS、HTML 和相关 assets 为主，整体流可以利用跨文件重复；安装流程本来就需要完整检查和解包，不需要 ZIP 的逐文件随机访问。Zstandard 解压速度和流式 API 更适合在 Host 中实施硬性资源上限。

备选方案：

- ZIP/Deflate：生态最广，但逐文件 Deflate 压缩率较低，且 central/local header 双重元数据增加 canonical 化规则。
- ZIP/Zstandard：保留随机访问，但 method 93 的工具支持不一致，仍不能充分利用跨文件重复。
- 7z/LZMA2 solid 或 `tar.xz`：通常压缩率更高，但编码/解码更慢、内存成本更高；7z 的算法和 header 能力面也扩大不可信输入解析范围。
- 自定义二进制 envelope：可完全控制布局，但会重复成熟容器工作并增加 Rust/TypeScript 双实现成本。

### 2. Package protocol 独立版本化，required records 固定

Package protocol 从 `0.1.0` 开始，与 npm package、Manifest、Host API、Registration Contract、Plugin Manager Store 和 lensX app 版本独立演进。版本记录位于根 `checksums.json`，不进入 author Manifest。

Canonical TAR 只允许普通文件，不包含显式目录、符号链接、硬链接、设备、FIFO、稀疏文件、PAX/GNU 扩展、xattr/ACL 或其他特殊 entry。顺序固定为：

1. `manifest.json`
2. `checksums.json`
3. 其他文件按 UTF-8 path bytes 升序排列

所有 header 使用 ustar 可表达的固定字段：`uid=0`、`gid=0`、空 owner/group name、`mtime=0`、regular-file mode `0644`，不保留源文件系统权限、时间或 ownership。路径只能使用 `/`，必须是 NFC UTF-8、相对且可移植；禁止空 segment、`.`、`..`、反斜线、控制字符、尾随点/空格、Windows reserved basename，以及 ASCII case-insensitive collision。

为了避免 ustar long-name 扩展和跨实现歧义，首版完整 entry path 限制为 100 UTF-8 bytes、最多 16 个 segment；每个 segment 只能使用 ASCII 字母、数字、点、下划线和连字符，并必须以字母或数字开头和结尾。Manifest Contract 仍可独立接受更宽的 package-local path 字符串，但只有满足 `.lxp` profile 且能解析到 entry 的 Manifest 才能组成有效包。

### 3. checksums record 是严格、可排序的 JSON

`checksums.json` 使用 UTF-8、无 BOM、LF、结尾一个换行的 canonical JSON 表示；对象字段顺序和数组顺序由格式固定，不允许未知字段。其内容包含：

- `package_format_version: "0.1.0"`
- `algorithm: "sha256"`
- `files`: 除 `checksums.json` 本身外所有普通文件的 `{ path, size, sha256 }` 列表，按 path bytes 升序

每个包内普通文件必须且只能出现一次，每个列表项必须与 TAR entry 的路径、解压字节数和小写 64 位十六进制 SHA-256 完全一致。`checksums.json` 不对自己递归求值；它的完整性由整个 `.lxp` package digest 以及 Task 8.1 的未来签名覆盖。

Zstandard frame checksum 只用于传输损坏快速检测，不能替代 SHA-256。Package digest 定义为整个 `.lxp` 文件字节的 `sha256`，由可信 Host/工具在归档外计算并以现有 algorithm-labelled 结构传递，包作者不能在 Manifest 中声明它。

### 4. Zstandard 接受 profile 与 reference pack profile 分离

有效包必须是单一标准 Zstandard frame，必须携带 content size 和 frame checksum，不得使用 dictionary、skippable frame、concatenated frame 或 trailing bytes，声明的 window 不得超过 64 MiB。检查器按流读取并在达到任何上限时立即失败，不根据未验证 header 预分配完整输出。

格式不把 encoder 的压缩级别当作安全事实；检查器接受满足上述 frame profile 的等价编码。仓库 reference packer 使用固定依赖版本、固定参数和固定高压缩 preset（初始为 level 19），因此同一 canonical file map 在同一 package protocol/tool revision 下产生 byte-for-byte 相同的 `.lxp`。依赖或压缩参数变化必须通过 fixture digest drift 明确审查，不能静默改变 reference output。

TypeScript 侧不依赖 Node 24 的实验性 Zstandard API。Apply 阶段必须选择并锁定一个 Node 24、macOS/Windows/Linux 可用、支持固定参数和 streaming/size limits 的实现；Rust 侧使用审查后的 TAR、Zstandard 和 SHA-256 crates。具体库不是 wire contract，跨语言事实源是本 spec、fixture bytes 和预期诊断。

### 5. 首版资源上限固定且两侧一致

首版使用以下硬上限：

- `.lxp` 压缩文件：64 MiB
- Zstandard window：64 MiB
- canonical TAR 解压总内容（包含 header/padding）：256 MiB
- 普通文件数量（包含 required records）：4096
- 单个普通文件：64 MiB
- `manifest.json`：1 MiB
- `checksums.json`：4 MiB
- entry path：100 UTF-8 bytes、16 segments

这些上限是 package-format validity 的组成部分。Task 7.4 可以增加恶意 corpus、平台覆盖和更细的防御，但不得让 Task 3.1 的基础检查变为可选。调整上限需要显式 package protocol 决策和 fixtures。

### 6. 包级 Manifest 校验建立在现有 Contract 之上

检查顺序为：内容类型和压缩上限 → TAR profile/entry 表 → required records → checksums → 现有 Manifest validate/normalize → Manifest resource resolution。包格式不得复制 Manifest Schema、语义、兼容算法或诊断。

`runtime.entry` 以及 display/Page/Action 的每个 asset path 必须按精确 package path 解析到 checksums 覆盖的普通文件；未知、缺失、大小写替代或指向 metadata record 的路径都失败。结构有效但与当前 lensX/Host API 不兼容的 Manifest 形成 `incompatible` package 结果，而不是 package-format invalid；安装策略由 Task 3.2 决定。

TypeScript 与 Rust 返回相同的三态 `invalid | compatible | incompatible` 以及确定性诊断。诊断只包含稳定 `code`、逻辑 `path` 和安全英文 `message`，按 `path`、`code` 排序；不包含绝对路径、原始异常、堆栈或文件内容。

### 7. 共享 fixtures 是 Host 与未来 CLI 的一致性契约

仓库新增 package-owned valid、invalid、incompatible 和 reproducible fixtures。每个 case 记录输入或 committed `.lxp`、预期状态、normalized Manifest/inspection facts、diagnostics、file/checksum facts 和 reference digest。TypeScript reference inspector/packer 与 Rust Host-private inspector 都运行相同 cases。

TypeScript 核心在 Task 3.1 中保持 workspace-private，服务 fixtures、参考打包和未来 CLI 接入；它不成为插件 Runtime dependency，也不新增插件可 import 的 Host 能力。Task 6.4 可以将其包装或迁移进 `@lensx/plugin-cli`，但必须继续消费同一 Contract、format version、fixtures 和 diagnostics。Rust inspector 不暴露 Tauri command，也不写 Plugin Manager。

### 8. 来源和签名不改变 canonical payload

开发来源与未签名本地来源使用相同 `.lxp` payload，来源由 Host 注入而不是包内自报。Task 6.5 的开发目录模式可以在未来生成或模拟相同 canonical file map，但本 change 不接受目录作为 `.lxp`。

Task 8.1 必须签署整个 canonical `.lxp` package digest，或在独立外层/sidecar 中封装签名与 provenance；不得把签名字段加入 author Manifest，也不得因 official/verified 来源跳过本地 package validation 或权限决策。首版 `checksums.json` 不预留可由作者伪造的 signature/provenance 字段。

## Risks / Trade-offs

- [TAR 是顺序容器，读取 Manifest 仍需启动 Zstandard 解码] → 强制 Manifest 与 checksums 为前两个 entries，并全程流式限额；安装本来就需要完整校验。
- [高压缩级别增加打包 CPU 和内存] → reference packer 使用固定 level 19，Host 解压侧只接受受限 window；后续只能基于真实 plugin corpus 和显式 digest drift 调整。
- [第三方 TAR/Zstandard 实现可能出现解析差异或安全缺陷] → 使用受限子集、锁定依赖、共享恶意 fixtures、拒绝扩展 entry，并在 Task 7.4 扩充跨平台 corpus。
- [100-byte ASCII path profile 比 Manifest 字符串契约更严格] → 包检查提供明确诊断；首版优先可移植与无歧义，未来只有通过 package protocol 版本化才能放宽。
- [checksums 可与未签名 payload 一起被篡改] → checksums 只承诺损坏和内部一致性检测，不宣称来源真实性；Task 8.1 使用 package digest 和外部信任事实提供真实性。
- [TypeScript codec 依赖尚需实现期选型] → 任务要求先完成许可证、平台、streaming、确定性和维护状态审查，并以 committed fixture digest 和三平台 CI 作为接受条件。

## Migration Plan

当前没有已支持的真实插件包、安装目录或 CLI 产物，因此不迁移用户数据。实现顺序为：先落地协议常量/fixtures与 reference packer，再落地 TypeScript/Rust inspectors 和 drift gate，最后更新双语文档与 Roadmap。Task 3.2 以后只接受 `.lxp` v0.1.0；历史实验 ZIP 不获得兼容别名或自动迁移。

回滚时可移除新增 formatter/inspector、fixtures、依赖和门禁并恢复文档/Roadmap；现有 Plugin Manager Store、Registration、Action/Page 投影和用户设置不需要回滚。

## Open Questions

没有阻塞 proposal/apply 的产品或协议问题。TypeScript Zstandard 具体依赖在实现开始时按本设计列出的接受条件选择并锁定；该选择不得改变 wire profile 或预期 fixture bytes。
