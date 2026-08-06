## 1. Workspace 与模板骨架

- [x] 1.1 在 `examples/plugins/framework-neutral` 和 `examples/plugins/react-semi` 建立两个私有直接 workspace member，配置各自的 `build`、`typecheck`、`test`、`check`，并为 React 模板增加独立的 visual script。
- [x] 1.2 让模板对 lensX 公共 package 使用当前 `0.1` 线的普通 SemVer 而非 `workspace:`/`file:`/`link:`，在根 workspace 显式启用匹配版本 linking，并使用机器全局 pnpm store 更新 lockfile；不得从仓库根传入 `--store-dir` 或使用仓库本地 store。
- [x] 1.3 扩展 workspace lifecycle 与 boundary 测试，证明两套模板被根级命令发现、普通 SemVer 在仓库内解析到当前公共 workspace package、四个 lifecycle script 齐全，且 Host/Tauri/private/deep/cross-member imports 与反向依赖保持被拒绝。

## 2. Framework-neutral 模板

- [x] 2.1 添加一个 Contract-valid、无 requested permissions 的 framework-neutral Manifest，贡献一个 Page、一个指向该 Page 的 Action 和自包含 iframe entry，并让构建产物包含 `manifest.json`、`index.html` 与全部 package-local 资源。
- [x] 2.2 使用 `@lensx/plugin-sdk/iframe` 和实例化 SDK client 实现 framework-neutral Runtime controller，覆盖 loading、ready、bounded error、显式 retry、完整 context replacement、英中 locale、light/dark document 适配与统一幂等 cleanup。
- [x] 2.3 添加 framework-neutral 模板测试：使用真实 Contract 校验实际 Manifest，使用真实 SDK 加 Testkit semantic transport 覆盖成功、失败、断开、retry、context replacement、迟到回调和重复 dispose，并断言其 dependency/bundle 不含 React、React DOM、Semi Design 或 Plugin UI。
- [x] 2.4 添加 framework-neutral DOM 可访问性测试，验证 loading/error/ready 语义、键盘 retry、焦点可见性、英语默认回退和简体中文切换，不引入 Host 私有 UI 或样式。

## 3. React/Semi 模板

- [x] 3.1 添加一个独立 plugin ID、Contract-valid、无 requested permissions 的 React/Semi Manifest、Page、Action、iframe entry 与自包含 Rsbuild bundle，确保 React、React DOM、Semi Design 和 Plugin UI Runtime 由插件拥有。
- [x] 3.2 使用真实 SDK iframe transport、`PluginUiProvider`、`PluginPage`、`PluginFeedback` 与 Semi Design 控件实现 React Runtime composition，覆盖 loading、ready、bounded error、显式 retry、context replacement、英中 locale、light/dark 和 unmount cleanup。
- [x] 3.3 添加 React 模板的 Contract、SDK/Testkit lifecycle 与 Testing Library 测试，覆盖有效 Manifest、初始化失败/重试、context replacement、断开、迟到回调、键盘操作、焦点恢复、live region 和幂等 unmount/dispose。
- [x] 3.4 建立 React 模板固定插件视口的 visual gate，覆盖 `en-US`/`zh-CN`、light/dark、loading/error/ready、长文本、焦点可见性和公共 Plugin UI semantic token computed styles，并保存和审核稳定截图基线。

## 4. 仓库外消费与公共边界门禁

- [x] 4.1 新增模板 external-project 验证脚本：构建并打包真实 Contract、SDK、Testkit 和 UI tarball，把每套模板复制到系统临时目录，并仅通过临时 consumer 自有 overrides 将普通 SemVer 指向这些 tarball，不改写模板源码。
- [x] 4.2 在每个临时 consumer 内使用机器配置的全局 pnpm store 执行离线、无 lifecycle side effect 的依赖安装，再运行模板 `test`、`typecheck`、`build` 和 `check`；清理临时目录且不得修改仓库根 `node_modules` 或 store metadata。
- [x] 4.3 审计临时 consumer 的 manifest、resolved dependencies、symlink、bundle module graph 和输出文件，拒绝 `workspace:`/`file:`/`link:`、绝对/仓库相对依赖、root `node_modules` 回链、Host/Tauri/private/deep imports，以及 framework-neutral 模板中的 React/UI 依赖。
- [x] 4.4 为 external-project gate 增加成功与失败 fixture 测试，使依赖回链、未导出子路径、Host 私有 import、Tauri import、提前暴露 private packer 和缺失 lifecycle script 产生稳定诊断。

## 5. Canonical package 验证

