## 1. Action descriptor 与验证边界

- [x] 1.1 在 `src/app/launcher/actions/**` 建立不依赖 React、Semi Design 或 Tauri API 的领域模块，定义 readonly `LauncherActionDescriptor`、localized text、keyword map、structured diagnostic、registration、executor 和 dispatch result 类型，公开字段使用 snake_case。
- [x] 1.2 实现 owner/action namespaced ID 校验：owner 至少两个 segment，action 必须为完整 owner 加一个 local segment，segment 字符/起始字符、64 字符 segment 上限和 255 字符完整上限均按设计执行。
- [x] 1.3 实现接收 `unknown` 的 descriptor validation/normalization，拒绝未知字段、非法类型、不可序列化值、owner 不一致、缺失英文文本、空关键词和 locale-aware 重复关键词，并按 JSON Pointer path、code 稳定排序诊断。
- [x] 1.4 实现 localized text 解析与 `en-US` 回退，确保规范化只 trim 文本/关键词并返回新的 plain-data readonly 副本，不静默修改 ID、owner 或重复关键词。
- [x] 1.5 添加 Rstest 领域测试，覆盖最小/完整合法 descriptor、ID 与 owner 边界、长度限制、未知字段、非 plain-data 输入、本地化回退、关键词规范化/重复和多诊断稳定顺序。

## 2. Host registry 与 dispatcher

- [x] 2.1 实现 Host-owned registry 的单个与批量注册；在 commit 前完成全部 descriptor、existing duplicate 和 batch duplicate 校验，保证失败批次不留下部分状态。
- [x] 2.2 实现按 ID 查询和按 `action_id` 升序的 deep-readonly snapshot，使 registry 与 caller 原始输入、查询结果和 snapshot 断开可变引用，且公开数据不包含 executor。
- [x] 2.3 实现统一 dispatcher，在执行时重新解析 registration 和 enabled 状态，每次至多调用 executor 一次，并以 discriminated union 返回 success、`action_not_found`、`action_unavailable` 或 `action_execution_failed`。
- [x] 2.4 对 executor throw、reject 和无效返回进行隔离，保证公开失败结果不包含 exception stack、React/Tauri/Rust 对象或其他内部实现细节。
- [x] 2.5 添加 registry/dispatcher Rstest 测试，覆盖原子批量注册、现有与批内重复、确定性顺序、不可变隔离、未知查询、success、disabled、unknown、executor failure 和单次执行语义。

## 3. 内建 action 与 Rust 特权边界

- [x] 3.1 为 `lensx.core.hide_launcher` 在 canonical English 和 Simplified Chinese message resources 中增加语义对齐的 title/description，更新共享 message schema，并在内建 source 中从 locale resources 构造合法 descriptor 和本地化 default keywords。
- [x] 3.2 定义 `LauncherDesktopActions` typed interface、内建 hide executor 和 `createDefaultLauncherActionService(desktopAdapter)` composition factory，创建 registry/dispatcher 并原子注册默认 action；当前 React App 不消费 snapshot 或渲染结果。
- [x] 3.3 在 Rust 中新增最小 `hide_launcher` Tauri command，从 managed `LauncherWindowActions` 路由到既有 `LauncherWindowAction::Hide`，并把失败映射为包含稳定 code、action、operation、message 的 snake_case 可序列化错误；不得直接复制 window hide 操作。
- [x] 3.4 将 `hide_launcher` 注册到 invoke handler，建立隔离的 TypeScript Tauri desktop adapter，并对成功返回及 unknown/invalid Rust error payload 做明确映射，使 dispatcher 最终得到统一 execution success/failure。
- [x] 3.5 添加 Rust 测试覆盖 command 到统一 Hide 动作的路由和结构化失败字段；添加 TypeScript adapter/default service 测试覆盖默认 descriptor、message-derived metadata、registry → dispatcher → fake desktop adapter 完整路径、invoke 成功/失败和当前 App Shell 不自动显示 action。

## 4. 架构文档与双语镜像

- [x] 4.1 在实现和测试完成后更新 `docs/en/architecture/overview.md`，准确描述 action core 的 TypeScript application/domain 所有权、descriptor/executor 分离、registry/dispatcher、typed Rust 边界和当前仍无搜索 UI的限制。
- [x] 4.2 更新 `docs/en/architecture/extension-platform.md`，说明未来内建模块与外部插件只能通过受验证 provider adapter 向 Host registry 投影 descriptor，不能控制 executor 或绕过 Host dispatcher。
- [x] 4.3 同步更新 `docs/zh/architecture/overview.md` 与 `docs/zh/architecture/extension-platform.md`，保持相同路径、结构和语义；确认两个语言索引和相对链接有效，正式文档不引用临时材料。

## 5. 最终验证

- [x] 5.1 运行全部 action descriptor、registry、dispatcher、default service、desktop adapter 和现有 App/locale focused tests，确认当前 UI 仍只显示本地输入且不出现 action 结果。
- [x] 5.2 运行 `pnpm run test`、`pnpm run typecheck`、`pnpm run check` 和 `pnpm run build`，修复本 change 引入的前端测试、类型、格式、静态检查、warning 和生产构建问题。
- [x] 5.3 运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 和 `pnpm run src-tauri:check`，修复本 change 引入的 Rust 格式、测试、静态检查、warning 和编译问题。
- [x] 5.4 验证 TypeScript adapter 与 Rust command 的 method/error payload 一致、默认 registry 只含真实内建 action、executor 未进入任何 snapshot，并确认本 change 未新增运行时依赖、组件库或不必要 capability 权限。
- [x] 5.5 验证 English/简体中文文档镜像、相对链接、OpenSpec artifacts 一致性和无临时材料引用，并运行 `openspec validate define-launcher-action-core --type change --strict --no-interactive`。
- [x] 5.6 若任一验证失败，修复失败及本 change 引入的全部 warning/error，重新运行对应失败命令，再完整重跑 5.1–5.5 的最终验证集合并记录仍存在的限制。
