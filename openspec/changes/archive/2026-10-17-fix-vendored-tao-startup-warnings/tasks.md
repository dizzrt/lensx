# Tasks

本清单跟踪实现与验证进度，仅在取得对应证据后勾选任务。依据 [design.md](design.md) 保持现有能力契约，`specs` 已通过 `skip_specs: true` 明确跳过。每组随实现补齐相应测试和维护说明；最后一组只执行集成验收。

## 1. 清理可独立确认的 Tao 警告

- [x] 1.1 删除 `monitor.rs` 的 `NSString`、`util/async.rs` 的 `DispatchQueueAttr` 导入，以及 `app_delegate.rs`、`event.rs` 两处、`platform/macos.rs` 的四个多余 unsafe 包裹；按设计诊断表核对恰当的六处清理，保留 `MainThreadMarker::new_unchecked` 等必要 unsafe。
- [x] 1.2 删除无消费者的 macOS 内部 badge 方法、`yes` helper、`saved_desktop_display_mode` 和 `inner_rect` 字段及其初始化残留；通过消费者审查确认公共 badge extension、CGDisplay 用途和其他平台方法不变。
- [x] 1.3 保留 `PlatformIcon` RGBA 载荷、验证及派生行为，只为该字段添加有英文理由的 `allow(dead_code)`；对 `hit_test` 添加 Windows/Linux/DragonFly/FreeBSD/NetBSD/OpenBSD 的精确 cfg，核对所有现有消费者仍被覆盖。
- [x] 1.4 将 `NSKeyUp` 改为 `NSEventType::KeyUp`，删除 FullScreenButton 的旧导入和无效数组项；审查事件条件及按钮列表，确认没有重复 ZoomButton 或扩大窗口行为修改。
- [x] 1.5 在现有 Rstest discovery 中扩展依赖维护源策略测试，验证跨平台消费者、本变更新增的 lint 例外仅限 PlatformIcon 字段、禁止新增宽泛警告屏蔽和已有 responder 接线保持；保留无关的上游已有例外，对应断言通过，且不为单纯导入/unsafe 删除编写镜像测试。
- [x] 1.6 在 `docs/en/development/validation.md` 及 `docs/zh/development/validation.md` 同步诊断维护范围和字段例外说明；逐段核对语义一致，不将尚未执行的严格编译描述为已通过。

## 2. 成套迁移 macOS 文件拖放适配

- [x] 2.1 提取生产回调实际使用的最小纯 Rust `file_drop.rs` 策略，接收有序 `Option<PathBuf>` 候选结果与阶段，过滤 None 并产生现有事件及接受/拒绝结果；同模块加入多文件顺序、空结果、混合 Some/None 过滤、Prepare 无文件事件、Exit 单次 Cancel 和已解析特殊字符路径保留的测试，以 `rustc --test` 执行通过。
- [x] 2.2 将 Window 拖放注册改为文件 URL 类型，并实现 Hover/Prepare/Drop 共用的薄 pasteboard 读取器；使用 NSURL 对象读取、file URL 限制、受检查类型转换及 `to_file_path`，将候选 Some/None 按顺序传给生产共用策略；审查确认不再使用旧格式、无检查解包/转换、字符串拼接解码或文件内容访问。
- [x] 2.3 在 Tao 活动 `Cargo.toml` 显式启用 `objc2-app-kit/NSDragging`；修正 `draggingEntered:` 为 NSDragOperation，保留 Prepare/Perform 的原生 BOOL 签名，检查注册编码及 macOS Cargo 编译通过，不依赖其他 crate 的 feature 合并。
- [x] 2.4 将 Enter/Prepare/Drop 接入同一生产策略并在各阶段重新读取当前 payload；有效项逐文件发送 Hover/Drop，零有效项拒绝且不发文件事件，Exit 每次只发一个 Cancel，Conclude 保持语义；通过真实策略测试和原生接线检查共同验证，不增加 session 缓存或状态机。
- [x] 2.5 扩展现有 Rstest 维护测试，验证三个读取阶段、注册、显式 feature 和正确回调类型的接线，以及旧拖放格式使用已移除；通过纯策略执行和 macOS 编译补充这些源级检查。
- [x] 2.6 在上述英文与中文维护文档中同步文件 URL 迁移、异常 payload 拒绝及测试边界；核对明确区分已解析路径测试与真实 NSURL 解码/Finder/AppKit 交互，不增加环境验证入口。

## 3. 接入确定性维护验收并更新受审基线

