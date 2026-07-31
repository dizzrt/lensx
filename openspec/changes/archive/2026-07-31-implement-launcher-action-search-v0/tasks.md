## 1. Action Search 领域契约

- [x] 1.1 在 `src/app/launcher/actions/` 中增加只读 `LauncherActionSearchInput`、冻结的可序列化 `LauncherActionSearchResult`、v0 结果上限和集中管理的评分常量，确保公开结果不包含 executor 或 Registry 内部状态。
- [x] 1.2 实现 query 的 NFKC、locale-aware 大小写折叠、Unicode 空白折叠和 token 化，并对空查询返回空结果。
- [x] 1.3 实现对已解析 title、description 和 `default_keywords` 的全部 token 匹配、固定权重评分、禁用 Action 过滤、score/action_id 确定性排序及先排序后截断。
- [x] 1.4 保持搜索函数无副作用并冻结返回数据，确认修改 query、snapshot、descriptor 或结果不会影响 Registry 或后续搜索。
- [x] 1.5 添加 Action Search 单元测试，覆盖 NFKC/大小写/空白等价、空查询、locale fallback、跨字段多 token、部分 token 排除、字段权重、平分、禁用项、结果上限、输入隔离和来源无关行为。

## 2. 默认 Action Service 与信任边界

- [x] 2.1 增加只创建一次的 production Launcher Action Service，复用 `desktopLauncherActions`、现有 Registry、Dispatcher 和 `lensx.core.hide_launcher` 注册，不在 React render 中重复构造服务。
- [x] 2.2 为 App Shell 增加可注入的 `LauncherActionService` 边界，使生产环境使用默认实例、测试使用隔离 Registry/Dispatcher，并保持现有 activation source 注入能力。
- [x] 2.3 添加边界测试，确认搜索只消费 descriptor snapshot、React 和搜索结果无法获取 executor，任意合法 owner 的已注册 Action 使用同一搜索路径，Manifest 或插件私有数据不会被搜索层直接读取。

## 3. Launcher 搜索界面与交互

- [x] 3.1 扩展英文 `en-US` 应用消息 Schema 和资源，增加结果数量、无结果、执行中、执行成功及三类 typed dispatch failure 文案，并同步语义一致的 `zh-CN` 资源与完整 key-set 校验。
- [x] 3.2 建立项目拥有的 Action 结果列表组件，复用 Semi Design `Input`/`Typography` 等视觉基础并落实 combobox/listbox、option、active descendant、selected state 和 live region 语义。
- [x] 3.3 使用 UnoCSS 完成简单布局与间距，使用 Less 实现有界滚动、结果行、hover/selected/pending 和 light/dark theme token 状态，不调用 Native resize。
- [x] 3.4 将 App Shell 的受控 query、当前 locale 和最新 Registry snapshot 接入统一搜索；空查询隐藏结果与空状态，非空查询展示最多 8 个真实结果或本地化无结果状态。
- [x] 3.5 实现首项默认选中、查询/结果变化重置、ArrowUp/ArrowDown 边界移动、Escape 清空并聚焦，以及在输入保持 DOM focus 时同步 active descendant。
- [x] 3.6 实现 Enter 与指针激活共用的 Dispatcher 路径、pending 重复执行保护、成功后清空状态，以及 typed failure 时保留 query/选中项并显示安全本地化反馈。
- [x] 3.7 扩展 Launcher activation 处理，在每次成功 show 后继续恢复输入焦点并从当前 query 和最新 snapshot 刷新结果，不自动填充、清除或执行 Action。
- [x] 3.8 添加 React 交互测试，覆盖真实 Hide Launcher 匹配、空/无结果、最多 8 项、键盘边界、Escape、指针与 Enter 同路径、重复执行保护、成功清空、三类失败恢复、activation 刷新、locale fallback、ARIA 关系和主题兼容。

## 4. 架构文档与范围核对

- [x] 4.1 更新 `docs/en/architecture/overview.md`，记录已实现的统一 Registry snapshot 搜索、确定性匹配/排序、App Shell 结果交互与 Dispatcher 执行，同时继续把历史、固定、动态 provider 和插件投影标为未实现。
- [x] 4.2 更新 `docs/en/architecture/extension-platform.md`，说明未来插件 Action 只有经 Host provider adapter 注册到同一 Registry 后才会自动使用统一搜索，并继续排除插件名称匹配和 `default_action_id` 提升。
- [x] 4.3 同步更新对应 `docs/zh/architecture/overview.md` 和 `docs/zh/architecture/extension-platform.md`，保持标题、术语、数据流、实现状态和相对链接与英文文档语义一致。
- [x] 4.4 核对源码、测试、稳定 specs 与双语文档对“已实现搜索”和“未实现插件投影”的描述一致，确认 README、Agent 指南和稳定文档没有临时材料引用。

## 5. 最终验证

- [x] 5.1 运行前端测试 `pnpm run test`，修复本 change 引入的全部测试失败、warning 和异步未处理错误后重新运行。
- [x] 5.2 运行前端格式和静态检查 `pnpm run check`，修复本 change 引入的全部错误与 warning 后重新运行。
- [x] 5.3 运行前端类型检查 `pnpm run typecheck` 与生产构建 `pnpm run build`，修复失败后重新运行两项。
- [x] 5.4 运行 Rust 格式检查 `pnpm run src-tauri:format:check`；本 change 不修改 Rust 行为，但必须确认前端集成没有伴随未格式化的 Native 改动，必要时执行 `pnpm run src-tauri:format` 后重新检查。
- [x] 5.5 运行 Rust 测试 `pnpm run src-tauri:test` 与静态检查 `pnpm run src-tauri:check`；本 change 不新增 Tauri command 或 Rust 搜索逻辑，但必须完成 Native 回归验证。
- [x] 5.6 重新运行 `pnpm run check:plugin-contract`、全部前端与 Rust 最终验证命令，并执行 `openspec validate implement-launcher-action-search-v0 --strict --no-interactive`；修复任何新错误或 warning 后重新运行失败项和完整最终验证集。
