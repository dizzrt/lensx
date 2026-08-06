## 1. Host-private 插件数据清除边界

- [x] 1.1 定义 Plugin Data Management Contract `0.1.0` 的 Rust/TypeScript types、strict parsers、共享 valid/invalid fixtures 与闭合错误语义，固定 `clear_plugin_data` request/result 只包含 contract version、opaque entry ID、expected/current revision 和 `changed`。
- [x] 1.2 在 Rust scoped storage/data coordinator 中实现 disabled/current identity 的整 namespace 清除：复用跨进程序列化，重新验证 Manager 与 canonical ownership，以 canonical empty `storage-v1.json` 原子提交，并对空、损坏但可证明、symlink、未知 entry、root escape、提交前/后故障和并发状态变化编写测试。
- [x] 1.3 注册 private Tauri command，建立 TypeScript desktop adapter 与 root-private data-management service；严格验证 unknown payload、映射安全错误、保持幂等结果，并确保 command/types 不进入 public packages、Manifest、SDK、Testkit 或 plugin workspace。
- [x] 1.4 扩展 scoped-storage 与 workspace/public-tarball 门禁，证明清除不改变 Registration、enabled intent、grants、Manifest 或 program payload，不泄露路径、key、value、payload、exception 或 stack，且 enabled/quarantined/stale/degraded/unprovable 请求 fail closed。

## 2. Plugin Management Service

- [x] 2.1 建立 root-private `PluginManagementService` 与冻结 view model，以 current Registration snapshot、opaque `entry_id` 和 revision-consistent detail 驱动 loading、empty、ready、degraded、quarantined、detail-error 与 retry 状态，不新增持久化缓存或 patch/history 协议。
- [x] 2.2 在 facade 中组合 permission catalog/view 和 bounded diagnostics，分别投影 requested、supported、granted、effective 与 safe diagnostic facts；输出 typed operation availability，但不暴露 grant/revoke、Publisher trust 或插件可调用管理能力。
- [x] 2.3 串行编排 local installation、lifecycle、replacement 与 data-clear services：绑定 expected revision、阻止重复 mutation、处理 prepare/commit/cancel、surface convergence、cleanup pending、conflict refresh，并在安装/卸载/snapshot invalidation 后确定性恢复 selection。
- [x] 2.4 为 management service 增加聚焦测试，覆盖完整刷新与 event loss、detail revision mismatch、安装后选择、条目移除后的相邻选择、replacement permission diff、过期确认、durable success/后续 convergence failure、Manager degraded 与安全错误映射。

## 3. Host 设置管理页面

- [x] 3.1 将 `SettingsPage` 的 Plugins 区拆分为连续表面的管理组件，使用现有 Semi Design 原语实现真实列表、健康/隔离详情、empty/loading/degraded/error/retry 状态，以及名称、版本、source、enabled、compatibility、Runtime、只读 permission 与 diagnostic 展示。
- [x] 3.2 接入安装、启用、禁用、本地 upgrade/downgrade/reinstall、卸载和清除数据控件；为 replacement diff、`retain_data`/`delete_data` 卸载和 disabled-only clear 提供显式确认，默认 retain data，并区分 logical success、cleanup pending 与 refresh/convergence failure。
- [x] 3.3 在 App composition 中注入共享 management service，复用当前 Registration/surface/lifecycle/replacement/permission services 与新 data-management service；确保 React 不直接 invoke Tauri、不复制 Plugin Manager transition/ownership 规则，且 service 生命周期和订阅在 App teardown 时正确释放。
- [x] 3.4 补齐 canonical English 与语义一致的 `zh-CN` 文案、Semi theme tokens、UnoCSS 简单布局与 Less 复用/状态样式；在固定 native page viewport 中保证 light/dark、中英文、长名称/诊断与滚动布局可读且不形成第二套持久卡片表面。
- [x] 3.5 完成键盘与焦点行为：列表选择、所有操作、重试和 Modal 可仅用键盘完成；pending 防重入；Modal 关闭返回触发按钮；卸载后移动到相邻条目或安装入口；live status/alert 不依赖颜色且 raw errors 不进入 DOM。
- [x] 3.6 扩展 Host settings/component integration tests，覆盖 empty/healthy/quarantined/degraded、列表详情选择、只读 permission、各 mutation 与确认、i18n、theme、keyboard、focus restore、重复提交、conflict refresh、cleanup pending 和错误最小披露。

## 4. 文档与聚焦验证

- [x] 4.1 更新 `docs/en/architecture/extension-platform.md`，说明已交付的 Host-private management facade、插件数据清除 contract、revision/ownership/atomicity、权限只读边界和明确非目标；同步维护 `docs/zh/architecture/extension-platform.md` 的语义镜像。
- [x] 4.2 更新 `docs/en/development/frontend-guidelines.md` 与中文镜像，记录 management continuous surface、Semi 组件、键盘/焦点/危险确认模式；更新 `docs/en/development/validation.md` 与中文镜像，记录 focused gate、视觉证据和相关回归范围。
- [x] 4.3 新增 `pnpm run check:plugin-management-settings` 聚焦门禁，串行覆盖 data-management Rust/TypeScript fixtures、management service/UI、Host settings、workspace/public package boundaries、相关 lifecycle/replacement/permission/storage regressions，以及固定 native viewport 的双语 light/dark screenshots 与 computed styles。

## 5. 最终验证

- [x] 5.1 顺序运行 `pnpm run check:plugin-management-settings`、`pnpm run check:local-plugin-installation`、`pnpm run check:plugin-registration-contract`、`pnpm run check:plugin-lifecycle-controls`、`pnpm run check:plugin-upgrade-and-rollback`、`pnpm run check:plugin-permission-management` 和 `pnpm run check:plugin-scoped-storage`；修复本 change 引入的每个 warning/error 后重跑失败命令及本组完整命令。
- [x] 5.2 运行完整 frontend/shared 验证：`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`；修复本 change 引入的每个 warning/error 后重跑失败命令及四项完整集合。
- [x] 5.3 运行完整 Rust 验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`；修复本 change 引入的每个 warning/error 后重跑失败命令及三项完整集合。
- [x] 5.4 在固定 native page viewport 下逐一验收 `en-US`/`zh-CN` × light/dark 的 empty、healthy、quarantined、degraded、replacement confirm、uninstall confirm 与 clear-data confirm screenshots/computed styles，并用键盘回放安装、选择、取消、冲突刷新和卸载后焦点恢复。
- [x] 5.5 核对 English/Chinese 文档标题、含义、限制与相对路径一致，确认 public package/workspace 无 private management exports，运行 `openspec validate add-plugin-management-settings --type change`；修复所有问题后重新运行本节 5.1–5.5 的完整最终验证集合。
