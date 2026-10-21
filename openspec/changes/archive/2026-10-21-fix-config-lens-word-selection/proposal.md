# Proposal

## Why

ConfigLens 正文的 `Option+Shift+Left/Right` 无法按词扩展选区。已核实当前精简 Monaco 入口没有加载 `wordOperations`，对应命令未注册；在真实编辑器的确定性对照中加载官方模块后，左右词选择恢复，正文不变且已有编辑仍可撤销。

## What Changes

- 在现有 NLS 就绪后的编辑器初始化链中加载锁定 Monaco 的官方词操作模块，恢复 macOS 正文的按词扩选。
- 补充实际键盘事件、选区、焦点、内容不变及原生撤销分组的回归，并检查构建产物包含该模块且仍满足既有资源预算。
- 同步 ConfigLens 双语文档及其稳定能力要求。

本次修复局限于插件自身的编辑器装配；不修改前一项已完成的 Host 原生命令传播修复，不添加自定义快捷键表、全局 handler、SDK／Manifest／权限字段或依赖升级，不修订 Find 普通输入框的浏览器默认词选择，不启动 GUI／LLDB，不归档或提交。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `official-config-lens-plugin`：明确正文按词扩选、选区方向与焦点隔离，以及内容不变、保留撤销能力与默认分组的要求。

## Impact

影响 `plugins/config-lens/src/editor/contributions.ts`、既有 Monaco／产物测试、`docs/en/development/config-lens.md` 及中文镜像和对应 stable spec。沿用根测试 discovery、插件 lifecycle、`ci-plugins`／`validation-governance` Gate；不新增根命令。用户更新 ConfigLens 构建后获得修复，Host 原生层和其他插件不变。本文记录用户已明确授权的修复范围，后续实施按本变更任务执行。
