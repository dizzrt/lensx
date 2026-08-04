## 1. 安装契约与依赖边界

- [x] 1.1 定义 installation contract `0.1.0` 的 Rust success/cancel/error variants、有限 code/operation、安全 message、package logical diagnostics 和最小披露规则，并为从 `unknown` 解析的 TypeScript 类型建立对应 Host-private 模块。
- [x] 1.2 建立 `fixtures/plugin-local-installation/` 的 valid/invalid response、error、unknown-version、unknown-field、malformed variant 与敏感字段拒绝样例，让 Rust serializer 和 TypeScript parser 共享可验证事实。
- [x] 1.3 增加 `check:local-plugin-installation` 根脚本，组合 contract fixture、frontend adapter/UI、workspace boundary 与 Rust installer 测试，并确保公共 Contract/SDK/UI/Testkit tarball 或 workspace 插件无法导入 installation contract。
- [x] 1.4 将 Plugin Manager 的确定性 `v1-<plugin_id UTF-8 lowercase hex>` key 规则提取为 crate-private 共享 helper，同时保持现有 record filename、quarantine identity 和测试基线不变。

## 2. 受限包读取与安全提取

- [x] 2.1 重构 Rust package-format 内部 canonical Zstandard/TAR traversal，使 inspection 与 extraction 共享 frame、header、path、entry type、size、checksum 和硬上限规则，同时保持现有 `PackageInspectionResult`、fixtures 与专用 gate 不变。
- [x] 2.2 实现 source metadata 预检和 capped read，从一次读取的不可变 `.lxp` 字节完成 inspection；拒绝读取中增长、截断、I/O 失败及超过 64 MiB 的输入，不重新打开源路径。
- [x] 2.3 实现 compatible-only staging extractor：在新建且 Host-owned 的 staging 中用 `create_new` 和 validated path segments 写普通文件，重新核对 entry facts/checksums，flush 文件/目录且永不调用宽松 archive unpack。
- [x] 2.4 用现有 valid/invalid/incompatible corpus 和新增 fault cases 覆盖同字节双遍检查、路径穿越、链接/特殊 entry、重复/大小写冲突、compression/size limit、写入/flush 失败及“失败前无正式目录/record”断言。

## 3. Installer Store、提交与恢复

- [x] 3.1 新增从 `app_local_data_dir()/plugins` 初始化的 Host-private installer state，建立 `.install.lock`、`.staging/<random-id>` 与 `packages/<plugin-key>/<package-sha256>` 路径构造和 canonical containment 校验；不得创建 `versions`、`transactions` 或插件数据目录。
- [x] 3.2 使用进程内 mutex 与跨进程独占文件锁串行化 recovery/installation，定义 busy、unavailable 和 degraded 行为，确保另一个进程不能清理活跃 staging。
- [x] 3.3 实现 staging flush 后同文件系统原子 rename、正式 digest 目录不可覆盖、Plugin Manager record 后提交，以及 record 失败时的即时 payload 回滚与 orphan fallback。
- [x] 3.4 在 Plugin Manager recovery 后实现保守 installer recovery：清理合法残留 staging；保留健康 installation path、quarantine key subtree、根外/异常/未知 entry；只删除能够证明无 owner 的 canonical digest payload。
- [x] 3.5 增加隔离临时目录与 fault-injection Rust 测试，覆盖锁竞争、崩溃边界、orphan、quarantine 保留、健康 payload 保留、根外路径/链接不跟随、清理失败不 panic 及 installer fail-closed。

## 4. 首次安装编排与 Tauri 命令

- [x] 4.1 实现 local installer coordinator，只接受 `compatible` package，并在 commit 前后拒绝已有健康 registration 或 quarantine key；相同 plugin ID 的不同 version/digest 不得被解释为升级、降级、重装或 repair。
- [x] 4.2 组合 normalized Manifest 与 Host facts，固定注入正式绝对路径、完整 `sha256` digest、`source=external`、`enabled=true`、空 grants 和 `inactive` Runtime，并验证 publisher/requested permissions 不产生 trust 或授权。
- [x] 4.3 在 Plugin Manager persistence/内存 publication 成功后发送既有 registration changed event；event 失败保持安装成功，register 失败不产生 revision/event 并回滚 payload。
- [x] 4.4 增加并初始化官方 `tauri-plugin-dialog` Rust 依赖，实现无路径请求的 `install_local_plugin` async Tauri command、单 `.lxp` native picker 与 cancel 结果；不增加前端 fs/dialog package，不授予插件或 iframe 新权限。
- [x] 4.5 增加 Rust service/command/event 集成测试，覆盖成功、取消、invalid、incompatible、oversize、duplicate、quarantine、busy、Manager degraded/persist failure、event failure、严格 payload 和敏感信息不泄露。

