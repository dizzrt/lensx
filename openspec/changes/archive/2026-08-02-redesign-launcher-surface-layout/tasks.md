## 1. 扩展 Launcher Action 展示契约

- [x] 1.1 在 Launcher Action 类型中增加可选 Host icon token，扩展未知输入验证、diagnostic、clone、lookup 与 immutable snapshot，保持 executor 隔离和旧 descriptor 兼容。
- [x] 1.2 为现有 Host built-in Actions 配置受支持 icon token，并实现 token 到现有图标组件的 Host resolver 与通用 Action 回退图标；不得按 `action_id` 在组件内硬编码分支。
- [x] 1.3 让 Action Search result 安全携带可选 icon 元数据，同时保持现有匹配、评分、排序与最近使用/固定状态完全无关。
- [x] 1.4 扩展 Action validation、Registry boundary 与 search 测试，覆盖有效/无 icon、非法 kind/token/字段、clone 隔离、回退图标和搜索排序不变。

## 2. 实现 Rust Action collections 持久化边界

- [x] 2.1 定义版本化 `LauncherActionCollections` Rust 模型、八项上限、Action ID/唯一性验证，以及 MRU 记录、固定与取消固定的纯逻辑。
- [x] 2.2 实现独立集合文件的缺失默认值、严格读取和临时文件同步/原子替换写入，并返回不泄露路径、文件内容或内部异常的稳定错误 payload。
- [x] 2.3 增加并注册类型化 Tauri 命令，用于读取完整快照、记录成功使用和设置固定状态；命令只处理 ID 集合，不复制前端 Registry 或 executor。
- [x] 2.4 增加 Rust 单元测试，覆盖缺失文件、有效 round trip、重复/非法/超限/不支持版本、MRU 去重截断、固定顺序、满容量拒绝、原子写入失败与安全序列化错误。

## 3. 接入前端 Action collections 服务

- [x] 3.1 建立类型化前端 collections client、Tauri error payload 校验和安全默认值；启动读取失败时使用空集合并保留可本地化诊断状态。
- [x] 3.2 实现集合 ID 到当前 Registry snapshot 的只读解析，保持持久化顺序，过滤缺失/禁用 Action，且不得用 Registry 默认顺序或模拟数据补齐。
- [x] 3.3 在 Dispatcher 成功后记录最近使用并刷新快照；确保 dispatch 失败不写入，集合写入失败不改写已成功 Action 的结果且不会阻断后续输入。
- [x] 3.4 实现固定/取消固定调用、optimistic 状态边界与已确认快照恢复，满八项或写入失败时保留原集合并提供稳定前端反馈。
- [x] 3.5 增加 collections client 与 App 集成测试，覆盖启动成功/失败、真实 Action 解析、失效 ID 过滤保留、成功/失败 dispatch、写入失败恢复和固定容量。

## 4. 构建统一顶部区域与首页双集合

- [x] 4.1 扩展 `en-US`、`zh-CN` JSON 资源、message schema 与 key-set 测试，加入最近使用、已固定、全部、搜索结果、集合空状态、固定/取消固定、容量和持久化反馈文案。
- [x] 4.2 提取可复用 Action tile 组合，分别提供主 Action button 与同级固定 icon button，复用 Host icon resolver，并保证标题、tooltip、focus 与 disabled/pending 语义完整。
- [x] 4.3 实现 home 的“最近使用”第一行和“已固定”第二行，分别渲染最多八个真实 tile 或本地化空状态，并使用 UnoCSS 组织简单布局。
- [x] 4.4 在统一顶部行最右侧增加非交互圆形 avatar 占位，并在“已固定”标题右侧增加无 chevron、hover、pointer、focus、button/link/menu 语义的“全部”占位。
- [x] 4.5 使用 Less 实现无明显内部边框的 surface、集合、tile、hover、focus、pending 与 light/dark theme 状态，移除首页虚线占位、强分割线和脚手架式视觉。
- [x] 4.6 增加首页 UI 测试，覆盖两行顺序、真实/空集合、Action 激活、固定/取消固定分离、键盘焦点、双语、主题，以及 avatar/“全部”不存在交互角色。

