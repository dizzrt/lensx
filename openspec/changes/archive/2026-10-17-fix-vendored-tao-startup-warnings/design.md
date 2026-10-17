# Design

## Context

动机与范围见 [proposal.md](proposal.md)。本设计记录实施约束，完成状态与验证结果见 [tasks.md](tasks.md)。

`src-tauri/Cargo.toml` 将 Tao、Tauri、tauri-runtime、tauri-runtime-wry、Wry 指向本地路径；版本分别保持 `0.35.3`、`2.11.5`、`2.11.3`、`2.11.4`、`0.55.1`。当前完整性检查覆盖 375 个文件。受审 Tao 补丁目前只列出 `window.rs` 和 `resizable.rs`，需要准确扩展清单，而不能仅重新生成哈希。

现有 `frame-aware-navigation-dependency-drift.test.ts` 已覆盖版本、隔离接线、responder 边界及未审漂移；其“两份 Tao 补丁文件”的断言与文档需要随真实维护范围更新。`launcher-input-focus` 已直接编译运行无 AppKit 的 resizable 策略，能够复用这种确定性测试方式。

已确认的 18 条诊断如下，数量指编译器诊断条目：

| 来源（相对 `vendor/frame-aware-navigation/tao/src/`） | 条数 | 拟议处理 |
| --- | ---: | --- |
| `platform_impl/macos/monitor.rs`、`util/async.rs` 的导入 | 2 | 删除 `NSString`、`DispatchQueueAttr` 未使用导入 |
| `platform_impl/macos/app_delegate.rs`、`event.rs` 两处、`platform/macos.rs` 的 `unsafe` | 4 | 仅删除围绕安全绑定调用的多余包裹，保留其他必要的 unsafe 操作 |
| `platform_impl/macos/app.rs` 的 `NSKeyUp` | 1 | 使用 `NSEventType::KeyUp` |
| `platform_impl/macos/window.rs` 的 `NSWindowFullScreenButton` 导入与数组项 | 2 | 删除恒无效的按钮项；同数组已有 ZoomButton，不重复替换 |
| `window.rs` 注册、`window_delegate.rs` 两次读取的 `NSFilenamesPboardType` | 3 | 同步迁移注册与读取格式 |
| `platform_impl/macos/event_loop.rs` 的两个 badge 方法 | 1 | 删除无消费者的内部冗余方法，保留公共 macOS extension 及其 free function |
| `platform_impl/macos/icon.rs` 的 RGBA 字段 | 1 | 保留载荷、验证和派生行为，添加有理由的字段级 dead_code 例外 |
| `platform_impl/macos/util/mod.rs` 的 `yes` | 1 | 删除无调用的 helper 及随之无用的导入 |
| `platform_impl/macos/window.rs` 的 `saved_desktop_display_mode` | 1 | 删除无读写字段及不再需要的 CGDisplayMode 导入，保留 CGDisplay 消费者 |
| 同文件的 `inner_rect` | 1 | 删除无读取字段、构造时计算及赋值 |
| `window.rs` 的共享 `hit_test` | 1 | 保留函数，按实际消费者限制编译平台 |

## Goals / Non-Goals

**Goals:**

- 通过真实 vendored Tao 编译消除全部已知警告，保持后续新诊断可见。
- 在原生适配边界保持类型正确、文件路径正确与现有事件语义；使异常系统输入安全失败。
- 用现有能力 Gate 约束隔离、生命周期及 responder 保护，并保持完整性基线可审查。

**Non-Goals:**

- 不改变 Rust/React/插件职责、公共序列化边界、SDK、Manifest、产品布局、语言、主题或可访问性语义。
- 不把消除警告当作重写全屏、图标、badge、焦点或跨平台实现的理由。
- 不创建产品文件导入流程、拖放 session 状态机或通用依赖维护框架。

## Decisions

### 1. 保持版本和保护补丁，只维护必要源码

保留全部 `[patch.crates-io]` 覆盖和既有 Wry/Tauri 隔离接线。`resizable.rs` 的策略保持原样；同次修改 `window.rs` 时保留主线程执行、实际 mask 比较、有效 responder 捕获/归属检查、按需恢复及恢复失败的有界诊断。既有 Native Window、Host WebView、Child WebView 身份和 compare-current 语义不变。

