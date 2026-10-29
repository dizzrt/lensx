# 插件开发模式

## 范围

插件开发模式是在开发期间使用自包含插件 `dist/` 目录的 Host-private 工作流。它只存在于
feature-enabled 开发构建中。专用 `pnpm run dev:plugin-development-mode` 命令是
显式的当前进程 opt-in：它会在前端装载前开启原生模式，并发现已经构建的仓库插件。
其他 feature build 仍默认关闭。registration、snapshot、source scope、Runtime 与
开关值都不会跨进程持久化。

该命令会委托 Host-private `development-launcher`，因此实际本地 App origin、Tauri child 生命周期、
信号转发与 cleanup 都和 `pnpm run app:dev` 相同；只有 frontend capability、Rust feature 与
startup root 不同。

它不会安装 `.lxp`、签名或信任 Publisher 声明、增加 Host authority、监听文件、
执行构建、自动重新加载插件或打开 Page。发现到的 Action 会出现在 Launcher 中，
但只有用户后续执行该 Action 才会打开 production Child WebView Runtime。

该插件 reload 边界与 Host 前端热更新彼此独立。在 `dev` 中，Rsbuild 会从工作区源码解析
`@lensx/plugin-contract`，因此验证期间重建该包的 `dist/` 不会中断正在运行的前端模块图。
Production build 仍解析该包正式发布的 `dist/` 入口。插件作者目录继续使用不可变 snapshot，
重新构建后仍必须执行 **从目录重新加载**。

## 标准 Smoke 插件

仓库包含 `examples/plugins/development-mode-smoke`，这是一个使用公共 SDK 的插件，
提供两个确定性的构建阶段。两个阶段使用相同 plugin ID 与输出目录，用于 development reload 工作流：

- `initial` 构建 `0.1.0`、A 代版本；
- `reload` 构建 `0.2.0`、B 代版本，并使用相同的开放 Web Runtime 边界。

在仓库根目录构建并校验 A 代版本：

```bash
pnpm run gate -- plugin-development-smoke-initial
pnpm run gate -- plugin-development-smoke-validation
```

native picker 应选择 `examples/plugins/development-mode-smoke/dist` 的绝对路径，
而不是插件项目根目录。该构建产物是自包含的，Runtime 只导入公共
`@lensx/plugin-sdk/webview` 边界。

## 启动 lensX

先构建仓库插件，再启动专用 Host 构建：

```bash
lensx-plugin build
lensx-plugin validate
pnpm run dev:plugin-development-mode
```

该命令默认检查 `plugins/` 下的直接成员，并只检查现有的
`plugins/<member>/dist`。隐藏成员以及缺少 `dist/` 的成员会被忽略。若要使用其他
root，只能传入一个覆盖参数：

```bash
pnpm run dev:plugin-development-mode -- --plugins-root /absolute/plugin-projects
```

custom root 会替代默认 root，不会与 `plugins/` 同时扫描。每个非隐藏直接成员都被视为
project container，只有它的 `dist/` 子目录会成为 candidate。包装器会规范化该 root，
并只通过 Host-private startup environment 传递；该值不会进入 frontend bundle、event
payload、Registration Contract 或 plugin Runtime。

在 **设置 → 插件** 中，**插件开发模式** 已经开启。即使 root 缺失、为空、不可读，
或所有 candidate 都被跳过，仍可通过 **注册开发目录** 进行额外的手动选择。应选择
自包含的 `dist/` 根目录，而不是项目根目录。取消 native 文件夹选择器不会产生副作用。
Host-owned native picker 打开期间，lensX 会保持其父窗口可见，并暂时抑制快捷键或失焦隐藏；
picker 返回选择结果或被取消后，正常的失焦隐藏行为会立即恢复。

Host 只接受所选根目录下的普通文件。它会拒绝链接、特殊文件、不可移植路径、
大小写冲突路径、超出限制的目录树、捕获期间发生变化的源文件、无效 Manifest、
缺失的引用资源与不兼容版本。它不会读取 `package.json`、检查项目 imports、
执行构建脚本或要求 `checksums.json`。

## 快照、重新加载与移除

lensX 会把通过检查的目录复制到应用缓存中的不可变 Host-owned snapshot。
Plugin Manager、Resource 与 Runtime authority 只引用该快照；作者目录永远不是 serving fallback。
快照树 identity 使用内部 `sha256-development-tree-v1` domain，它不是 `.lxp` package digest。

修改源码后，再次运行插件构建与验证，然后选择 **从目录重新加载**。每次成功的手动
reload 都会创建全新 generation，即使字节完全相同。native staging 会先校验并发布替换
registration；staging 被拒绝时，current Child WebView 与 Session 完全不受影响。commit
成功后，lensX 会先销毁旧 Child WebView attempt，再投影新 generation。开发插件与正式
安装插件共用同一 Child WebView registry、origin/resource binding、顶层 navigation、
private bridge、Session、RPC、Host API 与 terminal teardown。source provenance 不增加
Host authority，reload 也不会创建 permission 或 grant 状态。

