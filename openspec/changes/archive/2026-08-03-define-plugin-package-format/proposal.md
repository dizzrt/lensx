## Why

当前插件 Manifest 只能声明包内相对资源路径，Host 尚无统一交付格式来证明这些文件真实存在、内容完整且可被安全、可重复地检查。Task 3.2 的本地安装器和 Task 6.4 的开发者 CLI 都依赖一个先行、与实现语言无关的包格式契约，因此现在需要先建立 `.lxp` 的规范和一致性门禁。

## What Changes

- 新增独立版本化的 lensX Plugin Package Format，外部扩展名固定为 `.lxp`，内部固定为 canonical TAR 数据流经 Zstandard 压缩后的单一交付物。
- 定义固定位置的 Manifest 与 checksums、规范化归档顺序和元数据、允许的文件类型和路径、Zstandard frame profile，以及包大小、解压大小、文件数量和路径深度等基础限制。
- 定义包级验证：复用现有 Manifest Contract，确认所有声明的 Runtime entry 与 asset 路径解析到包内普通文件，并用稳定的 SHA-256 checksums 与 package digest 区分逐文件完整性和整个交付物身份。
- 建立 TypeScript 与 Rust 共享的有效、无效和可重复构建 fixtures、稳定诊断与一致性门禁，为未来 CLI 和 Host installer 提供同一判断依据。
- 明确开发来源与未签名本地来源可共享相同 canonical payload；未来签名与 provenance 只能覆盖或封装该 payload，不得改变 Manifest author facts 或自动授予权限。
- 更新 canonical English 架构/开发文档及其简体中文镜像，并将 Roadmap Task 3.1 从 ZIP/`.lensx-plugin` 计划调整为已确认的 `.lxp` + canonical `tar.zst` 方向。
- 本 change 不实现本地安装、启用/禁用/卸载/升级、开发目录加载、Plugin CLI 命令、资源服务、iframe Runtime、Host API、权限授权、签名算法、远程下载、Catalog 或 Marketplace。

## Capabilities

### New Capabilities

- `plugin-package-format`: 定义 `.lxp` canonical `tar.zst` 交付格式、独立版本、内容完整性、资源解析、确定性、基础安全限制、稳定诊断以及 TypeScript/Rust 一致性要求。

### Modified Capabilities

无。

## Impact

- 新增 package-format 规范、共享 fixtures、TypeScript 参考校验/打包核心、Rust Host 私有检查核心及对应根级验证门禁。
- Rust/Tauri 构建将引入审查后的 TAR、Zstandard 与 SHA-256 依赖；TypeScript 工具侧将使用固定、可重复的 Node 24 兼容实现，而不依赖实验性运行时行为。
- 现有 Manifest Schema、Plugin Manager Store、Registration Contract、Launcher Action/Page 投影和前端产品行为保持不变；本 change 不会把示例包注册为真实插件，也不会执行插件代码。
- `docs/en/` 与 `docs/zh/`、验证文档和 `plugin-roadmap.md` 将同步反映新的包格式边界与后续任务依赖。
