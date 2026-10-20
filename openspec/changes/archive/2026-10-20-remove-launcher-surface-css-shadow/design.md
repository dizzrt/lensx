# Design

## Context

动机见 [proposal.md](proposal.md)。当前可确认的实现为：

- `src/styles/global.less` 的 `.launcher-surface` 同时设置 `overflow: hidden`、`border-radius: 18px`、主题背景以及 `box-shadow: var(--semi-shadow-elevated)`。
- `src/App.tsx` 用同一个铺满窗口的 `.launcher-surface` 承载 Home、Search、Host Page 和插件 Page，不为各状态创建独立窗口外框。
- `src-tauri/tauri.conf.json` 将主窗口配置为透明、无系统装饰，未覆盖默认原生投影；窗口由 `src-tauri/src/frame_aware_navigation_setup.rs` 读取该配置创建。当前 vendored Tao 的 macOS 窗口默认启用投影。
- `scripts/check-plugin-runtime-slot.ts` 已检查共享外层 `18px` 圆角及插件无内层圆角；稳定 `plugin-runtime-slot` Gate 组合现有布局约束、React、Rust 和类型检查。

CSS 投影与原生投影并存是源码事实，二者如何形成截图残边仍属于待证实的渲染归因。保留本设计用于明确两层投影的责任、选择最小修复和约束验证结论，不引入原生实现改造。

## Goals / Non-Goals

**Goals:**

- 通过共享样式的一处删除消除前端外层投影来源，使全部 Launcher 表面采用同一策略。
- 保持前端负责圆角、裁剪和主题背景，macOS 原生窗口负责既有窗口投影。
- 用已有确定性验证保护布局和交互契约，并如实记录其不能证明最终像素效果的边界。

**Non-Goals:**

- 不改动原生窗口创建、投影配置、AppKit 层、Tauri 命令、插件边界或 vendored 源码。
- 不增加替代阴影、描边、伪元素、透明边距或主题分支；不调整页面内部控件及浮层投影。
- 不把关闭原生投影或改造原生圆角作为本变更的隐含后续任务。

## Decisions

### 1. 删除共享外层 CSS 投影声明

仅移除 `.launcher-surface` 的 `box-shadow` 声明，保留 `18px` 圆角、`overflow: hidden` 和 `var(--semi-color-bg-0)`。不修改 Semi 的全局阴影 token，也不对后代元素设置通用阴影覆盖，以免影响 Tooltip、Modal 等已有组件。

相较于改成更小的投影，这能直接去掉可能被窗口边界裁切的绘制来源；相较于逐页面覆盖，共享规则可同时覆盖 Home、Search 和所有 Page。仅删除声明即可获得默认无阴影行为，不需要新增 `box-shadow: none !important` 等覆盖规则。

### 2. 保留 macOS 原生投影和窗口几何

现有原生投影默认已启用，不增加冗余配置或运行时 setter。React 的 presentation target、Rust 的尺寸协调、原生主窗口与插件 Child WebView 的关系不发生变化，所有跨边界载荷继续使用原有类型和校验。

不采用关闭原生投影再完全依赖 CSS 的方案：当前表面贴满 WebView，该方案会失去窗口外的系统投影，还可能需要额外透明留白和尺寸调整。也不调整原生圆角或添加裁剪遮罩，避免把局部样式修复扩大为平台行为变更。

### 3. 复用现有回归与文档位置

- 通过小范围 diff 审核确认 CSS 删除及圆角、裁剪、背景、原生配置均符合范围，不新增只比对该声明存在与否的测试。
- 复用 `tests/app-shell-navigation.test.tsx`、`tests/plugin-page-navigation-ui.test.tsx` 等现有 Rstest 回归及 `pnpm run gate -- plugin-runtime-slot`；完整前端 lifecycle 继续独立执行。Gate 的现有 Cargo 检查提供关联布局边界的回归证据，不替代完整 Rust lifecycle。
- 本次没有 Rust、原生配置或依赖变更，因此完整 Rust 格式、测试、静态检查和构建不作为额外必跑项；任务中记录不适用理由。若实际 diff 触及这些层，需先重新确认范围，再补充对应验证。
- 在 `docs/en/development/frontend-guidelines.md` 的 Styling 部分描述外层阴影责任，并同步 `docs/zh/development/frontend-guidelines.md`。不新增文档或目录，不改变导航和治理规则。

### 4. 经授权清理阻塞验证的已跟踪缓存

首次完整测试中，依赖完整性回归因 `tauri/mobile/android/.gradle/` 下 12 个额外缓存文件失败。只读核对确认基线内 376 个文件哈希全部匹配，缓存已被 Git 跟踪，且本次样式删除没有修改这些文件。用户随后授权修复缓存跟踪问题并继续。

将缓存移到仓库外的可恢复备份，取消这些文件的跟踪，并在根 `.gitignore` 添加该目录的精确规则。完整性检查直接扫描磁盘，因此仅取消跟踪而把缓存留在原位不能消除失败。此修复不改动依赖源码、完整性基线或扫描逻辑，也不添加测试豁免。重跑失败检查、完整测试及最终适用检查；额外的缓存忽略规则按临时目录治理影响触发有限的项目级审计。

## Risks / Trade-offs

- **残边可能还包含原生合成因素** → 本次只移除已确认的 CSS 投影来源，不声称单凭测试证明截图问题彻底消失；若仍有反馈，另行探索，不自动扩大实现。
- **浅色外沿和深色内沿观感可能变轻** → 当前 Semi elevated token 在不同主题下包含不同阴影；接受移除该外层 token 的效果，保留主题背景及原生投影，不新增边框补偿。
- **普通浏览器预览没有 macOS 原生投影** → 其外层会呈现无投影圆角面板，不为预览引入特例；产品目标是既有桌面窗口。
- **确定性测试不能确认 macOS 最终像素** → 交付记录区分样式变更、回归结果和像素效果；不新增浏览器、真实 WebView、GUI、截图、像素或原生交互验证入口。

## Migration Plan

无需数据或配置迁移。经独立 apply 授权后删除样式声明、同步双语指南并执行任务中列出的检查，再按流程同步稳定规格和完成归档准备。若需回滚，恢复原共享外层阴影声明，并同步撤回相应文档和规格变更；不涉及持久化数据或插件兼容性迁移。
