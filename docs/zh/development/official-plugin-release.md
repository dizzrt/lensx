# 官方插件发布流水线

## 范围与当前状态

仓库已经交付维护流水线，可将未来的 `plugins/official/*` 成员作为独立 release unit
完成校验、升版、构建和 canonical `.lxp` 发布。当前尚无 Task 7.2 产品插件，因此真实
member matrix 会显式 no-op，完整路径由 committed fixture 覆盖。公共 Contract、SDK、
UI、Testkit 与 CLI package 仍未发布到 npm。

官方仓库目录或 GitHub Release 不是 Host authority。普通本地安装器仍把下载字节分类为
`external`，并使用与外部插件相同的开放隔离 Runtime、封闭 Host API、Runtime Session 和 package
规则。签名、Marketplace、自动更新和 Host `official` trust
仍未交付。

## 目录与所有权契约

每个直接 `plugins/official/<slug>` workspace member 是一个 release unit，必须包含：

- 唯一 package name、`private: true`、独立 SemVer、
  `packageManager: "pnpm@11.17.0"`、Node `>=24 <25` 与 pnpm `>=11 <12`；
- 根 `manifest.json`，其中 `plugin_id` 唯一且 version 与 `package.json` 一致；build 后的
  `dist/manifest.json` 也必须一致；
- `CHANGELOG.md`、至少一个可执行测试，以及有效的 `build`、`typecheck`、`test`、
  `check` 和 `test:e2e` scripts；
- `.github/CODEOWNERS` 中一条精确的
  `/plugins/official/<slug>/ <owners...>` 记录。

通配、重复、空、冲突或指向未知官方插件的 owner 记录都会 fail closed。官方插件只能
消费公共 Contract、SDK、UI、Testkit、CLI authoring command 与普通前端依赖，不能导入
private Host、Tauri、workspace deep path、其他插件源码，Host 也不能直接导入自己的
`plugins/official/*` 源码。Host 只消费安装后的 registration。

## Changesets 与版本意图

release-relevant 插件变化必须携带目标精确匹配 package 且显式声明 `patch`、`minor` 或
`major` 的 Changeset：

```md
---
"@lensx/example-official-plugin": patch
---

Describe the user-visible or maintenance change.
```

路径分析控制验证集合，Changeset 控制 release 意图。插件本地路径只选择该插件；Contract、
SDK、UI、Testkit、CLI、workspace、lockfile、package、安装、Runtime 或 release
基础设施变化会验证全部现有官方插件，但不会隐式创建 bump。无关变化产生显式 no-op。

版本 PR 运行 `pnpm run version:official-plugins`。Changesets 只更新目标 package version
与 CHANGELOG；受控命令随后只同步同一插件的源 Manifest，并重新验证全部 metadata。
官方 package 保持 private，workflow 的 publish command 是显式 npm no-op。

`@changesets/cli@2.31.1` 是固定版本、MIT 许可证且仅用于开发的依赖。它未声明 Node engine
限制，仓库会在 Node 24 与 pnpm 11 上验证，并通过 lockfile 固定完整传递依赖图。它不会进入前端
bundle、插件 Runtime dependency graph 或公共 npm 输出。版本或传递依赖变化必须重新审查许可证、
兼容性与供应链影响。

## PR、候选与 E2E 门禁

`official-plugin-pr.yml` 仅针对相关 pull request 路径运行，权限只有 `contents: read`，
不使用 protected environment、release secret 或持久 Git credential。它从显式 base/head
计算计划并运行：

```bash
pnpm run check:official-plugin-release-pipeline
```

focused gate 检查 contract、CODEOWNERS、Changeset policy、确定性 planner、canonical
candidate/audit schema、workflow policy、双语文档、workspace boundary、公共 CLI/package
format、普通 TypeScript/Rust 安装 preparation、open-isolated-Runtime gate 与临时双插件 dry-run。
每个被选择的真实插件还会进入自己的只读 candidate matrix，因此共享边界变化可以验证每个当前
consumer，而 pull request 不会获得任何写入路径。

对于 `main` 上每个尚未发布的成员，只读 build job 依次运行 package lifecycle，以及公共
`lensx-plugin build`、`validate`、重复 `pack --no-build` 和 `inspect`。两次 pack 必须
byte-identical。同一不可变 `.lxp` 随后通过 Rust inspector、普通本地安装 preparation、
sandbox iframe open、Runtime Session/SDK-ready、Page/Action open、close/teardown 与插件
自己的 `test:e2e`。任何失败都必须生成新 candidate，旧字节不得复用。

## 资产、Tag 与审计记录

每个插件版本使用 tag `official/<plugin-id>/v<version>`，公开资产严格为：

```text
<plugin-id>-<version>.lxp
<plugin-id>-<version>.lxp.sha256
<plugin-id>-<version>.release.json
```

schema version `1` release record 是 canonical、locale-neutral JSON，只包含插件 identity/version、
artifact 名称/大小/SHA-256、HTTPS repository、source commit/ref、workflow run URL 与 release
tag。它位于 `.lxp` 和 author Manifest 外部。`signature`、`official`、`verified`、
`permission`、`grant`、`authorization` 等未知或 authority 字段都会被拒绝。

低权限 build 上传 digest 固定的 handoff artifact。受保护的 `official-plugin-release` publish
job 不安装依赖也不执行插件代码；它复验完整 handoff、创建 draft、上传并回读全部三件资产，
最后才公开 release。它不会发布 npm package，也不会触发桌面应用 release。

## 失败与重试规则

完全一致的现有 tag、record 与 asset set 是幂等成功。tag 指向其他 commit、asset/record
不一致、出现未知 asset、已有更高 SemVer 或上传/回读失败时，该插件发布立即停止。public
asset 不会覆盖，tag 不会移动，已发布历史不会删除或回退。不完整 draft 对外不可见，修复原因后
可以安全重试。不同插件 matrix entry 是独立失败域。

committed dry-run 使用位于 `plugins/official/*` 之外的两个临时插件，只对其中一个执行 bump、
build、pack、inspect、prepare、Runtime exercise 与 release plan，并证明另一个插件和根应用
保持不变。fixture 不会注册到产品 Host，也不会调用 GitHub Release API。

## 维护命令

从仓库根目录运行，并使用机器配置的全局 pnpm store：

```bash
pnpm run check:official-plugin-release-contract
pnpm run check:official-plugin-release-boundaries
pnpm run check:official-plugin-release-workflows
pnpm run check:official-plugin-release-docs
pnpm run check:official-plugin-release-dry-run
pnpm run check:official-plugin-release-pipeline
pnpm run version:official-plugins
```

仓库根目录禁止传 `--store-dir`。临时 package consumer 与 dry-run install 只操作自己的临时
目录，不得重建根 `node_modules`。
