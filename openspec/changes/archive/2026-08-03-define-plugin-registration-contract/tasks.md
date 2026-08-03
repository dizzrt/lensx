## 1. 固化 Host 私有 Registration wire model

- [x] 1.1 在 Rust 中新增独立 Registration Contract version、snapshot、summary、detail、changed event、稳定 query error 和严格 discriminated variant 类型，不给现有内部 `PluginRegistration` 直接增加跨边界序列化职责。
- [x] 1.2 定义健康与 quarantine 共用的 opaque entry identity、确定性排序和合法输入约束，保证 identity 不包含安装路径、Store 文件名或其他敏感实现信息。
- [x] 1.3 实现健康 registration 到 summary/detail 的安全投影，包含 normalized Manifest、`builtin | external` source、enabled、逐维 compatibility、排序去重 grant、`inactive` Runtime 和有界诊断，同时排除安装路径、package digest 与私有对象。
- [x] 1.4 实现 quarantine summary/detail 与 Manager degraded availability 投影，只暴露可验证 identity、可选 plugin ID 和安全诊断，不解析或返回损坏记录内容。
- [x] 1.5 添加 Rust read-model 单元测试，覆盖空、健康、disabled、incompatible、quarantine、degraded、publisher 不建立信任、requested/granted 分层、敏感字段缺失和确定性排序。

## 2. 扩展 Plugin Manager revision 与提交后通知语义

- [x] 2.1 为当前进程的 Plugin Manager snapshot 增加单调 revision，并以十进制字符串投影；恢复后的初始 revision 不依赖旧进程或持久化 Store format。
- [x] 2.2 增加一次锁定下读取 snapshot/detail 与对应 revision 的 Host 私有 API，保证 detail 响应可以检测和 snapshot 的 revision 差异。
- [x] 2.3 让每个真实状态变化仅在持久化成功并发布内存 next state 后递增 revision，并向 Host notification adapter 返回 typed post-commit change；失败、拒绝和无实际变化不得更新 revision。
- [x] 2.4 添加 Rust 状态转换测试，覆盖 register、enabled intent、diagnostic/quarantine replacement 的成功 revision，以及各写入阶段失败不递增、不通知、旧状态保持不变。

## 3. 建立只读 Tauri query 与 changed event 边界

- [x] 3.1 实现 `read_plugin_registration_snapshot` command，从 Tauri managed Plugin Manager 返回当前完整 summary snapshot，并将健康空集合与 degraded recovery 明确区分。
- [x] 3.2 实现 `read_plugin_registration_detail` command，严格校验 opaque entry identity，返回当前 revision-bound detail，并将非法输入、不存在、不可用和内部失败映射为稳定安全错误。
- [x] 3.3 注册两个只读 command 和 `plugin-registration://snapshot-changed` emitter，确保 event 只在成功 post-commit change 后发出且 payload 仅含 contract version 与 revision。
- [x] 3.4 使用可注入 command/emitter 边界添加 Tauri Rust 测试，覆盖空/健康/quarantine/degraded 查询、not-found/invalid-request/安全错误、事件发布顺序、失败不发事件和应用 setup 仍只托管同一 Manager 实例。
- [x] 3.5 验证本 change 没有新增 register、enable、disable、uninstall、permission 或 Runtime 写 command，也没有改变 Launcher invoke、Action Registry、Dispatcher、导航和窗口生命周期。

## 4. 建立共享 fixtures 与 TypeScript runtime contract

- [x] 4.1 新增项目自有的 Registration Contract 正反共享 fixtures，覆盖空 snapshot、健康、disabled、incompatible、quarantine、degraded、健康/quarantine detail、稳定错误、changed event、未知字段、错误版本/variant/revision、重复或未排序 grant 和敏感字段注入。
- [x] 4.2 在根应用插件私有区域新增 readonly TypeScript registration 类型和纯 runtime parsers；所有 invoke/event 值以 `unknown` 输入，严格校验 contract version、字段集合、variant、identity、revision、排序和不变量。
- [x] 4.3 实现 TypeScript query error 映射，保留稳定 `code`/`operation`/安全 message，拒绝原始异常、路径、栈和部分解析值进入应用状态。
- [x] 4.4 添加 TypeScript parser/fixture 测试，保证与 Rust 对有效/无效 case 的判断一致，输出不可被调用方变更，且 registered 类型不从任何公共 plugin package 导出。
- [x] 4.5 扩展 workspace boundary fixtures，验证官方、示例和外部 tarball consumer 均无法导入 Host 私有 registration types、desktop adapter 或 Tauri event 入口。

## 5. 实现可恢复的 TypeScript desktop adapter

- [x] 5.1 新增可注入 `invoke`/`listen` 的 Host 私有 Registration desktop adapter，只公开 snapshot/detail 读取、订阅和销毁能力，不提供生命周期写操作或通用 Tauri passthrough。
- [x] 5.2 实现“先订阅、后读取”初始化、snapshot/detail cache 失效、revision 不匹配重读、并发通知合并和串行刷新，直到 snapshot 与最近有效 event revision 一致。
- [x] 5.3 在 adapter 重建、监听恢复和 Launcher activation 时读取完整 snapshot；无效 event 必须产生稳定边界错误并通过 snapshot 恢复，不应用 patch 或历史重放。
- [x] 5.4 添加 frontend 单元测试，使用可控 deferred invoke/listen 覆盖首次读取竞态、多个快速事件、丢失事件后激活恢复、乱序/无效事件、detail revision 变化、缓存失效、监听清理和重复销毁。
- [x] 5.5 验证 adapter 尚未接入新 UI，不新增用户可见文案、组件、主题或交互，因此本 change 不需要新增 accessibility、i18n locale 或 light/dark mode 场景，现有 App Shell 渲染保持不变。

## 6. 建立 drift gate 与维护文档

- [x] 6.1 新增 `check:plugin-registration-contract` 根命令，组合 TypeScript fixture/parser/adapter 测试、workspace boundary 测试和聚焦 Rust registration tests，并确保标准 workspace lifecycle 会传播失败。
- [x] 6.2 更新 `docs/en/architecture/extension-platform.md`，说明已交付的 Host 私有 Registration Contract、四层类型、summary/detail、revision/event 恢复和最小披露边界。
- [x] 6.3 同步更新 `docs/zh/architecture/extension-platform.md`，与英文文档语义一致，并继续明确安装、生命周期写操作、Action/Page 投影、管理 UI、真实 Runtime、权限决策和签名仍未交付。
- [x] 6.4 检查公共 package exports、README/AGENTS onboarding 和 plugin tarball 内容未扩大；文档不得把 publisher、source、enabled、requested permissions 或空 signature 能力描述成信任或自动授权。

## 7. 最终验证

- [x] 7.1 运行 `pnpm run check:plugin-registration-contract` 和聚焦 frontend/Rust tests；修复本 change 引入的全部错误与 warning 后重跑失败命令。
- [x] 7.2 依次运行 frontend 完整验证：`pnpm run test`、`pnpm run check`、`pnpm run typecheck`、`pnpm run build`。
- [x] 7.3 依次运行 Rust 完整验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`。
- [x] 7.4 运行 `openspec validate define-plugin-registration-contract --type change`，检查所有 tasks、spec scenarios、中英文文档和实现边界一致，并在任何修复后重跑完整最终验证集。
