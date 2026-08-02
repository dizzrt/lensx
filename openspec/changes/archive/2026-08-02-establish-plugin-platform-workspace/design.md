## Context

仓库当前只有根 `lensx` package：它是 private package，同时承载 React/Rsbuild 应用、测试、插件 Manifest TypeScript 实现、生成脚本和 Tauri/Rust 工程。仓库没有 pnpm workspace 配置，lockfile 只有根 importer；现有 `build`、`typecheck`、`test` 与 `check` scripts 只验证根应用，也没有仓库级规则阻止未来公共 package 或插件源码通过相对路径、alias 或 package 依赖进入 Host 私有代码。

静态 Plugin Manifest 契约已经交付，但公共 Contract package、SDK、UI、Testkit、CLI、官方插件和外部插件 Runtime 都尚未交付。本 change 只提供这些后续 change 所需的工程拓扑与依赖护栏，不移动现有契约实现，也不创造可运行插件。

约束包括：

- 根应用必须继续作为 private package 工作，当前阶段不迁移至 `apps/desktop`。
- Rust/Tauri 继续拥有原生与特权边界；插件与公共 package 不得直接访问这些实现。
- 官方插件和示例插件必须遵守同一外部插件源码边界，不能因为位于 monorepo 而获得私有入口。
- 新增的工程约定必须能由本地根命令与 CI 自动验证。
- 具体工程文档写入 `docs/en/`，并维护相同相对路径的 `docs/zh/` 镜像。

## Goals / Non-Goals

**Goals:**

- 建立包含根应用、`packages/*`、`plugins/official/*` 与 `examples/plugins/*` 的 pnpm workspace 拓扑。
- 为 Host、公共 package、官方插件和示例插件定义单向、可执行的依赖规则。
- 让根 `build`、`typecheck`、`test` 与 `check` 命令覆盖根应用和每个 workspace 成员，并向调用方传播失败。
- 通过自动化正反测试证明非法私有导入、Tauri 导入和跨成员相对导入会被拒绝。
- 保持根应用的开发、前端构建、测试和 Tauri/Rust 行为不变。

**Non-Goals:**

- 不创建、抽取或发布 `@lensx/plugin-contract`、Plugin SDK、Plugin UI、Plugin Testkit 或 Plugin CLI。
- 不实现插件发现、安装、注册、生命周期、iframe Runtime、Host API、授权、签名或分发。
- 不移动现有 Manifest Schema、生成类型、fixtures、TypeScript/Rust validator 或示例 Manifest。
- 不增加用户界面、用户可见文案、主题或 locale 行为。
- 不把根应用迁移到 `apps/desktop`，也不重组 Rust workspace。

## Decisions

### 1. 根应用保留在仓库根部，叶级成员使用三个明确 glob

增加根级 pnpm workspace 配置，成员模式固定为：

```text
packages/*
plugins/official/*
examples/plugins/*
```

根 `package.json` 保持 `private: true`，继续拥有当前 React/Rsbuild 与 Tauri 应用。pnpm 只把上述目录中实际包含 `package.json` 的目录识别为成员；因此本 change 可以建立边界而不创建后续 Task 才拥有的公共 package。当前 `examples/plugin-manifest-v0` 是静态 Manifest 示例，不移动也不自动成为 workspace package。

选择该方案而不是立即迁移到 `apps/desktop`，可以减少入口路径、Tauri 配置、测试相对路径和构建产物的无关变更。选择显式单层 glob 而不是宽泛的 `**`，可以让受支持的成员位置可审计，并避免临时或嵌套目录被意外纳入安装图。

### 2. Host 与插件均只能通过声明过的公共 package 边界共享代码

依赖方向定义为：

```text
root Host ───────────────▶ packages/*
plugins/official/* ──────▶ packages/*
examples/plugins/* ─────▶ packages/*

packages/* ─────X───────▶ root Host private modules
plugin sources ─X───────▶ root Host private modules
plugin sources ─X───────▶ Tauri APIs or adapters
workspace member ─X─────▶ another member through relative source imports
```

公共 package 可以依赖依赖图中更底层的公共 package，但必须使用对方声明的 package 名和 export；不得通过跨成员相对路径读取源码。官方插件与示例插件只能消费公共 package export 和允许的普通外部依赖，不能导入根 `src/app/**`、Host Tauri adapter、根内部样式入口或 `@tauri-apps/*`。需要受信任 React/Tauri 对象的第一方能力继续留在根 Host 模块中，而不是放进 `plugins/official/*`。

该规则避免 monorepo 路径便利性变成权限旁路，并为后续将公共 package 发布到仓库外保留一致的消费方式。