不通过升级或移除依赖解决警告：这会把警告维护变成隔离与焦点能力的重新审计。本次只增加 Tao 自己显式需要的绑定 feature，不改变依赖版本或引入第三方库。

### 2. 按消费者清理，记录本次新增的必要 lint 例外

`hit_test` 的条件覆盖 `windows`、`linux`、`dragonfly`、`freebsd`、`netbsd`、`openbsd`，与平台实现分派一致。不使用包含 macOS 的泛 `unix` 条件，不删除 Windows/Linux/BSD 正在使用的 helper。

`PlatformIcon(RgbaIcon)` 保留 RGBA 参数验证、存储及派生 `Debug/Clone`；仅对保留字段加 `#[allow(dead_code)]`，以英文注释说明 macOS 不读取像素而载荷语义仍需保留。其他无消费者的方法、字段和 helper 直接清理。选择该局部例外而不是手写 Debug，可减少维护面，也避免删除载荷造成行为变化。

禁止新增全局 `RUSTFLAGS` 抑制、`--cap-lints allow`、模块/crate 级 `allow(warnings)` 或成组 `allow(unused/deprecated)`。本次新增的 lint 例外仅限该 RGBA 字段，必须在测试和维护文档中准确披露，不称为消除了 RGBA 存储需求。保留上游已有且与本次警告无关的合理例外，不要求整个 Tao 只有一处 allow。

### 3. 拖放注册、读取与回调返回类型一起迁移

现有回调读取旧文件名数组后使用 `unwrap` 和 unchecked cast；仅替换注册常量不能保持数据形状正确。新的生产路径为：

1. Window 注册 `NSPasteboardTypeFileURL`。
2. 一个共享的薄读取器通过 `readObjectsForClasses:options:` 请求 NSURL，并启用只读 file URL 选项。
3. 检查返回对象类型与 file URL 条件，通过 `NSURL::to_file_path` 将每个候选转换为 `Option<PathBuf>`；不可读取、类型不符或转换失败的候选为 None，整体读取失败等价于空候选集。候选按原顺序交给生产纯策略统一过滤。不得将 URL 字符串直接当路径，不手工拼接或百分号解码，不检查或打开文件内容。
4. Enter、Prepare 和 Drop 每次读取当前 payload，不缓存上次 Hover 结果。纯策略跳过 None 并保留有效文件的顺序；零有效项不产生文件事件，并返回拒绝。
5. `draggingEntered:` 使用正确的 `NSDragOperation` 返回类型，有文件为 Copy，无文件为 None；Prepare/Perform 仍使用对应的原生 BOOL 接受/拒绝类型。将 `NSDragging` 显式加入 Tao 的 `objc2-app-kit` features，检查 Objective-C 注册签名；不能依靠 Wry 的 feature 合并掩盖缺项。

每个有效文件分别产生 `HoveredFile` 或 `DroppedFile`；Prepare 不发文件事件；每次 Exit 只发一个 `HoveredFileCancelled`，即使此前 Enter 已拒绝。Conclude 保留当前语义。异常 payload 由既有未检查失败改为拒绝/略过，是本次适配器稳健性修复，不新增产品权限或导入能力。

提取生产实际使用的最小纯 Rust 拖放策略到同目录私有 `file_drop.rs`：输入有序的 `Option<PathBuf>` 候选结果和阶段，过滤失败项，向事件 sink 逐项发送现有事件，并决定接受/拒绝。AppKit 读取和 NSURL 转换留在薄适配器中。混合 Some/None 测试验证生产共用过滤与事件策略，不证明原生对象识别或 NSURL 解码。避免为了测试另写一份生产不调用的事件模拟器。

### 4. 通过编译和真实策略验收，复用现有 Gate

扩展 `frame-aware-navigation-dependency-drift` 的 typed registry 步骤，保留原有版本/哈希只读检查，并加入以下维护检查：