## 5. Frontend Adapter 与最小设置入口

- [x] 5.1 实现 Host-private desktop installation adapter，从 `unknown` 严格校验并 deep-freeze `0.1.0` success/cancel/error payload，把 malformed native values 映射为稳定 boundary error，且不暴露到公共 plugin packages。
- [x] 5.2 通过现有 App/AppBootstrap 依赖注入把 installation client 传给 SettingsPage，保持 browser/test fake 可替换，不在组件中散布直接 Tauri invoke。
- [x] 5.3 用现有 Semi Design 组件把 Plugins tab 空占位收敛为统一“插件”标题、说明、单个“从本地安装”按钮和 pending/success/failure 状态；“本地”只描述安装来源而不形成插件类别；取消恢复 idle，pending 防重入，键盘激活、焦点恢复、live status/alert 不依赖颜色。
- [x] 5.4 更新 canonical `en-US`、语义对齐的 `zh-CN` 和 `messages.schema.json`，为 button、说明、pending、cancel、成功及各高层失败 code 提供完整本地化文案，不显示原始 native message/path/digest。
- [x] 5.5 扩展 frontend tests，覆盖 adapter fixtures、Settings keyboard/focus、防重入、cancel、success/error retry、malformed payload、英中 locale、light/dark theme，并断言没有列表、详情、enable/disable/uninstall 或敏感安装事实。
- [x] 5.6 在固定原生 `650×600` 设置页视口完成 English light、Simplified Chinese light 和至少一种 dark 组合的截图/计算样式验收，检查连续 surface、长文案、按钮 focus、pending/feedback 可读性且不引入持久卡片。

## 6. 文档与专用门禁

- [x] 6.1 更新 `docs/en/architecture/extension-platform.md` 和对应 `docs/zh` 镜像，区分已交付 inspection/Manager/Registration 与新增 installation coordinator、single-registration digest layout、恢复和后续生命周期边界。
- [x] 6.2 更新 `docs/en/architecture/plugin-package-format.md` 和对应 `docs/zh` 镜像，说明 installer 如何复用同一不可变包字节与 canonical traversal，同时保持 package protocol 本身不拥有 source/path/lifecycle。
- [x] 6.3 文档明确 app-local data 与 signed app bundle 分离、直接删除 `lensx.app` 不保证清理 Application Support，以及专用应用卸载器、plugin uninstall、upgrade/rollback 均为后续 change；核对英中文档标题、语义、示例与限制完全对齐。
- [x] 6.4 运行并修复 `pnpm run check:plugin-package-format`、`pnpm run check:plugin-registration-contract` 和 `pnpm run check:local-plugin-installation`，确认既有 contract/fixtures 无 drift 且新增 boundary gate 覆盖所有安装层。

## 7. 最终验证

- [x] 7.1 依次运行 `pnpm run test`，修复所有 frontend/workspace test failure 后重跑失败命令及该完整命令。
- [x] 7.2 依次运行 `pnpm run check`、`pnpm run typecheck` 和 `pnpm run build`，修复所有 formatting、static analysis、workspace boundary、类型和构建错误/警告后重跑失败命令及三项完整命令。
- [x] 7.3 依次运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，修复所有 Rust formatting、test、static check 错误/警告后重跑失败命令及三项完整命令。
- [x] 7.4 运行 `openspec validate add-local-plugin-installation --type change --strict --no-interactive`，核对实现、英文/中文文档、delta spec 与全部任务 checkbox 一致；最后顺序重跑 6.4、7.1、7.2、7.3 的完整验证集并记录结果。
