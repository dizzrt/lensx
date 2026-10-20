# Proposal

## Why

当前首页 Action 的列宽与拉伸高度分别决定整体外形，鼠标悬停区域因此呈长方形；共享标题组件直接做单行省略，较短的名称也可能被截断，且没有完整名称提示。需要统一图标与标题的方形交互区域，并在可读字号范围内优先展示完整标题，让鼠标和键盘用户都能辨认被省略的名称。

## What Changes

- Recent、Pinned 和 Search 的共享 Action tile 整体保持正方形，图标、标题、点击区域及 hover、focus、selected 状态使用同一几何边界。
- 标题保持单行，默认最大字号为 `14px`，通过少量 JavaScript 根据实际文本宽度在 `12–14px` 间连续适配；不采用按字符数估算或固定字号档位轮询。
- 只有完整标题在 `12px` 下仍放不下时才使用末尾省略；保留完整的本地化标题及可访问名称。
- 对实际被省略的标题，在鼠标悬停、首页 Action 获得键盘焦点，以及搜索结果被选中且搜索输入框保持焦点时显示完整名称提示。
- 在标题、语言、字体度量或容器宽度变化后重新适配；提示不改变焦点、查询、选择和执行语义。
- 同步实施阶段涉及的英文开发／架构文档及简体中文镜像，补充确定性尺寸策略、测量生命周期和提示交互测试。

目标是让整体外形一致、单行标题尽量完整、全文获取途径覆盖鼠标与键盘。本轮仅创建规划产物；以上行为尚未实现。

非目标：

- 不改变首页八列、搜索四列最多八项的排列，不新增分页、滚动管理入口或集合容量。
- 不改变原生窗口尺寸、搜索算法、Action 命名、注册契约、执行路径或集合持久化。
- 不引入多行标题、滚动文字、缩放图标、用户字号设置、新组件库或运行时依赖。
- 不修改 active-page context 的标题样式，也不为卡片增加常驻背景。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `frontend-foundation`：新增适用于 Recent、Pinned 和 Search 的共享 Action 展示要求，约束方形外形、单行有界字号适配、截断及完整名称提示。已有 `launcher-action-collections` 和 `launcher-action-search` 的身份、排序、键盘和执行要求继续适用。

## Impact

- 主要影响 `src/app/launcher/ActionTile.tsx`、`LauncherHome.tsx`、`ActionSearchResults.tsx`、`src/styles/global.less`，以及在需要传递搜索焦点状态时的 `src/App.tsx`。
- 增加 Host 前端内部的文本适配逻辑及测量／提示状态；不改变公共插件 API、Rust/Tauri payload 或持久化格式。
- 确定性测试放入现有 Rstest discovery；复用 `launcher-input-focus` Gate 验证搜索焦点与 IME 回归，完整前端检查仍走现有生命周期，不增加根脚本或 Gate。
- 实施阶段更新 `docs/en/development/frontend-guidelines.md`、`docs/en/architecture/overview.md` 及对应 `docs/zh/` 镜像；稳定规格在后续同步阶段更新，本轮不修改。
