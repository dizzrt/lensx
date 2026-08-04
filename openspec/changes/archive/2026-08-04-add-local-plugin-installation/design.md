## Context

当前 Rust `plugin_package_format` 可以从一份 `.lxp` 字节得到 `invalid | compatible | incompatible`、normalized Manifest、逐文件事实和完整包 SHA-256，但它只检查而不保留 payload。Plugin Manager 已在 `app_config_dir` 中以逐插件原子 JSON record 持久化 normalized Manifest 与 Host facts；`register` 成功后产生 registration revision，现有 Host-private event 与前端 projection service 能据此无重启刷新 Action/Page。设置页已有 Plugins tab，但只有明确断言“当前不可管理插件”的空占位。

本 change 组合这些现有能力，第一次创建真实安装目录和写入命令。安装会接触用户选择的任意本地文件、解压受攻击者控制的 archive、修改 Host-owned 存储并触发生产 registration，因此路径、错误、并发和崩溃边界必须由 Rust 统一拥有。

## Goals / Non-Goals

**Goals:**

- 用户可从设置页选择一个本地 `.lxp`，取消选择不产生错误或状态变化。
- 只安装通过现有 package protocol、Manifest、资源、checksum、硬上限与当前 Host 兼容性检查的包。
- 将验证后的普通文件提交到 `app_local_data_dir()/plugins/packages/<plugin-key>/<package-sha256>`，并保持每个 `plugin_id` 只有一个有效 Plugin Manager registration。
- 安装提交、Plugin Manager 持久化、registration event 与失败清理形成可恢复的一致流程；不使用持久化 transaction journal。
- 为设置页提供最小、可访问、双语、主题兼容的安装入口和反馈，而不提前实现管理列表。
- 启动时安全清理已中断的 staging 和能够证明没有 owner 的 payload，同时保留 quarantine 或归属不明的证据。

**Non-Goals:**

- 远程下载、Catalog、Marketplace、开发目录和 CLI 安装。
- 相同 `plugin_id` 的升级、降级、重装、多版本选择或回滚；这些由 Task 3.4 定义。
- enable、disable、uninstall、插件程序/数据清理策略和应用级完整卸载器；这些不属于首次安装。
- 插件私有数据、权限授予、签名、官方 provenance、资源协议、iframe Runtime、Host API 或插件代码执行。
- 完整插件列表、详情、诊断历史或管理操作 UI。
- 修改 signed application bundle，或保证用户直接删除 `lensx.app` 时操作系统同时删除 Application Support 数据。

## Decisions

### 1. 使用一个 Rust-owned 安装命令完成选择和安装

设置页通过 Host-private typed adapter 调用 `install_local_plugin`，请求不携带路径。命令使用官方 `tauri-plugin-dialog` 的 Rust API 打开只允许选择单个 `.lxp` 的原生文件对话框；取消返回严格的 `cancelled` 结果。Rust 随后读取选择结果、检查并安装，前端永远不接收绝对路径、文件句柄或包字节。

选择官方 dialog Rust 插件是本 change 唯一新增的 Runtime 依赖：Tauri 2 已把原生文件选择移到该插件，现有栈没有等价能力。只在 Rust 自定义命令内部使用它，不增加前端文件系统插件，也不把 dialog 或文件系统权限开放给插件 package/iframe。

备选方案是让前端直接调用 dialog 并把路径传回 Rust，或者使用 HTML file input 上传最多 64 MiB 字节。前者扩大路径披露与 Tauri 权限面，后者复制大 payload 并把不受信任字节穿过 IPC，因此拒绝。

### 2. 一次受限读取，同一份不可变字节用于检查和提取

Rust 在分配前检查文件 metadata，并通过 capped read 再次执行 64 MiB 上限，防御选择后文件增长。成功读取的同一份 `Vec<u8>` 同时供 package inspection 和提取使用，避免“检查一个文件、重新打开后安装另一个文件”的 TOCTOU。

现有 inspector 仍保持只返回安全 facts 的公共 Host-private 边界。实现把 canonical Zstandard/TAR traversal 提取为共享内部核心：第一遍完整检查结构、checksum、Manifest、资源和兼容性，不写目录；只有 `compatible` 才创建 staging。第二遍从相同字节受控写入 staging，并重新使用相同 canonical header/path/size/hash 规则核对输出，不能调用接受链接、扩展 header 或路径归一化的通用 `unpack`。

