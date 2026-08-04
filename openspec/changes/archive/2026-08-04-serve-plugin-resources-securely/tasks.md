## 1. Resource Contract 与 Manager 私有事实

- [x] 1.1 在 Rust 与 TypeScript 中定义独立 `0.1.0` Plugin Resource Contract、`resolve_plugin_resource_entry` request/success/error、稳定 code/message 与 exact-field validators，并用共享边界 fixtures 验证错误版本、未知字段、错误类型和私有字段拒绝。
- [x] 1.2 为 Plugin Manager 增加不持久化、不进入 Registration Contract 的逐 entry `resource_generation` 与原子 crate-private resource projection；覆盖 recovery、register、幂等 no-op、enable/disable、replace、remove/re-register、diagnostic/unrelated change 的 generation 语义，确认 Store v1 JSON 与公共 snapshot/detail 完全不变。
- [x] 1.3 抽取 Installer 与 Resource Service 共用的最小 managed-payload ownership helper，严格证明 `packages/<plugin-key>/<sha256>`、record identity/digest、canonical root 和 runtime entry，不按 source/Publisher 猜测 ownership，并保持安装、replacement、uninstall/recovery 现有测试通过。
- [x] 1.4 把 Cargo.lock 已存在的 OS CSPRNG 实现作为精确版本直接依赖并记录许可证/必要性；不得复用 preparation token 的普通 hash。若安全 cross-platform open 需要额外 capability-filesystem 依赖，先完成精确版本、许可证、维护和 macOS/Windows/Linux 语义审查，否则使用标准库平台扩展与打开后 identity 复核。

## 2. Rust Plugin Resource Service

- [x] 2.1 实现 managed `PluginResourceService`、至少 128-bit CSPRNG scope、每个 `(entry_id, resource_generation)` 至多一个 scope 的幂等签发，以及按当前 Manager projection 惰性 reconcile/revoke；保证 token 不持久化、不记录、不进入事件或独立 wire 字段。
- [x] 2.2 实现版本化 `lensx-plugin` URL builder/parser，令 plugin key、version、runtime entry 全部从当前 registration 派生并在请求时交叉验证；拒绝前端提供 path/identity/origin/scope，并将平台 URL 形态封装为 opaque `entry_url`。
- [x] 2.3 实现 package-relative path lexical gate、metadata/目录拒绝、逐段 symlink/reparse 检查、canonical containment、安全 open、打开后 identity/size 复核与 64 MiB bounded read；为竞态测试提供只在测试构建可用的受控 hook，确保路径变化只能得到一致文件或完整安全失败。
- [x] 2.4 实现静态 MIME 表、GET/HEAD、准确 Content-Type/Length、`nosniff`、全量 `no-store` 和无 wildcard CORS；统一拒绝 Range、conditional request、query、未知扩展名、`application/octet-stream` fallback、目录 index 与 HTML 重写。
- [x] 2.5 实现 command typed errors 与 protocol `404/405/500` 固定安全响应，确保 body/header/log 不泄露 scope、identity、version、digest、record key、绝对路径、raw I/O、stack、partial bytes 或文件存在性差异。
- [x] 2.6 在 Tauri Builder 注册异步 `lensx-plugin` protocol，在 setup 中用现有同一个 `Arc<PluginManager>` 和 installer-owned root 初始化 managed service，并注册 `resolve_plugin_resource_entry` command；保持现有 installer/lifecycle setup 次序与无重启安装能力。

## 3. TypeScript Host-private Adapter 与边界

- [x] 3.1 在 `src/app/plugins/` 下新增 Resource Contract types、strict parser、canonical error class 与 desktop adapter；从 `unknown` 校验 success/error、deep-freeze 返回值、把 `entry_url` 当 opaque string 且不缓存跨 revision 结果。
- [x] 3.2 增加 contract/parser/desktop-adapter 测试，覆盖有效请求、stale/unavailable/unsafe/internal error、malformed URL/payload、未知字段、invoke failure 与 Host 私有字段泄漏；确认本 change 不接入 App Shell、不创建 iframe、不替换 Plugin Page placeholder。
- [x] 3.3 扩展 workspace boundary 检查及 fixtures，禁止 Manifest、官方/外部插件和公共 Contract/SDK/UI/Testkit 导入 Resource Contract、adapter、command wrapper 或 Rust/Host-private 路径，并增加 focused `check:plugin-resource-service` 脚本组合 TypeScript、boundary 与 Rust gates。

