# Proposal

## Why

Plugins CI 在提交 `8a3ace3043eefd2e3e52390e0cf4ea44de901daf` 的干净安装中，因 `@lensx/plugin-cli` 的 `bin` 指向尚未构建的 `dist/src/bin.js`，未能创建 `lensx-plugin` 命令入口；之后构建成功也未补建入口，导致翻译插件的产物验证失败。现有 E2E 未报告进程启动错误，只输出 `CLI validate failed: undefined`，而已有本地入口会掩盖该问题。

## What Changes

- 将 `lensx-plugin` 的安装入口改为随源码和发布包交付的薄 Node 入口，转发到现有构建产物；安装无需先构建，执行仍由现有工作区依赖拓扑准备构建产物。
- 保持公共 CLI 命令、参数、JSON、退出码及包内容语义；同步 `bin`、发布文件清单和包校验，保留现有 `dist/src/bin.js`。
- 增加真实包管理器驱动的干净安装回归：安装时没有 CLI `dist`，安装后构建，再通过首次安装产生的命令入口执行公共 CLI，不通过二次安装、重链接或直接执行内部路径绕过问题。
- 完善翻译插件产物检查的启动错误诊断，区分启动失败、非零退出、信号退出和异常 JSON，保留失败命令及有界上下文，并补充确定性单元测试。
- 更新相关英文工程文档及简体中文镜像；复用现有 `plugin-developer-cli`、`ci-plugins`、`plugin-host-http` 等 Gate 和标准生命周期，不增加根脚本别名或新工作流。

目标是使干净安装与已有工作区具有一致的公共 CLI 可用性，并让失败原因可定位。非目标包括修改翻译业务、Host HTTP/Rust 行为、CLI 命令协议、依赖版本、CI 触发条件、全局 pnpm 配置，以及发布或远端 CI 自动重跑。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-developer-cli`：明确构建前可链接的安装入口，以及安装后构建、真实命令调用和发布包隔离验证的要求。
- `repository-continuous-integration`：补齐公共依赖准备对命令入口的保证，以及插件产物检查对进程启动和退出失败的诊断要求。

## Impact

- CLI 包：`packages/plugin-cli/package.json`、新增薄入口、包校验及相关测试；现有 TypeScript runner 和构建顺序保持不变。
- 验证：`plugins/translation/scripts/test-e2e.mjs` 及其可测试的进程结果处理，现有 CLI consumer 验证脚本和 Gate 组合；同时覆盖 `ci-plugins` 与 `plugin-host-http` 的使用路径。
- 文档：`docs/en/development/plugin-developer-cli.md`、`continuous-integration.md`、`translation.md` 及对应 `docs/zh/` 文档。
- 不引入运行时依赖，不修改 UI、Tauri 命令或数据协议，不自动升级版本或发布包。
- 当前只有日志与只读源码诊断、本地已有入口下的 `validate` 成功证据；干净安装回归和完整 Gate 的修复后结果须在 apply 阶段取得，不将本提案视为实现或验收完成。