备选方案是让 inspection result 返回所有 payload bytes，但最坏会额外持有约 256 MiB 数据并扩大成功结果边界；另一个方案是检查后重新读取源路径，存在竞态。因此均拒绝。

### 3. 安装根采用 staging、plugin key 和完整包 digest

安装器从 Tauri `app_local_data_dir` 推导唯一根目录：

```text
plugins/
├── .install.lock
├── .staging/
│   └── <random-id>/
└── packages/
    └── <plugin-key>/
        └── <package-sha256>/
            ├── manifest.json
            ├── checksums.json
            └── ...
```

`plugin-key` 复用 Plugin Manager record 的 `v1-<plugin_id UTF-8 lowercase hex>` 规则，避免把 author identity 直接当作平台路径并保持 recovery 可关联。`package-sha256` 是 Task 3.1 对完整 `.lxp` 字节计算的 64 位小写十六进制 SHA-256。正式 digest 目录不可原地覆盖；目录名只绑定 package identity，不替代逐文件 checksum，也不宣称持续篡改检测。

不创建 `versions/`：Manifest/registration 已保存语义版本，产品只允许一个当前 registration。不创建 `transactions/`：Plugin Manager 原子 record 与确定性 orphan recovery 足以区分提交前后。未来升级可以短暂写入 sibling digest 目录，再以 Plugin Manager record 的 `installation_path` 作为唯一 active pointer；这不等于支持用户同时安装多个版本。

不使用 application resource/bundle 目录，因为它是发布签名覆盖的只读结构。插件程序目录与未来插件数据目录保持不同 namespace；本 change 不创建插件数据。

### 4. 提交顺序保证 record 永不指向尚未提交的 payload

一个进程内 mutex 与 `.install.lock` 的跨进程独占文件锁覆盖启动恢复和安装提交；拿不到锁的调用稳定返回 `busy`，另一个进程不得清理正在使用的 staging。

成功路径固定为：

1. 读取并完整检查不可变 `.lxp` 字节；无效或不兼容时不创建 staging。
2. 在 `.staging/<random-id>` 受控写入并核对全部普通文件。
3. 再次确认健康或 quarantine identity 中不存在同一 `plugin_id`。
4. `sync_all` 已写文件和必要目录，然后将 staging payload 原子 rename 为 `packages/<plugin-key>/<package-sha256>`。
5. 用 normalized Manifest、绝对正式路径、`sha256` digest、`source=external`、`enabled=true` 和空 grants 调用 Plugin Manager `register`；Runtime 仍由 Manager 设为 `inactive`。
6. persistence 与内存发布成功后发送既有 `plugin-registration://snapshot-changed` invalidation event，并向 UI 返回不含路径/digest 的 `installed` 结果。

步骤 5 失败时立即尝试删除刚提交的 payload；即使删除也失败，Plugin Manager 中仍没有 record，目录在下次安全 recovery 中作为 orphan 处理。event 发送失败不回滚已经持久化的安装：event 本来只是失效提示，现有 adapter 会在 listener recovery 或 Launcher activation 时完整刷新。

最终重复检查仍由 Plugin Manager 在自己的锁和原子写边界内裁决，不能只依赖安装器的早期 UX 检查。

### 5. 首次安装拒绝不兼容、重复和 quarantine replacement

只有 `compatible` package 可以首次安装。`incompatible` 返回独立稳定错误与兼容性结论，但不创建目录或 record。若相同 `plugin_id` 已有健康 registration，安装返回 `already_installed`；不比较版本来猜测升级、降级或重装。

同一 record key 已在 quarantine 时同样拒绝。虽然 Plugin Manager 内部允许 trusted caller 用完整健康 record 清除 quarantine，本 change 不把首次安装静默扩张成修复/覆盖流程，也不删除 quarantine 证据。未来生命周期管理可显式设计恢复操作。

### 6. 无 journal 的启动恢复只删除能够证明由 installer 拥有且不再被引用的内容

在 Plugin Manager 完成 record recovery 后，installer 持有 `.install.lock` 执行 best-effort recovery：

- 删除 `.staging` 下符合 installer 命名和类型约束的子目录；未知 entry、链接或无法读取内容不跟随、不递归越界。
- 从健康 registration 收集通过 canonical containment 检查且匹配 `<root>/packages/<plugin-key>/<digest>` 的正式路径，视为 active payload。
- 从 quarantine stub 收集 record key，保留对应整个 `<plugin-key>` subtree，因为 damaged record 可能已丢失可信 digest/path。
- 只删除结构合法、位于 packages 根内、既不被健康 path 引用也不被 quarantine key 占有的 digest 目录；绝不删除根外路径、健康 record 指向但形状异常的路径或归属不明内容。