**移除开发条目** 与关闭模式会移除进程内 development registrations，并终止其当前
authority；插件数据与 Launcher collections 会保留。正式安装包、quarantine records 与
其他插件不会改变。重启 lensX 也会忘记全部 development registrations。

## 诊断

启动 candidate 使用与手动注册相同的目录检查和不可变 snapshot prepare。
`invalid`、`incompatible`、`source_changed`、`unsafe` 与 candidate 级读取失败只会跳过
对应 member；terminal 只报告其可移植 member label、稳定错误码及最终 loaded/skipped
计数。在提交任何 candidate 前，lensX 会对整个 prepared batch 以及当前 builtin、external、
quarantine 和 development identities 统一检查 ID。任一重复都会产生阻断启动的
`conflict`；lensX 会清理全部未提交 snapshot，绝不 shadow 或替换现有 entry。Manager
或 cache 协调失败会回滚本次 bootstrap batch 并终止 setup，避免前端看到部分初始投影。

错误稳定且不包含路径。`invalid` 表示 payload 不完整或违反目录规则；`incompatible`
表示声明范围排除了当前 Host，或使用 Manifest `0.3.x` 或更早/iframe Runtime 协议；
`source_changed` 表示捕获期间文件发生变化；`conflict`
表示界面 revision 已过期；`unsafe_state` 表示无法证明 Host ownership；`cleanup_pending`
表示 authority 已成功变更，但旧缓存仍需重试清理或等待进程退出时清理。

UI 永远不会收到所选路径、snapshot root 或 identity、文件字节、operation tokens、
raw native errors 或 private Manager facts。

## 注册、重新加载与停止开发插件

以下操作说明介绍如何使用示例插件。仓库验收由[验证](#验证)节的确定性 Gate 覆盖。

1. 使用上面的命令构建 A 代版本，把它放到 custom root 的直接成员
   `<root>/smoke/dist` 下，然后运行
   `pnpm run dev:plugin-development-mode -- --plugins-root <root>`。
2. 使用已配置的 Launcher 快捷键（默认 `Ctrl+Shift+Space`），执行 **设置**，进入 **插件**。
   专用命令会开启 **插件开发模式**。发现到的条目显示 `0.1.0` 版本，以及
   **Development**、**Unpacked**、**Unsigned** 标签。Publisher 文本是作者声明，
   不增加 permission 或 grant authority。
3. 打开 Launcher，执行 **打开开发模式 Smoke A**。示例 Page 显示 A 代版本和 Host API
   `0.4.0` capabilities，包括当前 Session provider 可用时的 Action activation 方法。
   Development Mode 不授予原生输入监听或快捷键配置权限。
4. 要将示例改为 B 代版本，在另一个 terminal 构建：

   ```bash
   pnpm run gate -- plugin-development-smoke-reload
   pnpm run gate -- plugin-development-smoke-validation
   ```

   执行 reload 前，打开的 Page 继续使用其 A 代 snapshot。修改或重新构建作者文件不会自动替换该 snapshot。
5. 在 **设置 → 插件** 中选择 development entry，执行 **从目录重新加载**。
   reload 成功后，条目更新为 `0.2.0`、B 代版本，并显示 **打开开发模式 Smoke B** Action。
   它会创建 fresh Page attempt，应用该 generation 的 Manifest presentation，继续使用相同的
   open isolated Runtime 边界。若 staging 被拒绝，当前 Page attempt 和临时用户调整尺寸保持不变。
6. 要从当前进程移除此插件，执行 **移除开发条目** 并确认。条目及其 Action 会被移除，
   已打开的 Page 会关闭；插件数据和 Launcher collections 保留。要停止全部开发插件，
   关闭 **插件开发模式** 并确认。Host 会关闭它们的 Page，并移除这些进程内条目。

使用相同 root 重新启动专用命令时，会发现新的条目，不会恢复前一进程的 snapshot 或 Runtime 状态。
普通构建仍默认不启用 Development Mode。

包含 symbolic link 或其他不安全成员的目录会被拒绝，不会替换当前 generation。
`pnpm run gate -- plugin-development-mode` 中的目录 corpus 和 transaction 检查确定性覆盖这些拒绝路径。

## 验证

仓库验收使用确定性检查。修改此工作流后运行 focused Gate，并按[验证指南](validation.md)完成全部必需验证：

```bash
pnpm run gate -- plugin-development-mode
```

该 gate 覆盖构建排除、契约、目录 corpus、Rust transactions、Resource/Runtime invalidation、
前端 convergence、可访问性、双语消息与文档、确定性的 presentation reset/retention 断言
以及正式构建产物。Development entry 与已安装插件使用同一 work-area-aware native coordinator；
author-selected 或 user-resized size 都不会跨 replacement、process restart 或 rediscovery 持久化。

这些 Gate 不启动真实 WebView、GUI 应用或原生交互 harness。上面的产品操作说明不是仓库验收步骤，
也不存在与它对应的 manual 或 optional compatibility Gate。Gate 结果只证明所覆盖的确定性边界，
不证明操作系统输入投递或真实 WebView 运行。