## 5. 将搜索结果改为单一四列网格

- [x] 5.1 将现有纵向结果组件替换为带唯一“搜索结果”标题的四列 listbox/option tile grid，最多显示八项，并显示有效 icon 或通用回退图标。
- [x] 5.2 扩展输入键盘逻辑：左右键相邻移动、上下键按四列移动且缺失目标时保持选择，继续支持 Enter、Escape、pending 防重复与 `aria-activedescendant`。
- [x] 5.3 调整搜索状态展示，使无结果/错误保持可见且本地化，普通 count/success/pending 通过 live region 提供而不形成第二个视觉结果分区。
- [x] 5.4 使用 UnoCSS 与 Less 完成固定网格、选中、hover、pending、focus-visible 和 theme 样式，移除结果容器外框与逐项 divider，且不测量 DOM 或改变 Native 高度。
- [x] 5.5 更新搜索 UI 测试，覆盖四列八项、唯一分区标题、二维边界导航、pointer/keyboard 同一 dispatch path、无结果、live region、双语、主题和 icon fallback。

## 6. 统一 page context 与 App Shell 组合

- [x] 6.1 增加窄 `PageContextResolver`，从 `ActivePage` ID、Host 所属方资源、Registry Action metadata 与页面本地化 fallback 派生当前 locale 的“所属方 / Action”上下文，不把显示字符串写入 `ActivePage`。
- [x] 6.2 用同形 page-context bar 替换当前独立设置标题/打开来源描述/文本关闭按钮，提供 accessible close icon button，保留 avatar 占位、PageErrorBoundary 和设置正文。
- [x] 6.3 重组 `App.tsx` 的统一顶部槽位与三态内容，删除产品标题、介绍文本及其 aria 关联，保持 page 优先、关闭返回 home、查询清理和输入焦点恢复。
- [x] 6.4 更新 Host settings 与 App Shell 测试，覆盖打开/关闭设置、上下文所属方和 Action 名称、运行时 locale 切换、Action 缺失 fallback、页面失败仍可关闭，以及 avatar 始终非交互。

## 7. 调整固定窗口尺寸并同步双语文档

- [x] 7.1 将 Tauri 初始高度和 Rust `home` 固定高度从 240px 调整为 320px，保持 650px 宽度、480px search、600px page、min/max、不可缩放与 typed mode 边界不变，并更新 Rust/前端 surface 测试。
- [x] 7.2 更新 `docs/en/architecture/overview.md`、`docs/en/architecture/extension-platform.md` 与 `docs/en/development/frontend-guidelines.md`，说明统一顶部骨架、Action collections、Host icon token、四列搜索和固定尺寸边界。
- [x] 7.3 同步更新对应 `docs/zh/` 镜像并保持两个语言索引无需变更；确认文档明确 avatar/“全部”仅为占位、插件 Action/icon 投影仍未实现。

## 8. 最终验证

- [x] 8.1 运行 `pnpm run format` 与 `pnpm run src-tauri:format`，检查格式化只影响本 change 范围；随后运行 `pnpm run check` 与 `pnpm run src-tauri:format:check` 验证前端格式/静态规则和 Rust 格式。
- [x] 8.2 运行 `pnpm run test`，覆盖 frontend domain、i18n schema/key-set、React interaction 与 boundary tests。
- [x] 8.3 运行 `pnpm run typecheck` 与 `pnpm run build`，修复 TypeScript、Rsbuild/Rspack 和生产构建错误或警告。
- [x] 8.4 运行 `pnpm run src-tauri:test` 与 `pnpm run src-tauri:check`，验证 Rust collections、Tauri command、window size 和静态检查。
- [x] 8.5 运行 `openspec validate redesign-launcher-surface-layout --type change`；修复本变更引入的每个 warning/error，重跑失败命令，并再次完整执行 8.1–8.5 的最终验证集。
- [x] 8.6 移除 Launcher 搜索输入聚焦时的蓝色内描边，保留输入焦点、caret、自动聚焦和键盘搜索行为，并重新运行受影响的前端检查、测试与构建。
