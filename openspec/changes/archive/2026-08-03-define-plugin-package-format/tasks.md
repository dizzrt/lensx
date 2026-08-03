## 1. Package Protocol Foundation

- [x] 1.1 建立 workspace-private TypeScript package-format 模块，定义 `0.1.0`、`.lxp`、required record names、Zstandard/TAR profile、资源上限、三态结果、inspection facts 与稳定 diagnostics；禁止新增插件可 import 的 Host 或 Runtime API。
- [x] 1.2 审查并锁定 Node 24 跨平台 Zstandard/TAR/SHA-256 实现，记录许可证、维护状态、macOS/Windows/Linux 支持、streaming/limit 能力和确定性依据；不得依赖 Node 实验性 Zstandard API。
- [x] 1.3 为 Rust Host 私有 package inspector 增加最小审查后的 TAR、Zstandard 与 SHA-256 crates，并保持 `plugin_manifest` 为 Manifest normalization/compatibility 的唯一事实源。

## 2. Canonical TypeScript Reference Packer

- [x] 2.1 实现 portable package path 与 input file-map 校验：普通文件限定、100-byte/16-segment profile、reserved names、ASCII case-insensitive collision、确定排序和 Host-private field rejection，并添加 focused unit tests。
- [x] 2.2 实现 canonical `checksums.json` 生成与解析，严格覆盖除自身外的全部文件，固定 JSON bytes、file ordering、size 和小写 SHA-256，并覆盖遗漏、额外、重复、篡改和非 canonical JSON tests。
- [x] 2.3 实现 canonical ustar writer：`manifest.json`/`checksums.json` 固定前两项、其余 path-byte 排序、固定 header metadata、只含普通文件且不保留源 filesystem metadata，并验证同内容不同输入顺序/metadata 得到相同 TAR bytes。
- [x] 2.4 实现固定依赖与参数的单-frame Zstandard level-19 reference packer，启用 content size/frame checksum，禁止 dictionary 与尾随内容，输出 `.lxp` bytes 和整个文件的 algorithm-labelled SHA-256 digest。

## 3. TypeScript Package Inspection

- [x] 3.1 实现受限 Zstandard streaming inspection，验证单 frame、content size、checksum、dictionary/skippable/concatenated/trailing-byte rejection、64 MiB window 与压缩/解压硬上限，并为异常 header、corruption 和 bomb-like inputs 添加 tests。
- [x] 3.2 实现 canonical TAR streaming inspection，验证 entry 类型、required record 顺序、headers、paths、duplicates/collisions、文件数/单文件/metadata 上限及完整 stream 终止，不向结果泄露原始异常或绝对路径。
- [x] 3.3 在 checksums 成功后复用 `@lensx/plugin-contract` validate/normalize，解析 Runtime entry 与全部 display/Page/Action asset paths，正确区分 `invalid`、`compatible` 和 `incompatible`，且不加载资源或执行插件代码。
- [x] 3.4 固化 deterministic safe diagnostics 的有限 code/message/path 映射、去重与排序，并测试 invalid 结果不返回 partial Manifest、file map、package digest trust 或 Host state。

## 4. Shared Fixture And Drift Gate

- [x] 4.1 建立 package-owned `valid`、`invalid`、`incompatible` 与 `reproducible` fixture corpus，覆盖 format version、content recognition、canonical TAR、Zstandard profile、checksums、limits、Manifest resources、publisher/source boundary 和空 package。
- [x] 4.2 为每个 fixture 提交明确的 expected status、normalized Manifest/inspection facts、diagnostics、file/checksum facts 和 reference `.lxp` digest；增加 regeneration/check 模式，默认检查 drift 而不静默重写 baselines。
- [x] 4.3 新增 TypeScript package-format focused tests 与 reference pack repeatability test，证明相同 canonical file map 在固定 tool revision 下生成 byte-for-byte 相同 `.lxp`。

## 5. Rust Host-Private Package Inspector

- [x] 5.1 在 `src-tauri` 增加 Host-private package format models、limits、diagnostics 和 package digest 计算，保持无 Tauri command、无 Plugin Manager mutation、无安装目录写入、无 Runtime 或权限行为。
- [x] 5.2 实现 Rust 受限 Zstandard/TAR streaming inspector、canonical checksums 校验和 Manifest resource resolution，复用现有 Rust Manifest validation/normalization/compatibility 并失败关闭所有不可信输入。
- [x] 5.3 让 Rust tests 消费与 TypeScript 相同的全部 fixture expectations，逐 case 对齐 status、facts、diagnostics 和 digest，并覆盖低层 I/O/codec 错误的安全映射。
- [x] 5.4 增加 boundary tests，证明 package author 无法声明 source、installed path、package digest、signature、grant、lifecycle 或 Runtime facts，且 inspection 不注册、安装、投影或执行插件。

## 6. Repository Validation Integration

- [x] 6.1 新增 `check:plugin-package-format` 根命令，组合 dependency/constant drift、fixture check、TypeScript tests、reference reproducibility 和 Rust shared-fixture tests，并让任何单侧 drift 失败。
- [x] 6.2 更新 workspace lifecycle/boundary fixtures（如受影响），确保 package-format 工具保持 Host/workspace-private，官方和示例插件不能 import 它，现有 Contract → SDK → Testkit/UI 依赖方向不变。
- [x] 6.3 验证 package-format 依赖、fixtures 和生成物进入正确的版本控制/构建边界，不把临时输出、Host 私有源码或 package author 不需要的依赖加入公共 plugin package tarballs。

## 7. Documentation And Roadmap

- [x] 7.1 新增或更新 canonical English package-format 架构/开发文档，说明 `.lxp`、canonical `tar.zst`、版本、layout、checksums/digest、limits、diagnostics、验证命令和明确未实现的安装/Runtime/签名边界；同步同路径简体中文镜像及两个语言索引。
- [x] 7.2 更新 Extension Platform、Plugin Workspace 与 Validation 的英文文档及简体中文镜像，准确区分已实现 package inspection 与仍未实现的 installer、CLI、development mode、resource service、Runtime 和 signing。
- [x] 7.3 将 `plugin-roadmap.md` Task 3.1 的 ZIP/`.lensx-plugin` 计划改为 `.lxp` + canonical `tar.zst` 及新的完成标准，并同步 Task 3.2、6.4、7.4、8.1 中的旧格式措辞；完成最终验证前保持 Task 3.1 checkbox 未勾选。

## 8. Final Validation

- [x] 8.1 运行 `pnpm run check:plugin-package-format`、`pnpm run check:plugin-contract`、workspace boundary/lifecycle focused gates和双语文档路径/链接/语义检查，修复所有失败后重跑对应命令。
- [x] 8.2 依次运行完整前端/共享验证 `pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`；虽然没有产品 UI 变更，TypeScript 工具、root scripts、workspace aggregation 和文档边界仍要求完整验证。
- [x] 8.3 依次运行 Rust 验证 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，修复所有 warning/error 后重跑失败命令。
- [x] 8.4 运行 `openspec validate define-plugin-package-format --type change`，核对实现、proposal、design、delta spec、tasks 与双语文档一致；随后重跑 8.1–8.3 的完整最终集合，只有全部通过后才勾选 Roadmap Task 3.1 并更新本文件所有已验证 checkbox。
