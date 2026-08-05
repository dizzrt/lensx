## 1. Host API Schema 与生成类型

- [x] 1.1 在 `@lensx/plugin-contract` 中建立 Host API `0.1.0` Draft 2020-12 Schema 入口，定义十个 method 的 exact params/result、`runtime.context_changed` event、闭集 permission/error 和共享 `PluginRuntimeContext`，同时明确排除外链、私有 RPC envelope 与插件自报身份字段。
- [x] 1.2 扩展确定性生成流程，从 Host API Schema 生成并提交 TypeScript input 类型；加入 byte-identical drift 检查，且不削弱现有 Manifest 类型生成与门禁。
- [x] 1.3 实现只读 method/permission catalog、规范输出类型和接受 `unknown` 的纯 validator，保证 method-payload 配对、JSON Pointer 诊断排序、输入不变与深度冻结语义可独立验证。

## 2. 方法语义与 Contract 测试

- [x] 2.1 为 `runtime.get_context` 和 `runtime.context_changed` 增加 valid/invalid fixtures 与测试，覆盖空 capability、已排序 method ID、unknown/duplicate/unsorted capability、额外可信字段和完整 Context replacement。
- [x] 2.2 为 `ui.close` 与 `actions.open` 增加 fixtures 与测试，覆盖 exact empty params、acknowledgement result、local Action ID、global/core/cross-plugin target、未知字段和 Host executor/identity 注入。
- [x] 2.3 为五个 storage method 增加 fixtures 与测试，覆盖 JSON-compatible value、missing key、delete boolean、稳定 key pagination、opaque cursor、quota safe integer、namespace/path 注入和非 JSON 值。
- [x] 2.4 为 `clipboard.read` / `clipboard.write` 增加 fixtures 与测试，覆盖独立 permission mapping、空文本、错误 method-payload 配对、未授权/不可用错误和不存在的外链占位能力。
- [x] 2.5 增加 error/version/catalog 测试，覆盖全部稳定错误码、安全有界 message、十个 entry 的闭集与排序、package/Manifest/Host API/app 独立版本、capability discovery 和 pre-1.0 breaking/deprecation 规则。

## 3. SDK 单一 Context 与错误边界

- [x] 3.1 让 `@lensx/plugin-sdk` 的 `PluginRuntimeContext` shape、Runtime 校验和 Host API version 消费 `@lensx/plugin-contract` 公共事实，同时保持现有 SDK root export、Context 字段和 no-DOM 生命周期行为兼容。
- [x] 3.2 更新 SDK Context/lifecycle/type tests，证明初始化接受空或当前已知 method capability、拒绝 unknown/duplicate/unsorted capability，复制冻结共享 Contract 输出且失败后不污染 client state。
- [x] 3.3 保持 SDK lifecycle error 与 Contract Host API error 可判别，增加 public API/boundary tests 证明 `PluginSdkClient` 仍没有 raw string method、具体 Host API 方法、RPC envelope、MessagePort、identity 或 Host-private export。
- [x] 3.4 更新 `@lensx/plugin-testkit` 的 Context fixtures、fake transport 与隔离 consumer，使其使用共享 Contract method IDs 并覆盖有效/无效 Context，同时明确不实现真实 Host API、permission harness 或 iframe wire。

## 4. Rust 共享 Fixture 与 Host 边界

- [x] 4.1 在 Rust 测试边界消费 package-owned Host API Schema/valid/invalid fixtures，建立与 TypeScript 一致的 method-payload、Context、event、permission、error validity 和稳定 diagnostic code/path 断言。
- [x] 4.2 增加负向 Host 边界测试，证明本 change 没有注册 Tauri command、Dispatcher、clipboard/storage handler、RPC/request ID、permission decision 或公开 Runtime Session identity。
- [x] 4.3 将 Rust Host API fixture gate 接入 focused Contract check，并确认现有 Manifest/Registration/Runtime Session fixture 与测试继续通过且没有第二份 Host-owned public Contract。

## 5. 发布产物与工作区门禁

- [x] 5.1 更新 `@lensx/plugin-contract` 的受限 exports、files 和 build 输出，使真实 tarball 包含所需 Runtime JavaScript、declarations 与 Host API Schema entry，并排除 tests、fixtures、生成脚本和 Host-private source。
- [x] 5.2 扩展 Contract tarball no-DOM consumer，验证版本、catalog、所有 semantic validator 与生成类型可从仓库外使用；增加 deep-import、缺失 artifact 和私有材料泄漏的失败检查。
- [x] 5.3 扩展 SDK/Testkit tarball 与 workspace boundary gate，验证共享 Contract 依赖方向仍为 Contract → SDK → Testkit，且 public declarations 不泄露 React、Semi、DOM、Tauri、Rust、Host executor 或私有 wire 类型。
- [x] 5.4 新增或更新聚合 `check:plugin-host-api-contract` / `check:plugin-contract` 脚本，将生成 drift、package tests、SDK/Testkit 边界、Rust shared fixtures、真实 tarball consumer 和现有 Manifest Contract 门禁按确定顺序组合，并接入 root lifecycle。

## 6. 维护文档

- [x] 6.1 更新 `docs/en/architecture/extension-platform.md` 与 `docs/en/development/plugin-workspace.md`，说明 Host API v1 catalog、Context/capability、permission/error/version、Contract/SDK 所有权和独立验证边界，并明确真实 transport、dispatch、storage、permission enforcement 与 RPC limits 仍未交付。
- [x] 6.2 同步更新同路径 `docs/zh` 简体中文镜像，逐段核对方法名、版本、能力与 non-goal 语义；本 change 不新增 UI、产品文案、主题或可访问性交互，因此不需要新增 locale key 或视觉验收。
- [x] 6.3 更新相关 package API 注释和开发者示例，使示例只展示 Contract 校验与 capability 分支，不声称插件已经能调用 Host API，也不把具体架构设计写入根 README 或 agent onboarding 文件。

## 7. 最终验证

- [x] 7.1 依次运行 Host API/Contract/SDK/Testkit focused generation、unit、boundary、Rust fixture 和真实 tarball consumer gates；修复所有 warning/error 后重跑失败命令与完整 focused 集合。
- [x] 7.2 依次运行 `pnpm run format`、`pnpm run test` 与 `pnpm run check`，确认 frontend/shared package 格式、测试和静态分析全部通过且无新增警告。
- [x] 7.3 依次运行 `pnpm run typecheck` 与 `pnpm run build`，确认根应用、Contract、SDK、Testkit 和隔离 package 构建路径全部通过。
- [x] 7.4 依次运行 `pnpm run src-tauri:format:check`、`pnpm run src-tauri:test` 与 `pnpm run src-tauri:check`，确认 Rust 格式、shared fixture tests 与静态检查全部通过；即使没有新增生产 command，Rust fixture gate 仍属于本 change 的受影响层。
- [x] 7.5 运行 `openspec validate define-plugin-host-api-v1 --type change`，核对 proposal/design/spec/tasks 与中英文文档边界；所有前述验证通过后才将 `plugin-roadmap.md` Task 5.1 标记完成并链接当前 change，随后重新运行 OpenSpec 校验、`pnpm run check` 和受影响 focused gates，确认最终工作树无 warning/error。
