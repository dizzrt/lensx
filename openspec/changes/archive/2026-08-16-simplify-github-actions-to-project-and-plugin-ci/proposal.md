## Why

当前仓库用四条 GitHub Actions workflow 分别承担 Rust 检查、官方插件 PR 门禁、版本 PR、候选构建与 GitHub Release 发布，但现阶段只需要验证 LensX 主项目与 `plugins/*` 插件能够通过检查、测试和构建。继续保留自动升版与发布链路增加了写权限、维护成本和失败面，并让本地残留构建产物可能掩盖 clean runner 上的依赖准备缺口。

## What Changes

### Goals

- 将 GitHub Actions 收敛为两条 macOS-only、只读 CI：LensX CI 与 Plugins CI。
- LensX CI 在 pull request 与 `main` push 上验证主项目的前端格式/静态检查、类型检查、测试和生产构建，以及 Rust 格式、测试、静态检查和 workspace 构建；只有 `plugins/**` 改动时不运行。
- Plugins CI 仅在 `plugins/**` 或自身 workflow 改动时运行；任意插件改动都验证 `plugins/*` 下的全部直接插件成员。
- Plugins CI 在消费插件前按公共 workspace 依赖顺序显式生成所需 `dist`，然后对每个插件执行必需 lifecycle、`test:e2e` 与存在的插件专用视觉检查。
- 两条 CI 均使用最小 `contents: read` 权限，不接收发布 secret、不上传发布候选物、不创建版本 PR、tag 或 GitHub Release。
- 更新自动化校验与中英文维护文档，使当前实现、CI 约束与稳定规格一致。

### Breaking removals

- **BREAKING** 删除 `desktop-rust-check.yml`、`official-plugin-pr.yml`、`official-plugin-version.yml` 与 `official-plugin-candidate.yml`，以 `lensx-ci.yml` 和 `plugins-ci.yml` 取代。
- **BREAKING** 取消 GitHub Actions 中的 Changesets 版本 PR、官方插件 candidate/artifact handoff、受保护发布环境和 GitHub Release 自动发布能力。
- **BREAKING** 移除要求上述发布 workflow 存在的 workflow policy、聚合 gate、测试与文档断言；不保留兼容 workflow 或双路径。

### Non-goals

- 不改变 LensX 产品功能、Tauri/React 边界、插件 Manifest/SDK/Host API、安装或 Runtime 权限模型。
- 不新增 Linux 或 Windows runner；本阶段仍仅支持 macOS CI。
- 不在本变更中设计新的手动或自动发布流程，也不承诺保留未被两条 CI 使用的发布辅助命令为稳定接口。
- 不因 CI 收敛而允许官方插件导入 Host/Tauri 私有源码，或弱化插件公共 package 边界。

## Capabilities

### New Capabilities

- `repository-continuous-integration`: 定义 LensX CI 与 Plugins CI 的触发范围、只读权限、验证集合、公共依赖准备、全插件枚举和失败语义。

### Modified Capabilities

- `official-plugin-release-pipeline`: 退役并移除自动 Changesets 版本 PR、candidate handoff、tag、GitHub Release 与相关发布 workflow 要求；插件的 CI 验证责任迁移到新的纯 CI capability。

## Impact

- GitHub Actions：`.github/workflows/` 最终只保留 `lensx-ci.yml` 与 `plugins-ci.yml`。
- 根脚本与测试：需要提供可复用、依赖有序且不依赖预热 `dist` 的 LensX-only 与 plugins-only CI 命令，并删除自动发布 workflow 的强制检查。
- 文档与规格：更新 `docs/en` 及对应 `docs/zh` 镜像、验证说明和稳定 OpenSpec；归档时移除已退役的 `official-plugin-release-pipeline` 稳定 capability。
- GitHub 权限：不再需要 `contents: write`、`pull-requests: write`、发布 environment 或 GitHub Release token 权限。
- 产品与公开插件协议：无运行时、安装包格式或 Host authority 变化。