- [x] 5.1 从每套临时模板的 `dist/` 收集 `manifest.json` 与普通构建资源，使用仓库 Host 私有 reference packer 生成两次临时 `.lxp`，断言 byte-for-byte 可重复并由 TypeScript inspector 判定为 compatible、资源完整且 checksum 全覆盖。
- [x] 5.2 增加 Rust package/installer 测试入口消费同一临时 `.lxp` bytes，证明 Host inspector 与受控安装边界接受两套模板产物并保持与 TypeScript 相同的 Manifest、资源、digest 和兼容性结论；测试后清理 Host 临时目录。
- [x] 5.3 增加模板 package negative coverage，证明缺失/额外 Manifest resource、非法 Page/Action target、非 canonical payload、权限或 Host-owned facts 注入会在进入 Runtime 前失败。
- [x] 5.4 保持 packer 仅由根级验证调用：模板 package metadata、scripts、源码、声明和 bundle 不得导入 `tools/**` 或声明公共 `pack` 命令，并用边界测试锁定 Task 6.4 的职责。

## 6. 生产边界 Runtime smoke

- [x] 6.1 建立可确定的 template production-component harness，从两套已打包模板的真实 Manifest/entry facts 经过当前 Registration、Page/Action projection、resource service 和 Runtime resolver，禁止使用手写替代 Manifest 或 Testkit fixture 作为模板输入。
- [x] 6.2 让 framework-neutral 产物通过当前 Runtime Session、真实公共 SDK iframe transport、Host transport adapter、RPC validation 和 Dispatcher 完成 `runtime.get_context` 初始化，并验证返回值来自当前 Host facts 而不是 FakePluginSdkTransport。
- [x] 6.3 让 React/Semi 产物通过相同生产链，证明 Host 不注入 React、Semi、Host Context、私有样式或官方来源特权，并验证其资源仍受现有 CSP/custom-protocol 前置约束。
- [x] 6.4 对两套产物验证关闭、disconnect、retry replacement 和重复 cleanup 后无 current Session、Port、pending request、subscription、Runtime attempt 或 Page resource 残留，且旧回调不能影响新尝试。
- [x] 6.5 增加专用边界检查，若 production smoke 导入 Testkit/FakePluginSdkTransport、绕过 production Dispatcher/RPC adapter，或声称是完整桌面 GUI E2E，则以稳定诊断失败。
- [x] 6.6 在根 `package.json` 增加 `check:plugin-project-template` 聚合入口，按顺序执行模板成员检查、external-project、package、production Runtime 和 visual gates，并把相关 fixture/test 纳入维护的根级验证路径。

## 7. 双语文档与路线图准备

- [x] 7.1 新增 canonical `docs/en/development/plugin-project-template.md`，说明模板选择、结构、公共依赖、Manifest/Page/Action/Runtime 生命周期、命令、隔离验证、无权限边界，以及当前尚无公共 CLI/Development Mode；同步更新 English index 和 Plugin Workspace 交叉链接。
- [x] 7.2 在相同相对路径新增语义对齐的 `docs/zh/development/plugin-project-template.md`，同步更新 Simplified Chinese index 和 Plugin Workspace 镜像，保持命令、标识符、限制和标题结构一致。
- [x] 7.3 增加或运行文档镜像/链接检查，确认两种语言没有把 Testkit fake、Host 私有 packer、production-component smoke 或仓库模板目录描述成已发布 CLI、完整 GUI E2E 或权限教程。

## 8. 最终验证

- [x] 8.1 顺序运行 `pnpm run check:plugin-project-template` 及其 focused external/package/Runtime/visual 子门禁，审核两套模板的隔离安装输出、`.lxp` digest、截图和 computed-style 证据。
- [x] 8.2 运行完整 frontend tests：`pnpm run test`，确认根应用、全部公共 package 和两套模板均被 workspace lifecycle 覆盖。
- [x] 8.3 运行 frontend formatting/static checks：先执行 `pnpm run format`，再执行 `pnpm run check`，确认没有新增 Biome、workspace boundary、文档或 package diagnostic。
- [x] 8.4 运行 frontend type checking 与 build：`pnpm run typecheck`、`pnpm run build`，确认两套模板在依赖顺序中通过且生成自包含 payload。
- [x] 8.5 运行 Rust formatting：`pnpm run src-tauri:format:check`，确认新增 template package/installer smoke 没有格式 drift。
- [x] 8.6 运行完整 Rust tests 与 static checks：`pnpm run src-tauri:test`、`pnpm run src-tauri:check`，确认 package inspection/installation 和既有 Runtime 安全边界保持通过。
- [x] 8.7 修复本 change 引入的每个 warning、error、visual drift 或不稳定结果，重新运行对应失败命令，然后按 8.1–8.6 的顺序重新运行完整最终验证集。
- [x] 8.8 运行 `openspec validate create-plugin-project-template --type change` 和 `git diff --check`，逐项核对 proposal、design、delta spec、实现、双语文档与任务勾选一致。
- [x] 8.9 仅在 8.1–8.8 全部通过后，将 `plugin-roadmap.md` 的 Task 6.3 标记完成，并再次运行 `git diff --check -- plugin-roadmap.md` 与 `openspec validate create-plugin-project-template --type change`。
