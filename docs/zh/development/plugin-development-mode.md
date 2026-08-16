# 插件开发模式

## 范围

插件开发模式是测试自包含插件 `dist/` 目录的 Host-private 工作流。它只存在于
feature-enabled 开发构建中。专用 `pnpm run dev:plugin-development-mode` 命令是
显式的当前进程 opt-in：它会在前端装载前开启原生模式，并发现已经构建的仓库插件。
其他 feature build 仍默认关闭。registration、snapshot、source scope、Runtime 与
开关值都不会跨进程持久化。

它不会安装 `.lxp`、签名或信任 Publisher 声明、增加 Host authority、监听文件、
执行构建、自动重新加载插件或打开 Page。发现到的 Action 会出现在 Launcher 中，
但只有用户后续执行该 Action 才会打开 production Child WebView Runtime。

## 标准 Smoke 插件

仓库包含 `examples/plugins/development-mode-smoke`，这是一个使用真实公共 SDK 的插件，
并提供两个确定性的构建阶段。两个阶段使用相同 plugin ID 与输出目录，因此会经过真实的
development reload transaction：

- `initial` 构建 `0.1.0`、A 代版本；
- `reload` 构建 `0.2.0`、B 代版本，并使用相同的开放 Web Runtime 边界。

在仓库根目录构建并校验 A 代版本：

```bash
pnpm run build:plugin-development-smoke:initial
pnpm run validate:plugin-development-smoke
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
表示声明范围排除了当前 Host，或使用旧 Manifest `0.2.x`/iframe Runtime 协议；
`source_changed` 表示捕获期间文件发生变化；`conflict`
表示界面 revision 已过期；`unsafe_state` 表示无法证明 Host ownership；`cleanup_pending`
表示 authority 已成功变更，但旧缓存仍需重试清理或等待进程退出时清理。

UI 永远不会收到所选路径、snapshot root 或 identity、文件字节、operation tokens、
raw native errors 或 private Manager facts。

## 真实 Register 到 Disable Smoke

使用一个全新的 lensX 进程，并在整个流程中保持其 terminal 运行。

1. 使用上面的命令构建并校验 A 代版本，把它放到 custom root 的直接成员
   `<root>/smoke/dist` 下，然后运行
   `pnpm run dev:plugin-development-mode -- --plugins-root <root>`。
2. 按 `Ctrl+Shift+Space`，执行 **打开设置**，进入 **插件**。**插件开发模式** Switch
   必须已经开启，发现到的条目必须显示 `0.1.0`，以及
   **Development**、**Unpacked**、**Unsigned** 文本标签。Publisher 必须仍是
   未验证的作者文本，并且不存在 permission 或 grant facts。
3. 再次打开 Launcher，执行 **打开开发模式 Smoke A**。真实插件 WebView 必须显示
   A 代版本与 Host API `0.2.0` capabilities。
4. 不关闭 lensX，在另一个 terminal 构建并校验 B 代版本：

   ```bash
   pnpm run build:plugin-development-smoke:reload
   pnpm run validate:plugin-development-smoke
   ```

   手动 reload 之前，已经打开的页面必须仍显示 A 代版本。这证明 Host 服务的是不可变
   snapshot，而不是已经变化的作者目录文件。
5. 返回 **设置 → 插件**，选择 development entry，然后执行 **从目录重新加载**。
   当前条目必须变成 `0.2.0` 与 B 代版本。不得出现 permission/grant 状态；刷新后的插件页面
   必须使用相同的开放隔离 Runtime profile。
   Launcher Action 必须变成 **打开开发模式 Smoke B**。
6. 执行 **移除开发条目** 并确认。条目及其 Launcher Action 必须消失，已打开的插件
   Page 必须终止。结果必须说明 plugin data 与 Launcher collections 得到保留。
7. 再次注册同一个 B 代 `dist/` 并打开它，然后关闭 **插件开发模式**。确认关闭后，
   Host 必须先 quiesce 正在运行的 Page 并移除所有 development entries，UI 才能报告
   mode 已关闭。
8. 使用相同 root 停止并重新运行 `pnpm run dev:plugin-development-mode`。模式必须开启并
   重新发现全新的 registrations，但不能恢复上一进程的 snapshot、Runtime 或 registration
   状态；普通构建仍不得启用开发模式。最后运行 `pnpm run check:plugin-development-mode-boundaries`，
   验证普通 production artifacts 仍然排除该能力。

如需真实验证 unsafe-directory 拒绝路径，可先构建 A 代版本，再在其 `dist/` 内加入一个
symbolic link，然后尝试 register 或 reload。Host 必须拒绝该目录，且不能替换当前 generation。
重新构建 A 代版本时，Rsbuild 会先清理 `dist/`，因此也会移除该测试 link。

## 验证

修改此工作流后运行 focused gate：

```bash
pnpm run check:plugin-development-mode
```

该 gate 覆盖构建排除、契约、目录 corpus、Rust transactions、Resource/Runtime invalidation、
前端 convergence、可访问性、双语消息与文档、固定视口视觉证据以及正式构建产物。