恢复清理失败不得使整个应用 panic，也不得覆盖 Plugin Manager 证据。installer 进入 degraded/unavailable 状态并保存有界安全诊断；新的安装在无法保证提交与清理边界时失败关闭。无需公开 Host 绝对路径。

### 7. 安装命令使用独立、严格且最小披露的应用私有契约

安装命令契约使用独立版本 `0.1.0`，与 Manifest、package protocol、Registration Contract、Plugin Manager Store 和应用版本分开演进。命令响应是严格 discriminated union：`cancelled` 或 `installed`；两种响应和错误都携带 installation contract version，成功仅返回 `plugin_id`、`version` 与注册 revision。失败使用有限 error code、operation、稳定安全英文 message，并在包无效时可携带既有 logical package diagnostics；禁止返回源路径、staging/正式绝对路径、package digest、原始 I/O/codec 错误、stack 或文件内容。

TypeScript adapter 从 `unknown` 校验并 deep-freeze 响应/错误。该契约只属于 root application，不进入 `@lensx/plugin-contract`、SDK、Testkit 或 plugin UI package，也不改变现有 Registration Contract wire shape。

### 8. 设置页只交付最小安装入口

Plugins tab 使用现有 Semi Design 组件提供统一的 “Plugins” 标题、说明、一个 “Install from file” 主按钮和状态反馈；中文对应“插件”与“从本地安装”。“本地”只描述安装来源，不形成插件类别。pending 时按钮禁用以防同一 UI 重入；取消恢复 idle 且不显示错误；成功、失败通过 `role=status`/`aria-live` 或适当 alert 语义反馈，且键盘可完成打开对话框和返回后的焦点恢复。

所有文案进入 `en-US` canonical locale、`zh-CN` mirror 与 messages Schema。布局复用 UnoCSS；只有出现复杂可复用状态样式时才修改 Less。使用现有 Semi theme token，覆盖 light/dark，不引入新组件库。页面不展示插件列表、详情、enable/disable/uninstall 或 package path；这些仍属于 Task 6.1/3.3。

## Risks / Trade-offs

- [检查和提取需要两次解压，增加 CPU] → 两次都消费同一份最多 64 MiB 的内存字节并执行相同硬上限；以消除 TOCTOU 和避免缓存 256 MiB payload 为优先。
- [文件系统 rename 与 Plugin Manager JSON 不是同一原子事务] → 固定“payload 先提交、record 后发布”，record 失败立即回滚，崩溃残留由确定性 orphan recovery 清理；永不先发布指向缺失目录的 record。
- [清理器误删 damaged plugin payload] → quarantine key 保留整个 plugin subtree；只删除 canonical root 内能够证明无 owner 的 digest 目录，未知或异常内容保守保留。
- [event 发送失败导致 UI/投影暂时陈旧] → installation 仍以已持久化 record 为成功；复用 Registration Contract 的完整刷新和 activation recovery，不把通知失败升级为数据回滚。
- [digest 目录给人“内容持续可信”的错觉] → 文档明确 digest 只表示安装时 `.lxp` identity；未来资源服务仍需 canonical containment，若需要运行前完整性复验由后续安全设计决定。
- [直接删除应用后插件目录仍可能存在] → 安装根集中在 app-local data 并在文档说明；专用应用卸载器是独立 change，绝不修改 signed app bundle 或声称 Finder 删除会触发清理。

## Migration Plan

1. 新增 installer contract/core 和隔离目录测试，保持现有 inspector/Manager wire 输出不变。
2. 初始化 installer root 与 recovery，再注册安装命令和 Rust-only native dialog dependency。
3. 增加 TypeScript adapter、设置页入口、双语消息和前端测试。
4. 更新英文架构文档及中文镜像，运行专用 gate 与完整验证。

当前产品没有真实 installer，因此无需迁移既有合法 payload。历史或测试构造的 Plugin Manager record 可能指向安装根外；recovery 不删除这些路径，也不把它们迁移成 installer-owned 目录。若回滚应用代码，已经成功安装的 payload 与 Plugin Manager record 保留，避免以代码回滚隐式删除用户数据；后续可由恢复版本继续消费或由显式生命周期能力清理。

## Open Questions

无。应用级完整卸载体验、quarantine repair 与 Task 3.4 的升级/回滚细节均作为独立后续 change 处理。
