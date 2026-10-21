# Design

## Context

动机见 [proposal.md](proposal.md)。`monaco.ts` 在文档 NLS 准备后并行加载 `editor.api.js` 和项目 contributions，再创建 editor。当前 contributions 只有 Find、context menu、hover 和 gotoError；锁定 Monaco `0.56.0` 在独立 `wordOperations` 模块注册 macOS 的词移动／扩选命令，当前产物 inventory 没有该模块。

## Goals / Non-Goals

**Goals:** 恢复正文的 Option+Shift+左右按词扩选，沿用 Monaco 的词边界、锚点、方向和 undo 分组语义，保留内容、已有撤销能力、语言／主题和焦点归属。

**Non-Goals:** 不新增按键 handler 或自定义绑定，不调整 Host／Rust／Tao/Wry、剪贴板权限、编辑器版本、Find 普通 textarea 的浏览器默认词选择、输入法实现或发布状态。

## Decisions

1. 在既有 contributions 中静态导入官方 `monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js`。该文件仍由 NLS 就绪后的异步初始化链加载，命令在首次 editor 创建前注册；不在运行后热导入或刷新 keybinding resolver。
2. 使用现有 en／zh 独立模块图中的真实 Monaco 测试，派发键盘事件并断言真实 selection、anchor、selected text、内容和 onInput 不变，已有 Undo／Redo 不丢失。官方词操作会调用 `pushStackElement` 结束当前输入组，因此另测词选择前后输入按默认分组撤销，不承诺内部 undo 状态完全不变。覆盖左右、重复扩展／反向收缩、空／边界、只读和 Find／其他输入焦点。普通 textarea 的浏览器默认选择不作为这些模型测试的证明。
3. 产物检查确认 `wordOperations` 被收录在 editor 的延后加载图中，并继续通过已有 bootstrap 字节预算和自包含资源验证。加载官方模块会同时注册其既有词操作；不复制其中的映射或任意扩大其他 contribution 清单。

## Risks / Trade-offs

- [模块遗漏仅靠源码字符串测试可能再次漏检] → 先加入真实键盘选区回归，在当前装配下运行失败，再加载模块；产物 inventory 只补充装配证据。
- [首个 editor 已缓存 resolver] → 模块进入既有初始化 Promise，测试不手动导入模块或添加空 binding 规避启动顺序。
- [资源或 NLS 漂移] → 重跑插件构建／产物测试、两语言与主题、既有 CI 插件 Gate。

## Migration Plan

重建 ConfigLens 即可交付，不涉及用户数据、SDK、Manifest 或 Host 迁移。回滚恢复该 import 与相应行为契约／回归的一致版本。此次保持 Change active，不安装、发布或归档。