### 3. 标准根生命周期命令聚合验证，成员不得静默缺少命令

保留 `dev`、`preview`、`tauri` 与 `src-tauri:*` 的当前用途。将根应用自身的 build、typecheck、test 与 check 逻辑拆成不会递归调用聚合命令的内部 app scripts，再由标准根命令显式执行根应用和三个成员区域中的所有 workspace package。

每个实际 workspace 成员必须声明 `build`、`typecheck`、`test` 与 `check`。聚合命令不使用会静默忽略缺失 script 的策略；成员缺少命令、成员命令失败或根应用命令失败都必须使聚合命令返回非零状态。成员执行顺序遵守 pnpm workspace 依赖拓扑，根聚合必须显式排除自身以避免递归。

选择保留标准命令名作为完整验证入口，可以避免开发者和 CI 需要记忆两套“局部”和“完整”命令。根 app-only script 作为内部实现细节，不取代标准入口。

### 4. 使用仓库自有的静态边界检查，不增加运行时依赖

增加一个明确的根边界检查命令，并把它纳入根 `check`。检查器使用现有 Node/TypeScript 工具链解析 workspace package manifests 和源码 import/export/dynamic-import specifier，根据文件所在成员分类执行规则：

- 校验所有成员位置与必需 lifecycle scripts；
- 拒绝公共 package 或插件对根 private package/路径的依赖；
- 拒绝插件对 `@tauri-apps/*`、Host adapter 与内部样式入口的依赖；
- 拒绝 workspace 成员间绕过 package export 的相对源码导入；
- 解析相对路径与仓库内 alias，避免仅检查字符串前缀造成明显旁路；
- 输出包含违规文件、import specifier 和规则标识的确定性诊断。

检查逻辑使用 Node 内置能力和仓库已经依赖的 TypeScript，不引入产品运行时依赖或第二套通用 lint 框架。规则行为由仓库自有 fixtures 测试：合法公共 import 必须通过，每类禁止边界至少有一个负例，并断言非零状态与稳定规则标识。这样即使本 change 尚未创建真实公共 package，CI 仍能证明护栏有效。

### 5. Workspace 配置不改变产品契约

重新生成 pnpm lockfile，使 importer 状态与 workspace 配置一致，但不升级无关依赖。现有根应用依赖、Manifest Schema、生成输出、前端入口和 Tauri/Rust Cargo workspace 保持原位。工程说明更新到适用的英文开发或架构文档及其简体中文镜像，不把具体设计放进 README 或 agent onboarding 文件。

## Risks / Trade-offs

- **[聚合脚本可能递归调用根 package]** → 使用明确的 app-only 内部 scripts，并在成员选择器中显式排除 workspace root；为每个聚合入口增加命令级验证。
- **[当前没有真实叶级 package，边界检查可能只在未来才暴露问题]** → 使用纳入测试的合法与非法 fixture 覆盖成员分类、package manifest 和 import 规则。
- **[自有检查器可能漏掉新的模块语法或 alias]** → 基于 TypeScript AST 而不是正则扫描，集中维护规则标识，并在新增构建 alias 或源码类型时扩展 fixture。
- **[严格要求四个 lifecycle scripts 增加新 package 的接入成本]** → 用统一最小脚本契约换取完整验证；不允许通过 `--if-present` 把未验证成员误报为通过。
- **[官方插件无法直接复用 Host 私有 React/Tauri 实现]** → 这是有意的安全与可发布性约束；需要特权的能力保留为 Host 模块，插件只能等待后续公共 SDK/Host API。
- **[lockfile 结构变化造成较大 diff]** → 使用仓库声明的 pnpm 版本，仅执行 workspace 所需的安装更新，并检查无关版本没有变化。

## Migration Plan

1. 增加 workspace 配置并确认根 package 仍是 private workspace root。
2. 拆分根 app-only lifecycle scripts，增加聚合命令与成员 script 契约。
3. 实现边界检查及其正反 fixture，并将检查纳入根 `check`。
4. 使用声明的 pnpm 版本更新 lockfile，执行安装与所有聚合验证。
5. 更新英文文档和简体中文镜像，最后执行完整前端与 Rust 验证。

如果迁移导致现有应用命令或构建异常，可以移除 workspace 配置与聚合封装、恢复原根 scripts 和 lockfile importer；本 change 不迁移产品源码或持久化数据，因此回滚不需要数据转换。

## Open Questions

无。首个真实公共 package 由后续 `publish-plugin-contract-package` change 创建；本 change 只建立并验证其接入规则。