- Tao 严格编译：`cargo rustc --locked --manifest-path src-tauri/Cargo.toml -p tao --lib -- -D warnings`。已分别通过应用反向依赖树和 `-p tao --depth 0` 核实当前两者的 Tao feature 集合均为 `dbus,rwh_06,x11`；仓库测试应检测 feature 或路径/版本漂移，不能默认以后仍然等价。Tao 不属于应用 workspace 的成员，不能在该选包命令上使用 `--features`；若将来 feature 集合不一致，维护检查应报错，不能悄悄放宽验收。
- 真实应用的普通 Cargo check/build 继续覆盖整个实际依赖图。严格 Tao 编译是补充；`-D warnings` 只传给选中的 Tao 目标，不全局影响其他依赖。无需 `cargo clean` 或启动 GUI。
- 以 `rustc --test` 编译并运行生产纯拖放策略，输出仅位于忽略的构建目录。覆盖多文件顺序、空结果拒绝、混合 Some/None 候选过滤、Prepare 不发事件、Exit 单次取消，以及已解析中文/空格/百分号路径的保留。
- 按 Tao 的两空格风格对所有涉及的 vendor Rust 文件执行 `rustfmt --edition 2021 --config tab_spaces=2 --check`，包括已有 `resizable.rs` 和新增 helper；不全量重排 vendor。根 Rust format check 不能替代这些独立 crate 的检查。
- 在现有 Rstest discovery 中扩展依赖维护和 registry 测试，覆盖生产读取接线、显式 feature、原生回调类型、本变更新增的字段级 lint 例外、平台消费者和禁止新增宽泛屏蔽，保留无关的上游已有例外。现有漂移篡改/缺文件/版本变更用例继续失败关闭，不用字符串检查替代策略执行或编译。

macOS 编译和原生适配相关步骤必须在 typed registry 显式声明 Darwin 平台；必要时给现有步骤构造器增加最小的平台覆盖参数，不依赖命令名推断平台。通用纯策略测试可跨宿主执行。保持 Gate 无提交产物写入、无新根脚本；原有跨能力 Gate 依赖不能引入环。

另外运行 `launcher-input-focus`、`frame-aware-webview-navigation-policy`、`plugin-child-webview-runtime` 及 `ci-lensx`，保留已有隔离、零通用 Tauri 权限命中、焦点与生命周期检查。

### 5. 审查源码后更新基线与双语文档

更新依赖检查器的 Tao 补丁清单、相应测试和 vendor 说明，覆盖实际修改的活动 Cargo manifest、现有源码以及新增私有策略模块；保留发行版原始元数据和许可证。先审查准确 diff，再执行已有 `pnpm run generate -- frame-aware-navigation-dependency-drift --write`，随后所有 Gate 只读比较新基线。

在 `docs/en/development/validation.md` 和对应中文文档中同步维护范围、严格编译、局部字段例外、原生数据安全失败与验证局限；不新增文档目录，不修改 onboarding 文件承载实现细节。现有 `skip_specs: true` 表示不变更稳定能力要求。

## Risks / Trade-offs

- [拖放返回值或对象类型错误] → 同步迁移三个读取阶段与注册，使用正确 NSDragOperation/BOOL 类型、显式 features、受检查转换及真实 macOS 编译。
- [格式清理覆盖焦点补丁] → 限制格式范围，单独审查 `window.rs` diff，保留 resizable 源码和已有确定性回归。
- [macOS dead_code 清理破坏其他平台] → 按实际平台分派设置 cfg，保留消费者；本机没有其他平台工具链时，只声明源级消费者检查，不宣称通过 Windows/Linux/BSD 编译。
- [局部例外变成宽泛屏蔽] → 本次只新增有解释的 RGBA 字段例外，严格编译与源策略检查共同约束，保留无关的上游已有例外。
- [扩展漂移 Gate 增加 macOS 编译成本] → 复用 Cargo 增量产物、registry 去重和已有构建目录；不引入重复根命令或强制清空缓存。
- [确定性检查不能证明系统交互] → 明确纯路径/事件测试不证明 NSURL 实际解码、Finder 类型匹配、AppKit 回调派发或输入法候选窗体验；这些不作为本变更的环境验收前提。

## Migration Plan

1. 按任务顺序维护 Tao 清理、弃用别名和完整拖放边界；保留隔离与 responder 补丁。
2. 接入真实策略测试、严格编译、格式和 registry 回归；扩展受审清单与维护文档。
3. 审查源码 diff 后显式生成基线，再运行聚焦 Gate 与完整 frontend/Rust 验证。
4. 若维护引入回归，回退本次 Tao 维护、其测试/registry/文档及对应完整性基线；保留原有五层依赖、隔离和 resizable 保护。没有用户数据迁移或公共契约迁移。