- [x] 3.1 扩展 `scripts/frame-aware-navigation-dependency-drift.ts` 的受审 Tao 文件清单和相关测试，覆盖实际修改的活动 manifest、既有源码及新 helper；更新 vendor 维护说明，保留版本、许可证、原始发行元数据、隔离与 resizable 补丁记录，检查清单与实际 diff 一致。
- [x] 3.2 在现有 `frame-aware-navigation-dependency-drift` typed Gate 中加入 Tao 严格编译 `cargo rustc --locked --manifest-path src-tauri/Cargo.toml -p tao --lib -- -D warnings`；加入当前应用与单独 Tao 的路径、版本及 feature 集合一致性检查，普通 Cargo check/build 继续覆盖实际应用图，验证缺项或漂移时拒绝通过。
- [x] 3.3 同一 Gate 接入生产拖放策略的 `rustc --test` 编译/执行/幂等清理，以及所有涉及 vendor Rust 文件的两空格 rustfmt 检查；保留原 resizable 测试，仅写忽略构建目录，确认无需任何根脚本别名。
- [x] 3.4 必要时为 registry 步骤构造器增加最小平台覆盖参数，显式标记 macOS 编译步骤为 Darwin；同步 Rstest registry/治理测试，验证步骤去重、无依赖环、无提交产物写入、无 GUI 命令及跨宿主平台过滤。
- [x] 3.5 完成 `docs/en/development/validation.md` 与中文镜像的 Gate、严格编译、格式范围及确定性局限说明；核对文档和测试不再假定 Tao 仅有两份补丁文件，且所有 Gate/Generate ID 可解析。
- [x] 3.6 审查全部 vendor 与维护检查 diff，确认五个依赖版本/路径未变、Wry/Tauri 隔离补丁和 `resizable.rs` 策略保留；之后显式执行 `pnpm run generate -- frame-aware-navigation-dependency-drift --write`，通过只读基线比较和篡改/缺文件/版本漂移测试，禁止 Gate 自动接受新基线。

## 4. 最终验证

- [x] 4.1 执行 `pnpm run gate -- frame-aware-navigation-dependency-drift`、`pnpm run gate -- launcher-input-focus`、`pnpm run gate -- frame-aware-webview-navigation-policy`、`pnpm run gate -- plugin-child-webview-runtime`；确认严格 Tao 编译无警告、18 条已知诊断全部消失，以及原隔离、零通用权限命中、responder 和生命周期回归通过。
- [x] 4.2 执行完整前端与 workspace 的 `pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`；全部通过，覆盖维护脚本、registry、前端消费者和共享包，本次不以产品 React 代码未变为理由省略。
- [x] 4.3 执行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`，并复核独立 vendor 文件格式检查；确认真实应用依赖图中的 Tao 不再输出已知警告，不使用 GUI 启动作为编译验收。
- [x] 4.4 执行 `pnpm run gate -- ci-lensx`，确认与完整生命周期共同通过；聚焦 Gate 结果与全量 frontend/Rust/CI 结果分别记录，不把确定性检查描述为真实 WebView、Finder 拖放、输入法或其他操作系统编译的验证。
- [x] 4.5 执行 `openspec validate fix-vendored-tao-startup-warnings --strict --no-interactive` 和 `git diff --check`，核对双语维护文档、现有文档链接及所有 Gate/Generate 标识；扫描根 manifest、CI、维护文档与稳定 specs，确认没有引入 Change 专用根命令、移除的别名、直接 Rstest 文件列表根脚本或退休的验证入口。
- [x] 4.6 修复本变更引入的全部警告与错误，先重跑失败项，再重跑最终验证全集；确认实现范围与提案一致、完整性基线已审查，报告本次新增的字段级 lint 例外及未做真实原生/跨平台环境验证的边界，保持提交、推送、规范同步和归档由另一次明确授权决定。

### 最终验证记录

- 聚焦 Gate：`frame-aware-navigation-dependency-drift`、`launcher-input-focus`、`frame-aware-webview-navigation-policy`、`plugin-child-webview-runtime` 均通过。维护 Gate 执行 69 项 Rstest 检查、17 项生产 Rust 策略测试、15 份 vendor Rust 格式检查、实际依赖图一致性检查及 Tao `-D warnings` 严格编译。
- 完整 frontend/workspace：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build` 均通过；新增测试的 UTF-8 文件名类型问题已修复并重跑。示例测试在公共包并行构建期间出现的模块解析失败已单独重跑通过，随后串行完整测试通过。
- 完整 Rust：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build` 均通过，231 项应用单元测试通过，无编译警告。
- 完整 CI：`pnpm run gate -- ci-lensx` 通过，与上述聚焦 Gate 和完整 lifecycle 结果分别记录。
- 完整性与文档：审查源码后显式 Generate，376 份 vendored 文件只读比较及篡改/缺文件/版本漂移检查通过；五个依赖版本和覆盖路径、原始发行元数据及许可证、Wry/Tauri 隔离补丁、resizable 策略均保持不变。双语文档语义、Gate/Generate 标识和维护范围核对通过；根 manifest、CI、稳定 specs 未新增或改变命令入口。
- 本次唯一新增 lint 例外是 `PlatformIcon` RGBA 字段的 `allow(dead_code)`，保留载荷验证、存储和 Debug/Clone 行为。未执行真实 NSURL 解码、Finder/AppKit 拖放、WebView、输入法、GUI 或其他操作系统编译；确定性检查不证明这些环境行为。
- OpenSpec strict validation 与 `git diff --check` 通过。未提交、推送、同步稳定规范或归档。
