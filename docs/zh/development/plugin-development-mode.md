# 插件开发模式

## 范围

插件开发模式是用于手动测试自包含插件 `dist/` 目录的 Host-private 工作流。
它只存在于专用的 feature-enabled 开发构建中，每个 lensX 进程启动时默认关闭，
且注册与模式开关都不会跨重启持久化。

它不会安装 `.lxp`、签名或信任 Publisher 声明、授予权限、监听文件、执行构建，
也不会自动重新加载插件。

## 标准 Smoke 插件

仓库包含 `examples/plugins/development-mode-smoke`，这是一个使用真实公共 SDK 的插件，
并提供两个确定性的构建阶段。两个阶段使用相同 plugin ID 与输出目录，因此会经过真实的
development reload transaction：

- `initial` 构建 `0.1.0`、A 代版本，不请求权限；
- `permission-delta` 构建 `0.2.0`、B 代版本，请求 `clipboard.read`，但不会因此获得 grant。

在仓库根目录构建并校验 A 代版本：

```bash
pnpm run build:plugin-development-smoke:initial
pnpm run validate:plugin-development-smoke
```

native picker 应选择 `examples/plugins/development-mode-smoke/dist` 的绝对路径，
而不是插件项目根目录。该构建产物是自包含的，Runtime 只导入公共
`@lensx/plugin-sdk` iframe 边界。

## 启动 lensX

先构建插件，再启动专用 Host 构建：

```bash
lensx-plugin build
lensx-plugin validate
pnpm run dev:plugin-development-mode
```

在 **设置 → 插件** 中启用 **插件开发模式**，然后选择 **注册开发目录**。
应选择自包含的 `dist/` 根目录，而不是项目根目录。取消 native 文件夹选择器不会产生副作用。
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
reload 都会创建全新 generation，即使字节完全相同。它会终止旧的 Resource 与 Runtime
authority，根据新 Manifest 协调 grants，并发布新的 current registration。新增权限请求
保持未授权，已移除的请求失去 grants，仍保留的请求继续使用已有 grants。

**移除开发条目** 与关闭模式会移除进程内 development registrations，并终止其当前
authority；插件数据与 Launcher collections 会保留。正式安装包、quarantine records 与
其他插件不会改变。重启 lensX 也会忘记全部 development registrations。

## 诊断

错误稳定且不包含路径。`invalid` 表示 payload 不完整或违反目录规则；`incompatible`
表示声明范围排除了当前 Host；`source_changed` 表示捕获期间文件发生变化；`conflict`
表示界面 revision 已过期；`unsafe_state` 表示无法证明 Host ownership；`cleanup_pending`
表示 authority 已成功变更，但旧缓存仍需重试清理或等待进程退出时清理。

UI 永远不会收到所选路径、snapshot root 或 identity、文件字节、operation tokens、
raw native errors 或 private Manager facts。

## 真实 Register 到 Disable Smoke

使用一个全新的 lensX 进程，并在整个流程中保持其 terminal 运行。

1. 使用上面的命令构建并校验 A 代版本，然后运行
   `pnpm run dev:plugin-development-mode`。
2. 按 `Ctrl+Shift+Space`，执行 **打开设置**，进入 **插件**，启用
   **插件开发模式**，然后在 native folder picker 中注册
   `examples/plugins/development-mode-smoke/dist`。条目必须显示 `0.1.0`，以及
   **Development**、**Unpacked**、**Unsigned** 文本标签。Publisher 必须仍是
   未验证的作者文本，requested、granted 与 effective permissions 都应为空。
3. 再次打开 Launcher，执行 **打开开发模式 Smoke A**。真实插件 WebView 必须显示
   A 代版本、未请求 `clipboard.read`，且没有实际 `clipboard.read` capability。
4. 不关闭 lensX，在另一个 terminal 构建并校验 B 代版本：

   ```bash
   pnpm run build:plugin-development-smoke:permission-delta
   pnpm run validate:plugin-development-smoke
   ```

   手动 reload 之前，已经打开的页面必须仍显示 A 代版本。这证明 Host 服务的是不可变
   snapshot，而不是已经变化的作者目录文件。
5. 返回 **设置 → 插件**，选择 development entry，然后执行 **从目录重新加载**。
   当前条目必须变成 `0.2.0` 与 B 代版本。`clipboard.read` 必须显示为 requested，
   但仍未 granted；刷新后的插件页面仍必须显示没有实际 `clipboard.read` capability。
   Launcher Action 必须变成 **打开开发模式 Smoke B**。
6. 执行 **移除开发条目** 并确认。条目及其 Launcher Action 必须消失，已打开的插件
   Page 必须终止。结果必须说明 plugin data 与 Launcher collections 得到保留。
7. 再次注册同一个 B 代 `dist/` 并打开它，然后关闭 **插件开发模式**。确认关闭后，
   Host 必须先 quiesce 正在运行的 Page 并移除所有 development entries，UI 才能报告
   mode 已关闭。
8. 停止并重新运行 `pnpm run dev:plugin-development-mode`。模式必须默认关闭，且不能恢复
   任何 development entry。最后运行 `pnpm run check:plugin-development-mode-boundaries`，
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
