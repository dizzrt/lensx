# Tasks

以下任务按顺序实施，并依据实现和确定性验证证据更新完成状态。

## 1. 跨语言搜索领域逻辑

- [x] 1.1 将查询和搜索文本规范化改为不依赖界面语言的 NFKC、小写转换和空白处理，调整 helper 的必要调用签名；在 `tests/launcher-action-search.test.ts` 验证大小写、全角、Unicode 空白、空查询及两种界面语言的等价结果。
- [x] 1.2 从描述符完整语言映射提取独立的标题和关键词集合，排除描述及其他元数据；补测双向语言查询、跨语言多词 AND、缺失中文、空关键词不遮蔽另一语言，以及跨字段拼接不产生虚假命中。
- [x] 1.3 实现每词最佳分与完整查询标题最佳奖励只计一次，移除描述的 100 分分支并保留其他权重、同分 ID 排序、禁用过滤和八项截断；调整旧的描述命中断言，以数值测试证明跨语言/NFKC 等价副本不加分、描述增删不改变结果。
- [x] 1.4 更新 `docs/en/architecture/overview.md` 及 `docs/zh/architecture/overview.md` 的 Launcher Action Search 说明；核对它们与领域测试共同表达全语言标题/关键词、展示回退和描述排除，而非当前语言搜索。

## 2. 展示与插件统一搜索集成

- [x] 2.1 保留现有展示解析器及英文回退，完成 App 对独立规范化 helper 的必要接入；在 `tests/launcher-action-search-ui.test.tsx` 验证同查询切换语言后的 Action ID/次序不变、标题按界面语言显示、缺失中文时回退英文，以及描述独占查询的本地化空结果。
- [x] 2.2 在搜索边界、插件 mapper/projection 现有测试中验证完整多语言元数据保留、描述仅作为展示字段、Host 与插件 Action 使用相同分数/排序、失效提供者撤销后不再返回；通过测试证明无须修改 Manifest、SDK、Rust 或用户数据格式。
- [x] 2.3 保留并运行受影响的键盘、焦点、明暗主题、IME 草稿/提交及执行失败恢复用例，确认新搜索仍只消费已提交查询且不改变原生窗口或插件 Runtime；不得为本变更新增浏览器、WebView 或 GUI 验证。
- [x] 2.4 更新 `docs/en/architecture/extension-platform.md`、`docs/en/plugin-development/public-packages.md` 及各自同路径中文镜像，明确插件 Action 搜索只使用全部受支持语言的标题/关键词、描述保留但不可搜索、跨语言重复命中不叠加分数；检查示例、字段含义、相对链接和双语语义一致，新增页面或索引改动不在计划范围。

## 3. 最终验证

- [x] 3.1 执行稳定 focused Gates：`pnpm run gate -- plugin-action-projection` 和 `pnpm run gate -- launcher-input-focus`；分别记录领域/插件统一搜索及输入/IME 回归结果，不能以此替代完整生命周期。
  - 结果：`plugin-action-projection` 的 83 项前端测试通过；`launcher-input-focus` 的 139 项前端测试及 Rust/原生策略检查通过。导航测试的旧描述命中断言已按新契约修正，完整 Gate 复验通过。
- [x] 3.2 执行完整前端与工作区验证：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`；确认测试、类型、格式/静态检查及构建均无本变更新增警告或错误。
  - 结果：工作区 917 项测试、类型检查、格式/静态检查及生产构建全部通过，无新增警告或错误。
- [x] 3.3 执行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check` 和 `pnpm run src-tauri:build`；Rust/Tauri 实现和序列化边界没有变化，本项验证跨层无回归，不要求编造未改变原生逻辑的新测试。
  - 结果：Rust 231 项测试、格式检查、静态检查及构建通过。保留的 18 条 Tao 警告来自与 HEAD 字节一致的 vendored 文件，本变更未修改 Rust、Cargo 或 vendor。
- [x] 3.4 按仓库 clean-checkout-equivalent 要求复现 `pnpm run gate -- ci-lensx` 与 `pnpm run gate -- ci-plugins`，确认公共依赖准备及实际消费者验证不依赖残留产物；所有阶段继续遵守确定性验证边界。
  - 结果：每个 CI 入口执行前分别清除十处已忽略的 `dist` 输出；两项 Gate 均通过，公共依赖由 Gate 重新准备，Plugins CI 的纯 Node 产物检查通过。
- [x] 3.5 执行 `openspec validate enable-cross-language-action-search --strict --no-interactive`，并核对两份 delta 与 proposal/design/tasks 一致；检查全量规格严格校验基线，将既有问题和本次引入的问题分别记录，当前变更不得新增校验警告或错误。
  - 结果：当前变更严格校验通过，无问题。全量稳定规格仍因 42 份规格中的 257 条既有需求文本过长 WARNING 未通过严格模式，ERROR 为零；稳定规格未修改，本次未引入新问题。
- [x] 3.6 扫描根 manifest、CI、维护文档和规格，确认未新增 Change 专属根命令、转发别名、直接测试文件列表脚本、递归校验或已移除分发器引用；执行 `git diff --check` 并检查修改范围，无额外公共协议、支持语言、插件关键词或无关稳定化改动。后续同步/归档前同样复核这些边界，并将进入稳定规格的文本转换为英文。
- [x] 3.7 修复所有本变更新增警告和错误，重新运行失败命令及完整最终验证集；交付时明确已通过的确定性验证与任何既有未解决问题，不把逻辑测试或编译描述为真实桌面、隔离或性能验收。

### 归档前复核（2026-10-17）

- 已将两份 delta 的 4 条修改需求及 2 条新增需求转换为英文并同步至稳定规格；逐项比对确认所有场景已落实，无剩余同步操作，原有标题、Purpose 和未涉及的需求及场景保持不变。
- 本轮重新执行 `plugin-action-projection` Gate（83 项测试）、`launcher-input-focus` Gate（139 项前端及 79 项 Rust/纯策略测试执行）、工作区 `typecheck` 和 `check`，全部通过。`check` 在规格与文档最终写入后再次通过；完整工作区测试、构建、Rust 生命周期及两项 clean-checkout-equivalent CI Gate 的实施阶段结果见 3.2–3.4，本轮未重复执行这些完整入口。
- 当前变更严格校验通过。同步后 42 份稳定规格普通校验全部通过；严格校验仍有 257 条既有需求文本过长 WARNING、零 ERROR，与同步前的问题集合完全一致，无新增问题。变更校验的“ADDED 已存在”INFO 来自已完成的稳定规格同步，目录归档不重复应用 delta。
- Cargo 仍输出 18 条既有 vendored Tao 警告，本轮未改变 Rust、Cargo 或 vendor。所有验证均为确定性检查，不代表真实桌面、WebView、原生隔离或性能验收。
- 复核根 manifest、CI、维护文档、稳定规格及当前变更的命令引用，未发现失效 Gate/Generate ID、Change 专属根命令或被禁止的验证入口。修正 `docs/en/development/plugin-workspace.md` 及中文镜像中残留的 Evidence dispatcher 说明，使其与当前仅允许 Generate 显式写入派生产物的规则一致。
- 文档树中英文路径对应，93 份 Markdown 的 99 个相对链接在预定归档位置均可解析；`git diff --check` 通过。
