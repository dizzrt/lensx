## Why

仓库已经具备公共插件 Contract、SDK、CLI、canonical `.lxp` 包格式、普通本地安装和 Runtime/权限验证能力，但目前没有官方插件专用的独立版本与发布通道。Task 7.2 及后续官方插件需要先有一条可复用、可审计且不耦合桌面应用版本的发布流水线，才能以外部插件相同的边界完成交付。

## What Changes

- 新增官方插件发布契约：`plugins/official/*` 中的每个实际插件必须拥有独立 package、Manifest SemVer、CHANGELOG、自动化测试和明确的 CODEOWNERS 归属。
- 新增基于路径影响分析与 Changesets 的单插件版本规划；共享公共依赖或 gate 变化可扩大验证范围，但只有带有效 changeset 的插件可以进入发布。
- 新增官方插件 release gate，复用现有 Contract、SDK、package format、permission、Runtime 与自动化 E2E 验证，并要求候选 `.lxp` 同时通过公共 CLI 检查和普通 Host 安装准备边界。
- 新增独立 `.lxp` 发布与审计记录：每个插件版本单独生成 release 资产、SHA-256 和不可授信的来源 sidecar，发布失败不得形成部分 release，也不得触发 lensX 桌面应用发布。
- 新增发布基础设施和双语维护文档的漂移检查，使未来官方插件默认遵守公共依赖边界、版本一致性、release 资产命名和最小权限原则。

### Goals

- 让任一官方插件可以独立验证、升版、构建和发布，与其他插件及 lensX 应用版本解耦。
- 保证官方产物与外部插件使用完全相同的 canonical `.lxp` 内容协议和 Host 安装验证路径。
- 让发布选择、输入 commit、包 digest、workflow run 和产物关系可审计，同时保持来源记录不产生 Host 信任或权限。

### Non-goals

- 不在本 change 中实现 Task 7.2/7.3 的具体官方插件功能。
- 不发布公共 npm packages，也不引入 Marketplace、远程更新、桌面应用 release 或插件聚合版本。
- 不实现签名、可信 publisher、Host `official` 来源判定、密钥轮换或撤回；这些仍属于 Task 8.1 及其后续 change。
- 不改变 Manifest、`.lxp` 内容协议、安装器权限模型、Runtime Session 或 Host API 语义，也不因官方发布记录自动授予权限。

### User-visible impact

- 维护者可以通过单插件 changeset 获得独立版本、CHANGELOG 和 release 资产，而无需发布桌面应用。
- 用户获得的官方插件仍是可由普通本地安装入口验证的 `.lxp`；在签名与分发信任能力交付前，Host 不会仅凭 release 来源把它识别为可信官方包。

## Capabilities

### New Capabilities

- `official-plugin-release-pipeline`: 定义官方插件元数据、路径选择、Changesets 版本规划、发布前 gate、独立 `.lxp` 资产、来源审计记录、原子发布和权限/信任边界。

### Modified Capabilities

- 无。现有 workspace、CLI、package format、安装、权限与 Runtime 能力仅作为发布流水线的复用 gate，其规范语义不变。

## Impact

- 发布配置：GitHub Actions、Changesets 配置、CODEOWNERS 与最小权限 release 凭据。
- 仓库脚本与测试：官方插件发现/路径过滤、版本一致性、changeset 覆盖、release 计划、候选产物与来源 sidecar 验证，以及可重复的 dry-run/E2E fixture。
- 官方插件 package 约定：独立 package/Manifest 版本、CHANGELOG、生命周期脚本和公共依赖边界；不新增 Host-private import 例外。
- 文档：在 `docs/en/` 维护官方插件发布说明并提供 `docs/zh/` 对应镜像，更新相关索引与验证入口。
- 依赖：预计引入 Changesets 作为开发期版本编排工具；不新增插件 Runtime 依赖或前端组件库。
