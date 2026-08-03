## 1. 建立 Page descriptor 与 Registry

- [x] 1.1 定义 framework-neutral Host/Plugin Page provider、Page descriptor、lookup resolution、availability、diagnostic 与 provider replacement 类型，保持 `(owner_id, page_id)` 为唯一 identity，并以类型测试确认 route/permission/内部 bookkeeping 不进入 `ActivePage` 或展示 payload。
- [x] 1.2 将当前静态 Host Page catalog 演进为保护 `lensx.core` 的统一 Page Registry，实现不可变 lookup、确定性 snapshot、provider complete-batch replacement 和 empty-batch unregistration；测试有效批次、重复 identity、跨 owner parent、protected Host owner、失败原子性与输入/输出 mutation 隔离。
- [x] 1.3 实现纯 Plugin Page mapper，从规范化 Manifest 与 Registration detail 映射 Owner presentation、Page title、private route、同 owner parent target、required permission IDs 和 grant-subset availability；测试多 Page graph、locale fallback、无权限 Page、缺 grant Page 与 author 字段无法覆盖 Host identity/availability。

## 2. 扩展受控 application navigation

- [x] 2.1 让 `AppNavigationService` 通过统一 Page Registry 预检 Host 与插件 target，保持扁平 `ActivePage` 和单 handler 边界，并测试 available、unknown、unavailable、handler missing 与安全 `page_unavailable`/Dispatcher failure 语义。
- [x] 2.2 增加 Host-owned close/invalidation transition，使 Registry replacement 后失效的 active Plugin Page 可以在不暴露 React setter 的情况下返回 Home；测试移除、grant 缺失、provider 失效会关闭，而相同 identity 的 metadata 更新不会关闭。
- [x] 2.3 扩展 Page context resolver，从当前 Page resolution、locale 和 Launcher snapshot 解析 Owner 与 opening Action；测试 `zh-CN` 到 `en-US` fallback、missing Action 回退 Page title、Host token、plugin generic owner icon，以及 route/permission/Publisher 不泄漏。
- [x] 2.4 保持 Host Settings 的 open、context、close、PageErrorBoundary、fixed page surface 与焦点恢复回归行为，确认插件 Page 支持不会改变 `lensx.core/settings` 的受保护 ownership。

## 3. 协调 Plugin Page 与 Action projection

- [x] 3.1 调整纯 Plugin Action publication mapping，使 production batch 只包含目标 Page 当前 available 的 Actions，同时保持既有全局 Action ID、metadata、Host-owned executor、统一 Registry/Dispatcher、search 和 recent/pinned 语义；补齐 permission-filter 与无 provider 分支测试。
- [x] 3.2 实现 production Plugin surface projection coordinator，以单一 Registration adapter 消费 complete snapshots、按 revision 串行读取一次 detail，并在新增/替换时执行 Page-before-Action、在失效/移除时执行 Action-before-Page。
- [x] 3.3 为 coordinator 增加 provider fail-closed、stale detail 丢弃、identity/revision mismatch、degraded snapshot、listener recovery、Launcher activation、快速 revision 合并、`whenIdle` 和 destroy 后禁止提交测试；诊断断言不得包含 route、安装路径、raw error、stack、Tauri 或 Rust 值。
- [x] 3.4 将 coordinator 接入 production Launcher/App composition，启动真实 Plugin Action publication 和 Page preflight，确保初始化/activation/cleanup 生命周期只创建一套 surface projection subscription，且失败不影响 Host built-ins 或其他插件。

## 4. 提供 Runtime 前的 Host-owned Page surface

- [x] 4.1 使用 Semi Design 与现有 providers 新增 Host-owned Plugin Page placeholder，添加 English canonical 与简体中文镜像文案，支持 Page title、light/dark、PageErrorBoundary，并明确不加载 route、entry、asset、iframe 或插件代码。
- [x] 4.2 将 App Shell Page rendering 改为按 resolved descriptor 选择 Host Settings 或 Plugin placeholder，移除未知 owner 默认渲染 Settings 的行为，并保持 `home`/`search`/`page` 三态、单窗口和固定 native page surface。
- [x] 4.3 增加 Testing Library UI 覆盖：从真实 projected Action 搜索/执行到 placeholder、generic Owner icon、opening Action fallback、locale/theme 切换、键盘/指针关闭与输入焦点恢复、active Page invalidation，以及不存在管理/权限/重试/iframe/Tauri 入口。
- [x] 4.4 更新 locale schema、类型、测试和所有受影响的 message fixtures，确保 English 与简体中文 key 对齐且无组件硬编码用户可见文案。

## 5. 文档与规格一致性

- [x] 5.1 更新 `docs/en/architecture/overview.md` 与 `docs/en/architecture/extension-platform.md`，记录 shipped Page Registry/navigation、surface coordinator、grant snapshot 预检、Host placeholder 和生产 Action 激活，同时明确 Task 4.1/4.2/5.5 仍未交付；同步更新对应 `docs/zh/` 镜像。
- [x] 5.2 检查 `docs/en/development/frontend-guidelines.md` 是否需要补充统一 Page Registry、invalidation 与 placeholder 边界；如需修改则同步 `docs/zh/development/frontend-guidelines.md`，并验证两种语言索引和相对路径无需变化或保持一致。
- [x] 5.3 对照 proposal、design、delta specs、实现和测试逐项核验 identity、权限子集、projection 顺序、fallback、单窗口关闭、Runtime non-goals 与 fail-closed 行为，修正任何实质冲突后运行 `openspec validate add-plugin-page-navigation --type change`。

## 6. 最终验证

- [x] 6.1 运行 `pnpm run test`，修复所有受影响 frontend、boundary、UI 与 workspace tests 的失败和本 change 引入的 warning。
- [x] 6.2 运行 `pnpm run check`，验证 Biome formatting/static analysis、workspace boundaries、Contract/Registration drift gates 和 locale consistency。
- [x] 6.3 运行 `pnpm run typecheck`，修复 TypeScript public/private boundary、serializable payload 与 React composition 的全部错误。
- [x] 6.4 运行 `pnpm run build`，确认 production Rsbuild/Rspack bundle 不引入插件 Runtime、iframe、Tauri bridge 泄漏或未声明依赖。
- [x] 6.5 运行 `pnpm run src-tauri:format:check`，确认未改变的 Rust/Tauri 层仍满足格式门禁。
- [x] 6.6 运行 `pnpm run src-tauri:test`，确认 Plugin Manager、Manifest、Registration Contract、launcher lifecycle 与共享 fixtures 全量回归通过。
- [x] 6.7 运行 `pnpm run src-tauri:check`，确认 Rust static check 无 error 或 warning。
- [x] 6.8 修复 6.1–6.7 发现的每个 warning/error，先重跑失败命令，再按 6.1–6.7 顺序重跑完整最终验证；随后严格验证 change，核对所有 tasks 已完成，最后才将 `plugin-roadmap.md` 的 Task 2.4 checkbox 标记完成并再次运行 `openspec validate add-plugin-page-navigation --type change`。
