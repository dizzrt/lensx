## 1. Host 私有 Session contract 与状态核心

- [x] 1.1 在 `src/app/plugins/runtime/` 定义独立版本 `0.1.0` 的 Host 私有 bootstrap/ready contract、strict `unknown` parser、bounded error/state 类型和冻结 identity/Port lease；只允许 exact 字段并明确禁止自报 plugin/entry/Page/grant，且不增加任何公共 package export。
- [x] 1.2 建立可注入的 cryptographic nonce、`MessageChannel`、target-window 与 Port adapter，生产实现只使用 `crypto.getRandomValues` 和浏览器标准 API；验证至少 128 bit 小写十六进制 nonce、exact `targetOrigin`、single transfer 与无第三方 runtime dependency。
- [x] 1.3 实现 `PluginRuntimeSessionService` 的 `awaiting_handshake -> ready -> disconnected/disposed` terminal 状态机、单 active Session、一次性 acknowledgement、`messageerror`、幂等 dispose 和 late-event guards；只暴露冻结的可信 identity/state/Host Port lease，不实现 RPC 或自动重连。
- [x] 1.4 增加 focused parser/service tests，覆盖正常 ready、未知版本、缺失/额外/错误类型/超界字段、错误/重复/过期 nonce、错误 Port、跨 Session 重放、late acknowledgement、重复清理、Host reload/disconnect 和不泄露 private error/token/identity。

## 2. Current facts、grants 与 iframe currentness

- [x] 2.1 扩展 Host 私有 Runtime descriptor/resolver 输入，使 Session 可获得 opaque entry、plugin/version/Page、expected isolated origin、resource generation/Runtime attempt key 和创建时 revision；保持公共 Page/Action/Manifest/Registration payload、URL/token/path/digest 与 Host object 边界不变。
- [x] 2.2 通过现有 Registration adapter 读取并交叉验证 current detail/revision，把排序去重的实际 `granted_permission_ids` 绑定进只读 Session identity；requested permissions、enabled/source/publisher 文本不得转成 grant，summary/detail/Resource/Page 无法收敛时 fail closed。
- [x] 2.3 将 iframe/Session currentness 改为刷新后比较当前插件相关 entry、Page、version、resource origin/generation、attempt、availability 与 grants；相关变化撤销旧 iframe/lease/Session，无关插件引起的全局 revision 变化保留当前 iframe、lease 和 Session。
- [x] 2.4 增加 resolver/currentness/invalidation tests，覆盖 disabled、incompatible、quarantine、uninstall、grant change、retry、跨 Page、旧 generation、同 plugin/version replacement、竞态/无法收敛，以及无关插件 install/disable/replacement/grant change 不重建当前 Runtime。

## 3. MessageChannel bootstrap 与 React Runtime 集成

- [x] 3.1 为 `PluginRuntimeFrame` 接入真实 iframe ref；只有当前 descriptor/lease 的 load completion 才把精确 `contentWindow` 交给 Session service，并用 current isolated `entry_url` 推导 exact `targetOrigin`，不得接受 Manifest/plugin/UI 提供 window、origin 或 identity。
- [x] 3.2 实现 Host-push bootstrap：为每个 Runtime attempt 创建新 nonce/`MessageChannel`，只向记录的 window/origin 转移 child Port，并只在 Host Port 收到 exact 首次 acknowledgement 后发布 Session `ready`；bootstrap/ack 不携带 identity、entry、grants、revision、resource token 或 Host object。
- [x] 3.3 将 close、Home/Search/Host Page、retry、relevant Registration invalidation、replacement 与 App unmount 接到 Session 自身的 terminal teardown，关闭可控 Port/监听器并清除 nonce；保持最多一个 iframe/Session，错误/旧 window message 直接忽略且不形成 oracle。
- [x] 3.4 扩展 Testing Library/Rstest coverage，证明 iframe `loaded`、Session `ready` 与未来 SDK `ready` 分离，错误 window/origin、cross-plugin、duplicate load、late result 和 old Port 稳定失败；现有 busy/alert/retry、ARIA/focus、English/Chinese、light/dark、Host Page 与 iframe policy 行为保持不变且无新用户文案。

## 4. 真实包、WKWebView 证据与边界门禁