## 4. Rust 安全与生命周期集成验证

- [x] 4.1 使用真实临时 managed payload、Plugin Manager registration 与协议 request/response 建立正常读取矩阵，覆盖全部允许 MIME、大小写扩展名、GET/HEAD header/body、相对 HTML/CSS/JS asset 和 64 MiB 边界，不启动 GUI 或执行插件代码。
- [x] 4.2 建立路径攻击矩阵，覆盖 Unix/Windows absolute path、`.`/`..`、空/重复 segment、反斜杠、percent/double encoding、NUL、query、超长/过深 path、metadata、目录、不存在文件、跨插件路径、文件/目录 symlink/reparse 与验证-open-read 竞态。
- [x] 4.3 建立 scope/lifecycle 矩阵，覆盖重复 resolve 幂等、unrelated revision 保持、disable/re-enable 换 scope、same-version different-digest reinstall、upgrade/downgrade、failed/cancelled transition 保持、logical uninstall 先于 cleanup 撤销、quarantine/incompatible/degraded 与 process restart 失效。
- [x] 4.4 建立 method/MIME/error oracle 矩阵，覆盖 POST/PUT/DELETE、Range/conditional request、unknown MIME、scope/identity/generation mismatch 和 I/O faults；断言外部错误等价、所有 response `no-store`/`nosniff` 且序列化/日志不含路径、token、digest、raw error 或 partial body。
- [x] 4.5 在支持的 macOS、Windows 与 Linux URL/request fixtures 上验证 Tauri custom protocol 形态差异不会改变 scope/path 授权；无法在当前主机运行的目标必须通过纯 Rust platform fixtures 和 CI/build 覆盖，不得把当前 macOS Origin 字符串硬编码为跨平台事实。

## 5. 维护文档

- [x] 5.1 更新 `docs/en/architecture/extension-platform.md` 与 `docs/en/architecture/overview.md`，记录 shipped Resource Contract/service、managed payload 与 generation 边界、relative resource URL、MIME/cache/error/lifecycle 语义，并明确 Task 4.2 iframe、Task 4.3 session 与 Task 4.4 CSP 仍未实现；同步对应 `docs/zh/` 镜像。
- [x] 5.2 更新 `docs/en/development/validation.md` 的 focused gate、依赖审查与安全测试说明，并同步 `docs/zh/development/validation.md`；确认不需要 README、AGENTS、UI copy、locale、theme、accessibility 或 Semi Design 变更，因为本 change 没有新增可见 UI。

## 6. 最终验证与路线图状态

- [x] 6.1 运行 `pnpm run check:plugin-resource-service`，修复 Resource Contract、adapter、workspace boundary、Rust protocol/path/MIME/lifecycle 测试中的全部失败与 warning。
- [x] 6.2 运行前端完整验证：`pnpm run format`、`CI=true pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`。
- [x] 6.3 运行 Rust 完整验证：`pnpm run src-tauri:format`、`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，并确认三个桌面 target 的条件编译或 CI 证据无新增错误。
- [x] 6.4 修复本 change 引入的每个 error 与 warning，重跑失败命令，然后按顺序重跑 6.1–6.3 的完整 focused、frontend 与 Rust validation set；不得用单独通过的局部测试代替最终整套验证。
- [x] 6.5 在实现、文档和 6.1–6.4 全部通过后，将 `plugin-roadmap.md` Task 4.1 标记完成但不提前标记 Task 4.2+；运行 `openspec validate serve-plugin-resources-securely --type change` 并直接复核 `tasks.md` checkbox，确保 change apply-complete 且可进入后续 sync/archive 流程。