- [x] 4.1 扩展 canonical normal/malicious `.lxp` fixture 生成与 drift tests，加入最小私有 bootstrap consumer、跨插件/旧 generation/replay/wrong-origin 尝试和有界结果；fixture 不成为公共 SDK transport、正式模板或作者 contract。
- [x] 4.2 建立专用 macOS `plugin_runtime_session` WKWebView harness，复用 production Resource/isolated-origin/iframe policy 与真实包路径，验证 exact target window/origin、MessagePort transfer、single-use nonce、ready/disconnect/dispose、retry/同版本 replacement 后 old Port 失效、无关 Registration 变化稳定和 privileged Tauri handler hits 为零。
- [x] 4.3 增加有界 evidence schema/checker/tests 与 `check:plugin-runtime-session` 根命令，组合 Session parser/service/resolver/frame tests、workspace boundaries、Registration/Page/lifecycle/replacement/resource regressions、Task 4.2 focused gate 和真实 macOS harness；evidence 不得包含 URL/origin token/nonce/Port 内容、路径、raw payload 或 private error。
- [x] 4.4 扩展 workspace、package tarball 和 source boundary gates，拒绝官方/示例/外部插件或 `plugin-contract`/`plugin-sdk`/`plugin-ui`/`plugin-testkit` 导入 Session internals；确认 Registration Contract 仍只报告 `inactive`，Rust Store 不持久化 Session，且未增加 RPC/Host API/permission decision/public method。

## 5. 文档、能力边界与路线图准备

- [x] 5.1 按 `docs/AGENTS.md` 更新 canonical English `docs/en/architecture/extension-platform.md` 与 `docs/en/architecture/overview.md`，记录 shipped Session identity/currentness、Host-push MessagePort bootstrap、三层 ready 语义、process-local/private 边界和 Task 4.4/5.x 非目标；同步相同路径 `docs/zh/` 镜像。
- [x] 5.2 更新 `docs/en/development/validation.md` 与 `docs/zh/development/validation.md`，记录 `check:plugin-runtime-session`、真实 macOS evidence、安全矩阵、平台限制以及 focused gate 不替代完整验证。
- [x] 5.3 复核 README、AGENTS、Manifest schema、Registration payload 和公共 package declarations 未承载 Session wire/identity/Port；实现与全部验证完成前保持 `plugin-roadmap.md` Task 4.3 未勾选，也不提前宣称 Local Plugin Preview、SDK transport、Host API、permissions 或完整 Runtime lifecycle。

## 6. 最终验证

- [x] 6.1 运行 `pnpm run check:plugin-runtime-session`，修复 Session、真实包、macOS WebView/security evidence、workspace boundary、Registration/Page/lifecycle/replacement/resource 与 Task 4.2 focused gate 的所有 warning/error，并重新运行至通过。
- [x] 6.2 顺序运行 `pnpm run test`，修复本 change 引入的所有 failure/warning，然后重新运行至通过。
- [x] 6.3 运行 `pnpm run check`，修复 Biome、workspace boundary 和全部 workspace member check 问题，然后重新运行至通过。
- [x] 6.4 运行 `pnpm run typecheck` 与 `pnpm run build`，修复所有 error/warning 并重新运行两项至通过。
- [x] 6.5 运行 `pnpm run src-tauri:format:check`；若需要，运行 `pnpm run src-tauri:format` 后重新检查至通过。
- [x] 6.6 顺序运行 `pnpm run src-tauri:test` 与 `pnpm run src-tauri:check`，修复本 change 引入的所有 error/warning 并重新运行至通过。
- [x] 6.7 运行 `openspec validate bind-plugin-runtime-sessions --type change --strict --no-interactive`，直接统计本文件 checkbox，并复核 proposal/design/delta specs、source/tests、英中文档、focused gate 与 macOS evidence 一致；任何 exact source/origin、MessagePort、nonce、currentness 或旧 Port 失效证据缺失都阻止完成声明。
- [x] 6.8 只有 6.1–6.7 全部通过且 Task 4.3 completion standard 有真实证据后，才在 `plugin-roadmap.md` 标记 Task 4.3 完成；随后重新运行 `pnpm run check`、`pnpm run check:plugin-runtime-session` 与当前 change strict validate，确认 Roadmap、文档、规格和实现仍一致。
